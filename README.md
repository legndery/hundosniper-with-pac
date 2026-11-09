# hundosniper app

Hundo sniper: polls spawn sources, plans a catch route, and drives the phone via adb. Small files, pluggable sources, live UI.

## Requirements

- Node.js 22+ (no npm dependencies)
- A rooted Android phone reachable over `adb` (commands run through `su`)
- **PGTools PaC** on the phone for auto-catching. The current config assumes the **sponsored PaC build**
  (`config.beta: true` -> package `net.pgtools.auto`); set `beta: false` for the regular build package.
- GPS Joystick (`theappninjas.gpsjoystick`) for teleporting
- Optional: a pokexperience.com login saved as `data/pokex-curl.txt` for the Silver tier

## Run

```
node main.js            # real run (phone via adb)
node main.js --dry-run  # poll + plan only; no adb, no state saved
```

Set `"resetLastLocation": true` in `data/state.json` before a run (e.g. after playing manually).
On startup the bot reads the phone's current location and starts the cooldown from now.
A fresh clone has no `data/state.json`; the first run does this automatically.

## Live UI

http://127.0.0.1:8787 (loopback only). From another machine: `ssh -L 8787:127.0.0.1:8787 <user>@<bot-host>`, then open the same URL.

- Tiles: cooldown progress, viable/fresh spawns, session catches, caught species, pokex pool, Silver quota
- Current plan, viable targets (with rule badges), skipped spawns (and why), full catch history, live event feed
- Badges: `pool` = no longer listed by the site but still alive, `silver` = locked coords resolved right before teleport
- **Go** on a viable target pins it: the bot goes for it next while it stays viable (one pin at a time, memory only)

## How it decides

1. **Poll** every enabled source (`config.sources`) and merge. pokex fetches every page, 1s apart, and keeps a pool:
   spawns stay until they despawn or are attempted, even after the site stops listing them.
2. **Viability**: cooldown from the current location (table in `config.cooldown`) + processing buffer must fit before despawn.
3. **Rules** (`core/priority-rules.js`), first match wins: shundo / costume / legendary (never skipped) ->
   skip list -> already caught -> priority / depriority -> rarity tier (bruh, rarer, rare, common, extremely common).
4. **Route planner** picks the best multi-catch route; the bot commits to the first stop once its remaining
   cooldown fits in one refresh, otherwise it re-plans next refresh. After a successful catch it re-polls immediately.

Silver tier (`config.pokex.useSilver`, off by default): only for spawns ruled rarer or better, valued at 0.9x so free
spawns win ties, 10 coords per rolling 24h. When the site blocks, the retry time is read from its block page.
Rounded Silver coords add 0.8 km at both ends of every hop.

## Where things are

| File | What it does |
|---|---|
| `config.js` | every flag: sources, refresh, planner, cooldown table, seen TTL, pokex/Silver, event level, web, lists |
| `main.js` | startup (reset, web server) + main loop: poll -> choose -> defer or catch |
| `poll.js` | fetch all enabled sources, merge, normalize, log `poll` snapshot |
| `sources/pokemap.js` | the 4 *pokemap.com sites, incremental cursor |
| `sources/pokex.js` | pokexperience paging, row filtering, raw spawn shape |
| `sources/pokex-pool.js` | keeps pokex spawns across polls until despawn or attempted (`data/pokex-pool.json`) |
| `sources/pokex-session.js` | optional Silver tier: session headers, coord resolve, rolling quota |
| `core/normalize-spawns.js` | raw spawn -> distance, cooldown, viability (raw shape documented here) |
| `core/priority-rules.js` | RULES and `ruleFor` / `scoreOf` |
| `core/choose-pokemon.js` | pinned spawn, best single target, or first stop of the planned route |
| `core/route-planner.js` | beam-search route planner |
| `core/catch-pokemon.js` | one catch: resolve coords, wait cooldown, teleport, detect result |
| `core/phone-adb.js` | adb commands (PaC, GPS Joystick), phone location, logcat catch detection |
| `core/bot-state.js` | state.json load/save, reset from phone location, seen pruning |
| `core/pokemon-data.js` | pokedex, rarity tiers, legendaries, caught list |
| `core/distance-cooldown.js` | distance between points, cooldown lookup |
| `core/event-log.js` | events.jsonl log (level in `config.eventLog`) + in-memory feed for the UI |
| `core/pin.js` | the one spawn pinned from the UI |
| `web/server.js` | UI server: `/`, `/api/status`, `/api/events`, `POST /api/pin` (same-origin only) |

## Data

- `static/` read-only: `pokedex.csv`, `rarity.json`, `legendaries.csv`, `ui.html`
- `data/` runtime, all gitignored: `state.json`, `caughtHundos.csv`, `events.jsonl`, `pokex-pool.json`, optional `pokex-curl.txt`

`caughtHundos.csv` is one `id,name` per line; only the leading number matters. Remove a line after evolving a base
form away so the bot hunts a fresh one.

## Adding a source

Create `sources/<name>.js` exporting `{ name, fetchSpawns }` (plus `resolveCoords` if its coords are locked),
return spawns in the raw shape from `core/normalize-spawns.js`, register it in `sources/index.js`, and add the name to `config.sources`.

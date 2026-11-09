# hundosniper app

Hundo sniper: polls spawn sources, plans a catch route, and drives the phone via adb. Small files, pluggable sources, live UI.

## Run

```
node main.js            # real run (phone via adb)
node main.js --dry-run  # poll + plan only; no adb, no state saved
```

Live UI: http://127.0.0.1:8787 (loopback only). Click **Go** on a viable target to pin it; the bot goes for it next while it stays viable. From another machine:
`ssh -L 8787:127.0.0.1:8787 <user>@<bot-host>`, then open the same URL.

## Where things are

| File | What it does |
|---|---|
| `config.js` | every flag: sources, refresh, planner, cooldown table, pokex country/page delay/Silver, lists, web |
| `main.js` | startup (reset, web server) + main loop: poll -> choose -> defer or catch |
| `poll.js` | fetch all enabled sources, merge, normalize, log `poll` snapshot |
| `sources/pokemap.js` | the 4 *pokemap.com sites, incremental cursor |
| `sources/pokex.js` | pokexperience paging, row filtering, raw spawn shape |
| `sources/pokex-pool.js` | keeps pokex spawns across polls until despawn or attempted (`data/pokex-pool.json`) |
| `sources/pokex-session.js` | optional Silver tier: session headers, coord resolve, quota (10 per rolling 24h, retry time read from the site's block page) |
| `core/normalize-spawns.js` | raw spawn -> distance, cooldown, viability (raw shape documented here) |
| `core/priority-rules.js` | RULES (shundo/costume/legendary/skip/caught/rarity) and `scoreOf` |
| `core/choose-pokemon.js` | best single target or first stop of the planned route |
| `core/route-planner.js` | beam-search route planner |
| `core/catch-pokemon.js` | one catch: resolve coords, wait cooldown, teleport, detect result |
| `core/phone-adb.js` | adb commands, phone location, logcat catch detection |
| `core/bot-state.js` | state.json load/save, reset from phone location |
| `core/pokemon-data.js` | pokedex, rarity tiers, legendaries, caught list |
| `core/distance-cooldown.js` | distance between points, cooldown lookup (table lives in `config.js`) |
| `core/event-log.js` | events.jsonl log (level in `config.eventLog`) + in-memory feed for the UI |
| `core/pin.js` | the one spawn pinned from the UI (memory only) |
| `web/server.js` | UI server: `/`, `/api/status`, `/api/events`, `POST /api/pin` (same-origin only) |

## Data

- `static/` read-only: `pokedex.csv`, `rarity.json`, `legendaries.csv`, `ui.html`
- `data/` runtime: `state.json`, `caughtHundos.csv`, `events.jsonl`, `pokex-pool.json`, optional `pokex-curl.txt`
  (state, events and the session file are gitignored)

Set `"resetLastLocation": true` in `data/state.json` before a run to start the cooldown from now at the phone's current location.
A fresh clone has no `data/state.json`; the first run creates it this way automatically.

## Adding a source

Create `sources/<name>.js` exporting `{ name, fetchSpawns }` (plus `resolveCoords` if its coords are locked),
return spawns in the raw shape from `core/normalize-spawns.js`, register it in `sources/index.js`, and add the name to `config.sources`.

// one refresh: fetch every enabled source, merge, normalize, log a snapshot
import { config } from "./config.js";
import { pokedex } from "./core/pokemon-data.js";
import { logEvent } from "./core/event-log.js";
import { normalizeMons } from "./core/normalize-spawns.js";
import { ruleFor } from "./core/priority-rules.js";
import { getAlreadyWaiting, state } from "./core/bot-state.js";
import { sources } from "./sources/index.js";

export async function poll() {
  const enabled = config.sources.map((name) => sources[name]);
  const results = await Promise.allSettled(enabled.map((s) => s.fetchSpawns()));

  const raw = [];
  const perSource = {};
  results.forEach((r, i) => {
    const name = enabled[i].name;
    if (r.status === "fulfilled") {
      raw.push(...r.value);
      perSource[name] = r.value.length;
    } else {
      perSource[name] = "failed";
      console.error(`[POLL] ${name} failed: ${r.reason?.message || r.reason}`);
      logEvent("error", { source: name, message: r.reason?.message || String(r.reason) });
    }
  });

  const mons = normalizeMons(raw).sort((a, b) => a.cooldownMinutes - b.cooldownMinutes);
  const viable = mons.filter((m) => m.viable).length;
  console.log(`Found ${mons.length} pokemons with ${viable} viable ${JSON.stringify(perSource)}`);
  config.debug && console.log(mons);

  logEvent("poll", {
    perSource,
    fetched: raw.length,
    fresh: mons.length,
    viable,
    alreadyWaitingMs: getAlreadyWaiting(),
    location: state.currentLocation,
    lastActionAt: state.lastActionAt,
    seenCount: Object.keys(state.seen).length,
    // [uniqueId, name, lat, lon, despawn s, distance km, cooldown min, cooldownMs left, viable, source, rule, score]
    mons: mons.map((m) => [
      m.uniqueId,
      pokedex[m.pokemonId],
      m.lat,
      m.lon,
      m.despawn,
      Number(m.distance.toFixed(3)),
      m.cooldownMinutes,
      m.cooldownMs,
      m.viable,
      m.raw.source,
      ruleFor(m).name,
      ruleFor(m).score,
    ]),
  });

  return mons;
}

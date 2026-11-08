import { config } from "../config.js";
import { sources } from "../sources/index.js";
import { pokedex, recordCaught } from "./pokemon-data.js";
import { restartPogo, stopPogo, teleport, wake, waitForPokemonCaught } from "./phone-adb.js";
import { logEvent } from "./event-log.js";
import { distanceKm } from "./distance-cooldown.js";
import { saveState, state } from "./bot-state.js";
import { sleep } from "./sleep.js";

// consecutive timeouts with no encounter at all, e.g. full pokemon storage
let noEncounterStreak = 0;

export async function processPokemon(mon) {
  // locked coords are resolved by their source before any side effect
  if (mon.raw.locked) {
    const exact = await sources[mon.raw.source].resolveCoords(mon.raw);
    logEvent("resolve", {
      uniqueId: mon.uniqueId,
      source: mon.raw.source,
      ok: !!exact,
      offsetKm: exact ? distanceKm({ lat: mon.lat, lon: mon.lon }, exact) : undefined,
    });
    if (!exact) {
      // not marked seen, so it can be retried next poll
      console.log(`[RESOLVE] could not resolve coords for ${pokedex[mon.pokemonId]}, skipping`);
      return;
    }
    mon.lat = exact.lat;
    mon.lon = exact.lon;
  }

  console.log(
    `[TARGET] ${mon.pokemonId} - ${pokedex[mon.pokemonId]} (${mon.raw.source}), CP: ${mon.raw.cp}, DSP: ${(mon.despawn * 1000 - Date.now()) / 60_000}mins`,
  );
  config.debug && console.log(mon);
  console.log(`[DISTANCE] ${mon.distance.toFixed(2)}km`);
  console.log(`[COOLDOWN] ${mon.cooldownMinutes}min`);
  console.log(`[WAITING] ${Math.floor(mon.cooldownMs / 1000)}s`);
  logEvent("commit", {
    uniqueId: mon.uniqueId,
    source: mon.raw.source,
    name: pokedex[mon.pokemonId],
    distanceKm: mon.distance,
    cooldownMs: mon.cooldownMs,
    plannedArrival: Date.now() + mon.cooldownMs + config.processingBufferMs,
    despawnAt: mon.despawn * 1000,
  });

  await wake();
  await stopPogo();
  // IMPORTANT: wait BEFORE interaction
  await sleep(mon.cooldownMs);
  await wake();
  await teleport(mon.lat, mon.lon);
  logEvent("teleport", { uniqueId: mon.uniqueId, despawnLeftMs: mon.despawn * 1000 - Date.now() });
  await sleep(5 * 1000);
  await restartPogo();
  console.log(`[LOGCAT] Waiting for Pokemon ${mon.pokemonId} - ${pokedex[mon.pokemonId]} to be caught...`);

  const waitStart = Date.now();
  const { caught, noEncounter } = await waitForPokemonCaught(mon.pokemonId + "");
  if (caught) {
    console.log(`[SUCCESS] Pokemon ${mon.pokemonId} was caught!`);
    state.seen[mon.uniqueId] = true;
    recordCaught(mon.pokemonId);
  } else {
    console.log(`[FAILED] Pokemon ${mon.pokemonId} was not caught!`);
    state.seen[mon.uniqueId] = false;
  }
  logEvent("result", {
    uniqueId: mon.uniqueId,
    caught,
    catchWaitMs: Date.now() - waitStart,
    despawnLeftMs: mon.despawn * 1000 - Date.now(),
  });
  noEncounterStreak = noEncounter ? noEncounterStreak + 1 : 0;
  if (noEncounterStreak >= 3) {
    logEvent("unhealthy", { noEncounterStreak, hint: "no encounters at all; storage full or game not running?" });
  }

  await sleep(10 * 1000);
  await stopPogo();
  state.currentLocation = { lat: mon.lat, lon: mon.lon };
  state.lastActionAt = Date.now();
  saveState();
  logEvent("done", {
    uniqueId: mon.uniqueId,
    totalMs: Date.now() - waitStart,
    location: state.currentLocation,
    seenCount: Object.keys(state.seen).length,
  });
  console.log("[DONE]");
}

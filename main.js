// entry: node app/main.js [--dry-run]
// --dry-run polls and plans but never touches the phone or saves state
import { config } from "./config.js";
import { processPokemon } from "./core/catch-pokemon.js";
import { choose } from "./core/choose-pokemon.js";
import { readPhoneLocation } from "./core/phone-adb.js";
import { logEvent } from "./core/event-log.js";
import { applyReset, getAlreadyWaiting, state } from "./core/bot-state.js";
import { sleep } from "./core/sleep.js";
import { poll } from "./poll.js";
import { startWebServer } from "./web/server.js";

const DRY_RUN = process.argv.includes("--dry-run");

async function tick() {
  const mons = await poll();
  const viable = mons.filter((m) => m.viable);
  if (!viable.length) {
    return;
  }

  const chosen = choose(viable);
  if (!chosen) {
    return;
  }

  // cooldown runs from the last catch, so waiting here is free; re-plan with fresh spawns
  if (config.useRoutePlanner && chosen.cooldownMs > config.refreshMs) {
    console.log(`[ROUTE] next stop in ${Math.ceil(chosen.cooldownMs / 60_000)}min, re-planning after refresh`);
    logEvent("defer", { uniqueId: chosen.uniqueId, cooldownMs: chosen.cooldownMs });
    return;
  }

  if (DRY_RUN) {
    console.log(`[DRY] would target ${chosen.uniqueId} (${chosen.raw.source}) in ${Math.ceil(chosen.cooldownMs / 1000)}s`);
    return;
  }
  await processPokemon(chosen);
}

async function main() {
  if (config.web.enabled) {
    startWebServer();
  }
  if (!DRY_RUN) {
    const reset = applyReset(readPhoneLocation);
    if (reset) {
      logEvent("reset", reset);
    }
  }
  console.log(state);
  logEvent("start", {
    dryRun: DRY_RUN,
    sources: config.sources,
    pokexCountry: config.pokex.country,
    refreshMs: config.refreshMs,
    routePlanner: config.useRoutePlanner,
    location: state.currentLocation,
    lastActionAt: state.lastActionAt,
    seenCount: Object.keys(state.seen).length,
  });

  while (true) {
    console.log(`Already Waiting: ${getAlreadyWaiting() / 1000 / 60}min`);
    try {
      await tick();
    } catch (err) {
      console.error(err);
      logEvent("error", { message: err?.message || String(err) });
    }
    await sleep(config.refreshMs);
  }
}

main();

import { config } from "../config.js";
import { pokedex } from "./pokemon-data.js";
import { logEvent } from "./event-log.js";
import { distanceKm, getCooldownMinutes } from "./distance-cooldown.js";
import { planRoute } from "./route-planner.js";
import { scoreOf } from "./priority-rules.js";
import { state } from "./bot-state.js";

// best single target; mons are sorted by cooldown, so ties keep the closest one
export function chooseRandomPokemon(mons) {
  let best = null;
  let bestScore = -Infinity;

  for (const mon of mons) {
    const score = scoreOf(mon);
    if (score === "skip") {
      continue;
    }
    if (score > bestScore) {
      best = mon;
      bestScore = score;
    }
  }

  return best;
}

// first stop of the best route; RULES score becomes catch value, skip drops it
export function chooseByRoute(mons) {
  const values = new Map();
  for (const mon of mons) {
    const score = scoreOf(mon);
    if (score !== "skip") {
      values.set(mon, 1 + score / 100);
    }
  }

  const planStart = Date.now();
  const route = planRoute([...values.keys()], {
    start: state.currentLocation,
    lastActionAt: state.lastActionAt,
    distanceKm: (a, b) => distanceKm(a, b) + (b.raw?.coordErrorKm || 0),
    cooldownMinutes: getCooldownMinutes,
    processingMs: config.processingBufferMs,
    value: (mon) => values.get(mon),
  });

  if (route.path.length) {
    console.log(
      `[ROUTE] ${route.path.map((m) => pokedex[m.pokemonId]).join(" -> ")} | value ${route.value.toFixed(2)}`,
    );
  }
  logEvent("plan", {
    planMs: Date.now() - planStart,
    candidates: values.size,
    value: route.value,
    stops: route.path.map((m, i) => ({
      uniqueId: m.uniqueId,
      source: m.raw.source,
      name: pokedex[m.pokemonId],
      value: values.get(m),
      plannedArrival: route.arrivals[i],
      despawnAt: m.despawn * 1000,
    })),
  });
  return route.path[0] || null;
}

export function choose(mons) {
  return config.useRoutePlanner ? chooseByRoute(mons) : chooseRandomPokemon(mons);
}

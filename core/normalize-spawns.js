import { config } from "../config.js";
import { distanceKm, getCooldownMinutes } from "./distance-cooldown.js";
import { getAlreadyWaiting, state } from "./bot-state.js";

/**
 * Raw spawn, the shape every source returns:
 * { source, pokemon_id, lat, lng, despawn (unix s), inserted, cp, level, form, shiny, costume,
 *   coordErrorKm (0 = exact), locked (coords need resolving before teleport) }
 *
 * @typedef {Object} NormalizedPokemon
 * @property {string} uniqueId
 * @property {number} pokemonId
 * @property {number} lat
 * @property {number} lon
 * @property {number} despawn
 * @property {number} distance
 * @property {number} cooldownMinutes
 * @property {number} cooldownMs
 * @property {number} arrivalTime
 * @property {boolean} viable
 * @property {any} raw
 */

/** @returns {NormalizedPokemon[]} unseen spawns with cooldown and viability */
export function normalizeMons(mons) {
  const fresh = [];

  for (const mon of mons) {
    const uniqueId = `${mon.pokemon_id}#${mon.inserted}`;
    if (uniqueId in state.seen) {
      continue;
    }

    const lat = mon.lat;
    const lon = mon.lng;
    const distance = distanceKm(state.currentLocation, { lat, lon }) + (mon.coordErrorKm || 0);
    const cooldownMinutes = getCooldownMinutes(distance);
    const cooldownMs = Math.max(0, cooldownMinutes * 60_000 - getAlreadyWaiting());
    const arrivalTime = Date.now() + cooldownMs + config.processingBufferMs;
    const viable = arrivalTime < mon.despawn * 1000;

    fresh.push({
      uniqueId,
      pokemonId: mon.pokemon_id,
      lat,
      lon,
      despawn: mon.despawn,
      distance,
      cooldownMinutes,
      cooldownMs,
      arrivalTime,
      viable,
      raw: mon,
    });
  }

  return fresh;
}

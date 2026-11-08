import { config } from "../config.js";

const { table, maxMinutes } = config.cooldown;
const limitsKm = Object.keys(table)
  .map(Number)
  .sort((a, b) => a - b);

// minutes to wait after an action before acting this far away
export function getCooldownMinutes(distanceKm) {
  for (const limit of limitsKm) {
    if (distanceKm <= limit) {
      return table[limit];
    }
  }
  return maxMinutes;
}

export function distanceKm(a, b) {
  const R = 6371; // earth radius km
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

// pokex spawns kept across polls: a spawn stays until it despawns or has been attempted,
// so ones that later turn Silver/Gold on the site aren't forgotten
import { existsSync, readFileSync, writeFileSync } from "fs";
import { state } from "../core/bot-state.js";
import { logEvent } from "../core/event-log.js";
import { dataPath } from "../paths.js";

const POOL_FILE = dataPath("pokex-pool.json");

// uniqueId -> raw spawn
const pool = existsSync(POOL_FILE) ? JSON.parse(readFileSync(POOL_FILE, "utf8")) : {};

const keyOf = (raw) => `${raw.pokemon_id}#${raw.inserted}`;

// despawned or already attempted
function isExpired(raw, now) {
  return raw.despawn * 1000 <= now || keyOf(raw) in state.seen;
}

// add this poll's spawns, drop expired ones, save; returns every live spawn
export function mergeIntoPool(fresh) {
  const now = Date.now();
  let added = 0;
  let expired = 0;

  for (const raw of fresh) {
    const key = keyOf(raw);
    const known = pool[key];
    if (!known) {
      added++;
    }
    // never trade known exact coords for locked (rounded) ones
    if (!known || !(raw.locked && !known.locked)) {
      pool[key] = raw;
    }
  }

  for (const [key, raw] of Object.entries(pool)) {
    if (isExpired(raw, now)) {
      delete pool[key];
      expired++;
    }
  }

  try {
    writeFileSync(POOL_FILE, JSON.stringify(pool));
  } catch {}

  const live = Object.values(pool);
  logEvent("pokex-pool", { fromPoll: fresh.length, added, expired, size: live.length });
  return live;
}

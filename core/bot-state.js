import { existsSync, readFileSync, writeFileSync } from "fs";
import { config } from "../config.js";
import { dataPath } from "../paths.js";

const STATE_FILE = dataPath("state.json");

function readState() {
  // fresh install: no state yet, so start from the phone's location with the cooldown counting from now
  const parsed = existsSync(STATE_FILE)
    ? JSON.parse(readFileSync(STATE_FILE, "utf8") || "{}")
    : { resetLastLocation: true };
  return {
    ...parsed,
    lastActionAt: parsed.resetLastLocation ? Date.now() : parsed.lastActionAt,
  };
}

export const state = {
  // per-source incremental cursors, e.g. { pokemap: unix seconds }
  cursors: {},
  // current player/spoofer position; set from the phone on first run
  currentLocation: { lat: 0, lon: 0 },
  // uniqueId -> caught?, so a spawn is only tried once
  seen: {},
  lastActionAt: Date.now(),
  ...readState(),
};

// seen ids are "pokemonId#inserted" (unix seconds); drop ones older than seenTtlMs
function pruneSeen() {
  const cutoffSec = (Date.now() - config.seenTtlMs) / 1000;
  for (const id of Object.keys(state.seen)) {
    if (Number(id.split("#")[1]) < cutoffSec) {
      delete state.seen[id];
    }
  }
}
pruneSeen();

export function saveState() {
  pruneSeen();
  writeFileSync(STATE_FILE, JSON.stringify({ ...state, resetLastLocation: false }, null, 2));
}

export function getAlreadyWaiting() {
  return Date.now() - state.lastActionAt;
}

// persist a requested reset right away, so a restart before the first catch keeps the wait
export function applyReset(readLocation) {
  if (!state.resetLastLocation) {
    return null;
  }
  const location = readLocation();
  if (location) {
    state.currentLocation = location;
  } else {
    console.log("[RESET] could not read phone location, keeping saved currentLocation");
  }
  state.resetLastLocation = false;
  saveState();
  return { location: state.currentLocation, fromPhone: !!location };
}

// one spawn the user picked in the UI; overrides the planner while it stays viable (memory only)
import { logEvent } from "./event-log.js";

let pinned = null;

export function getPin() {
  return pinned;
}

export function setPin(uniqueId, name) {
  pinned = { uniqueId, name, at: Date.now() };
  logEvent("pin", { uniqueId, name });
}

export function clearPin(reason) {
  if (!pinned) {
    return;
  }
  logEvent("unpin", { uniqueId: pinned.uniqueId, name: pinned.name, reason });
  pinned = null;
}

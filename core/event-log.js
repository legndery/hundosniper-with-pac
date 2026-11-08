import { appendFileSync, existsSync, readFileSync } from "fs";
import { dataPath } from "../paths.js";

const EVENTS_FILE = dataPath("events.jsonl");
const BUFFER_SIZE = 500;

// recent events for the web UI, seeded from the file so restarts keep history
const recent = loadRecent();
const listeners = new Set();

function loadRecent() {
  if (!existsSync(EVENTS_FILE)) {
    return [];
  }
  return readFileSync(EVENTS_FILE, "utf8")
    .trim()
    .split("\n")
    .slice(-BUFFER_SIZE)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// debug log for later analysis, one json per line; never throws
export function logEvent(type, data = {}) {
  const event = { at: Date.now(), type, ...data };
  try {
    appendFileSync(EVENTS_FILE, JSON.stringify(event) + "\n");
  } catch {}
  recent.push(event);
  if (recent.length > BUFFER_SIZE) {
    recent.shift();
  }
  for (const listener of listeners) {
    listener(event);
  }
}

export function recentEvents() {
  return recent;
}

// returns an unsubscribe function
export function onEvent(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

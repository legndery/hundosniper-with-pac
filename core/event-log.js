import { appendFileSync, existsSync, readFileSync } from "fs";
import { config } from "../config.js";
import { dataPath } from "../paths.js";

const EVENTS_FILE = dataPath("events.jsonl");
const BUFFER_SIZE = 500;

// catch attempts are kept in full for the UI; everything else only the last BUFFER_SIZE
const CATCH_TYPES = new Set(["commit", "result"]);
// written to the file only at level "debug"; the live UI always gets them
const DEBUG_TYPES = new Set(["adb", "logcat", "pokex-page", "pokemap-fetch"]);
const DEBUG_FIELDS = { poll: ["mons"] };

// what goes into the file at the configured level, or null to skip it
function forFile(event) {
  if (config.eventLog.level === "debug") {
    return event;
  }
  if (DEBUG_TYPES.has(event.type)) {
    return null;
  }
  const drop = DEBUG_FIELDS[event.type];
  if (!drop) {
    return event;
  }
  const slim = { ...event };
  drop.forEach((field) => delete slim[field]);
  return slim;
}

function loadFile() {
  if (!existsSync(EVENTS_FILE)) {
    return [];
  }
  return readFileSync(EVENTS_FILE, "utf8")
    .trim()
    .split("\n")
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// seeded from the file so restarts keep history
const all = loadFile();
const recent = all.slice(-BUFFER_SIZE);
const catches = all.filter((e) => CATCH_TYPES.has(e.type));
const listeners = new Set();

// debug log for later analysis, one json per line; never throws
export function logEvent(type, data = {}) {
  const event = { at: Date.now(), type, ...data };
  const line = forFile(event);
  if (line) {
    try {
      appendFileSync(EVENTS_FILE, JSON.stringify(line) + "\n");
    } catch {}
  }
  recent.push(event);
  if (recent.length > BUFFER_SIZE) {
    recent.shift();
  }
  if (CATCH_TYPES.has(event.type)) {
    catches.push(event);
  }
  for (const listener of listeners) {
    listener(event);
  }
}

export function recentEvents() {
  return recent;
}

// every commit/result older than the recent buffer, so the two never overlap
export function olderCatchEvents() {
  const oldestRecent = recent.length ? recent[0].at : Infinity;
  return catches.filter((e) => e.at < oldestRecent);
}

// returns an unsubscribe function
export function onEvent(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// read-only live UI: GET / (page), GET /api/status, GET /api/events (server-sent events)
import { readFileSync } from "fs";
import { createServer } from "http";
import { config } from "../config.js";
import { caughtHundos, pokedex } from "../core/pokemon-data.js";
import { olderCatchEvents, onEvent, recentEvents } from "../core/event-log.js";
import { getAlreadyWaiting, state } from "../core/bot-state.js";
import { staticPath } from "../paths.js";

// heavy or noisy fields the page doesn't need; viable spawns split into targets and skipped
function slim(event) {
  if (event.type === "poll") {
    const { mons, ...rest } = event;
    const viable = (mons || []).filter((m) => m[8]);
    return {
      ...rest,
      top: viable.filter((m) => m[11] !== "skip").slice(0, 15),
      skipped: viable.filter((m) => m[11] === "skip"),
    };
  }
  return event;
}

function status() {
  return {
    now: Date.now(),
    sources: config.sources,
    pokexCountry: config.pokex.country,
    refreshMs: config.refreshMs,
    routePlanner: config.useRoutePlanner,
    location: state.currentLocation,
    lastActionAt: state.lastActionAt,
    alreadyWaitingMs: getAlreadyWaiting(),
    caughtSpecies: caughtHundos.size,
    seen: Object.keys(state.seen).length,
    names: pokedex,
  };
}

function sendJson(res, body) {
  res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function streamEvents(req, res) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-store",
    connection: "keep-alive",
  });
  const send = (event) => res.write(`data: ${JSON.stringify(slim(event))}\n\n`);
  // full catch history first, then the recent buffer, then live
  olderCatchEvents().forEach(send);
  recentEvents().forEach(send);
  const unsubscribe = onEvent(send);
  const keepAlive = setInterval(() => res.write(": ping\n\n"), 25_000);
  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
}

export function startWebServer() {
  const page = () => readFileSync(staticPath("ui.html"));
  const server = createServer((req, res) => {
    if (req.method !== "GET") {
      res.writeHead(405).end();
      return;
    }
    const path = new URL(req.url, "http://localhost").pathname;
    if (path === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(page());
    } else if (path === "/api/status") {
      sendJson(res, status());
    } else if (path === "/api/events") {
      streamEvents(req, res);
    } else {
      res.writeHead(404).end();
    }
  });
  server.on("error", (err) => console.error(`[WEB] ${err.message}`));
  server.listen(config.web.port, config.web.host, () => {
    console.log(`[WEB] live UI at http://${config.web.host}:${config.web.port}`);
  });
}

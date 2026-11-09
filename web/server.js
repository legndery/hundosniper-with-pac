// live UI: GET / (page), GET /api/status, GET /api/events (server-sent events), POST /api/pin
// POST only sets/clears the one pin; it accepts requests from this page's own origin only
import { readFileSync } from "fs";
import { createServer } from "http";
import { config } from "../config.js";
import { caughtHundos, pokedex } from "../core/pokemon-data.js";
import { olderCatchEvents, onEvent, recentEvents } from "../core/event-log.js";
import { getAlreadyWaiting, state } from "../core/bot-state.js";
import { clearPin, getPin, setPin } from "../core/pin.js";
import { silverStatus } from "../sources/pokex-session.js";
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
    pin: getPin(),
    silver: silverStatus(),
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

// browsers send Origin on cross-site POSTs, so other sites can't pin; must be this UI's own origin
function isOwnOrigin(req) {
  const allowed = [`http://${config.web.host}:${config.web.port}`, `http://localhost:${config.web.port}`];
  return allowed.includes(req.headers.origin) && (req.headers["content-type"] || "").startsWith("application/json");
}

function handlePin(req, res) {
  if (!isOwnOrigin(req)) {
    res.writeHead(403).end();
    return;
  }
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 1024) {
      req.destroy();
    }
  });
  req.on("end", () => {
    let input;
    try {
      input = JSON.parse(body || "{}");
    } catch {
      res.writeHead(400).end();
      return;
    }
    const uniqueId = typeof input.uniqueId === "string" ? input.uniqueId.slice(0, 64) : null;
    if (uniqueId) {
      setPin(uniqueId, typeof input.name === "string" ? input.name.slice(0, 40) : "");
    } else {
      clearPin("unpinned in UI");
    }
    sendJson(res, { pin: getPin() });
  });
}

export function startWebServer() {
  const page = () => readFileSync(staticPath("ui.html"));
  const server = createServer((req, res) => {
    const path = new URL(req.url, "http://localhost").pathname;
    if (req.method === "POST" && path === "/api/pin") {
      handlePin(req, res);
      return;
    }
    if (req.method !== "GET") {
      res.writeHead(405).end();
      return;
    }
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

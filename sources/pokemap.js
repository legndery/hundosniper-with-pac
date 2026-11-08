// *pokemap.com sites (nyc/sg/sydney/van): wild hundos, exact coords, incremental cursor
import { config } from "../config.js";
import { logEvent } from "../core/event-log.js";
import { state } from "../core/bot-state.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
const ALL_MONS = [...Array.from({ length: 1014 }, (_, i) => i), 1019].join(",");

async function fetchSite(baseUrl) {
  const params = new URLSearchParams({
    mons: ALL_MONS,
    minIV: "99",
    alwaysHundo: "1",
    time: Date.now().toString(),
    since: String(state.cursors.pokemap || 0),
  });
  const url = `${baseUrl}/query2.php?${params}`;
  console.log(`[POKEMAP] ${url}`.slice(0, 120));

  const res = await fetch(url, {
    headers: {
      accept: "*/*",
      "x-requested-with": "XMLHttpRequest",
      "User-Agent": USER_AGENT,
      Referer: `${baseUrl}/`,
    },
  });
  if (!res.ok) {
    throw new Error(`${baseUrl} HTTP ${res.status}`);
  }
  const data = await res.json();
  return { mons: data?.pokemons || [], inserted: parseInt(data?.meta?.inserted || 0) };
}

// all sites in parallel; one failing site doesn't drop the others
async function fetchSpawns() {
  const results = await Promise.allSettled(config.pokemap.baseUrls.map(fetchSite));
  const ok = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
  results
    .filter((r) => r.status === "rejected")
    .forEach((r) => console.error(`[POKEMAP] failed: ${r.reason?.message || r.reason}`));

  // min across sites, so no site skips spawns
  if (ok.length) {
    state.cursors.pokemap = Math.min(...ok.map((r) => r.inserted));
  }
  const mons = ok.flatMap((r) => r.mons).map((m) => ({ ...m, source: "pokemap", coordErrorKm: 0, locked: false }));
  logEvent("pokemap-fetch", { sites: config.pokemap.baseUrls.length, ok: ok.length, mons: mons.length, cursor: state.cursors.pokemap });
  return mons;
}

export const pokemap = { name: "pokemap", fetchSpawns };

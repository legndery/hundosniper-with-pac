// pokexperience.com: hundos for one country, best first; free rows, optional Silver rows
import { config } from "../config.js";
import { logEvent } from "../core/event-log.js";
import { isSilverRow, resolveSilverCoords, sessionHeaders, silverAvailable } from "./pokex-session.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

// why a row was dropped, or null to keep it
function dropReason(row, keys) {
  if (row.free !== 1 && !isSilverRow(row)) return "notFree";
  if (row.iv !== 100) return "notHundo";
  if (!row.dsp) return "noDespawn";
  if (keys.has(`${row.id}#${row.ts}`)) return "duplicate";
  return null;
}

// pokex row -> shared raw spawn shape
function toRawSpawn(row) {
  const locked = row.free !== 1;
  return {
    source: "pokex",
    pokemon_id: row.id,
    lat: row.lat,
    lng: row.lon,
    despawn: row.dsp,
    inserted: row.ts,
    cp: row.cp,
    level: row.lv,
    form: row.fi,
    shiny: 0,
    costume: -1,
    // locked = rounded coords; exact ones are resolved from z right before teleport
    locked,
    z: locked ? row.z : undefined,
    coordErrorKm: locked ? config.pokex.lockedCoordErrorKm : 0,
  };
}

async function fetchPage(offset) {
  const params = new URLSearchParams({
    country: config.pokex.country,
    star: "4",
    ...(silverAvailable() ? {} : { free: "1" }),
    offset: String(offset),
  });
  const url = `${config.pokex.url}?${params}`;
  console.log(`[POKEX] ${url}`);
  return fetch(url, {
    headers: {
      accept: "*/*",
      "User-Agent": USER_AGENT,
      ...sessionHeaders,
      Referer: "https://pokexperience.com/pokemon-finder/",
    },
  });
}

// pages until limit or end of results; server caps page size (20 anon, 50 logged in)
async function fetchSpawns() {
  const mons = [];
  // ordering shifts between pages, so the same spawn can repeat
  const keys = new Set();
  let pageSize = 20;

  for (let offset = 0; offset < config.pokex.limit; offset += pageSize) {
    const pageStart = Date.now();
    const res = await fetchPage(offset);
    if (!res.ok) {
      logEvent("pokex-page", { offset, status: res.status, ms: Date.now() - pageStart });
      if (offset === 0) {
        throw new Error(`pokex HTTP ${res.status}`);
      }
      // later page failed (e.g. 429): keep what we already have
      break;
    }
    const data = await res.json();
    const rows = data?.rows || [];
    pageSize = data?.cap || pageSize;
    const dropped = { notFree: 0, notHundo: 0, noDespawn: 0, duplicate: 0 };

    for (const row of rows) {
      const reason = dropReason(row, keys);
      if (reason) {
        dropped[reason]++;
        continue;
      }
      keys.add(`${row.id}#${row.ts}`);
      mons.push(toRawSpawn(row));
    }

    logEvent("pokex-page", {
      offset,
      status: res.status,
      ms: Date.now() - pageStart,
      siteTotal: data?.total,
      shown: data?.shown,
      cap: data?.cap,
      auth: data?.auth,
      rows: rows.length,
      keptSoFar: mons.length,
      dropped,
    });

    if (offset + pageSize >= (data?.total || 0)) {
      break;
    }
  }

  console.log(`[POKEX] ${config.pokex.country}: ${mons.length} pokemons`);
  return mons;
}

// exact coords for a locked (Silver) spawn
function resolveCoords(raw) {
  return resolveSilverCoords(raw.z);
}

export const pokex = { name: "pokex", fetchSpawns, resolveCoords };

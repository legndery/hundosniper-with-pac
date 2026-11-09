// pokexperience logged-in session (Silver tier): saved browser curl -> headers, coord resolve, quota
import { createDecipheriv, pbkdf2Sync } from "crypto";
import { existsSync, readFileSync } from "fs";
import { config } from "../config.js";
import { saveState, state } from "../core/bot-state.js";
import { logEvent } from "../core/event-log.js";
import { dataPath } from "../paths.js";

// saved browser curl with the session cookie; never logged
const SESSION_FILE = dataPath("pokex-curl.txt");

// cookie + browser headers from the saved curl; null if missing or disabled
function loadSession() {
  if (!config.pokex.useSilver || !existsSync(SESSION_FILE)) {
    return null;
  }
  const src = readFileSync(SESSION_FILE, "utf8");
  const cookie = (src.match(/-b\s+'([^']*)'/) || src.match(/-b\s+"([^"]*)"/) || [])[1];
  if (!cookie) {
    return null;
  }
  const headers = { cookie };
  for (const [, h] of src.matchAll(/-H\s+'([^']*)'/g)) {
    const i = h.indexOf(":");
    const name = h.slice(0, i).trim().toLowerCase();
    if (!["referer", "accept"].includes(name)) {
      headers[name] = h.slice(i + 1).trim();
    }
  }
  return headers;
}

export const sessionHeaders = loadSession();

// --- quota: the site gives silverLimit coords per rolling window; each use frees up silverWindowMs later.
// --- hitting the limit or the site's "used" page pauses Silver until the next slot opens

// state.silver = { uses: [ms], pausedUntil, pauseText }; saved in state.json so restarts keep it
function quota() {
  if (!state.silver || !Array.isArray(state.silver.uses)) {
    state.silver = { uses: [], pausedUntil: 0, pauseText: "" };
  }
  const cutoff = Date.now() - config.pokex.silverWindowMs;
  state.silver.uses = state.silver.uses.filter((t) => t > cutoff);
  return state.silver;
}

// when the oldest use in the window frees up, or null if nothing is used
function nextSlotAt(q) {
  return q.uses.length ? Math.min(...q.uses) + config.pokex.silverWindowMs : null;
}

// visible text of a page, for logs: no scripts/styles/tags, collapsed whitespace
function pageText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

// when the block page says we can retry: a timestamp in the next 48h, "23h 59m"-style text,
// else our own window estimate, else silverRetryMs
function retryAtFromPage(html, q, now = Date.now()) {
  for (const [, digits] of html.matchAll(/\b(\d{10}|\d{13})\b/g)) {
    const ms = digits.length === 10 ? Number(digits) * 1000 : Number(digits);
    if (ms > now && ms < now + 48 * 60 * 60_000) {
      return { at: ms, source: "timestamp" };
    }
  }
  const text = pageText(html);
  const h = text.match(/(\d+)\s*(?:h|hr|hrs|hours?)\b/i);
  const m = text.match(/(\d+)\s*(?:m|min|mins|minutes?)\b/i);
  if (h || m) {
    const ms = (h ? Number(h[1]) * 3_600_000 : 0) + (m ? Number(m[1]) * 60_000 : 0);
    if (ms > 0 && ms < 48 * 60 * 60_000) {
      return { at: now + ms, source: "text" };
    }
  }
  const slot = nextSlotAt(q);
  if (slot && slot > now) {
    return { at: slot, source: "window" };
  }
  return { at: now + config.pokex.silverRetryMs, source: "fallback" };
}

// html = the site's block page when we have one, so its own retry time wins
function pause(reason, html = "") {
  const q = quota();
  const retry = retryAtFromPage(html, q);
  q.pausedUntil = retry.at;
  q.pauseText = html ? pageText(html) : reason;
  saveState();
  logEvent("silver-paused", { reason, used: q.uses.length, retryAt: q.pausedUntil, retrySource: retry.source, pageText: q.pauseText });
}

export function silverAvailable() {
  if (!sessionHeaders) {
    return false;
  }
  const q = quota();
  return q.uses.length < config.pokex.silverLimit && Date.now() >= q.pausedUntil;
}

export function silverStatus() {
  const q = quota();
  return {
    enabled: !!sessionHeaders,
    used: q.uses.length,
    limit: config.pokex.silverLimit,
    pausedUntil: q.pausedUntil > Date.now() ? q.pausedUntil : 0,
    pauseText: q.pausedUntil > Date.now() ? q.pauseText || "" : "",
    nextSlotAt: nextSlotAt(q),
  };
}

export function isSilverRow(row) {
  return silverAvailable() && row.free === 0 && config.pokex.silverTiers.includes(row.t) && !!row.z;
}

// the session-only z page carries AES-256-CBC coords keyed by PBKDF2-SHA512(nonce)
export async function resolveSilverCoords(z) {
  try {
    const res = await fetch(`https://pokexperience.com/?z=${encodeURIComponent(z)}`, {
      headers: { ...sessionHeaders, accept: "text/html" },
    });
    const html = await res.text();
    if (/Daily free coords used/i.test(html)) {
      pause("site says free coords used", html);
      return null;
    }
    const nonce = (html.match(/nonceValue\s*=\s*['"]([^'"]+)['"]/) || [])[1];
    const enc = (html.match(/function pxDecrypt\(\)\s*\{\s*var enc\s*=\s*'([^']+)'/) || [])[1];
    if (!nonce || !enc) {
      // no coords and no quota message: most likely the login expired
      logEvent("silver-session-invalid", { status: res.status, hint: "save a fresh curl to data/pokex-curl.txt" });
      pause("session looks invalid", html);
      return null;
    }
    const j = JSON.parse(Buffer.from(enc, "base64").toString("utf8"));
    const iterations = parseInt(j.iterations) > 0 ? parseInt(j.iterations) : 999;
    const key = pbkdf2Sync(nonce, Buffer.from(j.salt, "hex"), iterations, 32, "sha512");
    const decipher = createDecipheriv("aes-256-cbc", key, Buffer.from(j.iv, "hex"));
    const text = decipher.update(j.ciphertext, "base64", "utf8") + decipher.final("utf8");
    const [lat, lon] = text.split(",").map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }

    const q = quota();
    q.uses.push(Date.now());
    saveState();
    logEvent("silver-used", { used: q.uses.length, limit: config.pokex.silverLimit, nextSlotAt: nextSlotAt(q) });
    if (q.uses.length >= config.pokex.silverLimit) {
      pause("limit reached");
    }
    return { lat, lon };
  } catch {
    return null;
  }
}

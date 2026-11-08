// pokexperience logged-in session (Silver tier): saved browser curl -> headers, coord resolve, quota
import { createDecipheriv, pbkdf2Sync } from "crypto";
import { existsSync, readFileSync } from "fs";
import { config } from "../config.js";
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

// free Silver quota; once used up, free rows only until the local date changes
let quotaUsedOn = null;
export function silverAvailable() {
  return !!sessionHeaders && quotaUsedOn !== new Date().toDateString();
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
      quotaUsedOn = new Date().toDateString();
      logEvent("silver-quota-used", { until: "next local day" });
      return null;
    }
    const nonce = (html.match(/nonceValue\s*=\s*['"]([^'"]+)['"]/) || [])[1];
    const enc = (html.match(/function pxDecrypt\(\)\s*\{\s*var enc\s*=\s*'([^']+)'/) || [])[1];
    if (!nonce || !enc) {
      return null;
    }
    const j = JSON.parse(Buffer.from(enc, "base64").toString("utf8"));
    const iterations = parseInt(j.iterations) > 0 ? parseInt(j.iterations) : 999;
    const key = pbkdf2Sync(nonce, Buffer.from(j.salt, "hex"), iterations, 32, "sha512");
    const decipher = createDecipheriv("aes-256-cbc", key, Buffer.from(j.iv, "hex"));
    const text = decipher.update(j.ciphertext, "base64", "utf8") + decipher.final("utf8");
    const [lat, lon] = text.split(",").map(Number);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  } catch {
    return null;
  }
}

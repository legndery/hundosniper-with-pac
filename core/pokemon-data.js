import { appendFileSync, existsSync, readFileSync } from "fs";
import { dataPath, staticPath } from "../paths.js";

// id -> name
export const pokedex = Object.fromEntries(
  readFileSync(staticPath("pokedex.csv"), "utf8")
    .trim()
    .split("\n")
    .map((line) => {
      const [id, name] = line.split(",");
      return [Number(id), name.trim()];
    }),
);

// species tiers from spawn frequency; unlisted species count as bruh
const RARITY = JSON.parse(readFileSync(staticPath("rarity.json"), "utf8"));
const TIERS = ["extremelyCommon", "common", "rare", "rarer", "bruh"];
export function rarityOf(pokemonId) {
  return TIERS.find((t) => String(pokemonId) in RARITY[t]) || "bruh";
}

// leading number of each line is the id; the name is just a label
function readIdFile(path) {
  if (!existsSync(path)) {
    return new Set();
  }
  return new Set(
    readFileSync(path, "utf8").split("\n").map((l) => parseInt(l)).filter(Number.isInteger),
  );
}

// legendary/mythical, "id,name" per line; never skipped
export const legendaries = readIdFile(staticPath("legendaries.csv"));

// pokemon already caught as hundo, "id,name" per line
const CAUGHT_FILE = dataPath("caughtHundos.csv");
export const caughtHundos = readIdFile(CAUGHT_FILE);

export function recordCaught(pokemonId) {
  caughtHundos.add(pokemonId);
  appendFileSync(CAUGHT_FILE, `${pokemonId},${pokedex[pokemonId]}\n`);
}

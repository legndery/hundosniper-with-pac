import { config } from "../config.js";
import { caughtHundos, legendaries, rarityOf } from "./pokemon-data.js";

const { priority, depriority, skip } = config.lists;

// first matching rule wins: "skip" drops it, number is priority (higher first), default 0
// route planner value = 1 + score / 100
export const RULES = [
  { when: (m) => m.raw.shiny === 1, then: 300 }, // shundo, never skip
  { when: (m) => m.raw.costume >= 0, then: 300 }, // event costume (-1 = none), never skip
  { when: (m) => legendaries.has(m.pokemonId), then: 300 }, // wild legendary/mythical, never skip
  { when: (m) => skip.includes(m.pokemonId), then: "skip" },
  { when: (m) => caughtHundos.has(m.pokemonId), then: "skip" }, // already have this hundo
  { when: (m) => priority.includes(m.pokemonId), then: 200 },
  { when: (m) => depriority.includes(m.pokemonId), then: -50 },
  { when: (m) => rarityOf(m.pokemonId) === "bruh", then: 150 },
  { when: (m) => rarityOf(m.pokemonId) === "rarer", then: 80 },
  { when: (m) => rarityOf(m.pokemonId) === "rare", then: 30 },
  { when: (m) => rarityOf(m.pokemonId) === "extremelyCommon", then: -50 },
];

export function scoreOf(mon) {
  const rule = RULES.find((r) => r.when(mon));
  return rule ? rule.then : 0;
}

import { config } from "../config.js";
import { caughtHundos, legendaries, rarityOf } from "./pokemon-data.js";

const { priority, depriority, skip } = config.lists;

// first matching rule wins: "skip" drops it, number is priority (higher first), default 0
// route planner value = 1 + score / 100; name is shown in the UI
export const RULES = [
  { name: "shundo", when: (m) => m.raw.shiny === 1, then: 300 }, // never skip
  { name: "costume", when: (m) => m.raw.costume >= 0, then: 300 }, // -1 = none; never skip
  { name: "legendary", when: (m) => legendaries.has(m.pokemonId), then: 300 }, // never skip
  { name: "skip list", when: (m) => skip.includes(m.pokemonId), then: "skip" },
  { name: "caught", when: (m) => caughtHundos.has(m.pokemonId), then: "skip" }, // already have this hundo
  { name: "priority", when: (m) => priority.includes(m.pokemonId), then: 200 },
  { name: "depriority", when: (m) => depriority.includes(m.pokemonId), then: -50 },
  { name: "bruh", when: (m) => rarityOf(m.pokemonId) === "bruh", then: 150 },
  { name: "rarer", when: (m) => rarityOf(m.pokemonId) === "rarer", then: 80 },
  { name: "rare", when: (m) => rarityOf(m.pokemonId) === "rare", then: 30 },
  { name: "extremely common", when: (m) => rarityOf(m.pokemonId) === "extremelyCommon", then: -50 },
];

// which rule decides this spawn: { name, score }
export function ruleFor(mon) {
  const rule = RULES.find((r) => r.when(mon));
  return rule ? { name: rule.name, score: rule.then } : { name: "common", score: 0 };
}

export function scoreOf(mon) {
  return ruleFor(mon).score;
}

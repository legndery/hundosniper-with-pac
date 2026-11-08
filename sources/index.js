// every source exposes fetchSpawns() -> raw spawns (see core/normalize.js);
// sources with locked coords also expose resolveCoords(raw) -> { lat, lon } | null
import { pokemap } from "./pokemap.js";
import { pokex } from "./pokex.js";

export const sources = { pokemap, pokex };

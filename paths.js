import { dirname, join } from "path";
import { fileURLToPath } from "url";

// resolve files relative to the app, so it runs from any working directory
const APP_DIR = dirname(fileURLToPath(import.meta.url));

// read-only data shipped with the app
export const staticPath = (name) => join(APP_DIR, "static", name);
// runtime files: state, caught list, events, session
export const dataPath = (name) => join(APP_DIR, "data", name);

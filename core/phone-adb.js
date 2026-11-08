import { exec, execSync, spawn } from "child_process";
import { config, PAC_PACKAGE } from "../config.js";
import { logEvent } from "./event-log.js";

const ENCOUNTER_RE = /PokemonId,.*?(\d+)/;

export function adb(command) {
  return new Promise((resolve, reject) => {
    const full = `adb ${command}`;
    console.log(`[ADB] ${full}`);
    const adbStart = Date.now();

    exec(full, (err, stdout, stderr) => {
      logEvent("adb", {
        command,
        ms: Date.now() - adbStart,
        ok: !err,
        error: err?.message,
        stdout: stdout?.trim(),
        stderr: stderr?.trim(),
      });
      if (err) {
        reject(err);
        return;
      }
      if (stdout?.trim()) {
        console.log(stdout.trim());
      }
      if (stderr?.trim()) {
        console.error(stderr.trim());
      }
      resolve();
    });
  });
}

export const wake = () => adb(`shell input keyevent KEYCODE_WAKEUP`);
export const stopPogo = () =>
  adb(`shell su -c "am startservice -n ${PAC_PACKAGE}/net.pgtools.auto.AutoService --es ACTION STOP"`);
export const restartPogo = () =>
  adb(
    `shell su -c "am startservice -n ${PAC_PACKAGE}/net.pgtools.auto.AutoService --es ACTION DoAction --es data '{\"action\":\"RESTART_POGO\"}'"`,
  );
export const teleport = (lat, lon) =>
  adb(`shell am start-foreground-service -a theappninjas.gpsjoystick.TELEPORT --ef lat ${lat} --ef lng ${lon}`);

// same as: adb shell dumpsys location | grep -i location= | cut -d' ' -f9 | grep , | sort -u | head -n 1
export function readPhoneLocation() {
  try {
    const out = execSync("adb shell dumpsys location", { encoding: "utf8", timeout: 15_000 });
    const coords = out
      .split("\n")
      .filter((line) => /location=/i.test(line))
      .map((line) => line.split(" ")[8])
      .filter((field) => field && field.includes(","));
    const first = [...new Set(coords)].sort()[0];
    const [lat, lon] = (first || "").split(",").map(Number);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  } catch {
    return null;
  }
}

// resolves { caught, noEncounter }; noEncounter = timed out without seeing any pokemon
export function waitForPokemonCaught(pokemonId, timeoutMs = config.catchTimeoutMs) {
  return new Promise((resolve) => {
    let currentId = null;
    const proc = spawn("adb", ["logcat", "-T", "1"]);

    const finish = (caught, noEncounter = false) => {
      clearTimeout(timeout);
      proc.kill();
      resolve({ caught, noEncounter });
    };

    const timeout = setTimeout(() => {
      logEvent("catch-end", { pokemonId, reason: "timeout", encounteredId: currentId });
      finish(false, currentId === null);
    }, timeoutMs);

    proc.stdout.on("data", (buffer) => {
      for (const line of buffer.toString().split("\n")) {
        if (line.includes("PokemonId") || line.includes("EncounterResult")) {
          logEvent("logcat", { pokemonId, currentId, line: line.trim() });
        }
        if (line.includes("PokemonId")) {
          console.log("[LOGCAT] " + line);
          const match = ENCOUNTER_RE.exec(line);
          if (match) {
            currentId = match[1];
          }
          continue;
        }
        if (line.includes("EncounterResult")) {
          console.log("[LOGCAT] Found EncounterResult: " + line, currentId, pokemonId);
        }
        if (currentId + "" !== pokemonId + "") {
          continue;
        }
        if (line.includes("EncounterResult,CapturedPokemon")) {
          logEvent("catch-end", { pokemonId, reason: "caught" });
          finish(true);
          return;
        }
        if (line.includes("EncounterResult,PokemonFled")) {
          console.log("Pokemon fled");
          logEvent("catch-end", { pokemonId, reason: "fled" });
          finish(false);
          return;
        }
      }
    });

    proc.stderr.on("data", (err) => console.error(err.toString()));
    proc.on("error", (err) => {
      console.error(err);
      finish(false);
    });
  });
}

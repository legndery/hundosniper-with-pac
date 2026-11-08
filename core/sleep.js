// sleep with a countdown on one console line
export async function sleep(ms) {
  const intervalMs = 10_000;
  const end = Date.now() + ms;

  while (true) {
    const remaining = end - Date.now();
    if (remaining <= 0) {
      break;
    }
    const seconds = Math.ceil(remaining / 1000);
    process.stdout.write(`\r[SLEEP] ${seconds}s remaining`);
    await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, remaining)));
  }
  process.stdout.write(`\r[SLEEP] Timeout of ${ms / 1000}s Complete\n`);
}

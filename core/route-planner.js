// Route planner: picks the sequence of spawns that maximises total value before they despawn.
// Beam search over catch orders; caller executes path[0] and re-plans on the next poll.

/**
 * @param {Array<{uniqueId: string, lat: number, lon: number, despawn: number}>} mons despawn in unix seconds
 * @param {Object} opts
 * @param {{lat: number, lon: number}} opts.start current location
 * @param {number} opts.lastActionAt ms timestamp the cooldown counts from
 * @param {(a: {lat: number, lon: number}, b: {lat: number, lon: number}) => number} opts.distanceKm
 * @param {(km: number) => number} opts.cooldownMinutes
 * @param {(mon: any) => number} [opts.value] worth of catching a mon, default 1
 * @param {number} [opts.now]
 * @param {number} [opts.processingMs] teleport + restart before the mon is catchable
 * @param {number} [opts.catchMs] encounter + catch + stop before the next cooldown starts
 * @param {number} [opts.maxDepth] how many catches ahead to plan
 * @param {number} [opts.beamWidth] partial routes kept per depth
 */
export function planRoute(mons, opts) {
  const {
    start,
    lastActionAt,
    distanceKm,
    cooldownMinutes,
    value = () => 1,
    now = Date.now(),
    processingMs = 45_000,
    catchMs = 90_000,
    maxDepth = 5,
    beamWidth = 200,
  } = opts;

  const candidates = mons.filter((m) => m.despawn * 1000 > now);

  // t = when we are free to act, readyAt = when the last action happened
  const root = { path: [], arrivals: [], loc: start, t: now, readyAt: lastActionAt, value: 0 };
  let beam = [root];
  let best = root;

  for (let depth = 0; depth < maxDepth; depth++) {
    const next = [];

    for (const node of beam) {
      for (const mon of candidates) {
        if (node.path.includes(mon)) {
          continue;
        }
        const cooldownMs = cooldownMinutes(distanceKm(node.loc, mon)) * 60_000;
        const arrival = Math.max(node.t, node.readyAt + cooldownMs) + processingMs;
        if (arrival >= mon.despawn * 1000) {
          continue;
        }
        const doneAt = arrival + catchMs;
        next.push({
          path: [...node.path, mon],
          arrivals: [...node.arrivals, arrival],
          // the stop itself, so distanceKm can see its fields (e.g. coord error) as an origin
          loc: mon,
          t: doneAt,
          readyAt: doneAt,
          value: node.value + value(mon),
        });
      }
    }

    if (!next.length) {
      break;
    }
    next.sort(compareRoutes);
    beam = next.slice(0, beamWidth);
    if (compareRoutes(beam[0], best) < 0) {
      best = beam[0];
    }
  }

  return { path: best.path, arrivals: best.arrivals, value: best.value, finishAt: best.t };
}

// higher value first, then the route that frees us up earliest
function compareRoutes(a, b) {
  return b.value - a.value || a.t - b.t;
}

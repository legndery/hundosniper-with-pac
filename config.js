// every knob in one place; sources and modules read from here

export const config = {
  // any of "pokemap", "pokex"; enabled sources are polled in parallel and merged
  sources: ["pokex"],

  refreshMs: 120_000,
  // teleport + game restart before a spawn is catchable
  processingBufferMs: 45_000,
  catchTimeoutMs: 300_000,
  // true = plan a multi-catch route, false = best single target
  useRoutePlanner: true,
  debug: false,

  // game cooldown: up to this many km -> wait this many minutes; anything farther -> maxMinutes
  cooldown: {
    table: {
      1: 1,
      2: 1,
      3: 2,
      5: 2,
      7: 5,
      9: 7,
      10: 7,
      12: 8,
      18: 10,
      26: 15,
      42: 19,
      65: 22,
      76: 25,
      81: 25,
      100: 35,
      220: 40,
      250: 45,
      350: 51,
      375: 54,
      460: 62,
      500: 65,
      565: 69,
      700: 78,
      800: 84,
      900: 92,
      1000: 99,
      1100: 107,
      1200: 114,
      1300: 117,
      1350: 120,
    },
    maxMinutes: 120,
  },

  // pgtools build: beta package name vs release
  beta: true,

  pokemap: {
    baseUrls: [
      "https://nycpokemap.com",
      "https://sgpokemap.com",
      "https://sydneypogomap.com",
      "https://vanpokemap.com",
    ],
  },

  pokex: {
    url: "https://pokexperience.com/finder-search.php",
    country: "DE",
    // ~37% of DE rows lack despawn, so fetch extra
    limit: 160,
    // true = also use Silver rows via the logged-in session (data/pokex-curl.txt)
    useSilver: false,
    silverTiers: ["B", "S"],
    // locked rows are rounded (up to ~0.7km off), so plan cooldowns as if that much farther
    lockedCoordErrorKm: 0.8,
  },

  // read-only live UI; loopback only, reach it from another machine with an ssh -L tunnel
  web: {
    enabled: true,
    host: "127.0.0.1",
    port: 8787,
  },

  lists: {
    priority: [],
    depriority: [915 /* lechonk */, 415 /* combee */, 345 /* lileep */],
    // never target these (unless shundo/costume/legendary)
    skip: [],
  },
};

export const PAC_PACKAGE = config.beta ? "net.pgtools.auto" : "lczk7.p497zz.c8no2";

// Offline support: the app shell and core data are cached on install;
// everything else (other HSK levels, recordings, sentences, fonts) is cached the first time it loads.
const VERSION = "hask-v4";
const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "js/main.js",
  "js/audio.js",
  "js/data.js",
  "js/pinyin.js",
  "js/speech.js",
  "js/srs.js",
  "js/state.js",
  "js/ui.js",
  "js/game.js",
  "js/fx.js",
  "js/views/cave.js",
  "js/views/rewards.js",
  "js/views/sect.js",
  "js/views/stats.js",
  "js/views/treasury.js",
  "js/views/tribulation.js",
  "js/views/common.js",
  "js/views/guide.js",
  "js/views/practice.js",
  "js/views/prefs.js",
  "js/views/study.js",
  "js/views/words.js",
  "data/meta.json",
  "data/top.json",
  "data/hsk1.json",
  "data/hsk2.json",
  "icons/icon.svg",
  "icons/icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Stale-while-revalidate: answer from cache instantly, refresh in the background.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const fonts = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!sameOrigin && !fonts) return;
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: sameOrigin });
      const network = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

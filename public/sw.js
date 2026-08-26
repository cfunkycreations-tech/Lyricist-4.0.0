/**
 * LYRICIST SERVICE WORKER
 *
 * Two jobs: make the app installable, and make the offline tools genuinely work
 * with no signal. Rhyme Helper, Thesaurus, Dictionary and Scratch Pad need
 * nothing from the network, and on a phone that is a real selling point.
 *
 * ============================================================================
 * WHAT IT MUST NEVER DO: PRECACHE THE MODELS.
 * ============================================================================
 * The built app is ~231 MB, and almost all of it is optional model weights:
 * kokoro (90 MB, the Ghost's voice), sf2 (68 MB, the MIDI soundfont), ort
 * (21 MB, the ONNX runtime). Precaching that on install would burn a quarter of
 * a gigabyte of someone's phone storage and their mobile data before they had
 * pressed a single button, and on iOS it would simply be evicted.
 *
 * So the shell is cached and the heavy weights are left alone. They download
 * when someone actually opens the feature that needs them. See HEAVY below.
 *
 * The cache name carries the build number, which arrives in the registration
 * URL as ?v=. A new build therefore gets a new cache and the old one is deleted
 * on activate, so a stale bundle can never survive a release. The website was
 * bitten twice by stale browser caches during the launch; this is that lesson,
 * written into the app.
 */

const BUILD = new URL(self.location).searchParams.get('v') || 'dev';
const CACHE = `lyricist-shell-${BUILD}`;

/** Stable-named files worth having before the first offline launch. */
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './pwa/icon-192.png',
  './pwa/icon-512.png',
  './pwa/maskable-192.png',
  './pwa/maskable-512.png',
];

/**
 * Directories of model weights and other very large optional payloads. These
 * are never cache-first and never precached; they go straight to the network so
 * the browser's own HTTP cache decides, and a phone is never silently filled.
 */
const HEAVY = ['/kokoro/', '/sf2/', '/ort/', '/models/', '/wizard-audio/'];

const isHeavy = (url) => HEAVY.some((d) => url.pathname.includes(d));
/** Vite writes content-hashed names into /assets/, so they can never go stale. */
const isHashedAsset = (url) => url.pathname.includes('/assets/');

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll fails the whole install if any one file 404s, which would leave
      // the app uninstallable for a missing icon. Add them individually.
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('lyricist-shell-') && k !== CACHE)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Someone else's server is not ours to cache. Kaggle, the relay and
  // OpenRouter all go straight out, every time.
  if (url.origin !== self.location.origin) return;

  // Model weights: network only. See the comment at the top.
  if (isHeavy(url)) return;

  // Navigations: network first, so a new build is picked up the moment it
  // ships, but the app still opens with no signal at all.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // Hashed bundles: cache first. The name changes when the content does, so
  // there is no such thing as a stale hit.
  if (isHashedAsset(url)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  // Everything else: serve fast from cache, refresh in the background.
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});

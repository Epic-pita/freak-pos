/**
 * FREAK POS — service worker.
 *
 * This is the whole reason the front end moved off Apps Script. The shell is
 * cached, so the app opens with the radio off. Reload at the stall with no
 * signal and it still comes up; the catalog is already in localStorage and the
 * sale queue drains when signal returns.
 *
 * STRATEGY — two rules, and the split matters:
 *
 *   index.html  → NETWORK FIRST, 3.5s fuse. It carries the app's code. If
 *                 there's signal, the newest copy wins, always. Cache is the
 *                 offline fallback. (v1 and v2 got this wrong: cache-first
 *                 meant a phone preferred its stale copy of the app over the
 *                 one just deployed, and no amount of reopening fixed it.)
 *                 The fuse exists because zombie wifi — connected, no
 *                 internet — hangs a fetch for 30s+ before the OS gives up,
 *                 which read as "the app won't open" at the stall.
 *
 *   everything  → CACHE FIRST. The scanner library and icons don't change
 *   else         except at release, and re-downloading 375KB per open on stall
 *                reception is a waste.
 *
 * Bump CACHE on every release. The name is the invalidation.
 */
const CACHE = 'freak-pos-v7';

const SHELL = [
  './',
  './index.html',
  './report.html',
  './guide.html',
  './html5-qrcode.min.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // cache:'reload' forces past the HTTP cache. GitHub Pages serves assets
      // with a max-age, so a plain add() can install a copy that's already old.
      .then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Never touch the API. A stale catalog is survivable; a stale sale response
  // would make the queue think money landed when it didn't.
  if (url.origin !== self.location.origin) return;

  const isHTML = e.request.mode === 'navigate'
              || url.pathname.endsWith('.html')
              || url.pathname.endsWith('/');

  if (isHTML) {
    e.respondWith((async () => {
      const fetched = fetch(e.request).then(res => {
        // Cache only clean, direct 200s. A captive portal answering 200 for
        // our URL, or a 404 from a broken deploy, must never overwrite the
        // known-good shell — offline would then boot into the portal page.
        if (res.ok && !res.redirected) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      });

      // Race the network against a short fuse. If the fuse wins, serve cache;
      // the fetch keeps running and still refreshes the cache for next open.
      const winner = await Promise.race([
        fetched.catch(() => null),
        new Promise(r => setTimeout(() => r(null), 3500))
      ]);
      if (winner) return winner;

      const cached = await caches.match(e.request) || await caches.match('./index.html');
      // Nothing cached (first-ever visit on a slow link): the network, however
      // long it takes, is all there is.
      return cached || fetched;
    })());
    return;
  }

  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }))
  );
});

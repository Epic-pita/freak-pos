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
 *   index.html  → NETWORK FIRST. It carries the app's code. If there's signal,
 *                 the newest copy wins, always. Cache is the offline fallback
 *                 only. (v1 and v2 got this wrong: cache-first meant a phone
 *                 preferred its stale copy of the app over the one just
 *                 deployed, and no amount of closing and reopening fixed it.)
 *
 *   everything  → CACHE FIRST. The scanner library and icons don't change
 *   else         except at release, and re-downloading 375KB per open on stall
 *                reception is a waste.
 *
 * Bump CACHE on every release. The name is the invalidation.
 */
const CACHE = 'freak-pos-v3';

const SHELL = [
  './',
  './index.html',
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
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
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

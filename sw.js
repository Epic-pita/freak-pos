/**
 * FREAK POS — service worker.
 *
 * This is the whole reason the front end moved off Apps Script. The shell is
 * cached, so the app opens with the radio off. Reload at the stall with no
 * signal and it still comes up; the catalog is already in localStorage and the
 * sale queue drains when signal returns.
 *
 * Bump CACHE after editing any shell file, or phones keep the old copy.
 */
const CACHE = 'freak-pos-v1';

const SHELL = [
  './',
  './index.html',
  './html5-qrcode.min.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never cache the API. A stale catalog is survivable; a stale sale response
  // would make the queue think money landed when it didn't.
  if (url.hostname.endsWith('google.com') || url.hostname.endsWith('googleusercontent.com')) return;
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && url.origin === self.location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});

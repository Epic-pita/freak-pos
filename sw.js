/**
 * FREAK POS — service worker.
 *
 * This is the whole reason the front end moved off Apps Script. The shell is
 * cached, so the app opens with the radio off. Reload at the stall with no
 * signal and it still comes up; the catalog is already in localStorage and the
 * sale queue drains when signal returns.
 *
 * STRATEGY — two rules for the till, and the split matters:
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
 *   the till's  → CACHE FIRST. The scanner library and icons don't change
 *   other files   except at release, and re-downloading 375KB per open on stall
 *                 reception is a waste.
 *
 * SCOPE — the worker sits at /freak-pos/, so every page under it passes
 * through here: the count, the supplier tasks, the home screen. The two rules
 * above are the till's alone. Any other path goes to the network and gets back
 * only its own saved copy when the network fails or is slow — never the till's
 * page (v10 answered a slow first open of count.html with the till), and never
 * a copy frozen until the next till release.
 *
 * Bump CACHE on every release. The name is the invalidation. Cleanup removes
 * only this worker's own old caches (freak-pos-v<n>): the schedule and every
 * other app on epic-pita.github.io share the same Cache Storage.
 */
const CACHE = 'freak-pos-v11';

const SHELL = [
  './',
  './index.html',
  './report.html',
  './guide.html',
  './quickstart.html',
  './html5-qrcode.min.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

// The till's own paths: the shell, and the staff guide's pictures
// (guide/01-gate.jpg …). The count's pictures share that folder with a letter
// first (guide/c01-gate.jpg) and are not the till's.
const BASE = new URL('./', self.location).pathname;
const TILL = new Set(SHELL.map(u => new URL(u, self.location).pathname));
const isTill = path => TILL.has(path)
                    || (path.startsWith(BASE) && /^guide\/\d/.test(path.slice(BASE.length)));

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
      // Only our own old versions. Deleting every other name wiped the
      // schedule's offline copy on phones that have both apps.
      .then(ks => Promise.all(ks.filter(k => k !== CACHE && /^freak-pos-v\d+$/.test(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Never touch the API. A stale catalog is survivable; a stale sale response
  // would make the queue think money landed when it didn't.
  if (url.origin !== self.location.origin) return;

  // Another app's page or file: see SCOPE above.
  if (!isTill(url.pathname)) {
    e.respondWith(networkThenOwnCopy(e.request));
    return;
  }

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

/* Another app's path: the network first. Its own saved copy comes back only
   when the network fails or answers with an error or a captive portal's page,
   or after the same 3.5s fuse. With no copy (a first open) it is the network
   however long it takes, or the browser's own offline page — never the till's
   index.html. Clean 200s are still saved, so a page opened once (the count)
   keeps opening offline as it did before. */
async function networkThenOwnCopy(req) {
  const fetched = fetch(req).then(res => {
    if (res.ok && !res.redirected) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
    }
    return res;
  });
  fetched.catch(() => {});   // a failure is answered below; keep the console clean

  const own = await caches.match(req);
  if (!own) return fetched;

  const winner = await Promise.race([
    fetched.catch(() => null),
    new Promise(r => setTimeout(() => r(null), 3500))
  ]);
  return (winner && winner.ok && !winner.redirected) ? winner : own;
}

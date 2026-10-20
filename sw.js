// Librava service worker: lets the store open and saved books be read without internet.
// Pages: network first (always fresh when online). Scripts, styles, fonts, covers: cached.
const APP = 'librava-app-v1', COVERS = 'librava-covers';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('message', e => {
  // the page sends the files it already loaded, so they work offline from the first visit
  if (e.data?.cache) e.waitUntil(caches.open(APP).then(c => Promise.all(e.data.cache.map(u => c.match(u).then(hit => hit || c.add(u).catch(() => { }))))));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { if (r.ok && url.origin === location.origin) { const c = r.clone(); caches.open(APP).then(x => x.put('/index.html', c)); } return r; })
      .catch(() => caches.match('/index.html')));
    return;
  }
  if (url.origin === location.origin && (url.pathname.startsWith('/assets/') || url.pathname === '/sw.js')) {
    if (url.pathname === '/sw.js') return;
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(APP).then(x => x.put(req, c)); } return r; })));
    return;
  }
  // book covers (public) — show the saved copy, refresh in the background
  if (/\/storage\/v1\/object\/public\/covers\//.test(url.pathname)) {
    e.respondWith(caches.open(COVERS).then(c => c.match(req).then(hit => {
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    })));
  }
});

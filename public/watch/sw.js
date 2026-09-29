// Service worker so the watch page is installable, starts fast on a flaky watch
// connection, and works offline. Never touches the pairing Worker or the car
// (those are cross-origin and must always hit the network).
//   - Images/icons never change in place (a new look = a new file + cache bump):
//     cache-first, so they cost nothing after the first load.
//   - The page and other files: network-first so updates land, but give up on a
//     slow network after 2.5s and serve the cached copy instead.
const CACHE = 'odw-shell-v28';
const SHELL = ['./', './index.html',
  './bg-car-dark.webp', './bg-car-light.webp',
  './bg-climate-dark.webp', './bg-climate-light.webp',
  './bg-seat-dark.webp', './bg-seat-light.webp'];
const NET_TIMEOUT = 2500;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// Only keep real successes — never cache a 404/500 or an opaque response.
function store(req, res) {
  if (res && res.ok && res.type === 'basic') {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
  }
  return res;
}

function cacheFirst(req) {
  return caches.match(req).then((hit) => hit || fetch(req).then((r) => store(req, r)));
}

function networkFirst(e) {
  const req = e.request, nav = req.mode === 'navigate';
  const cached = () => caches.match(req, { ignoreSearch: nav })
    .then((m) => m || (nav ? caches.match('./') : undefined));
  const net = fetch(req).then((r) => store(req, r));
  e.waitUntil(net.catch(() => {}));           // let a late response still refresh the cache
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (r) => { if (!done && r) { done = true; resolve(r); } };
    // Slow network: fall back to the cached copy (if there is one) after the timeout.
    const timer = setTimeout(() => cached().then(finish), NET_TIMEOUT);
    net.then((r) => { clearTimeout(timer); finish(r); })
      .catch(() => { clearTimeout(timer);
        cached().then((m) => { if (m) finish(m); else if (!done) { done = true; reject(new TypeError('offline')); } }); });
  });
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const isAsset = e.request.destination === 'image' || /\.(webp|png|ico|svg)$/.test(url.pathname);
  e.respondWith(isAsset ? cacheFirst(e.request) : networkFirst(e));
});

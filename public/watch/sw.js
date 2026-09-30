// Retired service worker. The watch app no longer uses one (see index.html), but
// watches that installed an earlier version keep running it until it's replaced.
// The browser re-checks this file on navigation, finds this version, and it
// removes itself: delete the watch caches, unregister, reload open tabs once so
// they run without it. Keep this file for a few months, then delete it.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('odw-')) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
})()));

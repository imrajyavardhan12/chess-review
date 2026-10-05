/* global VERSION, FILES */
// The offline service worker. scripts/precache.mjs prepends VERSION and FILES at build time.
//
// - Install caches the whole build under a cache named for its version, so a review of a pasted
//   PGN works with no network. A new deploy is a new version with its own cache.
// - The new version waits until the page asks it to take over (the app offers a reload), so an
//   open tab never has its files swapped underneath it. Old caches are deleted on activation.
// - Pages are fetched from the network first, so an online visit always sees the latest deploy;
//   the cached shell is the offline fallback. Everything else is immutable for a given version
//   and served from the cache first. Requests to other origins are left alone.

const CACHE = `chessreview-shell-${VERSION}`
const SHELL = new URL('./', self.location.href).href

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith('chessreview-shell-') && key !== CACHE) await caches.delete(key)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') void self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || !request.url.startsWith(self.registration.scope)) return
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(SHELL, { cacheName: CACHE })) ?? Response.error()),
    )
    return
  }
  event.respondWith(caches.match(request, { cacheName: CACHE }).then((hit) => hit ?? fetch(request)))
})

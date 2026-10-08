// Keeps the app itself available offline. Course files live in IndexedDB, not here.
const CACHE = 'revisit-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== location.origin || request.headers.has('range')) return

  // Pages: network first so updates arrive; the cached copy works offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((c) => c.put(request, copy))
          return response
        })
        .catch(() => caches.match(request).then((r) => r ?? caches.match('./'))),
    )
    return
  }

  // Hashed assets never change: cache first.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((c) => c.put(request, copy))
          }
          return response
        }),
    ),
  )
})

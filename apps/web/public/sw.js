const CACHE_VERSION = 'partyradar-v5'
const STATIC_CACHE  = `${CACHE_VERSION}-static`
const ALL_CACHES    = [STATIC_CACHE]

// On install: skip waiting immediately to activate new SW
self.addEventListener('install', () => {
  self.skipWaiting()
})

// On activate: delete ALL old caches aggressively
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !ALL_CACHES.includes(k))
          .map((k) => {
            console.log('[SW] Deleting old cache:', k)
            return caches.delete(k)
          })
      )
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // NEVER cache or intercept API calls or cross-origin requests
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  // _next/static assets are content-hashed — cache-first (safe forever)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        if (cached) return cached
        const res = await fetch(request)
        if (res.ok) cache.put(request, res.clone())
        return res
      })
    )
    return
  }

  // HTML pages and everything else — ALWAYS network, no caching
  // This prevents stale pages on mobile that don't trigger SWR
  // If network fails, just let the browser handle it naturally
})

// Push notifications
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'PartyRadar', {
      body: data.body || 'Something is happening near you',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      data: { url: data.url || '/discover' },
      actions: [
        { action: 'view',    title: 'View Event' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
      vibrate: [200, 100, 200],
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'dismiss') return
  const url = event.notification.data?.url || '/discover'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})

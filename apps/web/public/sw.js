const CACHE_VERSION = 'partyradar-v4'
const STATIC_CACHE  = `${CACHE_VERSION}-static`
const PAGE_CACHE    = `${CACHE_VERSION}-pages`
const ALL_CACHES    = [STATIC_CACHE, PAGE_CACHE]

// On install: pre-cache only offline fallback
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PAGE_CACHE).then((cache) => cache.addAll(['/offline.html']).catch(() => {}))
  )
  self.skipWaiting()
})

// On activate: delete ALL old caches so stale pages don't linger on mobile
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

  // Never intercept API calls — always hit the network
  if (url.pathname.startsWith('/api/') || url.hostname.includes('railway.app')) return

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

  // HTML pages — network-first, short timeout, fallback to cache
  // This ensures mobile always gets fresh event data when online
  event.respondWith(
    Promise.race([
      fetch(request).then((res) => {
        if (res.ok) {
          caches.open(PAGE_CACHE).then((cache) => cache.put(request, res.clone()))
        }
        return res
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ]).catch(() =>
      caches.match(request).then((cached) => cached || caches.match('/offline.html'))
    )
  )
})

// Push notifications
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'PartyRadar', {
      body: data.body || 'Something is happening near you ⚡',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      data: { url: data.url || '/discover' },
      actions: [
        { action: 'view',    title: '⚡ View Event' },
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

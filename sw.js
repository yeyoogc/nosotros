const CACHE_NAME = 'nosotros-v3';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(
        names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ═══════════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS - Firebase Cloud Messaging
// ═══════════════════════════════════════════════════════════════

self.addEventListener('push', event => {
  let title = 'Nosotros 💕';
  let body = 'Tienes una nueva notificación';
  let type = 'general';

  try {
    if (event.data) {
      const payload = event.data.json();
      const d = payload.data || payload;
      title = d.title || payload.notification?.title || title;
      body = d.body || payload.notification?.body || body;
      type = d.type || type;
    }
  } catch (e) {
    if (event.data) body = event.data.text();
  }

  const options = {
    body: body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    vibrate: [200, 100, 200],
    tag: 'nosotros-' + type,
    renotify: true,
    data: { url: 'https://yeyoogc.github.io/nosotros/' }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || 'https://yeyoogc.github.io/nosotros/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('nosotros') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(urlToOpen);
    })
  );
});

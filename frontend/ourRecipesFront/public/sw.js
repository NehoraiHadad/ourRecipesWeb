const CACHE_NAME = 'timer-cache-v1';

// Install Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/sounds/timer-end.mp3'
      ]);
    })
  );
});

// Listen for timer notifications
self.addEventListener('message', (event) => {
  if (event.data.type === 'TIMER_END') {
    self.registration.showNotification('טיימר הסתיים!', {
      body: event.data.description,
      icon: '/icon.png',
      badge: '/badge.png',
      vibrate: [200, 100, 200],
      tag: 'timer-notification',
      renotify: true,
      requireInteraction: true
    });
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  // Focus on the app window or open a new one
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
}); 
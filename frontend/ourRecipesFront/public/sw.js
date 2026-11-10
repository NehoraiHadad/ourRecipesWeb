const CACHE_NAME = 'timer-cache-v2';
self.addEventListener('install', event => {
  event.waitUntil(Promise.all([self.skipWaiting(), caches.open(CACHE_NAME).then(cache => cache.add('/sounds/timer-end.mp3'))]));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([self.clients.claim(), caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('timer-cache-') && key !== CACHE_NAME).map(key => caches.delete(key))))]));
});

function openReceipts() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('RecipeTimerPushReceipts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('receipts', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function claimReceipt(id) {
  try {
    const db = await openReceipts();
    return await new Promise(resolve => {
      const tx = db.transaction('receipts', 'readwrite');
      const store = tx.objectStore('receipts');
      store.add({ id, at: Date.now() });
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onabort = () => { db.close(); resolve(false); };
      // Bound retention without racing the claim of another recent message.
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const entry = cursor.result;
        if (!entry) return;
        if (entry.value.at < Date.now() - 86400000) entry.delete();
        entry.continue();
      };
    });
  } catch { return true; } // Tag replacement still deduplicates if storage is unavailable.
}
async function releaseReceipt(id) {
  try {
    const db = await openReceipts();
    const tx = db.transaction('receipts', 'readwrite');
    tx.objectStore('receipts').delete(id);
    tx.oncomplete = () => db.close();
  } catch { /* Retry can still fall back to the notification tag. */ }
}
function localTimer(id) {
  return new Promise(resolve => {
    const request = indexedDB.open('TimersDB', 1);
    request.onupgradeneeded = () => { request.transaction.abort(); resolve(null); };
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('timers')) { db.close(); resolve(null); return; }
      const tx = db.transaction('timers');
      const get = tx.objectStore('timers').get(id);
      get.onsuccess = () => resolve(get.result ?? null);
      get.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    };
  });
}
function recipeUrl(value) { return typeof value === 'string' && /^\/recipe\/-?\d+$/.test(value) ? value : '/'; }
async function displayTimer(payload) {
  if (!payload || typeof payload.timerId !== 'string' || !Number.isInteger(payload.version) || typeof payload.body !== 'string' || typeof payload.title !== 'string') return;
  if (!Number.isFinite(payload.expiresAt) || payload.expiresAt < Date.now()) return;
  const timer = await localTimer(payload.timerId);
  if (timer && (timer.pendingDelete || timer.isPaused || (payload.version > 0 && (timer.alarmVersion ?? 0) > payload.version))) return;
  const receipt = `${payload.timerId}:${payload.version}`;
  if (!(await claimReceipt(receipt))) return;
  try {
    await self.registration.showNotification(payload.title.slice(0, 200), {
      body: payload.body.slice(0, 500), icon: '/icons/icon-192.png', badge: '/icons/badge-96.png',
      tag: `recipe-timer-${payload.timerId}`, renotify: false, requireInteraction: true,
      silent: Boolean(payload.silent), data: { url: recipeUrl(payload.url) }
    });
  } catch (error) { await releaseReceipt(receipt); throw error; }
}
self.addEventListener('push', event => {
  let payload;
  try { payload = event.data?.json(); } catch { return; }
  if (payload?.type === 'RECIPE_TIMER_END') event.waitUntil(displayTimer(payload));
});
// Foreground-only fallback for browsers where server Push has not been enabled.
self.addEventListener('message', event => {
  if (event.data?.type !== 'TIMER_END') return;
  event.waitUntil(displayTimer({ timerId: event.data.timerId, version: event.data.version ?? 0,
    title: 'טיימר הסתיים!', body: event.data.description, expiresAt: Date.now() + 30000, url: event.data.url ?? '/', silent: Boolean(event.data.silent) }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(recipeUrl(event.notification.data?.url), self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async windows => {
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
        await client.navigate(url); return client.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});

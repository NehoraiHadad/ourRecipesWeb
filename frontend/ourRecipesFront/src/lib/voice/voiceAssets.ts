export interface AssetGroup {
  cacheName: string;
  base: string;
  files: { path: string; bytes: number; sha256: string; source?: string }[];
}

export async function modelStorage({ cacheName, base, files }: AssetGroup): Promise<'empty' | 'partial' | 'complete'> {
  if (!await caches.has(cacheName)) return 'empty';
  const cache = await caches.open(cacheName);
  const hits = await Promise.all(files.map(async f =>
    (await cache.match(base + f.path))?.headers.get('X-Recipe-SHA256') === f.sha256));
  return hits.every(Boolean) ? 'complete' : hits.some(Boolean) ? 'partial' : 'empty';
}

export async function prepareVoiceAssets({ cacheName, base, files }: AssetGroup, signal: AbortSignal, progress: (bytes: number) => void) {
  await navigator.serviceWorker.register('/sw.js');
  const cache = await caches.open(cacheName);
  let loaded = 0;
  for (const file of files) {
    signal.throwIfAborted();
    const key = base + file.path;
    if ((await cache.match(key))?.headers.get('X-Recipe-SHA256') !== file.sha256) {
      const response = await fetch(file.source ?? key, {
        signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
        headers: file.source ? {} : { 'X-Recipe-Download': '1' },
      });
      if (!response.ok || !response.body) throw Error('הורדת המודל נכשלה. אפשר לנסות שוב.');
      const reader = response.body.getReader(), bytes = new Uint8Array(file.bytes);
      let offset = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes.set(value, offset); offset += value.length;
          progress(loaded + offset);
        }
      } finally { reader.releaseLock(); }
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      if (offset !== file.bytes || Array.from(digest, b => b.toString(16).padStart(2,'0')).join('') !== file.sha256)
        throw Error('אימות קובץ המודל נכשל. נסו שוב.');
      signal.throwIfAborted();
      await cache.put(key, new Response(bytes, { headers: {
        'X-Recipe-SHA256': file.sha256, 'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
      } }));
    }
    loaded += file.bytes;
    progress(loaded);
  }
  signal.throwIfAborted();
}

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteModels, downloadModel, hasModel, modelCacheName, modelURL, type ModelSpec } from '@/lib/voice/models';
const spec: ModelSpec = { kind: 'asr', repo: 'test/model', revision: 'pinned', license: 'test', files: [{ path: 'model', bytes: 4 }] };
let storage: Map<string, Map<string, Response>>;
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('caches', {
    keys: async () => Array.from(storage.keys()), delete: async (name: string) => storage.delete(name),
    open: async (name: string) => { if (!storage.has(name)) storage.set(name, new Map()); const cache = storage.get(name)!; return { match: async (url: string) => cache.get(url)?.clone(), put: async (url: string, response: Response) => { cache.set(url, response); } }; },
  });
});
describe('model downloads (simulated network and Cache Storage)', () => {
  it('reports real byte progress, reuses complete files, and sends no user content', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(new Uint8Array([1, 2, 3, 4])));
    const progress = vi.fn();
    await downloadModel(spec, new AbortController().signal, progress);
    expect(progress).toHaveBeenCalledWith(4); expect(await hasModel(spec)).toBe(true);
    expect(fetch).toHaveBeenCalledWith(modelURL(spec, 'model'), expect.objectContaining({ credentials: 'omit', referrerPolicy: 'no-referrer' }));
    vi.mocked(fetch).mockClear();
    await downloadModel(spec, new AbortController().signal, progress);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects incomplete and oversized files without caching them as ready', async () => {
    for (const size of [2, 5]) {
      vi.mocked(fetch).mockResolvedValue(new Response(new Uint8Array(size)));
      await expect(downloadModel(spec, new AbortController().signal, vi.fn())).rejects.toThrow();
      expect(await hasModel(spec)).toBe(false);
    }
  });
  it('cancels before downloading and deletes only this feature’s caches including old revisions', async () => {
    const controller = new AbortController(); controller.abort();
    vi.mocked(fetch).mockClear();
    await expect(downloadModel(spec, controller.signal, vi.fn())).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
    storage.set('ourrecipes-voice-old-revision', new Map()); storage.set('other-app', new Map());
    await deleteModels(); expect(Array.from(storage.keys())).toEqual(['other-app']); expect(storage.has(modelCacheName(spec))).toBe(false);
  });
});

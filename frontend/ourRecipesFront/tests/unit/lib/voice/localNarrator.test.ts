import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { normalizeHebrewSpeech } from '@/lib/voice/hebrewNarration';
import { LocalNarrator, noaAssets, speechChunks } from '@/lib/voice/localNarrator';

describe('Piper Noa in the cooking guide', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('preserves quantities and negations when verbalizing Hebrew recipe text', () => {
    expect(normalizeHebrewSpeech('שלב 1 מתוך 3. עוד לא הוספתי 1½ כוסות.'))
      .toBe('שלב אחד מתוך שלושה. עוד לא הוספתי אחת וחצי כוסות.');
    expect(normalizeHebrewSpeech('⅔ כוס, 2–3 דקות, 180°C ו-1,000 גרם'))
      .toBe('שני שלישים כוס, שתיים עד שלוש דקות, מאה ושמונים מעלות צלזיוס ואלף גרם');
    expect(normalizeHebrewSpeech('1 1/20')).toBe('אחת ואחת חלקי עשרים');
    expect(() => normalizeHebrewSpeech('1/0')).toThrow();
  });

  it('preserves the complete text across bounded synthesis requests', () => {
    const text = ('מערבבים היטב ואז מוסיפים את המים. ').repeat(18).trim();
    const chunks = speechChunks(text);
    expect(chunks.join(' ')).toBe(text);
    expect(chunks.every(c=>c.length <= 180)).toBe(true);
  });

  it('ships the offline runtime declared in the verified cache manifest', () => {
    for (const file of noaAssets.files.filter(f => !('source' in f))) {
      const bytes = readFileSync('public'+noaAssets.base+file.path);
      expect(bytes.byteLength).toBe(file.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
    }
  });

  it('terminates an in-flight synthesis on stop before it can play audio', async () => {
    let sent!: () => void;
    const waiting = new Promise<void>(resolve => {sent=resolve;});
    const terminate = vi.fn(), createBuffer=vi.fn();
    vi.stubGlobal('AudioContext', class {state='running'; createBuffer=createBuffer;});
    vi.stubGlobal('Worker', class {postMessage=sent; terminate=terminate;});
    const speaker = new LocalNarrator();
    const result = speaker.play('הוספתי מים');
    await waiting;
    speaker.stop();
    await expect(result).rejects.toMatchObject({name:'AbortError'});
    expect(terminate).toHaveBeenCalledOnce();
    expect(createBuffer).not.toHaveBeenCalled();
  });
});

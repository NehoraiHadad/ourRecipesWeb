import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { recipeHints } from '@/lib/voice/localAsr';
import files from '@/lib/voice/asr-v1.json';

describe('local Hebrew transcription', () => {
  it('biases the recognizer with ingredients and actions from this recipe only', () => {
    const pasta = recipeHints(['שמן זית','פלפל שחור'], ['להוסיף מים ולערבב','מטגנים במחבת']);
    expect(pasta.verbs).toEqual(['טיגנתי','ערבבתי','הוספתי']);
    expect(pasta.lists.ingredients).toContain('שמן');
    expect(pasta.lists.actions).toContain('עוד לא ערבבתי');
    expect(pasta.lists.alternatives).toContain('לא הרטבתי');
    const next = recipeHints(['מלפפון'], ['לחתוך את המלפפון']);
    expect(next.verbs).toEqual([]);
    expect(next.lists.ingredients).not.toContain('שמן');
    expect(next.lists.actions).not.toContain('ערבבתי');
  });
  it('ships the exact browser worker, runtime and vocabulary listed for offline use', () => {
    for (const file of files.filter(f => !('remote' in f))) {
      const bytes = readFileSync('public/voice/asr/v1/' + file.path);
      expect(bytes.byteLength).toBe(file.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
    }
  });
});

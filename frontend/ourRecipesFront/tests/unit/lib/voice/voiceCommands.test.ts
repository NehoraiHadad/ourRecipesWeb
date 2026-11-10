import { describe, expect, it } from 'vitest';
import { localVoiceCommand } from '@/lib/voice/voiceCommands';
describe('local navigation before the language model', () => {
  it('handles explicit next/gap questions and asks about ambiguous pronouns', () => {
    expect(localVoiceCommand('מה עכשיו?')).toBe('next');
    expect(localVoiceCommand('  על איזה שלב דילגתי?  ')).toBe('missed');
    expect(localVoiceCommand('עשיתי את זה')).toBe('clarify');
  });
  it('does not discard concrete progress, negation, mixed reports or corrections', () => {
    for (const text of ['שמתי קמח, מה עכשיו?', 'הוספתי מים אבל עוד לא ערבבתי', 'תיקון, לא שמתי קמח', 'מה עכשיו? הוספתי מים']) expect(localVoiceCommand(text)).toBeNull();
  });
});

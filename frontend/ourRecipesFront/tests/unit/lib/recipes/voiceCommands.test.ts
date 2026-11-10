import { describe, expect, it } from 'vitest';
import { recipeVoiceCommand } from '@/lib/recipes/voiceCommands';

describe('Hebrew recipe commands', () => {
  it.each([
    ['שמתי קמח. מה עכשיו?', 'next'],
    ['מָה עַכְשָׁיו?', 'next'],
    ['חזור על השלב', 'repeat'],
    ['חזור לשלב הקודם', 'previous'],
    ['תתחילי מההתחלה', 'restart'],
    ['עצור, מה עכשיו?', 'stop'],
    ['אל תמשיך', 'unknown'],
    ['שמתי קמח', 'unknown'],
    ['כמה מלח צריך?', 'unknown'],
  ])('%s → %s', (text, command) => expect(recipeVoiceCommand(text)).toBe(command));
});

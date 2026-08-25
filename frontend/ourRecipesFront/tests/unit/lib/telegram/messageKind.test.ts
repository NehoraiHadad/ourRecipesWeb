import { describe, it, expect } from 'vitest';
import { classifyChannelMessage } from '@/lib/telegram/messageKind';

describe('classifyChannelMessage', () => {
  it('classifies the place-mirror header, with any type emoji', () => {
    expect(classifyChannelMessage('🍽️ המלצה חדשה\n\nשם: נאיה')).toBe('place');
    expect(classifyChannelMessage('☕ המלצה\n\nשם: קפה יאני')).toBe('place');
    expect(classifyChannelMessage('🍽 המלצה\n\nשם: טעמה')).toBe('place');
    expect(classifyChannelMessage('📍 המלצה חדשה\n\nשם: מקום')).toBe('place');
  });

  it('classifies the menu-mirror header', () => {
    expect(classifyChannelMessage('🍽️ תפריט חדש\n\nשם: שבת')).toBe('menu');
  });

  it('classifies an archive-marked (🗑️) place message as a place', () => {
    expect(classifyChannelMessage('🗑️ ☕ המלצה\n\nשם: קפה')).toBe('place');
  });

  it('classifies everything else as a recipe', () => {
    expect(classifyChannelMessage('כותרת: עוגת שוקולד\nרשימת מצרכים:')).toBe('recipe');
    expect(classifyChannelMessage('מרק בצל')).toBe('recipe');
    expect(classifyChannelMessage('')).toBe('recipe');
  });

  it('does not misclassify a recipe that merely mentions the headers', () => {
    expect(classifyChannelMessage('המלצה שלי לשבת\nמתכון...')).toBe('recipe');
    expect(classifyChannelMessage('כותרת: תפריט חדש לשבוע')).toBe('recipe');
  });
});

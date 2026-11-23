import { describe, expect, it } from 'vitest';
import { activeRecipe } from '@/lib/voice/compactEngine';
import { questionOnly, recipeTurn } from '@/lib/voice/recipeConversation';

const pancake = activeRecipe(1, 'פנקייק', ['1. לערבב הכל', '2. לטגן'], [
  { name: 'קמח', unit: 'כוס', quantity: 1 }, { name: 'סוכר' }, { name: 'ביצים', quantity: 2 },
]);
describe('cooking with the ingredient list', () => {
  it('tracks a listed ingredient independently of the mixing step', () => {
    const response = recipeTurn(pancake, {}, 0, 'שמתי את הקמח, מה עכשיו?')!;
    expect(response.writes.map(w => [w.action, w.status])).toEqual([['i0', 'done']]);
    expect(response.reply).toContain('לערבב הכל');
    expect(response.reply).toContain('סוכר, ביצים');
  });
  it.each(['מה צריך לעשות?', 'אז מה אני צריכה לעשות עכשיו', 'מה עושים הלאה?'])('answers %s without writing', q => {
    expect(recipeTurn(pancake, {i0:'done'}, 0, q)).toEqual(expect.objectContaining({ focus:0, writes:[] }));
    expect(recipeTurn(pancake, {s0a0:'done'}, 0, q)).toEqual(expect.objectContaining({ focus:1, writes:[] }));
  });
  it('moves to frying only after a report that mixing finished', () => {
    const response = recipeTurn(pancake, {i0:'done'}, 0, 'ערבבתי הכל, מה עכשיו?')!;
    expect(response.focus).toBe(1);
    expect(response.writes.map(w => w.action)).toEqual(['s0a0']);
  });
  it('distinguishes a report from asking about the amount or recorded status', () => {
    expect(recipeTurn(pancake, {}, 0, 'כמה קמח צריך?')?.reply).toContain('1 כוס קמח');
    expect(recipeTurn(pancake, {}, 0, 'שמתי קמח?')?.writes).toEqual([]);
    expect(recipeTurn(pancake, {}, 0, 'לא שמתי קמח')?.writes[0].status).toBe('pending');
    expect(recipeTurn(pancake, {}, 0, 'שמתי רק חצי מהקמח')?.writes[0].status).toBe('partial');
    expect(recipeTurn(pancake, {}, 0, 'שמתי קמח וסוכר')?.writes).toHaveLength(2);
    expect(recipeTurn(pancake, {}, 0, 'שמתי קקאו.')?.writes).toEqual([]);
  });
  it('does not guess between two flour types or mark future actions complete', () => {
    const r = activeRecipe(2, 'בצק', ['לערבב הכל','להוסיף קמח מלא'], [{name:'קמח מלא'},{name:'קמח לבן'}]);
    expect(recipeTurn(r,{},0,'שמתי קמח')?.writes).toEqual([]);
    expect(recipeTurn(r,{},0,'שמתי קמח מלא')?.writes.map(w=>w.action)).toEqual(['i0']);
    expect(recipeTurn(r,{},1,'שמתי קמח מלא')?.writes.map(w=>w.action)).toEqual(['i0','s1a0']);
  });
  it('keeps independent reports before and after questions', () => {
    expect(questionOnly('איך לטגן את זה?')).toBe(true);
    expect(questionOnly('אפשר להשתמש בדפים מוכנים? הוספתי מילוי.')).toBe(false);
    expect(questionOnly('רידדתי את הבצק, אפשר להשתמש בדפים מוכנים?')).toBe(false);
  });
});

it('reads the next step after finishing mixing and preserves more specific instructions', () => {
  expect(recipeTurn(pancake, {}, 0, 'ערבבתי הכל')?.focus).toBe(1);
  expect(recipeTurn(pancake, {}, 0, 'שמתי כוס קמח בקערה')?.writes.map(w => w.action)).toEqual(['i0']);
  const qualified = activeRecipe(7, 'בלילה', ['לערבב הכל עד שאין גושים'], []);
  expect(recipeTurn(qualified, {}, 0, 'ערבבתי הכל')).toBeUndefined();
  const noList = activeRecipe(8, 'בלילה', ['להוסיף קמח'], []);
  expect(recipeTurn(noList, {}, 0, 'שמתי קמח')).toBeUndefined();
});

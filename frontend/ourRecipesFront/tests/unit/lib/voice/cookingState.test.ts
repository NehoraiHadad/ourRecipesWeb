import { describe, it, expect } from 'vitest';
import { makeCookingRecipe, initialCookingState, validateProposal, updateActions, cookingReply, cookingPrompt } from '@/lib/voice/cookingState';
const recipe = makeCookingRecipe('1', 'בצק', ['קמח', 'מים'], 'להוסיף קמח\nלהוסיף מים ולערבב\nללוש את הבצק');
const initial = initialCookingState(recipe);
const proposal = (extra = {}) => ({ recipeKey: recipe.key, revision: 0, intent: 'report', changes: [{ actionId: 's0a0', done: true, evidence: 'שמתי קמח' }], focusActionId: null, ...extra });
describe('explicit cooking state with Hebrew reports (simulated model proposals)', () => {
  it('keeps a partial step pending and distinguishes negation', () => {
    const utterance = 'הוספתי מים אבל עוד לא ערבבתי';
    const p = validateProposal(proposal({ changes: [{ actionId: 's1a0', done: true, evidence: 'הוספתי מים' }, { actionId: 's1a1', done: false, evidence: 'עוד לא ערבבתי' }] }), recipe, initial, utterance);
    const next = updateActions(recipe, initial, p.changes);
    expect(next.completed).toEqual(['s1a0']);
    expect(next.remaining).toEqual(['s0a0', 's1a1', 's2a0']);
    expect(next.currentStep).toBe(0);
    expect(cookingReply(recipe, next, 'next')).toContain('להוסיף קמח');
  });
  it('reverses a previous completion after a correction', () => {
    const done = updateActions(recipe, initial, [{ actionId: 's0a0', done: true }]);
    const p = validateProposal(proposal({ revision: 1, changes: [{ actionId: 's0a0', done: false, evidence: 'לא שמתי קמח' }] }), recipe, done, 'תיקון: לא שמתי קמח');
    expect(updateActions(recipe, done, p.changes).completed).toEqual([]);
  });
  it('asks for clarification without changing state', () => {
    const p = validateProposal(proposal({ intent: 'clarify', changes: [] }), recipe, initial, 'עשיתי את זה');
    expect(p.changes).toEqual([]); expect(cookingReply(recipe, initial, p.intent)).toContain('לא ברור');
    expect(() => validateProposal(proposal({ intent: 'clarify' }), recipe, initial, 'שמתי קמח')).toThrow();
  });
  it('rejects invented actions, amounts/prose fields, evidence and duplicate updates', () => {
    for (const extra of [
      { changes: [{ actionId: 'bake-180', done: true, evidence: 'שמתי קמח' }] },
      { answer: 'יש לאפות ב-180 מעלות' },
      { changes: [{ actionId: 's0a0', done: true, evidence: 'הוספתי מים' }] },
      { changes: [proposal().changes[0], proposal().changes[0]] },
      { focusActionId: 'missing' },
    ]) expect(() => validateProposal(proposal(extra), recipe, initial, 'שמתי קמח')).toThrow();
  });
  it('rejects stale revisions, recipe switches and source edits', () => {
    const other = makeCookingRecipe('2', 'סלט', [], 'לחתוך מלפפון');
    const edited = makeCookingRecipe('1', 'בצק', [], 'להוסיף שמן');
    for (const r of [other, edited]) expect(() => validateProposal(proposal(), r, initialCookingState(r), 'שמתי קמח')).toThrow();
    expect(() => validateProposal(proposal(), recipe, { ...initial, revision: 1 }, 'שמתי קמח')).toThrow();
  });
  it('reports gaps only before the displayed step and never assumes skipped means completed', () => {
    const navigated = { ...initial, currentStep: 2 };
    expect(cookingReply(recipe, navigated, 'missed')).toContain('ולערבב');
    expect(navigated.completed).toEqual([]);
    expect(cookingReply(recipe, initial, 'missed')).toContain('אין פעולות מוקדמות');
  });
  it('speaks source instructions and labels additional advice', () => {
    expect(cookingReply(recipe, initial, 'next')).toBe('לפי המתכון, הפעולה הבאה שנותרה: להוסיף קמח');
    expect(cookingReply(recipe, initial, 'advice')).toMatch(/^עצה נוספת:/);
    const prompt = cookingPrompt(recipe, initial, 'שמתי קמח, מה עכשיו?', 'הוספתי מים');
    expect(JSON.parse(prompt[1].content)).toMatchObject({ recipe, state: initial, previousUtterance: 'הוספתי מים' });
  });
});

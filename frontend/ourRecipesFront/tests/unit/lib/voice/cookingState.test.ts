import { describe, it, expect } from 'vitest';
import { makeCookingRecipe, initialCookingState, validateProposal, updateActions, cookingReply, cookingPrompt, cookingProposalSchema, cookingProposalGrammar, decodeCookingProposal, modelActionLabels } from '@/lib/voice/cookingState';
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
    const input = JSON.parse(prompt[1].content);
    expect(input).toMatchObject({ recipe: { key: recipe.key, title: recipe.title }, state: { recipeKey: recipe.key, revision: 0, currentStep: 1 }, previousUtterance: 'הוספתי מים' });
    expect(input.recipe.steps[0].actions[0]).toMatchObject({ completed: false, remaining: true });
    expect(input.recipe.steps[0].number).toBe(1);
    expect(input.recipe.steps[0].actions[0].id).toContain('להוסיף קמח');
  });
});


it('constrains generated keys, revision, actions and evidence while preserving semantic validation', () => {
  const utterance = 'הוספתי מים אבל עוד לא ערבבתי';
  const schema = cookingProposalSchema(recipe, initial, utterance);
  expect(schema.properties.recipeKey.const).toBe(recipe.key);
  expect(schema.properties.revision.const).toBe(0);
  expect(schema.properties.changes.items.properties.actionId.enum).toEqual(modelActionLabels(recipe).map(a => a.label));
  expect(schema.properties.changes.items.properties.evidence.enum).toEqual(['הוספתי מים', 'עוד לא ערבבתי']);
  expect(schema.additionalProperties).toBe(false);
  expect(() => validateProposal(proposal({ intent: 'next' }), recipe, initial, 'שמתי קמח')).toThrow();
});


it('rejects positive completion supported by an explicitly negated quote', () => {
  expect(() => validateProposal(proposal({ changes: [{ actionId: 's0a0', done: true, evidence: 'לא שמתי קמח' }] }), recipe, initial, 'תיקון, לא שמתי קמח')).toThrow();
  expect(validateProposal(proposal({ changes: [{ actionId: 's0a0', done: false, evidence: 'לא שמתי קמח' }] }), recipe, initial, 'תיקון, לא שמתי קמח').changes[0].done).toBe(false);
});

it('requires clarification for a bare pronoun and forbids completion from a pure question', () => {
  for (const utterance of ['עשיתי את זה', 'סיימתי הכל', 'מה עכשיו?', 'על איזה שלב דילגתי?']) {
    expect(() => validateProposal(proposal({ changes: [{ actionId: 's0a0', done: true, evidence: utterance }] }), recipe, initial, utterance)).toThrow();
  }
});

it('rejects generic evidence observed in real Dicta inference rather than treating it as action support', () => {
  // Dicta proposed water=true from the evidence "תיקון" in a flour correction.
  for (const [utterance, evidence] of [['תיקון, לא שמתי קמח', 'תיקון'], ['שמתי קמח, מה עכשיו?', 'מה עכשיו']]) {
    expect(() => validateProposal(proposal({ changes: [{ actionId: 's1a0', done: true, evidence }] }), recipe, initial, utterance)).toThrow('ציטוט כללי');
  }
});


it('uses an explicit grammar with the current recipe, revision, allowed IDs and exact quotes', () => {
  const grammar = cookingProposalGrammar(recipe, initial, 'הוספתי מים אבל עוד לא ערבבתי');
  expect(grammar).toContain('root ::= report | question');
  expect(grammar).toContain('להוסיף מים');
  expect(grammar).toContain('עוד לא ערבבתי');
  expect(grammar).not.toContain('bake-180');
  expect(grammar).toContain('focusActionId');
});


it('maps only exact human-readable action labels back to stable state IDs', () => {
  const label = modelActionLabels(recipe)[0].label;
  const decoded = decodeCookingProposal(proposal({ changes: [{ actionId: label, done: true, evidence: 'שמתי קמח' }] }), recipe);
  expect(validateProposal(decoded, recipe, initial, 'שמתי קמח').changes[0].actionId).toBe('s0a0');
  expect(() => validateProposal(decodeCookingProposal(proposal({ changes: [{ actionId: 'שלב 9: פעולה מומצאת', done: true, evidence: 'שמתי קמח' }] }), recipe), recipe, initial, 'שמתי קמח')).toThrow();
});

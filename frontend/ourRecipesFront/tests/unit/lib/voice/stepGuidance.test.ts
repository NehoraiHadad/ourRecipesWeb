import { describe, expect, it } from 'vitest';
import { activeRecipe } from '@/lib/voice/compactEngine';
import { narratedSteps } from '@/lib/voice/stepGuidance';
import { recipeTurn } from '@/lib/voice/recipeConversation';

const steps = ['1. לערבב הכל', '2. לטגן', '3. להגיש עם מייפל או גבינה עם סוכר'];
const recipe = activeRecipe(1, 'פנקייק', steps, [{name:'קמח',quantity:1,unit:'כוס'}, {name:'חלב'}, {name:'ביצים'}, {name:'סוכר',quantity:2,unit:'כפות'}]);
describe('ground short instructions in the recipe', () => {
  it('names the mixing ingredients on the first read, repeat and follow-up, and keeps serving suggestions separate', () => {
    const [opening, fry] = narratedSteps(recipe, steps, {});
    expect(opening).toContain('לערבב יחד קמח, חלב וביצים');
    expect(opening).toContain('סוכר בהגשה');
    expect(opening).not.toContain('מייפל');
    expect(fry).toBe('לטגן את התערובת מהשלב הקודם.');
    for (const question of ['מה לערבב?', 'אז מה בדיוק מערבבים?', 'מה אני אמורה לערבב?', 'מה הכוונה בהכל?']) {
      expect(recipeTurn(recipe, {i0:'done'}, 0, question)).toEqual({reply:opening,writes:[]});
    }
    expect(recipeTurn(recipe, {}, 0, 'וכמה מכל דבר?')?.reply).toContain('1 כוס קמח');
  });
  it('keeps preparation details, excludes later additions and respects ingredient sections', () => {
    const lines = ['לטרוף את כל החומרים היטב עד שאין גושים', 'להוסיף את האגוזים', 'להכין את הציפוי'];
    const r = activeRecipe(2, 'עוגה', lines, ['לבלילה:', 'קמח', 'חלב', 'אגוזים', 'שמן לטיגון', 'לציפוי:', 'שוקולד'].map(name=>({name})));
    expect(narratedSteps(r,lines,{})[0]).toBe('לטרוף יחד קמח וחלב היטב עד שאין גושים.');
  });
  it('uses ingredients named in the preceding preparation, and leaves an unresolved component unassigned', () => {
    const lines = ['לשים קמח וביצים בקערה', 'לערבב הכל', 'לצפות בשוקולד'];
    const r=activeRecipe(3,'עוגה',lines,['קמח','ביצים','שוקולד'].map(name=>({name})));
    expect(narratedSteps(r,lines,{})[1]).toBe('לערבב יחד קמח וביצים.');
    const ambiguous=['לערבב הכל', 'להכין את המילוי'];
    const filling=activeRecipe(4,'עוגה',ambiguous,r.ingredients);
    expect(narratedSteps(filling,ambiguous,{})[0]).toContain('לא מפרט אילו מצרכים');
    expect(narratedSteps(filling,ambiguous,{})[0]).not.toContain('שוקולד');
  });
  it('preserves an ingredient named after an adverb or bowl', () => {
    const steps = ['לערבב היטב את הביצים', 'לערבב בקערה קמח וסוכר'];
    const r = activeRecipe(8, 'עוגה', steps, recipe.ingredients);
    expect(narratedSteps(r, steps, {})).toEqual(steps);
  });

  it('retains explicit exceptions to a collective instruction', () => {
    const lines = ['לערבב הכל, חוץ מהביצים'];
    const r = activeRecipe(6, 'בלילה', lines, recipe.ingredients);
    expect(narratedSteps(r, lines, {})[0]).toBe(lines[0]);
    expect(recipeTurn(r, {}, 0, 'כמה מכל דבר?')?.reply).toContain('אין במתכון רשימת כמויות נפרדת');
    expect(recipeTurn(r, {}, 0, 'מה לערבב?')).toEqual({ reply: lines[0] + '.', writes: [] });
  });
  it('does not turn a dry-only instruction into a whole-recipe list, or guess heat or time', () => {
    const lines=['לערבב את כל החומרים היבשים', 'לטגן על אש נמוכה'];
    const r=activeRecipe(5,'פנקייק',lines,recipe.ingredients);
    expect(narratedSteps(r,lines,{})[0]).toEqual(lines[0]);
    expect(recipeTurn(r,{},1,'כמה זמן לטגן?')).toEqual({reply:expect.stringContaining('משך הזמן לא מצוין'),writes:[]});
    expect(recipeTurn(r,{},1,'על איזה חום לטגן?')?.reply).toContain('על אש נמוכה');
    expect(recipeTurn(recipe,{},1,'מה השלב הבא?')?.writes).toEqual([]);
  });
});

it('explains an omitted object and uses a stated oven setting for a baking question', () => {
  const lines=['לחמם תנור ל־180 מעלות','לערבב היטב','לאפות'];
  const r=activeRecipe(7, 'עוגה',lines,[{name:'קמח'},{name:'ביצים'}]);
  expect(narratedSteps(r,lines,{})[1]).toBe('לערבב יחד קמח וביצים היטב.');
  expect(recipeTurn(r,{},2,'באיזה חום לאפות?')?.reply).toContain(lines[0]);
  expect(recipeTurn(r,{},2,'כמה זמן לאפות?')?.reply).toContain('לא מצוין');
});

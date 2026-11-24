import { describe, expect, it } from 'vitest';
import { activeRecipe, type Turn } from '@/lib/voice/compactEngine';
import { ingredientTurn } from '@/lib/voice/ingredientConversation';
import { applyCookingChanges, readCookingProgress } from '@/lib/voice/cookingProgress';
import { recipeTurn } from '@/lib/voice/recipeConversation';

const recipe = activeRecipe(1, 'פנקייק', ['לערבב הכל', 'לטגן'], [
  { name: 'חלב', quantity: 2, unit: 'כוסות' }, { name: 'קמח', quantity: 1, unit: 'כוס' }, { name: 'שמן' }]);
function session(saved: string | null = null) {
  let snapshot = readCookingProgress(recipe, saved);
  const history: Turn[] = [];
  return {
    say(text: string) {
      const direct = ingredientTurn(recipe, snapshot.progress, 0, text, history, snapshot.portions);
      const reply = direct ?? recipeTurn(recipe, snapshot.progress, 0, text);
      if (!reply) throw new Error(text);
      snapshot = applyCookingChanges(snapshot.progress, snapshot.portions, reply.writes, direct?.portions);
      history.push({ role: 'user', content: text }, { role: 'assistant', content: reply.reply });
      return reply;
    },
    data: () => snapshot,
    save: () => JSON.stringify({ ...snapshot.progress, portions: snapshot.portions }),
  };
}

describe('ingredient portions in the recipe guide', () => {
  it('keeps half a cup distinct from half of the recipe after reloading', () => {
    const first = session();
    first.say('מזגתי חצי כוס חלב');
    const next = session(first.save());
    expect(next.say('כמה חלב נשאר להוסיף?').reply).toContain('1.5 כוסות חלב');
    next.say('תיקון, שמתי חצי מהחלב');
    expect(next.data().portions.i0).toBe(0.5);
    expect(next.data().progress.s0a0).toBe('pending');
  });
  it('resolves an ambiguous repeat by voice and clears its fraction on completion', () => {
    const cook = session();
    cook.say('שמתי חצי כוס חלב');
    expect(cook.say('שמתי חצי כוס חלב').writes).toEqual([]);
    cook.say('זו תוספת');
    expect(cook.data().portions.i0).toBe(0.5);
    cook.say('הוספתי עוד כוס חלב');
    expect(cook.data().progress.i0).toBe('done');
    expect(cook.data().portions).toEqual({});
  });
  it('preserves legacy partial progress and rejects stale or invalid fractions', () => {
    expect(session('{"i0":"partial"}').say('כמה חלב נשאר להוסיף?').reply).toContain('לא תועד');
    expect(session('{"i0":"done","i1":"partial","portions":{"i0":0.5,"i1":"0.25","s0a0":0.2}}').data().portions).toEqual({});
    const cook = session();
    cook.say('שמתי חצי מהחלב');
    cook.say('שמתי רק חלק מהחלב');
    expect(cook.data().portions).toEqual({});
  });
  it('asks about approximate reports and keeps a mixing step open after adding flour', () => {
    const cook = session();
    const estimate = cook.say('טוב אז זרקתי לקערה בערך חצי מכמות הקמח');
    expect(estimate.reply).toContain('כמה קמח');
    expect(estimate.writes).toEqual([]);
    cook.say('את הקמח הכנסתי לקערה');
    expect(cook.data().progress).toMatchObject({ i1: 'done', s0a0: 'pending' });
  });
  it('handles a spoken report and next-step question without punctuation', () => {
    const cook = session();
    expect(cook.say('הוספתי חצי כוס חלב ומה עכשיו').reply).toContain('לערבב');
    expect(cook.data().portions.i0).toBe(0.25);
  });
  it('updates measured compound reports and refuses an ambiguous pronoun', () => {
    const cook = session();
    cook.say('שמתי חצי מהחלב, מה עוד נשאר להוסיף?');
    expect(cook.data().portions.i0).toBe(0.5);
    expect(cook.say('בעצם שמתי רק חצי ממנו').writes).toEqual([]);
  });
});

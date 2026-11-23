import { describe, expect, it } from 'vitest';
import { activeRecipe } from '@/lib/voice/compactEngine';

describe('active cooking recipe', () => {
  it('keeps substitution advice with its action and preserves the displayed step index', () => {
    const recipe = activeRecipe(5, 'כיסונים', ['1. לרדד את הבצק, אפשר להשתמש בדפים מוכנים', 'להוסיף מילוי ולערבב'], []);
    expect(recipe.actions).toEqual([
      { id: 's0a0', source: 'לרדד את הבצק, אפשר להשתמש בדפים מוכנים', step: 0 },
      { id: 's1a0', source: 'להוסיף מילוי', step: 1 },
      { id: 's1a1', source: 'לערבב', step: 1 },
    ]);
  });

  it('invalidates saved progress when the instructions or ingredients change', () => {
    const recipe = activeRecipe(5, 'כיסונים', ['לרדד בצק'], [{ name: 'קמח' }]);
    expect(activeRecipe(5, 'כיסונים', ['למלא את הבצק'], [{ name: 'קמח' }]).version).not.toBe(recipe.version);
    expect(activeRecipe(5, 'כיסונים', ['לרדד בצק'], [{ name: 'אורז' }]).version).not.toBe(recipe.version);
  });
});

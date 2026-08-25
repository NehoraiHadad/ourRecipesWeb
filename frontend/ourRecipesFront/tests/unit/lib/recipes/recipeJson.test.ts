// @vitest-environment node
/**
 * The AI recipe JSON contract: validation/normalization of the model's
 * answer, and the guarantee that the derived channel text round-trips
 * through `parseRecipeMessage` fully parsed.
 */
import { describe, it, expect } from 'vitest';
import { parseRecipeJson, recipeJsonToChannelText } from '@/lib/recipes/recipeJson';
import { parseRecipeMessage } from '@/lib/recipes/parser';

const FULL_JSON = JSON.stringify({
  title: 'עוף ואורז במחבת',
  categories: ['מנות עיקריות', 'עוף'],
  preparation_time: 25,
  difficulty: 'קל',
  ingredients: ['500 גרם חזה עוף', '1 כוס אורז'],
  instructions: ['1. לטגן את העוף', '2) להוסיף אורז ומים'],
  tips: ['להשרות את האורז 10 דקות מראש']
});

describe('parseRecipeJson', () => {
  it('parses and normalizes a full answer, stripping model-added step numbering', () => {
    const recipe = parseRecipeJson(FULL_JSON)!;

    expect(recipe.title).toBe('עוף ואורז במחבת');
    expect(recipe.categories).toEqual(['מנות עיקריות', 'עוף']);
    expect(recipe.preparationTime).toBe(25);
    expect(recipe.difficulty).toBe('EASY');
    expect(recipe.instructions).toEqual(['לטגן את העוף', 'להוסיף אורז ומים']);
    expect(recipe.tips).toEqual(['להשרות את האורז 10 דקות מראש']);
  });

  it('tolerates missing optional fields', () => {
    const recipe = parseRecipeJson(
      JSON.stringify({ title: 'סלט', ingredients: ['מלפפון'], instructions: ['לחתוך'] })
    )!;

    expect(recipe.preparationTime).toBeUndefined();
    expect(recipe.difficulty).toBeUndefined();
    expect(recipe.categories).toEqual([]);
    expect(recipe.tips).toEqual([]);
  });

  it('rejects non-JSON and answers missing the essentials', () => {
    expect(parseRecipeJson('not json')).toBeNull();
    expect(parseRecipeJson('[]')).toBeNull();
    expect(parseRecipeJson(JSON.stringify({ title: '', ingredients: ['x'], instructions: ['y'] }))).toBeNull();
    expect(parseRecipeJson(JSON.stringify({ title: 'סלט', ingredients: [], instructions: ['y'] }))).toBeNull();
    expect(parseRecipeJson(JSON.stringify({ title: 'סלט', ingredients: ['x'], instructions: [] }))).toBeNull();
  });

  it('caps categories at five', () => {
    const recipe = parseRecipeJson(
      JSON.stringify({
        title: 'סלט',
        categories: ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז'],
        ingredients: ['מלפפון'],
        instructions: ['לחתוך']
      })
    )!;

    expect(recipe.categories).toHaveLength(5);
  });
});

describe('recipeJsonToChannelText', () => {
  it('produces canonical text that parseRecipeMessage round-trips fully parsed', () => {
    const text = recipeJsonToChannelText(parseRecipeJson(FULL_JSON)!);
    const parsed = parseRecipeMessage(text);

    expect(parsed.isParsed).toBe(true);
    expect(parsed.parseErrors).toEqual([]);
    expect(parsed.title).toBe('עוף ואורז במחבת');
    expect(parsed.categories).toEqual(['מנות עיקריות', 'עוף']);
    expect(parsed.preparationTime).toBe(25);
    expect(parsed.difficulty).toBe('EASY');
    expect(parsed.ingredients).toEqual(['500 גרם חזה עוף', '1 כוס אורז']);
    expect(parsed.instructions).toBe('1. לטגן את העוף\n2. להוסיף אורז ומים');
  });

  it('keeps tips in the raw text but out of the parsed instructions', () => {
    const text = recipeJsonToChannelText(parseRecipeJson(FULL_JSON)!);
    const parsed = parseRecipeMessage(text);

    expect(text).toContain('טיפים:');
    expect(text).toContain('להשרות את האורז');
    expect(parsed.instructions).not.toContain('להשרות את האורז');
  });
});

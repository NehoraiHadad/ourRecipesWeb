// @vitest-environment node
/**
 * The menu agent's search/detail tools. What matters here is that the
 * narrowing really happens in SQL (the whole point of replacing the old
 * 200-row catalog dump) and that the caps hold even when the model asks for
 * more than it should.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { prismaMock, resetPrismaMock } from '@tests/mocks/prisma';
import { buildSearchWhere } from '@/lib/ai/menu/searchWhere';
import { searchRecipes, getRecipesDetails, executeMenuTool } from '@/lib/ai/menu/tools';

function recipeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: 'עוף בתנור',
    categories: 'עיקריות,בשרי',
    preparation_time: 15,
    cooking_time: 45,
    servings: 4,
    difficulty: 'EASY',
    ...overrides
  };
}

beforeEach(() => {
  resetPrismaMock();
});

describe('buildSearchWhere', () => {
  it('always scopes to active, parsed recipes', () => {
    expect(buildSearchWhere({})).toMatchObject({ status: 'ACTIVE', is_parsed: true });
  });

  it('AND-s one title/categories clause per query word', () => {
    const where = buildSearchWhere({ query: 'סלט ירוק' });

    expect(where.AND).toHaveLength(2);
    expect(where.AND).toContainEqual({
      OR: [
        { title: { contains: 'סלט', mode: 'insensitive' } },
        { categories: { contains: 'סלט', mode: 'insensitive' } }
      ]
    });
  });

  it('OR-s the requested categories and keeps a valid difficulty', () => {
    const where = buildSearchWhere({ categories: ['קינוחים', 'עוגות'], difficulty: 'easy' });

    expect(where.AND).toContainEqual({
      OR: [
        { categories: { contains: 'קינוחים', mode: 'insensitive' } },
        { categories: { contains: 'עוגות', mode: 'insensitive' } }
      ]
    });
    expect(where.AND).toContainEqual({ difficulty: 'EASY' });
  });

  it('drops a difficulty that is not one of the enum values', () => {
    const where = buildSearchWhere({ difficulty: 'IMPOSSIBLE' });
    expect(where.AND).toBeUndefined();
  });

  it('bounds each time column when a total-time budget is given', () => {
    const where = buildSearchWhere({ max_total_time: 30 });

    expect(where.AND).toContainEqual({
      OR: [{ preparation_time: { lte: 30 } }, { preparation_time: null }]
    });
    expect(where.AND).toContainEqual({
      OR: [{ cooking_time: { lte: 30 } }, { cooking_time: null }]
    });
  });
});

describe('searchRecipes', () => {
  it('caps the limit the model asks for at 40', async () => {
    prismaMock.recipe.findMany.mockResolvedValue([] as never);

    await searchRecipes({ limit: 500 });

    expect(prismaMock.recipe.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 40 })
    );
  });

  it('drops rows whose prep + cook exceeds the budget the SQL bound cannot express', async () => {
    prismaMock.recipe.findMany.mockResolvedValue([
      recipeRow({ id: 1, preparation_time: 20, cooking_time: 20 }), // 40 > 30
      recipeRow({ id: 2, preparation_time: 10, cooking_time: 15 }) // 25 <= 30
    ] as never);

    const results = await searchRecipes({ max_total_time: 30 });

    expect(results.map((r) => r.id)).toEqual([2]);
  });

  it('returns compact stubs, never instructions or ingredients', async () => {
    prismaMock.recipe.findMany.mockResolvedValue([recipeRow()] as never);

    const [stub] = await searchRecipes({ query: 'עוף' });

    expect(stub).toEqual({
      id: 1,
      title: 'עוף בתנור',
      categories: 'עיקריות,בשרי',
      preparation_time: 15,
      cooking_time: 45,
      servings: 4,
      difficulty: 'EASY'
    });
  });
});

describe('getRecipesDetails', () => {
  it('caps the id list at 25 and ignores non-numeric ids', async () => {
    prismaMock.recipe.findMany.mockResolvedValue([] as never);
    const ids: unknown[] = Array.from({ length: 40 }, (_, i) => i + 1);
    ids.push('לא מספר');

    await getRecipesDetails(ids);

    const where = prismaMock.recipe.findMany.mock.calls[0][0]?.where as {
      id: { in: number[] };
      status: string;
      is_parsed: boolean;
    };
    expect(where.id.in).toHaveLength(25);
    expect(where).toMatchObject({ status: 'ACTIVE', is_parsed: true });
  });

  it('does not query at all for an empty id list', async () => {
    expect(await getRecipesDetails([])).toEqual([]);
    expect(prismaMock.recipe.findMany).not.toHaveBeenCalled();
  });

  it('returns ingredient names only and a truncated instructions preview', async () => {
    prismaMock.recipe.findMany.mockResolvedValue([
      recipeRow({
        instructions: 'א'.repeat(500),
        ingredients_list: [
          { name: 'עוף', quantity: 1, unit: 'ק"ג' },
          { name: 'לימון' },
          { quantity: 2 }
        ]
      })
    ] as never);

    const [details] = await getRecipesDetails([1]);

    expect(details.ingredients).toEqual(['עוף', 'לימון']);
    expect(details.instructions_preview).toHaveLength(200);
  });
});

describe('executeMenuTool', () => {
  it('answers an unknown tool name with an error the model can read', async () => {
    expect(await executeMenuTool('make_dinner', {})).toEqual({ error: 'כלי לא מוכר: make_dinner' });
  });

  it('wraps search results under `recipes`', async () => {
    prismaMock.recipe.findMany.mockResolvedValue([recipeRow()] as never);

    const result = await executeMenuTool('search_recipes', { query: 'עוף' });

    expect(result).toEqual({ recipes: [expect.objectContaining({ id: 1 })] });
  });
});

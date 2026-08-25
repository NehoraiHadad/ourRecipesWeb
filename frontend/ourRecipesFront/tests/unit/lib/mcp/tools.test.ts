// @vitest-environment node
/**
 * The MCP tool surface: three read-only tools, category aggregation from the
 * comma-separated column, and the `url` enrichment (recipe pages are keyed by
 * telegram_id, not the internal id the executors return).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '@tests/mocks/prisma';
import { registerRecipeTools } from '@/lib/mcp/tools';

vi.mock('@/lib/ai/menu/tools', () => ({
  searchRecipes: vi.fn(async () => [{ id: 7, title: 'עוף בתנור' }]),
  getRecipesDetails: vi.fn(async () => [{ id: 7, title: 'עוף בתנור', ingredients: ['עוף'] }])
}));

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: 'text'; text: string }>;
}>;

function registeredTools(): Map<string, ToolHandler> {
  const tools = new Map<string, ToolHandler>();
  const server = {
    registerTool: (name: string, _config: unknown, handler: ToolHandler) => {
      tools.set(name, handler);
    }
  };
  registerRecipeTools(server as never);
  return tools;
}

function payloadOf(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text);
}

beforeEach(() => {
  resetPrismaMock();
});

describe('registerRecipeTools', () => {
  it('registers exactly the three read-only tools', () => {
    expect(Array.from(registeredTools().keys()).sort()).toEqual([
      'get_recipe_details',
      'list_categories',
      'search_recipes'
    ]);
  });

  it('search_recipes attaches the telegram_id-based page url', async () => {
    prismaMock.recipe.findMany.mockResolvedValue([{ id: 7, telegram_id: 4242 }] as never);

    const result = await registeredTools().get('search_recipes')!({ query: 'עוף' });

    expect(payloadOf(result).recipes).toEqual([
      { id: 7, title: 'עוף בתנור', url: 'https://recipes.nehoraihadad.com/recipe/4242' }
    ]);
  });

  it('leaves rows without a telegram_id mapping url-less', async () => {
    prismaMock.recipe.findMany.mockResolvedValue([] as never);

    const result = await registeredTools().get('get_recipe_details')!({ recipe_ids: [7] });

    expect(payloadOf(result).recipes).toEqual([
      { id: 7, title: 'עוף בתנור', ingredients: ['עוף'] }
    ]);
  });

  it('list_categories splits, trims and counts the comma-separated column', async () => {
    prismaMock.recipe.findMany.mockResolvedValue([
      { categories: 'עיקריות, בשרי' },
      { categories: 'עיקריות' },
      { categories: null },
      { categories: ' ' }
    ] as never);

    const result = await registeredTools().get('list_categories')!({});

    expect(payloadOf(result).categories).toEqual([
      { category: 'עיקריות', recipes: 2 },
      { category: 'בשרי', recipes: 1 }
    ]);
  });
});

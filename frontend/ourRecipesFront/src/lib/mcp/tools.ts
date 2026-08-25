/**
 * Read-only MCP tools over the family recipe database.
 *
 * Exposed to external AI agents via `POST /api/mcp` (see the route for auth).
 * Deliberately reuses the menu agent's executors (`@/lib/ai/menu/tools`), so
 * both surfaces search the exact same way: `status: 'ACTIVE'`, parsed rows
 * only. Nothing here mutates — this module must never import a write path.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { prisma } from '@/lib/prisma';
import { searchRecipes, getRecipesDetails } from '@/lib/ai/menu/tools';
import { PLANNABLE_RECIPE } from '@/lib/ai/menu/filters';

const SITE_URL = 'https://recipes.nehoraihadad.com';

function asText(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 1) }] };
}

/**
 * Attach a shareable page link to each row. The site's recipe pages are keyed
 * by `telegram_id`, while the executors return internal ids — so this needs
 * one extra lookup.
 */
async function withUrls<T extends { id: number }>(rows: T[]): Promise<Array<T & { url?: string }>> {
  if (rows.length === 0) return rows;

  const mapping = await prisma.recipe.findMany({
    where: { id: { in: rows.map((row) => row.id) } },
    select: { id: true, telegram_id: true }
  });
  const telegramIds = new Map(mapping.map((row) => [row.id, row.telegram_id]));

  return rows.map((row) => {
    const telegramId = telegramIds.get(row.id);
    return telegramId ? { ...row, url: `${SITE_URL}/recipe/${telegramId}` } : row;
  });
}

/** Distinct category names with recipe counts, from the comma-separated column. */
async function listCategories(): Promise<Array<{ category: string; recipes: number }>> {
  const rows = await prisma.recipe.findMany({
    where: PLANNABLE_RECIPE,
    select: { categories: true }
  });

  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const raw of (row.categories ?? '').split(',')) {
      const category = raw.trim();
      if (category) counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([category, recipes]) => ({ category, recipes }));
}

export function registerRecipeTools(server: McpServer): void {
  server.registerTool(
    'search_recipes',
    {
      title: 'חיפוש מתכונים',
      description:
        'Search the family recipe collection (Hebrew content). Filter by free text, ' +
        'categories (OR), difficulty and total time in minutes. ' +
        'Returns compact rows with a shareable url; call get_recipe_details for ingredients.',
      inputSchema: z.object({
        query: z.string().optional().describe('Free text matched against title and categories'),
        categories: z.array(z.string()).optional().describe('Hebrew category names; matches recipes in any of them'),
        difficulty: z.string().optional().describe('One of: EASY, MEDIUM, HARD'),
        max_total_time: z.number().int().positive().optional().describe('Max prep+cook minutes'),
        limit: z.number().int().min(1).max(40).optional().describe('Max rows (default 12)')
      })
    },
    async (args) => asText({ recipes: await withUrls(await searchRecipes(args)) })
  );

  server.registerTool(
    'get_recipe_details',
    {
      title: 'פרטי מתכונים',
      description:
        'Fetch ingredients and an instructions preview for up to 25 recipes by id ' +
        '(ids come from search_recipes).',
      inputSchema: z.object({
        recipe_ids: z.array(z.number().int().positive()).min(1).max(25)
      })
    },
    async ({ recipe_ids }) => asText({ recipes: await withUrls(await getRecipesDetails(recipe_ids)) })
  );

  server.registerTool(
    'list_categories',
    {
      title: 'קטגוריות',
      description: 'List every recipe category with its recipe count, most common first.',
      inputSchema: z.object({})
    },
    async () => asText({ categories: await listCategories() })
  );
}

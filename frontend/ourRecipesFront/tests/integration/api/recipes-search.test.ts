// @vitest-environment node
/**
 * `GET /api/recipes/search` — the advanced filters the UI collects.
 *
 * The route builds one flat `AND` of small `OR` groups; these tests assert on
 * the `where` handed to Prisma (both `count` and `findMany` must agree) rather
 * than on rows, since the filtering happens in the database.
 *
 * `@tests/mocks/prisma` must be imported before anything that pulls in
 * `@/lib/prisma`, and the route is imported lazily inside each test.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { prismaMock, resetPrismaMock } from '@tests/mocks/prisma';
import { createMockRequest, parseJsonResponse } from '@tests/helpers/api-test-helpers';

const ROW = {
  id: 7,
  telegram_id: 4242,
  title: 'עוגת שוקולד',
  categories: 'קינוחים,עוגות',
  difficulty: 'EASY',
  cooking_time: 45,
  preparation_time: 20,
  servings: 8,
  image_url: null,
  created_at: new Date('2024-01-01T00:00:00Z'),
  is_verified: true
};

beforeEach(() => {
  resetPrismaMock();
  prismaMock.recipe.count.mockResolvedValue(1);
  prismaMock.recipe.findMany.mockResolvedValue([ROW as any]);
});

/** Run the route against a query string and hand back the `where` it built. */
async function search(queryString: string) {
  const { GET } = await import('@/app/api/recipes/search/route');
  const response = await GET(
    createMockRequest(`http://localhost:3000/api/recipes/search${queryString}`)
  );

  const findManyArgs = prismaMock.recipe.findMany.mock.calls[0]?.[0] as any;
  const countArgs = prismaMock.recipe.count.mock.calls[0]?.[0] as any;

  return {
    response,
    where: findManyArgs?.where,
    countWhere: countArgs?.where,
    findManyArgs
  };
}

/** The `AND` array the route assembles (empty when no filter was given). */
function andClauses(where: any): any[] {
  return where?.AND ?? [];
}

describe('GET /api/recipes/search', () => {
  it('returns the paginated response shape unchanged', async () => {
    const { response } = await search('?query=עוגה');

    expect(response.status).toBe(200);
    const json = await parseJsonResponse<any>(response);
    expect(json.data).toHaveLength(1);
    expect(json.pagination).toEqual({
      page: 1,
      pageSize: 20,
      totalPages: 1,
      totalItems: 1
    });
  });

  it('scopes every search to ACTIVE recipes and pages the results', async () => {
    const { where, countWhere, findManyArgs } = await search('?page=2&pageSize=5');

    expect(where.status).toBe('ACTIVE');
    // No filters given — nothing but the status scope.
    expect(where.AND).toBeUndefined();
    expect(countWhere).toEqual(where);
    expect(findManyArgs.skip).toBe(5);
    expect(findManyArgs.take).toBe(5);
  });

  it('matches the free-text query against title, ingredients and raw_content', async () => {
    const { where } = await search('?query=' + encodeURIComponent('שוקולד'));

    expect(andClauses(where)).toContainEqual({
      OR: [
        { title: { contains: 'שוקולד', mode: 'insensitive' } },
        { ingredients: { contains: 'שוקולד', mode: 'insensitive' } },
        { raw_content: { contains: 'שוקולד', mode: 'insensitive' } }
      ]
    });
  });

  describe('categories', () => {
    it('requires every selected category (AND), one contains probe each', async () => {
      const { where } = await search(
        '?categories=' + encodeURIComponent('קינוחים,עוגות')
      );

      const and = andClauses(where);
      expect(and).toHaveLength(2);
      expect(and).toContainEqual({
        categories: { contains: 'קינוחים', mode: 'insensitive' }
      });
      expect(and).toContainEqual({
        categories: { contains: 'עוגות', mode: 'insensitive' }
      });
    });

    it('ignores blank entries in the comma-separated list', async () => {
      const { where } = await search(
        '?categories=' + encodeURIComponent('קינוחים, ,  ,עוגות,')
      );

      expect(andClauses(where)).toHaveLength(2);
    });

    it('still honours the legacy single `category` param', async () => {
      const { where } = await search('?category=' + encodeURIComponent('קינוחים'));

      expect(andClauses(where)).toEqual([
        { categories: { contains: 'קינוחים', mode: 'insensitive' } }
      ]);
    });
  });

  describe('preparation time', () => {
    it('turns maxPrepTime into an upper bound on preparation_time', async () => {
      const { where } = await search('?maxPrepTime=30');

      expect(andClauses(where)).toContainEqual({ preparation_time: { lte: 30 } });
    });

    it('accepts the legacy `prepTime` alias', async () => {
      const { where } = await search('?prepTime=15');

      expect(andClauses(where)).toContainEqual({ preparation_time: { lte: 15 } });
    });

    it('ignores a non-numeric bound instead of failing the search', async () => {
      const { response, where } = await search('?maxPrepTime=soon');

      expect(response.status).toBe(200);
      expect(where.AND).toBeUndefined();
    });
  });

  describe('difficulty', () => {
    it('filters on the enum, upper-casing what the UI sends', async () => {
      const { where } = await search('?difficulty=easy');

      expect(where.difficulty).toBe('EASY');
    });

    it('ignores an unknown difficulty', async () => {
      const { response, where } = await search('?difficulty=impossible');

      expect(response.status).toBe(200);
      expect(where.difficulty).toBeUndefined();
    });
  });

  describe('include / exclude terms', () => {
    it('requires every include term in the title or the recipe text', async () => {
      const { where } = await search(
        '?includeTerms=' + encodeURIComponent('שוקולד,אגוזים')
      );

      const and = andClauses(where);
      expect(and).toHaveLength(2);
      expect(and).toContainEqual({
        OR: [
          { title: { contains: 'שוקולד', mode: 'insensitive' } },
          { raw_content: { contains: 'שוקולד', mode: 'insensitive' } }
        ]
      });
      expect(and).toContainEqual({
        OR: [
          { title: { contains: 'אגוזים', mode: 'insensitive' } },
          { raw_content: { contains: 'אגוזים', mode: 'insensitive' } }
        ]
      });
    });

    it('negates every exclude term', async () => {
      const { where } = await search('?excludeTerms=' + encodeURIComponent('חמאה'));

      expect(andClauses(where)).toEqual([
        {
          NOT: {
            OR: [
              { title: { contains: 'חמאה', mode: 'insensitive' } },
              { raw_content: { contains: 'חמאה', mode: 'insensitive' } }
            ]
          }
        }
      ]);
    });
  });

  it('combines every filter into a single AND, shared by count and findMany', async () => {
    const params = new URLSearchParams({
      query: 'עוגה',
      categories: 'קינוחים,עוגות',
      difficulty: 'medium',
      maxPrepTime: '60',
      includeTerms: 'שוקולד',
      excludeTerms: 'חמאה,ביצים'
    });

    const { response, where, countWhere } = await search(`?${params.toString()}`);

    expect(response.status).toBe(200);
    expect(where.status).toBe('ACTIVE');
    expect(where.difficulty).toBe('MEDIUM');
    // 1 query + 2 categories + 1 prep bound + 1 include + 2 excludes
    expect(andClauses(where)).toHaveLength(7);
    expect(countWhere).toEqual(where);
  });

  it('rejects invalid pagination', async () => {
    const { response } = await search('?pageSize=500');

    expect(response.status).toBe(400);
  });
});

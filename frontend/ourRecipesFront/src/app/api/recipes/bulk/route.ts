/**
 * POST /api/recipes/bulk
 * Bulk AI operations on recipes. Currently: `action: 'parse'`
 * (AI-reformats each recipe's text and re-syncs it).
 *
 * Port of `RecipeService.bulk_parse_recipes` (`routes/recipes.py` /
 * `services/recipe_service.py`). Response shape is Flask's flat
 * `{ processed, failed, total }` (not wrapped in `{ data }`) — the UI reads
 * `result.processed` directly (`RecipeManagement.handleBulkAction`) — plus
 * `remaining`, which Flask had no notion of (see {@link bulkParseRecipes}).
 *
 * DB-first / Telegram best-effort per-recipe (ARCHITECTURE §4.3): unlike
 * Flask (which only updates the DB when the Telegram edit succeeds), each
 * recipe's DB write always commits; a mirror failure just marks that recipe
 * `sync_status: 'pending_telegram'` rather than skipping it. A recipe still
 * counts as `failed` only when reformatting itself throws or the recipe is
 * missing required data — never solely because Telegram was unreachable.
 */
import { NextRequest } from 'next/server';
import { requireEditPermission, authErrorResponse } from '@/lib/auth';
import { handleApiError, BadRequestError } from '@/lib/utils/api-errors';
import { parseBody } from '@/lib/utils/api-validation';
import { bulkParseRecipes } from '@/lib/recipes/bulkParse';
import { logger } from '@/lib/logger';

const log = logger.child({ context: 'api/recipes/bulk:POST' });

/**
 * Every other AI route declares its own budget; this one did not, so it
 * inherited the project's 15s default and was killed mid-batch after a single
 * recipe. 300s matches `menus/generate-preview`, the longest-running route the
 * app already ships.
 */
export const maxDuration = 300;

/** Leave the response itself room to be written before the platform cuts us off. */
const RESPONSE_MARGIN_MS = 10_000;

interface BulkActionBody {
  action?: string;
  recipeIds?: number[];
}

export async function POST(request: NextRequest) {
  const deadline = Date.now() + maxDuration * 1000 - RESPONSE_MARGIN_MS;

  try {
    const auth = await requireEditPermission(request);
    if (!auth.ok) return authErrorResponse(auth);

    const body = await parseBody<BulkActionBody>(request);
    if (!body?.action || !Array.isArray(body.recipeIds)) {
      throw BadRequestError('Missing required fields');
    }
    if (!body.recipeIds.every((id) => typeof id === 'number')) {
      throw BadRequestError('recipeIds must be a list');
    }
    if (body.action !== 'parse') {
      throw BadRequestError('Invalid action');
    }

    return Response.json(await bulkParseRecipes(body.recipeIds, deadline));
  } catch (error) {
    log.error({ error }, 'Bulk action failed');
    return handleApiError(error);
  }
}

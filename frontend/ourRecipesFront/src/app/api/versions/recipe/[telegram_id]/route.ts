/**
 * GET  /api/versions/recipe/:telegram_id — version history for a recipe.
 * POST /api/versions/recipe/:telegram_id — create a version from client-supplied content.
 *
 * Port of `routes/versions.py` (`get_recipe_versions`, `create_recipe_version`).
 * The dynamic segment is named `telegram_id` (not `id`, despite Flask's
 * `<int:recipe_id>`) because it must match the sibling
 * `[telegram_id]/restore/[versionId]` route — Next.js requires every route
 * sharing this path position to use the same segment name — and because
 * that's what it actually is: `VersionHistory`/`RecipeDetails` in the UI
 * both call this with `recipe.telegram_id`, exactly like Flask's route
 * (which despite the `recipe_id` param name looks recipes up by
 * `telegram_id`, not the DB primary key).
 *
 * Response is a bare JSON array (not `{ data: [...] }`) — `VersionHistory.
 * fetchVersions` does `const data = await response.json(); ... setVersions(data)`.
 */
import { NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireEditPermission, authErrorResponse } from '@/lib/auth';
import { handleApiError, NotFoundError, BadRequestError } from '@/lib/utils/api-errors';
import { validateTelegramId, parseBody } from '@/lib/utils/api-validation';
import { cleanupOldVersions, versionToDict } from '@/lib/recipes/versioning';
import { logger } from '@/lib/logger';

const log = logger.child({ context: 'api/versions/recipe/[telegram_id]' });

async function findRecipeOrThrow(telegramId: number) {
  const recipe = await prisma.recipe.findUnique({
    where: { telegram_id: telegramId },
    select: { id: true }
  });
  if (!recipe) {
    throw NotFoundError('Recipe not found');
  }
  return recipe;
}

/** GET — read-only, so any authenticated session (including guests) may view it, matching Flask's plain `@jwt_required()`. */
export async function GET(
  request: NextRequest,
  { params }: { params: { telegram_id: string } }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return authErrorResponse(auth);

    const telegramId = validateTelegramId(params.telegram_id);
    const recipe = await findRecipeOrThrow(telegramId);

    // Matches Flask: cleanup runs on every GET, not just on writes.
    await cleanupOldVersions(prisma, recipe.id);

    const versions = await prisma.recipeVersion.findMany({
      where: { recipe_id: recipe.id },
      orderBy: { version_num: 'desc' }
    });

    return Response.json(versions.map(versionToDict));
  } catch (error) {
    log.error({ error }, 'Failed to get versions');
    return handleApiError(error);
  }
}

interface CreateVersionBody {
  content?: Record<string, unknown>;
  change_description?: string;
}

/** POST — a write, so it requires edit permission (stricter than Flask's plain `@jwt_required()`, per the Wave 1.B brief). */
export async function POST(
  request: NextRequest,
  { params }: { params: { telegram_id: string } }
) {
  try {
    const auth = await requireEditPermission(request);
    if (!auth.ok) return authErrorResponse(auth);

    const telegramId = validateTelegramId(params.telegram_id);
    const recipe = await findRecipeOrThrow(telegramId);

    const body = await parseBody<CreateVersionBody>(request);
    if (!body?.content) {
      throw BadRequestError('Missing content');
    }

    await prisma.$transaction(async (tx) => {
      await cleanupOldVersions(tx, recipe.id);

      await tx.recipeVersion.updateMany({
        where: { recipe_id: recipe.id, is_current: true },
        data: { is_current: false }
      });

      const { _max } = await tx.recipeVersion.aggregate({
        where: { recipe_id: recipe.id },
        _max: { version_num: true }
      });

      await tx.recipeVersion.create({
        data: {
          recipe_id: recipe.id,
          version_num: (_max.version_num ?? 0) + 1,
          content: body.content as Prisma.InputJsonValue,
          created_by: auth.session.sub,
          change_description: body.change_description ?? null,
          is_current: true
        }
      });
    });

    const versions = await prisma.recipeVersion.findMany({
      where: { recipe_id: recipe.id },
      orderBy: { version_num: 'desc' }
    });

    return Response.json(versions.map(versionToDict));
  } catch (error) {
    log.error({ error }, 'Failed to create version');
    return handleApiError(error);
  }
}

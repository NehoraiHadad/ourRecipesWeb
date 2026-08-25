/**
 * POST /api/recipes
 * Create a new recipe.
 *
 * Unified create endpoint (IMPLEMENTATION_PLAN Wave 1.B / Appendix A):
 * absorbs both Flask's `POST /recipes/create` (manual "new recipe" flow,
 * body `{ newText, image }`) and the dead `POST /send_recipe` the UI's
 * saved-AI-suggestion flow (`MealSuggestionForm.sendToTelegram`) still
 * calls — that flow already sends fully-formatted `{ newText, image }` too,
 * so one handler covers both. A caller with only structured fields
 * (`title`/`categories`/`ingredients`/`instructions`/...) can also skip
 * `newText` and let `formatRecipeText` build the canonical channel message.
 *
 * DB-first / Telegram best-effort (ARCHITECTURE §4.3, Stage H1): the DB row
 * is written first with a small negative placeholder `telegram_id` and
 * `sync_status: 'pending_telegram'`. The Telegram `sendMessage`/`sendPhoto`
 * mirror is only attempted afterwards; on success the row is patched with the
 * real `telegram_id` and `sync_status: 'synced'`. A mirror failure never
 * fails the request — the row simply stays pending for the periodic
 * reconcile job (`mirrorPending.ts`) to resolve later.
 */
import { NextRequest } from 'next/server';
import { requireEditPermission, authErrorResponse } from '@/lib/auth';
import { serializeRecipeWithRelations } from '@/lib/serializers/recipe';
import { createdResponse } from '@/lib/utils/api-response';
import { handleApiError, BadRequestError } from '@/lib/utils/api-errors';
import { parseBody } from '@/lib/utils/api-validation';
import { formatRecipeText, parseRecipeMessage } from '@/lib/recipes/parser';
import { decodeBase64Image, uploadRecipeImage, isHttpsImageUrl } from '@/lib/recipes/image';
import { mirrorCreateRecipe, generatePendingTelegramId } from '@/lib/recipes/mirror';
import { createRecipeRetryingId, applyCreateMirrorResult } from '@/lib/recipes/createRecipe';
import { logger } from '@/lib/logger';

const log = logger.child({ context: 'api/recipes:POST' });

interface CreateRecipeBody {
  newText?: string;
  title?: string;
  categories?: string[];
  ingredients?: string[];
  instructions?: string;
  preparationTime?: number;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  image?: string | null;
}

/** Builds the canonical channel text from the request body. `newText` wins when present. */
function resolveText(body: CreateRecipeBody): string | null {
  if (typeof body.newText === 'string' && body.newText.trim()) {
    return body.newText;
  }
  if (typeof body.title === 'string' && body.title.trim()) {
    return formatRecipeText({
      title: body.title,
      categories: body.categories,
      ingredients: body.ingredients,
      instructions: body.instructions,
      preparationTime: body.preparationTime,
      difficulty: body.difficulty
    });
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireEditPermission(request);
    if (!auth.ok) return authErrorResponse(auth);

    const body = await parseBody<CreateRecipeBody>(request);

    const text = resolveText(body);
    if (!text) {
      throw BadRequestError('No text provided');
    }

    const parsed = parseRecipeMessage(text);

    // AI-generated images (Wave 2A) already come back as a Blob URL — only a
    // manual upload still needs decode + upload.
    const submittedUrlImage = isHttpsImageUrl(body.image) ? body.image : null;
    const imageBuffer = submittedUrlImage ? null : decodeBase64Image(body.image);
    const imageUrl = submittedUrlImage
      ?? (imageBuffer ? await uploadRecipeImage(imageBuffer, `create-${Date.now()}`) : null);

    let recipe = await createRecipeRetryingId({
      telegramId: generatePendingTelegramId(),
      text,
      parsed,
      imageUrl,
      createdBy: auth.session.sub
    });

    const mirror = await mirrorCreateRecipe(text, imageBuffer ?? submittedUrlImage);
    recipe = await applyCreateMirrorResult(recipe, mirror);

    log.info(
      { recipeId: recipe.id, telegramId: recipe.telegram_id, syncStatus: recipe.sync_status },
      'Recipe created'
    );

    return createdResponse(serializeRecipeWithRelations(recipe));
  } catch (error) {
    log.error({ error }, 'Recipe creation failed');
    return handleApiError(error);
  }
}

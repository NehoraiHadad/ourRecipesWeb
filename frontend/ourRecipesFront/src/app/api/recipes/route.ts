/**
 * POST /api/recipes
 * Create a new recipe.
 *
 * Unified create endpoint (IMPLEMENTATION_PLAN Wave 1.B / Appendix A):
 * absorbs both Flask's `POST /recipes/create` (manual "new recipe" flow,
 * body `{ newText, image }`) and the dead `POST /send_recipe` the UI's
 * saved-AI-suggestion flow (`MealSuggestionForm.saveRecipe`) still
 * calls — that flow already sends fully-formatted `{ newText, image }` too,
 * so one handler covers both. A caller with only structured fields
 * (`title`/`categories`/`ingredients`/`instructions`/...) can also skip
 * `newText` and let `formatRecipeText` build the canonical channel message.
 *
 * The DB is the only store (the main Telegram channel this used to mirror to
 * is gone): the row is created with a freshly generated negative
 * `telegram_id`, which is the permanent key for its public URL, and that's
 * the whole write.
 */
import { NextRequest } from 'next/server';
import { requireEditPermission, authErrorResponse } from '@/lib/auth';
import { serializeRecipeWithRelations } from '@/lib/serializers/recipe';
import { createdResponse } from '@/lib/utils/api-response';
import { handleApiError, BadRequestError } from '@/lib/utils/api-errors';
import { parseBody } from '@/lib/utils/api-validation';
import { formatRecipeText, parseRecipeMessage } from '@/lib/recipes/parser';
import { decodeBase64Image, uploadRecipeImage, isHttpsImageUrl } from '@/lib/recipes/image';
import { generateInternalTelegramId } from '@/lib/recipes/recipeId';
import { createRecipeRetryingId } from '@/lib/recipes/createRecipe';
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

    const recipe = await createRecipeRetryingId({
      telegramId: generateInternalTelegramId(),
      text,
      parsed,
      imageUrl,
      createdBy: auth.session.sub
    });

    log.info({ recipeId: recipe.id, telegramId: recipe.telegram_id }, 'Recipe created');

    return createdResponse(serializeRecipeWithRelations(recipe));
  } catch (error) {
    log.error({ error }, 'Recipe creation failed');
    return handleApiError(error);
  }
}

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
 * DB-first / Telegram best-effort (ARCHITECTURE §4.3): the Telegram
 * `sendMessage`/`sendPhoto` mirror is attempted before the DB write so the
 * confirmed `message_id` can become `telegram_id` — but a mirror failure
 * never fails the request. It instead persists with a small negative
 * placeholder `telegram_id` and `sync_status: 'pending_telegram'`, which the
 * periodic reconcile job (Wave 1.D) is expected to resolve.
 */
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireEditPermission, authErrorResponse } from '@/lib/auth';
import { createdResponse } from '@/lib/utils/api-response';
import { handleApiError, BadRequestError } from '@/lib/utils/api-errors';
import { parseBody } from '@/lib/utils/api-validation';
import { formatRecipeText, parseRecipeMessage, type ParsedRecipe } from '@/lib/recipes/parser';
import { decodeBase64Image, uploadRecipeImage } from '@/lib/recipes/image';
import { buildVersionContent } from '@/lib/recipes/versioning';
import { mirrorCreateRecipe, generatePendingTelegramId } from '@/lib/recipes/mirror';
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

const MAX_TELEGRAM_ID_RETRIES = 3;

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

    const imageBuffer = decodeBase64Image(body.image);
    const imageUrl = imageBuffer ? await uploadRecipeImage(imageBuffer, `create-${Date.now()}`) : null;

    const mirror = await mirrorCreateRecipe(text, imageBuffer);

    const recipe = await createRecipeRetryingId({
      telegramId: mirror.telegramId,
      text,
      parsed,
      imageUrl,
      syncStatus: mirror.syncStatus,
      syncError: mirror.syncError,
      createdBy: auth.session.sub
    });

    log.info(
      { recipeId: recipe.id, telegramId: recipe.telegram_id, syncStatus: recipe.sync_status },
      'Recipe created'
    );

    return createdResponse(recipe);
  } catch (error) {
    log.error({ error }, 'Recipe creation failed');
    return handleApiError(error);
  }
}

interface CreateRecipeInput {
  telegramId: number;
  text: string;
  parsed: ParsedRecipe;
  imageUrl: string | null;
  syncStatus: 'synced' | 'pending_telegram';
  syncError: string | null;
  createdBy: string;
}

/**
 * Creates the `Recipe` (+ initial `RecipeVersion`). When the mirror failed
 * and left us with a placeholder negative `telegram_id`, an extremely rare
 * collision with another pending recipe is retried with a fresh id rather
 * than failing the whole request.
 */
async function createRecipeRetryingId(input: CreateRecipeInput) {
  let telegramId = input.telegramId;

  for (let attempt = 1; attempt <= MAX_TELEGRAM_ID_RETRIES; attempt++) {
    try {
      return await prisma.recipe.create({
        data: {
          telegram_id: telegramId,
          title: input.parsed.title || null,
          raw_content: input.text,
          ingredients: input.parsed.ingredients.length ? input.parsed.ingredients.join('||') : null,
          instructions: input.parsed.instructions || null,
          categories: input.parsed.categories.length ? input.parsed.categories.join(',') : null,
          image_url: input.imageUrl,
          preparation_time: input.parsed.preparationTime ?? null,
          difficulty: input.parsed.difficulty ?? null,
          is_parsed: input.parsed.isParsed,
          parse_errors: input.parsed.parseErrors.length ? input.parsed.parseErrors.join('||') : null,
          sync_status: input.syncStatus,
          sync_error: input.syncError,
          versions: {
            create: {
              version_num: 1,
              content: buildVersionContent({
                title: input.parsed.title || null,
                raw_content: input.text,
                categories: input.parsed.categories,
                ingredients: input.parsed.ingredients,
                instructions: input.parsed.instructions || null,
                preparation_time: input.parsed.preparationTime ?? null,
                difficulty: input.parsed.difficulty ?? null,
                image_url: input.imageUrl
              }),
              created_by: input.createdBy,
              change_description: 'Initial creation',
              is_current: true
            }
          }
        },
        include: {
          user_recipes: { select: { user_id: true, is_favorite: true } },
          versions: {
            select: { id: true, version_num: true, created_at: true, change_description: true },
            orderBy: { version_num: 'desc' },
            take: 5
          }
        }
      });
    } catch (error) {
      const isPlaceholderCollision =
        telegramId < 0 &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002';

      if (isPlaceholderCollision && attempt < MAX_TELEGRAM_ID_RETRIES) {
        log.warn({ attempt, telegramId }, 'Placeholder telegram_id collision — retrying with a new one');
        telegramId = generatePendingTelegramId();
        continue;
      }

      throw error;
    }
  }

  // Unreachable — the loop above always returns or throws.
  throw new Error('Failed to create recipe after retries');
}

/**
 * DB-first recipe creation (Stage H1).
 *
 * Split out of `app/api/recipes/route.ts` to keep that file focused on
 * request handling: this module owns the two-step Prisma write — create the
 * row under a placeholder `telegram_id`, then patch it once the Telegram
 * mirror attempt (`mirror.ts`) reports back.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { recipeWithRelationsSelect } from '@/lib/serializers/recipe';
import { recipeFieldsFromParsed } from '@/lib/recipes/recipeFields';
import { buildVersionContent } from '@/lib/recipes/versioning';
import { generatePendingTelegramId, type MirrorCreateResult } from '@/lib/recipes/mirror';
import type { ParsedRecipe } from '@/lib/recipes/parser';
import { logger } from '@/lib/logger';

const log = logger.child({ context: 'recipes/createRecipe' });

const MAX_TELEGRAM_ID_RETRIES = 3;

export interface CreateRecipeInput {
  telegramId: number;
  text: string;
  parsed: ParsedRecipe;
  imageUrl: string | null;
  createdBy: string;
}

/**
 * Creates the `Recipe` (+ initial `RecipeVersion`) DB-first, under a
 * placeholder negative `telegram_id` and `sync_status: 'pending_telegram'`
 * — the Telegram mirror is attempted only after this commits. An extremely
 * rare collision between two placeholder ids is retried with a fresh one
 * rather than failing the whole request.
 */
export async function createRecipeRetryingId(input: CreateRecipeInput) {
  let telegramId = input.telegramId;

  for (let attempt = 1; attempt <= MAX_TELEGRAM_ID_RETRIES; attempt++) {
    try {
      return await prisma.recipe.create({
        data: {
          telegram_id: telegramId,
          raw_content: input.text,
          ...recipeFieldsFromParsed(input.parsed),
          image_url: input.imageUrl,
          sync_status: 'pending_telegram',
          sync_error: null,
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
        select: recipeWithRelationsSelect
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

export type CreatedRecipe = Awaited<ReturnType<typeof createRecipeRetryingId>>;

/**
 * Patches the just-created (pending) row with the outcome of the Telegram
 * mirror attempt. On success the row adopts the real `telegram_id` and
 * `sync_status: 'synced'`; on failure it stays pending with `sync_error` set.
 * Either patch is itself best-effort: if it fails (e.g. a webhook race
 * already claimed the real `telegram_id`), the original pending row is
 * returned rather than failing the request.
 */
export async function applyCreateMirrorResult(
  recipe: CreatedRecipe,
  mirror: MirrorCreateResult
): Promise<CreatedRecipe> {
  try {
    if (mirror.ok && mirror.telegramId !== null) {
      return await prisma.recipe.update({
        where: { id: recipe.id },
        data: {
          telegram_id: mirror.telegramId,
          sync_status: 'synced',
          sync_error: null,
          last_sync: new Date()
        },
        select: recipeWithRelationsSelect
      });
    }

    return await prisma.recipe.update({
      where: { id: recipe.id },
      data: { sync_error: mirror.error },
      select: recipeWithRelationsSelect
    });
  } catch (error) {
    log.warn({ err: error, recipeId: recipe.id }, 'Could not patch recipe after mirror — leaving pending');
    return recipe;
  }
}

/**
 * Recipe creation.
 *
 * Split out of `app/api/recipes/route.ts` to keep that file focused on
 * request handling: this module owns the Prisma write. The generated
 * `telegram_id` is not a placeholder waiting to be swapped for a "real" one
 * — with the main channel gone, it IS the permanent id that keys the
 * recipe's public URL, chosen once here and never patched afterwards.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { recipeWithRelationsSelect } from '@/lib/serializers/recipe';
import { recipeFieldsFromParsed } from '@/lib/recipes/recipeFields';
import { buildVersionContent } from '@/lib/recipes/versioning';
import { generateInternalTelegramId } from '@/lib/recipes/recipeId';
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
 * Creates the `Recipe` (+ initial `RecipeVersion`) with a freshly generated
 * negative `telegram_id` — the permanent key for this recipe's public URL.
 * An extremely rare collision between two generated ids is retried with a
 * fresh one rather than failing the whole request.
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
        telegramId = generateInternalTelegramId();
        continue;
      }

      throw error;
    }
  }

  // Unreachable — the loop above always returns or throws.
  throw new Error('Failed to create recipe after retries');
}

export type CreatedRecipe = Awaited<ReturnType<typeof createRecipeRetryingId>>;

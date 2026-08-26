/**
 * Old-channel *edit* handling (Wave 5.3).
 *
 * Once intake records `{source_channel: 'old', source_message_id}`, an
 * `edited_channel_post` from the old channel can be matched back to its row.
 * The channel always wins — but a recipe that was also edited in the app
 * (`app_edited_at` set) gets `needs_review = true`, so the conflict is
 * something you *see* in the management screen instead of something you
 * discover a month later. The overwritten content is snapshotted as a
 * `RecipeVersion` first, so nothing is truly lost either way.
 */
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { reformatRecipe } from '@/lib/services/aiService';
import { parseRecipeMessage } from '@/lib/recipes/parser';
import { recipeFieldsFromParsed } from '@/lib/recipes/recipeFields';
import { snapshotVersion, type RecipeSnapshotSource } from '@/lib/recipes/versioning';
import { SOURCE_CHANNEL_OLD } from '@/lib/recipes/ingest';

const log = logger.child({ context: 'recipes/oldChannelEdit' });

/** Everything the edit path needs: a version snapshot plus conflict state. */
export interface OldChannelRecipeRow extends RecipeSnapshotSource {
  telegram_id: number;
  app_edited_at: Date | null;
}

/** The row an old-channel message id belongs to, or null when none claimed it. */
export async function findRecipeByOldChannelSource(
  sourceMessageId: number
): Promise<OldChannelRecipeRow | null> {
  return prisma.recipe.findUnique({
    where: {
      source_channel_source_message_id: {
        source_channel: SOURCE_CHANNEL_OLD,
        source_message_id: sourceMessageId
      }
    },
    select: {
      id: true,
      telegram_id: true,
      title: true,
      raw_content: true,
      categories: true,
      ingredients_list: true,
      instructions: true,
      preparation_time: true,
      difficulty: true,
      image_url: true,
      app_edited_at: true
    }
  });
}

export interface OldChannelEditResult {
  action: 'updated' | 'unchanged';
  recipeId: number;
  /** The public URL key — unchanged by the edit. */
  telegramId: number;
  needsReview: boolean;
}

/**
 * Applies an old-channel edit to its recipe row: Gemini reformats the new
 * text, the previous content is snapshotted, and the row is overwritten.
 *
 * Throws on AI failure — the webhook catches and still answers 200 (same
 * rationale as the new-post path: a Telegram retry would replay the failure).
 */
export async function applyOldChannelEdit(
  recipe: OldChannelRecipeRow,
  text: string
): Promise<OldChannelEditResult> {
  const formatted = (await reformatRecipe(text)).trim();
  if (!formatted) {
    throw new Error(`Gemini returned empty text for old-channel edit of recipe ${recipe.id}`);
  }

  if (formatted === recipe.raw_content) {
    log.debug({ recipeId: recipe.id }, 'Old-channel edit reformats to identical content — ignoring');
    return {
      action: 'unchanged',
      recipeId: recipe.id,
      telegramId: recipe.telegram_id,
      needsReview: false
    };
  }

  const needsReview = recipe.app_edited_at !== null;
  const parsed = parseRecipeMessage(formatted);

  await prisma.$transaction(async (tx) => {
    await snapshotVersion(tx, recipe, {
      createdBy: 'old_channel',
      changeDescription: 'Old-channel edit'
    });

    await tx.recipe.update({
      where: { id: recipe.id },
      data: {
        raw_content: formatted,
        ...recipeFieldsFromParsed(parsed),
        ...(needsReview ? { needs_review: true } : {}),
        last_sync: new Date()
      }
    });
  });

  log.info(
    { recipeId: recipe.id, telegramId: recipe.telegram_id, needsReview },
    'Old-channel edit applied to the recipe row'
  );

  return { action: 'updated', recipeId: recipe.id, telegramId: recipe.telegram_id, needsReview };
}

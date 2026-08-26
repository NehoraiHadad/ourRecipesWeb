/**
 * DB-first recipe update (Stage H1).
 *
 * Split out of `app/api/recipes/[telegram_id]/route.ts` to keep that file
 * focused on request handling: this module owns the two-step Prisma write —
 * snapshot the previous version and commit the new content as
 * `sync_status: 'pending_telegram'`, then patch the row once the Telegram
 * mirror attempt (`mirror.ts`) reports back.
 */
import { prisma } from '@/lib/prisma';
import { recipeWithRelationsSelect, type RecipeRow, type RecipeRelationsRow } from '@/lib/serializers/recipe';
import { recipeFieldsFromParsed } from '@/lib/recipes/recipeFields';
import { snapshotVersion, type RecipeSnapshotSource } from '@/lib/recipes/versioning';
import type { MirrorEditResult } from '@/lib/recipes/mirror';
import type { ParsedRecipe } from '@/lib/recipes/parser';

export interface CommitPendingUpdateInput {
  recipe: RecipeSnapshotSource;
  newText: string;
  parsed: ParsedRecipe;
  imageUrl: string | null;
  createdBy: string | null;
}

/**
 * Snapshots the recipe's current content into a new `RecipeVersion`, then
 * overwrites the row with the new content under `sync_status:
 * 'pending_telegram'` — committed before the Telegram mirror is even
 * attempted.
 */
export async function commitPendingUpdate(input: CommitPendingUpdateInput) {
  return prisma.$transaction(async (tx) => {
    await snapshotVersion(tx, input.recipe, {
      createdBy: input.createdBy,
      changeDescription: 'Recipe update'
    });

    return tx.recipe.update({
      where: { id: input.recipe.id },
      data: {
        raw_content: input.newText,
        ...recipeFieldsFromParsed(input.parsed),
        image_url: input.imageUrl,
        // Conflict tracking (Wave 5.3): an app edit marks the row, so a later
        // old-channel edit knows to flag it — and doubles as the reviewer's
        // "resolved" action, clearing any standing flag.
        app_edited_at: new Date(),
        needs_review: false,
        sync_status: 'pending_telegram',
        sync_error: null
      },
      select: recipeWithRelationsSelect
    });
  });
}

export type UpdatedRecipe = RecipeRow & RecipeRelationsRow;

/** Patches the pending row with the outcome of the Telegram mirror attempt. */
export async function applyEditMirrorResult(
  recipeId: number,
  mirror: MirrorEditResult
): Promise<UpdatedRecipe> {
  return prisma.recipe.update({
    where: { id: recipeId },
    data: { sync_status: mirror.syncStatus, sync_error: mirror.syncError },
    select: recipeWithRelationsSelect
  });
}

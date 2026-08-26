/**
 * Recipe update.
 *
 * Split out of `app/api/recipes/[telegram_id]/route.ts` to keep that file
 * focused on request handling: this module owns the Prisma write —
 * snapshot the previous version, then commit the new content in the same
 * transaction. Nothing is "pending" anymore now that there's no Telegram
 * mirror to wait on.
 */
import { prisma } from '@/lib/prisma';
import { recipeWithRelationsSelect, type RecipeRow, type RecipeRelationsRow } from '@/lib/serializers/recipe';
import { recipeFieldsFromParsed } from '@/lib/recipes/recipeFields';
import { snapshotVersion, type RecipeSnapshotSource } from '@/lib/recipes/versioning';
import type { ParsedRecipe } from '@/lib/recipes/parser';

export interface CommitUpdateInput {
  recipe: RecipeSnapshotSource;
  newText: string;
  parsed: ParsedRecipe;
  imageUrl: string | null;
  createdBy: string | null;
}

export type UpdatedRecipe = RecipeRow & RecipeRelationsRow;

/**
 * Snapshots the recipe's current content into a new `RecipeVersion`, then
 * overwrites the row with the new content — a single committed transaction.
 */
export async function commitUpdate(input: CommitUpdateInput): Promise<UpdatedRecipe> {
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
        needs_review: false
      },
      select: recipeWithRelationsSelect
    });
  });
}

/**
 * Pure row -> planned-update transformation for the Stage B3 backfill
 * (`scripts/backfillStructuredRecipes.ts`). Kept separate from the script so
 * it can be unit-tested without a database.
 *
 * Re-parses `raw_content` exactly like `ingestRecipeMessage` does (strip the
 * 🗑️ marker first, if present) and reduces it to the same structured field
 * set every write path uses (`recipeFieldsFromParsed`). Never touches
 * `raw_content`, `status`, sync fields, images, or telegram_id — those are
 * out of scope for this backfill.
 */
import { parseRecipeMessage } from '@/lib/recipes/parser';
import { isArchiveMarked, stripArchiveMarker } from '@/lib/recipes/ingest';
import { recipeFieldsFromParsed, type RecipeFieldsFromParsed } from '@/lib/recipes/recipeFields';

export interface BackfillSourceRow {
  id: number;
  telegram_id: number;
  raw_content: string;
  is_parsed: boolean;
}

export interface BackfillPlan {
  id: number;
  telegram_id: number;
  /** The exact `data` object the backfill would write. */
  fields: RecipeFieldsFromParsed;
  wasParsed: boolean;
  willBeParsed: boolean;
  ingredientCount: number;
}

/**
 * Plans the update for one recipe row, or `null` when there is nothing to
 * re-parse (blank `raw_content` — matches `ingestRecipeMessage`'s own
 * "nothing to store" case, so the backfill never fabricates content).
 */
export function planRecipeBackfill(row: BackfillSourceRow): BackfillPlan | null {
  const raw = row.raw_content ?? '';
  if (!raw.trim()) return null;

  const text = isArchiveMarked(raw) ? stripArchiveMarker(raw) : raw;
  const parsed = parseRecipeMessage(text);

  return {
    id: row.id,
    telegram_id: row.telegram_id,
    fields: recipeFieldsFromParsed(parsed),
    wasParsed: row.is_parsed,
    willBeParsed: parsed.isParsed,
    ingredientCount: parsed.structuredIngredients.length
  };
}

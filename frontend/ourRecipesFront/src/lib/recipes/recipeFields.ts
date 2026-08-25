/**
 * Prisma-ready `Recipe` field set derived from a `ParsedRecipe` (Stage B).
 *
 * The single place every write path — ingest, create, update, bulk reformat
 * and version restore — turns parsed recipe text into DB columns, so they
 * can never drift from each other. `ingredients_list` is the ONLY
 * ingredients storage from here on (STRUCTURE_REFACTOR_TASKS.md §B2): the
 * legacy `||`-separated `ingredients` text column is never written by this
 * helper, nor is `formatted_content` / `recipe_metadata` — both dead.
 */
import type { Prisma } from '@prisma/client';
import type { ParsedRecipe } from '@/lib/recipes/parser';

export interface RecipeFieldsFromParsed {
  title: string | null;
  instructions: string | null;
  categories: string;
  difficulty: ParsedRecipe['difficulty'] | null;
  preparation_time: number | null;
  is_parsed: boolean;
  parse_errors: string;
  ingredients_list: Prisma.InputJsonValue;
}

/** Builds the structured-column subset of a `Recipe` write from a parsed message. */
export function recipeFieldsFromParsed(parsed: ParsedRecipe): RecipeFieldsFromParsed {
  return {
    title: parsed.title || null,
    instructions: parsed.instructions || null,
    categories: parsed.categories.join(','),
    difficulty: parsed.difficulty ?? null,
    preparation_time: parsed.preparationTime ?? null,
    is_parsed: parsed.isParsed,
    parse_errors: parsed.parseErrors.join('||'),
    ingredients_list: parsed.structuredIngredients as unknown as Prisma.InputJsonValue
  };
}

/**
 * Who may see a recipe — one definition, one place to change it.
 *
 * Deleting a recipe is a soft delete (`status -> ARCHIVED`, see
 * `deleteRecipe.ts` and the 🗑️ channel-edit convention in `ingest.ts`), so the
 * row survives and "deleted" only means anything if *every* reader filters on
 * status. That rule used to live as a copy-pasted `status: 'ACTIVE'` literal in
 * each route, which meant a new read path silently defaulted to "return
 * everything, archived rows included" — how a deleted recipe reached a
 * generated menu.
 *
 * Two audiences, one rule:
 *  - `VISIBLE_RECIPE`   — humans: search, autocomplete, categories, fetch by id.
 *  - `PLANNABLE_RECIPE` — the menu agent and MCP: visible *and* structured,
 *    since planning a course needs real ingredients and instructions, not just
 *    a title.
 *
 * Spread it into a `where`; never restate the columns at the call site.
 */
import type { Prisma } from '@prisma/client';

/**
 * `Recipe.status` values.
 *
 * UPPERCASE is the single convention across the app — a row written as
 * lowercase `'active'` would be invisible to every reader below. The Prisma
 * column default matches (`@default("ACTIVE")`); ingestion still sets `status`
 * explicitly, since an upsert's update branch never sees a column default.
 */
export const RECIPE_STATUS_ACTIVE = 'ACTIVE';
export const RECIPE_STATUS_ARCHIVED = 'ARCHIVED';

/** Not deleted. The floor for anything a reader is allowed to reach. */
export const VISIBLE_RECIPE: Prisma.RecipeWhereInput = { status: RECIPE_STATUS_ACTIVE };

/** Visible *and* parsed into structured fields — what a menu can be built from. */
export const PLANNABLE_RECIPE: Prisma.RecipeWhereInput = { ...VISIBLE_RECIPE, is_parsed: true };

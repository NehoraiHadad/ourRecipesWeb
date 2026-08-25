import type { Difficulty, recipe as Recipe } from '../types';

/**
 * Maps a raw `Recipe` row as the Next API returns it (Prisma column names —
 * `raw_content`, `image_url`, `categories` as a comma-joined string,
 * `ingredients` as a `||`-joined string, `difficulty` as the `EASY|MEDIUM|HARD`
 * enum) onto the shape the UI components consume (`details`, `image`,
 * `categories: string[]`, lowercase difficulty).
 *
 * The API routes are a fixed contract and deliberately serve the raw row
 * (`GET`/`PUT /api/recipes/[telegram_id]`, `GET /api/recipes/search`,
 * `GET /api/recipes/manage`), so the translation lives here, on the client
 * side, in one place rather than in every component.
 */

export interface RawRecipeRow {
  id?: number;
  telegram_id?: number;
  title?: string | null;
  raw_content?: string | null;
  details?: string | null;
  categories?: string | string[] | null;
  ingredients?: string | string[] | null;
  instructions?: string | string[] | null;
  difficulty?: string | null;
  preparation_time?: number | null;
  is_parsed?: boolean | null;
  parse_errors?: string | null;
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
  created_by?: string | null;
  image?: string | null;
  image_url?: string | null;
  [key: string]: unknown;
}

function toArray(value: string | string[] | null | undefined, separator: string): string[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return value
    .split(separator)
    .map((part) => part.trim())
    .filter(Boolean);
}

function toIsoString(value: string | Date | null | undefined): string {
  if (!value) return new Date().toISOString();
  return value instanceof Date ? value.toISOString() : value;
}

export function toUiRecipe(row: RawRecipeRow | null | undefined): Recipe {
  const raw = row ?? {};
  const rawContent = raw.raw_content ?? '';

  return {
    ...raw,
    id: raw.id ?? 0,
    telegram_id: raw.telegram_id ?? 0,
    title: raw.title ?? '',
    raw_content: rawContent,
    // Flask sent `details: raw_content` verbatim (`Recipe.to_dict`), and the
    // format detection depends on it: `isRecipeUpdated` looks for the
    // "כותרת:" line, so stripping the first line here would push every
    // recipe onto the raw-text fallback instead of the structured display.
    details: raw.details ?? rawContent,
    categories: toArray(raw.categories, ','),
    ingredients: toArray(raw.ingredients, '||'),
    instructions: raw.instructions ?? undefined,
    difficulty: (raw.difficulty ? raw.difficulty.toLowerCase() : undefined) as Difficulty | undefined,
    preparation_time: raw.preparation_time ?? undefined,
    is_parsed: raw.is_parsed ?? false,
    parse_errors: raw.parse_errors ?? null,
    created_at: toIsoString(raw.created_at),
    updated_at: raw.updated_at ? toIsoString(raw.updated_at) : undefined,
    created_by: raw.created_by ?? undefined,
    image: raw.image ?? raw.image_url ?? undefined
  } as Recipe;
}

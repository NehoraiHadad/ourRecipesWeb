/**
 * `RecipeVersion` snapshotting and serialization.
 *
 * Port of the versioning half of `backend/ourRecipesBack/models/recipe.py`
 * (`Recipe.update_content`, `Recipe.cleanup_versions`) and
 * `backend/ourRecipesBack/models/version.py` (`RecipeVersion.to_dict`).
 *
 * `content` is stored as-is (Prisma `Json`), field-for-field matching the
 * Python model's `version_content` dict, **including** the `parsed_data`
 * duplication: `to_dict()` reads `preparation_time`/`difficulty` from
 * `content.parsed_data`, not from the top-level `content` fields — a Flask
 * quirk reproduced here rather than "fixed", since the manually-created
 * versions from `POST /versions/recipe/:id` (whatever `content` the client
 * sends, unprocessed) rely on exactly this behavior.
 *
 * One extension beyond the literal Python source: `content.image_url`. The
 * Python model snapshots `self.image_data` (raw bytes) into every version;
 * this project stores images as Blob URLs instead (ARCHITECTURE §5), so a
 * snapshot taken after that migration carries the URL in `content` instead.
 * `versionToDict` falls back to `content.image_url` whenever the row has no
 * legacy `image_data` blob.
 */
import type { Prisma, RecipeDifficulty } from '@prisma/client';

type VersioningDb = Pick<Prisma.TransactionClient, 'recipeVersion'>;

/** Recipe fields needed to snapshot its current state into a version row. */
export interface RecipeSnapshotSource {
  id: number;
  title: string | null;
  raw_content: string;
  categories: string | null;
  ingredients: string | null;
  instructions: string | null;
  preparation_time: number | null;
  difficulty: RecipeDifficulty | null;
  image_url: string | null;
}

export interface VersionContentInput {
  title: string | null;
  raw_content: string;
  categories: string[];
  ingredients: string[];
  instructions: string | null;
  preparation_time: number | null;
  difficulty: RecipeDifficulty | null;
  image_url?: string | null;
}

/** `Recipe.categories` string ("a, b") -> `string[]`. Mirrors the Python `categories` property getter. */
function splitCategories(value: string | null): string[] {
  if (!value) return [];
  return value.split(',').map((c) => c.trim()).filter(Boolean);
}

/** `Recipe.ingredients` string ("a||b") -> `string[]`. Mirrors the Python `ingredients` property getter. */
function splitIngredients(value: string | null): string[] {
  if (!value) return [];
  return value.split('||').filter(Boolean);
}

/** Builds the `RecipeVersion.content` JSON blob. Port of the `version_content` dict in `Recipe.update_content`. */
export function buildVersionContent(input: VersionContentInput): Prisma.InputJsonValue {
  return {
    title: input.title,
    raw_content: input.raw_content,
    categories: input.categories,
    ingredients: input.ingredients,
    instructions: input.instructions,
    preparation_time: input.preparation_time,
    difficulty: input.difficulty,
    image_url: input.image_url ?? null,
    parsed_data: {
      preparation_time: input.preparation_time,
      difficulty: input.difficulty,
      categories: input.categories,
      ingredients: input.ingredients,
      instructions: input.instructions
    }
  };
}

function recipeToVersionContentInput(recipe: RecipeSnapshotSource): VersionContentInput {
  return {
    title: recipe.title,
    raw_content: recipe.raw_content,
    categories: splitCategories(recipe.categories),
    ingredients: splitIngredients(recipe.ingredients),
    instructions: recipe.instructions,
    preparation_time: recipe.preparation_time,
    difficulty: recipe.difficulty,
    image_url: recipe.image_url
  };
}

/**
 * Deletes all but the 2 most recent versions of a recipe.
 * Port of `Recipe.cleanup_versions` — called *before* adding a new version,
 * so the recipe never holds more than 3 rows afterwards.
 */
export async function cleanupOldVersions(db: VersioningDb, recipeId: number): Promise<void> {
  const versions = await db.recipeVersion.findMany({
    where: { recipe_id: recipeId },
    orderBy: { version_num: 'desc' },
    select: { id: true }
  });

  if (versions.length >= 3) {
    const staleIds = versions.slice(2).map((v) => v.id);
    if (staleIds.length > 0) {
      await db.recipeVersion.deleteMany({ where: { id: { in: staleIds } } });
    }
  }
}

/**
 * Snapshots a recipe's **current** (pre-edit) state into a new `RecipeVersion`
 * row, demoting whatever version was previously `is_current`.
 *
 * Port of `Recipe.update_content`'s versioning half: called with the recipe
 * row as it stood *before* the caller applies its update, so the resulting
 * version captures what is about to be overwritten (an audit trail of past
 * states, not of the live content).
 */
export async function snapshotVersion(
  db: VersioningDb,
  recipe: RecipeSnapshotSource,
  opts: { createdBy?: string | null; changeDescription?: string | null }
): Promise<void> {
  await cleanupOldVersions(db, recipe.id);

  await db.recipeVersion.updateMany({
    where: { recipe_id: recipe.id, is_current: true },
    data: { is_current: false }
  });

  const { _max } = await db.recipeVersion.aggregate({
    where: { recipe_id: recipe.id },
    _max: { version_num: true }
  });
  const nextVersionNum = (_max.version_num ?? 0) + 1;

  await db.recipeVersion.create({
    data: {
      recipe_id: recipe.id,
      version_num: nextVersionNum,
      content: buildVersionContent(recipeToVersionContentInput(recipe)),
      created_by: opts.createdBy ?? null,
      change_description: opts.changeDescription ?? null,
      is_current: true
    }
  });
}

/** Raw shape needed to serialize one `RecipeVersion` row — matches what Prisma returns for the model. */
export interface RecipeVersionRow {
  id: number;
  version_num: number | null;
  content: Prisma.JsonValue;
  created_at: Date;
  created_by: string | null;
  change_description: string | null;
  is_current: boolean;
  image_data: Buffer | Uint8Array | null;
}

/**
 * Serializes one `RecipeVersion` row for the API — field-for-field port of
 * `RecipeVersion.to_dict()` (see module docstring for the `parsed_data`
 * quirk and the `image_url` fallback).
 */
export function versionToDict(version: RecipeVersionRow) {
  const content = (version.content ?? {}) as Record<string, unknown>;
  const parsedData = (content.parsed_data ?? {}) as Record<string, unknown>;
  const preparationTime = (parsedData.preparation_time as number | undefined) ?? null;
  const difficulty = (parsedData.difficulty as string | undefined) ?? null;

  let image: string | null = null;
  if (version.image_data) {
    const buf = Buffer.isBuffer(version.image_data) ? version.image_data : Buffer.from(version.image_data);
    image = `data:image/jpeg;base64,${buf.toString('base64')}`;
  } else if (typeof content.image_url === 'string' && content.image_url) {
    image = content.image_url;
  }

  return {
    id: version.id,
    version_num: version.version_num,
    content: {
      title: (content.title as string | null | undefined) ?? null,
      raw_content: (content.raw_content as string | null | undefined) ?? null,
      categories: (content.categories as string[] | undefined) ?? [],
      ingredients: (content.ingredients as string[] | undefined) ?? [],
      instructions: (content.instructions as string | undefined) ?? '',
      preparation_time: preparationTime,
      difficulty
    },
    created_at: version.created_at ? version.created_at.toISOString() : null,
    created_by: version.created_by,
    change_description: version.change_description,
    is_current: version.is_current,
    image,
    preparation_time: preparationTime,
    difficulty
  };
}

// נוסיף קובץ עזר לטיפול ברמות קושי
import type { DifficultyValue } from '@/lib/serializers/recipeTypes';
import type { RecipeDifficultyValue } from '@/lib/recipes/parserLabels';

export const difficultyDisplay = {
  EASY: "קל",
  MEDIUM: "בינוני",
  HARD: "מורכב",
} as const;

export const difficultyVariants = {
  EASY: "success",
  MEDIUM: "default",
  HARD: "error",
} as const;

export const difficultyOptions = [
  { value: "EASY", label: "קל" },
  { value: "MEDIUM", label: "בינוני" },
  { value: "HARD", label: "מורכב" },
] as const;

/** The Hebrew label for the contract's lowercase difficulty (`'easy'` -> "קל"). */
export function difficultyLabel(value: DifficultyValue | null | undefined): string | null {
  if (!value) return null;
  return difficultyDisplay[value.toUpperCase() as keyof typeof difficultyDisplay] ?? null;
}

/** The contract's lowercase difficulty as the parser/formatter enum value. */
export function toDifficultyEnum(
  value: DifficultyValue | null | undefined
): RecipeDifficultyValue | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  return upper in difficultyDisplay ? (upper as RecipeDifficultyValue) : undefined;
}

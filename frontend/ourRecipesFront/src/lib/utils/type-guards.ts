/**
 * TypeScript type guards
 */
import { RecipeDifficulty, DietaryType } from '@prisma/client';

/**
 * Check if value is RecipeDifficulty
 */
export function isRecipeDifficulty(value: any): value is RecipeDifficulty {
  return (
    value === RecipeDifficulty.EASY ||
    value === RecipeDifficulty.MEDIUM ||
    value === RecipeDifficulty.HARD
  );
}

/**
 * Check if value is DietaryType
 */
export function isDietaryType(value: any): value is DietaryType {
  return (
    value === DietaryType.MEAT ||
    value === DietaryType.DAIRY ||
    value === DietaryType.PAREVE
  );
}

/**
 * Assert value is not null/undefined
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message = 'Value is null or undefined'
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
}

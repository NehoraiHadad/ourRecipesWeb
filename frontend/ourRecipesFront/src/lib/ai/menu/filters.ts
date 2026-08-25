/**
 * The one recipe filter every menu tool starts from, so a draft or deleted
 * recipe can never be searched, inspected, or approved into a menu.
 */
import type { Prisma } from '@prisma/client';

export const PLANNABLE_RECIPE: Prisma.RecipeWhereInput = { status: 'ACTIVE', is_parsed: true };

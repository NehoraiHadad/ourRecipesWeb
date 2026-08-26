/**
 * Who may see a place — the places-side twin of `recipes/visibility.ts`.
 *
 * Places soft-delete too, via their own column (`is_deleted`, set by
 * `DELETE /api/places/:id` — places are app-authored only since Wave 5).
 * The column differs from the recipe one for
 * historical reasons; the *rule* should not, so it lives in one constant here
 * and every reader spreads it in rather than restating `is_deleted: false`.
 */
import type { Prisma } from '@prisma/client';

/** Not deleted. The floor for anything a reader is allowed to reach. */
export const VISIBLE_PLACE: Prisma.PlaceWhereInput = { is_deleted: false };

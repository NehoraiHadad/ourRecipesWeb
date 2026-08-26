/**
 * Internal id sequence for `Recipe.telegram_id` (Wave 5.4).
 *
 * `telegram_id` is the public `/recipe/<id>` URL key. It once was a real
 * main-channel message id; new recipes now draw from this generator instead.
 * Negative on purpose: real Telegram message ids are always positive, so a
 * generated id can never collide with a legacy one.
 */

/**
 * Generates a fresh internal `telegram_id`.
 *
 * The column is a Postgres `int4` (max ±2^31), so a millisecond epoch
 * timestamp (~1.7e12) would overflow it — this folds `Date.now()` into a
 * 0..999_999_999 window, adds a small random offset against same-millisecond
 * collisions, and negates it. Callers that insert with it should retry with a
 * fresh id on a unique-constraint failure (see `createRecipeRetryingId`).
 */
export function generateInternalTelegramId(): number {
  const base = Date.now() % 1_000_000_000;
  const jitter = Math.floor(Math.random() * 1000);
  return -(base + jitter + 1);
}

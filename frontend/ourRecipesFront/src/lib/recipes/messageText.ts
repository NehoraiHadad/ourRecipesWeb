/**
 * Small text helpers shared by the recipe parser, ported from the Python
 * backend (`RecipeService.get_first_line` / `get_details`) together with the
 * `str.strip(chars)` semantics they rely on.
 */

/**
 * Strip any leading/trailing characters that appear in `chars`, matching
 * Python's `str.strip(chars)` (which strips a *set* of characters, not a
 * literal prefix/suffix).
 */
export function pyStrip(value: string, chars: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && chars.includes(value[start])) start++;
  while (end > start && chars.includes(value[end - 1])) end--;
  return value.slice(start, end);
}

/** Python's `str.lstrip(chars)` — strips a set of characters from the left only. */
export function pyLStrip(value: string, chars: string): string {
  let start = 0;
  while (start < value.length && chars.includes(value[start])) start++;
  return value.slice(start);
}

/**
 * Port of `RecipeService.get_first_line`:
 * `text.split("\n", 1)[0].strip("*:")`
 */
export function getFirstLine(text: string): string {
  if (!text) return '';
  const firstLine = text.split('\n')[0];
  return pyStrip(firstLine, '*:');
}

/**
 * Port of `RecipeService.get_details`: everything after the first line.
 * Python uses `str.splitlines()`; this uses a plain `\n` split, which is
 * equivalent for the `\n`-only Telegram message bodies this operates on.
 */
export function getDetails(text: string): string {
  if (!text) return '';
  const parts = text.split('\n');
  return parts.length > 1 ? parts.slice(1).join('\n') : '';
}

/**
 * Resolve a recipe image value into a usable `<img src>`.
 *
 * `image_url` historically carried raw base64 (the Flask era) and today
 * carries either a `data:` URI or an https Blob URL. Wrapping an https URL in
 * a base64 prefix — the pre-fix behavior — produced a broken image in the
 * recipe modal while the list (which used the value as-is) rendered fine.
 */
export function imageSrc(value: string): string {
  if (value.startsWith('data:') || value.startsWith('http')) return value;
  return `data:image/jpeg;base64,${value}`;
}

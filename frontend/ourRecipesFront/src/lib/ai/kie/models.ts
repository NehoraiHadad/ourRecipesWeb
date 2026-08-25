/**
 * KIE model ids and per-model input builders, per the Wave 1 decision table
 * (`docs/architecture/AI_UPGRADE_TASKS.md`): `nano-banana-2` replaces the
 * HuggingFace SDXL recipe-image path, `nano-banana-pro` replaces the direct
 * Gemini infographic call (same underlying model, cheaper via KIE).
 */

/** Recipe image generation/editing — `docs/architecture/KIE_INTEGRATION_RESEARCH.md` §4. */
export const KIE_IMAGE_MODEL = 'nano-banana-2';

/** Infographic generation (Hebrew text-in-image) — same model family as the direct Gemini fallback. */
export const KIE_INFOGRAPHIC_MODEL = 'nano-banana-pro';

export interface NanoBanana2Options {
  /** Public URL(s) of an existing image, for image-to-image edits instead of text-to-image. */
  imageInput?: string[];
}

/** Builds the `input` object for {@link KIE_IMAGE_MODEL}. */
export function nanoBanana2Input(prompt: string, options: NanoBanana2Options = {}): Record<string, unknown> {
  const input: Record<string, unknown> = {
    prompt,
    output_resolution: '2k'
  };
  if (options.imageInput && options.imageInput.length > 0) {
    input.image_input = options.imageInput;
  }
  return input;
}

/** Builds the `input` object for {@link KIE_INFOGRAPHIC_MODEL}. */
export function nanoBananaProInput(prompt: string): Record<string, unknown> {
  return { prompt };
}

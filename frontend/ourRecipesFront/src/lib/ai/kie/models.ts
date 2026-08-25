/**
 * KIE model ids and per-model input builders.
 *
 * User decision (2026-08-25): `gpt-image-2-text-to-image` is the default for
 * both recipe images and infographics — 4x cheaper than `nano-banana-pro`
 * ($0.03–0.05 vs $0.12 per image) and the typography leader. The nano-banana
 * family remains selectable via env in case GPT Image 2's Hebrew text
 * rendering disappoints in practice (it is undocumented by OpenAI).
 *
 * Ids are read lazily (not as module-load constants) so a test or a runtime
 * env change takes effect without re-importing the module.
 */

/** Recipe image generation — `docs/architecture/KIE_INTEGRATION_RESEARCH.md` §4. */
export function getKieImageModel(): string {
  return process.env.KIE_IMAGE_MODEL || 'gpt-image-2-text-to-image';
}

/** Infographic generation (Hebrew text-in-image). */
export function getKieInfographicModel(): string {
  return process.env.KIE_INFOGRAPHIC_MODEL || 'gpt-image-2-text-to-image';
}

export interface KieImageOptions {
  /** Resolution tier: `'1K' | '2K' | '4K'` — normalized per model family. */
  resolution?: string;
  /** e.g. `'3:2'` (photo), `'2:3'` (infographic). gpt-image-2 family only. */
  aspectRatio?: string;
  /** Source image URL(s) for image-to-image — nano-banana family only. */
  imageInput?: string[];
}

/**
 * Builds the `input` object for an image-generation KIE model. The two
 * supported families spell their parameters differently:
 *  - `gpt-image-2-*`: `{ prompt, aspect_ratio?, resolution?: '1K'|'2K'|'4K' }`
 *    (per docs.kie.ai; `auto` aspect ratio only supports 1K, so a resolution
 *    above 1K must come with an explicit aspect ratio)
 *  - `nano-banana-*`: `{ prompt, image_input?, output_resolution?: '2k' }`
 */
export function kieImageInput(
  model: string,
  prompt: string,
  options: KieImageOptions = {}
): Record<string, unknown> {
  const input: Record<string, unknown> = { prompt };
  if (model.startsWith('gpt-image-2')) {
    if (options.aspectRatio) input.aspect_ratio = options.aspectRatio;
    if (options.resolution) input.resolution = options.resolution.toUpperCase();
    return input;
  }
  if (options.imageInput && options.imageInput.length > 0) {
    input.image_input = options.imageInput;
  }
  if (options.resolution) {
    input.output_resolution = options.resolution.toLowerCase();
  }
  return input;
}

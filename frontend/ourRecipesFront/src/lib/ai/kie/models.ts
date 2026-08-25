/**
 * KIE model ids and per-model input builders, per the Wave 2A decision table
 * (`docs/architecture/AI_UPGRADE_TASKS.md`): `nano-banana-2` replaces the
 * HuggingFace SDXL recipe-image path, `nano-banana-pro` replaces the direct
 * Gemini infographic call (same underlying model, cheaper via KIE).
 *
 * Both ids are overridable via env — a pending Hebrew A/B may swap the image
 * model for `gpt-image-2-text-to-image` (4x cheaper if Hebrew renders well;
 * see `.env.example`). Read lazily (not as module-load constants) so a test
 * or a runtime env change takes effect without re-importing the module.
 */

/** Recipe image generation/editing — `docs/architecture/KIE_INTEGRATION_RESEARCH.md` §4. */
export function getKieImageModel(): string {
  return process.env.KIE_IMAGE_MODEL || 'nano-banana-2';
}

/** Infographic generation (Hebrew text-in-image) — same model family as the direct Gemini fallback. */
export function getKieInfographicModel(): string {
  return process.env.KIE_INFOGRAPHIC_MODEL || 'nano-banana-pro';
}

export interface KieImageOptions {
  /** Public URL(s) of an existing image, for image-to-image edits instead of text-to-image. */
  imageInput?: string[];
  /** e.g. `'2k'` — every candidate model (nano-banana family, gpt-image-2) accepts this tier name. */
  outputResolution?: string;
}

/**
 * Builds the `input` object for an image-generation KIE model.
 *
 * Kept model-agnostic: every candidate model considered for `KIE_IMAGE_MODEL`
 * / `KIE_INFOGRAPHIC_MODEL` (`nano-banana-2`, `nano-banana-pro`,
 * `gpt-image-2-text-to-image`) accepts this same `{ prompt, image_input?,
 * output_resolution? }` shape, so the builder does not need to branch on the
 * model id.
 */
export function kieImageInput(prompt: string, options: KieImageOptions = {}): Record<string, unknown> {
  const input: Record<string, unknown> = { prompt };
  if (options.imageInput && options.imageInput.length > 0) {
    input.image_input = options.imageInput;
  }
  if (options.outputResolution) {
    input.output_resolution = options.outputResolution;
  }
  return input;
}

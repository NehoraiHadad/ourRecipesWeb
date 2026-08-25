/**
 * Recipe infographic generation. Primary path: KIE (`getKieInfographicModel()`,
 * default `gpt-image-2-text-to-image` — typography leader, 4x cheaper,
 * cheaper + unified billing). Falls back to a direct Gemini call
 * (`gemini-3-pro-image-preview`, the pre-Wave-2 implementation) whenever the
 * KIE path throws — infographics are Hebrew-text-in-image, the more
 * failure-sensitive of the two image tasks, so a newer integration issue
 * should never take the feature down entirely.
 *
 * Split out of `imageTasks.ts` (re-exported from there) to keep both files
 * under the project's 150-line guideline.
 */
import { GoogleGenAI } from '@google/genai';
import { logger } from '@/lib/logger';
import { createTask, pollTaskResult, getKieInfographicModel, kieImageInput } from '@/lib/ai/kie';
import { storeGeneratedImage } from '@/lib/ai/media';
import { uploadRecipeImage } from '@/lib/recipes/image';

const log = logger.child({ context: 'ai/infographicTask' });

const GEMINI_FALLBACK_MODEL = 'gemini-3-pro-image-preview';

function buildInfographicPrompt(recipeContent: string): string {
  return `Generate an image:

Create a beautiful Hebrew recipe infographic for this recipe:

${recipeContent}

Style: Modern infographic design, warm appetizing colors, clean layout.
`;
}

/**
 * Generates a Hebrew recipe infographic. Tries KIE first; on any failure,
 * logs a warning and falls back to a direct Gemini call whose base64 output
 * is also uploaded to Blob, so both paths return the same Blob-URL shape.
 */
export async function generateRecipeInfographic(recipeContent: string): Promise<string> {
  log.debug({ contentLength: recipeContent.length }, 'Generating recipe infographic');

  const prompt = buildInfographicPrompt(recipeContent);

  try {
    const model = getKieInfographicModel();
    const { taskId } = await createTask(model, kieImageInput(model, prompt, { resolution: '2K', aspectRatio: '2:3' }));
    const [resultUrl] = await pollTaskResult(taskId);
    if (!resultUrl) {
      throw new Error(`KIE task ${taskId} succeeded with no result URL`);
    }

    const blobUrl = await storeGeneratedImage(resultUrl, `infographic-${taskId}`);
    log.info({ taskId, model }, 'Recipe infographic generated via KIE');
    return blobUrl;
  } catch (error) {
    log.warn({ err: error }, 'KIE infographic generation failed, falling back to direct Gemini');
    return infographicViaGemini(prompt);
  }
}

/**
 * Pre-Wave-2 direct-Gemini implementation, kept as the KIE fallback. Uses
 * `GOOGLE_API_KEY_NANO_BANANA` (a separate, billing-enabled project) when
 * configured, falling back to `GOOGLE_API_KEY` — this model requires a paid
 * plan and is not available on the free tier.
 */
async function infographicViaGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY_NANO_BANANA || process.env.GOOGLE_API_KEY || '';
  const client = new GoogleGenAI({ apiKey });

  const response = await client.models.generateContent({
    model: GEMINI_FALLBACK_MODEL,
    contents: prompt,
    config: { responseModalities: ['IMAGE'] }
  });

  const base64 = response.data;
  if (!base64) {
    throw new Error('No image generated in Gemini fallback response');
  }

  const buffer = Buffer.from(base64, 'base64');
  const blobUrl = await uploadRecipeImage(buffer, `infographic-fallback-${Date.now()}`);
  if (!blobUrl) {
    throw new Error('Failed to upload Gemini fallback infographic to Blob');
  }

  log.info('Recipe infographic generated via Gemini fallback');
  return blobUrl;
}

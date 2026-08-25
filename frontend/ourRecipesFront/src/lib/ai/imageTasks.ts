/**
 * Recipe image generation — KIE (`getKieImageModel()`, default
 * `gpt-image-2-text-to-image`), replacing the retired HuggingFace SDXL path
 * (`docs/architecture/AI_UPGRADE_TASKS.md` §2A).
 *
 * Flow: create a KIE task, poll it to a result URL, then copy that URL into
 * Vercel Blob immediately (`storeGeneratedImage` — KIE only retains results
 * for 14 days, and its temporary links expire after 20 minutes). Returns the
 * permanent Blob URL, not a data URI.
 *
 * The infographic task lives in the sibling `./infographicTask` (KIE +
 * direct-Gemini fallback) but is re-exported here so callers only need one
 * import path, per `AI_UPGRADE_TASKS.md`.
 */
import { logger } from '@/lib/logger';
import { createTask, pollTaskResult, getKieImageModel, kieImageInput } from '@/lib/ai/kie';
import { storeGeneratedImage } from '@/lib/ai/media';
import { parseRecipeMessage, getFirstLine } from '@/lib/recipes/parser';

export { generateRecipeInfographic } from './infographicTask';

const log = logger.child({ context: 'ai/imageTasks' });

/** Last-resort truncation when no title can be extracted at all. */
const MAX_FALLBACK_TITLE_CHARS = 100;

/**
 * Derives the dish name for the image prompt: the structured parser's title
 * (label-aware first line) first, then the raw first line, and only as a
 * last resort the whole trimmed content. Deliberately no generic `'dish'`
 * placeholder — a degraded prompt should still reflect the actual recipe
 * text. Whatever is found is capped at 100 characters, so a recipe with no
 * recognizable title line never balloons the prompt with its full body.
 */
function deriveDishName(recipeContent: string): string {
  const trimmed = recipeContent.trim();
  if (!trimmed) return '';

  const { title } = parseRecipeMessage(trimmed);
  const dishName = title.trim() || getFirstLine(trimmed).trim() || trimmed;

  return dishName.slice(0, MAX_FALLBACK_TITLE_CHARS).trim();
}

function buildImagePrompt(recipeContent: string): string {
  const dishName = deriveDishName(recipeContent);
  return `professional food photography of ${dishName}, appetizing, well-lit, high quality, restaurant style`;
}

/**
 * Generates a recipe photo via KIE and returns its permanent Blob URL.
 */
export async function generateRecipeImage(recipeContent: string): Promise<string> {
  log.debug({ contentLength: recipeContent.length }, 'Generating recipe image');

  const prompt = buildImagePrompt(recipeContent);
  const model = getKieImageModel();

  // 1K: a 2K GPT Image 2 PNG runs ~10MB — past the Blob store's cap and far
  // more than a recipe card ever renders.
  const { taskId } = await createTask(model, kieImageInput(model, prompt, { resolution: '1K', aspectRatio: '3:2' }));
  const [resultUrl] = await pollTaskResult(taskId);
  if (!resultUrl) {
    throw new Error(`KIE task ${taskId} succeeded with no result URL`);
  }

  const blobUrl = await storeGeneratedImage(resultUrl, `image-${taskId}`);

  log.info({ taskId, model }, 'Recipe image generated');
  return blobUrl;
}

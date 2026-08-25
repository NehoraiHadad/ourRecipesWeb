/**
 * AI Service facade.
 *
 * Text tasks (suggestion / reformat / refine / optimize-steps) now live in
 * `src/lib/ai/gemini/textTasks.ts`, re-exported here unchanged so routes and
 * existing test mocks (`vi.mock('@/lib/services/aiService', ...)`) keep
 * working. Image tasks stay in this file — Wave 2 replaces them with the KIE
 * pipeline (`AI_UPGRADE_TASKS.md`).
 */
import { GoogleGenAI } from '@google/genai';
import { logger } from '@/lib/logger';

export {
  generateRecipeSuggestion,
  reformatRecipe,
  refineRecipe,
  optimizeRecipeSteps
} from '@/lib/ai/gemini/textTasks';

/**
 * Generate recipe image using HuggingFace.
 */
export async function generateRecipeImage(recipeContent: string): Promise<string> {
  logger.debug({ contentLength: recipeContent.length }, 'Generating recipe image');

  const HF_TOKEN = process.env.HUGGINGFACE_TOKEN;
  if (!HF_TOKEN) {
    throw new Error('HuggingFace token not configured');
  }

  // Extract recipe name for prompt
  const titleMatch = recipeContent.match(/(?:🍳|##)\s*(.+)/);
  const recipeName = titleMatch ? titleMatch[1].trim() : 'dish';

  const prompt = `professional food photography of ${recipeName}, appetizing, well-lit, high quality, restaurant style`;

  const response = await fetch(
    'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: prompt,
        options: { wait_for_model: true }
      })
    }
  );

  if (!response.ok) {
    throw new Error(`HuggingFace API error: ${response.statusText}`);
  }

  const blob = await response.blob();
  const buffer = Buffer.from(await blob.arrayBuffer());
  const base64 = buffer.toString('base64');

  logger.info('Recipe image generated');
  return base64;
}

/**
 * Generate a Hebrew recipe infographic image using Gemini 3 Pro Image
 * ("Nano Banana Pro"). Port of `AIService.generate_recipe_infographic`.
 *
 * Uses `GOOGLE_API_KEY_NANO_BANANA` (a separate, billing-enabled project)
 * when configured, falling back to the regular `GOOGLE_API_KEY` — this
 * model requires a paid plan and is not available on the free tier.
 */
export async function generateRecipeInfographic(recipeContent: string): Promise<string> {
  logger.debug({ contentLength: recipeContent.length }, 'Generating recipe infographic');

  const apiKey = process.env.GOOGLE_API_KEY_NANO_BANANA || process.env.GOOGLE_API_KEY || '';
  const client = new GoogleGenAI({ apiKey });

  const prompt = `Generate an image:

Create a beautiful Hebrew recipe infographic for this recipe:

${recipeContent}

Style: Modern infographic design, warm appetizing colors, clean layout.
`;

  const response = await client.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: prompt,
    config: {
      responseModalities: ['IMAGE']
    }
  });

  const base64 = response.data;
  if (!base64) {
    throw new Error('No image generated in response');
  }

  logger.info('Recipe infographic generated');
  return base64;
}

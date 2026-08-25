/**
 * AI Service using Google Gemini and HuggingFace
 */
import { GoogleGenAI } from '@google/genai';
import { logger } from '@/lib/logger';

const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY || '' });

/**
 * Generate recipe suggestion based on preferences
 */
export async function generateRecipeSuggestion(params: {
  ingredients?: string;
  mealType?: string[];
  quickPrep?: boolean;
  childFriendly?: boolean;
  additionalRequests?: string;
}): Promise<string> {
  logger.debug(params, 'Generating recipe suggestion');

  const prompt = `
אתה עוזר מטבח מומחה. צור מתכון מפורט על בסיס המידע הבא:

${params.ingredients ? `רכיבים זמינים: ${params.ingredients}` : ''}
${params.mealType?.length ? `סוג ארוחה: ${params.mealType.join(', ')}` : ''}
${params.quickPrep ? 'דרישה: הכנה מהירה (עד 30 דקות)' : ''}
${params.childFriendly ? 'דרישה: ידידותי לילדים' : ''}
${params.additionalRequests ? `בקשות נוספות: ${params.additionalRequests}` : ''}

פורמט התגובה:
🍳 [שם המתכון]

⏱️ זמן הכנה: [X דקות]
👥 מנות: [X]
🔥 רמת קושי: [קל/בינוני/מאתגר]

📝 רכיבים:
- [רכיב 1]
- [רכיב 2]
...

👨‍🍳 אופן ההכנה:
1. [שלב 1]
2. [שלב 2]
...

💡 טיפים:
- [טיפ 1]
`;

  const response = await genAI.models.generateContent({
    model: 'gemini-2.0-flash-exp',
    contents: prompt
  });

  logger.info('Recipe suggestion generated');
  return response.text || '';
}

/**
 * Generate recipe image using HuggingFace
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

/**
 * Reformat recipe text
 */
export async function reformatRecipe(text: string): Promise<string> {
  logger.debug({ textLength: text.length }, 'Reformatting recipe');

  const prompt = `
עצב מחדש את המתכון הבא בפורמט מסודר וברור:

${text}

פורמט נדרש:
🍳 [שם המתכון]

⏱️ זמן הכנה: [X דקות]
👥 מנות: [X]

📝 רכיבים:
- [רכיב + כמות]
...

👨‍🍳 הוראות הכנה:
1. [שלב מפורט]
...

אל תוסיף מידע שלא מופיע במתכון המקורי.
`;

  const response = await genAI.models.generateContent({
    model: 'gemini-2.0-flash-exp',
    contents: prompt
  });

  logger.info('Recipe reformatted');
  return response.text || '';
}

/**
 * Refine recipe based on feedback
 */
export async function refineRecipe(recipeText: string, refinementRequest: string): Promise<string> {
  logger.debug({ refinementRequest }, 'Refining recipe');

  const prompt = `
המתכון הנוכחי:
${recipeText}

בקשת השיפור:
${refinementRequest}

שפר את המתכון על פי הבקשה, אך שמור על המבנה והפורמט המקורי.
`;

  const response = await genAI.models.generateContent({
    model: 'gemini-2.0-flash-exp',
    contents: prompt
  });

  logger.info('Recipe refined');
  return response.text || '';
}

/**
 * Optimize recipe steps
 */
export async function optimizeRecipeSteps(recipeText: string): Promise<string> {
  logger.debug('Optimizing recipe steps');

  const prompt = `
נתח את המתכון הבא והציע אופטימיזציה של השלבים:

${recipeText}

התמקד ב:
1. סדר יעיל של השלבים
2. הכנות מקבילות (מה אפשר לעשות בו-זמנית)
3. ניצול מיטבי של כלים וזמן
4. צמצום המתנות מיותרות

החזר רק את הצעדים המשופרים עם הסברים קצרים.
`;

  const response = await genAI.models.generateContent({
    model: 'gemini-2.0-flash-exp',
    contents: prompt
  });

  logger.info('Recipe steps optimized');
  return response.text || '';
}

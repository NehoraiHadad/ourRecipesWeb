/**
 * Menu Planner Service using Gemini Function Calling
 */
import { GoogleGenAI, Type } from '@google/genai';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY || '' });

/**
 * Available functions for Gemini to call
 */
const functions = [
  {
    name: 'get_all_recipes',
    description: 'Get catalog of all available recipes with basic info',
    parameters: {
      type: Type.OBJECT,
      properties: {}
    }
  },
  {
    name: 'get_recipes_details_batch',
    description: 'Get full details for specific recipes',
    parameters: {
      type: Type.OBJECT,
      properties: {
        recipe_ids: {
          type: Type.ARRAY,
          items: {
            type: Type.NUMBER
          },
          description: 'List of recipe IDs to fetch'
        }
      },
      required: ['recipe_ids']
    }
  }
];

/**
 * Execute function call from Gemini
 */
async function executeFunction(functionCall: any) {
  const { name, args } = functionCall;

  logger.debug({ function: name, args }, 'Executing function call');

  switch (name) {
    case 'get_all_recipes':
      return await getAllRecipes();

    case 'get_recipes_details_batch':
      return await getRecipesDetailsBatch(args.recipe_ids);

    default:
      throw new Error(`Unknown function: ${name}`);
  }
}

async function getAllRecipes() {
  const recipes = await prisma.recipe.findMany({
    where: {
      status: 'ACTIVE',
      is_parsed: true
    },
    select: {
      id: true,
      telegram_id: true,
      title: true,
      categories: true,
      difficulty: true,
      cooking_time: true,
      preparation_time: true,
      servings: true
    },
    take: 200  // Limit to avoid huge response
  });

  logger.debug({ count: recipes.length }, 'Fetched all recipes catalog');
  return recipes;
}

async function getRecipesDetailsBatch(recipeIds: number[]) {
  const recipes = await prisma.recipe.findMany({
    where: {
      id: { in: recipeIds }
    },
    select: {
      id: true,
      telegram_id: true,
      title: true,
      ingredients: true,
      instructions: true,
      categories: true,
      difficulty: true,
      cooking_time: true,
      preparation_time: true,
      servings: true,
      ingredients_list: true
    }
  });

  logger.debug({ count: recipes.length }, 'Fetched recipe details');
  return recipes;
}

/**
 * Generate menu preview using Gemini Function Calling
 */
export async function generateMenuPreview(preferences: {
  name: string;
  event_type?: string;
  servings: number;
  dietary_type?: string;
  meal_types: string[];
  special_requests?: string;
}) {
  logger.info({ preferences }, 'Starting menu generation');

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-exp',
    tools: [{ functionDeclarations: functions }]
  });

  const chat = model.startChat();

  const systemPrompt = `
אתה מתכנן תפריטים מומחה. תפקידך ליצור תפריט מפורט ומאוזן.

מידע על התפריט:
- שם: ${preferences.name}
- סוג אירוע: ${preferences.event_type || 'כללי'}
- מספר סועדים: ${preferences.servings}
- סוג תזונתי: ${preferences.dietary_type || 'פרווה'}
- ארוחות: ${preferences.meal_types.join(', ')}
${preferences.special_requests ? `- בקשות מיוחדות: ${preferences.special_requests}` : ''}

שלבים:
1. קרא את get_all_recipes() כדי לראות את כל המתכונים
2. בחר מתכונים מתאימים על בסיס הדרישות
3. קרא את get_recipes_details_batch() עבור המתכונים שבחרת
4. בנה תפריט מאוזן עם המתכונים

פורמט התגובה (JSON):
{
  "meals": [
    {
      "meal_type": "ארוחת ערב",
      "meal_order": 1,
      "recipes": [
        {
          "recipe_id": 123,
          "course_type": "ראשונה",
          "course_order": 1,
          "ai_reason": "סלט קל ורענן לפתיחת הארוחה"
        }
      ]
    }
  ],
  "reasoning": "הסבר כללי על בחירת המתכונים"
}
`;

  let response = await chat.sendMessage(systemPrompt);
  let iterationCount = 0;
  const MAX_ITERATIONS = 8;

  // Function calling loop
  while (iterationCount < MAX_ITERATIONS) {
    const functionCall = response.response.functionCalls()?.[0];

    if (!functionCall) {
      // No function call - got final answer
      break;
    }

    logger.debug(
      { iteration: iterationCount + 1, function: functionCall.name },
      'Function call iteration'
    );

    // Execute function
    const functionResult = await executeFunction(functionCall);

    // Send result back to model
    response = await chat.sendMessage([
      {
        functionResponse: {
          name: functionCall.name,
          response: functionResult
        }
      }
    ]);

    iterationCount++;
  }

  if (iterationCount >= MAX_ITERATIONS) {
    logger.warn('Max iterations reached');
  }

  // Parse final response
  const text = response.response.text();
  let menuPlan;

  try {
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      menuPlan = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('No JSON found in response');
    }
  } catch (error) {
    logger.error({ error, text }, 'Failed to parse menu plan');
    throw new Error('Failed to generate valid menu plan');
  }

  logger.info(
    {
      mealsCount: menuPlan.meals?.length || 0,
      iterations: iterationCount
    },
    'Menu generation completed'
  );

  return menuPlan;
}

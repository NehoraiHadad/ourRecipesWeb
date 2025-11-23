# 📋 Task 2.8: Menu AI Operations

**מזהה**: TASK-2.8
**שלב**: Phase 2 - API Migration
**סטטוס**: ⬜ Not Started
**Estimated Time**: 6-8 hours
**Priority**: 🟡 Medium (Complex AI feature)

---

## 🎯 Goal

להעביר את ה-Menu AI generation מ-Flask ל-Next.js - הפיצ'ר הכי מורכב עם Gemini Function Calling.

### Why This Task?
- **Core menu feature** - יצירת תפריטים אוטומטית עם AI
- **Most complex** - Gemini Function Calling עם עד 8 iterations
- **No Telegram** - רק AI + DB
- **Depends on 2.2** - צריך menus endpoints

---

## 📦 Prerequisites

- [x] TASK-2.1: Recipes Read APIs
- [x] TASK-2.2: Menus Read APIs
- [x] Environment: GOOGLE_API_KEY

---

## 📋 Endpoints to Migrate

### From `backend/ourRecipesBack/routes/menus.py`:

| Endpoint | Method | Flask Line | Description | Complexity |
|----------|--------|------------|-------------|------------|
| `/generate-preview` | POST | ~14 | AI menu generation | 🔴 Very Hard |

**Total**: 1 endpoint, ~350 lines (הכי מורכב!)

---

## 📋 Implementation Guide

### Step 1: Understand Gemini Function Calling

**Flask Reference (Line 14-99):**
```python
def generate_menu_preview():
    """
    Generate menu PREVIEW using AI (WITHOUT saving to database).
    Returns JSON plan for user to review before confirming.
    """
    # 1. Validate input (name, meal_types, servings, etc.)
    # 2. Check available recipes (min 5)
    # 3. Call MenuPlannerService.generate_menu_preview()
    #    - Uses Gemini Function Calling
    #    - AI calls get_all_recipes()
    #    - AI calls get_recipes_details_batch()
    #    - Up to 8 iterations
    #    - Returns menu structure
    # 4. Return preview to frontend
```

**Key Complexity**: Gemini Function Calling loop

---

### Step 2: Create Menu Planner Service

**קובץ ליצור:** `lib/services/menuPlannerService.ts`

```typescript
/**
 * Menu Planner Service using Gemini Function Calling
 */
import { GoogleGenerativeAI, FunctionDeclarationSchemaType } from '@google/generative-ai';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

/**
 * Available functions for Gemini to call
 */
const functions = [
  {
    name: 'get_all_recipes',
    description: 'Get catalog of all available recipes with basic info',
    parameters: {
      type: FunctionDeclarationSchemaType.OBJECT,
      properties: {},
      required: []
    }
  },
  {
    name: 'get_recipes_details_batch',
    description: 'Get full details for specific recipes',
    parameters: {
      type: FunctionDeclarationSchemaType.OBJECT,
      properties: {
        recipe_ids: {
          type: FunctionDeclarationSchemaType.ARRAY,
          items: { type: FunctionDeclarationSchemaType.NUMBER },
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
      status: 'active',
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
```

---

### Step 3: Create API Route

**קובץ ליצור:** `app/api/menus/generate-preview/route.ts`

```typescript
/**
 * POST /api/menus/generate-preview
 * Generate menu preview using AI (without saving)
 */
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { generateMenuPreview } from '@/lib/services/menuPlannerService';
import { successResponse } from '@/lib/utils/api-response';
import { handleApiError, UnauthorizedError, BadRequestError } from '@/lib/utils/api-errors';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw UnauthorizedError('Authentication required');
    }

    const body = await request.json();

    // Validate required fields
    if (!body.name) {
      throw BadRequestError('Menu name is required');
    }

    if (!body.meal_types || body.meal_types.length === 0) {
      throw BadRequestError('At least one meal type is required');
    }

    logger.info(
      { userId: session.user.id, name: body.name, meals: body.meal_types },
      'Menu preview request'
    );

    // Pre-check: Verify we have enough recipes
    const availableRecipes = await prisma.recipe.count({
      where: {
        status: 'active',
        is_parsed: true
      }
    });

    if (availableRecipes < 5) {
      throw BadRequestError(
        `Not enough recipes. Only ${availableRecipes} available, need at least 5.`
      );
    }

    logger.debug({ availableRecipes }, 'Recipe count check passed');

    // Generate menu preview (may take 30-60 seconds)
    const menuPlan = await generateMenuPreview({
      name: body.name,
      event_type: body.event_type,
      servings: body.servings || 4,
      dietary_type: body.dietary_type,
      meal_types: body.meal_types,
      special_requests: body.special_requests
    });

    return successResponse({
      preview: menuPlan,
      preferences: body  // Echo back for save endpoint
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// Increase timeout for AI generation
export const maxDuration = 60; // 60 seconds (Vercel)
```

---

## ✅ Success Criteria

- [x] Menu preview generation works
- [x] Gemini Function Calling loop functional
- [x] Up to 8 iterations handled
- [x] Returns valid menu structure
- [x] Error handling for AI failures
- [x] Timeout handling (60s)
- [x] Tests pass

---

## 📊 Estimated Time

- **Minimum**: 5 hours
- **Expected**: 6-7 hours
- **Maximum**: 8 hours

**Why so long?**
- Complex Function Calling logic
- Debugging AI responses
- Handling edge cases
- Testing different scenarios

---

## 🔗 Related Tasks

**Depends on:**
- TASK-2.1: Recipes Read APIs
- TASK-2.2: Menus Read APIs

**Blocks:**
- None (nice-to-have feature)

---

## ✏️ AI Agent Instructions

```
Task: Migrate Menu AI Generation (Gemini Function Calling)

Create:
1. lib/services/menuPlannerService.ts
2. app/api/menus/generate-preview/route.ts

Function Calling:
- get_all_recipes(): Return catalog
- get_recipes_details_batch(recipe_ids): Return full details
- Max 8 iterations
- Parse final JSON response

Constraints:
- Check min 5 recipes before generation
- Set timeout to 60s
- Handle AI errors gracefully
- Log each iteration
- Return structured menu plan

Critical:
- This is the most complex endpoint
- Test thoroughly with different preferences
- Handle malformed AI responses
```

---

**Created**: 2025-11-22
**Priority**: 🟡 MEDIUM (Complex feature)

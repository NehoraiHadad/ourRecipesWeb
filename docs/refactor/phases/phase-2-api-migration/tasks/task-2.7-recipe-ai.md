# 📋 Task 2.7: Recipe AI Operations

**מזהה**: TASK-2.7
**שלב**: Phase 2 - API Migration
**סטטוס**: ⬜ Not Started
**Estimated Time**: 8-10 hours
**Priority**: 🟡 Medium (AI features, not critical path)

---

## 🎯 Goal

להעביר את כל ה-AI operations של Recipes מ-Flask ל-Next.js - Gemini AI ו-HuggingFace.

### Why This Task?
- **AI features** - הצעות מתכונים, יצירת תמונות, שיפור טקסט
- **Gemini SDK works in Node.js** - אפשר להעביר ישירות
- **No Telegram dependency** - רק AI calls
- **Can run after 2.1** - צריך recipes endpoints

---

## 📦 Prerequisites

- [x] TASK-2.1: Recipes Read APIs
- [x] Environment: GOOGLE_API_KEY, HUGGINGFACE_TOKEN

---

## 📋 Endpoints to Migrate

### From `backend/ourRecipesBack/routes/recipes.py`:

| Endpoint | Method | Flask Line | Description | AI Service | Complexity |
|----------|--------|------------|-------------|------------|------------|
| `/suggest` | POST | ~140 | AI recipe suggestion | Gemini | 🟡 Medium |
| `/generate-image` | POST | ~163 | AI image generation | HuggingFace | 🟡 Medium |
| `/generate-infographic` | POST | ~180 | AI infographic | Gemini Image | 🔴 Hard |
| `/reformat_recipe` | POST | ~204 | Reformat text | Gemini | 🟢 Easy |
| `/refine` | POST | ~295 | Refine recipe | Gemini | 🟢 Easy |
| `/optimize-steps` | POST | ~315 | Optimize steps | Gemini | 🟢 Easy |
| `/bulk` | POST | ~237 | Bulk parse recipes | Gemini | 🟡 Medium |

**Total**: 7 endpoints, ~400 lines

---

## 📋 Implementation Guide

### Step 1: Create AI Service

**קובץ ליצור:** `lib/services/aiService.ts`

```typescript
/**
 * AI Service using Google Gemini and HuggingFace
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '@/lib/logger';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

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

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

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

  const result = await model.generateContent(prompt);
  const response = result.response.text();

  logger.info('Recipe suggestion generated');
  return response;
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
 * Reformat recipe text
 */
export async function reformatRecipe(text: string): Promise<string> {
  logger.debug({ textLength: text.length }, 'Reformatting recipe');

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

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

  const result = await model.generateContent(prompt);
  const response = result.response.text();

  logger.info('Recipe reformatted');
  return response;
}

/**
 * Refine recipe based on feedback
 */
export async function refineRecipe(recipeText: string, refinementRequest: string): Promise<string> {
  logger.debug({ refinementRequest }, 'Refining recipe');

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

  const prompt = `
המתכון הנוכחי:
${recipeText}

בקשת השיפור:
${refinementRequest}

שפר את המתכון על פי הבקשה, אך שמור על המבנה והפורמט המקורי.
`;

  const result = await model.generateContent(prompt);
  const response = result.response.text();

  logger.info('Recipe refined');
  return response;
}

/**
 * Optimize recipe steps
 */
export async function optimizeRecipeSteps(recipeText: string): Promise<string> {
  logger.debug('Optimizing recipe steps');

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

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

  const result = await model.generateContent(prompt);
  const response = result.response.text();

  logger.info('Recipe steps optimized');
  return response;
}
```

---

### Step 2: Create API Routes

**קבצים ליצור:**
- `app/api/recipes/suggest/route.ts`
- `app/api/recipes/generate-image/route.ts`
- `app/api/recipes/reformat/route.ts`
- `app/api/recipes/refine/route.ts`
- `app/api/recipes/optimize-steps/route.ts`
- `app/api/recipes/bulk/route.ts`

**Example** - `app/api/recipes/suggest/route.ts`:
```typescript
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { generateRecipeSuggestion } from '@/lib/services/aiService';
import { successResponse } from '@/lib/utils/api-response';
import { handleApiError, UnauthorizedError } from '@/lib/utils/api-errors';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw UnauthorizedError('Authentication required');
    }

    const body = await request.json();

    const suggestion = await generateRecipeSuggestion({
      ingredients: body.ingredients,
      mealType: body.mealType,
      quickPrep: body.quickPrep,
      childFriendly: body.childFriendly,
      additionalRequests: body.additionalRequests
    });

    return successResponse({ message: suggestion });
  } catch (error) {
    return handleApiError(error);
  }
}
```

(Similar structure for other endpoints)

---

## ✅ Success Criteria

- [x] All 7 AI endpoints work
- [x] Gemini API integrated
- [x] HuggingFace API integrated
- [x] Error handling for API failures
- [x] Response times acceptable
- [x] Tests pass

---

## 📊 Estimated Time

- **Minimum**: 6 hours
- **Expected**: 8 hours
- **Maximum**: 10 hours

**Breakdown:**
- AI Service: 3 hours
- 7 API routes: 3 hours
- Testing: 2 hours
- Debugging: 2 hours

---

## 🔗 Related Tasks

**Depends on:**
- TASK-2.1: Recipes Read APIs

**Blocks:**
- None (nice-to-have features)

---

## ✏️ AI Agent Instructions

```
Task: Migrate Recipe AI Operations

Create:
1. lib/services/aiService.ts
2. 7 API route files

AI Services:
- Gemini: suggest, reformat, refine, optimize, bulk
- HuggingFace: generate-image

Constraints:
- Use @google/generative-ai package
- Handle API errors gracefully
- Add rate limiting (optional)
- Log AI requests
- Return structured responses

Environment variables:
- GOOGLE_API_KEY
- HUGGINGFACE_TOKEN

Testing:
- Mock AI responses in tests
- Test error handling
```

---

**Created**: 2025-11-22
**Priority**: 🟡 MEDIUM

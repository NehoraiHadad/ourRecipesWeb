# 📝 Prompt for AI Agent: Continue Refactor Documentation

---

## Context

אני עובד על תוכנית מפורטת לרפקטור של אפליקציית Next.js + Flask למעבר לארכיטקטורת Hybrid (Next.js Full Stack + Python Microservice לTelegram).

**מה כבר נעשה:**
1. ✅ מבנה תיקיות בסיסי ב-`docs/refactor/`
2. ✅ מסמכי יסוד:
   - `README.md` - מפת דרכים כוללת
   - `REFACTOR_PLAN.md` - החזון והאסטרטגיה המלאה
   - `CURRENT_STATE.md` - מיפוי מפורט של כל הקוד הקיים (59 endpoints, 10 models)
   - `ARCHITECTURE_DECISION.md` - החלטות ארכיטקטוניות (ADRs)
   - `TASK_TEMPLATE.md` - תבנית למשימה
3. ✅ שלב 1 - התחלה:
   - `phases/phase-1-infrastructure/README.md` - סקירה + dependency graph
   - `tasks/task-1.1-prisma-setup.md` - הושלם
   - `tasks/task-1.3-schema-creation.md` - הושלם

**מה חסר:**
- 6 task files נוספים לשלב 1 (1.2, 1.4-1.8)
- כל שלבים 2-5 עם task files

---

## Your Mission

**המשך את כתיבת תוכניות האימפלמנטציה** בפורמט משימות נפרדות, מותאם לסוכני AI.

---

## Critical Instructions - קרא בעיון! 🔥

### 1. **הבן את התמונה הכוללת לפני שאתה כותב**

**חובה לקרוא את הקבצים הבאים:**
- `docs/refactor/README.md` - כדי להבין את המבנה
- `docs/refactor/REFACTOR_PLAN.md` - כדי להבין את החזון
- `docs/refactor/CURRENT_STATE.md` - **הכי חשוב!** מיפוי מלא של הקוד הקיים
- `docs/refactor/ARCHITECTURE_DECISION.md` - כדי להבין החלטות שכבר התקבלו
- `docs/refactor/TASK_TEMPLATE.md` - כדי להבין את הפורמט הרצוי

**חובה לחקור את הקוד הקיים:**
- `backend/ourRecipesBack/` - Flask backend (כל ה-routes, models, services)
- `frontend/ourRecipesFront/src/` - Next.js frontend
- שים לב במיוחד ל:
  - `backend/ourRecipesBack/routes/*.py` - כל ה-API endpoints
  - `backend/ourRecipesBack/models/*.py` - כל המודלים
  - `backend/ourRecipesBack/services/*.py` - כל הלוגיקה העסקית

### 2. **עקרונות כתיבה**

**✅ DO:**
- כתוב **תוכניות אימפלמנטציה**, לא קוד מוכן
- תן **הנחיות ברורות** מה לעשות, איך לעשות
- הדגש **שיקולים והחלטות** - למה לעשות ככה ולא אחרת
- פרט **קריטריוני הצלחה** מדידים וברורים
- ציין **תלויות** - מה חייב להיעשות קודם
- הוסף **AI Agent Instructions** בסוף כל משימה
- כלול **Rollback Strategy** - איך לחזור אחורה אם משהו לא עובד

**❌ DON'T:**
- אל תכתוב קוד מלא להעתקה (רק snippets קצרים לדוגמה)
- אל תעתיק קוד קיים מהפרויקט (רק תפנה אליו)
- אל תמציא endpoints או features שלא קיימים
- אל תדלג על קריטריוני הצלחה או testing

### 3. **Dependencies ו-Parallelization**

**חשוב מאוד!** כל משימה צריכה:
- רשימה ברורה של Prerequisites (מה חייב להיעשות קודם)
- ציון אם ניתן להריץ במקביל למשימות אחרות
- קישור למשימות שתלויות בה (Blocks)

**דוגמה:**
```markdown
## 📦 Prerequisites

**חייב להשלים לפני:**
- [x] TASK-1.1: Prisma Setup

**Can run in parallel:**
- TASK-1.5: API Routes Structure
- TASK-1.7: Testing Infrastructure

## 🔗 Related Tasks

**Blocks** (משימות שתלויות במשימה זו):
- TASK-1.4: Migration Script
- TASK-1.6: Types Setup
```

### 4. **חלוקת משימות**

**עקרונות לחלוקה:**
- כל משימה = 1-4 שעות עבודה (לא יותר!)
- אם משימה מורכבת → פצל לכמה משימות
- כל משימה צריכה להיות **עצמאית** ככל האפשר
- דוגמה טובה: "העברת Recipes CRUD" → חלק ל:
  - Task 2.1: Recipes Read Operations (GET endpoints)
  - Task 2.2: Recipes Write Operations (POST/PUT/DELETE)
  - Task 2.3: Recipes Search & Filters

**רמות עדיפות:**
- 🔴 High: קריטי, חוסם משימות אחרות
- 🟡 Medium: חשוב אבל לא חוסם
- 🟢 Low: Nice to have

---

## Specific Tasks to Complete

### Phase 1: Infrastructure (Complete remaining tasks)

יש לך 2 דוגמאות (task-1.1, task-1.3). השלם את הנותרים:

**Task 1.2: PostgreSQL Setup** (1-2 hours)
- Goal: בחירת והקמת PostgreSQL database
- Options: Vercel Postgres / Supabase / Local
- Prerequisites: None (parallel with 1.1)
- Success: DATABASE_URL עובד, ניתן להתחבר

**Task 1.4: Migration Script** (3-4 hours)
- Goal: העברת כל הdata מ-SQLite ל-PostgreSQL
- Prerequisites: 1.3 (Schema ready)
- בדוק ב-`CURRENT_STATE.md` את כל המודלים!
- Success: 0% data loss, כל המודלים מועברים

**Task 1.5: API Routes Structure** (2-3 hours)
- Goal: מבנה בסיסי של Next.js API routes
- Prerequisites: None (parallel)
- כולל: Error handling, Response types, Directory structure
- Success: יכול ליצור API route פשוט שעובד

**Task 1.6: Types Setup** (2-3 hours)
- Goal: TypeScript types משותפים
- Prerequisites: 1.3 (Prisma types)
- כולל: Request/Response types, Database types, Shared types
- Success: אין TypeScript errors, autocomplete עובד

**Task 1.7: Testing Infrastructure** (3-4 hours)
- Goal: Vitest setup ומבנה testing
- Prerequisites: None (parallel)
- כולל: Vitest config, Test utilities, Mock Prisma
- Success: יכול לכתוב ולהריץ test

**Task 1.8: Logging Setup** (1-2 hours)
- Goal: Pino logger configuration
- Prerequisites: None (parallel)
- כולל: Logger setup, Different log levels, Structured logging
- Success: Logs מופיעים בקונסול בפורמט מובנה

### Phase 2: API Migration (Create structure)

צור `phases/phase-2-api-migration/README.md` עם:
- Dependency graph
- רשימת כל ה-endpoints (השתמש ב-`CURRENT_STATE.md`!)
- חלוקה למשימות לפי:
  - Complexity (easy/medium/hard)
  - Dependencies (Telegram? AI? DB only?)
  - Priority (high/medium/low)

**דוגמה לחלוקה:**

**Group A: Read Operations (No Telegram, Easy)**
- Task 2.1: Recipes Read APIs (GET /recipes, GET /recipes/:id, etc.)
- Task 2.2: Menus Read APIs (GET /menus, GET /menus/:id, etc.)
- Task 2.3: Categories & Search APIs

**Group B: Write Operations - DB Only (No Telegram, Medium)**
- Task 2.4: Shopping List Operations
- Task 2.5: Version Management

**Group C: AI Integration (Medium)**
- Task 2.6: Recipe AI Operations (suggest, reformat, refine)
- Task 2.7: Menu AI Operations (generate-preview)

**Group D: Write Operations with Telegram (Hard - needs Python service)**
- Task 2.8: Recipes Write APIs (create, update) - תלוי ב-Phase 4!
- Task 2.9: Menus Write APIs (save, update, delete) - תלוי ב-Phase 4!
- Task 2.10: Places APIs - תלוי ב-Phase 4!

**חשוב!** קרא את ה-routes ב-`backend/ourRecipesBack/routes/` לפני שאתה מחלק!

### Phase 3-5: Basic Structure

צור README.md לכל phase עם:
- Overview
- Dependency graph (אפילו פשוט)
- רשימת משימות מתוכננות (לא צריך task files מפורטים עדיין)

---

## Quality Checklist ✅

לפני שאתה סיים, בדוק:

**For each task file:**
- [ ] יש Goal ברור
- [ ] יש Prerequisites מדויקים
- [ ] Implementation Guide עם steps ספציפיים
- [ ] Success Criteria מדידים
- [ ] Testing Instructions
- [ ] Rollback Strategy
- [ ] AI Agent Instructions בסוף
- [ ] Estimated Time (Minimum/Expected/Maximum)
- [ ] Related Tasks (Blocks/Can run in parallel)

**For each phase README:**
- [ ] יש Dependency Graph (Mermaid או טקסט)
- [ ] רשימת כל המשימות עם הערכת זמן
- [ ] הסבר על אסטרטגיות ביצוע (Sequential/Parallel)
- [ ] Phase Success Criteria

**Overall:**
- [ ] קראת את הקוד הקיים ב-`backend/` ו-`frontend/`
- [ ] קראת את `CURRENT_STATE.md` ומבין את כל ה-endpoints
- [ ] אין endpoints שהמצאת - הכל מבוסס על הקוד הקיים
- [ ] Dependencies נכונים (בדקת מה תלוי במה)

---

## Expected Output

בסוף העבודה שלך, צריך להיות:

```
docs/refactor/
├── phases/
│   ├── phase-1-infrastructure/
│   │   ├── README.md ✅
│   │   └── tasks/
│   │       ├── task-1.1-prisma-setup.md ✅
│   │       ├── task-1.2-postgres-setup.md 🆕
│   │       ├── task-1.3-schema-creation.md ✅
│   │       ├── task-1.4-migration-script.md 🆕
│   │       ├── task-1.5-api-structure.md 🆕
│   │       ├── task-1.6-types-setup.md 🆕
│   │       ├── task-1.7-testing-setup.md 🆕
│   │       └── task-1.8-logging-setup.md 🆕
│   │
│   ├── phase-2-api-migration/
│   │   ├── README.md 🆕 (מפורט!)
│   │   └── tasks/
│   │       ├── task-2.1-recipes-read.md 🆕
│   │       ├── task-2.2-menus-read.md 🆕
│   │       ├── ... (לפי החלוקה שתחליט)
│   │
│   ├── phase-3-auth-migration/
│   │   └── README.md 🆕 (סקירה בסיסית)
│   │
│   ├── phase-4-telegram-service/
│   │   └── README.md 🆕 (סקירה בסיסית)
│   │
│   └── phase-5-deployment/
│       └── README.md 🆕 (סקירה בסיסית)
```

---

## Tips for Success 💡

1. **התחל מהקל**: השלם phase 1 tasks קודם (יש לך דוגמאות!)
2. **קרא קוד אמיתי**: פתח את `backend/ourRecipesBack/routes/recipes.py` וקרא
3. **חשוב Dependencies**: צייר לעצמך גרף אם צריך
4. **שמור consistency**: השתמש באותו פורמט כמו task-1.1 ו-task-1.3
5. **בדוק הגיון**: אם משהו לא הגיוני, חשוב שוב

---

## Example: How to Approach Task 1.4 (Migration Script)

1. **קרא את `CURRENT_STATE.md`** - רשימת כל המודלים
2. **בדוק SQLAlchemy models** ב-`backend/ourRecipesBack/models/`
3. **בדוק Prisma schema** שנוצר ב-task 1.3
4. **זהה issues**:
   - Field name changes (e.g., `_ingredients` → `ingredients`)
   - Type changes (e.g., enum lowercase → uppercase)
   - JSON parsing (some fields stored as JSON strings)
5. **כתוב תוכנית**:
   - Step 1: Export from SQLite
   - Step 2: Transform data (handle edge cases)
   - Step 3: Import to PostgreSQL
   - Step 4: Verify data integrity
6. **Success criteria**: Zero data loss, all tables migrated

---

## Ready? Start Now! 🚀

**Workflow:**
1. קרא את כל הקבצים ב-`docs/refactor/` (בעיקר CURRENT_STATE.md)
2. חקור את הקוד ב-`backend/ourRecipesBack/`
3. השלם Phase 1 tasks (1.2, 1.4-1.8)
4. צור Phase 2 README + tasks (הכי חשוב!)
5. צור Phase 3-5 READMEs (סקירה בסיסית)

**עדיפויות:**
1. 🔴 Phase 1 tasks completion
2. 🔴 Phase 2 README + task breakdown
3. 🟡 Phase 2 detailed task files (לפחות 3-4)
4. 🟢 Phase 3-5 basic READMEs

---

**Questions? Ask before you start writing!**

Good luck! 💪

# 📸 Current State - Flask Backend Mapping

תאריך: 2025-11-22
גרסה: 1.0.0

---

## 📊 סיכום מהיר

| מטריקה | ערך |
|--------|------|
| **שורות קוד בRoutes** | 2,275 |
| **מספר Route files** | 8 |
| **מספר Endpoints** | 59 |
| **מספר Models** | 10 |
| **מספר Services** | 8 |
| **Background Tasks** | 2 |
| **External Dependencies** | Telegram, Google Gemini, HuggingFace |

---

## 🗺️ Flask Routes - טבלת מעבר

### Authentication Routes (`/api/auth`)
**קובץ**: `backend/ourRecipesBack/routes/auth.py`

| Endpoint | Method | Auth | Input | Output | Priority | Notes |
|----------|--------|------|-------|--------|----------|-------|
| `/login` | POST | None | Telegram user data | JWT + user | 🔴 High | HMAC verification |
| `/guest` | POST | None | - | Guest JWT | 🟡 Medium | UUID generation |
| `/logout` | POST | None | - | Success | 🟢 Low | Simple |
| `/validate` | GET | JWT | - | User status | 🔴 High | Used frequently |
| `/clear-permissions-cache` | POST | JWT | user_id? | Success | 🟢 Low | Cache management |

**העברה ל-Next.js**:
```typescript
// app/api/auth/[...nextauth]/route.ts - NextAuth.js
// app/api/auth/validate/route.ts - Custom validation
```

---

### Recipes Routes (`/api/recipes`)
**קובץ**: `backend/ourRecipesBack/routes/recipes.py`

| Endpoint | Method | Auth | Input | Output | Priority | Dependencies |
|----------|--------|------|-------|--------|----------|--------------|
| `/search` | GET | JWT | Query params | Search results | 🔴 High | DB only |
| `/update/<telegram_id>` | PUT | JWT | Text, image | Updated recipe | 🔴 High | **Telegram** |
| `/create` | POST | JWT | Text, image | New recipe | 🔴 High | **Telegram** |
| `/suggest` | POST | JWT | Preferences | AI recipe | 🟡 Medium | AI Service |
| `/generate-image` | POST | JWT | Recipe text | Base64 image | 🟡 Medium | AI Service |
| `/generate-infographic` | POST | JWT | Recipe text | Infographic | 🟢 Low | AI Service |
| `/reformat_recipe` | POST | JWT | Text | Formatted text | 🟡 Medium | AI Service |
| `/manage` | GET | JWT | - | Recipe list | 🔴 High | DB only |
| `/bulk` | POST | JWT | Recipe IDs, action | Bulk result | 🟡 Medium | AI Service |
| `/<telegram_id>` | GET | None | - | Single recipe | 🔴 High | DB only |
| `/refine` | POST | JWT | Recipe, refinement | Refined recipe | 🟢 Low | AI Service |
| `/optimize-steps` | POST | JWT | Recipe text | Optimized steps | 🟢 Low | AI Service |
| `/search/suggestions` | GET | JWT | Query | Autocomplete | 🔴 High | DB only |

**🔥 Telegram Dependencies**:
- `/create` - שולח ל-Telegram → **Python Service**
- `/update` - מעדכן ב-Telegram → **Python Service**

**✅ Next.js only**:
- כל ה-endpoints האחרים יכולים להיות ב-Next.js API Routes

---

### Menus Routes (`/api/menus`)
**קובץ**: `backend/ourRecipesBack/routes/menus.py`

| Endpoint | Method | Auth | Priority | Telegram? | AI? |
|----------|--------|------|----------|-----------|-----|
| `/generate-preview` | POST | JWT | 🔴 High | ❌ | ✅ Gemini |
| `/save` | POST | JWT | 🔴 High | ✅ Send | ❌ |
| `` (list) | GET | JWT | 🔴 High | ❌ | ❌ |
| `/<menu_id>` | GET | JWT | 🔴 High | ❌ | ❌ |
| `/shared/<share_token>` | GET | None | 🔴 High | ❌ | ❌ |
| `/<menu_id>` | PUT | JWT | 🟡 Medium | ✅ Update | ❌ |
| `/<menu_id>` | DELETE | JWT | 🟡 Medium | ✅ Delete | ❌ |
| Meal/Recipe operations | Various | JWT | 🟡 Medium | ✅ Update | ❌ |
| `/shopping-list/*` | Various | JWT | 🟡 Medium | ❌ | ❌ |

**🔥 Telegram Dependencies** (4 operations):
- `POST /save` - שולח תפריט חדש
- `PUT /<menu_id>` - מעדכן תפריט
- `DELETE /<menu_id>` - מוחק תפריט
- Meal updates - מעדכן תפריט

**🤖 AI Dependencies**:
- `POST /generate-preview` - Gemini Function Calling (עד 8 iterations)

---

### Places Routes (`/api/places`)
**קובץ**: `backend/ourRecipesBack/routes/places.py`

| Endpoint | Method | Telegram Operation |
|----------|--------|--------------------|
| `POST /` | POST | ✅ Backup to Telegram |
| `PUT /<id>` | PUT | ✅ Update in Telegram |
| `DELETE /<id>` | DELETE | ✅ Soft delete + update |

**🔥 כל ה-Places operations תלויות ב-Telegram!**

---

### Sync Routes (`/api/sync`)
**קובץ**: `backend/ourRecipesBack/routes/sync.py`

| Endpoint | Method | Description | Telegram? |
|----------|--------|-------------|-----------|
| `/status` | GET | Sync status | ❌ |
| `` (sync) | POST | Incremental sync | ✅ Read from Telegram |
| `/session/status` | GET | Session status | ✅ |
| `/session/refresh` | POST | Refresh session | ✅ |
| `/full` | POST | Full sync | ✅ Read all messages |

**🔥 כל ה-Sync operations צריכים Telegram!**

---

### Other Routes

**Categories** (`/api/categories`):
- `GET /` - List categories (DB only) ✅

**Versions** (`/api/versions`):
- `GET /recipe/<id>` - Get versions (DB only) ✅
- `POST /recipe/<id>` - Create version (DB only) ✅
- `POST /recipe/<id>/restore/<version_id>` - Restore (**Telegram**) 🔥

**Basic** (`/api`):
- `GET /ping` - Health check ✅

---

## 📦 SQLAlchemy Models → Prisma Schema

### Recipe Model
**קובץ**: `backend/ourRecipesBack/models/recipe.py`

```prisma
model Recipe {
  id                Int              @id @default(autoincrement())
  telegram_id       Int              @unique
  title             String           @db.VarChar(500)
  raw_content       String           @db.Text
  ingredients       String?          @db.Text  // stored as ||separated
  instructions      String?          @db.Text
  categories        String?          @db.Text  // comma-separated
  recipe_metadata   Json?
  image_data        Bytes?
  image_url         String?          @db.VarChar(500)
  media_type        String?          @db.VarChar(50)
  created_at        DateTime         @default(now())
  updated_at        DateTime         @updatedAt
  last_sync         DateTime?
  is_parsed         Boolean          @default(false)
  parse_errors      String?
  status            String           @default("active") @db.VarChar(20)
  ingredients_list  Json?
  cooking_time      Int?
  difficulty        RecipeDifficulty?
  servings          Int?
  preparation_time  Int?
  formatted_content Json?
  is_verified       Boolean          @default(false)
  sync_status       String           @default("synced") @db.VarChar(20)
  sync_error        String?          @db.Text

  // Relations
  user_recipes      UserRecipe[]
  versions          RecipeVersion[]
  meal_recipes      MealRecipe[]

  @@index([telegram_id])
  @@map("recipes")
}

enum RecipeDifficulty {
  EASY
  MEDIUM
  HARD
}
```

---

### Menu Model
```prisma
model Menu {
  id                   Int                @id @default(autoincrement())
  user_id              String             @db.VarChar(50)
  telegram_message_id  Int?               @unique
  last_sync            DateTime?
  name                 String             @db.VarChar(200)
  event_type           String?            @db.VarChar(100)
  description          String?            @db.Text
  total_servings       Int                @default(4)
  dietary_type         DietaryType?
  share_token          String             @unique @db.VarChar(32)
  is_public            Boolean            @default(false)
  ai_reasoning         String?            @db.Text
  generation_prompt    String?            @db.Text
  created_at           DateTime           @default(now())
  updated_at           DateTime           @updatedAt

  // Relations
  meals                MenuMeal[]
  shopping_list_items  ShoppingListItem[]

  @@index([user_id])
  @@index([telegram_message_id])
  @@index([share_token])
  @@map("menus")
}

enum DietaryType {
  MEAT
  DAIRY
  PAREVE
}
```

---

### MenuMeal Model
```prisma
model MenuMeal {
  id         Int          @id @default(autoincrement())
  menu_id    Int
  meal_type  String       @db.VarChar(100)
  meal_order Int
  meal_time  String?      @db.VarChar(50)
  notes      String?      @db.Text
  created_at DateTime     @default(now())

  // Relations
  menu       Menu         @relation(fields: [menu_id], references: [id], onDelete: Cascade)
  recipes    MealRecipe[]

  @@index([menu_id, meal_order])
  @@map("menu_meals")
}
```

---

### MealRecipe Model
```prisma
model MealRecipe {
  id            Int       @id @default(autoincrement())
  menu_meal_id  Int
  recipe_id     Int
  course_type   String?   @db.VarChar(100)
  course_order  Int       @default(0)
  servings      Int?
  notes         String?   @db.Text
  ai_reason     String?   @db.Text
  created_at    DateTime  @default(now())

  // Relations
  meal          MenuMeal  @relation(fields: [menu_meal_id], references: [id], onDelete: Cascade)
  recipe        Recipe    @relation(fields: [recipe_id], references: [id], onDelete: Cascade)

  @@index([menu_meal_id, recipe_id])
  @@map("meal_recipes")
}
```

---

### Place Model
```prisma
model Place {
  id                  Int       @id @default(autoincrement())
  name                String    @db.VarChar(255)
  website             String?   @db.VarChar(255)
  description         String?   @db.Text
  location            String?   @db.VarChar(255)
  waze_link           String?   @db.VarChar(255)
  type                String?   @db.VarChar(50)  // restaurant/cafe/bar/etc
  created_by          String    @db.VarChar(255)
  created_at          DateTime  @default(now())
  telegram_message_id Int?
  is_synced           Boolean   @default(false)
  last_sync           DateTime?
  is_deleted          Boolean   @default(false)

  @@map("places")
}
```

---

### ShoppingListItem Model
```prisma
model ShoppingListItem {
  id              Int      @id @default(autoincrement())
  menu_id         Int
  ingredient_name String   @db.VarChar(200)
  quantity        String?  @db.VarChar(100)
  category        String?  @db.VarChar(100)
  is_checked      Boolean  @default(false)
  notes           String?  @db.Text
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt

  // Relations
  menu            Menu     @relation(fields: [menu_id], references: [id], onDelete: Cascade)

  @@index([menu_id, category])
  @@map("shopping_list_items")
}
```

---

### RecipeVersion Model
```prisma
model RecipeVersion {
  id                  Int       @id @default(autoincrement())
  recipe_id           Int
  version_num         Int
  content             Json
  created_at          DateTime  @default(now())
  created_by          String?   @db.VarChar(100)
  change_description  String?   @db.Text
  is_current          Boolean   @default(false)
  image_data          Bytes?

  // Relations
  recipe              Recipe    @relation(fields: [recipe_id], references: [id], onDelete: Cascade)

  @@map("recipe_versions")
}
```

---

### UserRecipe Model
```prisma
model UserRecipe {
  id          Int      @id @default(autoincrement())
  user_id     String   @db.VarChar(50)
  recipe_id   Int
  created_at  DateTime @default(now())
  is_favorite Boolean  @default(false)

  // Relations
  recipe      Recipe   @relation(fields: [recipe_id], references: [id], onDelete: Cascade)

  @@index([user_id, recipe_id])
  @@map("user_recipes")
}
```

---

### SyncLog Model
```prisma
model SyncLog {
  id                 Int       @id @default(autoincrement())
  started_at         DateTime  @default(now())
  completed_at       DateTime?
  status             String    @db.VarChar(20)  // in_progress/completed/failed
  details            String?   @db.Text
  error_message      String?   @db.Text
  sync_type          String?   @db.VarChar(50)
  recipes_processed  Int       @default(0)
  recipes_failed     Int       @default(0)
  recipes_added      Int       @default(0)
  recipes_updated    Int       @default(0)
  places_processed   Int       @default(0)
  places_failed      Int       @default(0)
  menus_processed    Int       @default(0)
  menus_failed       Int       @default(0)
  menus_added        Int       @default(0)
  menus_updated      Int       @default(0)

  @@map("sync_log")
}
```

---

## 🔧 Services Mapping

### Services שיעברו ל-Next.js
| Service | Current Location | Future Location | Notes |
|---------|------------------|-----------------|-------|
| **AuthService** | `services/auth_service.py` | NextAuth.js + Custom provider | Telegram HMAC, permissions |
| **RecipeService** | `services/recipe_service.py` | `lib/services/recipeService.ts` | CRUD only, Telegram → Python |
| **MenuService** | `services/menu_service.py` | `lib/services/menuService.ts` | CRUD only, Telegram → Python |
| **ShoppingListService** | `services/shopping_list_service.py` | `lib/services/shoppingListService.ts` | Pure logic |
| **AIService** | `services/ai_service.py` | `lib/services/aiService.ts` | Gemini SDK works in Node! |
| **MenuPlannerService** | `services/menu_planner_service.py` | `lib/services/menuPlannerService.ts` | Gemini function calling |

### Services שיישארו ב-Python
| Service | Why? | New Location |
|---------|------|--------------|
| **TelegramService** | Telethon (Python only) | `telegram_service/telegram.py` |

---

## 🔥 Telegram Operations - Python Microservice

### Operations שצריכים Python Service

**Recipes**:
- ✅ `POST /recipes/create` → `/telegram/send-message`
- ✅ `PUT /recipes/update/<id>` → `/telegram/edit-message`
- ✅ (Delete recipe לא קיים, אבל אם יתווסף) → `/telegram/delete-message`

**Menus**:
- ✅ `POST /menus/save` → `/telegram/send-message`
- ✅ `PUT /menus/<id>` → `/telegram/edit-message`
- ✅ `DELETE /menus/<id>` → `/telegram/delete-message`

**Places**:
- ✅ `POST /places` → `/telegram/send-message`
- ✅ `PUT /places/<id>` → `/telegram/edit-message`
- ✅ `DELETE /places/<id>` → `/telegram/edit-message` (soft delete)

**Versions**:
- ✅ `POST /versions/restore/<id>` → `/telegram/edit-message`

**Sync**:
- ✅ `POST /sync` → `/telegram/read-messages` (incremental)
- ✅ `POST /sync/full` → `/telegram/read-all-messages`

**Background**:
- ✅ Monitor old channel → Webhook to Next.js

### Python Service API Design

```python
# telegram_service/main.py

@app.post("/telegram/send-message")
async def send_message(data: MessageData):
    """Next.js → Python: Send new message"""
    message = await telegram_client.send_message(
        entity=data.channel,
        message=data.content,
        file=data.image_url
    )
    return {"message_id": message.id}

@app.put("/telegram/edit-message")
async def edit_message(data: MessageEdit):
    """Next.js → Python: Edit existing message"""
    await telegram_client.edit_message(
        entity=data.channel,
        message=data.message_id,
        text=data.content,
        file=data.image_url
    )
    return {"success": True}

@app.delete("/telegram/delete-message/{message_id}")
async def delete_message(message_id: int):
    """Next.js → Python: Delete message"""
    await telegram_client.delete_messages(
        entity=CHANNEL,
        message_ids=[message_id]
    )
    return {"success": True}

@app.post("/telegram/sync-messages")
async def sync_messages(data: SyncRequest):
    """Next.js → Python: Sync messages from Telegram"""
    messages = []
    async for message in telegram_client.iter_messages(
        entity=data.channel,
        limit=data.limit,
        offset_id=data.offset_id
    ):
        messages.append({
            "id": message.id,
            "text": message.text,
            "media": message.media,
            "date": message.date
        })
    return {"messages": messages}

# Background task
async def monitor_old_channel():
    """Python → Next.js: Webhook when new message"""
    @telegram_client.on(events.NewMessage(chats=OLD_CHANNEL))
    async def handler(event):
        # Copy to new channel
        new_msg = await telegram_client.send_message(...)

        # Notify Next.js
        await httpx.post(
            f"{NEXTJS_URL}/api/webhooks/telegram-message",
            json={
                "message_id": new_msg.id,
                "content": event.text,
                "media": event.media
            }
        )
```

---

## 🤖 AI Operations - Next.js Compatible

**Good News**: Google Gemini SDK works great in Node.js!

```typescript
// lib/services/aiService.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

export async function generateRecipeSuggestion(params: RecipeSuggestionParams) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }]
  });

  return result.response.text();
}

export async function generateMenuWithFunctionCalling(preferences: MenuPreferences) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    tools: [
      {
        functionDeclarations: [
          {
            name: 'get_all_recipes',
            description: 'Get catalog of all recipes',
            parameters: { type: 'object', properties: {} }
          },
          {
            name: 'get_recipes_details_batch',
            description: 'Get full details for specific recipes',
            parameters: {
              type: 'object',
              properties: {
                recipe_ids: {
                  type: 'array',
                  items: { type: 'integer' }
                }
              }
            }
          }
        ]
      }
    ]
  });

  // Function calling loop (up to 8 iterations)
  let iterationCount = 0;
  const MAX_ITERATIONS = 8;

  while (iterationCount < MAX_ITERATIONS) {
    const result = await chat.sendMessage(prompt);
    const response = result.response;

    if (response.functionCall) {
      // Execute function and send result back
      const functionResult = await executeFunction(response.functionCall);
      prompt = functionResult;
      iterationCount++;
    } else {
      // Got final answer
      return JSON.parse(response.text());
    }
  }
}
```

**All AI operations can move to Next.js!** ✅

---

## 🔐 Authentication Flow

### Current (Flask)
1. User clicks "Login with Telegram"
2. Frontend gets Telegram auth data via Telegram Login Widget
3. POST `/api/auth/login` with Telegram data
4. Backend verifies HMAC-SHA256
5. Backend checks channel membership (cached 1 hour)
6. Backend creates JWT (7 days)
7. JWT stored in httpOnly cookie

### Future (NextAuth.js)
```typescript
// app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth';

export const authOptions = {
  providers: [
    {
      id: 'telegram',
      name: 'Telegram',
      type: 'oauth',

      async authorize(credentials) {
        // 1. Verify HMAC
        const isValid = verifyTelegramAuth(credentials);
        if (!isValid) return null;

        // 2. Check permissions (call Python service or cache)
        const canEdit = await checkPermissions(credentials.id);

        // 3. Return user
        return {
          id: credentials.id,
          name: credentials.first_name,
          username: credentials.username,
          canEdit
        };
      }
    }
  ],

  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60 // 7 days
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.canEdit = user.canEdit;
      }
      return token;
    },

    async session({ session, token }) {
      session.user.canEdit = token.canEdit;
      return session;
    }
  }
};

export default NextAuth(authOptions);
```

---

## 🌐 Environment Variables

### Current (Flask)
```env
# Database
DATABASE_URL=sqlite:///recipes.db

# JWT
SECRET_JWT=xxx

# Telegram
SESSION_STRING=xxx
SESSION_STRING_MONITOR=xxx
BOT_ID=xxx
API_HASH=xxx
BOT_TOKEN=xxx
CHANNEL_URL=https://t.me/...
OLD_CHANNEL_URL=https://t.me/...

# AI
GOOGLE_API_KEY=xxx
GOOGLE_API_KEY_NANO_BANANA=xxx
HF_TOKEN=xxx

# CORS
ORIGIN_CORS=http://localhost:3000,https://our-recipes.vercel.app
```

### Future (Next.js)
```env
# Database (Vercel Postgres or Supabase)
DATABASE_URL=postgresql://user:pass@host/db

# Auth
NEXTAUTH_URL=https://our-recipes.vercel.app
NEXTAUTH_SECRET=xxx

# Telegram (only for permission checks, actual ops in Python)
TELEGRAM_BOT_TOKEN=xxx

# AI
GOOGLE_API_KEY=xxx
GOOGLE_API_KEY_PAID=xxx
HUGGINGFACE_TOKEN=xxx

# Python Microservice
TELEGRAM_SERVICE_URL=https://telegram-service.railway.app
TELEGRAM_WEBHOOK_SECRET=xxx  # HMAC signature for webhooks
```

### Future (Python Service)
```env
# Telegram
SESSION_STRING=xxx
SESSION_STRING_MONITOR=xxx
API_ID=xxx
API_HASH=xxx
CHANNEL_URL=https://t.me/...
OLD_CHANNEL_URL=https://t.me/...

# Next.js
NEXTJS_URL=https://our-recipes.vercel.app
WEBHOOK_SECRET=xxx  # Shared secret for HMAC
```

---

## 📊 Migration Complexity Matrix

| Component | Lines | Complexity | Telegram? | AI? | Priority | Estimated Hours |
|-----------|-------|------------|-----------|-----|----------|-----------------|
| **Auth Routes** | 350 | 🟡 Medium | ✅ (verify) | ❌ | 🔴 High | 8-12 |
| **Recipe CRUD** | 800 | 🟡 Medium | ✅ (create/update) | ❌ | 🔴 High | 12-16 |
| **Recipe AI** | 200 | 🟢 Low | ❌ | ✅ | 🟡 Medium | 4-6 |
| **Menu CRUD** | 600 | 🟡 Medium | ✅ (save/update/delete) | ❌ | 🔴 High | 10-14 |
| **Menu AI** | 400 | 🔴 High | ❌ | ✅ (complex) | 🔴 High | 12-16 |
| **Places** | 150 | 🟢 Low | ✅ (all ops) | ❌ | 🟢 Low | 4-6 |
| **Sync** | 300 | 🔴 High | ✅ (read messages) | ❌ | 🟡 Medium | 8-12 |
| **Shopping List** | 200 | 🟢 Low | ❌ | ❌ | 🟡 Medium | 4-6 |
| **Versions** | 150 | 🟢 Low | ✅ (restore) | ❌ | 🟢 Low | 3-5 |
| **Database Migration** | - | 🟡 Medium | ❌ | ❌ | 🔴 High | 6-8 |
| **Python Service** | 300 | 🟡 Medium | ✅ (all) | ❌ | 🔴 High | 12-16 |
| **Testing** | - | 🔴 High | ✅ | ✅ | 🔴 High | 20-30 |
| **Deployment** | - | 🟡 Medium | ❌ | ❌ | 🔴 High | 8-12 |
| **TOTAL** | ~3,450 | | | | | **110-160 hours** |

---

## 🎯 Quick Wins - מה קל להעביר?

### ✅ אפס תלויות (Easy - 1-2 hours each)
1. `GET /recipes/<id>` - קריאת מתכון בודד
2. `GET /recipes/search` - חיפוש
3. `GET /recipes/search/suggestions` - autocomplete
4. `GET /menus` - רשימת תפריטים
5. `GET /menus/<id>` - תפריט בודד
6. `GET /menus/shared/<token>` - שיתוף
7. `GET /categories` - קטגוריות
8. `GET /versions/recipe/<id>` - גרסאות
9. Shopping list operations (all)

### 🟡 תלות ב-AI בלבד (Medium - 4-6 hours each)
1. `POST /recipes/suggest` - Gemini
2. `POST /recipes/generate-image` - HuggingFace
3. `POST /recipes/reformat_recipe` - Gemini
4. `POST /recipes/refine` - Gemini
5. `POST /menus/generate-preview` - Gemini (complex!)

### 🔴 תלות ב-Telegram (Hard - need Python service first)
1. כל ה-Create/Update/Delete operations
2. Sync operations
3. Background monitoring

**אסטרטגיה**: התחל מהקלים, עבור ל-AI, סיים ב-Telegram!

---

## 🚨 Critical Issues to Address

### 1. Async/Sync Mixing (קריטי!)
**קובץ**: `backend/ourRecipesBack/routes/recipes.py:61`

```python
# ❌ BAD - async function with sync calls
async def update_recipe(telegram_id):
    data = request.get_json()  # Sync!
    await RecipeService.update_recipe(...)  # Async!
```

**פתרון ב-Next.js**: הכל async באופן טבעי!
```typescript
export async function PUT(req: Request) {
  const data = await req.json();  // All async
  const result = await updateRecipe(data);
  return Response.json(result);
}
```

---

### 2. Database Locked Errors
**קובץ**: `backend/ourRecipesBack/models/recipe.py:357`

```python
# Retry logic for SQLite locks
except OperationalError as e:
    if "database is locked" in str(e):
        retries += 1
        time.sleep(0.1 * retries)
```

**פתרון**: מעבר ל-PostgreSQL! אין SQLite locks ב-Postgres.

---

### 3. Hebrew Content Parsing
**חשוב**: כל המערכת עובדת עם עברית!

- Ingredients: רשימות עברית
- Instructions: הוראות בעברית
- Categories: קטגוריות בעברית
- Search: חיפוש בעברית

**Prisma תומך בעברית מצוין** ✅
**Gemini תומך בעברית מצוין** ✅

---

### 4. Background Tasks
**קובץ**: `backend/ourRecipesBack/background_tasks.py`

**Python Service ירוץ כ-daemon עם:**
1. Monitor old channel → Webhook ל-Next.js
2. Health check every 5 min
3. Auto-restart on crash

**Next.js לא צריך background tasks!** כל הlogic ב-Python service.

---

## 📁 File Structure Comparison

### Current (Flask)
```
backend/
├── ourRecipesBack/
│   ├── routes/          # 8 files, 2,275 lines
│   ├── services/        # 8 services
│   ├── models/          # 10 models
│   ├── background_tasks.py
│   ├── config.py
│   └── __init__.py
└── requirements.txt
```

### Future (Next.js + Python)
```
frontend/ourRecipesFront/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts
│   │   ├── recipes/
│   │   │   ├── route.ts              # GET, POST
│   │   │   ├── [id]/route.ts         # GET, PUT, DELETE
│   │   │   └── search/route.ts
│   │   ├── menus/
│   │   │   ├── route.ts
│   │   │   ├── [id]/route.ts
│   │   │   └── shared/[token]/route.ts
│   │   └── webhooks/
│   │       └── telegram-message/route.ts
│   └── (pages)/
├── lib/
│   ├── prisma.ts
│   ├── services/
│   │   ├── recipeService.ts
│   │   ├── menuService.ts
│   │   ├── aiService.ts
│   │   └── telegramClient.ts     # HTTP client to Python
│   └── types/
└── prisma/
    └── schema.prisma

telegram_service/              # NEW - Python microservice
├── main.py                    # FastAPI app (~300 lines)
├── telegram.py                # Telethon client
├── models.py                  # Pydantic models
├── requirements.txt
└── Dockerfile
```

---

## 🔗 Next Steps

**הבא**: [תכנון שלב 1 - Infrastructure](./phases/PHASE_1_INFRASTRUCTURE.md)

---

**עדכון אחרון**: 2025-11-22
**גרסה**: 1.0.0

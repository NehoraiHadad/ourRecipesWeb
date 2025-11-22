# 🏛️ Architecture Decision Record (ADR)

תאריך: 2025-11-22
גרסה: 1.0.0

---

## 📋 סיכום החלטות

| החלטה | בחירה | חלופות שנבדקו |
|-------|-------|----------------|
| **ארכיטקטורה כוללת** | Hybrid (Next.js + Python) | Full Next.js, Keep Flask |
| **Frontend Framework** | Next.js 15 (existing) | - |
| **Backend Main** | Next.js API Routes | Flask (current) |
| **Telegram Service** | Python Microservice | gramjs (Node.js) |
| **Database** | PostgreSQL (Prisma) | SQLite (current), Drizzle |
| **ORM** | Prisma | Drizzle, TypeORM |
| **Authentication** | NextAuth.js | Custom JWT (current) |
| **AI Provider** | Google Gemini | OpenAI, Anthropic Claude |
| **Deployment** | Vercel + Railway | Render, Fly.io |

---

## 🎯 ADR-001: Hybrid Architecture

**תאריך**: 2025-11-22
**סטטוס**: ✅ Accepted

### Context
המערכת הנוכחית משתמשת ב-Flask (Python) לכל הbackend. רצינו לשפר יציבות, פשטות, ו-developer experience.

### Decision
**נעבור לארכיטקטורת Hybrid:**
- Next.js Full Stack (90% מהקוד)
- Python Microservice (10% - רק Telegram)

### Alternatives Considered

#### Option A: Next.js Full Stack בלבד ❌
```
Next.js
  ├── Frontend
  ├── API Routes (all logic)
  └── gramjs (Telegram)
```

**יתרונות**:
- ✅ טכנולוגיה אחת בלבד
- ✅ הכי פשוט לתחזוקה
- ✅ 1 deployment

**חסרונות**:
- ❌ gramjs פחות בשל מ-Telethon
- ❌ צריך ללמוד ספריה חדשה
- ❌ פחות documentation
- ❌ Background tasks מסובכים ב-Node.js

#### Option B: Hybrid (Next.js + Python) ✅ **CHOSEN**
```
Next.js (90%)
  ├── Frontend
  ├── API Routes (most logic)
  └── HTTP client to Python

Python Service (10%)
  └── Telethon only
```

**יתרונות**:
- ✅ Best of both worlds
- ✅ Telethon נשאר (proven tech)
- ✅ רוב הקוד ב-TypeScript
- ✅ Python service קטן (~300 lines)
- ✅ ברור מה כל service עושה

**חסרונות**:
- ⚠️ עדיין 2 deployments
- ⚠️ עדיין 2 טכנולוגיות

#### Option C: Keep Flask ❌
```
Next.js (Frontend)
Flask (Backend)
```

**יתרונות**:
- ✅ אין צורך במיגרציה
- ✅ הכל עובד כרגע

**חסרונות**:
- ❌ בעיות async/sync
- ❌ Timeout issues
- ❌ 2,275 שורות Flask
- ❌ SQLite בפרודקשן
- ❌ DX לא טוב

### Rationale
בחרנו ב-Hybrid כי:
1. **מקסימום TypeScript** - 90% מהקוד
2. **מינימום Python** - רק מה שצריך (Telegram)
3. **Proven Technology** - Telethon עובד מצוין
4. **Low Risk** - לא צריך ללמוד gramjs
5. **Clear Separation** - כל service עם תפקיד ברור

### Consequences
**חיובי**:
- פיתוח מהיר יותר (TypeScript)
- Type safety
- Hot reload
- תחזוקה קלה

**שלילי**:
- צריך לנהל 2 deployments
- צריך webhook communication
- Python service יכול ליפול (אבל פשוט לrestart)

---

## 🗄️ ADR-002: PostgreSQL + Prisma

**תאריך**: 2025-11-22
**סטטוס**: ✅ Accepted

### Context
המערכת הנוכחית משתמשת ב-SQLite עם SQLAlchemy. SQLite לא מתאים לפרודקשן בגלל:
- Database locked errors
- לא concurrent access
- לא scalable

### Decision
**נעבור ל-PostgreSQL עם Prisma ORM**

### Alternatives Considered

#### Option A: PostgreSQL + Drizzle ORM
**יתרונות**:
- ✅ Lightweight
- ✅ SQL-like syntax
- ✅ Great TypeScript support

**חסרונות**:
- ❌ חדש יחסית (less mature)
- ❌ פחות documentation
- ❌ פחות ecosystem

#### Option B: PostgreSQL + Prisma ✅ **CHOSEN**
**יתרונות**:
- ✅ Industry standard
- ✅ Amazing DX
- ✅ Prisma Studio (GUI)
- ✅ Type-safe queries
- ✅ Great migrations
- ✅ Excellent documentation

**חסרונות**:
- ⚠️ יותר "magic" מ-Drizzle
- ⚠️ קצת יותר כבד

#### Option C: PostgreSQL + TypeORM
**חסרונות**:
- ❌ Less active maintenance
- ❌ Decorator-heavy (not great)
- ❌ Worse DX than Prisma

### Rationale
בחרנו ב-Prisma כי:
1. **Best DX** - הכי נוח לעבוד איתו
2. **Type Safety** - מושלם
3. **Migrations** - פשוט וברור
4. **Prisma Studio** - UI מעולה
5. **Community** - גדול ופעיל

### Migration Strategy
```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Recipe {
  id          Int      @id @default(autoincrement())
  telegram_id Int      @unique
  // ... all fields from SQLAlchemy
}
```

**Migration Steps**:
1. יצירת schema ב-Prisma
2. Migration script: SQLite → PostgreSQL
3. Testing בdev
4. Production migration

---

## 🔐 ADR-003: NextAuth.js for Authentication

**תאריך**: 2025-11-22
**סטטוס**: ✅ Accepted

### Context
המערכת הנוכחית משתמשת ב-Flask-JWT-Extended עם Custom Telegram verification.

### Decision
**נעבור ל-NextAuth.js עם Custom Telegram Provider**

### Alternatives Considered

#### Option A: Custom JWT (like current)
```typescript
// app/api/auth/login/route.ts
export async function POST(req: Request) {
  const data = await req.json();
  const isValid = verifyTelegramAuth(data);
  const token = jwt.sign(payload, SECRET);
  return Response.json({ token });
}
```

**יתרונות**:
- ✅ מלא שליטה
- ✅ פשוט

**חסרונות**:
- ❌ צריך לכתוב הכל מאפס
- ❌ Session management ידני
- ❌ Refresh tokens ידני
- ❌ אין integration עם React

#### Option B: NextAuth.js ✅ **CHOSEN**
```typescript
// app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth';

export const authOptions = {
  providers: [
    {
      id: 'telegram',
      name: 'Telegram',
      type: 'credentials',
      async authorize(credentials) {
        const isValid = verifyTelegramAuth(credentials);
        if (!isValid) return null;

        const canEdit = await checkPermissions(credentials.id);
        return {
          id: credentials.id,
          name: credentials.first_name,
          canEdit
        };
      }
    }
  ],
  session: { strategy: 'jwt' }
};
```

**יתרונות**:
- ✅ Industry standard
- ✅ Session management מובנה
- ✅ `useSession()` hook
- ✅ Middleware protection
- ✅ Refresh tokens אוטומטי
- ✅ Callbacks for customization

**חסרונות**:
- ⚠️ Custom provider דורש קצת עבודה
- ⚠️ Learning curve קטן

### Rationale
NextAuth.js נותן לנו:
1. **Session Management** - מובנה ועובד
2. **React Integration** - `useSession()`
3. **Middleware** - Route protection
4. **Proven** - משתמשים בו המון אפליקציות

### Implementation
```typescript
// Custom Telegram provider
export function TelegramProvider(options) {
  return {
    id: 'telegram',
    name: 'Telegram',
    type: 'credentials',

    credentials: {
      id: { type: 'text' },
      first_name: { type: 'text' },
      username: { type: 'text' },
      photo_url: { type: 'text' },
      auth_date: { type: 'text' },
      hash: { type: 'text' }
    },

    async authorize(credentials) {
      // Verify HMAC-SHA256
      const dataCheckString = Object.keys(credentials)
        .filter(key => key !== 'hash')
        .sort()
        .map(key => `${key}=${credentials[key]}`)
        .join('\n');

      const secretKey = crypto
        .createHash('sha256')
        .update(options.botToken)
        .digest();

      const hmac = crypto
        .createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

      if (hmac !== credentials.hash) {
        return null;
      }

      // Check permissions
      const canEdit = await checkChannelMembership(credentials.id);

      return {
        id: credentials.id,
        name: credentials.first_name,
        username: credentials.username,
        image: credentials.photo_url,
        canEdit
      };
    }
  };
}
```

---

## 🤖 ADR-004: Google Gemini for AI

**תאריך**: 2025-11-22
**סטטוס**: ✅ Accepted (keep current)

### Context
המערכת הנוכחית משתמשת ב-Google Gemini למגוון משימות AI.

### Decision
**נשאר עם Google Gemini** (אין שינוי)

### Alternatives Considered

#### Option A: OpenAI GPT-4
**יתרונות**:
- ✅ איכות טובה מאוד
- ✅ Documentation מצוינת

**חסרונות**:
- ❌ יקר יותר
- ❌ אין Function Calling חינם
- ❌ Rate limits נמוכים יותר

#### Option B: Anthropic Claude
**יתרונות**:
- ✅ איכות מעולה
- ✅ Context window גדול

**חסרונות**:
- ❌ יקר
- ❌ אין free tier

#### Option C: Google Gemini ✅ **KEEP CURRENT**
**יתרונות**:
- ✅ Free tier מצוין
- ✅ Function Calling מובנה
- ✅ עובד עם עברית מצוין
- ✅ Multimodal (text + images)
- ✅ כבר עובד במערכת

**חסרונות**:
- ⚠️ לפעמים פחות טוב מ-GPT-4

### Rationale
נשאר עם Gemini כי:
1. **זה עובד** - המערכת כבר משתמשת בזה
2. **Free Tier** - חיסכון משמעותי
3. **Function Calling** - חינם!
4. **עברית** - תמיכה מצוינת

### Node.js Implementation
```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

export async function generateRecipe(params: RecipeParams) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash'
  });

  const result = await model.generateContent(prompt);
  return result.response.text();
}

// Function calling for menu generation
export async function generateMenu(preferences: MenuPreferences) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    tools: [{
      functionDeclarations: [
        {
          name: 'get_all_recipes',
          description: 'Get catalog of all available recipes',
          parameters: { type: 'object', properties: {} }
        }
      ]
    }]
  });

  // ... function calling loop
}
```

**✅ Gemini SDK עובד מצוין ב-Node.js!**

---

## 🚀 ADR-005: Vercel + Railway Deployment

**תאריך**: 2025-11-22
**סטטוס**: ✅ Accepted

### Context
המערכת הנוכחית:
- Frontend: Vercel
- Backend: Render (free tier → sleep issues)

### Decision
**Next.js על Vercel, Python Service על Railway**

### Alternatives Considered

#### Option A: All on Vercel
**בעיה**: Vercel לא תומך ב-long-running processes (Telegram monitoring)

#### Option B: All on Render
**בעיה**: Next.js יותר טוב על Vercel (native support)

#### Option C: Vercel + Railway ✅ **CHOSEN**
```
Next.js → Vercel
  - Instant deployment
  - Edge functions
  - PostgreSQL (Vercel Postgres)
  - Zero config

Python → Railway
  - Docker support
  - Always on (no sleep)
  - Background processes
  - Free tier: $5 credit/month
```

**יתרונות**:
- ✅ כל פלטפורמה למה שהיא הכי טובה
- ✅ Next.js native על Vercel
- ✅ Railway תומך ב-background processes
- ✅ Railway free tier ($5 credit)
- ✅ Auto-deploy מ-GitHub

**חסרונות**:
- ⚠️ 2 platforms לנהל

#### Option D: Vercel + Fly.io
**דומה ל-Railway**, אבל Railway יותר user-friendly

### Cost Comparison

| Platform | Next.js | Python | DB | Total |
|----------|---------|--------|-----|-------|
| **Vercel + Railway** | $0 | $0-5 | $0 | **$0-5** |
| **Render** (current) | $0 | $7-20 | $0 | **$7-20** |
| **All Vercel** | $0 | N/A | $0 | Not possible |

### Rationale
1. **Vercel for Next.js** - native, fast, easy
2. **Railway for Python** - supports background tasks, no sleep
3. **Cost** - זול יותר מRender
4. **DX** - שני הפלטפורמות עם DX מעולה

---

## 🔗 ADR-006: Webhook Communication (Next.js ↔ Python)

**תאריך**: 2025-11-22
**סטטוס**: ✅ Accepted

### Context
Next.js צריך לתקשר עם Python service ל-Telegram operations.

### Decision
**HTTP Webhooks עם HMAC signature verification**

### Architecture

#### Next.js → Python (Synchronous)
```typescript
// app/api/recipes/route.ts
export async function POST(req: Request) {
  const data = await req.json();

  // Save to DB
  const recipe = await prisma.recipe.create({ data });

  // Send to Telegram
  const response = await fetch(
    `${process.env.TELEGRAM_SERVICE_URL}/telegram/send-message`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.TELEGRAM_SERVICE_API_KEY
      },
      body: JSON.stringify({
        channel: process.env.CHANNEL_URL,
        content: recipe.content,
        image_url: recipe.image_url
      })
    }
  );

  const { message_id } = await response.json();

  // Update recipe with Telegram message ID
  await prisma.recipe.update({
    where: { id: recipe.id },
    data: { message_id }
  });

  return Response.json(recipe);
}
```

#### Python → Next.js (Asynchronous via Webhook)
```python
# telegram_service/background_monitoring.py
async def monitor_old_channel():
    @telegram_client.on(events.NewMessage(chats=OLD_CHANNEL))
    async def handler(event):
        # Copy to new channel
        new_msg = await telegram_client.send_message(...)

        # Calculate HMAC signature
        payload = json.dumps({
            "message_id": new_msg.id,
            "content": event.text
        })

        signature = hmac.new(
            WEBHOOK_SECRET.encode(),
            payload.encode(),
            hashlib.sha256
        ).hexdigest()

        # Send webhook to Next.js
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{NEXTJS_URL}/api/webhooks/telegram-message",
                json=json.loads(payload),
                headers={'X-Telegram-Signature': signature}
            )
```

```typescript
// app/api/webhooks/telegram-message/route.ts
export async function POST(req: Request) {
  const signature = req.headers.get('x-telegram-signature');
  const body = await req.text();

  // Verify signature
  const expectedSignature = crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET!)
    .update(body)
    .digest('hex');

  if (signature !== expectedSignature) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const data = JSON.parse(body);

  // Process new message
  await prisma.recipe.create({
    data: {
      message_id: data.message_id,
      content: data.content,
      // ...
    }
  });

  return Response.json({ success: true });
}
```

### Security
- **API Key** - Next.js → Python (simple bearer token)
- **HMAC Signature** - Python → Next.js (prevent tampering)
- **HTTPS** - כל התקשורת encrypted

---

## 📊 Decision Summary

| Area | Decision | Why |
|------|----------|-----|
| **Architecture** | Hybrid (Next.js + Python) | Best of both worlds |
| **Database** | PostgreSQL + Prisma | Production-ready, great DX |
| **Auth** | NextAuth.js | Industry standard |
| **AI** | Google Gemini (keep) | Free, works great |
| **Deployment** | Vercel + Railway | Optimal, cheap |
| **Communication** | HTTP Webhooks | Simple, secure |

---

**הבא**: [שלב 1 - Infrastructure](./phases/PHASE_1_INFRASTRUCTURE.md)

**עדכון אחרון**: 2025-11-22

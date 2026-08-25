> ⚠️ **מסמך זה הוחלף (2026-08-25).** הארכיטקטורה והתוכנית העדכניות: [`docs/architecture/`](../architecture/ARCHITECTURE.md). התיקייה הזו תימחק בסיום המימוש.
# 🔄 Refactor to Hybrid Architecture - Master Plan

## 📋 סקירה כללית

תוכנית זו מתארת את המעבר מארכיטקטורת **Flask + Next.js** לארכיטקטורת **Hybrid** משופרת:
- **Next.js Full Stack** - לכל הלוגיקה העסקית, CRUD, Authentication
- **Python Microservice** - רק עבור Telegram operations (Telethon)

## 🎯 מטרות הרפקטור

### יציבות
- ✅ פתרון בעיות async/sync mixing ב-Flask
- ✅ הפחתת timeouts וזמני תגובה
- ✅ שיפור error handling ו-recovery

### פשטות
- ✅ הפחתת complexity - 90% בטכנולוגיה אחת (TypeScript)
- ✅ מעבר מ-2,275 שורות Flask ל-~300 שורות Python מינימליות
- ✅ Type safety מלא בין Frontend ל-Backend

### עלות ותחזוקה
- ✅ הפחתת עלויות deployment (Vercel + Railway free tier)
- ✅ Developer Experience משופר - Hot reload מהיר
- ✅ קל יותר לתחזוקה לטווח ארוך

## 📁 מבנה התיקייה

```
docs/refactor/
├── README.md                           # קובץ זה - מפת הדרכים
├── REFACTOR_PLAN.md                    # תוכנית הרפקטור המפורטת
├── CURRENT_STATE.md                    # מיפוי המצב הנוכחי
├── ARCHITECTURE_DECISION.md            # החלטות ארכיטקטוניות
│
├── phases/                             # תוכניות שלב-אחר-שלב
│   ├── PHASE_1_INFRASTRUCTURE.md       # תשתיות - Prisma, Next.js API
│   ├── PHASE_2_API_MIGRATION.md        # העברת API Routes
│   ├── PHASE_3_AUTH_MIGRATION.md       # העברת Authentication
│   ├── PHASE_4_TELEGRAM_SERVICE.md     # Telegram Microservice
│   └── PHASE_5_DEPLOYMENT.md           # Deployment ו-Testing
│
├── mappings/                           # מיפוי קוד Flask → Next.js
│   ├── routes-mapping.md               # מיפוי Routes
│   ├── models-to-prisma.md             # המרת SQLAlchemy → Prisma
│   ├── services-mapping.md             # מיפוי Services
│   └── api-endpoints.md                # רשימת כל ה-endpoints
│
└── decisions/                          # החלטות טכניות
    ├── why-prisma.md                   # למה Prisma ולא Drizzle
    ├── why-nextauth.md                 # למה NextAuth.js
    ├── telegram-communication.md       # איך Next.js מדבר עם Python
    └── deployment-strategy.md          # אסטרטגיית Deployment
```

## 🗺️ מפת דרכים (Roadmap)

### ✅ שלב 0: הכנה ותיעוד (השבוע)
- [x] יצירת מבנה תיקיות
- [ ] מיפוי קוד נוכחי
- [ ] תיעוד החלטות ארכיטקטוניות
- [ ] הכנת תוכניות לכל שלב

### 🔄 שלב 1: תשתיות (שבוע 1-2)
- [ ] Setup Prisma
- [ ] יצירת Database Schema
- [ ] Setup Next.js API Routes infrastructure
- [ ] הכנת Types משותפים
- [ ] Migration של Database

**קובץ מפורט**: [phases/PHASE_1_INFRASTRUCTURE.md](./phases/PHASE_1_INFRASTRUCTURE.md)

### 🔄 שלב 2: העברת API Routes (שבוע 2-3)
- [ ] העברת `/recipes` endpoints
- [ ] העברת `/menus` endpoints
- [ ] העברת `/categories` endpoints
- [ ] העברת `/users` endpoints
- [ ] Testing כל endpoint

**קובץ מפורט**: [phases/PHASE_2_API_MIGRATION.md](./phases/PHASE_2_API_MIGRATION.md)

### 🔄 שלב 3: Authentication (שבוע 3-4)
- [ ] Setup NextAuth.js
- [ ] Custom Telegram Provider
- [ ] JWT Strategy
- [ ] Session Management
- [ ] Middleware Protection

**קובץ מפורט**: [phases/PHASE_3_AUTH_MIGRATION.md](./phases/PHASE_3_AUTH_MIGRATION.md)

### 🔄 שלב 4: Telegram Microservice (שבוע 4-5)
- [ ] יצירת FastAPI service
- [ ] Telethon integration
- [ ] Webhook endpoints
- [ ] Background monitoring task
- [ ] Communication protocol עם Next.js

**קובץ מפורט**: [phases/PHASE_4_TELEGRAM_SERVICE.md](./phases/PHASE_4_TELEGRAM_SERVICE.md)

### 🔄 שלב 5: Deployment & Testing (שבוע 5-6)
- [ ] Setup Vercel deployment
- [ ] Setup Railway/Render for Python
- [ ] Environment variables
- [ ] Integration testing
- [ ] Performance testing
- [ ] Rollback strategy

**קובץ מפורט**: [phases/PHASE_5_DEPLOYMENT.md](./phases/PHASE_5_DEPLOYMENT.md)

## 📊 התקדמות כוללת

```
[░░░░░░░░░░░░░░░░░░░░] 0% - שלב הכנה
```

**עדכון אחרון**: 2025-11-22
**סטטוס**: 📝 תכנון והכנה

## 🔗 קישורים מהירים

- [תוכנית הרפקטור המפורטת](./REFACTOR_PLAN.md)
- [מיפוי המצב הנוכחי](./CURRENT_STATE.md)
- [החלטות ארכיטקטוניות](./ARCHITECTURE_DECISION.md)
- [מיפוי Routes](./mappings/routes-mapping.md)
- [מיפוי Models](./mappings/models-to-prisma.md)

## 📝 הערות חשובות

### עקרונות המעבר
1. **מעבר הדרגתי** - לא "Big Bang", כל שלב עצמאי
2. **Backward compatibility** - שמירה על API contracts
3. **Testing בכל שלב** - לא עוברים לשלב הבא בלי tests
4. **Documentation first** - מתעדים לפני שמממשים
5. **Rollback ready** - כל שלב ניתן לביטול

### סיכונים וצמצומם
- ⚠️ **Database migration** - נעשה בסביבת dev קודם
- ⚠️ **Breaking changes** - נשמור API compatibility
- ⚠️ **Telegram downtime** - נעביר בשעות שקטות
- ⚠️ **Session management** - נוודא המשכיות

### קריטריוני הצלחה
- ✅ כל ה-endpoints עובדים
- ✅ Performance שווה או טוב יותר
- ✅ אין breaking changes למשתמשים
- ✅ Tests עוברים 100%
- ✅ Documentation מעודכן

## 👥 צוות

**Developer**: Claude Code + User
**Reviewer**: User
**Timeline**: 5-6 שבועות (גמיש)

## 📅 Timeline משוער

```
שבוע 1-2:  ████████░░░░░░░░░░░░  Infrastructure
שבוע 2-3:  ░░░░░░░░████████░░░░  API Migration
שבוע 3-4:  ░░░░░░░░░░░░████████  Auth Migration
שבוע 4-5:  ░░░░░░░░░░░░░░░░████  Telegram Service
שבוע 5-6:  ░░░░░░░░░░░░░░░░░░██  Deployment & Testing
```

---

**הערה**: זהו מסמך חי ויתעדכן במהלך הרפקטור. כל החלטה או שינוי יתועדו כאן.

**גרסה**: 1.0.0
**תאריך יצירה**: 2025-11-22
**עדכון אחרון**: 2025-11-22

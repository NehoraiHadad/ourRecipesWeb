# 🚀 Phase 5: Deployment & Testing

**Timeline**: שבוע 7 (10-14 שעות)
**Status**: 📝 Planned
**Dependencies**: Phases 2, 3, 4 complete

---

## 🎯 Phase Goals

להעלות את המערכת המשודרגת לproduction ולבצע testing מקיף.

**קריטריון הצלחה**:
- Next.js deployed to Vercel
- Python service deployed to Railway
- All endpoints work in production
- E2E tests pass
- Zero downtime migration
- Performance acceptable

---

## 📋 Tasks Breakdown

### Task 5.1: Vercel Deployment (2-3 hours)
**Goal**: Deploy Next.js app to Vercel

**Steps**:
1. Create Vercel project
2. Connect to GitHub repo
3. Configure environment variables
4. Setup PostgreSQL (Vercel Postgres or Supabase)
5. Deploy and test

**Environment Variables (Vercel)**:
```env
# Database
DATABASE_URL=postgresql://...

# Auth
NEXTAUTH_URL=https://our-recipes.vercel.app
NEXTAUTH_SECRET=xxx

# AI
GOOGLE_API_KEY=xxx
HUGGINGFACE_TOKEN=xxx

# Telegram Service
TELEGRAM_SERVICE_URL=https://telegram-service.up.railway.app
TELEGRAM_WEBHOOK_SECRET=xxx
```

---

### Task 5.2: Railway Deployment (2-3 hours)
**Goal**: Deploy Python Telegram service to Railway

**Steps**:
1. Create Railway project
2. Deploy from GitHub
3. Configure environment variables
4. Setup health checks
5. Test Telegram connection

**Environment Variables (Railway)**:
```env
# Telegram
SESSION_STRING=xxx
API_ID=xxx
API_HASH=xxx
CHANNEL_URL=https://t.me/...
OLD_CHANNEL_URL=https://t.me/...

# Next.js
NEXTJS_URL=https://our-recipes.vercel.app
WEBHOOK_SECRET=xxx
```

---

### Task 5.3: Database Migration (2-3 hours)
**Goal**: Migrate data from SQLite to PostgreSQL

**Steps**:
1. Export data from SQLite (production)
2. Run Prisma migrations on PostgreSQL
3. Import data to PostgreSQL
4. Verify data integrity
5. Test in staging

**Migration Script**:
```bash
# Export from SQLite
python scripts/export-sqlite.py > data.json

# Import to PostgreSQL
DATABASE_URL=postgresql://... node scripts/import-data.js
```

---

### Task 5.4: Integration Testing (2-3 hours)
**Goal**: Test all endpoints in production

**Test Plan**:
```typescript
// tests/e2e/production.test.ts

describe('Production E2E Tests', () => {
  it('should login with Telegram', async () => {
    // Test Telegram auth flow
  });

  it('should search recipes', async () => {
    // Test search endpoint
  });

  it('should generate menu with AI', async () => {
    // Test menu AI generation
  });

  it('should create recipe (Telegram)', async () => {
    // Test create + Telegram sync
  });

  it('should handle errors gracefully', async () => {
    // Test error handling
  });
});
```

**Run Tests**:
```bash
# Against production
NEXT_PUBLIC_API_URL=https://our-recipes.vercel.app npm run test:e2e
```

---

### Task 5.5: Performance Testing (1-2 hours)
**Goal**: Verify performance meets requirements

**Metrics to Test**:
- API response times
- Page load times
- Database query performance
- AI generation speed

**Tools**:
- Lighthouse (frontend)
- k6 (load testing)
- Vercel Analytics
- Railway metrics

**Benchmarks**:
```bash
# Load testing with k6
k6 run tests/load/api-test.js

# Expected:
# - GET /api/recipes: <100ms (p95)
# - POST /api/recipes/suggest: <5s (p95)
# - POST /api/menus/generate-preview: <60s (p95)
```

---

### Task 5.6: Migration Strategy (2-3 hours)
**Goal**: Plan and execute zero-downtime migration

**Strategy**: Gradual Cutover

**Phase 1**: Parallel Running (1 week)
```
Users → Frontend
         ├── Next.js API (new)
         └── Flask API (old, fallback)
```

**Phase 2**: Switch (Day 8)
```
Users → Frontend → Next.js API (primary)
                   Flask API (off)
```

**Implementation**:
```typescript
// Frontend API client
const API_BASE = process.env.NEXT_PUBLIC_USE_NEW_API === 'true'
  ? '/api'              // Next.js
  : 'https://flask.../api';  // Flask (fallback)
```

**Monitoring**:
- Track error rates (Next.js vs Flask)
- Compare response times
- Monitor Telegram sync
- Watch for regressions

---

### Task 5.7: Monitoring & Logging (1-2 hours)
**Goal**: Setup production monitoring

**Tools**:
- **Vercel**: Built-in analytics + logs
- **Railway**: Logs + metrics
- **Sentry**: Error tracking (optional)
- **Logtail**: Centralized logging (optional)

**Setup**:
```typescript
// lib/logger.ts
import { createLogger } from 'winston';
import { Logtail } from '@logtail/node';

const logtail = new Logtail(process.env.LOGTAIL_TOKEN!);

export const logger = createLogger({
  transports: [
    new winston.transports.Console(),
    new LogtailTransport(logtail)
  ]
});
```

---

## 📊 Success Criteria Checklist

### Deployment:
- [ ] Next.js deployed to Vercel
- [ ] Python service deployed to Railway
- [ ] Database migrated to PostgreSQL
- [ ] Environment variables set
- [ ] DNS configured

### Functionality:
- [ ] All Phase 2 endpoints work
- [ ] NextAuth login works
- [ ] Telegram operations work
- [ ] AI features work
- [ ] Background monitoring active

### Performance:
- [ ] API response times acceptable
- [ ] No N+1 queries
- [ ] Frontend loads fast
- [ ] AI generation completes

### Testing:
- [ ] E2E tests pass
- [ ] Load tests pass
- [ ] Error handling works
- [ ] No console errors

### Monitoring:
- [ ] Logs accessible
- [ ] Errors tracked
- [ ] Metrics dashboard
- [ ] Alerts configured

---

## 🔄 Rollback Plan

**If production fails:**

1. **Immediate**: Switch frontend to Flask fallback
   ```bash
   # Vercel environment variable
   NEXT_PUBLIC_USE_NEW_API=false
   ```

2. **Database**: Keep SQLite backup
   ```bash
   # Rollback PostgreSQL to SQLite
   python scripts/rollback-db.py
   ```

3. **Services**: Keep Flask running in parallel for 2 weeks

---

## 📊 Timeline

### Week 7: Deployment
- **Day 1**: Deploy to staging (Vercel + Railway)
- **Day 2**: Database migration to staging
- **Day 3**: Integration testing
- **Day 4**: Performance testing
- **Day 5**: Deploy to production (parallel running)

### Week 8: Monitoring
- **Day 1-7**: Monitor production, compare metrics
- **Day 8**: Full cutover (disable Flask)

### Week 9: Stabilization
- **Day 1-7**: Fix any issues, optimize performance

---

## 🎓 Resources

- [Vercel Deployment Docs](https://vercel.com/docs)
- [Railway Docs](https://docs.railway.app/)
- [Prisma Migrations](https://www.prisma.io/docs/concepts/components/prisma-migrate)
- [k6 Load Testing](https://k6.io/docs/)

---

## 🎯 Final Success Metrics

After Phase 5 completion:

**Functionality**:
- ✅ 100% of Phase 2 endpoints migrated
- ✅ 100% of Phase 3 auth working
- ✅ 100% of Phase 4 Telegram working
- ✅ Zero downtime migration

**Performance**:
- ✅ API response times < 200ms (p95)
- ✅ Frontend load time < 2s
- ✅ Zero critical errors
- ✅ 99.9% uptime

**Quality**:
- ✅ Test coverage > 80%
- ✅ No console errors
- ✅ All Lighthouse scores > 90
- ✅ Security headers configured

---

## 🚀 Post-Launch

**Week 10+**: Cleanup & Optimization

1. **Remove Flask**: Decommission old backend
2. **Optimize**: Reduce bundle size, improve performance
3. **Features**: Add new features (now easier!)
4. **Refactor**: Clean up technical debt
5. **Document**: Update docs with final architecture

---

**Created**: 2025-11-22
**Status**: 📝 Planned
**The End**: Refactor complete! 🎉

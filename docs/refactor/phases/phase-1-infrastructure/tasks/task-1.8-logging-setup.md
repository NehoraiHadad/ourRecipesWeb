# 📋 Task 1.8: Logging Setup (Pino)

**מזהה**: TASK-1.8
**שלב**: Phase 1 - Infrastructure
**סטטוס**: ⬜ Not Started
**Estimated Time**: 1-2 hours

---

## 🎯 Goal

להקים מערכת logging מובנית עם Pino לכל הפרויקט - structured logs, different levels, production-ready.

### Why This Task?
- Debug issues בproduction
- Monitor performance
- Audit trail
- Structured data (JSON logs)
- Better than console.log

---

## 📦 Prerequisites

**חייב להשלים לפני:**
- None (יכול לרוץ במקביל!)

---

## 📋 Implementation Guide

### Step 1: Install Pino

**Commands:**
```bash
cd frontend/ourRecipesFront

# Pino core
npm install pino

# Pretty printing for dev (optional but recommended)
npm install -D pino-pretty
```

---

### Step 2: Create Logger Instance

**קובץ ליצור:** `lib/logger.ts`

**תוכן:**
```typescript
/**
 * Centralized logger using Pino
 */
import pino from 'pino';

/**
 * Logger configuration based on environment
 */
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Create logger instance
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),

  // Production: JSON logs for parsing
  // Development: Pretty print for readability
  ...(!isProduction && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
        singleLine: false
      }
    }
  }),

  // Base fields for all logs
  base: {
    env: process.env.NODE_ENV,
    revision: process.env.VERCEL_GIT_COMMIT_SHA || 'local'
  },

  // Timestamp
  timestamp: pino.stdTimeFunctions.isoTime,

  // Redact sensitive fields
  redact: {
    paths: [
      'password',
      'token',
      'apiKey',
      'secret',
      '*.password',
      '*.token',
      'req.headers.authorization',
      'req.headers.cookie'
    ],
    remove: true
  }
});

/**
 * Create child logger with context
 */
export function createLogger(context: string | object) {
  if (typeof context === 'string') {
    return logger.child({ context });
  }
  return logger.child(context);
}

/**
 * Type-safe log levels
 */
export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}

/**
 * Structured log data
 */
export interface LogData {
  [key: string]: any;
}

/**
 * Helper: Log with structured data
 */
export function log(
  level: LogLevel,
  message: string,
  data?: LogData
): void {
  if (data) {
    logger[level](data, message);
  } else {
    logger[level](message);
  }
}

// Export logger as default
export default logger;
```

---

### Step 3: Create API Request Logger Middleware

**קובץ ליצור:** `lib/middleware/request-logger.ts`

**תוכן:**
```typescript
/**
 * Request logging middleware for API routes
 */
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

/**
 * Log API requests
 */
export async function logRequest(
  request: NextRequest,
  handler: () => Promise<Response>
): Promise<Response> {
  const startTime = Date.now();
  const { method, url, headers } = request;
  const pathname = new URL(url).pathname;

  // Log request
  logger.info({
    type: 'request',
    method,
    path: pathname,
    userAgent: headers.get('user-agent') || 'unknown',
    ip: headers.get('x-forwarded-for') || headers.get('x-real-ip') || 'unknown'
  }, `${method} ${pathname}`);

  let response: Response;
  let error: any;

  try {
    // Execute handler
    response = await handler();
  } catch (err) {
    error = err;
    // Log error
    logger.error({
      type: 'request_error',
      method,
      path: pathname,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined
    }, `${method} ${pathname} - Error`);

    // Re-throw to be handled by error handler
    throw err;
  } finally {
    const duration = Date.now() - startTime;

    if (!error) {
      // Log response
      logger.info({
        type: 'response',
        method,
        path: pathname,
        status: response!.status,
        duration
      }, `${method} ${pathname} - ${response!.status} (${duration}ms)`);
    }
  }

  return response;
}

/**
 * Wrapper for route handlers
 */
export function withLogging(
  handler: (req: NextRequest, context?: any) => Promise<Response>
) {
  return async (req: NextRequest, context?: any) => {
    return logRequest(req, () => handler(req, context));
  };
}
```

---

### Step 4: Create Structured Logging Helpers

**קובץ ליצור:** `lib/utils/log-helpers.ts`

**תוכן:**
```typescript
/**
 * Structured logging helpers
 */
import { logger } from '@/lib/logger';

/**
 * Log database query
 */
export function logDatabaseQuery(
  model: string,
  operation: string,
  duration: number,
  recordCount?: number
) {
  logger.debug({
    type: 'database',
    model,
    operation,
    duration,
    recordCount
  }, `DB: ${model}.${operation} (${duration}ms)`);
}

/**
 * Log external API call
 */
export function logExternalApiCall(
  service: string,
  endpoint: string,
  method: string,
  duration: number,
  status?: number
) {
  logger.info({
    type: 'external_api',
    service,
    endpoint,
    method,
    duration,
    status
  }, `API: ${service} ${method} ${endpoint} - ${status} (${duration}ms)`);
}

/**
 * Log Telegram operation
 */
export function logTelegramOperation(
  operation: 'send' | 'edit' | 'delete',
  messageId?: number,
  success = true,
  error?: string
) {
  const level = success ? 'info' : 'error';

  logger[level]({
    type: 'telegram',
    operation,
    messageId,
    success,
    error
  }, `Telegram: ${operation} ${messageId ? `#${messageId}` : ''} - ${success ? 'Success' : 'Failed'}`);
}

/**
 * Log AI operation
 */
export function logAiOperation(
  provider: 'gemini' | 'huggingface',
  operation: string,
  duration: number,
  tokensUsed?: number,
  cost?: number
) {
  logger.info({
    type: 'ai',
    provider,
    operation,
    duration,
    tokensUsed,
    cost
  }, `AI: ${provider} ${operation} (${duration}ms, ${tokensUsed} tokens, $${cost?.toFixed(4) || 0})`);
}

/**
 * Log authentication event
 */
export function logAuthEvent(
  event: 'login' | 'logout' | 'failed_login',
  userId?: string,
  details?: Record<string, any>
) {
  logger.info({
    type: 'auth',
    event,
    userId,
    ...details
  }, `Auth: ${event} ${userId ? `user=${userId}` : ''}`);
}

/**
 * Log performance metric
 */
export function logPerformance(
  operation: string,
  duration: number,
  metadata?: Record<string, any>
) {
  const level = duration > 1000 ? 'warn' : 'debug';

  logger[level]({
    type: 'performance',
    operation,
    duration,
    ...metadata
  }, `Performance: ${operation} took ${duration}ms`);
}

/**
 * Measure and log execution time
 */
export async function measureExecutionTime<T>(
  operation: string,
  fn: () => Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await fn();
    const duration = Date.now() - startTime;

    logPerformance(operation, duration, metadata);

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error({
      type: 'performance',
      operation,
      duration,
      error: error instanceof Error ? error.message : String(error),
      ...metadata
    }, `Performance: ${operation} failed after ${duration}ms`);

    throw error;
  }
}
```

---

### Step 5: Create Example Usage

**קובץ ליצור:** `app/api/_example-with-logging/route.ts`

**תוכן:**
```typescript
/**
 * Example API route with logging
 * DELETE THIS FILE after understanding the pattern!
 */
import { NextRequest } from 'next/server';
import { withLogging } from '@/lib/middleware/request-logger';
import { logger } from '@/lib/logger';
import {
  logDatabaseQuery,
  measureExecutionTime
} from '@/lib/utils/log-helpers';
import { successResponse, handleApiError } from '@/lib/utils/api-response';
import { prisma } from '@/lib/prisma';

async function handler(request: NextRequest) {
  try {
    logger.debug('Fetching recipes with filters');

    // Measure DB query time
    const recipes = await measureExecutionTime(
      'prisma.recipe.findMany',
      async () => {
        const startTime = Date.now();
        const result = await prisma.recipe.findMany({
          take: 10,
          orderBy: { created_at: 'desc' }
        });
        const duration = Date.now() - startTime;

        // Log database query
        logDatabaseQuery('Recipe', 'findMany', duration, result.length);

        return result;
      }
    );

    logger.info({ count: recipes.length }, 'Successfully fetched recipes');

    return successResponse(recipes);
  } catch (error) {
    logger.error({ error }, 'Failed to fetch recipes');
    return handleApiError(error);
  }
}

// Export with logging middleware
export const GET = withLogging(handler);
```

---

### Step 6: Update Environment Variables

**מה לעשות:**
- [ ] הוסף LOG_LEVEL ל-.env.local

**Update `.env.local`:**
```env
# Logging
LOG_LEVEL=debug  # trace|debug|info|warn|error|fatal
```

**Update `.env.example`:**
```env
# Logging
LOG_LEVEL=info  # Set to debug for development, info for production
```

---

### Step 7: Create Logging Documentation

**קובץ ליצור:** `docs/refactor/logging-guide.md`

**תוכן:**
```markdown
# Logging Guide

## Overview

We use **Pino** for structured logging across the application.

## Log Levels

From lowest to highest severity:
- **trace**: Very detailed debugging
- **debug**: Debugging information
- **info**: General information (default)
- **warn**: Warning messages
- **error**: Error messages
- **fatal**: Fatal errors (app crash)

Set level with `LOG_LEVEL` env var.

## Basic Usage

\`\`\`typescript
import { logger } from '@/lib/logger';

// Simple message
logger.info('User logged in');

// With structured data
logger.info({ userId: 123, email: 'user@example.com' }, 'User logged in');

// Different levels
logger.debug('Debugging info');
logger.warn('Something suspicious');
logger.error({ error: err }, 'Operation failed');
\`\`\`

## Child Loggers

Create contextual loggers:

\`\`\`typescript
import { createLogger } from '@/lib/logger';

const apiLogger = createLogger('api');
apiLogger.info('API request received');

const dbLogger = createLogger({ module: 'database', operation: 'migration' });
dbLogger.info('Migration started');
\`\`\`

## API Route Logging

Use \`withLogging\` wrapper:

\`\`\`typescript
import { withLogging } from '@/lib/middleware/request-logger';

async function handler(request: NextRequest) {
  // Your logic
}

export const GET = withLogging(handler);
\`\`\`

This automatically logs:
- Request (method, path, user agent, IP)
- Response (status, duration)
- Errors (if thrown)

## Structured Logging Helpers

\`\`\`typescript
import {
  logDatabaseQuery,
  logExternalApiCall,
  logTelegramOperation,
  logAiOperation,
  measureExecutionTime
} from '@/lib/utils/log-helpers';

// Database
logDatabaseQuery('Recipe', 'findMany', 45, 10);

// External API
logExternalApiCall('Gemini', '/generate', 'POST', 1200, 200);

// Telegram
logTelegramOperation('send', 12345, true);

// AI
logAiOperation('gemini', 'generate', 800, 150, 0.0015);

// Performance
const result = await measureExecutionTime('complex-operation', async () => {
  // Your code
  return data;
});
\`\`\`

## Log Output

### Development
Pretty-printed, colorized:
\`\`\`
[14:32:15] INFO: User logged in
    userId: 123
    email: "user@example.com"
\`\`\`

### Production
JSON for log aggregation:
\`\`\`json
{"level":30,"time":"2024-11-22T14:32:15.123Z","userId":123,"email":"user@example.com","msg":"User logged in"}
\`\`\`

## Best Practices

1. **Use structured data**: \`logger.info({ data }, 'message')\`
2. **Don't log sensitive info**: Passwords, tokens, etc. (auto-redacted)
3. **Use appropriate levels**: debug for dev, info for production events
4. **Add context**: Include relevant IDs, operations
5. **Measure performance**: Use \`measureExecutionTime\`

## Viewing Logs

### Development
```bash
npm run dev
# Logs print to console with colors
```

### Production (Vercel)
```bash
vercel logs <deployment-url>
# Or view in Vercel Dashboard
```

## Redacted Fields

These fields are automatically removed from logs:
- password
- token
- apiKey
- secret
- req.headers.authorization
- req.headers.cookie

## Environment Variables

\`\`\`env
LOG_LEVEL=debug  # trace|debug|info|warn|error|fatal
\`\`\`

Set to:
- \`debug\` in development
- \`info\` in production
- \`error\` to only log errors
```

---

## ✅ Success Criteria

### Functional Requirements:
- [x] Pino installed and configured
- [x] Logger instance created
- [x] Request logging middleware created
- [x] Structured logging helpers created
- [x] Example usage demonstrated
- [x] Documentation written

### Technical Requirements:
- [x] Logs appear in console (dev)
- [x] Logs are JSON in production
- [x] Sensitive fields redacted
- [x] Log levels work correctly

### Code Quality:
- [x] Structured logging used
- [x] Context-aware loggers
- [x] Performance measurable

---

## 🧪 Testing Instructions

### Manual Testing:

**Test 1: Basic Logging**
```typescript
// Create test file: test-logger.ts
import { logger } from '@/lib/logger';

logger.trace('Trace message');
logger.debug('Debug message');
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message');

logger.info({ user: 'test', action: 'login' }, 'User action');
```

**Run:**
```bash
npx tsx test-logger.ts
```

**Expected (dev):**
- Colorized output
- Structured data visible
- Timestamps shown

**Test 2: Request Logging**
```bash
# Start dev server
npm run dev

# Make request
curl http://localhost:3000/api/_example-with-logging

# Check console for:
# - Request log (method, path, IP)
# - Response log (status, duration)
```

**Test 3: Redaction**
```typescript
logger.info({
  user: 'test',
  password: 'secret123',  // Should be redacted
  token: 'abc123'         // Should be redacted
}, 'Test redaction');
```

**Expected:** password and token not in output

---

## 🔄 Rollback Strategy

**אם יש בעיות:**

```bash
# Uninstall
npm uninstall pino pino-pretty

# Remove files
rm lib/logger.ts
rm lib/middleware/request-logger.ts
rm lib/utils/log-helpers.ts
```

---

## 📊 Estimated Time

- **Minimum**: 1 hour
- **Expected**: 1.5 hours
- **Maximum**: 2 hours

**Breakdown:**
- Install & config: 15 min
- Logger setup: 20 min
- Middleware: 20 min
- Helpers: 25 min
- Documentation: 20 min
- Testing: 10 min

---

## 📝 Implementation Notes

### Important Considerations:

**1. Production Logs:**
- JSON format for parsing by log aggregators
- No pretty printing (performance)
- Structured data for querying

**2. Development Logs:**
- Pretty printed for readability
- Colors for different levels
- Single-line or multi-line format

**3. Redaction:**
- Automatic for sensitive fields
- Add more paths as needed
- Better than manual filtering

**4. Performance:**
- Pino is very fast (~10x faster than Winston)
- Async logging doesn't block
- Minimal overhead

### Potential Issues:

**Issue 1**: Logs not appearing
- **Solution**: Check LOG_LEVEL, ensure >= info

**Issue 2**: Pretty print not working
- **Solution**: Check pino-pretty installed, NODE_ENV=development

**Issue 3**: Too much noise
- **Solution**: Increase LOG_LEVEL to warn or error

### Best Practices:

1. **Log at boundaries**: API requests, DB queries, external calls
2. **Include context**: Request IDs, user IDs, operation names
3. **Measure performance**: Log slow operations
4. **Error details**: Include stack traces for errors
5. **Don't overlog**: Balance detail with noise

### References:
- [Pino Documentation](https://getpino.io/)
- [pino-pretty](https://github.com/pinojs/pino-pretty)
- [Best Practices](https://betterstack.com/community/guides/logging/how-to-install-setup-and-use-pino-to-log-node-js-applications/)

---

## 🔗 Related Tasks

**Can run in parallel with:**
- All Phase 1 tasks (independent)

**Used by:**
- Phase 2: API Migration (all routes will use logging)
- Phase 4: Telegram Service (logging for debugging)

---

## ✏️ AI Agent Instructions

```
Task: Setup Pino logging infrastructure

Context:
- Next.js 15 project
- Need structured logging for production
- Replace console.log with proper logger
- Support different log levels and environments

Your job:
1. Install pino and pino-pretty
2. Create lib/logger.ts (main logger instance)
3. Create lib/middleware/request-logger.ts (API logging)
4. Create lib/utils/log-helpers.ts (structured helpers)
5. Create example usage in app/api/_example-with-logging/route.ts
6. Update .env.local and .env.example
7. Create docs/refactor/logging-guide.md

Logger features:
- Different levels (trace to fatal)
- Pretty print in dev, JSON in production
- Redact sensitive fields (password, token, etc.)
- Include base fields (env, revision)
- Child loggers for context

Structured helpers for:
- Database queries
- External API calls
- Telegram operations
- AI operations
- Performance measurement

Constraints:
- Use Pino (not Winston or Bunyan)
- JSON logs in production
- Pretty logs in development
- Redact sensitive data
- Type-safe helpers

Expected output:
- Pino configured and working
- Request logging middleware
- Structured log helpers
- Example route with logging
- Documentation

Verification:
1. npm run dev (logs appear pretty-printed)
2. Set NODE_ENV=production (logs are JSON)
3. Test redaction works
4. Test different log levels
```

---

**Created**: 2025-11-22
**Last Updated**: 2025-11-22
**Assignee**: AI Agent / Developer
**Reviewer**: Tech Lead

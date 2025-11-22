# 📋 Task 1.5: Next.js API Routes Structure

**מזהה**: TASK-1.5
**שלב**: Phase 1 - Infrastructure
**סטטוס**: ⬜ Not Started
**Estimated Time**: 2-3 hours

---

## 🎯 Goal

ליצור מבנה בסיסי ועקבי לכל ה-API routes ב-Next.js, כולל error handling, response formatting, ו-middleware.

### Why This Task?
- צריך מבנה אחיד לכל ה-endpoints
- Error handling מרכזי
- Response format עקבי
- מוכן להוספת routes בPhase 2

---

## 📦 Prerequisites

**חייב להשלים לפני:**
- None (יכול לרוץ במקביל!)

**External dependencies:**
- [x] Next.js 15 installed (כבר קיים)
- [x] TypeScript configured

---

## 📋 Implementation Guide

### Step 1: Understand Next.js 15 App Router API Routes

**קריאה חובה:**
```
Next.js 15 uses App Router:
- API routes in: app/api/[route]/route.ts
- Each file exports: GET, POST, PUT, DELETE, PATCH
- Native Request/Response objects
- Middleware support
```

**מבנה directory:**
```
app/
├── api/
│   ├── recipes/
│   │   ├── route.ts           # GET, POST
│   │   ├── [id]/
│   │   │   └── route.ts       # GET, PUT, DELETE
│   │   └── search/
│   │       └── route.ts       # GET
│   ├── menus/
│   │   ├── route.ts
│   │   └── [id]/
│   │       └── route.ts
│   └── auth/
│       └── [...nextauth]/
│           └── route.ts
```

---

### Step 2: Create Error Handler Utility

**מה לעשות:**
- [ ] צור utilities directory
- [ ] צור error handling functions
- [ ] הגדר error types

**קובץ ליצור:** `lib/utils/api-errors.ts`

**תוכן:**
```typescript
/**
 * API Error handling utilities
 */

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public errors?: any[]
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Common error constructors
export const BadRequestError = (message: string, errors?: any[]) =>
  new ApiError(400, message, errors);

export const UnauthorizedError = (message = 'Unauthorized') =>
  new ApiError(401, message);

export const ForbiddenError = (message = 'Forbidden') =>
  new ApiError(403, message);

export const NotFoundError = (message = 'Not found') =>
  new ApiError(404, message);

export const ConflictError = (message: string) =>
  new ApiError(409, message);

export const InternalServerError = (message = 'Internal server error') =>
  new ApiError(500, message);

/**
 * Handle errors and return Response
 */
export function handleApiError(error: unknown): Response {
  console.error('API Error:', error);

  if (error instanceof ApiError) {
    return Response.json(
      {
        error: {
          message: error.message,
          statusCode: error.statusCode,
          errors: error.errors
        }
      },
      { status: error.statusCode }
    );
  }

  // Prisma errors
  if (error && typeof error === 'object' && 'code' in error) {
    return handlePrismaError(error);
  }

  // Unknown errors
  return Response.json(
    {
      error: {
        message: 'Internal server error',
        statusCode: 500
      }
    },
    { status: 500 }
  );
}

/**
 * Handle Prisma-specific errors
 */
function handlePrismaError(error: any): Response {
  switch (error.code) {
    case 'P2002': // Unique constraint violation
      return Response.json(
        {
          error: {
            message: 'A record with this value already exists',
            statusCode: 409,
            field: error.meta?.target
          }
        },
        { status: 409 }
      );

    case 'P2025': // Record not found
      return Response.json(
        {
          error: {
            message: 'Record not found',
            statusCode: 404
          }
        },
        { status: 404 }
      );

    case 'P2003': // Foreign key constraint
      return Response.json(
        {
          error: {
            message: 'Related record not found',
            statusCode: 400
          }
        },
        { status: 400 }
      );

    default:
      return Response.json(
        {
          error: {
            message: 'Database error',
            statusCode: 500
          }
        },
        { status: 500 }
      );
  }
}
```

---

### Step 3: Create Response Helpers

**קובץ ליצור:** `lib/utils/api-response.ts`

**תוכן:**
```typescript
/**
 * Standardized API response helpers
 */

export interface ApiSuccessResponse<T> {
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  error: {
    message: string;
    statusCode: number;
    errors?: any[];
  };
}

/**
 * Success response helper
 */
export function successResponse<T>(
  data: T,
  message?: string,
  status = 200
): Response {
  const response: ApiSuccessResponse<T> = { data };
  if (message) response.message = message;

  return Response.json(response, { status });
}

/**
 * Created response (201)
 */
export function createdResponse<T>(
  data: T,
  message = 'Resource created successfully'
): Response {
  return successResponse(data, message, 201);
}

/**
 * No content response (204)
 */
export function noContentResponse(): Response {
  return new Response(null, { status: 204 });
}

/**
 * Paginated response helper
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
  };
}

export function paginatedResponse<T>(
  data: T[],
  page: number,
  pageSize: number,
  totalItems: number
): Response {
  const response: PaginatedResponse<T> = {
    data,
    pagination: {
      page,
      pageSize,
      totalPages: Math.ceil(totalItems / pageSize),
      totalItems
    }
  };

  return Response.json(response);
}
```

---

### Step 4: Create Request Validation Utilities

**קובץ ליצור:** `lib/utils/api-validation.ts`

**תוכן:**
```typescript
/**
 * Request validation utilities
 */
import { BadRequestError } from './api-errors';

/**
 * Parse and validate JSON body
 */
export async function parseBody<T>(request: Request): Promise<T> {
  try {
    return await request.json();
  } catch (error) {
    throw BadRequestError('Invalid JSON body');
  }
}

/**
 * Validate required fields
 */
export function validateRequiredFields(
  data: Record<string, any>,
  requiredFields: string[]
): void {
  const missingFields = requiredFields.filter(
    field => data[field] === undefined || data[field] === null || data[field] === ''
  );

  if (missingFields.length > 0) {
    throw BadRequestError(
      'Missing required fields',
      missingFields.map(field => ({ field, message: 'This field is required' }))
    );
  }
}

/**
 * Parse pagination params
 */
export function parsePaginationParams(url: URL) {
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10);

  if (page < 1 || pageSize < 1 || pageSize > 100) {
    throw BadRequestError('Invalid pagination parameters');
  }

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize
  };
}

/**
 * Parse search params
 */
export function getSearchParam(url: URL, param: string): string | null {
  return url.searchParams.get(param);
}

/**
 * Validate ID parameter
 */
export function validateId(id: string | undefined): number {
  if (!id) {
    throw BadRequestError('ID is required');
  }

  const numId = parseInt(id, 10);
  if (isNaN(numId) || numId < 1) {
    throw BadRequestError('Invalid ID format');
  }

  return numId;
}
```

---

### Step 5: Create Example API Route Template

**מה לעשות:**
- [ ] צור תיקייה לדוגמה
- [ ] צור route file לדוגמה
- [ ] הדגם שימוש בutilities

**קובץ ליצור:** `app/api/_example/route.ts`

**תוכן:**
```typescript
/**
 * Example API route demonstrating best practices
 *
 * DELETE THIS FILE after understanding the pattern!
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  successResponse,
  createdResponse,
  paginatedResponse
} from '@/lib/utils/api-response';
import {
  handleApiError,
  NotFoundError,
  BadRequestError
} from '@/lib/utils/api-errors';
import {
  parseBody,
  validateRequiredFields,
  parsePaginationParams
} from '@/lib/utils/api-validation';

/**
 * GET /api/example
 * List resources with pagination
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const { page, pageSize, skip, take } = parsePaginationParams(url);

    // Get total count
    const totalItems = await prisma.recipe.count();

    // Get paginated data
    const recipes = await prisma.recipe.findMany({
      skip,
      take,
      orderBy: { created_at: 'desc' }
    });

    return paginatedResponse(recipes, page, pageSize, totalItems);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/example
 * Create new resource
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate body
    const body = await parseBody<{ title: string; content: string }>(request);
    validateRequiredFields(body, ['title', 'content']);

    // Create resource
    const recipe = await prisma.recipe.create({
      data: {
        telegram_id: Date.now(), // Example
        title: body.title,
        raw_content: body.content
      }
    });

    return createdResponse(recipe, 'Recipe created successfully');
  } catch (error) {
    return handleApiError(error);
  }
}
```

**קובץ ליצור:** `app/api/_example/[id]/route.ts`

**תוכן:**
```typescript
/**
 * Example API route for single resource
 *
 * DELETE THIS FILE after understanding the pattern!
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  successResponse,
  noContentResponse
} from '@/lib/utils/api-response';
import {
  handleApiError,
  NotFoundError
} from '@/lib/utils/api-errors';
import {
  parseBody,
  validateId
} from '@/lib/utils/api-validation';

/**
 * GET /api/example/:id
 * Get single resource
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = validateId(params.id);

    const recipe = await prisma.recipe.findUnique({
      where: { id }
    });

    if (!recipe) {
      throw NotFoundError('Recipe not found');
    }

    return successResponse(recipe);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/example/:id
 * Update resource
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = validateId(params.id);
    const body = await parseBody<{ title?: string; content?: string }>(request);

    const recipe = await prisma.recipe.update({
      where: { id },
      data: {
        title: body.title,
        raw_content: body.content
      }
    });

    return successResponse(recipe, 'Recipe updated successfully');
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/example/:id
 * Delete resource
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = validateId(params.id);

    await prisma.recipe.delete({
      where: { id }
    });

    return noContentResponse();
  } catch (error) {
    return handleApiError(error);
  }
}
```

---

### Step 6: Update tsconfig Paths

**מה לעשות:**
- [ ] הוסף path alias ל-lib
- [ ] עדכן tsconfig.json

**קובץ לעדכן:** `tsconfig.json`

**הוסף/עדכן:**
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@/lib/*": ["./src/lib/*"],
      "@/app/*": ["./app/*"]
    }
  }
}
```

---

### Step 7: Create API Documentation Template

**קובץ ליצור:** `docs/refactor/api-routes-guide.md`

**תוכן:**
```markdown
# API Routes Guide

## Structure

All API routes in: `app/api/`

## Conventions

### File Structure
- `route.ts` - exports HTTP methods (GET, POST, etc.)
- `[id]/route.ts` - dynamic routes

### Response Format

**Success:**
\`\`\`json
{
  "data": { ... },
  "message": "Optional success message"
}
\`\`\`

**Error:**
\`\`\`json
{
  "error": {
    "message": "Error description",
    "statusCode": 400,
    "errors": [...]  // Optional validation errors
  }
}
\`\`\`

**Paginated:**
\`\`\`json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalPages": 5,
    "totalItems": 100
  }
}
\`\`\`

### Error Handling

Always use try-catch and `handleApiError()`:

\`\`\`typescript
export async function GET(request: NextRequest) {
  try {
    // Your logic
    return successResponse(data);
  } catch (error) {
    return handleApiError(error);
  }
}
\`\`\`

### Validation

Use validation utilities:

\`\`\`typescript
const body = await parseBody(request);
validateRequiredFields(body, ['field1', 'field2']);
\`\`\`

## Common Patterns

See `app/api/_example/` for full examples.

## Testing

Every route should have tests (see Task 1.7).
```

---

## ✅ Success Criteria

### Functional Requirements:
- [x] Utilities created (errors, response, validation)
- [x] Example routes created
- [x] Path aliases configured
- [x] Documentation written

### Technical Requirements:
- [x] TypeScript compiles without errors
- [x] Example routes can be called (manual test)
- [x] Error handling works correctly
- [x] Response format consistent

### Code Quality:
- [x] Utilities are reusable
- [x] Examples demonstrate best practices
- [x] Documentation clear and helpful

---

## 🧪 Testing Instructions

### Manual Testing:

**Test 1: TypeScript Compilation**
```bash
npm run build
# Expected: No type errors
```

**Test 2: Example Route (if server running)**
```bash
# Start dev server
npm run dev

# Test GET
curl http://localhost:3000/api/_example

# Test POST
curl -X POST http://localhost:3000/api/_example \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","content":"Hello"}'

# Test GET by ID
curl http://localhost:3000/api/_example/1

# Test error handling (bad ID)
curl http://localhost:3000/api/_example/abc
# Expected: {"error":{"message":"Invalid ID format","statusCode":400}}
```

**Expected:**
- All responses in correct format
- Errors handled gracefully
- 404 for not found
- 400 for validation errors

---

## 🔄 Rollback Strategy

**אם יש בעיות:**

```bash
# Remove created files
rm -rf lib/utils/api-*
rm -rf app/api/_example

# Revert tsconfig
git checkout tsconfig.json
```

**Zero risk**: אלו רק utility files, לא משפיעים על הקיים.

---

## 📊 Estimated Time

- **Minimum**: 1.5 hours
- **Expected**: 2 hours
- **Maximum**: 3 hours

**Breakdown:**
- Error utilities: 30 min
- Response utilities: 20 min
- Validation utilities: 30 min
- Example routes: 30 min
- Documentation: 20 min
- Testing: 20 min

---

## 📝 Implementation Notes

### Important Considerations:

**1. Next.js 15 Native APIs:**
- Use native `Request` and `Response` (not Next.js wrappers)
- `NextRequest` for extended functionality (cookies, etc.)
- No need for `NextApiRequest/NextApiResponse`

**2. Error Handling Pattern:**
```typescript
// Always wrap in try-catch
try {
  // ... logic
  return successResponse(data);
} catch (error) {
  return handleApiError(error);  // Centralized handling
}
```

**3. Validation First:**
```typescript
// Validate before DB operations
const body = await parseBody(request);
validateRequiredFields(body, ['field1']);
// Then use body safely
```

**4. Consistent Responses:**
- Always return JSON
- Always include status code
- Always use standard format

### Potential Issues:

**Issue 1**: Path alias not working
- **Solution**: Restart TypeScript server, rebuild

**Issue 2**: CORS errors (when testing from frontend)
- **Solution**: Will handle in Phase 2 with middleware

**Issue 3**: Prisma import errors
- **Solution**: Make sure Task 1.1 completed (prisma client generated)

### Best Practices:

1. **DRY**: Use utilities, don't repeat error handling
2. **Type-safe**: Use TypeScript generics for type safety
3. **Consistent**: Follow same pattern in all routes
4. **Document**: Add JSDoc comments to all functions
5. **Test**: Test error cases, not just happy path

### References:
- [Next.js Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Next.js Error Handling](https://nextjs.org/docs/app/building-your-application/routing/error-handling)
- [TypeScript Path Mapping](https://www.typescriptlang.org/docs/handbook/module-resolution.html#path-mapping)

---

## 🔗 Related Tasks

**Can run in parallel with:**
- TASK-1.1: Prisma Setup
- TASK-1.2: PostgreSQL Setup
- TASK-1.3: Schema Creation
- TASK-1.7: Testing Infrastructure
- TASK-1.8: Logging Setup

**Blocks:**
- Phase 2 API Migration (needs this structure)

**Used by:**
- All Phase 2 tasks (will use these utilities)

---

## ✏️ AI Agent Instructions

**For Claude Code or similar AI agents:**

```
Task: Create API routes infrastructure for Next.js

Context:
- Next.js 15 App Router
- Need reusable utilities for error handling, responses, validation
- Need consistent patterns for all future routes
- This is foundation for Phase 2 migration

Your job:
1. Create lib/utils/api-errors.ts with error classes and handler
2. Create lib/utils/api-response.ts with response helpers
3. Create lib/utils/api-validation.ts with validation utilities
4. Create example routes in app/api/_example/
5. Update tsconfig.json with path aliases
6. Create docs/refactor/api-routes-guide.md
7. Test compilation and example routes

Utilities to create:
- Error types: BadRequestError, NotFoundError, etc.
- handleApiError() - centralized error handling
- successResponse(), createdResponse(), paginatedResponse()
- parseBody(), validateRequiredFields(), parsePaginationParams()
- validateId() for dynamic routes

Example routes should demonstrate:
- GET with pagination
- POST with validation
- PUT/DELETE for single resource
- Error handling
- Use of all utilities

Constraints:
- Use Next.js 15 native Request/Response
- Use TypeScript generics for type safety
- Follow consistent response format
- All errors should return proper HTTP status codes

Expected output:
- 3 utility files created
- Example routes created (can be called)
- tsconfig.json updated
- Documentation created
- TypeScript compiles without errors
- Example: curl http://localhost:3000/api/_example works

Verification:
1. npm run build (should pass)
2. Start server and test routes
3. Test error cases return correct format
```

---

**Created**: 2025-11-22
**Last Updated**: 2025-11-22
**Assignee**: AI Agent / Developer
**Reviewer**: Tech Lead

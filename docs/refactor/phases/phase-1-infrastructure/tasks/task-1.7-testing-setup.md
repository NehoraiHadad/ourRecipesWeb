# 📋 Task 1.7: Testing Infrastructure (Vitest)

**מזהה**: TASK-1.7
**שלב**: Phase 1 - Infrastructure
**סטטוס**: ⬜ Not Started
**Estimated Time**: 3-4 hours

---

## 🎯 Goal

להקים תשתית testing מלאה עם Vitest, כולל unit tests, integration tests, ו-test utilities.

### Why This Task?
- Testing-first approach לכל Phase 2
- Catch bugs מוקדם
- Confidence בשינויים
- Documentation חי (tests as docs)

---

## 📦 Prerequisites

**חייב להשלים לפני:**
- None (יכול לרוץ במקביל!)

**Nice to have:**
- [ ] TASK-1.1: Prisma Setup (for DB mocking)
- [ ] TASK-1.5: API Structure (for testing APIs)

---

## 📋 Implementation Guide

### Step 1: Install Vitest and Dependencies

**מה לעשות:**
- [ ] התקן Vitest
- [ ] התקן testing utilities
- [ ] התקן מocking libraries

**Commands:**
```bash
cd frontend/ourRecipesFront

# Core testing
npm install -D vitest @vitest/ui

# Testing utilities
npm install -D @testing-library/react @testing-library/jest-dom @testing-library/user-event

# MSW for API mocking (Optional for later)
npm install -D msw

# Coverage
npm install -D @vitest/coverage-v8
```

---

### Step 2: Create Vitest Configuration

**קובץ ליצור:** `vitest.config.ts`

**תוכן:**
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    // Environment
    environment: 'jsdom',

    // Globals
    globals: true,

    // Setup files
    setupFiles: ['./tests/setup.ts'],

    // Coverage
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/dist/',
        '.next/'
      ]
    },

    // Include/Exclude
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', '.next', 'coverage'],

    // Timeout
    testTimeout: 10000,

    // Reporters
    reporters: ['verbose']
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/lib': path.resolve(__dirname, './src/lib'),
      '@/app': path.resolve(__dirname, './app')
    }
  }
});
```

---

### Step 3: Create Test Setup File

**קובץ ליצור:** `tests/setup.ts`

**תוכן:**
```typescript
/**
 * Test setup - runs before all tests
 */
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock environment variables
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.NEXTAUTH_SECRET = 'test-secret';
process.env.NEXTAUTH_URL = 'http://localhost:3000';

// Mock fetch globally
global.fetch = vi.fn();

// Mock console methods to reduce noise
global.console = {
  ...console,
  error: vi.fn(),
  warn: vi.fn()
};
```

---

### Step 4: Create Mock Utilities

**Directory ליצור:** `tests/mocks/`

**קובץ ליצור:** `tests/mocks/prisma.ts`

**תוכן:**
```typescript
/**
 * Prisma mock for testing
 */
import { vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, DeepMockProxy } from 'vitest-mock-extended';

// Create mock
export const prismaMock = mockDeep<PrismaClient>();

// Reset before each test
export function resetPrismaMock() {
  mockReset(prismaMock);
}

// Mock Prisma Client
vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock
}));
```

**Install dependency:**
```bash
npm install -D vitest-mock-extended
```

---

**קובץ ליצור:** `tests/mocks/data.ts`

**תוכן:**
```typescript
/**
 * Mock data for tests
 */
import {
  Recipe,
  Menu,
  RecipeDifficulty,
  DietaryType
} from '@prisma/client';

/**
 * Mock recipe
 */
export const mockRecipe: Recipe = {
  id: 1,
  telegram_id: 12345,
  title: 'Test Recipe',
  raw_content: 'Test content',
  ingredients: 'flour||eggs||milk',
  instructions: 'Mix and bake',
  categories: 'dessert,baking',
  recipe_metadata: null,
  image_data: null,
  image_url: 'https://example.com/image.jpg',
  media_type: 'photo',
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
  last_sync: null,
  is_parsed: true,
  parse_errors: null,
  status: 'active',
  ingredients_list: [
    { name: 'flour', amount: '2', unit: 'cups' },
    { name: 'eggs', amount: '3', unit: 'pieces' }
  ],
  cooking_time: 30,
  difficulty: RecipeDifficulty.EASY,
  servings: 4,
  preparation_time: 15,
  formatted_content: null,
  is_verified: false,
  sync_status: 'synced',
  sync_error: null
};

/**
 * Mock menu
 */
export const mockMenu: Menu = {
  id: 1,
  user_id: 'user123',
  telegram_message_id: 67890,
  last_sync: null,
  name: 'Shabbat Menu',
  event_type: 'shabbat',
  description: 'Traditional Shabbat dinner',
  total_servings: 6,
  dietary_type: DietaryType.MEAT,
  share_token: 'abc123xyz',
  is_public: false,
  ai_reasoning: null,
  generation_prompt: null,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01')
};

/**
 * Create mock recipe with overrides
 */
export function createMockRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    ...mockRecipe,
    ...overrides
  };
}

/**
 * Create mock menu with overrides
 */
export function createMockMenu(overrides: Partial<Menu> = {}): Menu {
  return {
    ...mockMenu,
    ...overrides
  };
}

/**
 * Create array of mock recipes
 */
export function createMockRecipes(count: number): Recipe[] {
  return Array.from({ length: count }, (_, i) =>
    createMockRecipe({
      id: i + 1,
      telegram_id: 10000 + i,
      title: `Recipe ${i + 1}`
    })
  );
}
```

---

### Step 5: Create Test Helpers

**קובץ ליצור:** `tests/helpers/api-test-helpers.ts`

**תוכן:**
```typescript
/**
 * API testing helpers
 */
import { NextRequest } from 'next/server';

/**
 * Create mock NextRequest
 */
export function createMockRequest(
  url: string,
  options: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
  } = {}
): NextRequest {
  const { method = 'GET', body, headers = {} } = options;

  const requestInit: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  };

  if (body) {
    requestInit.body = JSON.stringify(body);
  }

  return new NextRequest(new URL(url, 'http://localhost:3000'), requestInit);
}

/**
 * Parse JSON response
 */
export async function parseJsonResponse<T>(response: Response): Promise<T> {
  return await response.json();
}

/**
 * Assert response is successful
 */
export function assertSuccessResponse(response: Response) {
  if (!response.ok) {
    throw new Error(`Expected successful response, got ${response.status}`);
  }
}

/**
 * Assert response has error
 */
export function assertErrorResponse(
  response: Response,
  expectedStatus: number
) {
  if (response.status !== expectedStatus) {
    throw new Error(
      `Expected status ${expectedStatus}, got ${response.status}`
    );
  }
}
```

---

### Step 6: Create Example Test Files

**קובץ ליצור:** `tests/unit/utils/api-errors.test.ts`

**תוכן:**
```typescript
/**
 * Unit test example - API errors
 */
import { describe, it, expect } from 'vitest';
import {
  ApiError,
  BadRequestError,
  NotFoundError,
  handleApiError
} from '@/lib/utils/api-errors';

describe('API Errors', () => {
  describe('ApiError', () => {
    it('should create error with message and status', () => {
      const error = new ApiError(400, 'Bad request');

      expect(error.message).toBe('Bad request');
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('ApiError');
    });

    it('should include validation errors', () => {
      const errors = [{ field: 'email', message: 'Invalid' }];
      const error = new ApiError(400, 'Validation failed', errors);

      expect(error.errors).toEqual(errors);
    });
  });

  describe('Error constructors', () => {
    it('BadRequestError should create 400 error', () => {
      const error = BadRequestError('Invalid input');

      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Invalid input');
    });

    it('NotFoundError should create 404 error', () => {
      const error = NotFoundError('Resource not found');

      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Resource not found');
    });
  });

  describe('handleApiError', () => {
    it('should handle ApiError and return Response', async () => {
      const error = BadRequestError('Invalid input');
      const response = handleApiError(error);

      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json).toEqual({
        error: {
          message: 'Invalid input',
          statusCode: 400,
          errors: undefined
        }
      });
    });

    it('should handle unknown errors as 500', async () => {
      const error = new Error('Unknown error');
      const response = handleApiError(error);

      expect(response.status).toBe(500);

      const json = await response.json();
      expect(json.error.message).toBe('Internal server error');
    });
  });
});
```

---

**קובץ ליצור:** `tests/integration/api/recipes.test.ts`

**תוכן:**
```typescript
/**
 * Integration test example - Recipes API
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/recipes/route';
import { GET as GETById } from '@/app/api/recipes/[id]/route';
import { prismaMock, resetPrismaMock } from '@tests/mocks/prisma';
import { mockRecipe, createMockRecipes } from '@tests/mocks/data';
import {
  createMockRequest,
  parseJsonResponse
} from '@tests/helpers/api-test-helpers';

describe('Recipes API', () => {
  beforeEach(() => {
    resetPrismaMock();
  });

  describe('GET /api/recipes', () => {
    it('should return paginated recipes', async () => {
      const recipes = createMockRecipes(5);

      prismaMock.recipe.count.mockResolvedValue(5);
      prismaMock.recipe.findMany.mockResolvedValue(recipes);

      const request = createMockRequest('http://localhost:3000/api/recipes');
      const response = await GET(request);

      expect(response.status).toBe(200);

      const json = await parseJsonResponse(response);
      expect(json.data).toHaveLength(5);
      expect(json.pagination.totalItems).toBe(5);
    });

    it('should handle pagination params', async () => {
      prismaMock.recipe.count.mockResolvedValue(100);
      prismaMock.recipe.findMany.mockResolvedValue([]);

      const request = createMockRequest(
        'http://localhost:3000/api/recipes?page=2&pageSize=10'
      );
      await GET(request);

      expect(prismaMock.recipe.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10
        })
      );
    });
  });

  describe('POST /api/recipes', () => {
    it('should create recipe', async () => {
      const newRecipe = {
        telegram_id: 99999,
        title: 'New Recipe',
        raw_content: 'Content'
      };

      prismaMock.recipe.create.mockResolvedValue({
        ...mockRecipe,
        ...newRecipe
      });

      const request = createMockRequest('http://localhost:3000/api/recipes', {
        method: 'POST',
        body: newRecipe
      });

      const response = await POST(request);

      expect(response.status).toBe(201);

      const json = await parseJsonResponse(response);
      expect(json.data.title).toBe('New Recipe');
    });

    it('should return 400 for missing required fields', async () => {
      const request = createMockRequest('http://localhost:3000/api/recipes', {
        method: 'POST',
        body: { title: 'Missing telegram_id' }
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/recipes/:id', () => {
    it('should return recipe by id', async () => {
      prismaMock.recipe.findUnique.mockResolvedValue(mockRecipe);

      const request = createMockRequest(
        'http://localhost:3000/api/recipes/1'
      );
      const response = await GETById(request, { params: { id: '1' } });

      expect(response.status).toBe(200);

      const json = await parseJsonResponse(response);
      expect(json.data.id).toBe(1);
    });

    it('should return 404 if recipe not found', async () => {
      prismaMock.recipe.findUnique.mockResolvedValue(null);

      const request = createMockRequest(
        'http://localhost:3000/api/recipes/999'
      );
      const response = await GETById(request, { params: { id: '999' } });

      expect(response.status).toBe(404);
    });
  });
});
```

---

### Step 7: Update package.json Scripts

**מה לעשות:**
- [ ] הוסף test scripts

**Update package.json:**
```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:watch": "vitest --watch"
  }
}
```

---

### Step 8: Create Testing Documentation

**קובץ ליצור:** `tests/README.md`

**תוכן:**
```markdown
# Testing Guide

## Running Tests

\`\`\`bash
# Run all tests
npm test

# Run with UI
npm run test:ui

# Run once (CI mode)
npm run test:run

# Coverage report
npm run test:coverage

# Watch mode
npm run test:watch
\`\`\`

## Test Structure

\`\`\`
tests/
├── unit/               # Unit tests (isolated functions)
├── integration/        # Integration tests (API routes with DB)
├── mocks/             # Mock data and utilities
├── helpers/           # Test helpers
└── setup.ts           # Global setup
\`\`\`

## Writing Tests

### Unit Test
Test isolated functions:

\`\`\`typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from '@/lib/utils';

describe('myFunction', () => {
  it('should return expected value', () => {
    expect(myFunction('input')).toBe('output');
  });
});
\`\`\`

### Integration Test
Test API routes with mocked DB:

\`\`\`typescript
import { prismaMock } from '@tests/mocks/prisma';
import { GET } from '@/app/api/route';

describe('API Route', () => {
  it('should return data', async () => {
    prismaMock.model.findMany.mockResolvedValue([...]);
    const response = await GET(mockRequest);
    expect(response.status).toBe(200);
  });
});
\`\`\`

## Best Practices

1. **Arrange-Act-Assert**: Structure tests clearly
2. **One assertion per test**: Keep tests focused
3. **Mock external dependencies**: Don't hit real DB/APIs
4. **Descriptive names**: Test name = documentation
5. **Clean up**: Reset mocks between tests
```

---

## ✅ Success Criteria

### Functional Requirements:
- [x] Vitest installed and configured
- [x] Test setup file created
- [x] Mock utilities created
- [x] Example tests written (unit + integration)
- [x] Documentation created

### Technical Requirements:
- [x] `npm test` runs without errors
- [x] Example tests pass
- [x] Coverage report generates
- [x] Vitest UI works

### Code Quality:
- [x] Mocks are reusable
- [x] Helpers simplify test writing
- [x] Documentation clear

---

## 🧪 Testing Instructions

**Run tests:**
```bash
npm test

# Expected output:
# ✓ tests/unit/utils/api-errors.test.ts (X tests)
# ✓ tests/integration/api/recipes.test.ts (X tests)
#
# Test Files  X passed (X)
#      Tests  X passed (X)
```

**Run with UI:**
```bash
npm run test:ui
# Opens at http://localhost:51204/__vitest__/
```

**Coverage:**
```bash
npm run test:coverage

# Expected:
# Coverage report in coverage/index.html
# Overall coverage > 80%
```

---

## 🔄 Rollback Strategy

**אם יש בעיות:**

```bash
# Uninstall packages
npm uninstall vitest @vitest/ui @testing-library/react

# Remove files
rm -rf tests/
rm vitest.config.ts
```

---

## 📊 Estimated Time

- **Minimum**: 2 hours
- **Expected**: 3 hours
- **Maximum**: 4 hours

**Breakdown:**
- Install & config: 30 min
- Mocks & helpers: 1 hour
- Example tests: 1 hour
- Documentation: 30 min
- Testing & debugging: 30 min

---

## 📝 Implementation Notes

### Important Considerations:

**1. Mock Prisma:**
- Use `vitest-mock-extended` for type-safe mocks
- Reset mocks in `beforeEach`

**2. Test Isolation:**
- Each test should be independent
- Don't rely on test execution order

**3. Coverage Goals:**
- Aim for 80%+ coverage
- Focus on critical paths first

### Potential Issues:

**Issue 1**: Tests fail with module resolution errors
- **Solution**: Check `vitest.config.ts` resolve aliases

**Issue 2**: Prisma mock not working
- **Solution**: Ensure `vi.mock('@/lib/prisma')` runs before imports

**Issue 3**: Async tests timeout
- **Solution**: Increase `testTimeout` in config

### Best Practices:

1. **Test file naming**: `*.test.ts` or `*.spec.ts`
2. **Describe blocks**: Group related tests
3. **beforeEach/afterEach**: Setup/cleanup
4. **Mocking strategy**: Mock at boundaries (DB, external APIs)
5. **Snapshot testing**: Use sparingly, prefer explicit assertions

### References:
- [Vitest Docs](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [vitest-mock-extended](https://github.com/marchaos/vitest-mock-extended)

---

## 🔗 Related Tasks

**Can run in parallel with:**
- All Phase 1 tasks (independent)

**Used by:**
- Phase 2: API Migration (all routes will have tests)

---

## ✏️ AI Agent Instructions

```
Task: Setup Vitest testing infrastructure

Context:
- Next.js 15 + Prisma project
- Need unit and integration testing
- Mock Prisma for DB operations
- Test API routes

Your job:
1. Install vitest, @vitest/ui, testing-library, vitest-mock-extended
2. Create vitest.config.ts
3. Create tests/setup.ts
4. Create tests/mocks/ (prisma.ts, data.ts)
5. Create tests/helpers/ (api-test-helpers.ts)
6. Create example tests (unit + integration)
7. Update package.json with test scripts
8. Create tests/README.md

Example tests should cover:
- Unit test: api-errors utilities
- Integration test: GET/POST recipes API
- Show mocking Prisma
- Show request/response testing

Constraints:
- Use Vitest (not Jest)
- Mock Prisma with vitest-mock-extended
- Type-safe mocks
- Document testing patterns

Expected output:
- Vitest configured and working
- Example tests pass
- npm test runs successfully
- Coverage report generates
- Documentation clear

Verification:
1. npm test (should pass)
2. npm run test:ui (should open UI)
3. npm run test:coverage (should generate report)
```

---

**Created**: 2025-11-22
**Last Updated**: 2025-11-22
**Assignee**: AI Agent / Developer
**Reviewer**: Tech Lead

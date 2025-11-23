/**
 * Prisma mock for testing
 */
import { vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset } from 'vitest-mock-extended';

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

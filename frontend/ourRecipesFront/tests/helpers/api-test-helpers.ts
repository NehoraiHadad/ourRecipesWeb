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

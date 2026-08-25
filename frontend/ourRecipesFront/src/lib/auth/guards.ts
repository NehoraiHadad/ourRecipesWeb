/**
 * Route-handler guards.
 *
 * Both helpers return a discriminated {@link AuthResult} instead of throwing,
 * so a handler can decide between a 401/403 response and a custom flow:
 *
 * ```ts
 * const auth = await requireEditPermission(request);
 * if (!auth.ok) return authErrorResponse(auth);
 * // auth.session is typed SessionPayload here
 * ```
 */
import { ApiError } from '@/lib/utils/api-errors';
import { getTokenFromRequest, verifySession } from './session';
import type { RequestLike } from './session';
import { checkEditPermission } from './permissions';
import type { AuthFailure, AuthResult } from './types';

/** Verifies the session token on the request. */
export async function requireAuth(request: RequestLike): Promise<AuthResult> {
  const token = getTokenFromRequest(request);
  if (!token) {
    return { ok: false, status: 401, message: 'No authentication token found' };
  }

  const session = await verifySession(token);
  if (!session) {
    return { ok: false, status: 401, message: 'Invalid or expired token' };
  }

  return { ok: true, session };
}

/**
 * Verifies the session **and** that the user may edit channel messages.
 *
 * The live (hour-cached) `getChatMember` check wins over the `can_edit` claim,
 * so a demoted admin loses access without waiting out the 7-day token.
 */
export async function requireEditPermission(request: RequestLike): Promise<AuthResult> {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth;

  if (auth.session.type === 'guest') {
    return { ok: false, status: 403, message: 'Guests cannot edit recipes' };
  }

  const canEdit = await checkEditPermission(auth.session.sub);
  if (!canEdit) {
    return { ok: false, status: 403, message: 'User does not have edit permissions' };
  }

  return {
    ok: true,
    session: { ...auth.session, permissions: { ...auth.session.permissions, can_edit: true } }
  };
}

/** Turns a failed guard into an `ApiError`, for `handleApiError`. */
export function toApiError(failure: AuthFailure): ApiError {
  return new ApiError(failure.status, failure.message);
}

/** Ready-made 401/403 response in the project's standard error shape. */
export function authErrorResponse(failure: AuthFailure): Response {
  return Response.json(
    {
      authenticated: false,
      error: { message: failure.message, statusCode: failure.status }
    },
    { status: failure.status }
  );
}

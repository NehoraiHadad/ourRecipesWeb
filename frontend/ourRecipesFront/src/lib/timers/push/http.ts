import { requireAuth, authErrorResponse } from '@/lib/auth';
import { ApiError } from '@/lib/utils/api-errors';
import { timerPushConfig } from './config';

export async function pushAuth(request: Request) {
  const origin = request.headers.get('origin');
  const bearer = /^Bearer\s+\S+/i.test(request.headers.get('authorization') ?? '');
  if (origin ? origin !== new URL(request.url).origin : !bearer) {
    throw new ApiError(403, 'Same-origin request required');
  }
  const auth = await requireAuth(request);
  if (!auth.ok) return { ok: false as const, response: authErrorResponse(auth) };
  return { ok: true as const, ownerId: auth.session.sub };
}
export function requireTimerPush() {
  if (!timerPushConfig().enabled) throw new ApiError(503, 'Background timer notifications are not available');
}
export function pushError(error: unknown) {
  if (error instanceof ApiError) return Response.json({ error: { message: error.message } }, { status: error.statusCode });
  // Avoid logging subscription endpoints, auth keys, or Prisma query arguments.
  console.error('Timer push request failed', error instanceof Error ? error.name : 'UnknownError');
  return Response.json({ error: { message: 'Background timer request failed' } }, { status: 500 });
}

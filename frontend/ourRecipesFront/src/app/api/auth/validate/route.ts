/**
 * GET /api/auth/validate
 *
 * Port of `auth_bp.validate_session`. The token is read from the session
 * cookie or from `Authorization: Bearer` (iOS fallback) by
 * `getTokenFromRequest`.
 *
 * `useAuth` reads the fields flat off the body — `authenticated`, `canEdit`,
 * `user_id`, `name`, `type` — so the response must stay unwrapped (no
 * `successResponse` envelope here).
 *
 * Guests short-circuit; Telegram users get a fresh (hour-cached)
 * `getChatMember` check, so a demotion takes effect without waiting out the
 * 7-day token.
 */
import { NextRequest } from 'next/server';
import { checkEditPermission, getTokenFromRequest, verifySession } from '@/lib/auth';
import { logger } from '@/lib/logger';

const log = logger.child({ context: 'api/auth/validate' });

const NO_EDIT_PERMISSION_MESSAGE =
  'אין לך הרשאות עריכה. יש להצטרף לערוץ הטלגרם כדי לקבל הרשאות.';
const GUEST_MESSAGE = 'משתמשי אורח לא יכולים לערוך מתכונים';

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return Response.json(
        { authenticated: false, message: 'No authentication token found' },
        { status: 401 }
      );
    }

    const session = await verifySession(token);
    if (!session) {
      return Response.json(
        { authenticated: false, message: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    if (session.type === 'guest') {
      return Response.json(
        {
          authenticated: true,
          canEdit: false,
          user_id: session.sub,
          // Prefer the claim; fall back to the derived name for tokens minted
          // before `name` existed.
          name: session.name ?? `אורח_${session.sub.slice(-4)}`,
          type: 'guest',
          message: GUEST_MESSAGE
        },
        { status: 200 }
      );
    }

    const canEdit = await checkEditPermission(session.sub);

    log.debug({ userId: session.sub, canEdit }, 'Session validated');

    return Response.json(
      {
        authenticated: true,
        canEdit,
        user_id: session.sub,
        // Telegram display name from the token. Omitted (undefined drops out of
        // the JSON) for pre-`name` tokens, which is what the client already
        // tolerated before this claim existed.
        name: session.name,
        type: 'telegram',
        message: canEdit ? null : NO_EDIT_PERMISSION_MESSAGE
      },
      { status: 200 }
    );
  } catch (error) {
    log.error({ err: error }, 'Session validation failed');
    return Response.json({ error: 'Validation failed' }, { status: 500 });
  }
}

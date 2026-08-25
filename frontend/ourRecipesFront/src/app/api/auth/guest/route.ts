/**
 * POST /api/auth/guest
 *
 * Anonymous browsing session. 1:1 port of `auth_bp.login_guest`
 * (`backend/ourRecipesBack/routes/auth.py`): a `guest_<8 hex>` identity,
 * never any edit rights, 4-hour token.
 *
 * Same `{ login, canEdit, user, token, message }` body as `/api/auth/login`
 * (`GuestLogin.tsx` reads `login`, `canEdit`, `user`, `token`, `message`).
 */
import { NextRequest } from 'next/server';
import { serializeSessionCookie, signSession } from '@/lib/auth';
import { logger } from '@/lib/logger';

const log = logger.child({ context: 'api/auth/guest' });

const GUEST_WELCOME_MESSAGE =
  'ברוכים הבאים! שימו לב שכמשתמש אורח אין אפשרות לערוך מתכונים.';

/** `uuid.uuid4().hex[:8]` in the Flask original. */
function generateGuestId(): string {
  return `guest_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

export async function POST(_request: NextRequest) {
  try {
    const guestId = generateGuestId();
    const guestName = `אורח_${guestId.slice(-4)}`;

    const accessToken = await signSession({
      sub: guestId,
      type: 'guest',
      permissions: { can_edit: false }
    });

    log.info({ guestId }, 'Guest session created');

    return Response.json(
      {
        login: true,
        canEdit: false,
        user: {
          id: guestId,
          name: guestName,
          type: 'guest'
        },
        token: accessToken,
        message: GUEST_WELCOME_MESSAGE
      },
      {
        status: 200,
        headers: {
          'Set-Cookie': serializeSessionCookie(accessToken, { type: 'guest' })
        }
      }
    );
  } catch (error) {
    log.error({ err: error }, 'Guest login failed');
    return Response.json(
      {
        error: 'התחברות כאורח נכשלה',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

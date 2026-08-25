/**
 * POST /api/auth/login
 *
 * Telegram Login Widget sign-in. 1:1 port of `auth_bp.login`
 * (`backend/ourRecipesBack/routes/auth.py`), minus the CORS plumbing —
 * the UI is now same-origin.
 *
 * Response shape is the one `authService.login()` / `TelegramLoginWidget`
 * consume: `{ login, canEdit, user, token, message }`. The JWT is returned in
 * the body **and** set as an httpOnly cookie: iOS Safari drops the cookie in
 * some contexts and the client falls back to `Authorization: Bearer`
 * (IMPLEMENTATION_PLAN appendix A).
 */
import { NextRequest } from 'next/server';
import {
  checkEditPermission,
  serializeSessionCookie,
  signSession,
  verifyTelegramLogin
} from '@/lib/auth';
import type { TelegramAuthData } from '@/lib/auth';
import { logger } from '@/lib/logger';

const log = logger.child({ context: 'api/auth/login' });

/** Shown when the account is not a channel admin — same copy as Flask. */
const NO_EDIT_PERMISSION_MESSAGE =
  'אין לך הרשאות עריכה. יש להצטרף לערוץ הטלגרם כדי לקבל הרשאות.';

export async function POST(request: NextRequest) {
  try {
    let userData: TelegramAuthData | null = null;
    try {
      userData = (await request.json()) as TelegramAuthData;
    } catch {
      userData = null;
    }

    if (!userData || typeof userData !== 'object' || !userData.id) {
      return Response.json({ error: 'נתוני משתמש לא תקינים' }, { status: 400 });
    }

    const userId = String(userData.id);

    if (!verifyTelegramLogin(userData)) {
      log.warn({ userId }, 'Telegram login verification failed');
      return Response.json({ error: 'אימות נכשל' }, { status: 401 });
    }

    const hasPermission = await checkEditPermission(userId);

    const accessToken = await signSession({
      sub: userId,
      type: 'telegram',
      permissions: { can_edit: hasPermission }
    });

    log.info({ userId, canEdit: hasPermission }, 'Telegram login succeeded');

    return Response.json(
      {
        login: true,
        canEdit: hasPermission,
        user: {
          id: userId,
          name: userData.first_name ?? '',
          type: 'telegram'
        },
        token: accessToken,
        message: hasPermission ? null : NO_EDIT_PERMISSION_MESSAGE
      },
      {
        status: 200,
        headers: {
          'Set-Cookie': serializeSessionCookie(accessToken, { type: 'telegram' })
        }
      }
    );
  } catch (error) {
    log.error({ err: error }, 'Login failed');
    return Response.json(
      {
        error: 'התחברות נכשלה',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

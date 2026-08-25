/**
 * POST /api/auth/logout
 *
 * Port of `auth_bp.logout`: clears the session cookies and answers
 * `{ "logout": true }`. The client additionally drops its localStorage token
 * (`authService.logout`).
 *
 * Both the current cookie name and the legacy one are expired, so a browser
 * carrying a pre-cutover session is really logged out.
 */
import { NextRequest } from 'next/server';
import { serializeClearedSessionCookies } from '@/lib/auth';
import { logger } from '@/lib/logger';

const log = logger.child({ context: 'api/auth/logout' });

export async function POST(_request: NextRequest) {
  try {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    for (const cookie of serializeClearedSessionCookies()) {
      headers.append('Set-Cookie', cookie);
    }

    log.debug('Session cookies cleared');

    return new Response(JSON.stringify({ logout: true }), { status: 200, headers });
  } catch (error) {
    log.error({ err: error }, 'Logout failed');
    return Response.json(
      {
        error: 'התנתקות נכשלה',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

/**
 * Shared auth types (ARCHITECTURE §4.5).
 *
 * Claim names mirror the Flask/flask-jwt-extended payload so existing clients
 * and the UI keep working after the cutover: `sub`, `type`, `permissions`.
 *
 * `name` is the one addition: Flask kept the display name in the server-side
 * Flask session (`session["user_name"]`), which a stateless JWT has no
 * equivalent for — so it travels as a claim. Everything reading it must treat
 * it as optional: tokens minted before this change carry no `name`.
 */

export type AuthType = 'telegram' | 'guest';

export interface SessionPermissions {
  can_edit: boolean;
}

/** Decoded JWT payload. */
export interface SessionPayload {
  /** User id as string — Telegram numeric id, or `guest_<uuid>`. */
  sub: string;
  type: AuthType;
  permissions: SessionPermissions;
  /**
   * Display name — Telegram `first_name [last_name]`, or the generated
   * `אורח_XXXX` for guests. Absent on tokens minted before the claim existed.
   */
  name?: string;
  /** ISO timestamp, kept for parity with the Flask token. */
  created_at?: string;
  /** Issued-at (seconds since epoch), set by `jose`. */
  iat?: number;
  /** Expiry (seconds since epoch), set by `jose`. */
  exp?: number;
}

/** Payload accepted by `signSession`. */
export interface SessionInput {
  sub: string;
  type: AuthType;
  permissions?: SessionPermissions;
  /** Optional display name; omitted from the token when empty/blank. */
  name?: string;
}

/**
 * Raw payload posted by the Telegram Login Widget. All values arrive as
 * strings or numbers; every field except `id`, `auth_date` and `hash` is
 * optional and must still take part in the HMAC check.
 */
export interface TelegramAuthData {
  id: number | string;
  auth_date: number | string;
  hash: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  [key: string]: string | number | undefined;
}

/** Result of `requireAuth` / `requireEditPermission`. */
export type AuthResult =
  | { ok: true; session: SessionPayload }
  | { ok: false; status: 401 | 403; message: string };

export type AuthFailure = Extract<AuthResult, { ok: false }>;

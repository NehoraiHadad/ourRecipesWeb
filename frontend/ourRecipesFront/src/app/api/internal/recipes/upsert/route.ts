/**
 * POST /api/internal/recipes/upsert — the Python function's only write door.
 *
 * The Telethon reconcile/import job has no database access by design
 * (ARCHITECTURE §4.6): it reads channel history over MTProto and hands each
 * message to this route, which runs the *same* `ingestRecipeMessage` the
 * webhook runs. One ingest implementation, so a gap filled a year late is
 * indistinguishable from a post that arrived in real time.
 *
 * Auth: `Authorization: Bearer <INTERNAL_API_SECRET>`.
 *
 * Request body:
 * ```jsonc
 * {
 *   "telegram_id": 1234,          // required — channel message_id
 *   "text": "כותרת: …",           // message text or caption ("" for none)
 *   "photo_base64": "…",          // optional, raw or data-URI base64
 *   "image_url": "https://…",     // optional, when the caller already stored it
 *   "date": "2024-03-01T10:00:00Z" // optional ISO string or epoch seconds
 * }
 * ```
 *
 * Response: `{ ok, action, telegram_id, recipe_id, status, is_parsed, parse_errors, image_url }`
 * where `action` is `created` | `updated` | `unchanged` | `skipped`.
 */
import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { requireInternalSecret } from '@/lib/internal/auth';
import { ingestChannelMessage } from '@/lib/telegram/channelIngest';

export const dynamic = 'force-dynamic';
/**
 * One message per call, but `photo_base64` means a Blob upload sits in the
 * middle of it. A ceiling costs nothing until it is used, and the failure it
 * prevents is silent: a killed upsert is a channel message the reconcile
 * believes it delivered.
 */
export const maxDuration = 60;

const log = logger.child({ context: 'api/internal/recipes/upsert' });

interface UpsertBody {
  telegram_id?: unknown;
  text?: unknown;
  raw_content?: unknown;
  photo_base64?: unknown;
  image_url?: unknown;
  date?: unknown;
}

function badRequest(message: string): Response {
  return Response.json({ ok: false, error: message }, { status: 400 });
}

/** Accepts an ISO-8601 string or Telegram's epoch-seconds integer. */
function parseDate(value: unknown): Date | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value * 1000);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

export async function POST(request: NextRequest): Promise<Response> {
  const unauthorized = requireInternalSecret(request);
  if (unauthorized) return unauthorized;

  let body: UpsertBody;
  try {
    body = (await request.json()) as UpsertBody;
  } catch {
    return badRequest('Body must be JSON');
  }

  const telegramId = Number(body?.telegram_id);
  if (!Number.isInteger(telegramId) || telegramId <= 0) {
    return badRequest('telegram_id must be a positive integer');
  }

  const rawText = body?.text ?? body?.raw_content ?? '';
  if (typeof rawText !== 'string') {
    return badRequest('text must be a string');
  }

  const photoBase64 = typeof body?.photo_base64 === 'string' ? body.photo_base64 : null;
  const imageUrl = typeof body?.image_url === 'string' ? body.image_url : null;

  try {
    const result = await ingestChannelMessage({
      telegramId,
      text: rawText,
      photoBase64,
      imageUrl,
      messageDate: parseDate(body?.date)
    });

    return Response.json({
      ok: true,
      kind: result.kind,
      action: result.action,
      telegram_id: result.telegramId,
      recipe_id: result.recipeId ?? null,
      status: result.status ?? null,
      is_parsed: result.isParsed ?? false,
      parse_errors: result.parseErrors ?? [],
      image_url: result.imageUrl ?? null
    });
  } catch (error) {
    log.error({ err: error, telegramId }, 'Internal upsert failed');
    return Response.json(
      {
        ok: false,
        telegram_id: telegramId,
        error: error instanceof Error ? error.message : 'Upsert failed'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/internal/old-channel/ingest — the Telethon reconcile/rebuild entry point.
 *
 * The old channel is the sole intake (ARCHITECTURE §4.1, §4.6, Wave 5.5). The
 * Bot API webhook covers it in real time; this route is the *other* place that
 * pipeline runs — the Python (Telethon) function's history reads, which the
 * Bot API cannot do because it cannot see messages older than the bot. It
 * exists apart from `/api/internal/recipes/upsert` on purpose: that route is
 * the plain, AI-free upsert door, and deliberately keeps the Gemini SDK out of
 * its bundle. Ingesting an old-channel message always needs a reformat, so it
 * gets a route of its own.
 *
 * Same lookup-then-branch the webhook uses: a message id a row already claims
 * (`{source_channel: 'old', source_message_id}`) is an edit of that row;
 * anything else is a brand-new recipe under a fresh internal `telegram_id`.
 *
 * Auth: `Authorization: Bearer <INTERNAL_API_SECRET>`.
 *
 * Request body:
 * ```jsonc
 * { "sourceMessageId": 42, "text": "...", "date": 1700000800 } // date: unix seconds, optional
 * ```
 *
 * Response: `{ ok, action, telegram_id, recipeId, needs_review? }`, where
 * `action` is `created` | `updated` | `unchanged`.
 *
 * Unlike the webhook — which always answers 200 so Telegram never enters a
 * retry storm — this route is called by a caller that can and should retry:
 * an AI failure or a DB error here answers 500, not a swallowed 200.
 */
import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { requireInternalSecret } from '@/lib/internal/auth';
import { ingestOldChannelPost } from '@/lib/recipes/oldChannel';
import { applyOldChannelEdit, findRecipeByOldChannelSource } from '@/lib/recipes/oldChannelEdit';

export const dynamic = 'force-dynamic';
/** One Gemini call per invocation — well past the 15s Vercel default. */
export const maxDuration = 60;

const log = logger.child({ context: 'api/internal/old-channel/ingest' });

interface IngestBody {
  sourceMessageId?: unknown;
  text?: unknown;
  date?: unknown;
}

function badRequest(message: string): Response {
  return Response.json({ ok: false, error: message }, { status: 400 });
}

/** Telegram's epoch-seconds post time, when supplied. */
function parseMessageDate(value: unknown): Date | null {
  return typeof value === 'number' && Number.isFinite(value) ? new Date(value * 1000) : null;
}

export async function POST(request: NextRequest): Promise<Response> {
  const unauthorized = requireInternalSecret(request);
  if (unauthorized) return unauthorized;

  let body: IngestBody;
  try {
    body = (await request.json()) as IngestBody;
  } catch {
    return badRequest('Body must be JSON');
  }

  const sourceMessageId = Number(body?.sourceMessageId);
  if (!Number.isInteger(sourceMessageId) || sourceMessageId <= 0) {
    return badRequest('sourceMessageId must be a positive integer');
  }

  const text = typeof body?.text === 'string' ? body.text : '';
  if (!text.trim()) {
    return badRequest('text must be a non-empty string');
  }

  try {
    const existing = await findRecipeByOldChannelSource(sourceMessageId);

    if (existing) {
      const edit = await applyOldChannelEdit(existing, text);
      return Response.json({
        ok: true,
        action: edit.action,
        telegram_id: edit.telegramId,
        recipeId: edit.recipeId,
        needs_review: edit.needsReview
      });
    }

    const result = await ingestOldChannelPost({
      sourceMessageId,
      text,
      messageDate: parseMessageDate(body?.date)
    });

    return Response.json({
      ok: true,
      action: result.ingest.action,
      telegram_id: result.telegramId,
      recipeId: result.ingest.recipeId
    });
  } catch (error) {
    // Deliberately not swallowed into a 200 — see the module docstring.
    log.error({ err: error, sourceMessageId }, 'Old-channel ingest failed');
    return Response.json(
      {
        ok: false,
        sourceMessageId,
        error: error instanceof Error ? error.message : 'Old-channel ingest failed'
      },
      { status: 500 }
    );
  }
}

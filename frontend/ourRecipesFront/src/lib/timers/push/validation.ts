import { z } from 'zod';
import { ApiError } from '@/lib/utils/api-errors';

export const subscriptionSchema = z.object({
  endpoint: z.string().url().max(4096).refine(value => {
    const url = new URL(value);
    const host = url.hostname;
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash && (!url.port || url.port === '443') && (
      host === 'fcm.googleapis.com' || host === 'web.push.apple.com' || host.endsWith('.push.apple.com') ||
      host === 'updates.push.services.mozilla.com' || host.endsWith('.push.services.mozilla.com') || host.endsWith('.notify.windows.com')
    );
  }, 'Unsupported push service'),
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}=$|^[A-Za-z0-9_-]{87}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}(?:==)?$/)
  })
});
export const timerPushSchema = z.object({
  subscriptionId: z.string().uuid(),
  version: z.number().int().min(1).max(2147483647),
  state: z.enum(['running', 'paused', 'cancelled']),
  endsAt: z.number().int().positive().nullable(),
  recipeName: z.string().min(1).max(160),
  description: z.string().min(1).max(500),
  recipeUrl: z.string().regex(/^\/$|^\/recipe\/-?\d+$/).max(200).default('/'),
  muted: z.boolean()
}).superRefine((value, ctx) => {
  if (value.state === 'running' && (value.endsAt === null || value.endsAt > Date.now() + 7 * 86400000)) {
    ctx.addIssue({ code: 'custom', message: 'Running timers need a deadline within seven days', path: ['endsAt'] });
  }
});
export type TimerPushInput = z.infer<typeof timerPushSchema>;
export type SubscriptionInput = z.infer<typeof subscriptionSchema>;
export async function parsePushBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const raw = await request.text();
  if (raw.length > 16000) throw new ApiError(413, 'Request is too large');
  let body: unknown;
  try { body = JSON.parse(raw); } catch { throw new ApiError(400, 'Invalid JSON'); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, 'Invalid push request');
  return parsed.data;
}

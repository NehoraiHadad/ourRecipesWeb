import { createHash } from 'node:crypto';
import { Prisma, type RecipeTimerPush } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/utils/api-errors';
import type { SubscriptionInput, TimerPushInput } from './validation';

function retryableConflict(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (['P2034', 'P2002'].includes(error.code)) return true;
  const meta = error.meta as { code?: string; driverAdapterError?: { cause?: { originalCode?: string; kind?: string } } } | undefined;
  return error.code === 'P2010' && (meta?.code === '40001' || meta?.driverAdapterError?.cause?.originalCode === '40001');
}

export async function registerTimerSubscription(ownerId: string, input: SubscriptionInput) {
  const hash = createHash('sha256').update(input.endpoint).digest('hex');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
    const existing = await tx.timerPushSubscription.findUnique({ where: { endpoint_hash: hash } });
    if (existing && existing.owner_id !== ownerId) throw new ApiError(409, 'Resubscribe this browser for the current session');
    if (existing) {
      await tx.timerPushSubscription.update({ where: { id: existing.id }, data: { p256dh: input.keys.p256dh, auth: input.keys.auth } });
      return existing.id;
    }
    if (await tx.timerPushSubscription.count({ where: { owner_id: ownerId } }) >= 10) throw new ApiError(429, 'Too many browser subscriptions');
    return (await tx.timerPushSubscription.create({ data: { owner_id: ownerId, endpoint_hash: hash, endpoint: input.endpoint, ...input.keys } })).id;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (attempt < 2 && retryableConflict(error)) continue;
      throw error;
    }
  }
  throw new Error('Subscription retry exhausted');
}

/** Lock the same row as delivery, so an acknowledged pause/delete invalidates old jobs. */
export async function updateServerTimer(ownerId: string, timerId: string, input: TimerPushInput) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        const subscription = await tx.timerPushSubscription.findFirst({ where: { id: input.subscriptionId, owner_id: ownerId } });
        if (!subscription) throw new ApiError(404, 'Subscription not found');
        let existing = await tx.recipeTimerPush.findUnique({ where: { subscription_id_timer_id: { subscription_id: subscription.id, timer_id: timerId } } });
        if (existing) {
          await tx.$queryRaw`SELECT id FROM recipe_timer_push WHERE id = ${existing.id} FOR UPDATE`;
          existing = await tx.recipeTimerPush.findUnique({ where: { id: existing.id } });
        }
        if (existing && existing.version > input.version) return { timer: existing, changed: false, previousRun: null };
        const state = input.state === 'running' && input.endsAt! <= Date.now() ? 'expired' : input.state;
        const data = {
          version: input.version, state, ends_at: input.endsAt === null ? null : new Date(input.endsAt),
          recipe_name: input.recipeName, description: input.description, recipe_url: input.recipeUrl, muted: input.muted
        };
        if (existing?.version === input.version) {
          const same = existing.ends_at?.getTime() === data.ends_at?.getTime() &&
            existing.recipe_name === data.recipe_name && existing.description === data.description &&
            existing.recipe_url === data.recipe_url && existing.muted === data.muted;
          if (!same || (existing.state !== state && !['failed', 'sent', 'expired'].includes(existing.state))) {
            throw new ApiError(409, 'Timer version already has different contents');
          }
          if (existing.state !== 'failed') return { timer: existing, changed: false, previousRun: null };
        }
        if (state === 'running' && existing?.state !== 'running' &&
          await tx.recipeTimerPush.count({ where: { subscription_id: subscription.id, state: 'running', ends_at: { gt: new Date() } } }) >= 20) {
          throw new ApiError(429, 'Too many active timers');
        }
        if (!existing && await tx.recipeTimerPush.count({ where: { subscription_id: subscription.id } }) >= 1000) {
          throw new ApiError(429, 'Timer history limit reached; re-enable notifications');
        }
        const timer = existing
          ? await tx.recipeTimerPush.update({ where: { id: existing.id }, data: { ...data, workflow_id: null, notified_at: null } })
          : await tx.recipeTimerPush.create({ data: { ...data, subscription_id: subscription.id, timer_id: timerId } });
        return { timer, changed: true, previousRun: existing?.workflow_id ?? null };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (attempt < 2 && retryableConflict(error)) continue;
      throw error;
    }
  }
  throw new Error('Timer transaction retry exhausted');
}

export function timerPushResponse(timer: RecipeTimerPush) {
  const state = timer.state === 'running' ? (timer.workflow_id ? 'scheduled' : 'pending') : timer.state;
  return { version: timer.version, state };
}

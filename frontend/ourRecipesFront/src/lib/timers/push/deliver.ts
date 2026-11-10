import { createHash } from 'node:crypto';
import webPush from 'web-push';
import { prisma } from '@/lib/prisma';
import { timerPushConfig } from './config';

export const TIMER_PUSH_MAX_LATENESS_MS = 120000;
export class TimerNotDueError extends Error {}

/** The row lock also serializes competing jobs and pause/delete requests. */
export async function deliverTimerPush(id: string, version: number) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM recipe_timer_push WHERE id = ${id} FOR UPDATE`;
    const timer = await tx.recipeTimerPush.findUnique({ where: { id }, include: { subscription: true } });
    if (!timer || timer.version !== version || timer.state !== 'running' || !timer.ends_at) return 'obsolete';
    const remaining = timer.ends_at.getTime() - Date.now();
    if (remaining > 0) throw new TimerNotDueError('Timer is not due yet');
    const config = timerPushConfig();
    if (!config.enabled || remaining < -TIMER_PUSH_MAX_LATENESS_MS) {
      await tx.recipeTimerPush.update({ where: { id }, data: { state: 'expired' } });
      return 'expired';
    }
    const subscription = timer.subscription;
    const expiresAt = timer.ends_at.getTime() + TIMER_PUSH_MAX_LATENESS_MS;
    try {
      await webPush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({
        type: 'RECIPE_TIMER_END', timerId: timer.timer_id, version,
        title: `${timer.recipe_name} — הזמן הסתיים`, body: timer.description,
        url: timer.recipe_url, expiresAt, silent: timer.muted
      }), {
        vapidDetails: { subject: config.subject!, publicKey: config.publicKey!, privateKey: config.privateKey! },
        TTL: Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000)), urgency: 'high', timeout: 5000,
        topic: createHash('sha256').update(`${id}:${version}`).digest('base64url').slice(0, 32)
      });
    } catch (error) {
      const status = error && typeof error === 'object' && 'statusCode' in error ? Number(error.statusCode) : 0;
      if (status === 404 || status === 410) {
        await tx.timerPushSubscription.delete({ where: { id: subscription.id } });
        return 'unsubscribed';
      }
      if (status >= 400 && status < 500 && status !== 429) {
        await tx.recipeTimerPush.update({ where: { id }, data: { state: 'failed' } });
        return 'failed';
      }
      // Roll back: a transient transport error can be retried within the grace window.
      throw new Error('Push transport temporarily unavailable');
    }
    await tx.recipeTimerPush.update({ where: { id }, data: { state: 'sent', notified_at: new Date() } });
    return 'sent';
  }, { timeout: 15000, maxWait: 5000 });
}

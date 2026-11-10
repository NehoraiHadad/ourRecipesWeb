import { sleep, RetryableError, getStepMetadata } from 'workflow';
import { deliverTimerPush, TimerNotDueError } from '@/lib/timers/push/deliver';
import { prisma } from '@/lib/prisma';

/** Only IDs and the deadline enter durable workflow history, never subscription keys. */
export async function timerPushWorkflow(id: string, version: number, deadline: number) {
  'use workflow';
  if (deadline > Date.now()) await sleep(new Date(deadline));
  return await deliverPushStep(id, version);
}
async function deliverPushStep(id: string, version: number) {
  'use step';
  try { return await deliverTimerPush(id, version); }
  catch (error) {
    if (error instanceof TimerNotDueError) throw new RetryableError('Waiting for timer deadline', { retryAfter: '1s' });
    if (getStepMetadata().attempt >= 3) {
      await prisma.recipeTimerPush.updateMany({ where: { id, version, state: 'running' }, data: { state: 'failed' } });
      return 'failed';
    }
    throw error;
  }
}
deliverPushStep.maxRetries = 2;

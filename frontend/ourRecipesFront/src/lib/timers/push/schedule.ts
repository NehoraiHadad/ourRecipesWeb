import { start, getRun } from 'workflow/api';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/utils/api-errors';
import { timerPushWorkflow } from '@/workflows/timerPush';
import { updateServerTimer, timerPushResponse } from './store';
import type { TimerPushInput } from './validation';

async function cancelRun(id: string | null) {
  if (!id) return;
  try { await getRun(id).cancel(); } catch { /* A completed/missing old run is harmless; the DB version remains authoritative. */ }
}
export async function scheduleServerTimer(ownerId: string, timerId: string, input: TimerPushInput) {
  const result = await updateServerTimer(ownerId, timerId, input);
  const timer = result.timer;
  if (!result.changed && (timer.state !== 'running' || timer.workflow_id)) return timerPushResponse(timer);
  await cancelRun(result.previousRun);
  if (timer.state !== 'running' || !timer.ends_at) return timerPushResponse(timer);
  try {
    const run = await start(timerPushWorkflow, [timer.id, timer.version, timer.ends_at.getTime()]);
    const attached = await prisma.recipeTimerPush.updateMany({
      where: { id: timer.id, version: timer.version, state: 'running', workflow_id: null }, data: { workflow_id: run.runId }
    });
    if (attached.count !== 1) {
      await cancelRun(run.runId);
      const current = await prisma.recipeTimerPush.findUnique({ where: { id: timer.id } });
      if (!current) return { state: 'cancelled', version: timer.version };
      return timerPushResponse(current);
    }
    return { state: 'scheduled', version: timer.version };
  } catch {
    await prisma.recipeTimerPush.updateMany({ where: { id: timer.id, version: timer.version, state: 'running', workflow_id: null }, data: { state: 'failed' } });
    throw new ApiError(503, 'Could not schedule a background notification');
  }
}

import { pushAuth, pushError, requireTimerPush } from '@/lib/timers/push/http';
import { parsePushBody, timerPushSchema } from '@/lib/timers/push/validation';
import { scheduleServerTimer } from '@/lib/timers/push/schedule';
import { ApiError } from '@/lib/utils/api-errors';
export const runtime = 'nodejs';
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await pushAuth(request);
    if (!auth.ok) return auth.response;
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(params.id)) throw new ApiError(400, 'Invalid timer ID');
    const input = await parsePushBody(request, timerPushSchema);
    if (input.state === 'running') requireTimerPush();
    return Response.json(await scheduleServerTimer(auth.ownerId, params.id, input), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return pushError(error); }
}

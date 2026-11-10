import { pushAuth, pushError, requireTimerPush } from '@/lib/timers/push/http';
import { parsePushBody, subscriptionSchema } from '@/lib/timers/push/validation';
import { registerTimerSubscription } from '@/lib/timers/push/store';
export async function POST(request: Request) {
  try {
    const auth = await pushAuth(request);
    if (!auth.ok) return auth.response;
    requireTimerPush();
    const input = await parsePushBody(request, subscriptionSchema);
    const id = await registerTimerSubscription(auth.ownerId, input);
    return Response.json({ id }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return pushError(error); }
}

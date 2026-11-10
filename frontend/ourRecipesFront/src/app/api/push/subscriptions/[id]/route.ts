import { prisma } from '@/lib/prisma';
import { pushAuth, pushError } from '@/lib/timers/push/http';
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await pushAuth(request);
    if (!auth.ok) return auth.response;
    await prisma.timerPushSubscription.deleteMany({ where: { id: params.id, owner_id: auth.ownerId } });
    return new Response(null, { status: 204 });
  } catch (error) { return pushError(error); }
}

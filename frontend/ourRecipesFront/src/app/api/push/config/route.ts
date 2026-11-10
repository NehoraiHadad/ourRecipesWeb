import { timerPushConfig } from '@/lib/timers/push/config';
export const dynamic = 'force-dynamic';
export function GET() {
  const config = timerPushConfig();
  return Response.json({ enabled: config.enabled, publicKey: config.publicKey }, { headers: { 'Cache-Control': 'no-store' } });
}

export function timerPushConfig() {
  const publicKey = process.env.TIMER_PUSH_PUBLIC_KEY;
  const privateKey = process.env.TIMER_PUSH_PRIVATE_KEY;
  const subject = process.env.TIMER_PUSH_SUBJECT;
  const enabled = process.env.TIMER_PUSH_ENABLED === 'true' && Boolean(publicKey && privateKey && subject);
  return { enabled, publicKey: enabled ? publicKey! : null, privateKey, subject };
}

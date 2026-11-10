import { timerDB } from '../../src/db/timerDB';
import { changeClock, remainingSeconds, restoreClock } from '../../src/lib/timers/clock';
import { alarmPlatform, allocateNotificationId, cancelNativeAlarm, requestNativeAlarmPermission, syncNativeAlarm, type NativeAlarmState } from '../../src/lib/timers/nativeAlarms';
import type { Timer } from '../../src/context/TimerContext';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const start = element<HTMLButtonElement>('start');
const pause = element<HTMLButtonElement>('pause');
const cancel = element<HTMLButtonElement>('cancel');
const permissions = element<HTMLButtonElement>('permissions');
const muted = element<HTMLInputElement>('muted');
const seconds = element<HTMLInputElement>('seconds');
let timer: Timer | undefined;
let busy = false;
const messages: Record<NativeAlarmState, string> = {
  web: 'בדפדפן רגיל לא ניתן לתזמן התראה במסך כבוי. יש להריץ את האפליקציה המותקנת.',
  scheduled: 'התראה נקבעה במכשיר', paused: 'הטיימר מושהה; ההתראה בוטלה', expired: 'זמן הבדיקה הסתיים',
  'permission-required': 'לא נקבעה התראה: יש לאפשר התראות במכשיר',
  'exact-permission-required': 'לא נקבעה התראה: יש לאפשר תזמון מדויק במכשיר',
  error: 'עדכון ההתראה נכשל. ייתכן שהתראה קודמת עדיין פעילה; נסו שוב.'
};
function render() {
  const left = timer ? remainingSeconds(timer) : 0;
  element('remaining').textContent = timer ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '';
  element('status').textContent = timer ? messages[left === 0 && !timer.isPaused ? 'expired' : timer.alarmState ?? 'error'] : 'אין טיימר פעיל';
  pause.textContent = timer?.isPaused ? 'המשך' : 'השהה';
  pause.disabled = busy || !timer || (left === 0 && !timer.isPaused);
  cancel.disabled = busy || !timer;
  start.disabled = busy;
  permissions.disabled = busy;
  muted.disabled = busy;
}
async function run(operation: () => Promise<void>) {
  if (busy) return;
  busy = true; element('error').textContent = ''; render();
  try { await operation(); }
  catch (error) {
    element('error').textContent = 'הפעולה לא הושלמה. בדקו הרשאות ונסו שוב.';
    console.error(error);
  } finally { busy = false; render(); }
}
async function saveAndSync() {
  if (!timer) return;
  await timerDB.saveTimer(timer);
  try { timer.alarmState = await syncNativeAlarm(timer, muted.checked); }
  catch (error) { timer.alarmState = 'error'; await timerDB.saveTimer(timer); throw error; }
  await timerDB.saveTimer(timer);
}
permissions.onclick = () => void run(async () => {
  const state = await requestNativeAlarmPermission();
  element('error').textContent = state === 'scheduled' ? '' : messages[state];
  if (timer) await saveAndSync();
});
start.onclick = () => void run(async () => {
  const duration = Number(seconds.value);
  if (!Number.isInteger(duration) || duration < 10 || duration > 3600) {
    element('error').textContent = 'יש לבחור משך בין 10 ל־3600 שניות.'; return;
  }
  if (timer) { await cancelNativeAlarm(timer); await timerDB.removeTimer(timer.id); }
  timer = {
    id: crypto.randomUUID(), recipeId: 'native-test', recipeName: 'בדיקת טיימר מקומי',
    description: 'הטיימר הסתיים', stepNumber: 1, isPaused: false, timeLeft: duration,
    endsAt: Date.now() + duration * 1000,
    notificationId: allocateNotificationId([])
  };
  await saveAndSync();
});
pause.onclick = () => void run(async () => {
  if (timer) { timer = changeClock(timer, { isPaused: !timer.isPaused }); await saveAndSync(); }
});
cancel.onclick = () => void run(async () => {
  if (timer) { await cancelNativeAlarm(timer); await timerDB.removeTimer(timer.id); timer = undefined; }
});
muted.onchange = () => void run(async () => {
  await timerDB.saveSettings({ isSoundMuted: muted.checked, notificationsEnabled: true });
  await saveAndSync();
});
element('platform').textContent = `סביבת הפעלה: ${alarmPlatform()}`;
void run(async () => {
  await timerDB.init();
  const records = await timerDB.getAllTimers();
  timer = records.find(record => record.recipeId === 'native-test');
  muted.checked = (await timerDB.getSettings()).isSoundMuted;
  if (timer) { timer = restoreClock(timer); await saveAndSync(); }
});
setInterval(render, 1000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void run(async () => { await saveAndSync(); });
});

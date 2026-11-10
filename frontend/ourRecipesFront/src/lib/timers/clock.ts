/** A running timer stores a deadline; browser callbacks only refresh the display. */
export interface TimerClock {
  timeLeft: number;
  isPaused?: boolean;
  endsAt?: number | null;
}

export function remainingSeconds(timer: TimerClock, now = Date.now()): number {
  if (timer.isPaused || timer.endsAt == null) return Math.max(0, timer.timeLeft);
  return Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
}

/** Old records have no deadline. Their previously elapsed background time is unknowable. */
export function restoreClock<T extends TimerClock>(timer: T, now = Date.now()): T {
  const endsAt = timer.isPaused ? null : timer.endsAt ?? now + timer.timeLeft * 1000;
  return { ...timer, endsAt, timeLeft: remainingSeconds({ ...timer, endsAt }, now) };
}

export function changeClock<T extends TimerClock>(timer: T, updates: Partial<T>, now = Date.now()): T {
  const current = restoreClock(timer, now);
  const next = { ...current, ...updates };
  if (next.isPaused) {
    return { ...next, endsAt: null };
  }
  // Renaming must preserve the deadline, including the fractional second.
  if (current.isPaused || updates.timeLeft !== undefined) {
    next.endsAt = now + next.timeLeft * 1000;
  }
  return next;
}

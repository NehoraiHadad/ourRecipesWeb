import { describe, expect, it } from 'vitest';
import { changeClock, remainingSeconds, restoreClock } from '@/lib/timers/clock';

describe('timer deadlines', () => {
  it('counts suspended time without receiving callbacks', () => {
    const timer = { timeLeft: 120, isPaused: false, endsAt: 121000 };
    expect(remainingSeconds(timer, 91000)).toBe(30);
    expect(remainingSeconds(timer, 150000)).toBe(0);
  });

  it('snapshots remaining time on pause and creates a fresh deadline on resume', () => {
    const timer = { timeLeft: 120, isPaused: false, endsAt: 121000 };
    const paused = changeClock(timer, { isPaused: true }, 91500);
    expect(paused).toMatchObject({ timeLeft: 30, endsAt: null });
    expect(remainingSeconds(paused, 999999)).toBe(30);
    const resumed = changeClock(paused, { isPaused: false }, 1000000);
    expect(resumed.endsAt).toBe(1030000);
    expect(remainingSeconds(resumed, 1015000)).toBe(15);
  });

  it('restores running and paused legacy records without creating NaN deadlines', () => {
    expect(restoreClock({ timeLeft: 60 }, 1000)).toMatchObject({ endsAt: 61000, timeLeft: 60 });
    expect(restoreClock({ timeLeft: 60, isPaused: true }, 1000)).toMatchObject({ endsAt: null, timeLeft: 60 });
  });

  it('does not extend a running timer when renamed between second boundaries', () => {
    const timer = { timeLeft: 60, isPaused: false, endsAt: 61000, description: 'old' };
    expect(changeClock(timer, { description: 'new' }, 2500).endsAt).toBe(61000);
    expect(changeClock(timer, { timeLeft: 90 }, 2500).endsAt).toBe(92500);
  });
});

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRecipeVoice } from '@/hooks/useRecipeVoice';

class FakeRecognition {
  static instance: FakeRecognition;
  lang = '';
  continuous = false;
  interimResults = false;
  onresult: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  abort = vi.fn(() => this.onend?.());
  constructor() { FakeRecognition.instance = this; }
  say(text: string) { this.onresult?.({ results: [[{ transcript: text }]] }); this.onend?.(); }
}
class FakeUtterance {
  text: string;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) { this.text = text; }
}
const speak = vi.fn();
const cancel = vi.fn();
const steps = ['שמים קמח בקערה', 'מוסיפים מים ומערבבים', 'אופים 20 דקות'];

beforeEach(() => {
  vi.useFakeTimers();
  speak.mockClear(); cancel.mockClear();
  vi.stubGlobal('SpeechRecognition', FakeRecognition);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  vi.stubGlobal('speechSynthesis', { speak, cancel, getVoices: () => [{ lang: 'he-IL' }] });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('recipe voice navigation', () => {
  it('advances a step on a natural Hebrew command and does not listen to its own narration', () => {
    const { result } = renderHook(() => useRecipeVoice(steps));
    const recognition = FakeRecognition.instance;
    expect(recognition.start).not.toHaveBeenCalled(); // Opt-in microphone.
    act(() => result.current.toggleMicrophone());
    expect(recognition.start).toHaveBeenCalledTimes(1);
    act(() => recognition.say('שמתי קמח. מה עכשיו?'));
    expect(result.current.stepIndex).toBe(1);
    expect(speak.mock.lastCall?.[0].text).toContain(steps[1]);
    act(() => recognition.say('מה עכשיו')); // Echo during TTS must be ignored.
    expect(result.current.stepIndex).toBe(1);
    const utterance = speak.mock.lastCall![0] as FakeUtterance;
    act(() => utterance.onend?.());
    expect(recognition.start).toHaveBeenCalledTimes(2);
    act(() => recognition.say('חזור על השלב'));
    expect(result.current.stepIndex).toBe(1);
    expect(speak.mock.lastCall?.[0].text).toContain(steps[1]);
  });

  it('handles previous, unknown, last-step and stop commands without inventing steps', () => {
    const { result } = renderHook(() => useRecipeVoice(steps));
    const recognition = FakeRecognition.instance;
    act(() => result.current.toggleMicrophone());
    act(() => recognition.say('כמה קמח צריך'));
    expect(result.current.stepIndex).toBe(0);
    expect(result.current.status).toContain('לא זוהתה');
    act(() => result.current.next());
    act(() => (speak.mock.lastCall![0] as FakeUtterance).onend?.());
    act(() => recognition.say('השלב הקודם'));
    expect(result.current.stepIndex).toBe(0);
    act(() => result.current.next());
    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current.stepIndex).toBe(2);
    expect(result.current.status).toContain('האחרון');
    act(() => (speak.mock.lastCall![0] as FakeUtterance).onend?.());
    act(() => recognition.say('עצור'));
    expect(result.current.microphoneOn).toBe(false);
    expect(result.current.speaking).toBe(false);
    const starts = recognition.start.mock.calls.length;
    act(() => vi.advanceTimersByTime(1000));
    expect(recognition.start).toHaveBeenCalledTimes(starts);
  });

  it('stops on permission denial and releases the microphone on unmount', () => {
    const { result, unmount } = renderHook(() => useRecipeVoice(steps));
    const recognition = FakeRecognition.instance;
    act(() => result.current.toggleMicrophone());
    act(() => recognition.onerror?.({ error: 'not-allowed' }));
    expect(result.current.microphoneOn).toBe(false);
    expect(result.current.status).toContain('הרשאה');
    unmount();
    expect(recognition.abort).toHaveBeenCalled();
    expect(recognition.onend).toBeNull();
  });

  it('allows button navigation when browser speech APIs are absent', () => {
    vi.stubGlobal('SpeechRecognition', undefined);
    vi.stubGlobal('SpeechSynthesisUtterance', undefined);
    const { result } = renderHook(() => useRecipeVoice(steps));
    expect(result.current.canSpeak).toBe(false);
    expect(result.current.canListen).toBe(false);
    act(() => result.current.next());
    expect(result.current.stepIndex).toBe(1);
  });
});

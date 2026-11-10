import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useRecipeVoice } from '@/components/voice/useRecipeVoice';
const mock = vi.hoisted(() => ({ hasModel: vi.fn(async () => true), deleteModels: vi.fn(async () => {}), downloadModel: vi.fn(async () => {}), start: vi.fn(async () => {}), cancelMic: vi.fn(), finish: vi.fn(async () => new Float32Array(1600)) }));
vi.mock('@/lib/voice/models', async importOriginal => ({ ...await importOriginal<object>(), hasModel: mock.hasModel, deleteModels: mock.deleteModels, downloadModel: mock.downloadModel }));
vi.mock('@/lib/voice/microphone', () => ({ LocalMicrophone: class { start = mock.start; cancel = mock.cancelMic; finish = mock.finish; } }));
class WorkerStub {
  static instances: WorkerStub[] = [];
  onmessage?: (e: { data: object }) => void;
  onerror?: (e: { message: string }) => void;
  terminate = vi.fn();
  postMessage = vi.fn((payload: { type: string }) => {
    queueMicrotask(() => this.onmessage?.({ data: payload.type === 'load' ? { type: 'ready', ms: 1 } : { type: 'result', text: 'שמתי קמח', ms: 2, audioSeconds: .1 } }));
  });
  constructor() { WorkerStub.instances.push(this); }
}
let synthesis: { cancel: ReturnType<typeof vi.fn>; speak: ReturnType<typeof vi.fn>; getVoices: () => object[]; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
beforeEach(() => {
  WorkerStub.instances = []; vi.clearAllMocks();
  vi.stubGlobal('isSecureContext', true); vi.stubGlobal('caches', { open: vi.fn() }); vi.stubGlobal('Worker', WorkerStub);
  vi.stubGlobal('AudioWorkletNode', class {});
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } });
  synthesis = { cancel: vi.fn(), speak: vi.fn(), getVoices: () => [{ lang: 'he-IL', name: 'local', localService: true }, { lang: 'he-IL', name: 'cloud', localService: false }], addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal('speechSynthesis', synthesis); vi.stubGlobal('SpeechSynthesisUtterance', class {});
});
afterEach(() => vi.unstubAllGlobals());
describe('voice lifecycle (simulated browser speech/microphone/worker APIs)', () => {
  it('fails closed without browser support and never starts a recognizer or fetch', async () => {
    vi.stubGlobal('Worker', undefined); vi.stubGlobal('caches', undefined);
    const { result } = renderHook(() => useRecipeVoice());
    expect(result.current.supported).toBe(false); expect(WorkerStub.instances).toHaveLength(0); expect(mock.start).not.toHaveBeenCalled();
  });
  it('uses only local Hebrew voices and prevents self-transcription until speech ends plus cooldown', async () => {
    const { result } = renderHook(() => useRecipeVoice());
    expect(result.current.voices.map(v => v.name)).toEqual(['local']);
    act(() => result.current.speak('להוסיף קמח'));
    expect(result.current.speaking).toBe(true);
    await act(async () => { await result.current.startRecording(vi.fn()); });
    expect(mock.start).not.toHaveBeenCalled();
    act(() => result.current.stopSpeech());
    await act(async () => { await result.current.startRecording(vi.fn()); });
    expect(mock.start).not.toHaveBeenCalled();
  });
  it('stops capture before transcribing and releases workers on recipe unmount', async () => {
    const onText = vi.fn(); const { result, unmount } = renderHook(() => useRecipeVoice());
    await waitFor(() => expect(result.current.status.asr).toBe('cached'));
    await act(async () => { await result.current.startRecording(onText); });
    expect(result.current.recording).toBe(true);
    act(() => result.current.speak('אסור בזמן הקלטה'));
    expect(synthesis.speak).not.toHaveBeenCalled();
    await act(async () => { await result.current.stopRecording(onText); });
    const calls = WorkerStub.instances[0].postMessage;
    expect(mock.finish.mock.invocationCallOrder[0]).toBeLessThan(calls.mock.invocationCallOrder[1]);
    expect(onText).toHaveBeenCalledWith('שמתי קמח');
    unmount(); expect(WorkerStub.instances[0].terminate).toHaveBeenCalled();
  });
  it('discards in-flight inference after cancel without altering a new request', async () => {
    const { result } = renderHook(() => useRecipeVoice());
    await waitFor(() => expect(result.current.status.llm).toBe('cached'));
    await act(async () => { await result.current.generate([]); });
    const old = WorkerStub.instances[0]; old.postMessage.mockImplementation(() => {});
    let request: Promise<string | undefined>;
    act(() => { request = result.current.generate([]); });
    act(() => result.current.cancel());
    await act(async () => { expect(await request!).toBeUndefined(); });
    expect(old.terminate).toHaveBeenCalled(); expect(result.current.busy).toBe(false);
    await act(async () => { expect(await result.current.generate([])).toBe('שמתי קמח'); });
  });
});

describe('speech cancellation regression (simulated synthesis events)', () => {
  it('ignores a late error from an intentionally cancelled utterance', () => {
    const { result } = renderHook(() => useRecipeVoice());
    act(() => result.current.speak('להוסיף קמח'));
    const utterance = synthesis.speak.mock.calls[0][0];
    act(() => result.current.stopSpeech());
    act(() => utterance.onerror());
    expect(result.current.error).toBe('');
    expect(result.current.speaking).toBe(false);
  });
});


describe('model deletion concurrency (simulated storage)', () => {
  it('does not start a new download while deletion settles, even after cancel', async () => {
    let finishDelete!: () => void;
    mock.deleteModels.mockImplementationOnce(() => new Promise<void>(resolve => { finishDelete = resolve; }));
    const { result } = renderHook(() => useRecipeVoice());
    let deletion!: Promise<void>;
    act(() => { deletion = result.current.remove(); });
    await waitFor(() => expect(mock.deleteModels).toHaveBeenCalled());
    act(() => result.current.cancel());
    await act(async () => { await result.current.prepare('asr'); });
    expect(mock.downloadModel).not.toHaveBeenCalled();
    await act(async () => { finishDelete(); await deletion; });
    await act(async () => { await result.current.prepare('asr'); });
    expect(mock.downloadModel).toHaveBeenCalledTimes(1);
  });
});

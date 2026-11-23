import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import LocalRecipeMicrophone from '@/components/recipe/LocalRecipeMicrophone';

const f = vi.hoisted(() => ({ supported: vi.fn(), transcribe: vi.fn() }));
vi.mock('@/lib/voice/localAsr', () => ({
  asrBytes: 100, asrCache: 'test-asr', asrStorage: async () => 'complete', supportsAsr: f.supported,
  RecipeTranscriber: class { async load() {} transcribe = f.transcribe; close() {} },
  recordingSamples: async () => new Float32Array(16000),
}));
class Recorder {
  state = 'inactive';
  onstop: (() => void) | null = null;
  constructor(readonly stream: MediaStream) {}
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; queueMicrotask(() => this.onstop?.()); }
}
function setup(getUserMedia: () => Promise<unknown>) {
  vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { mediaDevices: {getUserMedia} }));
  vi.stubGlobal('MediaRecorder', Recorder);
  const interrupt = {current: null as (() => void) | null}, onTranscript = vi.fn();
  const view=render(<LocalRecipeMicrophone steps={['לערבב']} ingredients={['קמח']} disabled={false}
    stopVoice={() => {}} interrupt={interrupt} onTranscript={onTranscript} />);
  return {interrupt, onTranscript, ...view};
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('releases a late microphone permission after leaving the recipe', async () => {
  f.supported.mockReturnValue(true);
  let allow!: (stream: unknown) => void;
  const stop = vi.fn();
  const {unmount,onTranscript} = setup(() => new Promise(resolve => {allow=resolve;}));
  fireEvent.click(await screen.findByRole('button',{name:'הקלטת שאלה או עדכון'}));
  unmount();
  await act(async () => allow({getTracks:()=>[{stop}]}));
  expect(stop).toHaveBeenCalledOnce(); expect(onTranscript).not.toHaveBeenCalled();
});

it('waits for an explicit correction before delivering uncertain audio to the brain', async () => {
  f.supported.mockReturnValue(true);
  f.transcribe.mockResolvedValue({text:'עוד לא יובבתי',uncertain:true});
  const {onTranscript}=setup(async()=>({getTracks:()=>[{stop:vi.fn()}]}));
  fireEvent.click(await screen.findByRole('button',{name:'הקלטת שאלה או עדכון'}));
  fireEvent.click(await screen.findByRole('button',{name:'סיום ושליחה לתמלול'}));
  const editor=await screen.findByRole('textbox');
  expect(onTranscript).not.toHaveBeenCalled();
  fireEvent.change(editor,{target:{value:'עוד לא ערבבתי'}});
  fireEvent.click(screen.getByRole('button',{name:'אישור התמלול'}));
  expect(onTranscript).toHaveBeenCalledWith('עוד לא ערבבתי');
});

it('keeps the keyboard fallback accessible on unsupported devices', async () => {
  f.supported.mockReturnValue(false);
  const mic=vi.fn();setup(mic);
  expect(await screen.findByText(/התמלול המקומי אינו זמין/)).toBeInTheDocument();
  expect(mic).not.toHaveBeenCalled();
});

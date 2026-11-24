import { afterEach, expect, it, vi } from 'vitest';
import { LiveMicrophone } from '@/lib/voice/liveMicrophone';

const {feed} = vi.hoisted(() => ({feed:vi.fn()}));
vi.mock('@/lib/voice/localAsr', () => ({
  asrBase:'/voice/asr/v1/',
  RecipeTranscriber: class { async load() {} feed = feed; close() {} }
}));

function setup() {
  const track = {enabled:true, stop:vi.fn()};
  const stream = {getTracks:() => [track], getAudioTracks:() => [track]};
  const node = {port:{postMessage:vi.fn(), close:vi.fn(), onmessage:(_e: unknown) => {}}, connect:vi.fn(), disconnect:vi.fn()};
  vi.stubGlobal('AudioWorkletNode', class { constructor() { return node; } });
  vi.stubGlobal('AudioContext', class {
    audioWorklet = {addModule:vi.fn()};
    createMediaStreamSource() { return {connect:vi.fn()}; }
    async resume() {} async close() {}
  });
  const getUserMedia = vi.fn(async () => stream);
  vi.stubGlobal('navigator', {mediaDevices:{getUserMedia}});
  const partial = vi.fn(), final = vi.fn(), failed = vi.fn();
  const mic = new LiveMicrophone(partial, final, failed);
  function frame(epoch: number) { node.port.onmessage({data:{epoch,pcm:new Float32Array(1600)}}); }
  return {mic, frame, track, getUserMedia, stream, partial, final, failed};
}
afterEach(() => { vi.unstubAllGlobals(); feed.mockReset(); });

it('discards in-flight speech and queued microphone frames across narration, then starts a fresh utterance', async () => {
  const {mic, frame, track, partial, final} = setup();
  await mic.start([], []);
  let decoded!: (value: object) => void;
  feed.mockReturnValueOnce(new Promise(resolve => {decoded = resolve;}));
  frame(1); frame(1);
  mic.mute(true);
  expect(track.enabled).toBe(false);
  frame(1);
  decoded({final:{text:'הד', uncertain:false}});
  await Promise.resolve();
  expect(final).not.toHaveBeenCalled();
  mic.mute(false);
  frame(1);
  feed.mockResolvedValueOnce({partial:'שמתי'});
  frame(3);
  await vi.waitFor(() => expect(partial).toHaveBeenCalledWith('שמתי'));
  expect(feed).toHaveBeenCalledTimes(2);
  expect(feed.mock.calls[1][1]).toBe(true);
  feed.mockResolvedValueOnce({final:{text:'שמתי קמח',uncertain:false}});
  frame(3);
  await vi.waitFor(() => expect(final).toHaveBeenCalledOnce());
  mic.close();
  expect(track.stop).toHaveBeenCalledOnce();
});

it('releases a microphone permission granted after the session ends', async () => {
  const {mic, track, getUserMedia, stream} = setup();
  let allow!: (s: typeof stream) => void;
  getUserMedia.mockImplementationOnce(() => new Promise(resolve => {allow=resolve;}));
  const opening = mic.start([], []);
  await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
  mic.close(); allow(stream);
  await opening;
  expect(track.stop).toHaveBeenCalledOnce();
});

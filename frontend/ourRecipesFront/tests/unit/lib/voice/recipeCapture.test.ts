import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

it.each([8000, 16000, 44100, 48000])('preserves duration across worklet calls at %d Hz and flushes on mute', rate => {
  const postMessage = vi.fn();
  type Processor = {
    port: {onmessage(event: {data: number}): void};
    process(inputs: Float32Array[][]): void;
  };
  let mic!: Processor;
  runInNewContext(readFileSync('public/voice/asr/v1/capture-worklet.js','utf8'), {
    sampleRate:rate,
    AudioWorkletProcessor:class {port = {postMessage};},
    registerProcessor:(_name: string, Processor: new () => Processor) => {mic = new Processor();}
  });
  function write(samples: number, value: number) {
    for (let i = 0; i < samples; i += 128) {
      mic.process([[new Float32Array(Math.min(128, samples - i)).fill(value)]]);
    }
  }
  mic.port.onmessage({data:1});
  write(rate / 2, 0.5);
  expect(postMessage).toHaveBeenCalledTimes(5);
  write(rate / 100, 0.75);
  mic.port.onmessage({data:0});
  write(rate, 1);
  mic.port.onmessage({data:3});
  write(rate / 10, 0.25);
  expect(postMessage).toHaveBeenCalledTimes(6);
  const frame = postMessage.mock.lastCall![0];
  expect(frame.epoch).toBe(3);
  expect(frame.pcm.length).toBe(1600);
  expect(frame.pcm.every((sample: number) => sample === 0.25)).toBe(true);
});

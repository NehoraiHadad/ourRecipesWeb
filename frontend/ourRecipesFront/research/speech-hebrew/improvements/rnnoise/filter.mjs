import createRNNoise from './rnnoise.js';

const module = createRNNoise();
const frame = 480; // RNNoise consumes 10 ms of mono PCM at 48 kHz.
async function resample(data, from, to) {
  const context = new OfflineAudioContext(1, Math.ceil(data.length * to / from), to);
  const buffer = context.createBuffer(1, data.length, from);
  buffer.copyToChannel(data, 0);
  const player = context.createBufferSource();
  player.buffer = buffer;
  player.connect(context.destination);
  player.start();
  return (await context.startRendering()).getChannelData(0);
}

export async function filter(pcm) {
  const input = await resample(pcm, 16000, 48000);
  // Feed silence at the end so the last phoneme leaves the delayed filter.
  const output = new Float32Array((Math.ceil(input.length / frame) + 10) * frame);
  const pointer = module._malloc(frame * 4);
  const state = module._rnnoise_create(0);
  try {
    if (!pointer || !state) throw Error('RNNoise allocation failed');
    const window = module.HEAPF32.subarray(pointer / 4, pointer / 4 + frame);
    for (let start = 0; start < output.length; start += frame) {
      for (let j = 0; j < frame; j++) window[j] = (input[start + j] ?? 0) * 32768;
      module._rnnoise_process_frame(state, pointer, pointer);
      for (let j = 0; j < frame; j++) output[start + j] = window[j] / 32768;
    }
    return await resample(output, 48000, 16000);
  } finally {
    if (state) module._rnnoise_destroy(state);
    if (pointer) module._free(pointer);
  }
}
export const heapBytes = () => module.HEAPU8.byteLength;

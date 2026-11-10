// Kaldi-style log-mel features: 16 kHz PCM, 25 ms Povey, 10 ms hop,
// DC removal, pre-emphasis .97, FFT 512, 80 mel filters over 20..7600 Hz.
// Mathematical implementation for the experimental Zipformer adapter.
const N = 512, FRAME = 400, HOP = 160;
const mel = hz => 1127 * Math.log1p(hz / 700);
const filters = Array.from({ length: 80 }, (_, b) => {
  const lo = mel(20), delta = (mel(7600) - lo) / 81;
  return Array.from({ length: 256 }, (_, k) => Math.max(0, 1 - Math.abs((mel(k * 16000 / N) - lo) / delta - b - 1)));
});
function fft(real, imag) {
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [real[i], real[j]] = [real[j], real[i]]; }
  }
  for (let width = 2; width <= N; width *= 2) {
    for (let start = 0; start < N; start += width) {
      for (let k = 0; k < width / 2; k++) {
        const angle = -2 * Math.PI * k / width;
        const i = start + k, j = i + width / 2;
        const r = real[j] * Math.cos(angle) - imag[j] * Math.sin(angle);
        const q = real[j] * Math.sin(angle) + imag[j] * Math.cos(angle);
        real[j] = real[i] - r; imag[j] = imag[i] - q;
        real[i] += r; imag[i] += q;
      }
    }
  }
}
export function logMel(pcm) {
  const count = Math.max(0, Math.floor((pcm.length - 280) / HOP) + 1);
  const features = new Float32Array(count * 80);
  for (let frame = 0; frame < count; frame++) {
    const real = new Float64Array(N), imag = new Float64Array(N);
    let mean = 0;
    for (let i = 0; i < FRAME; i++) {
      let sample = frame * HOP - 120 + i;
      if (sample < 0) sample = -sample - 1;
      real[i] = pcm[sample] || 0; mean += real[i];
    }
    mean /= FRAME;
    for (let i = 0; i < FRAME; i++) real[i] -= mean;
    for (let i = FRAME - 1; i >= 0; i--) real[i] -= .97 * real[Math.max(0, i - 1)];
    for (let i = 0; i < FRAME; i++) real[i] *= Math.pow(.5 - .5 * Math.cos(2 * Math.PI * i / (FRAME - 1)), .85);
    fft(real, imag);
    for (let b = 0; b < 80; b++) {
      let energy = 0;
      for (let k = 0; k < 256; k++) energy += filters[b][k] * (real[k] ** 2 + imag[k] ** 2);
      features[frame * 80 + b] = Math.log(Math.max(1.1920929e-7, energy));
    }
  }
  return features;
}

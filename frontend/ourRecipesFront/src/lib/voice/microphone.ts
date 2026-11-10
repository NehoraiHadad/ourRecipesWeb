// Bounded push-to-talk. Tracks are closed BEFORE inference or speech synthesis.
export class LocalMicrophone {
  private stream?: MediaStream;
  private context?: AudioContext;
  private node?: AudioWorkletNode;
  private chunks: Float32Array[] = [];
  private count = 0;
  private cancelled = false;
  private rate = 16000;
  async start(onLimit: () => void) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
      if (this.cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream;
      const context = new AudioContext({ sampleRate: 16000 }); this.context = context; this.rate = context.sampleRate;
      await context.audioWorklet.addModule('/voice/capture-worklet.js');
      if (this.cancelled) return;
      this.node = new AudioWorkletNode(context, 'ourrecipes-voice-capture');
      this.node.port.onmessage = ({ data }: MessageEvent<Float32Array>) => {
        if (this.cancelled) return;
        this.chunks.push(data); this.count += data.length;
        if (this.count >= this.rate * 20) { this.node!.port.onmessage = null; onLimit(); }
      };
      const mute = context.createGain(); mute.gain.value = 0;
      context.createMediaStreamSource(stream).connect(this.node).connect(mute).connect(context.destination);
      await context.resume();
    } catch (error) { this.cancel(); throw error; }
  }
  cancel() {
    this.cancelled = true;
    if (this.node) { this.node.port.onmessage = null; this.node.disconnect(); }
    this.stream?.getTracks().forEach(t => t.stop());
    void this.context?.close().catch(() => {});
  }
  async finish() {
    this.cancel();
    const joined = new Float32Array(this.count);
    let offset = 0;
    for (const chunk of this.chunks) { joined.set(chunk, offset); offset += chunk.length; }
    this.chunks = [];
    if (!joined.length || this.rate === 16000) return joined;
    // Browser band-limited resampling, rather than alias-prone sample dropping.
    const resampler = new OfflineAudioContext(1, Math.ceil(joined.length * 16000 / this.rate), 16000);
    const buffer = resampler.createBuffer(1, joined.length, this.rate); buffer.copyToChannel(joined, 0);
    const source = resampler.createBufferSource(); source.buffer = buffer; source.connect(resampler.destination); source.start();
    return new Float32Array((await resampler.startRendering()).getChannelData(0));
  }
}

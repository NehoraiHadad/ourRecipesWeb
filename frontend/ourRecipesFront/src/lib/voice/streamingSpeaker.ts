// Schedules local PCM in the browser. No MediaRecorder, URL, or network backend.
export class StreamingSpeaker {
  private context?: AudioContext;
  private cursor = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private cancelled = false;
  private timer?: ReturnType<typeof setTimeout>;
  private finishWait?: () => void;
  async open() {
    const context = new AudioContext(); this.context = context;
    await context.resume();
    if (this.cancelled) await context.close().catch(() => {});
  }
  push(pcm: Float32Array, rate: number) {
    if (this.cancelled || !this.context) return;
    const context = this.context;
    const buffer = context.createBuffer(1, pcm.length, rate); buffer.copyToChannel(pcm, 0);
    const source = context.createBufferSource(); source.buffer = buffer; source.connect(context.destination);
    this.cursor = Math.max(this.cursor, context.currentTime + .3);
    source.start(this.cursor); this.cursor += buffer.duration;
    this.sources.add(source); source.onended = () => { this.sources.delete(source); source.disconnect(); };
  }
  finished(): Promise<void> {
    if (this.cancelled || !this.context) return Promise.resolve();
    return new Promise(resolve => {
      this.finishWait = resolve;
      this.timer = setTimeout(resolve, Math.max(0, (this.cursor - this.context!.currentTime) * 1000 + 80));
    });
  }
  stop() {
    this.cancelled = true; clearTimeout(this.timer); this.finishWait?.(); this.finishWait = undefined;
    for (const source of Array.from(this.sources)) { try { source.stop(); } catch {} source.disconnect(); }
    this.sources.clear(); void this.context?.close().catch(() => {});
  }
}

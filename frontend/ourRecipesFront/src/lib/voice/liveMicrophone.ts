import { asrBase, RecipeTranscriber, type Transcript } from './localAsr';

/** One foreground conversation. Audio and interim text stay on this device. */
export class LiveMicrophone {
  private audio = new AudioContext();
  private processor?: AudioWorkletNode;
  private stream?: MediaStream;
  private decoder?: RecipeTranscriber;
  private epoch = 1;
  private muted = false;
  private closed = false;
  private fresh = true;
  private busy = false;
  private queue: Float32Array<ArrayBuffer>[] = [];

  constructor(private partial: (text: string) => void, private final: (turn: Transcript) => void,
    private failed: (message: string) => void) {}

  unlock() { return this.audio.resume(); }

  async start(ingredients: string[], steps: string[]) {
    this.decoder = new RecipeTranscriber();
    await Promise.all([this.decoder.load(ingredients, steps),
      this.audio.audioWorklet.addModule(asrBase + 'capture-worklet.js')]);
    if (this.closed) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {channelCount:1, echoCancellation:true, noiseSuppression:true}
    });
    if (this.closed) { stream.getTracks().forEach(track => track.stop()); return; }
    this.stream = stream;
    const processor = new AudioWorkletNode(this.audio, 'recipe-capture', {channelCount:1, channelCountMode:'explicit'});
    this.processor = processor;
    processor.onprocessorerror = () => this.failed('עיבוד המיקרופון הופסק. אפשר להפעיל שוב את הליווי.');
    processor.port.onmessage = ({data}) => {
      if (this.closed || this.muted || data.epoch !== this.epoch) return;
      if (this.queue.length >= 50) {
        this.failed('המכשיר מתקשה בתמלול רציף. אפשר להקליט משפט בודד או להקליד.');
        return;
      }
      this.queue.push(data.pcm);
      void this.pump();
    };
    stream.getAudioTracks().forEach(track => {
      track.enabled = !this.muted;
      track.onended = () => this.failed('המיקרופון נותק. אפשר להפעיל שוב את הליווי.');
    });
    this.audio.createMediaStreamSource(stream).connect(processor);
    processor.connect(this.audio.destination);
    processor.port.postMessage(this.muted ? 0 : this.epoch);
  }

  private async pump() {
    if (this.busy || !this.decoder) return;
    this.busy = true;
    try {
      while (!this.closed && this.queue.length) {
        const epoch = this.epoch;
        const frame = this.queue.shift()!;
        const reset = this.fresh;
        this.fresh = false;
        const result = await this.decoder.feed(frame, reset);
        if (this.closed || this.epoch !== epoch) continue;
        if (result.final) { this.partial(''); this.final(result.final); }
        else this.partial(result.partial ?? '');
      }
    } catch {
      if (!this.closed) this.failed('התמלול הרציף הופסק. אפשר לנסות שוב או להקליד.');
    } finally { this.busy = false; }
  }

  mute(value: boolean) {
    if (this.closed || this.muted === value) return;
    this.muted = value;
    this.epoch++;
    this.queue = [];
    this.fresh = true;
    this.partial('');
    this.stream?.getAudioTracks().forEach(track => { track.enabled = !value; });
    this.processor?.port.postMessage(value ? 0 : this.epoch);
  }

  close() {
    this.closed = true;
    this.queue = [];
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    this.processor?.port.close();
    this.processor?.disconnect();
    this.decoder?.close();
    void this.audio.close().catch(() => {});
  }
}

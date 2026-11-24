// Convert native-rate mono microphone samples to 100 ms frames at 16 kHz.
// The output connected to the audio destination remains silent.
class RecipeCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.epoch = 0;
    this.port.onmessage = ({data}) => {
      this.epoch = data;
      this.frame = new Float32Array(1600);
      this.index = this.phase = this.sum = 0;
    };
  }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (this.epoch && channel) {
      for (const sample of channel) {
        // One input sample spans 16,000 ticks and one output sample spans
        // sampleRate ticks. Carry fractional boundaries between render quanta.
        let remaining = 16000;
        while (remaining > 0) {
          const weight = Math.min(sampleRate - this.phase, remaining);
          this.sum += sample * weight;
          this.phase += weight;
          remaining -= weight;
          if (this.phase === sampleRate) {
            this.frame[this.index++] = this.sum / sampleRate;
            this.phase = this.sum = 0;
            if (this.index === this.frame.length) {
              this.port.postMessage({epoch:this.epoch, pcm:this.frame}, [this.frame.buffer]);
              this.frame = new Float32Array(1600);
              this.index = 0;
            }
          }
        }
      }
    }
    return true;
  }
}
registerProcessor('recipe-capture', RecipeCapture);

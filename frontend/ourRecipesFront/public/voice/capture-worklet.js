class VoiceCapture extends AudioWorkletProcessor {
  process(inputs) {
    const pcm = inputs[0]?.[0];
    if (pcm) { const copy = new Float32Array(pcm); this.port.postMessage(copy, [copy.buffer]); }
    return true;
  }
}
registerProcessor('ourrecipes-voice-capture', VoiceCapture);

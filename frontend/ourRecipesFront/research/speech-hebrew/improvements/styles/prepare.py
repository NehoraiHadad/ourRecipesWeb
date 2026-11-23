"""Build deterministic stress conditions and one causal prefilter for all styles."""
import hashlib
import json
import os
from pathlib import Path
import subprocess

import numpy as np
from scipy.signal import butter, sosfilt

ROOT = Path(__file__).resolve().parent
CACHE = Path(os.environ.get('STYLE_CACHE', '/dev/shm/kitchen-styles'))
RATE = 16000
VOICES = ('omer', 'liat', 'noa')
# asetrate shifts pitch and tempo together. atempo then adjusts the net speed.
STYLES = {
    'plain': '',
    'rushed-high': 'asetrate=17920,aresample=16000,atempo=1.18',
    'drawn-low': 'asetrate=14240,aresample=16000,atempo=0.90',
    'phone': 'highpass=f=350,lowpass=f=3100,acompressor=threshold=0.1:ratio=4',
    'fan-room': '',
}
FILTER = butter(2, 140, btype='highpass', fs=RATE, output='sos')


def stylize(file, style, seed):
    chain = 'aresample=16000'
    if STYLES[style]:
        chain += ',' + STYLES[style]
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', file, '-af', chain,
                                   '-ac', '1', '-ar', str(RATE), '-f', 'f32le', '-'])
    speech = np.frombuffer(raw, dtype='<f4').astype('float64')
    if style == 'fan-room':
        # Synthetic reflections (31ms and 71ms) plus a low motor hum and air noise, 3dB SNR.
        reflected = np.pad(speech,(0,1136))
        for delay, gain in [(496, 0.24), (1136, 0.12)]:
            reflected[delay:delay+len(speech)] += gain * speech
        time = np.arange(len(reflected)) / RATE
        noise = (np.sin(2*np.pi*64*time) + .36*np.sin(2*np.pi*128*time)
                 + .12*np.random.default_rng(seed).normal(size=len(time)))
        rms = lambda x: np.sqrt(np.mean(x*x))
        speech = reflected + noise * rms(reflected) / (rms(noise) * 10**(3/20))
        speech /= max(1.0, np.max(np.abs(speech)) / .98)
    return speech


def main():
    prompts = json.loads((ROOT/'cases.json').read_text())
    output = []
    for vi, voice in enumerate(VOICES):
        for pi, prompt in enumerate(prompts):
            wave = CACHE / f"{voice}-{prompt['id']}.wav"
            source_hash = hashlib.sha256(wave.read_bytes()).hexdigest()
            for style in STYLES:
                raw = stylize(wave, style, vi*100+pi)
                for arm, signal in [('raw',raw),('highpass140',sosfilt(FILTER,raw))]:
                    key = f"{voice}-{prompt['id']}-{style}-{arm}"
                    data = signal.astype('<f4').tobytes()
                    (CACHE / (key+'.pcm')).write_bytes(data)
                    output.append(dict(filename=key, reference=prompt['text'], prompt=prompt['id'],
                                       voice=voice, style=style, filter=arm, anchors=prompt['anchors'],
                                       source_sha256=source_hash, pcm_sha256=hashlib.sha256(data).hexdigest()))
    (CACHE/'manifest.json').write_text(json.dumps({'records':output},ensure_ascii=False))


if __name__ == '__main__':
    main()

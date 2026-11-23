"""Two deliberately stylized diagnostics. Never used to choose the primary filter."""
import hashlib
import json
import numpy as np
from prepare import CACHE, ROOT, RATE, VOICES, stylize


def dramatize(signal):
    # Insert one half-second pause at the quietest central 20ms frame.
    # This acoustic approximation can cut through a word.
    frame = RATE // 50
    windows = signal[:len(signal)//frame*frame].reshape(-1,frame)
    energy = np.sqrt(np.mean(windows**2,axis=1))
    a, b = len(energy)//3, len(energy)*2//3
    cut = (a+np.argmin(energy[a:b]))*frame
    return np.concatenate([signal[:cut],np.zeros(RATE//2),signal[cut:]])


def main():
    prompts=json.loads((ROOT/'cases.json').read_text())
    records=[]
    for voice in VOICES:
        for prompt in prompts:
            wave=CACHE/f"{voice}-{prompt['id']}.wav"
            signal=stylize(wave,'plain',0)
            time=np.arange(len(signal))/RATE
            # Parallel dry/ring-modulated signal with a small synthetic flanger.
            delayed=np.maximum(0,np.arange(len(signal))-(48+24*np.sin(2*np.pi*.7*time)).astype(int))
            robot=.61*signal+.26*signal*np.sin(2*np.pi*37*time)+.13*signal[delayed]
            for style,pcm in [('metallic-robot',robot),('theatrical-pause',dramatize(signal))]:
                key=f"{voice}-{prompt['id']}-{style}"
                raw=pcm.astype('<f4').tobytes()
                (CACHE/(key+'.pcm')).write_bytes(raw)
                records.append(dict(filename=key,voice=voice,style=style,prompt=prompt['id'],
                                    reference=prompt['text'],anchors=prompt['anchors'],
                                    pcm_sha256=hashlib.sha256(raw).hexdigest()))
    (ROOT/'extras-manifest.json').write_text(json.dumps({'records':records},ensure_ascii=False))


if __name__=='__main__':
    main()

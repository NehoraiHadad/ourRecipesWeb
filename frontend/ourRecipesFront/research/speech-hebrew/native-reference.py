"""Independent native reference on the exact public human clips, no model download."""
import hashlib
import json
from pathlib import Path
import platform
import time
import numpy as np
import soundfile as sf
import sherpa_onnx

ROOT=Path(__file__).resolve().parent


def main():
    metadata=json.loads((ROOT/'evidence/human-fixtures.json').read_text())
    base=Path('/tmp/voice-models/asr/sherpa-onnx')
    started=time.monotonic()
    recognizer=sherpa_onnx.OnlineRecognizer.from_transducer(tokens=str(base/'tokens.txt'),
        encoder=str(base/'encoder.int8.onnx'),decoder=str(base/'decoder.int8.onnx'),joiner=str(base/'joiner.int8.onnx'),
        model_type='zipformer2',num_threads=1,decoding_method='greedy_search')
    loaded=time.monotonic()-started;records=[]
    for row in metadata['records']:
        path=Path('/dev/shm/ourrecipes-speech-models/human')/row['filename']
        assert hashlib.sha256(path.read_bytes()).hexdigest()==row['sha256']
        audio,rate=sf.read(path,dtype='float32');assert rate==16000 and audio.ndim==1
        began=time.monotonic();stream=recognizer.create_stream()
        stream.accept_waveform(rate,audio);stream.accept_waveform(rate,np.zeros(24000,dtype=np.float32));stream.input_finished()
        while recognizer.is_ready(stream):recognizer.decode_stream(stream)
        text=recognizer.get_result(stream)
        records.append({'id':row['id']+'-clean','reference':row['text'],'text':text,'seconds':time.monotonic()-began,
            'inputPcmSha256':hashlib.sha256(audio.tobytes()).hexdigest(),'audioSeconds':len(audio)/rate})
        print(row['id'],text,flush=True)
    result={'scope':'Actual native CPU reference, one thread, greedy decoding, same pinned int8 model and12 public human clips. Not a browser/phone or new independent corpus.','sherpa_version':sherpa_onnx.__version__,
        'python':platform.python_version(),'loadSeconds':loaded,'records':records}
    with (ROOT/'evidence/native-reference.json').open('x') as stream:stream.write(json.dumps(result,ensure_ascii=False,indent=2)+'\n')


if __name__=='__main__':main()

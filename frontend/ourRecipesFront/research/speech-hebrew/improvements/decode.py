"""Two predefined native decoding methods; inputs already verified against browser."""
import argparse
import hashlib
import json
from pathlib import Path
import resource
import time
import numpy as np
import sherpa_onnx

ROOT=Path(__file__).resolve().parent


def main(args):
    manifest=json.loads((Path(args.inputs)/'manifest.json').read_text())
    assert manifest['allInputHashesMatch'] and len(manifest['records'])==170
    methods={'greedy':'greedy_search','beam4':'modified_beam_search'}
    base=Path('/tmp/voice-models/asr/sherpa-onnx')
    settings={'model_type':'zipformer2','num_threads':1,'decoding_method':methods[args.arm],
        'max_active_paths':4,'temperature_scale':2.0,'blank_penalty':0.0,'hotwords_file':'','sample_rate':16000}
    began=time.monotonic()
    recognizer=sherpa_onnx.OnlineRecognizer.from_transducer(tokens=str(base/'tokens.txt'),encoder=str(base/'encoder.int8.onnx'),
        decoder=str(base/'decoder.int8.onnx'),joiner=str(base/'joiner.int8.onnx'),**settings)
    report={'arm':args.arm,'sherpa_version':sherpa_onnx.__version__,'settings':settings,'loadSeconds':time.monotonic()-began,'records':[],'completed':False}
    dest=ROOT/'evidence'/f'{args.arm}.json'
    if dest.exists():raise ValueError('Preserve existing arm')
    for row in manifest['records']:
        raw=(Path(args.inputs)/row['file']).read_bytes()
        assert len(raw)==row['bytes'] and hashlib.sha256(raw).hexdigest()==row['sha256']
        samples=np.frombuffer(raw,dtype='<f4')
        started=time.monotonic();stream=recognizer.create_stream()
        stream.accept_waveform(16000,samples);stream.accept_waveform(16000,np.zeros(24000,dtype=np.float32));stream.input_finished()
        while recognizer.is_ready(stream):recognizer.decode_stream(stream)
        text=recognizer.get_result(stream)
        report['records'].append({'id':row['id'],'text':text,'ms':(time.monotonic()-started)*1000,'inputSha256':row['sha256']})
        if len(report['records'])%10==0:print(args.arm,len(report['records']),text,flush=True)
        dest.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    report.update(completed=True,peakNativeProcessRssKiB=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        scope='Actual native CPU, one thread. PeakRSS is whole fresh Python process. Not browser/phone. Same170 exposed audio inputs, no new model/training/lexical bias.')
    dest.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--arm',required=True,choices=['greedy','beam4']);p.add_argument('--inputs',default='/dev/shm/ourrecipes-speech-decoder-input');main(p.parse_args())

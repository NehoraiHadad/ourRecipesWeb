"""Explicit public-model download. Streaming, pinned revisions; no audio/text upload."""
import argparse
import hashlib
import json
from pathlib import Path
import time
import urllib.request

ROOT=Path(__file__).resolve().parent
FILES={
    'ivrit-ai/zipformer2-66m-streaming-he':('asr',['onnx/config.json','sherpa-onnx/tokens.txt','sherpa-onnx/encoder.int8.onnx','sherpa-onnx/decoder.int8.onnx','sherpa-onnx/joiner.int8.onnx']),
    'thewh1teagle/pocket-tts-onnx':('tts',['he/model.onnx','he/assets.json','he/manifest.json','he/renikud.onnx']),
    'thewh1teagle/piper-he-noa':('piper',['he_IL-noa-medium.onnx','he_IL-noa-medium.onnx.json']),
}


def sha(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()


def main(args):
    sources=json.loads((ROOT/'evidence/model-sources.json').read_text());report=[]
    for repo,(kind,names) in FILES.items():
        source=next(s for s in sources if s['repo']==repo)
        for name in names:
            expected=next(f for f in source['files'] if f['rfilename']==name)
            folder=Path(args.extra_dir) if kind=='piper' else Path(args.model_dir)/kind
            dest=folder/name;dest.parent.mkdir(parents=True,exist_ok=True)
            expected_hash=expected.get('lfs',{}).get('sha256')
            if dest.exists():
                assert dest.stat().st_size==expected['size'] and (not expected_hash or sha(dest)==expected_hash),f'Existing cache differs: {dest}; choose a new cache directory rather than overwriting it'
                report.append({'file':str(dest),'bytes':dest.stat().st_size,'sha256':sha(dest),'cache_hit':True});continue
            partial=dest.with_suffix(dest.suffix+'.partial');started=time.monotonic()
            try:
                with partial.open('xb') as stream,urllib.request.urlopen(f'https://huggingface.co/{repo}/resolve/{source["revision"]}/{name}',timeout=90) as response:
                    count=0
                    while chunk:=response.read(1024*1024):
                        count+=len(chunk)
                        if count>expected['size']:raise ValueError('Model larger than pinned metadata')
                        stream.write(chunk)
                        print(json.dumps({'file':name,'downloaded':count,'total':expected['size']}),flush=True)
                assert partial.stat().st_size==expected['size'] and (not expected_hash or sha(partial)==expected_hash)
                partial.replace(dest)
            except BaseException:
                partial.unlink(missing_ok=True);raise
            report.append({'file':str(dest),'bytes':dest.stat().st_size,'sha256':sha(dest),'cache_hit':False,'seconds':time.monotonic()-started})
    output=Path(args.extra_dir)/'downloads.json';output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'files_verified':len(report),'bytes':sum(r['bytes'] for r in report),'download_log':str(output)},indent=2))


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--model-dir',default='/tmp/voice-models');p.add_argument('--extra-dir',default='/dev/shm/ourrecipes-speech-models');main(p.parse_args())

"""Public metadata/config audit only. Never download weights or execute model code."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timezone
from pathlib import Path
import hashlib,json,urllib.request,urllib.error
from corpus import ROOT

MODELS=['dicta-il/dictabert','dicta-il/neodictabert','dicta-il/neodictabert-bilingual','dicta-il/DictaLM-3.0-1.7B-Instruct','MoritzLaurer/mDeBERTa-v3-base-mnli-xnli','HeNLP/HeRo','google/functiongemma-270m-it','Qwen/Qwen3-0.6B']


def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'ourRecipes-research/1.0'}),timeout=40) as r:return r.read()


def inspect(repo):
    record={'repo':repo,'url':'https://huggingface.co/'+repo,'weights_downloaded':False,'inference_run':False}
    folder=ROOT/'runs/research-model-audit-20261112'/repo.replace('/','--');folder.mkdir(parents=True,exist_ok=True)
    try:
        raw=fetch('https://huggingface.co/api/models/'+repo+'?blobs=true');api=json.loads(raw);(folder/'api.json').write_bytes(raw)
        record.update(revision=api['sha'],last_modified=api.get('lastModified'),gated=api.get('gated'),license=(api.get('cardData') or {}).get('license'),safetensors=api.get('safetensors'))
        files=api.get('siblings',[])
        record['selected_weight_files']=[{'name':f['rfilename'],'bytes':f.get('size'),'lfs_sha256':(f.get('lfs') or {}).get('sha256')} for f in files if f['rfilename'].endswith('.safetensors') and '/' not in f['rfilename']]
        if not record['selected_weight_files']:
            record['selected_weight_files']=[{'name':f['rfilename'],'bytes':f.get('size'),'lfs_sha256':(f.get('lfs') or {}).get('sha256')} for f in files if f['rfilename']=='pytorch_model.bin']
        record['selected_weight_bytes']=sum(f['bytes'] for f in record['selected_weight_files'] if isinstance(f['bytes'],int)) or None
        record['metadata_files']={}
        for name in ('config.json','README.md'):
            url=f"https://huggingface.co/{repo}/resolve/{api['sha']}/{name}"
            try:
                content=fetch(url);(folder/name).write_bytes(content);record['metadata_files'][name]={'url':url,'sha256':hashlib.sha256(content).hexdigest(),'bytes':len(content)}
                if name=='config.json':record['config']=json.loads(content)
            except urllib.error.HTTPError as e:record['metadata_files'][name]={'url':url,'http_status':e.code}
    except Exception as e:record['error']=type(e).__name__+': '+str(e)
    return record


if __name__=='__main__':
    with ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(inspect,MODELS))
    output={'observed_utc':datetime.now(timezone.utc).isoformat(),'scope':'Public API/config/card only, no weights, custom-code execution, inference, GPU allocation or app changes','models':results}
    (ROOT/'verification/research-model-audit-20261112.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
    for r in results:print(json.dumps({k:r.get(k) for k in ('repo','revision','license','gated','safetensors','selected_weight_bytes','error')}))

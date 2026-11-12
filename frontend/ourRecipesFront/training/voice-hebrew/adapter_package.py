"""Flat research results: frozen core, current report, small best/last checkpoints."""
import argparse,json,zipfile,hashlib
from pathlib import Path
from corpus import ROOT,digest


def pack(root,output):
 root=Path(root);output=Path(output);study=root/'recovered/study';result=json.loads((study/'result.json').read_text());plan=json.loads((ROOT/'verification/adapter-v6-plan-20261112.json').read_text())
 files=['adapter_evaluate.py','adapter_summary.py','adapter_corrections.py','adapter_package.py','ADAPTER_RESULTS.he.md',
  'verification/adapter-v6-results-20261112.json','verification/adapter-v6-native-20261112.json','verification/adapter-v6-corrections-20261112.json']
 extra={name:(ROOT/name).read_bytes() for name in files}
 for name in ('README.he.md','RESEARCH_MODEL_ATTRIBUTION.txt','TRAINING_RESULTS.he.md','VERIFICATION.md'):extra[name]=(ROOT/name).read_bytes()
 for trial in result['trials']:
  assert trial['arm'] in ('control','adapter') and trial['seed'] in (42,17,73)
  name=f"{trial['arm']}-{trial['seed']}";folder=study/name
  for item in ('best.pt','last.pt','result.json','curve.jsonl','best-validation.json'):extra['adapter-v6-artifact/'+name+'/'+item]=(folder/item).read_bytes()
 for name in ('plan.json','result.json'):extra['adapter-v6-artifact/'+name]=(study/name).read_bytes()
 for name in ('curves.csv','learning-curves.png','learning-curves.svg'):extra['dist/adapter-v6-learning-curves-20261112/'+name]=(ROOT/'dist/adapter-v6-learning-curves-20261112'/name).read_bytes()
 artifact={'status':'Research only; adapter42 failed recall gate, no expansion or fresh test','body_sha256':plan['body_sha256'],'body_bytes':735066976,'full_body_included':False,
  'setup':'Exact adapted body required at warm-start/model.safetensors; public base alone is not identical. See ADAPTER_RESULTS.he.md.',
  'architecture':'rank8 query/value last2 BERT layers, positional3072 features, five-class400133-parameter head; disable adapters for legacy extractor',
  'trials':[{'arm':r['arm'],'seed':r['seed'],'best_step':r['best']['step'],'last_step':r['actual_steps'],'threshold':r['best']['threshold'],
    'best_sha256':digest((study/f"{r['arm']}-{r['seed']}"/'best.pt').read_bytes()),'last_sha256':digest((study/f"{r['arm']}-{r['seed']}"/'last.pt').read_bytes())} for r in result['trials']],
  'best_contains_optimizer':False,'last_contains_optimizer_and_rng':True,'exact_gpu_resume_tested':False,
  'source_upload_sha256':digest((root/'material.zip').read_bytes()),'new_test_inferred':False,'physical_device_tested':False,'license':'CC-BY-4.0 DictaBERT attribution retained'}
 extra['adapter-v6-artifact/artifact.json']=(json.dumps(artifact,indent=2)+'\n').encode()
 with zipfile.ZipFile(root/'material.zip') as source,zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
  for name in source.namelist():
   if name.endswith('packet-sha256.json') or name in extra:continue
   z.writestr(name,source.read(name))
  for name,data in extra.items():z.writestr(name,data)
  for name,sha in plan['source_sha256'].items():assert digest(z.read(name))==sha
  hashes={name:digest(z.read(name)) for name in z.namelist()};z.writestr('packet-sha256.json',json.dumps(hashes,indent=2)+'\n');assert z.testzip() is None
 with output.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
 proof={'path':str(output.resolve()),'bytes':output.stat().st_size,'sha256':sha,'members':len(hashes)+1,'crc_verified':True,'frozen_training_sources_match':True,
  'full_body_included':False,'small_best_and_last_checkpoints_included':True,'fresh480_inferred':False,'privacy':'Only allowlisted synthetic source/data/checkpoints/aggregate proofs; no account, key, usage-private, audio or app files.'}
 (ROOT/'verification/adapter-v6-package-20261112.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof));return proof


if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('root');p.add_argument('output');a=p.parse_args();pack(a.root,a.output)

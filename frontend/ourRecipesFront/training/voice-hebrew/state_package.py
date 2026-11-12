"""Explicit V12 source/seed packet; model weight bytes are streamed separately."""
import argparse
from pathlib import Path
import zipfile
from corpus import ROOT
from prepare import bundle
EXTRAS=['state_data.py','state_sweep.py','state_input_probe.py','state_package.py','state_summary.py','STATE_PLAN.he.md','STATE_RESULTS.he.md','RESEARCH_MODEL_ATTRIBUTION.txt','tests/test_state_study.py','tests/test_state_input.py',
 'verification/state-v12-plan-20261112.json','verification/state-v12-data-freeze-20261112.json','verification/state-v12-mechanics-20261112.json','verification/state-v12-results-20261112.json']
def pack(output,warm):
 bundle(output)
 with zipfile.ZipFile(output,'a',zipfile.ZIP_DEFLATED) as z:
  existing=set(z.namelist())
  for name in EXTRAS:
   p=ROOT/name
   if p.exists() and name not in existing:z.write(p,name)
  for p in Path(warm).iterdir():
   if p.name in ('config.json','tokenizer.json','tokenizer_config.json','special_tokens_map.json','vocab.txt','ATTRIBUTION.txt'):z.write(p,'warm-start/'+p.name)
  if z.testzip() is not None:raise ValueError('Packet CRC failure')
 print('State packet bytes:',Path(output).stat().st_size)
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('output');p.add_argument('warm');a=p.parse_args();pack(a.output,a.warm)

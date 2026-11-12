"""Explicit V13 pilot material; no weight bytes or private files in the ZIP."""
import argparse
from pathlib import Path
import zipfile
from corpus import ROOT
from state_package import pack as base_pack
EXTRAS=['state_sampling.py','state_metrics.py','state_pilot.py','state_pilot_data.py','state_pilot_package.py','state_invariance.py','state_cpu_probe.py','STATE_PILOT_PLAN.he.md','STATE_PILOT_RESULTS.he.md','tests/test_state_sampling.py',
 'verification/state-v13-plan-20261112.json','verification/state-v13-data-freeze-20261112.json','verification/state-v13-mechanics-20261112.json','verification/state-v12-invariance-fixtures-20261112.json','verification/state-v12-invariance-plan-20261112.json','verification/state-v13-results-20261112.json']
def pack(output,warm):
 base_pack(output,warm)
 with zipfile.ZipFile(output,'a',zipfile.ZIP_DEFLATED) as z:
  names=set(z.namelist())
  for name in EXTRAS:
   p=ROOT/name
   if p.exists() and name not in names:z.write(p,name)
  assert z.testzip() is None
 print('Pilot packet bytes:',Path(output).stat().st_size)
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('output');p.add_argument('warm');a=p.parse_args();pack(a.output,a.warm)

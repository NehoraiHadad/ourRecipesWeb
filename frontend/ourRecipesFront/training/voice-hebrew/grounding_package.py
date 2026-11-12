"""Package V11 results and the separately audited state-input proposal.

Preserves frozen prepare.py and its original seed data layout. No weights,
private usage logs, credentials, app data or model inference are included.
"""
import argparse
from pathlib import Path
import zipfile
from corpus import ROOT
from prepare import bundle

EXTRAS=['grounding_package.py','grounding_summary.py','grounding_runtime.py','state_input_probe.py',
    'RANKING_RECOVERY.he.md','STATE_INPUT_PROPOSAL.he.md','RESEARCH_MODEL_ATTRIBUTION.txt',
    'tests/test_state_input.py','verification/grounding-packet-20261112.json','verification/state-input-proposal-20261112.json']


def pack(output):
    bundle(output)
    with zipfile.ZipFile(output,'a',zipfile.ZIP_DEFLATED) as z:
        existing=set(z.namelist())
        for name in EXTRAS:
            p=ROOT/name
            if p.exists() and name not in existing:z.write(p,name)
        if z.testzip() is not None:raise ValueError('Package CRC failure')
    print(f'V11 package: {Path(output).stat().st_size} bytes; frozen training sources preserved')


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('output');a=p.parse_args();pack(a.output)

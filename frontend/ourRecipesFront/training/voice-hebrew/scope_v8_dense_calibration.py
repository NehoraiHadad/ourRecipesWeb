"""Refine empirical calibration grid only; no weights, old transfer or tests.
Coarse typed grid missed recall floor by one two-state correction text.
This remains adaptive development, not an independent calibration guarantee.
"""
import json
from corpus import ROOT,digest
from scope_v8_data import DATA
import scope_v8_typed_calibration as typed


def run():
 typed.GRID=(None,)+tuple(i/100 for i in range(50,100))
 rows=json.loads(DATA.read_text())['splits']['calibration'];folder=ROOT/'runs/colab-scope-v8-factor/recovered/study/adapted-factor-wide-42';trial=json.loads((folder/'result.json').read_text());result=typed.calibrate(rows,trial['calibration']['predictions'])
 proof={'scope':'Adaptive empirical class-threshold refinement: .50 through.99 step.01 plusoff. Same already-used calibration, frozen weights, no old transfer inference or test. Requires prospective seeds/native/guard/transfer and independent test before any promotion.',
 'checkpoint_sha256':digest((folder/'best.pt').read_bytes()),'calibration':result,'new_test_inference':False,'source_sha256':digest((ROOT/'scope_v8_dense_calibration.py').read_bytes())}
 (ROOT/'verification/scope-v8-dense-calibration-feasibility-20261112.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'passed':result['passed'],'thresholds':result['thresholds'],'metrics':{k:v for k,v in result['metrics'].items() if k!='failures'}}));return proof

if __name__=='__main__':run()

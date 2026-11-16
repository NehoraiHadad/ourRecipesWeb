"""One fresh tiny adapter; abort before training if cached baseline does not match."""
import hashlib
import json
from pathlib import Path
import sys
import adapter_scope_sft_v11 as engine
from sparse_recipe_data_v4 import messages
from sparse_recipe_study_v4 import metrics_for
from adapter_scope_policy_v11 import decisions

ROOT=Path(__file__).resolve().parent
PLAN=ROOT/'verification/adapter-scope-plan-v11-20261116.json'
BASE_EVALUATE=engine.evaluate


def run(output):
    plan=json.loads(PLAN.read_text())
    for name,sha in {**plan['source_sha256'],**plan['artifact_sha256']}.items():
        assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==sha,name
    data=json.loads((ROOT/plan['master_data_file']).read_text())['splits']
    arm=json.loads((ROOT/plan['arm_data_file']).read_text())['splits']
    reference=json.loads((ROOT/plan['reference_file']).read_text())
    output=Path(output);output.mkdir(exist_ok=False)
    engine.PLAN=ROOT/plan['arm_plan_file'];engine.messages=messages

    def evaluate(model,tokenizer,rows,folder,step,settings):
        primary=BASE_EVALUATE(model,tokenizer,rows,folder,step,settings)
        BASE_EVALUATE(model,tokenizer,arm['diagnostic'],folder,f'diagnostic-{step}',settings)
        BASE_EVALUATE(model,tokenizer,arm['regression'],folder,f'regression-{step}',settings)
        if step==0:
            for suffix in ['','diagnostic-','regression-']:
                records=json.loads((folder/f'validation-step-{suffix}0.json').read_text())['records']
                old=reference['baseline'][suffix or 'primary']
                assert [(r['id'],r['text'],r['tokens']) for r in records]==[(r['id'],r['text'],r['tokens']) for r in old], 'Initial baseline mismatch; do not train'
        if step==160:BASE_EVALUATE(model,tokenizer,arm['train_fit'],folder,'train-fit-160',settings)
        engine.dump(output/'progress.json',{'phase':'evaluation_complete','step':step,'primary':primary['metrics']})
        return primary

    engine.evaluate=evaluate;engine.dump(output/'progress.json',{'phase':'model_running'})
    engine.run(output/'model')
    summaries=[metrics_for(output/'model',step,data) for step in [0,80,160]]
    curve=[json.loads(line) for line in (output/'model/training.jsonl').read_text().splitlines()]
    positions={r['id']:i for i,r in enumerate(arm['train'])}
    indices=[positions[id] for row in curve for id in row['example_ids']]
    assert indices==reference['training_indices'],'Training exposure differs from cached control'
    outcome=decisions(reference['endpoint'], reference['native_endpoint'], summaries[-1])
    fit=json.loads((output/'model/validation-step-train-fit-160.json').read_text())['metrics']
    engine.dump(output/'result.json',{'study':plan['study'],'summaries':summaries,'train_fit':fit,
        'decision':outcome,'initial_baseline_exactly_matched':True,'training_index_order_exactly_matched':True,
        'training_performed':True,'scope':plan['scope']})
    engine.dump(output/'progress.json',{'phase':'complete','decision':outcome})


if __name__=='__main__':run(sys.argv[1])

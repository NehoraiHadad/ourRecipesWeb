"""One trained Hebrew reference at fixed endpoint, compared to cached tiny replay."""
import json
from pathlib import Path
import hashlib
import sys
import recipe_teacher_sft_v9 as engine
from sparse_recipe_study_v4 import metrics_for,decision

ROOT=Path(__file__).resolve().parent
PLAN=ROOT/'verification/sparse-recipe-plan-v9-20261116.json'
BASE_EVALUATE=engine.evaluate


def qualify(endpoint,reference):
    standard=decision(reference,endpoint)
    p,r=endpoint['primary'],endpoint['regression']
    utility=(p['exact']>=32 and p['required_changes_correct']>=19 and p['critical_wrong_fact_cases']==0
        and r['exact']>=90 and r['critical_wrong_fact_cases']<=5)
    return {'fixed_endpoint':160,'standard_quality_gate':standard,'teacher_utility_gate_passed':utility,
        'offline_teacher_candidate':standard['data_intervention_gate_passed'] and utility,'product_promotion':False}


def run(output):
    plan=json.loads(PLAN.read_text())
    for name,expected in {**plan['source_sha256'],**plan['artifact_sha256']}.items():
        assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==expected,name
    data=json.loads((ROOT/plan['master_data_file']).read_text())['splits']
    arm=json.loads((ROOT/plan['arm_data_file']).read_text())['splits']
    output=Path(output);output.mkdir(exist_ok=False)
    engine.PLAN=ROOT/plan['arm_plan_file']

    def evaluate(model,tokenizer,rows,folder,step,settings):
        primary=BASE_EVALUATE(model,tokenizer,rows,folder,step,settings)
        BASE_EVALUATE(model,tokenizer,arm['diagnostic'],folder,f'diagnostic-{step}',settings)
        BASE_EVALUATE(model,tokenizer,arm['regression'],folder,f'regression-{step}',settings)
        if step==160:BASE_EVALUATE(model,tokenizer,arm['train_fit'],folder,'train-fit-160',settings)
        engine.dump(output/'progress.json',{'phase':'evaluation_complete','step':step,'primary':primary['metrics']})
        return primary

    engine.evaluate=evaluate
    engine.dump(output/'progress.json',{'phase':'model_running'})
    engine.run(output/'model')
    summaries=[metrics_for(output/'model',step,data) for step in [0,80,160]]
    fit=json.loads((output/'model/validation-step-train-fit-160.json').read_text())['metrics']
    reference=json.loads((ROOT/plan['reference_file']).read_text())
    outcome=qualify(summaries[-1],reference['endpoint'])
    result={'study':plan['study'],'summaries':summaries,'train_fit':fit,'cached_tiny_reference':reference['endpoint'],
        'decision':outcome,'training_performed':True,'scope':plan['scope']}
    engine.dump(output/'result.json',result);engine.dump(output/'progress.json',{'phase':'complete','decision':outcome})


if __name__=='__main__':run(sys.argv[1])

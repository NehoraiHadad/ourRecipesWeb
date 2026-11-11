"""Bounded, predeclared input/sampling/data comparison; no cloud allocation here."""
import argparse
from copy import deepcopy
import json
from pathlib import Path
import shutil
import time
from corpus import ROOT, digest, load_data, queries, validate
from engine import expand, infer, score
from train import parser, train


def augmented_data(output, source=ROOT / 'data'):
    """Train-only position coverage. Validation/test bytes remain unchanged."""
    output, source = Path(output), Path(source)
    output.mkdir(parents=True, exist_ok=False)
    recs, original = load_data(source)
    rows = deepcopy(original)
    for recipe in recs.values():
        if recipe['split'] != 'train':continue
        serial = 0
        def add(text, effects=(), intent='report', completed=(), previous=None):
            nonlocal serial
            serial += 1
            rows.append({'id':f"{recipe['id']}-balanced-{serial}", 'recipe_id':recipe['id'], 'split':'train',
                'scenario':'position_balanced_' + intent, 'family':'train:position-balanced-v2',
                'utterance':text, 'previous':previous, 'state':{'currentStep':0, 'completed':list(completed),
                    'remaining':[a['id'] for a in recipe['actions'] if a['id'] not in completed]},
                'gold':{'intent':intent,'changes':[{'actionId':a['id'],'done':done,'evidence':e} for a,done,e in effects]},
                'provenance':'synthetic_authored', 'human_review':'pending'})
        for action in recipe['actions']:
            past = action['report']; negative = 'עוד לא ' + past
            add('לעדכון ההתקדמות: ' + past, [(action,True,past)])
            add('לגבי ההכנה, ' + negative, [(action,False,negative)])
            add('תיקון לדיווח: ' + negative, [(action,False,negative)], completed=[action['id']],
                previous={'recipe_id':recipe['id'],'utterance':past})
            add(past + ', ועכשיו מה עושים?', [(action,True,past)])
            add(past + '. בעצם טעיתי, ' + negative, [(action,False,negative)])
            add(past + ', אבל השלמתי רק חלק מהפעולה', intent='clarify')
            add('אני לא טוען ש' + past, intent='clarify')
            add('נדמה לי ש' + past + ', אך איני בטוח', intent='clarify')
            add('בכוונתי ' + action['text'] + ' בהמשך', intent='clarify')
            add('אם במקרה ' + past + ', איך ממשיכים?', intent='clarify')
            if past.startswith('הוספתי '):
                alternative = 'שמתי ' + past[len('הוספתי '):]
                add(alternative, [(action,True,alternative)])
                add('לא ' + alternative, [(action,False,'לא ' + alternative)])
        for first in recipe['actions']:
            for second in recipe['actions']:
                if first['id'] == second['id']:continue
                for left, right in [(True,True),(True,False),(False,True),(False,False)]:
                    a = ('' if left else 'עוד לא ') + first['report']
                    b = ('' if right else 'עוד לא ') + second['report']
                    add(a + (' וגם ' if left == right else ' אבל ') + b,
                        [(first,left,a),(second,right,b)])
    counts = validate(list(recs.values()), rows)
    for name in ['recipes.json','validation.jsonl','test.jsonl']:
        shutil.copyfile(source/name,output/name)
    (output/'train.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows if r['split']=='train'))
    files = {p.name:digest(p.read_bytes()) for p in sorted(output.iterdir())}
    manifest = {'schema':1,'origin':'original synthetic training-only position augmentation', 'human_review':'pending',
        'counts':counts, 'files':files, 'corpus_sha256':digest(files), 'parent_corpus_sha256':json.loads((source/'manifest.json').read_text())['corpus_sha256'],
        'notes':'Validation and test bytes preserved. Controlled report templates overlap; not a natural-speech benchmark.'}
    (output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    return output


def run(output, steps=1000, max_seconds=600, source=ROOT/'data'):
    import torch
    from transformers import AutoModelForSequenceClassification,AutoTokenizer
    if not torch.cuda.is_available():raise RuntimeError('Ablation requires an explicitly allocated GPU')
    output = Path(output); output.mkdir(parents=True,exist_ok=True)
    augmented = augmented_data(output/'augmented-data',source)
    deadline=time.monotonic()+max_seconds
    variants=[('compact',2,'original',source),('compact_balanced',2,'balanced-task',source),
              ('compact_balanced_augmented',2,'balanced-task',augmented)]
    reports=[]
    for name,contract,sampling,data in variants:
        remaining=int(deadline-time.monotonic())
        if remaining<60:raise TimeoutError('Ablation budget exhausted before next variant')
        folder=output/'ablations'/name
        args=parser().parse_args(['--output',str(folder),'--data',str(data),'--max-steps',str(steps),
            '--max-seconds',str(min(240,remaining-20)),'--input-contract',str(contract),
            '--sampling',sampling,'--save-every','250','--require-gpu'])
        training=train(args)
        if training.get('status')!='pilot_complete':raise RuntimeError('Variant did not finish training/validation')
        model=AutoModelForSequenceClassification.from_pretrained(folder/'model',local_files_only=True,attn_implementation='eager').to('cuda')
        tokenizer=AutoTokenizer.from_pretrained(folder/'model',local_files_only=True)
        recs,rows=load_data(Path(data))
        summaries={}
        for split in ['train','validation']:
            records,timing=infer(model,tokenizer,expand(recs,rows,split,contract),'cuda',deadline=deadline)
            selected=[r for r in rows if r['split']==split]
            metrics=score(selected,records,.5)
            (folder/f'{split}-at-0.5.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2)+'\n')
            summaries[split]={k:v for k,v in metrics.items() if k not in ['cases','by_scenario']}
        reports.append({'name':name,'training':training,'at_0_5':summaries})
        del model;torch.cuda.empty_cache()
    # Engineering candidate only: choose on unchanged validation, never challenge/test.
    # Conservative selected-policy coverage wins; raw accuracy resolves all-abstain ties.
    winner=max(reports,key=lambda r:(r['training']['validation']['update_recall'],r['at_0_5']['validation']['exact_rate']))
    shutil.copytree(output/'ablations'/winner['name'],output/'run')
    chosen_data=augmented if winner['name'].endswith('augmented') else source
    shutil.copytree(chosen_data,output/'selected-data')
    result={'selection':'Validation-only engineering candidate. Not production acceptance.', 'winner':winner['name'],
            'steps_per_variant':steps,'variants':reports,'test_evaluated':False,'human_reviewed':False,'production_ready':False}
    (output/'ablation-report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'winner':winner['name'],'validation':winner['at_0_5']['validation']},indent=2),flush=True)
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('output');p.add_argument('--steps',type=int,default=1000);p.add_argument('--max-seconds',type=int,default=600)
    a=p.parse_args()
    if not 1<=a.steps<=1000 or not 60<=a.max_seconds<=900:raise SystemExit('Invalid ablation budget')
    run(a.output,a.steps,a.max_seconds)

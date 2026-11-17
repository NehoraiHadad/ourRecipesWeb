"""Descriptive paired error changes on exposed data, after frozen V11 decision."""
import collections
import json
from pathlib import Path
from analyze_sparse_errors_v6 import analyze
from sparse_recipe_v3 import aggregate,score

ROOT=Path(__file__).resolve().parent


def run():
    data=json.loads((ROOT/'verification/sparse-recipe-data-v6-20261116.json').read_text())
    folders={'replay_v5':'ourrecipes-sparse-v5-20261116/recovered/study/control',
        'teacher_v9':'ourrecipes-teacher-v9-20261116/recovered/study/model',
        'native_v10':'ourrecipes-native-v10-20261116/recovered/study/model',
        'coverage_v11':'ourrecipes-adapter-v11-20261116/recovered/study/model'}
    reports={};records={}
    for arm,folder in folders.items():
        reports[arm]={};records[arm]={}
        for group,prefix in [('hard',''),('regression','regression-')]:
            raw=json.loads((ROOT/'runs'/folder/f'validation-step-{prefix}160.json').read_text())['records']
            rows=data[group];assert [r['id'] for r in rows]==[r['id'] for r in raw]
            records[arm][group]=raw
            report=analyze(rows,raw);by_family={}
            for family in sorted({r['family'] for r in rows}):
                indices=[i for i,r in enumerate(rows) if r['family']==family]
                by_family[family]=aggregate([rows[i] for i in indices],[raw[i]['text'] for i in indices])[0]
            reports[arm][group]={'metrics':aggregate(rows,[r['text'] for r in raw])[0],
                'by_family':by_family,**report}
    changes={}
    for anchor in ['replay_v5','native_v10','teacher_v9']:
        changes[anchor]={}
        for group in data:
            rows=data[group];old=records[anchor][group];new=records['coverage_v11'][group]
            counts=collections.Counter();examples=[]
            for row,a,b in zip(rows,old,new):
                ea=score(row,a['text']);eb=score(row,b['text'])
                label=('correct' if ea['exact'] else 'wrong')+'->'+('correct' if eb['exact'] else 'wrong')
                counts[label]+=1
                if ea['exact']!=eb['exact']:
                    examples.append({'id':row['id'],'family':row['family'],'utterance':row['input']['utterance'],
                        'history':row['input']['history'],'expected':row['expected'],
                        'anchor_text':a['text'],'candidate_text':b['text'],'change':label})
            changes[anchor][group]={'transitions':dict(counts),'changed_examples':examples}
    result={'scope':'Posthoc descriptive error analysis on exposed synthetic development/regression; categories overlap. No new inference, labels, thresholds or checkpoint selection. Teacher differs in size and data; not a causal model-size comparison.',
        'reports':reports,'candidate_vs_cached_anchors':changes}
    path=ROOT/'verification/adapter-scope-error-analysis-v11-20261116.json'
    with path.open('x') as stream:stream.write(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({a:{g:d['transitions'] for g,d in gs.items()} for a,gs in changes.items()},indent=2))


if __name__=='__main__':run()

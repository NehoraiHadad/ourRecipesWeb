"""Train-only minimal contrasts; never copy validation failures into training."""
from copy import deepcopy
import json
from pathlib import Path
from ablation import augmented_data
from corpus import ROOT, digest, examples, load_data, validate


def build(output):
    output=Path(output);augmented_data(output)
    recs,original=load_data(output);rows=deepcopy(original)
    # All objects occur in the original training recipes. No held-out recipe,
    # validation-specific ingredient or validation wording is introduced.
    pairs=[('גזר','בטטה'),('אורז','עדשים'),('בצל','כרוב'),('עגבנייה','מלפפון')]
    for i,(first,second) in enumerate(pairs):
        for kind in ['same-object','same-verb']:
            specs=[('לשטוף','שטפתי',first),('לחתוך','חתכתי',first),
                   ('לבשל','בישלתי',first),('לערבב','ערבבתי',first)] if kind=='same-object' else [
                   ('לשטוף','שטפתי',first),('לחתוך','חתכתי',first),
                   ('לשטוף','שטפתי',second),('לחתוך','חתכתי',second)]
            rid=f'contrast-{i}-{kind}'
            recipe={'id':rid,'split':'train','title':'ניגוד פעולות לצורך אימון בלבד','ingredients':[first,second],
                'actions':[{'id':f'a{j}','step':j,'text':verb+' '+obj,'report':past+' '+obj}
                           for j,(verb,past,obj) in enumerate(specs)]}
            recs[rid]=recipe
            for row in examples(recipe):
                row['family']='train:contrastive-source-v1'
                row['scenario']='contrastive_'+row['scenario'];rows.append(row)
    # Known-action questions and meta/future assertions must not mutate state.
    for recipe in list(recs.values()):
        if recipe['split']!='train':continue
        for j,action in enumerate(recipe['actions']):
            past=action['report'];act=action['text']
            variants=[('only','רק '+past,'report',True,past),
                      ('no','למען הדיוק, לא '+past,'report',False,'לא '+past),
                      ('question','האם צריך '+act+' עכשיו?','clarify',None,None),
                      ('plan','אני מתכוון '+act+' אחר כך','clarify',None,None),
                      ('meta','לא אמרתי ש'+past,'clarify',None,None),
                      ('incomplete','התחלתי '+act+' אבל עוד לא סיימתי','clarify',None,None)]
            for name,text,intent,done,evidence in variants:
                rows.append({'id':f'{recipe["id"]}-target-{j}-{name}','recipe_id':recipe['id'],'split':'train',
                    'scenario':'targeted_'+name,'family':'train:targeted-assertion-v1','utterance':text,'previous':None,
                    'state':{'currentStep':0,'completed':[],'remaining':[a['id'] for a in recipe['actions']]},
                    'gold':{'intent':intent,'changes':[] if done is None else [{'actionId':action['id'],'done':done,'evidence':evidence}]},
                    'provenance':'synthetic_authored','human_review':'pending'})
    counts=validate(list(recs.values()),rows)
    # Hold-out bytes must survive exactly, not just counts.
    for name in ['validation.jsonl','test.jsonl']:
        if (output/name).read_bytes()!=(ROOT/'data'/name).read_bytes():raise ValueError('Held-out data changed')
    original_recs,_=load_data()
    for key,rec in original_recs.items():
        if rec['split']!='train' and recs[key]!=rec:raise ValueError('Held-out recipe changed')
    (output/'recipes.json').write_text(json.dumps(list(recs.values()),ensure_ascii=False,indent=2)+'\n')
    (output/'train.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows if r['split']=='train'))
    files={p.name:digest(p.read_bytes()) for p in sorted(output.iterdir()) if p.name!='manifest.json'}
    manifest={'schema':1,'origin':'Original synthetic minimal contrasts using training ingredients only','human_review':'pending',
        'counts':counts,'files':files,'corpus_sha256':digest(files),'parent_corpus_sha256':json.loads((ROOT/'data/manifest.json').read_text())['corpus_sha256'],
        'notes':'Validation/test rows and recipes preserved. Templates shared with historical evaluation; no natural-speech claim.'}
    (output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    return output

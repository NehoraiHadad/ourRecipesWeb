"""Shared state/retention/group metrics; extracted unchanged from V12."""
def breakdown(rows,metrics):
    from collections import defaultdict
    kinds={r['id']:r.get('evaluation_kind','guardrail') for r in rows};groupid={r['id']:r.get('counterfactual_group') for r in rows}
    buckets=defaultdict(list);groups=defaultdict(list)
    for c in metrics['cases']:
        buckets[kinds[c['id']]].append(c)
        if groupid[c['id']]:groups[groupid[c['id']]].append(c['exact'])
    result={}
    for name,cases in buckets.items():
        true=false=expected=0
        for c in cases:
            gold={v['actionId']:v['done'] for v in c['gold']['changes']};actual={v['actionId']:v['done'] for v in c['actual']['changes']}
            true+=sum(k in gold and gold[k]==v for k,v in actual.items());false+=sum(k not in gold or gold[k]!=v for k,v in actual.items());expected+=len(gold)
        result[name]={'examples':len(cases),'exact':sum(c['exact'] for c in cases),'exact_rate':sum(c['exact'] for c in cases)/len(cases),
            'true_updates':true,'false_updates':false,'expected_updates':expected,'recall':true/expected if expected else 0,
            'precision':true/(true+false) if true+false else None,'cost':5*false+expected-true}
    result['groups']={'count':len(groups),'all_correct':sum(all(v) for v in groups.values()),'rate':sum(all(v) for v in groups.values())/len(groups) if groups else 0}
    return result


"""Reanalyse used validation outputs: semantic proposals vs effective state changes."""
from collections import Counter
from datetime import datetime,timezone
import json
from pathlib import Path
from corpus import ROOT,digest


def measure(rows,cases):
    lookup={r['id']:r for r in rows};counts=Counter()
    for case in cases:
        row=lookup[case['id']];done=set(row['state']['completed']);gold={c['actionId']:c['done'] for c in case['gold']['changes']};actual={c['actionId']:c['done'] for c in case['actual']['changes']}
        effective_gold={a:v for a,v in gold.items() if (a in done)!=v}
        effective_actual={a:v for a,v in actual.items() if (a in done)!=v}
        counts['gold_proposals']+=len(gold);counts['gold_effective_updates']+=len(effective_gold);counts['gold_idempotent_confirmations']+=len(gold)-len(effective_gold)
        counts['correct_proposals']+=sum(gold.get(a)==v for a,v in actual.items())
        counts['wrong_proposals']+=sum(a not in gold or gold[a]!=v for a,v in actual.items())
        counts['correct_idempotent_confirmations']+=sum(a in gold and gold[a]==v and a not in effective_gold for a,v in actual.items())
        counts['correct_effective_updates']+=sum(effective_gold.get(a)==v for a,v in effective_actual.items())
        counts['wrong_effective_updates']+=sum(a not in effective_gold or effective_gold[a]!=v for a,v in effective_actual.items())
        # False entries must be normalized for absent pending IDs.
        allids=set(done)|set(gold)|set(actual)
        g={a:gold.get(a,a in done) for a in allids};p={a:actual.get(a,a in done) for a in allids}
        counts['resulting_state_exact']+=int(g==p)
    result=dict(counts);result['effective_update_recall']=counts['correct_effective_updates']/counts['gold_effective_updates'] if counts['gold_effective_updates'] else None;result['proposal_recall']=counts['correct_proposals']/counts['gold_proposals'] if counts['gold_proposals'] else None;result['examples']=len(cases);return result


def run():
    fixture=ROOT/'verification/certainty-v5-data-20261112/validation.json';rows=json.loads(fixture.read_text())['rows'];trials={}
    for arm in ('control','adapter'):
        path=ROOT/f'runs/colab-adapter-v6/recovered/study/{arm}-42/best-validation.json';cases=json.loads(path.read_text())['new']['cases'];trials[arm]=measure(rows,cases)
    proof={'created_utc':datetime.now(timezone.utc).isoformat(),'scope':'Recalculation of already-used V6 validation artifacts. No model, new test, GPU or new accuracy sample.',
        'source_sha256':digest((ROOT/'research_metric_audit.py').read_bytes()),'fixture_sha256':digest(fixture.read_bytes()),'trials':trials,
        'finding':'V6 gain26->30 correct proposals is four confirmations of already-pending actions; effective state changes stay16/32, correction coverage remains0/16.',
        'resulting_state_is_not_enough':'Always clarifying can preserve correct state on no-op cases while failing conversation/semantic intent; keep both metrics.'}
    (ROOT/'verification/research-metric-audit-20261112.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof))


if __name__=='__main__':run()

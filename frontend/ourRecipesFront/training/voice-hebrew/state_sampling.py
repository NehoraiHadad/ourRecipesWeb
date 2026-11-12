"""Explicit 50/50 new-state/retention query allocation, global class correction."""
from paired_sampling import PairedSampler


class StateSampler:
    def __init__(self,items,rows,rng):
        by={r['id']:r for r in rows};state=[i for i in items if by[i['query']['example_id']].get('evaluation_kind')=='state']
        retained=[i for i in items if by[i['query']['example_id']].get('evaluation_kind')!='state']
        self.state=PairedSampler(state,rows,rng);self.retained=PairedSampler(retained,rows,rng);self.rng=rng
        if set(self.state.buckets['intent'])!={'report','clarify'} or set(self.retained.buckets['intent'])!={'report','clarify','next','missed','advice'}:raise ValueError('State/retention intent strata do not match the declared weighting')

    def batch(self):
        s,g=self.state,self.retained
        chosen=[s.items[s.choose(s.buckets['intent'])] for _ in range(2)]
        chosen += [g.items[g.choose(g.buckets['intent'])] for _ in range(2)]
        anchor=s.choose(s.anchors);peer=self.rng.choice(s.opponents[anchor])
        chosen += [s.items[anchor],s.items[peer]]+[g.items[g.choose(g.buckets['action'])] for _ in range(2)]
        result=[]
        for i,item in enumerate(chosen):
            q=item['query']
            # Intent marginals: report/clarify=.35 each, other3=.10 each.
            # Action marginals remain7/24,7/24,10/24, as in paired-family.
            weight=(4/7 if q['label'] in ('report','clarify') else 2.) if q['task']=='intent' else (.8 if q['label']=='not_mentioned' else 8/7)
            result.append({**item,'loss_weight':weight,'sampling_source':'state' if i in (0,1,4,5) else 'retention'})
        return result

"""Training-only phenotype-balanced sampling and same-report candidate margin.

Gold labels/family metadata guide sampling/loss only, never model inputs.
"""
from collections import defaultdict
import re


def family(row):
    s=row['scenario'];intent=row['gold']['intent'];changes=row['gold']['changes']
    if any(v in s for v in ('correction','retract','cancel')):return 'correction'
    previous=row['previous']
    if previous:return 'history-local' if previous['recipe_id']==row['recipe_id'] else 'history-foreign'
    if intent in ('next','missed','advice'):return intent
    if intent=='report':
        if '?' in row['utterance']:return 'report-question'
        if 'shared-verb' in s:return 'shared-predicate'
        if len(changes)>1:return 'multiple-actions'
        if any(v in s for v in ('implicit','passive','nominal','completion','finish','state')):return 'state-completion'
        if any(not c['done'] for c in changes):return 'negative'
        return 'direct'
    for name,patterns in [('uncertain',('uncertain','unsure')),('partial',('partial','half')),
                          ('future',('future','plan')),('meta',('meta','quoted')),
                          ('question',('question','nonreport')),('other-operation',('wrong-operation',))]:
        if any(p in s for p in patterns):return name
    return 'ambiguous'


def overlap(left,right):
    def words(text):
        text=text.removeprefix('פעולה נבדקת: ')
        return re.findall(r'[א-ת]+',text)
    a=words(left);b=words(right)
    ignored={'את','של','עם','לקערה','בקערה','לסיר','בסיר'}
    rest=lambda x:{w.removeprefix('ה') for w in x[1:] if w not in ignored}
    return (2 if a and b and a[0]==b[0] else 0)+len(rest(a)&rest(b))


class PairedSampler:
    """Four intents + four actions, including one support/absent matched pair.

    Action marginal probabilities: done=7/24, not_done=7/24, absent=10/24.
    Weights 8/7,8/7,4/5 restore equal expected label contribution (1/3).
    These correct the changed sample distribution, not an extra precision knob.
    """
    def __init__(self,items,rows,rng):
        self.items=items;self.rng=rng;by_id={r['id']:r for r in rows}
        self.buckets=defaultdict(lambda:defaultdict(lambda:defaultdict(list)))
        grouped=defaultdict(list);self.families={}
        for i,item in enumerate(items):
            q=item['query'];f=family(by_id[q['example_id']]);self.families[i]=f
            self.buckets[q['task']][q['label']][f].append(i)
            if q['task']=='action':grouped[q['example_id']].append(i)
        self.opponents={};self.anchors=defaultdict(lambda:defaultdict(list))
        for group in grouped.values():
            absent=[i for i in group if items[i]['query']['label']=='not_mentioned']
            for i in group:
                q=items[i]['query']
                if q['label']=='not_mentioned' or not absent:continue
                ranked=[(overlap(q['context'],items[j]['query']['context']),j) for j in absent]
                # Include both same-verb/wrong-object and same-object/wrong-verb
                # peers; always taking only the top score would neglect one.
                self.opponents[i]=[j for s,j in ranked if s>0] or absent
                self.anchors[q['label']][self.families[i]].append(i)
        if set(self.anchors)!={'done','not_done'}:raise ValueError('Both support polarities need absent same-report opponents')

    def choose(self,buckets):
        label=self.rng.choice(sorted(buckets));groups=buckets[label]
        f=self.rng.choice(sorted(groups));return self.rng.choice(groups[f])

    def batch(self):
        indices=[self.choose(self.buckets['intent']) for _ in range(4)]
        anchor=self.choose(self.anchors);opponent=self.rng.choice(self.opponents[anchor])
        indices += [anchor,opponent]+[self.choose(self.buckets['action']) for _ in range(2)]
        result=[]
        for i in indices:
            item=self.items[i];q=item['query']
            weight=1. if q['task']=='intent' else (.8 if q['label']=='not_mentioned' else 8/7)
            result.append({**item,'loss_weight':weight,'sampling_family':self.families[i]})
        return result


def margin_loss(logits,items,margin=1.):
    """Rank supported candidate above absent candidate from the SAME report.

    Support score = logsumexp(done,not_done)-not_mentioned at CLS.
    Polarity is supervised by the unchanged classification/span losses.
    """
    import torch
    groups=defaultdict(lambda:{'support':[],'absent':[]})
    for j,item in enumerate(items):
        q=item['query']
        if q['task']=='action':groups[q['example_id']]['absent' if q['label']=='not_mentioned' else 'support'].append(j)
    scores=torch.logsumexp(logits[:,0,:2],dim=-1)-logits[:,0,2]
    terms=[torch.relu(margin-scores[p]+scores[n]) for group in groups.values() for p in group['support'] for n in group['absent']]
    return torch.stack(terms).mean() if terms else logits.sum()*0

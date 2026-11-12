"""Native-only start/end evidence head on two additional BERT token channels."""
import math
import unicodedata
from engine import records_from_logits

PROFILE='context-qa-v4'
GENERIC={'תיקון','לא','כן','עוד','אבל','אני','זה','עשיתי','סיימתי','בעצם'}


def word_char(c):return c.isalnum() or unicodedata.category(c).startswith('M')


def is_boundary(text,p):
    if p==0 or p==len(text):return True
    a,b=text[p-1],text[p]
    if word_char(a) and word_char(b):return False
    quotes="'׳״"
    if a in quotes and p>1 and word_char(text[p-2]) and word_char(b):return False
    if b in quotes and p+1<len(text) and word_char(a) and word_char(text[p+1]):return False
    return True


def whole_word(text,begin,end):
    return is_boundary(text,begin) and is_boundary(text,end)


def valid_quote(text):
    words=[w for w in text.split() if any(c.isalpha() for c in w)]
    return len(words)>=2 and any(w not in GENERIC for w in words)


def probabilities(values):
    m=max(values);e=[math.exp(v-m) for v in values];s=sum(e);return [v/s for v in e]


def decode(item,logits):
    q=item['query'];pair=records_from_logits([q],[logits[0]])[0]
    if q['task']=='intent':return pair
    if len(logits[0])!=10:raise ValueError('Boundary profile requires ten output channels')
    allowed=[0]+item['positions'];ps=probabilities([logits[p][8] for p in allowed]);pe=probabilities([logits[p][9] for p in allowed])
    null=ps[0]*pe[0];text=item['current_utterance'];shift=item['current_start'];best=None
    starts=[];ends=[]
    for k,p in enumerate(allowed[1:],1):
        b,e=item['offsets'][p];b-=shift;e-=shift
        if is_boundary(text,b):starts.append((k,b))
        if is_boundary(text,e):ends.append((k,e))
    for i,b in starts:
        for j,e in ends:
            if j<i:continue
            score=ps[i]*pe[j]
            if best is not None and score<=best[0]:continue
            quote=text[b:e]
            if valid_quote(quote):best=(score,i,j,b,e,quote)
    diagnostic={'candidate_prediction':pair['prediction'],'candidate_confidence':pair['confidence'],'null_joint_probability':null}
    def absent(reason):return {**q,'prediction':'not_mentioned','confidence':1.,'evidence':None,'_boundary':{**diagnostic,'reason':reason}}
    if best is None:return absent('candidate_absent' if pair['prediction']=='not_mentioned' else 'no_valid_span')
    score,i,j,b,e,quote=best
    diagnostic.update(start_probability=ps[i],end_probability=pe[j],begin=b,end=e,proposed_evidence=quote)
    if pair['prediction']=='not_mentioned':return absent('candidate_absent')
    if score<=null:return absent('no_evidence')
    confidence=min(pair['confidence'],ps[i],pe[j])
    reason='candidate_confidence' if pair['confidence']<.5 else 'evidence_confidence' if confidence<.5 else 'accepted_before_intent_gate'
    return {**q,'prediction':pair['prediction'],'confidence':confidence,'evidence':quote,'_boundary':{**diagnostic,'reason':reason}}


def loss(logits,items):
    import torch
    import torch.nn.functional as F
    losses=[]
    for j,item in enumerate(items):
        q=item['query']
        if q['task']=='intent':
            target=torch.tensor([item['targets'][0]-3],device=logits.device)
            losses.append(F.cross_entropy(logits[j,0,3:8].unsqueeze(0),target));continue
        cls=F.cross_entropy(logits[j,0,:3].unsqueeze(0),torch.tensor([item['targets'][0]],device=logits.device))
        allowed=[0]+item['positions'];gold=[p for p in item['positions'] if item['targets'][p] in (0,1)]
        start=allowed.index(gold[0]) if gold else 0;end=allowed.index(gold[-1]) if gold else 0
        a=F.cross_entropy(logits[j,allowed,8].unsqueeze(0),torch.tensor([start],device=logits.device))
        b=F.cross_entropy(logits[j,allowed,9].unsqueeze(0),torch.tensor([end],device=logits.device))
        losses.append((.5*cls+.25*a+.25*b)*item.get('loss_weight',1.))
    return torch.stack(losses).mean()

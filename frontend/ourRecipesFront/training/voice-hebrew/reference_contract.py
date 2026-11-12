"""Model proposes language meaning; code binds a unique current-step action.

Research-only pure contract. No app state mutation, inferred quantities or steps.
"""
import math

MODES=('remaining_done','remaining_not_done','completed_not_done')


def resolve(recipe,state,proposal,utterance,threshold):
    def clarify(reason):return {'intent':'clarify','changes':[],'reason':reason}
    if not isinstance(proposal,dict) or set(proposal)!={'mode','evidence','confidence'}:return clarify('invalid_proposal_fields')
    mode=proposal['mode'];p=proposal['confidence'];quote=proposal['evidence']
    if mode not in MODES or not isinstance(p,(int,float)) or isinstance(p,bool) or not math.isfinite(p) or not 0<=p<=1:return clarify('invalid_semantics')
    if p<threshold:return clarify('low_confidence')
    if not isinstance(quote,str) or not quote or quote not in utterance or len([w for w in quote.split() if any(c.isalpha() for c in w)])<2:return clarify('nonlocal_evidence')
    actions=recipe['actions'];ids=[a['id'] for a in actions];current=state.get('currentStep');done=state.get('completed');left=state.get('remaining')
    if state.get('recipe_id')!=recipe['id']:return clarify('stale_recipe_state')
    if not isinstance(current,int) or isinstance(current,bool) or current not in {a['step'] for a in actions}:return clarify('invalid_current_step')
    if not isinstance(done,list) or not isinstance(left,list) or not all(isinstance(v,str) for v in ids+done+left) or len(set(ids))!=len(ids):return clarify('invalid_state')
    if len(set(done))!=len(done) or len(set(left))!=len(left) or set(done)&set(left) or set(done)|set(left)!=set(ids):return clarify('invalid_state_partition')
    eligible=done if mode=='completed_not_done' else left
    candidates=[a for a in actions if a['step']==current and a['id'] in eligible]
    if len(candidates)!=1:return clarify('reference_not_unique')
    return {'intent':'report','changes':[{'actionId':candidates[0]['id'],'done':mode=='remaining_done','evidence':quote}]}

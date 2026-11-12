"""Authored examples for discussing a new semantic contract. Not a benchmark."""
from copy import deepcopy
import json
from corpus import ROOT,digest


def build():
    recipe={'id':'research-batter','actions':[{'id':'a_flour','step':0,'text':'להוסיף קמח'},{'id':'a_water','step':0,'text':'להוסיף מים'},{'id':'a_mix','step':0,'text':'לערבב את הבלילה'}]}
    cases=[]
    def claim(target,completion,evidence,commitment='ASSERTED'):
        return {'target':{'kind':'ACTION','action_id':target} if target.startswith('a_') else {'kind':target},'commitment':commitment,'completion':completion,'evidence':evidence}
    def add(name,text,claims,done=(),changes=(),policy='accept_fact',group=None,stale=False):
        state={'recipe_id':'old-recipe' if stale else recipe['id'],'currentStep':0,'completed':list(done),'remaining':[a['id'] for a in recipe['actions'] if a['id'] not in done]}
        for c in claims:
            assert c['evidence'] in text
            if c['target']['kind']=='ACTION':assert c['target']['action_id'] in {a['id'] for a in recipe['actions']}
        cases.append({'id':name,'group':group or name,'usage':'design_only_not_train_validation_or_test','provenance':'synthetic_authored','human_review':'pending',
            'utterance':text,'state':state,'draft_semantics':{'claims':claims},'draft_policy':policy,
            'expected_effective_changes':[{'actionId':a,'done':v} for a,v in changes]})
    t='הוספתי מים';add('water',t,[claim('a_water','COMPLETE',t)],changes=[('a_water',True)])
    t='לא ערבבתי את הבלילה'
    add('explicit_negative_pending',t,[claim('a_mix','INCOMPLETE',t)],done=['a_water'],group='same_fact_different_prior_state')
    add('explicit_negative_correction',t,[claim('a_mix','INCOMPLETE',t)],done=['a_water','a_mix'],changes=[('a_mix',False)],group='same_fact_different_prior_state')
    t='הפעולה היחידה שסימנתי כמושלמת לא בוצעה'
    add('marked_incomplete',t,[claim('CURRENT_MARKED_COMPLETE','INCOMPLETE',t)],done=['a_mix'],changes=[('a_mix',False)],group='marked_polarity')
    p='אני מעדכן: '+t
    add('marked_incomplete_prefix',p,[claim('CURRENT_MARKED_COMPLETE','INCOMPLETE',t)],done=['a_mix'],changes=[('a_mix',False)],group='marked_polarity')
    t='הפעולה היחידה שסימנתי כמושלמת אכן בוצעה'
    add('marked_complete',t,[claim('CURRENT_MARKED_COMPLETE','COMPLETE',t)],done=['a_mix'],group='marked_polarity')
    t='הפעולה היחידה שנותרה בשלב הזה בוצעה'
    add('remaining_complete',t,[claim('CURRENT_REMAINING','COMPLETE',t)],done=['a_flour','a_water'],changes=[('a_mix',True)],group='remaining_polarity')
    t='הפעולה היחידה שנותרה בשלב הזה לא בוצעה'
    add('remaining_incomplete',t,[claim('CURRENT_REMAINING','INCOMPLETE',t)],done=['a_flour','a_water'],group='remaining_polarity')
    t='נדמה לי שערבבתי את הבלילה';add('uncertain',t,[claim('a_mix','COMPLETE',t,'UNCERTAIN')],policy='clarify',group='scope_and_commitment')
    t='לא אמרתי שערבבתי את הבלילה';add('metaneg',t,[claim('a_mix','UNSPECIFIED',t,'NONASSERTION')],policy='clarify',group='scope_and_commitment')
    t='אערבב את הבלילה בהמשך';add('future',t,[claim('a_mix','UNSPECIFIED',t,'NONASSERTION')],policy='no_state_update',group='scope_and_commitment')
    t='האם ערבבתי את הבלילה?';add('question',t,[claim('a_mix','UNSPECIFIED',t,'NONASSERTION')],policy='no_state_update',group='scope_and_commitment')
    t='ערבבתי רק מעט מהבלילה';add('partial_pending',t,[claim('a_mix','PARTIAL',t)],policy='keep_pending_and_clarify_if_needed',group='partial_context')
    add('partial_after_done',t,[claim('a_mix','PARTIAL',t)],done=['a_mix'],policy='clarify_no_automatic_retraction',group='partial_context')
    t='הוספתי מים אבל עוד לא ערבבתי את הבלילה';add('two_claims',t,[claim('a_water','COMPLETE','הוספתי מים'),claim('a_mix','INCOMPLETE','עוד לא ערבבתי את הבלילה')],changes=[('a_water',True)])
    t='הפעולה היחידה שעוד לא בוצעה בשלב הזה בוצעה עכשיו';add('relative_negation_complete',t,[claim('CURRENT_REMAINING','COMPLETE',t)],done=['a_flour','a_water'],changes=[('a_mix',True)],group='negation_scope')
    t='הפעולה היחידה שעוד לא בוצעה בשלב הזה עדיין לא בוצעה';add('relative_negation_incomplete',t,[claim('CURRENT_REMAINING','INCOMPLETE',t)],done=['a_flour','a_water'],group='negation_scope')
    t='סיימתי את הפעולה היחידה שנותרה';add('nonunique',t,[claim('CURRENT_REMAINING','COMPLETE',t)],done=['a_flour'],policy='clarify')
    t='הוספתי מים';add('stale_recipe',t,[claim('a_water','COMPLETE',t)],policy='reject_stale_state',stale=True)
    return {'scope':'Draft semantic/policy examples for research. Human review pending; not training data, validation, fresh test or model output.',
        'recipe':recipe,'cases':cases,'notes':['Completion is proposition content; only ASSERTED facts may update state.','Correction is derived from prior state, not a dedicated semantic class.','Partial does not specify an amount and never marks complete automatically.','Navigation/advice policy is outside this draft.','Draft evidence strings are local quotations, not proof of factual truth.']}


if __name__=='__main__':
    data=build();path=ROOT/'verification/research-semantic-design-20261112.json';path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'cases':len(data['cases']),'groups':len({r['group'] for r in data['cases']}),'sha256':digest(path.read_bytes()),'neural_inference':False}))

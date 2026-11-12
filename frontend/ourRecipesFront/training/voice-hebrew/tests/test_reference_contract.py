from copy import deepcopy
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from reference_contract import resolve,reference_branch
from state_data import authored
from state_invariance import build


class ReferenceContractTests(unittest.TestCase):
    def test_uncertain_reference_clarifies_instead_of_ordinary_fallback(self):
        recipes,rows=authored();row=rows[0];recipe=recipes[row['recipe_id']];state={'recipe_id':row['recipe_id'],**row['state']}
        self.assertIsNone(reference_branch(recipe,state,'other',.9,row['utterance'],.7))
        for mode,p in [('remaining_not_done',.52),('remaining_done',.58),('other',.4)]:
            r=reference_branch(recipe,state,mode,p,row['utterance'],.7)
            self.assertEqual(r,{'intent':'clarify','changes':[],'requiresReview':True})
    def test_arbitrary_recipe_sizes_outside_progress_and_id_names_invariant(self):
        import random
        rng=random.Random(73);quote='הפעולה היחידה שנותרה בשלב הנוכחי בוצעה'
        for _ in range(200):
            actions=[{'id':f'x{s}_{j}','step':s,'text':f'פעולה {s} {j}'} for s in range(3) for j in range(rng.randint(1,4))]
            recipe={'id':'generated','actions':actions};current=rng.randrange(3)
            done=[a['id'] for a in actions if rng.choice([False,True])]
            state={'recipe_id':'generated','currentStep':current,'completed':done,'remaining':[a['id'] for a in actions if a['id'] not in done]}
            for mode in ('remaining_done','remaining_not_done','completed_not_done'):
                p={'mode':mode,'evidence':quote,'confidence':.99};before=resolve(recipe,state,p,quote,.9)
                other=deepcopy(state);other['completed']=[a['id'] for a in actions if (a['id'] in done if a['step']==current else rng.choice([False,True]))];other['remaining']=[a['id'] for a in actions if a['id'] not in other['completed']]
                self.assertEqual(before,resolve(recipe,other,p,quote,.9))
                names={a['id']:'opaque-'+str(i) for i,a in enumerate(reversed(actions))}
                renamed={'id':'generated','actions':[{**a,'id':names[a['id']]} for a in actions]};rs={**state,'completed':[names[v] for v in state['completed']],'remaining':[names[v] for v in state['remaining']]}
                after=resolve(renamed,rs,p,quote,.9)
                self.assertEqual(after['intent'],before['intent']);self.assertEqual(after['changes'],[{**v,'actionId':names[v['actionId']]} for v in before['changes']])

    def test_oracle_semantics_bind_current_state_without_mutation(self):
        # Oracle-supplied semantic type: tests code, not model understanding.
        recipes,rows=authored();mapping={'done':'remaining_done','not_done':'remaining_not_done','undo':'completed_not_done'}
        for row in rows:
            if row['evaluation_kind']!='state':continue
            mode=mapping[row['scenario'].split('-')[1]];state={'recipe_id':row['recipe_id'],**deepcopy(row['state'])};before=deepcopy(state)
            result=resolve(recipes[row['recipe_id']],state,{'mode':mode,'evidence':row['utterance'],'confidence':.99},row['utterance'],.9)
            self.assertEqual(result['intent'],row['gold']['intent']);self.assertEqual(result['changes'],row['gold']['changes']);self.assertEqual(state,before)

    def test_partial_outside_step_does_not_change_oracle_result(self):
        recipes,rows=build();mapping={'done':'remaining_done','not_done':'remaining_not_done','undo':'completed_not_done'}
        for row in rows:
            mode=mapping[row['scenario'].split('-')[1]]
            r=resolve(recipes[row['recipe_id']],{'recipe_id':row['recipe_id'],**row['state']},{'mode':mode,'evidence':row['utterance'],'confidence':.99},row['utterance'],.9)
            self.assertEqual(r['changes'],row['gold']['changes']);self.assertEqual(r['intent'],row['gold']['intent'])

    def test_stale_invalid_zero_candidate_and_nonlocal_evidence_clarify(self):
        recipes,rows=authored();row=rows[0];recipe=recipes[row['recipe_id']];state={'recipe_id':recipe['id'],**deepcopy(row['state'])}
        proposal={'mode':'remaining_done','evidence':row['utterance'],'confidence':.99}
        for bad in [{**proposal,'amount':3},{**proposal,'mode':'any_action'},{**proposal,'evidence':'ציטוט ממתכון אחר'},{**proposal,'confidence':float('nan')}]:
            self.assertEqual(resolve(recipe,state,bad,row['utterance'],.9)['intent'],'clarify')
        self.assertEqual(resolve(recipe,{**state,'recipe_id':'old'},proposal,row['utterance'],.9)['intent'],'clarify')
        done=[a['id'] for a in recipe['actions']]
        self.assertEqual(resolve(recipe,{**state,'completed':done,'remaining':[]},proposal,row['utterance'],.9)['intent'],'clarify')


if __name__=='__main__':unittest.main()

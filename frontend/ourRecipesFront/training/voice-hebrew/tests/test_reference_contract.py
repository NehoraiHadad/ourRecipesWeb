from copy import deepcopy
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from reference_contract import resolve
from state_data import authored
from state_invariance import build


class ReferenceContractTests(unittest.TestCase):
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

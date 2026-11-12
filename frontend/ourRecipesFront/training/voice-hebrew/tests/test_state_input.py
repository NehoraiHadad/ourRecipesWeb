"""Prospective contract checks; no existing model is scored on this proposal."""
from copy import deepcopy
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from grounding_data import heldouts,state_information_probes
from state_input_probe import proposed_queries


class StateInputTests(unittest.TestCase):
    def setUp(self):
        recipes,_=heldouts();self.recipe=next(iter(recipes.values()));self.rows=state_information_probes(self.recipe)

    def test_state_changes_input_but_gold_does_not_and_sources_not_mutated(self):
        original=deepcopy(self.rows);contexts=[]
        for row in self.rows:
            qs=list(proposed_queries(self.recipe,row));contexts.append(qs[1]['context'])
            copy=deepcopy(row);copy['gold']={'intent':'clarify','changes':[]}
            self.assertEqual([(q['context'],q['utterance']) for q in qs],[(q['context'],q['utterance']) for q in proposed_queries(self.recipe,copy)])
        self.assertEqual(len(set(contexts)),4);self.assertEqual(self.rows,original)

    def test_invalid_state_partition_and_boolean_step_rejected(self):
        for field,value in [('completed',['foreign-action']),('remaining',['a0','a0']),('currentStep',True)]:
            row=deepcopy(self.rows[0]);row['state'][field]=value
            with self.assertRaises(ValueError):list(proposed_queries(self.recipe,row))

    def test_foreign_history_does_not_enter_action_query(self):
        row=deepcopy(self.rows[0]);row['previous']={'recipe_id':'other-recipe','utterance':'דיווח זר שאסור להעביר'}
        for q in proposed_queries(self.recipe,row):
            self.assertNotIn('דיווח זר שאסור להעביר',q['utterance']);self.assertNotIn('דיווח זר שאסור להעביר',q['context'])


if __name__=='__main__':unittest.main()

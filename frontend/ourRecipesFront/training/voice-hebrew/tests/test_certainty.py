"""Data/contract/resource gates, not a claim of neural model understanding."""
from copy import deepcopy
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from certainty_contract import route
from certainty_data import language_rows, fixtures, normalize
from certainty_train import gates


class CertaintyTests(unittest.TestCase):
    def test_group_and_text_disjointness_and_minimal_contrasts(self):
        data=language_rows()
        for a,b in [('train','validation'),('train','test'),('validation','test')]:
            self.assertFalse({normalize(r['text']) for r in data[a]} & {normalize(r['text']) for r in data[b]})
            self.assertFalse({r['group'] for r in data[a]} & {r['group'] for r in data[b]})
        for split in ('validation','test'):
            groups={}
            for row in data[split]:groups.setdefault(row['group'],set()).add(row['label'])
            self.assertEqual(len(groups),12)
            self.assertTrue(all('clarify' in labels and len(labels)==2 for labels in groups.values()))

    def test_five_way_routing_is_fail_closed_without_state_mutation(self):
        f=fixtures('validation',language_rows()['validation']);recipe=f['recipes'][0];row=f['rows'][0]
        state={'recipe_id':row['recipe_id'],**row['state']};before=deepcopy(state)
        self.assertIsNone(route(recipe,state,'other',.99,row['utterance'],.7))
        for label,p in [('clarify',.999),('other',.6),('remaining_done',.6),('remaining_done',float('nan')),('other',True),('unknown',.99)]:
            self.assertEqual(route(recipe,state,label,p,row['utterance'],.7),{'intent':'clarify','changes':[],'requiresReview':True})
        self.assertEqual(route(recipe,state,'remaining_done',.99,row['utterance'],.7)['changes'],row['gold']['changes'])
        self.assertEqual(state,before)

    def test_quality_gate_rejects_confident_unsafe_update_and_silent_other_intent(self):
        fresh={'cases':[{'id':'u','actual':{'intent':'clarify','changes':[]}}], 'update_recall':.8,'false_updates':0}
        guard={'false_updates':3,'update_recall':.9,'exact_proposals':294};stress={'false_updates':0,'exact_rate':1.}
        self.assertTrue(gates(fresh,guard,stress,{'u'})['passed'])
        unsafe=deepcopy(fresh);unsafe['false_updates']=1
        self.assertFalse(gates(unsafe,guard,stress,{'u'})['passed'])
        silent=deepcopy(fresh);silent['cases'][0]['actual']['intent']='ask_next'
        self.assertFalse(gates(silent,guard,stress,{'u'})['passed'])


if __name__=='__main__':unittest.main()

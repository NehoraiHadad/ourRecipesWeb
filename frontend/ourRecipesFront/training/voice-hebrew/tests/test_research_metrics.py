from copy import deepcopy
from pathlib import Path
import sys,unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from research_metric_audit import measure

class ResearchMetricTests(unittest.TestCase):
 def record(self,gold,actual):
  rows=[{'id':'x','state':{'completed':['a'],'remaining':['b']}}]
  cases=[{'id':'x','gold':{'changes':gold},'actual':{'changes':actual}}]
  before=deepcopy((rows,cases));result=measure(rows,cases);self.assertEqual(before,(rows,cases));return result
 def test_missing_idempotent_confirmation_preserves_state_but_not_semantic_recall(self):
  r=self.record([{'actionId':'b','done':False}],[])
  self.assertEqual(r['gold_effective_updates'],0);self.assertEqual(r['resulting_state_exact'],1);self.assertEqual(r['correct_proposals'],0);self.assertIsNone(r['effective_update_recall'])
 def test_undo_is_a_real_required_transition(self):
  r=self.record([{'actionId':'a','done':False}],[])
  self.assertEqual(r['gold_effective_updates'],1);self.assertEqual(r['effective_update_recall'],0);self.assertEqual(r['resulting_state_exact'],0)
 def test_wrong_completion_changes_state_and_is_counted_as_false(self):
  r=self.record([],[{'actionId':'b','done':True}])
  self.assertEqual(r['wrong_proposals'],1);self.assertEqual(r['wrong_effective_updates'],1);self.assertEqual(r['resulting_state_exact'],0)

if __name__=='__main__':unittest.main()

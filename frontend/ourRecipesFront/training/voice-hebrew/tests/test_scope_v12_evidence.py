import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scope_v12_evidence import decide

class VoteTests(unittest.TestCase):
 def record(self,i):return {'label':i,'joint_confidence':1.,'components':[1.]*3,'ordinary_score':0.}
 def test_majority_requires_two_accepted_labels(self):
  p={'thresholds':[.5]*15,'readonly_threshold':.5}
  self.assertEqual(decide('המשימה שנותרה לא בוצעה',[self.record(i) for i in (1,1,7)],[p]*3),('reference',1))
  self.assertEqual(decide('המשימה שנותרה לא בוצעה',[self.record(i) for i in (0,1,7)],[p]*3)[0],'clarify')
 def test_two_confident_wrong_references_are_vetoed_without_rebinding(self):
  p={'thresholds':[.5]*15,'readonly_threshold':.5}
  self.assertEqual(decide('מה שהיה חסר עדיין לא נעשה',[self.record(i) for i in (7,7,1)],[p]*3),('clarify',7))
 def test_failed_development_cannot_open_fresh_test(self):
  from scope_v12_test import qualified
  with self.assertRaisesRegex(ValueError,'development'):qualified({'qualified_for_test':False})

if __name__=='__main__':unittest.main()

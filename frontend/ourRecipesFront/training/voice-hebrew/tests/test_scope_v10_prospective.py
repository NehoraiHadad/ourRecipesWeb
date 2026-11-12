import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class ProspectiveTests(unittest.TestCase):
 def test_three_member_qualification_is_required_for_test(self):
  from scope_v10_test import qualified
  p={'qualified_for_test':True,'members':[{'seed':s} for s in (42,17,73)],'calibration_route_mismatches':0,'calibration':{'passed':True},'native':{'passed':True}}
  qualified(p)
  p['native']['passed']=False
  with self.assertRaisesRegex(ValueError,'qualification'):qualified(p)
 def test_ambiguous_state_cannot_be_resolved_by_consensus(self):
  from facts_v7 import apply,JOINT,context
  state=context('remaining','ambiguous')
  self.assertEqual(apply(JOINT[0],state,state['recipe_id'],'v1')['changes'],[])

if __name__=='__main__':unittest.main()

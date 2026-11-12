import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scope_v10_consensus import consensus,combine

class ConsensusTests(unittest.TestCase):
 def setUp(self):
  self.p={'thresholds':[.5]*15,'readonly_threshold':.5}
 def record(self,i):return {'label':i,'joint_confidence':.999,'components':[.999]*3,'ordinary_score':0.}
 def test_disagreement_cannot_mutate(self):
  self.assertEqual(consensus([self.record(0),self.record(7)],[self.p]*2),('clarify',14))
 def test_unanimous_assertion_can_bind(self):
  self.assertEqual(consensus([self.record(7)]*3,[self.p]*3),('reference',7))
 def test_disabled_member_vetoes_reference(self):
  p={**self.p,'thresholds':[None]*15}
  self.assertEqual(consensus([self.record(7)]*2,[self.p,p]),('clarify',14))
 def test_ordinary_route_defers_to_separate_extractor(self):
  r={**self.record(14),'ordinary_score':.8}
  self.assertEqual(consensus([r,self.record(7)],[self.p]*2),('legacy',14))
 def test_alignment_required(self):
  with self.assertRaises(ValueError):combine([[self.record(0)],[]],[self.p]*2)
  with self.assertRaises(ValueError):consensus([self.record(0)],[self.p])

if __name__=='__main__':unittest.main()

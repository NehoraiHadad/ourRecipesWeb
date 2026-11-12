import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scope_v9_guarded import route

class GuardedTests(unittest.TestCase):
 def policy(self):return {'thresholds':[.5]*15,'readonly_threshold':.5}
 def test_uncertain_reference_is_not_a_certain_mutation(self):
  r={'label':7,'joint_confidence':.87,'components':[.87,1.,1.],'ordinary_score':0.}
  self.assertEqual(route(r,self.policy())[0],'clarify')
  r.update(joint_confidence=.999,components=[.999,.999,.999]);self.assertEqual(route(r,self.policy())[0],'reference')
 def test_route_signal_does_not_require_forced_reference_agreement(self):
  r={'label':14,'joint_confidence':.026,'components':[.033,.899,.887],'ordinary_score':.899*.887}
  self.assertEqual(route(r,self.policy()),('legacy',14))
 def test_disabled_action_class_stays_disabled(self):
  p=self.policy();p['thresholds'][1]=None;r={'label':1,'joint_confidence':1.,'components':[1.,1.,1.],'ordinary_score':0.}
  self.assertEqual(route(r,p)[0],'clarify')

 def test_three_seed_guard_before_test(self):
  from scope_v9_guarded_test import candidates
  d={'qualified_for_test':True,'trials':[{'seed':s,'parent_actual_updates':8000,'qualified':True} for s in (42,17,73)]}
  self.assertEqual(len(candidates(d)),3)
  d['trials'][1]['qualified']=False
  with self.assertRaisesRegex(ValueError,'Three-seed'):candidates(d)

if __name__=='__main__':unittest.main()

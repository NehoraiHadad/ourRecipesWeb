import sys,unittest,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scope_v9_data import build
from scope_v8_data import DATA as V8,SUBJECTS

class CompositionTests(unittest.TestCase):
 def test_held_sets_and_original_training_unchanged(self):
  new=build();old=json.loads(V8.read_text())
  for split in ('dev','calibration','test'):self.assertEqual(new['splits'][split],old['splits'][split])
  self.assertEqual(new['splits']['train'][:2116],old['splits']['train'])
  self.assertEqual(len(new['splits']['train']),15058)
 def test_composes_predicates_for_each_subject(self):
  rows=[r for r in build()['splits']['train'] if r.get('new_composition')];families={}
  for r in rows:families.setdefault(r['subject_pair'],set()).add(r['predicate_family'])
  self.assertEqual(len(families),60);self.assertTrue(all(len(p)==3 for p in families.values()))
 def test_actual_routing_mask_not_probability_change(self):
  from scope_v9 import decisions
  self.assertEqual(decisions([(0,.8),(7,.7)],{'kind':'global','threshold':.75}),[(0,1.),(7,0.)])
  self.assertEqual(decisions([(0,.8),(7,.7)],{'kind':'typed','thresholds':[None]*15}),[(0,0.),(7,0.)])

 def test_short_mechanics_budget_cannot_silently_skip_trial(self):
  from scope_v9 import can_start_trial
  self.assertTrue(can_start_trial(.01,120,True));self.assertFalse(can_start_trial(.01,120,False))
  self.assertTrue(can_start_trial(.01,2100,False));self.assertFalse(can_start_trial(1900,2100,False))

 def test_opening_requires_same_qualified_method_all_seeds(self):
  from scope_v9_test import candidates
  d={'qualified_for_test':True,'selected_method':'safety-typed','trials':[{'seed':s,'actual_steps':4000,'variants':{'safety-typed':{'qualified':True}}} for s in (42,17,73)]}
  self.assertEqual(candidates(d)[0],'safety-typed')
  d['trials'][1]['variants']['safety-typed']['qualified']=False
  with self.assertRaisesRegex(ValueError,'Three-seed'):candidates(d)

if __name__=='__main__':unittest.main()

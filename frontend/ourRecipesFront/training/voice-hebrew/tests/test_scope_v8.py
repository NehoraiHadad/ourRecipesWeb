import sys,unittest,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scope_v8_data import build,OPS
from facts_v7_replay import REPLAY

class ScopeTests(unittest.TestCase):
 def test_retention_unchanged_and_no_split_leakage(self):
  d=build();old=json.loads(REPLAY.read_text());seen={};groups={}
  for split in ('train','dev','calibration'):
   self.assertEqual(d['splits'][split][:len(old['splits'][split])],old['splits'][split])
  for split,rows in d['splits'].items():
   for r in rows:
    self.assertEqual(seen.setdefault(r['text'],split),split)
    self.assertEqual(groups.setdefault(r['group'],split),split)
 def test_same_claim_has_all_speech_acts(self):
  d=build()
  for split,rows in d['splits'].items():
   claims={}
   for r in rows:
    if r.get('new_scope'):claims.setdefault(r['claim'],set()).add(r['semantics'][1])
   self.assertTrue(claims)
   self.assertTrue(all(c=={'asserted','nonassertion','uncertain'} for c in claims.values()))
 def test_negation_in_side_clause_does_not_veto_assertion(self):
  for r in build()['splits']['train']:
   if r.get('new_scope') and r['operator'].startswith('עוד לא סידרתי'):self.assertEqual(r['semantics'][1],'asserted')
 def test_nonassertion_never_claims_completion(self):
  for rows in build()['splits'].values():
   for r in rows:
    if r.get('new_scope') and r['semantics'][1]=='nonassertion':self.assertEqual(r['semantics'][2],'unspecified')

class QualificationTests(unittest.TestCase):
 def test_test_remains_closed_without_three_selected_qualified_seeds(self):
  from scope_v8_test import candidates
  for d in ({'qualified_for_test':False},{'qualified_for_test':True,'selected_method':'flat-narrow','trials':[{'arm':'flat-narrow','seed':42,'qualified':True}]}):
   with self.assertRaisesRegex(ValueError,'Three-seed'):candidates(d)
  d={'qualified_for_test':True,'selected_method':'flat-wide','trials':[{'arm':'flat-wide','seed':s,'qualified':True} for s in (42,17,73)]}
  self.assertEqual(len(candidates(d)),3)
  d['trials'][1]['qualified']=False
  with self.assertRaises(ValueError):candidates(d)
 def test_unmeasured_fallback_cannot_be_called_safe(self):
  from scope_v8_test import passes
  m={'false_proposals':0,'effective_recall':1.,'correction_recall':1.}
  self.assertTrue(passes(m,0));self.assertFalse(passes(m,1))

if __name__=='__main__':unittest.main()

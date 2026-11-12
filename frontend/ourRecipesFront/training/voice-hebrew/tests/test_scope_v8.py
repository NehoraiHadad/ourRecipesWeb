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

if __name__=='__main__':unittest.main()

import json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scope_v11_data import build,PARENT

class ReplayDataTests(unittest.TestCase):
 def test_only_training_changes(self):
  old=json.loads(PARENT.read_text());new=build()
  for s in ('dev','calibration','test'):self.assertEqual(old['splits'][s],new['splits'][s])
  self.assertEqual(old['splits']['train'],new['splits']['train'][:15058])
 def test_fixed_diverse_nonduplicated_replay(self):
  d=build();rows=d['splits']['train'];added=rows[15058:]
  self.assertEqual(len(added),480);self.assertEqual({r['label'] for r in added},{14})
  self.assertEqual(len({r['text'] for r in rows}),len(rows))
  self.assertGreater(d['ordinary_replay']['source_scenarios_selected'],100)
 def test_deterministic_generation(self):self.assertEqual(build(),build())

if __name__=='__main__':unittest.main()

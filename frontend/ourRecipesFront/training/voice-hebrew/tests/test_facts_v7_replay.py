import sys,unittest,json,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from facts_v7 import DATA
from facts_v7_replay import build

class ReplayTests(unittest.TestCase):
 def test_replay_only_extends_training(self):
  old=json.loads(DATA.read_text());new=build()
  for split in ('dev','calibration','test'):self.assertEqual(old['splits'][split],new['splits'][split])
  self.assertEqual(len(new['splits']['train'])-len(old['splits']['train']),556)
  texts=[r['text'] for r in new['splits']['train']];self.assertEqual(len(texts),len(set(texts)))
 def test_no_unrecoverable_clarify_relabelled_as_partial(self):
  rows=[r for r in build()['splits']['train'] if r['id'].startswith('replay-')]
  self.assertFalse(any(r['source_kind'] in ('partial','memory') for r in rows))
  for r in rows:
   if r['source_label']=='clarify':self.assertNotEqual(r['semantics'][1],'asserted')

 def test_fresh_test_stays_closed_without_all_three_transfer_gates(self):
  from facts_v7_test import run
  for result in ({'qualified_for_test':False,'trials':[]},{'qualified_for_test':True,'trials':[{'seed':42,'transfer_passed':True}]},
    {'qualified_for_test':True,'trials':[{'seed':s,'transfer_passed':False} for s in (42,17,73)]}):
   with tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp);study=root/'recovered/study';study.mkdir(parents=True);(study/'result.json').write_text(json.dumps(result))
    with self.assertRaisesRegex(ValueError,'Three-seed'):run(root,'nonexistent-base')
    self.assertFalse((root/'fresh-test-once').exists())

if __name__=='__main__':unittest.main()

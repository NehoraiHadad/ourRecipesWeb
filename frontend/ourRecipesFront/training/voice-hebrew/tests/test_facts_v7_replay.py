import sys,unittest,json
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

if __name__=='__main__':unittest.main()

"""Training isolation, evidence scope and conservative location semantics."""
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from focused_data import authored,build,definite
from corpus import ROOT,load_data
from engine import verify_manifest


class FocusedTests(unittest.TestCase):
    def test_holdouts_match_and_new_training_is_additive(self):
        original=(ROOT/'data/test.jsonl').read_bytes()
        with tempfile.TemporaryDirectory() as tmp:
            a,b,audit=build(Path(tmp)/'data')
            for p in (a,b):verify_manifest(p)
            ar,ax=load_data(a);br,bx=load_data(b)
            self.assertEqual([r for r in bx if r['split']=='train' and not r['id'].startswith('focused-')],[r for r in ax if r['split']=='train'])
            self.assertEqual(len([r for r in ax if r['split']=='train']),5774)
            self.assertEqual(len([r for r in bx if r['split']=='train']),6638)
            for name in ('validation.jsonl','test.jsonl'):self.assertEqual((a/name).read_bytes(),(b/name).read_bytes())
            self.assertEqual(audit['query_conflicts']['3']['conflicting_effective_inputs'],0)
            self.assertEqual(len([r for r in bx if r['split']=='test']),306)
        self.assertEqual((ROOT/'data/test.jsonl').read_bytes(),original)

    def test_presence_elsewhere_is_not_a_negative_completion(self):
        _,rows=authored()
        for row in rows:
            if row['scenario'].rsplit('-',1)[0] in ('elsewhere','uncertain','partial-amount','future','meta','wrong-operation') or row['scenario']=='foreign-history':
                self.assertEqual(row['gold']['intent'],'clarify');self.assertFalse(row['gold']['changes'])
            if row['scenario']=='shared-verb-partial-step':
                self.assertEqual([c['done'] for c in row['gold']['changes']],[True,True,False])
                self.assertTrue(row['gold']['changes'][1]['evidence'].startswith(('שמתי','הכנסתי','הוספתי')))
            if row['scenario'].startswith('report-question'):
                self.assertEqual(row['gold']['intent'],'report');self.assertEqual(len(row['gold']['changes']),1)
        self.assertEqual(definite('חמאת בוטנים'),'חמאת הבוטנים')


if __name__=='__main__':unittest.main()

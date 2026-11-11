"""Control/candidate isolation and checkpoint objective regression checks."""
from pathlib import Path
import json
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from combined_data import build,holdouts
from corpus import ROOT,load_data
from engine import verify_manifest
from span_pilot import retain_best


class CombinedTests(unittest.TestCase):
    def test_matched_holdouts_and_training_only_bridges(self):
        original=(ROOT/'data/test.jsonl').read_bytes()
        with tempfile.TemporaryDirectory() as tmp:
            a,b,audit=build(Path(tmp)/'data')
            for p in [a,b]:verify_manifest(p);load_data(p)
            for name in ['validation.jsonl','test.jsonl']:self.assertEqual((a/name).read_bytes(),(b/name).read_bytes())
            self.assertEqual(verify_manifest(a)['counts']['train']['examples'],2272)
            self.assertEqual(verify_manifest(b)['counts']['train']['examples'],5774)
            _,rows=load_data(b)
            self.assertTrue(any(r['scenario'].startswith('bridge-alias') and r['utterance'].startswith('שמתי ') for r in rows))
            self.assertFalse(any(r['scenario'].startswith('bridge-') and r['split']!='train' for r in rows))
            self.assertEqual(audit['query_conflicts']['3']['conflicting_effective_inputs'],0)
        self.assertEqual((ROOT/'data/test.jsonl').read_bytes(),original)

    def test_reference_context_and_nonreports_have_explicit_policy(self):
        recs,rows=holdouts()
        for r in rows:
            if r['scenario'] in ['foreign-reference','question-0','partial-action','future','meta','uncertain']:
                self.assertEqual(r['gold']['intent'],'clarify');self.assertFalse(r['gold']['changes'])
        local=next(r for r in rows if r['scenario']=='local-reference')
        foreign=next(r for r in rows if r['scenario']=='foreign-reference' and r['recipe_id']==local['recipe_id'])
        self.assertEqual(local['utterance'],foreign['utterance'])
        self.assertEqual(local['previous']['recipe_id'],local['recipe_id'])
        self.assertNotEqual(foreign['previous']['recipe_id'],foreign['recipe_id'])

    def test_f0_5_checkpoint_does_not_reward_all_abstain_state_accuracy(self):
        class Model:
            def save_pretrained(self,folder,**kwargs):folder.mkdir(parents=True,exist_ok=True)
        class Tokenizer:
            def save_pretrained(self,folder):pass
        with tempfile.TemporaryDirectory() as tmp:
            abstain={'exact_including_gold_evidence':60,'exact_rate':.6,'update_precision':None,'update_recall':0}
            useful={'exact_including_gold_evidence':50,'exact_rate':.5,'update_precision':.9,'update_recall':.8}
            first=retain_best(Model(),Tokenizer(),Path(tmp),abstain,250,objective='f0.5')
            best=retain_best(Model(),Tokenizer(),Path(tmp),useful,500,first,'f0.5')
            self.assertEqual(best['step'],500)


if __name__=='__main__':unittest.main()

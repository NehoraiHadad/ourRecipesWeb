"""Actual corpus isolation, ambiguity and effective-input audit; no cloud."""
from copy import deepcopy
import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from corpus import ROOT,load_data,queries
from engine import verify_manifest
from semantic_data import authored,build,audit_queries


class SemanticTests(unittest.TestCase):
    def test_opt_in_word_alignment_preserves_all_actions_and_frozen_v1(self):
        recs,old=authored();newrecs,new=authored(aligned_gold=True)
        self.assertEqual(recs,newrecs);changed=[]
        for before,after in zip(old,new):
            if before!=after:changed.append(before['id'])
            self.assertEqual(before['utterance'],after['utterance'])
            self.assertEqual([(x['actionId'],x['done']) for x in before['gold']['changes']],[(x['actionId'],x['done']) for x in after['gold']['changes']])
            if before['split']!='test':self.assertEqual(before,after)
        self.assertEqual(len(changed),4)
        self.assertTrue(all('test-coreference' in key for key in changed))

    def test_same_text_requires_local_antecedent_and_context_retains_it(self):
        recs,rows=authored()
        local=next(r for r in rows if r['scenario']=='history-local-a0')
        foreign=next(r for r in rows if r['recipe_id']==local['recipe_id'] and r['scenario']=='history-foreign-a0')
        self.assertEqual(local['utterance'],foreign['utterance'])
        self.assertEqual(local['gold']['intent'],'report');self.assertEqual(foreign['gold']['intent'],'clarify')
        a=list(queries(recs[local['recipe_id']],local,3));b=list(queries(recs[local['recipe_id']],foreign,3))
        self.assertNotEqual(a[0]['context'],b[0]['context'])
        self.assertIn(local['previous']['utterance'],a[0]['context'])
        self.assertNotIn(foreign['previous']['utterance'],b[0]['context'])
        self.assertNotIn('דיווח קודם:',b[1]['utterance'])

    def test_effective_input_audit_detects_and_removes_unlearnable_conflicts(self):
        recs,rows=authored();audit=audit_queries(recs,rows)
        self.assertEqual(audit['2']['conflicting_effective_inputs'],40)
        self.assertEqual(audit['3']['conflicting_effective_inputs'],0)
        changed=deepcopy(rows);changed[1]['utterance']=changed[0]['utterance']
        changed[1]['gold']['intent']='clarify';changed[1]['gold']['changes']=[]
        with self.assertRaisesRegex(ValueError,'contradictory'):audit_queries(recs,changed)

    def test_arms_share_holdout_bytes_and_preserve_original_test(self):
        before=(ROOT/'data/test.jsonl').read_bytes()
        with tempfile.TemporaryDirectory() as tmp:
            control,richer,audit=build(Path(tmp)/'comparison')
            for p in [control,richer]:verify_manifest(p);load_data(p)
            for name in ['validation.jsonl','test.jsonl']:
                self.assertEqual((control/name).read_bytes(),(richer/name).read_bytes())
            cm=verify_manifest(control);rm=verify_manifest(richer)
            self.assertEqual(cm['counts']['train']['examples'],2272)
            self.assertEqual(rm['counts']['train']['examples'],3744)
            self.assertEqual(cm['counts']['test']['examples'],104)
        self.assertEqual((ROOT/'data/test.jsonl').read_bytes(),before)

    def test_uncertainty_meta_partial_and_foreign_reference_do_not_assert_completion(self):
        _,rows=authored()
        for row in rows:
            if any(s in row['scenario'] for s in ['meta','partial-','partial','uncertain','foreign','question','future']):
                if row['scenario'].startswith('pronoun-partial'):continue
                self.assertEqual(row['gold']['intent'],'clarify',row['id'])
                self.assertFalse(row['gold']['changes'])


if __name__=='__main__':unittest.main()

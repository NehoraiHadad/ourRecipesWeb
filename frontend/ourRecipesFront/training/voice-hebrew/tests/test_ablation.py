"""Data/input isolation and balanced sampling checks; no weights or cloud calls."""
from collections import Counter
from copy import deepcopy
from pathlib import Path
import random
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from ablation import augmented_data
from challenge import challenge
from corpus import ROOT, load_data, queries, validate
from engine import expand, training_order, verify_manifest
from targeted_data import build as targeted_data
from fresh_diagnostic import build as fresh_data


class AblationTests(unittest.TestCase):
    def test_fresh_diagnostic_is_valid_and_not_training_text(self):
        recs,rows=fresh_data();validate(list(recs.values()),rows)
        with tempfile.TemporaryDirectory() as tmp:
            p=targeted_data(Path(tmp)/'data');_,training=load_data(p)
            self.assertFalse({r['utterance'] for r in rows}&{r['utterance'] for r in training})
        self.assertEqual(len(rows),16)

    def test_targeted_contrasts_preserve_heldout_recipes_and_rows(self):
        with tempfile.TemporaryDirectory() as tmp:
            target=targeted_data(Path(tmp)/'data');manifest=verify_manifest(target)
            recs,rows=load_data(target);original,_=load_data()
            for key,recipe in original.items():
                if recipe['split']!='train':self.assertEqual(recs[key],recipe)
            for name in ['validation.jsonl','test.jsonl']:
                self.assertEqual((target/name).read_bytes(),(ROOT/'data'/name).read_bytes())
            self.assertEqual(manifest['counts']['train']['recipes'],28)
            self.assertTrue(any(r['scenario']=='targeted_question' and r['gold']['intent']=='clarify' for r in rows))
    def test_augmented_train_covers_every_candidate_and_preserves_holdout_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            target=augmented_data(Path(tmp)/'data')
            verify_manifest(target)
            recs,rows=load_data(target)
            counts=Counter((r['recipe_id'],c['actionId'],c['done']) for r in rows if r['split']=='train' for c in r['gold']['changes'])
            for rec in recs.values():
                if rec['split']=='train':
                    for action in rec['actions']:
                        self.assertGreater(counts[rec['id'],action['id'],True],0)
                        self.assertGreater(counts[rec['id'],action['id'],False],0)
            for name in ['recipes.json','validation.jsonl','test.jsonl']:
                self.assertEqual((target/name).read_bytes(),(ROOT/'data'/name).read_bytes())

    def test_compact_action_queries_have_no_action_position_or_other_recipe_history(self):
        recs,rows=load_data();row=deepcopy(rows[0]);recipe=recs[row['recipe_id']]
        row['previous']={'recipe_id':'another','utterance':'טקסט זר לגמרי'}
        items=list(queries(recipe,row,2))
        self.assertEqual(items[1]['context'],'פעולה נבדקת: '+recipe['actions'][0]['text'])
        self.assertNotIn('טקסט זר לגמרי',str(items))
        reversed_recipe={**recipe,'actions':list(reversed(recipe['actions']))}
        normal={q['action_id']:(q['context'],q['utterance'],q['label']) for q in items if q['task']=='action'}
        changed={q['action_id']:(q['context'],q['utterance'],q['label']) for q in queries(reversed_recipe,row,2) if q['task']=='action'}
        self.assertEqual(normal,changed)

    def test_balanced_order_is_reproducible_and_balances_tasks_and_rare_labels(self):
        recs,rows=load_data();items=expand(recs,rows,'train')
        a=training_order(items,random.Random(42),'balanced-task')
        b=training_order(items,random.Random(42),'balanced-task')
        self.assertEqual(a,b)
        tasks=Counter(items[i]['task'] for i in a)
        self.assertTrue(.45<tasks['action']/len(a)<.55)
        action_labels=Counter(items[i]['label'] for i in a if items[i]['task']=='action')
        self.assertLess(max(action_labels.values())/min(action_labels.values()),1.3)

    def test_challenge_is_disjoint_and_labels_have_local_evidence(self):
        recs,rows=challenge();validate(list(recs.values()),rows)
        original_recs,original=load_data()
        self.assertFalse(set(recs)&set(original_recs))
        self.assertFalse({r['utterance'] for r in rows}&{r['utterance'] for r in original})
        self.assertEqual(len(rows),68)
        for row in rows:
            if row['scenario'] in ['half','meta-negation','conditional','uncertain','ambiguous','future']:
                self.assertEqual(row['gold']['changes'],[])


if __name__=='__main__':unittest.main()

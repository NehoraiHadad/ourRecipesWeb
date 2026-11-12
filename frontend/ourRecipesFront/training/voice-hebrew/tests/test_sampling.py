"""Sampler balance, same-report opponents, data isolation and stable selection."""
from collections import Counter
from pathlib import Path
import random
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from corpus import ROOT,load_data,queries,digest
from engine import verify_manifest
from paired_sampling import PairedSampler
from sampling_data import build
from sampling_sweep import choose


class SamplingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory();cls.data,cls.audit=build(Path(cls.tmp.name)/'data')
        cls.recs,cls.rows=load_data(cls.data);cls.train=[r for r in cls.rows if r['split']=='train']
        cls.items=[{'query':q,'inputs':{'input_ids':[1,2]}} for row in cls.train for q in queries(cls.recs[row['recipe_id']],row,3)]

    @classmethod
    def tearDownClass(cls):cls.tmp.cleanup()

    def test_training_unchanged_and_holdout_state_valid(self):
        from focused_data import build as old_build
        with tempfile.TemporaryDirectory() as tmp:
            _,prior,_=old_build(Path(tmp)/'prior')
            self.assertEqual((prior/'train.jsonl').read_bytes(),(self.data/'train.jsonl').read_bytes())
        verify_manifest(self.data)
        self.assertEqual(len(self.train),6638)
        self.assertEqual(len([r for r in self.rows if r['split']=='test']),276)
        self.assertEqual(self.audit['query_conflicts']['3']['conflicting_effective_inputs'],0)

    def test_balanced_tasks_weighted_labels_and_matched_hard_pair(self):
        sampler=PairedSampler(self.items,self.train,random.Random(42));tasks=Counter();labels=Counter();families=Counter()
        for _ in range(4000):
            batch=sampler.batch()
            self.assertEqual([x['query']['task'] for x in batch],['intent']*4+['action']*4)
            anchor,negative=batch[4:6]
            self.assertEqual(anchor['query']['example_id'],negative['query']['example_id'])
            self.assertIn(anchor['query']['label'],('done','not_done'))
            self.assertEqual(negative['query']['label'],'not_mentioned')
            for item in batch:
                q=item['query'];tasks[q['task']]+=1
                if q['task']=='action':labels[q['label']]+=item['loss_weight']
                families[item['sampling_family']]+=1
        self.assertEqual(tasks['intent'],tasks['action'])
        for v in labels.values():self.assertAlmostEqual(v/sum(labels.values()),1/3,delta=.02)
        self.assertGreater(families['history-local'],500)
        self.assertGreater(families['history-foreign'],100)
        self.assertFalse(any('loss_weight' in item for item in self.items))

    def test_sampler_is_reproducible(self):
        a=PairedSampler(self.items,self.train,random.Random(17));b=PairedSampler(self.items,self.train,random.Random(17))
        def ids(s):return [[(x['query']['example_id'],x['query']['action_id']) for x in s.batch()] for _ in range(5)]
        self.assertEqual(ids(a),ids(b))

    def test_selection_rejects_a_good_mean_hiding_one_bad_seed(self):
        variants=[]
        for arm in ('control','sample','contrast'):
            for seed in (42,17):
                p,r=(.9,.7) if arm=='control' else ((.99,.95) if seed==42 else (.7,.95))
                if arm=='contrast':p,r=.93,.8
                variants.append({'arm':arm,'seed':seed,'report':{'validation_0_5':{'update_precision':p,'update_recall':r,'exact_rate':r}}})
        result=choose(variants)
        self.assertNotIn('sample',result['eligible_arms']);self.assertEqual(result['selected_arm'],'contrast')
        self.assertEqual(result['retained_seed'],42)


if __name__=='__main__':unittest.main()

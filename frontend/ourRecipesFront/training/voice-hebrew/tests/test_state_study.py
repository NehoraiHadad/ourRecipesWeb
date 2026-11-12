from pathlib import Path
import hashlib
import json
import random
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from state_data import authored
from state_sweep import breakdown
from state_input_probe import proposed_queries
from paired_sampling import PairedSampler
from colab_pilot import upload_warm_weights
from argparse import Namespace


class StateStudyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.recs,cls.rows=authored()

    def test_reference_truth_tracks_unique_current_target_or_clarifies(self):
        for row in self.rows:
            if row['evaluation_kind']!='state':continue
            recipe=self.recs[row['recipe_id']];mode=row['scenario'].split('-')[1]
            state=row['state'];candidates=[a for a in recipe['actions'] if a['step']==state['currentStep'] and ((a['id'] in state['completed']) if mode=='undo' else (a['id'] in state['remaining']))]
            if len(candidates)==1:
                self.assertEqual(row['gold']['intent'],'report');change=row['gold']['changes'][0]
                self.assertEqual(change['actionId'],candidates[0]['id']);self.assertEqual(change['done'],mode=='done')
            else:self.assertEqual(row['gold'],{'intent':'clarify','changes':[]})

    def test_each_counterfactual_group_has_eight_reports_four_clarifications(self):
        from collections import defaultdict,Counter
        groups=defaultdict(list)
        for r in self.rows:
            if r['counterfactual_group']:groups[r['counterfactual_group']].append(r)
        for rows in groups.values():
            self.assertEqual(len({r['utterance'] for r in rows}),1)
            self.assertEqual(Counter(r['gold']['intent'] for r in rows),{'report':8,'clarify':4})

    def test_sampling_opponents_ignore_added_state_context(self):
        rows=[r for r in self.rows if r['split']=='train'];base=[];rich=[]
        for r in rows[:184]:
            recipe=self.recs[r['recipe_id']]
            for q in proposed_queries(recipe,r):
                text='פעולה נבדקת: '+next(a['text'] for a in recipe['actions'] if a['id']==q['action_id']) if q['task']=='action' else q['context']
                base.append({'query':{**q,'context':text}});rich.append({'query':q,'sampling_context':text})
        a=PairedSampler(base,rows,random.Random(42));b=PairedSampler(rich,rows,random.Random(42))
        self.assertEqual(a.opponents,b.opponents)
        for _ in range(50):
            identity=lambda batch:[(v['query']['example_id'],v['query']['action_id'],v['loss_weight']) for v in batch]
            self.assertEqual(identity(a.batch()),identity(b.batch()))

    def test_binary_warm_upload_streams_only_model_not_key(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'model.safetensors';p.write_bytes(b'model fixture');calls=[]
            def fake(argv,**kw):
                data=kw['stdin'].read();calls.append((argv,data))
                return subprocess.CompletedProcess(argv,0,'OURRECIPES_WARM='+json.dumps({'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}),'')
            with patch('colab_pilot.subprocess.run',side_effect=fake):upload_warm_weights(Namespace(warm_weights=str(p),cli='fake-colab',auth_provider=None),'ourrecipes-state-test','/private/key')
            self.assertEqual(calls[0][1],b'model fixture');self.assertNotIn('upload',calls[0][0]);self.assertIn('--',calls[0][0])

    def test_group_score_requires_all_states_correct(self):
        rows=[r for r in self.rows if r['counterfactual_group']][:12]
        cases=[{'id':r['id'],'gold':r['gold'],'actual':r['gold'],'exact':True} for r in rows]
        self.assertEqual(breakdown(rows,{'cases':cases})['groups']['rate'],1)
        cases[0]['exact']=False
        self.assertEqual(breakdown(rows,{'cases':cases})['groups']['rate'],0)


if __name__=='__main__':unittest.main()

from collections import Counter
from pathlib import Path
import random
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from state_data import authored
from corpus import queries,load_data
from state_sampling import StateSampler
try:import torch
except ImportError:torch=None


class FocusedSamplingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        r,x=authored();r0,x0=load_data();r.update(r0);x+=x0
        cls.rows=[v for v in x if v['split']=='train'];cls.items=[{'query':q} for row in cls.rows for q in queries(r[row['recipe_id']],row,3)]

    def test_every_batch_has_half_state_and_both_tasks_balanced(self):
        sampler=StateSampler(self.items,self.rows,random.Random(42));counts=Counter();weighted=Counter()
        for _ in range(5000):
            batch=sampler.batch();self.assertEqual(Counter(v['sampling_source'] for v in batch),{'state':4,'retention':4})
            self.assertEqual(Counter(v['query']['task'] for v in batch),{'intent':4,'action':4})
            self.assertEqual(batch[4]['query']['example_id'],batch[5]['query']['example_id'])
            self.assertNotEqual(batch[4]['query']['label'],'not_mentioned');self.assertEqual(batch[5]['query']['label'],'not_mentioned')
            for v in batch:
                q=v['query'];counts[q['task']]+=1;weighted[q['task'],q['label']]+=v['loss_weight']
        for task,labels in [('intent',['report','clarify','next','missed','advice']),('action',['done','not_done','not_mentioned'])]:
            total=sum(weighted[task,label] for label in labels)
            for label in labels:self.assertAlmostEqual(weighted[task,label]/total,1/len(labels),delta=.015)

    @unittest.skipIf(torch is None,'Requires ML venv')
    def test_intent_loss_honors_declared_stratum_weight(self):
        from span_pilot import training_loss
        for weight in (4/7,2.):
            values=torch.zeros(1,1,8,requires_grad=True);targets=torch.tensor([[3]])
            items=[{'query':{'task':'intent'},'loss_weight':weight}]
            loss=training_loss(values,targets,items,'context-state-v4',torch.ones(8))
            self.assertAlmostEqual(float(loss.detach()),weight*__import__('math').log(8),places=6)


if __name__=='__main__':unittest.main()

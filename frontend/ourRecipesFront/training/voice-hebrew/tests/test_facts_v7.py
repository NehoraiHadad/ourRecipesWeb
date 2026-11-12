import sys,unittest,copy
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from facts_v7 import *

class FactsTests(unittest.TestCase):
 def test_split_groups_and_polarity(self):
  d=build()['splits'];groups={}
  for split,rows in d.items():
   for r in rows:
    self.assertIn(r['label'],range(15))
    self.assertEqual(groups.setdefault(r['group'],split),split)
   self.assertEqual({r['label'] for r in rows},set(range(15)))
 def test_complete_cross_product_and_no_mutation(self):
  for ref in REFS[:2]:
   state=context(ref,'unique-a');before=copy.deepcopy(state)
   for status in STATUS[:2]:
    result=apply((ref,'asserted',status),state,state['recipe_id'],'v1')
    self.assertEqual(result['effective_changes'],int((ref=='remaining')==(status=='complete')))
   self.assertEqual(before,state)
 def test_partial_uncertain_meta_and_ambiguous(self):
  for fact in JOINT[:14]:
   for variant in ('unique-a','ambiguous','zero'):
    state=context(fact[0],variant);r=apply(fact,state,state['recipe_id'],'v1')
    if fact[1]!='asserted' or fact[2]=='partial' or variant!='unique-a':self.assertFalse(r['changes'])
 def test_stale_and_partition(self):
  s=context('marked','unique-a');f=('marked','asserted','incomplete')
  self.assertEqual(apply(f,s,'other','v1')['kind'],'reject')
  self.assertEqual(apply(f,s,s['recipe_id'],'v2')['kind'],'reject')
  s['remaining']=[]
  with self.assertRaises(ValueError):apply(f,s,s['recipe_id'],'v1')
 def test_noop_does_not_inflate_transition(self):
  rows=[{'id':'a','text':'x','label':JOINT.index(('marked','asserted','complete'))}]
  m=score(rows,[(rows[0]['label'],1.)],.99)
  self.assertEqual(m['true_proposals'],2);self.assertEqual(m['noop_confirmations'],2);self.assertEqual(m['expected_effective'],0)
 def test_actual_tiny_gradients(self):
  import torch
  from transformers import BertConfig,BertForTokenClassification
  from facts_v7_study import Head,setup
  from certainty_adapter import representation,disabled
  torch.set_num_threads(2)
  for arm in ('flat-narrow','factor-narrow','factor-wide','factor-full'):
   m=BertForTokenClassification(BertConfig(vocab_size=32,hidden_size=768,num_hidden_layers=2,num_attention_heads=12,intermediate_size=32,num_labels=8)).eval()
   setup(m,arm);h=Head(arm.startswith('flat'))
   x={'input_ids':torch.tensor([[1,2,3,4]]),'token_type_ids':torch.tensor([[0,0,1,1]]),'attention_mask':torch.ones(1,4,dtype=torch.long)}
   f=representation(m,x,4);p=h.logprobs(f).exp();self.assertAlmostEqual(float(p.sum().detach()),1.,places=5)
   h.loss(f,torch.tensor([3])).backward();self.assertTrue(any(p.grad is not None and p.grad.abs().sum()>0 for p in m.parameters() if p.requires_grad))
   self.assertFalse(any(p.grad is not None for p in m.parameters() if not p.requires_grad))

if __name__=='__main__':unittest.main()

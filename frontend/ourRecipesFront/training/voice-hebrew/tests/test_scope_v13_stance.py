import json,math,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scope_v13_data import build
from scope_v13_stance import StanceHead,calibrate,veto

class StanceTests(unittest.TestCase):
 def test_new_operator_families_and_text_are_held_out(self):
  d=build();groups={};texts=set()
  for split,rows in d['splits'].items():
   for r in rows:
    self.assertNotIn(r['text'],texts);texts.add(r['text'])
    if split!='natural_test':self.assertEqual(groups.setdefault(r['operator_family'],split),split)
  self.assertEqual(len(d['splits']['test']),384);self.assertEqual(len(d['splits']['natural_test']),48)
  self.assertEqual(d['consumed_v7_reference_rows_in_train'],192)
 def test_partial_assertion_is_not_uncertainty(self):
  rows=build()['splits']['train'];selected=[r for r in rows if r['semantics'][1]=='asserted' and r['semantics'][2]=='partial']
  self.assertGreater(len(selected),100);self.assertTrue(all(r['allow']==1 for r in selected))
 def test_veto_cannot_introduce_or_rebind_a_report(self):
  for kind in ('reference','legacy','readonly','clarify'):
   for label in range(15):
    for p in (0.,.99,1.,float('nan'),float('inf')):
     result=veto((kind,label),p,.95);self.assertEqual(result[1],label)
     if kind!='reference':self.assertEqual(result,(kind,label))
     elif not math.isfinite(p) or p<.95:self.assertEqual(result,('clarify',label))
 def test_rejecting_everything_does_not_qualify(self):
  rows=[{'allow':0},{'allow':1}];self.assertFalse(calibrate(rows,[.99,.5])['metrics']['passed'])
 def test_head_gradients_and_shared_reference_parity(self):
  import torch
  from unittest.mock import patch
  from scope_v8_factor_head import FactorHead
  from scope_v9_hierarchy import raw
  from scope_v13_features import records_from_features
  torch.set_num_threads(2);x=torch.randn(5,3072)
  for arm in ('linear','mlp64'):
   h=StanceHead(arm);loss=torch.nn.functional.cross_entropy(h(x),torch.tensor([0,1,0,1,0]));loss.backward();self.assertTrue(any(p.grad is not None and p.grad.abs().sum()>0 for p in h.parameters()));self.assertFalse(x.requires_grad)
  head=FactorHead().eval()
  with patch('adapter_study.features',return_value=x):expected=raw(None,None,head,['x']*5)
  self.assertEqual(records_from_features(head,x),expected)

if __name__=='__main__':unittest.main()

import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class FactorTests(unittest.TestCase):
 def test_invalid_mass_is_not_redistributed(self):
  import torch
  from scope_v8_factor_head import joint_logprobs
  torch.manual_seed(7);z=torch.randn(20,11);raw=joint_logprobs(z);p=raw.exp();conditional=raw.softmax(-1)
  self.assertTrue(bool((p.sum(-1)<=1.000001).all()));self.assertTrue(bool((p<=conditional+1e-7).all()));self.assertTrue(torch.equal(p.argmax(-1),conditional.argmax(-1)))
  # OTHER / asserted / complete is invalid: strong agreement on an invalid
  # triple must not be forced into a confident valid report.
  z=torch.tensor([[-10.,-10.,10.,10.,-10.,-10.,-10.,10.,-10.,-10.,-10.]])
  self.assertLess(float(joint_logprobs(z).exp().max()),.01)
 def test_actual_factor_loss_gradients(self):
  import torch
  from scope_v8_factor_head import FactorHead
  torch.set_num_threads(2);head=FactorHead();x=torch.randn(3,3072,requires_grad=True);head.loss(x,torch.tensor([0,7,12])).backward()
  self.assertGreater(float(x.grad.abs().sum()),0)
  self.assertTrue(bool(torch.isfinite(head.logprobs(x)).all()))

if __name__=='__main__':unittest.main()

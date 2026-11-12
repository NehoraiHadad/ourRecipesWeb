"""Real tensor gradients for the candidate-ranking objective (no model download)."""
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
try:import torch
except ImportError:torch=None
from paired_sampling import margin_loss


@unittest.skipIf(torch is None,'Run with the existing ML venv for tensor checks')
class MarginTests(unittest.TestCase):
    def test_gradient_separates_supported_from_absent_for_both_polarities(self):
        for label in ('done','not_done'):
            logits=torch.zeros(2,1,8,requires_grad=True)
            items=[{'query':{'task':'action','example_id':'same','label':label}},
                   {'query':{'task':'action','example_id':'same','label':'not_mentioned'}}]
            loss=margin_loss(logits,items);loss.backward()
            self.assertGreater(float(loss.detach()),0)
            self.assertLess(float(logits.grad[0,0,0]),0)
            self.assertGreater(float(logits.grad[0,0,2]),0)
            self.assertGreater(float(logits.grad[1,0,0]),0)
            self.assertLess(float(logits.grad[1,0,2]),0)

    def test_different_reports_and_intents_are_never_contrasted(self):
        logits=torch.zeros(3,1,8,requires_grad=True)
        items=[{'query':{'task':'action','example_id':'a','label':'done'}},
               {'query':{'task':'action','example_id':'b','label':'not_mentioned'}},
               {'query':{'task':'intent','example_id':'a','label':'report'}}]
        loss=margin_loss(logits,items);loss.backward()
        self.assertEqual(float(loss.detach()),0)
        self.assertTrue(torch.equal(logits.grad,torch.zeros_like(logits)))


if __name__=='__main__':unittest.main()

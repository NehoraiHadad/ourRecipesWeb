"""Factored CE, valid-joint *product* confidence; invalid mass stays abstention.
Not a calibrated probability claim. Same weights/argmax as normalized decoder,
but do not condition confidence on having produced a valid attribute triple.
"""
import torch
from facts_v7_study import Head as OriginalHead,ATTR
from facts_v7 import JOINT


def joint_logprobs(logits):
 parts=[p.log_softmax(-1) for p in logits.split((3,4,4),dim=-1)]
 return torch.stack([sum(parts[i][:,ATTR[i].index(v)] for i,v in enumerate(fact)) for fact in JOINT],dim=-1)

class FactorHead(OriginalHead):
 def __init__(self,flat=False):
  if flat:raise ValueError('Factorized product head only')
  super().__init__(False)
 def logprobs(self,x):return joint_logprobs(self(x))

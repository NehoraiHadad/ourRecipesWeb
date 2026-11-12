"""Exploratory feasibility on saved REAL T4 calibration predictions only.
Two learned heads must agree on commitment/completion; wide head resolves
reference. No text rules, new training, test opening or promotion here.
"""
import json
from corpus import ROOT,digest
from scope_v8_data import DATA
from facts_v7 import JOINT,score


def combine(wide,narrow,narrow_threshold):
 out=[]
 for (i,p),(j,q) in zip(wide,narrow):
  fact=JOINT[i];agreed=JOINT[j][1:]==fact[1:]
  if fact[1]=='asserted' and fact[2] in ('complete','incomplete') and (not agreed or q<narrow_threshold):p=0.
  out.append((i,p))
 return out


def calibrate(rows,wide,narrow):
 grid=[]
 for wt in (.5,.7,.85,.95,.99):
  for nt in (.5,.7,.85,.95,.99):
   pred=combine(wide,narrow,nt);m=score(rows,pred,wt);fallback=sum(r['label']!=14 and i==14 and p>=wt for r,(i,p) in zip(rows,pred))
   key=(m['false_proposals']==0 and fallback==0,m['correct_effective']+m['correct_corrections']-5*m['false_proposals'],wt,nt)
   grid.append({'wide_threshold':wt,'narrow_threshold':nt,'key':key,'metrics':m,'unmeasured_reference_fallback':fallback})
 return max(grid,key=lambda g:tuple(g['key'])),grid


def run():
 folder=ROOT/'runs/colab-scope-v8/recovered/study';rows=json.loads(DATA.read_text())['splits']['calibration'];w=json.loads((folder/'flat-wide-42/result.json').read_text());n=json.loads((folder/'flat-narrow-42/result.json').read_text())
 chosen,grid=calibrate(rows,w['calibration']['predictions'],n['calibration']['predictions']);m=chosen['metrics'];passed=m['false_proposals']==0 and m['effective_recall']>=.75 and m['correction_recall']>=.75 and chosen['unmeasured_reference_fallback']==0
 proof={'scope':'Exploratory feasibility on already-used calibration; saved actual T4 predictions, no NN simulation. No test or promotion. If feasible, requires actual consumed-transfer/guard/CPU validation and prospective17/73 replication before tests.',
 'policy':'Wide reference/decision, veto actionable assertion unless narrow agrees on commitment+completion with confidence>=narrow_threshold; reference may disagree. OTHER route must be measured separately.',
 'chosen':chosen,'grid':grid,'calibration_gate_passed':passed,'new_test_inference':False,'source_sha256':digest((ROOT/'scope_v8_agreement.py').read_bytes())}
 (ROOT/'verification/scope-v8-agreement-feasibility-20261112.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'passed':passed,'wide_threshold':chosen['wide_threshold'],'narrow_threshold':chosen['narrow_threshold'],'metrics':{k:v for k,v in m.items() if k!='failures'}}));return proof

if __name__=='__main__':run()

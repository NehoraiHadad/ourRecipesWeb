"""Small dedicated commitment heads; permission can only veto a base proposal."""
import math,torch


class StanceHead(torch.nn.Module):
 def __init__(self,arm):
  super().__init__();self.arm=arm
  if arm=='linear':self.net=torch.nn.Sequential(torch.nn.LayerNorm(3072),torch.nn.Linear(3072,2))
  elif arm=='mlp64':self.net=torch.nn.Sequential(torch.nn.LayerNorm(3072),torch.nn.Linear(3072,64),torch.nn.GELU(),torch.nn.Dropout(.1),torch.nn.Linear(64,2))
  else:raise ValueError('Unknown stance architecture')
 def forward(self,x):return self.net(x)


def probabilities(head,x):
 head.eval()
 with torch.no_grad():return head(x).softmax(-1)[:,1].cpu().tolist()


def metrics(rows,p,threshold):
 if len(rows)!=len(p):raise ValueError('Unaligned stance rows')
 expected=sum(r['allow'] for r in rows);negative=len(rows)-expected;tp=sum(r['allow']==1 and v>=threshold for r,v in zip(rows,p));fp=sum(r['allow']==0 and v>=threshold for r,v in zip(rows,p))
 return {'examples':len(rows),'asserted_examples':expected,'not_asserted_examples':negative,'asserted_allowed':tp,'unsafe_allowed':fp,'asserted_recall':tp/expected if expected else 0.,'not_asserted_recall':1-fp/negative if negative else 0.,'passed':fp==0 and expected>0 and tp/expected>=.9}


def calibrate(rows,p):
 grid=[]
 for t in [i/100 for i in range(50,100)]+[2.]:
  m=metrics(rows,p,t);grid.append({'threshold':t,'metrics':m,'key':(m['passed'],m['unsafe_allowed']==0,m['asserted_allowed'],t)})
 return max(grid,key=lambda v:tuple(v['key']))


def veto(decision,p,threshold):
 kind,label=decision
 invalid=not math.isfinite(p) or not 0<=p<=1
 return ('clarify',label) if kind=='reference' and (invalid or p<threshold) else decision

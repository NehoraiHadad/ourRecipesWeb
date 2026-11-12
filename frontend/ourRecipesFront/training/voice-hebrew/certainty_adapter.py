"""Prepared LoRA mechanics for a later quality pilot; no training job/app hooks."""
from contextlib import contextmanager
import math
import torch


class AdapterLinear(torch.nn.Module):
    def __init__(self,base,rank=8,alpha=8.):
        super().__init__()
        if not isinstance(base,torch.nn.Linear) or not isinstance(rank,int) or isinstance(rank,bool) or rank<1:
            raise ValueError('Require linear layer and positive integer rank')
        if not isinstance(alpha,(int,float)) or isinstance(alpha,bool) or not math.isfinite(alpha) or alpha<=0:
            raise ValueError('Require positive finite alpha')
        self.base=base;self.rank=rank;self.scale=alpha/rank;self.enabled=True
        for p in base.parameters():p.requires_grad_(False)
        self.down=torch.nn.Linear(base.in_features,rank,bias=False,device=base.weight.device,dtype=base.weight.dtype)
        self.up=torch.nn.Linear(rank,base.out_features,bias=False,device=base.weight.device,dtype=base.weight.dtype)
        torch.nn.init.kaiming_uniform_(self.down.weight,a=math.sqrt(5));torch.nn.init.zeros_(self.up.weight)

    def forward(self,x):
        baseline=self.base(x)
        return baseline+self.scale*self.up(self.down(x)) if self.enabled else baseline


def modules(model):
    return {name:module for name,module in model.named_modules() if isinstance(module,AdapterLinear)}


def representation(model,encoded,sep_token_id):
    """Differentiable positional pooling; caller controls train/eval and gradients.

    The frozen-head feature helper uses inference_mode and must not be used
    to train adapters. This function deliberately keeps the autograd graph.
    """
    h=model.bert(**encoded).last_hidden_state
    mask=(encoded['token_type_ids']==1)&encoded['attention_mask'].bool()&(encoded['input_ids']!=sep_token_id)
    first=mask&(mask.long().cumsum(1)<=8)
    last=mask&(mask.flip(1).long().cumsum(1).flip(1)<=8)
    def mean(selected):
        selected=selected.unsqueeze(-1)
        return (h*selected).sum(1)/selected.sum(1).clamp_min(1)
    return torch.cat([h[:,0],mean(mask),mean(first),mean(last)],dim=1)


def install(model,rank=8,last_layers=2):
    if modules(model):raise ValueError('Adapters already installed')
    layers=model.bert.encoder.layer
    if not isinstance(last_layers,int) or isinstance(last_layers,bool) or not 1<=last_layers<=len(layers):
        raise ValueError('Invalid number of adapted layers')
    if not isinstance(rank,int) or isinstance(rank,bool) or rank<1:raise ValueError('Invalid rank')
    targets=[(layer.attention.self,name) for layer in layers[-last_layers:] for name in ('query','value')]
    if any(not isinstance(getattr(parent,name),torch.nn.Linear) for parent,name in targets):raise ValueError('Unsupported attention projection')
    for p in model.parameters():p.requires_grad_(False)
    for parent,name in targets:setattr(parent,name,AdapterLinear(getattr(parent,name),rank,rank))
    return {'target_modules':list(modules(model)), 'rank':rank, 'last_layers':last_layers,
        'trainable_parameters':sum(p.numel() for p in model.parameters() if p.requires_grad),
        'scope':'Only query/value low-rank adapters; existing body and legacy token head remain frozen'}


@contextmanager
def disabled(model):
    active=modules(model);before={name:m.enabled for name,m in active.items()}
    try:
        for module in active.values():module.enabled=False
        yield
    finally:
        for name,module in active.items():module.enabled=before[name]


def export(model):
    return {name:{'rank':m.rank,'scale':m.scale,'down':m.down.weight.detach().cpu().clone(),'up':m.up.weight.detach().cpu().clone()} for name,m in modules(model).items()}


def restore(model,payload):
    active=modules(model)
    if set(active)!=set(payload):raise ValueError('Adapter target mismatch')
    # Validate every tensor before mutation; no partial loads.
    for name,m in active.items():
        item=payload[name]
        if set(item)!={'rank','scale','down','up'} or item['rank']!=m.rank or item['scale']!=m.scale:raise ValueError('Adapter config mismatch')
        for key,weight in [('down',m.down.weight),('up',m.up.weight)]:
            value=item[key]
            if not isinstance(value,torch.Tensor) or value.shape!=weight.shape or not torch.isfinite(value).all():raise ValueError('Invalid adapter tensor')
    with torch.no_grad():
        for name,m in active.items():
            m.down.weight.copy_(payload[name]['down']);m.up.weight.copy_(payload[name]['up'])

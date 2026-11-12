"""Frozen token features: CLS, whole utterance, first8 and last8 subword tokens."""


def build_head():
    import torch
    return torch.nn.Sequential(torch.nn.LayerNorm(3072),torch.nn.Linear(3072,128),torch.nn.GELU(),torch.nn.Dropout(.1),torch.nn.Linear(128,5))


def features(model,tok,texts):
    import torch
    output=[];model.eval()
    for off in range(0,len(texts),16):
        batch=texts[off:off+16]
        encoded=tok(['משמעות של דיווח התקדמות בבישול']*len(batch),batch,padding=True,truncation=False,return_tensors='pt')
        if encoded['input_ids'].shape[1]>512:raise ValueError('No silent truncation')
        with torch.inference_mode():h=model.bert(**encoded).last_hidden_state
        mask=(encoded['token_type_ids']==1)&encoded['attention_mask'].bool()&(encoded['input_ids']!=tok.sep_token_id)
        first=mask&(mask.long().cumsum(1)<=8)
        last=mask&(mask.flip(1).long().cumsum(1).flip(1)<=8)
        def mean(selected):
            selected=selected.unsqueeze(-1)
            return (h*selected).sum(1)/selected.sum(1).clamp_min(1)
        output.append(torch.cat([h[:,0],mean(mask),mean(first),mean(last)],dim=1).float())
    return torch.cat(output)

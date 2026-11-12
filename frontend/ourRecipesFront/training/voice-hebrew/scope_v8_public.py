"""Optional original MLM backbone control; pinned public files, no custom code.
Semantic encoder only. Legacy recipe extraction still requires original f053.
"""
import hashlib
from pathlib import Path
REPO='dicta-il/dictabert'
REVISION='8884c6db002aba4002ee638fe4070c92e9ffbbf1'
WEIGHT_SHA='a1c1a5fcbd7e356083f19963397b27615e174d324a5e7a03b38e39c6bb28fbd8'
WEIGHT_BYTES=737927424


def obtain(cache):
 from huggingface_hub import snapshot_download
 path=Path(snapshot_download(REPO,revision=REVISION,cache_dir=str(cache),token=False,allow_patterns=['model.safetensors','config.json','tokenizer.json','tokenizer_config.json','special_tokens_map.json','vocab.txt','README.md']))
 weight=path/'model.safetensors';assert weight.stat().st_size==WEIGHT_BYTES
 with weight.open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==WEIGHT_SHA
 return path

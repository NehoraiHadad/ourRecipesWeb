"""Verify every supplement member and optionally test a weight-free offline overlay."""
import argparse,hashlib,json,os,re,subprocess,sys,tempfile,zipfile
from pathlib import Path
root=Path(__file__).resolve().parent
parser=argparse.ArgumentParser();parser.add_argument('--verify-only',action='store_true');args=parser.parse_args()
packet=root/'dist/ourRecipes-hebrew-stance-continuation-20261112.zip'
with zipfile.ZipFile(packet) as z:
 assert z.testzip() is None
 hashes=json.loads(z.read('supplement-sha256.json'))
 for n,h in hashes.items():assert hashlib.sha256(z.read(n)).hexdigest()==h,n
 assert len(hashes)+1==len(z.namelist())
 assert not any(n.endswith('.safetensors') or 'usage-private' in n or 'ssh-voice-pilot' in n for n in z.namelist())
if args.verify_only:
 print(json.dumps({'members_sha256_verified':len(hashes),'crc_verified':True}));sys.exit(0)
with tempfile.TemporaryDirectory(prefix='ourrecipes-stance-archive-') as temp:
 for archive in (root/'dist/ourRecipes-hebrew-model-research-scope-20261112.zip',packet):
  with zipfile.ZipFile(archive) as z:
   for n in z.namelist():
    if Path(n).suffix not in ('.pt','.safetensors'):
     assert not Path(n).is_absolute() and '..' not in Path(n).parts
     z.extract(n,temp)
 assert not list(Path(temp).rglob('*.pt')) and not list(Path(temp).rglob('*.safetensors'))
 with (root/'verification/stance-archive-unit-tests-20261112.txt').open('w') as log:
  p=subprocess.run([sys.executable,'-m','unittest','discover','-s','tests','-v'],cwd=temp,env={**os.environ,'HF_HUB_OFFLINE':'1','TRANSFORMERS_OFFLINE':'1'},stdout=log,stderr=subprocess.STDOUT)
 assert p.returncode==0
 count=int(re.search(r'Ran (\d+) tests', (root/'verification/stance-archive-unit-tests-20261112.txt').read_text()).group(1))
 report={'supplement_members_sha256_verified':len(hashes),'crc_verified':True,'offline_parent_plus_supplement_tests':count,'test_returncode':p.returncode,'weights_present_in_test_extraction':False,'inference_quality_verified_by_this_check':False,'credentials_audio_private_usage_included':False}
 (root/'verification/stance-archive-verification-20261112.json').write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps(report))

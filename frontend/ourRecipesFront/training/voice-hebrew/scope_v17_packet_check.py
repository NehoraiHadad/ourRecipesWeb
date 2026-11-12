"""Check packet hashes and run new tests from a weight-free offline overlay."""
import hashlib,json,os,re,subprocess,sys,tempfile,zipfile
from pathlib import Path
from corpus import ROOT,digest
packet=ROOT/'dist/ourRecipes-hebrew-capacity-diagnosis-20261112.zip'
with zipfile.ZipFile(packet) as z:
 assert z.testzip() is None;manifest=json.loads(z.read('packet-sha256.json'));assert len(manifest)+1==len(z.namelist())
 for name,expected in manifest.items():assert digest(z.read(name))==expected
 parents=json.loads(z.read('research-packet.json'))['parent_sha256']
for name,expected in parents.items():
 with (ROOT/'dist'/name).open('rb') as file:assert hashlib.file_digest(file,'sha256').hexdigest()==expected
with tempfile.TemporaryDirectory(prefix='ourrecipes-capacity-packet-') as temp:
 for archive in [ROOT/'dist'/name for name in parents]+[packet]:
  with zipfile.ZipFile(archive) as z:
   for name in z.namelist():
    assert not Path(name).is_absolute() and '..' not in Path(name).parts
    if Path(name).suffix not in ('.pt','.safetensors'):z.extract(name,temp)
 assert not list(Path(temp).rglob('*.pt')) and not list(Path(temp).rglob('*.safetensors'))
 log=ROOT/'verification/capacity-archive-tests-20261112.txt'
 with log.open('w') as output:
  result=subprocess.run([sys.executable,'-m','unittest','discover','-s','tests','-p','test_scope_v17_audit.py','-v'],cwd=temp,stdout=output,stderr=subprocess.STDOUT,env={**os.environ,'HF_HUB_OFFLINE':'1','TRANSFORMERS_OFFLINE':'1'})
 assert result.returncode==0;count=int(re.search(r'Ran (\d+) tests',log.read_text()).group(1));assert count==4
 proof={'crc_verified':True,'member_sha256_verified':len(manifest),'parent_archives_sha256_verified':parents,'offline_archive_tests_passed':count,'weights_present_in_extraction':False,'inference_quality_claim':False,'packet_sha256':digest(packet.read_bytes())}
 (ROOT/'verification/capacity-archive-verification-20261112.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof))

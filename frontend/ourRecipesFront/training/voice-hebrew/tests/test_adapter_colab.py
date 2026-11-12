"""Mocked resource guards only; no CLI allocation or quality evidence."""
from argparse import Namespace
from pathlib import Path
import json,sys,tempfile,unittest,zipfile
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import adapter_colab
from corpus import digest


class AdapterColabTests(unittest.TestCase):
 def setup_files(self,root,bad=False):
  (root/'verification').mkdir();warm=root/'model.safetensors';warm.write_bytes(b'mock weights')
  plan={'source_sha256':{},'body_sha256':digest(warm.read_bytes())};(root/'verification/adapter-v6-plan-20261112.json').write_text(json.dumps(plan))
  bundle=root/'packet.zip'
  with zipfile.ZipFile(bundle,'w') as z:z.writestr('verification/adapter-v6-plan-20261112.json',json.dumps({} if bad else plan))
  return Namespace(session='ourrecipes-unit-adapter',warm_weights=str(warm),bundle=str(bundle),output=str(root/'out'),ssh_identity='unused',cli='colab-mock')
 def test_bad_bundle_is_rejected_before_allocation(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);args=self.setup_files(root,True)
   with patch.object(adapter_colab,'ROOT',root),patch.object(adapter_colab.subprocess,'run') as run:
    with self.assertRaises(AssertionError):adapter_colab.run(args)
    run.assert_not_called()
 def test_allocation_failure_still_unwinds_through_named_cleanup(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);args=self.setup_files(root);calls=[]
   def command(argv,**kw):
    calls.append(argv);failed=argv[1]=='new'
    return Namespace(returncode=int(failed),stdout='mock balance',stderr='unavailable' if failed else '')
   with patch.object(adapter_colab,'ROOT',root),patch.object(adapter_colab.subprocess,'run',side_effect=command):
    with self.assertRaises(RuntimeError):adapter_colab.run(args)
   self.assertIn(['colab-mock','stop','-s','ourrecipes-unit-adapter'],calls)
   self.assertFalse(any('ssh' in x for x in calls))


if __name__=='__main__':unittest.main()

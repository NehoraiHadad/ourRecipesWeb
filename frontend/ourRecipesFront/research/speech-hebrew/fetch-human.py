from pathlib import Path
import json,csv,io,tarfile,urllib.request,hashlib,wave,subprocess
base=Path('/dev/shm/ourrecipes-speech-models')
rows=list(csv.reader(io.StringIO((base/'fleurs-he-test.tsv').read_text()),delimiter='\t',quoting=csv.QUOTE_NONE))
assert all(len(r)==7 for r in rows if r)
selected=[];ids=set();counts={}
for row in rows:
 if not row:continue
 gender=row[6];seconds=int(row[5])/16000
 if 3<=seconds<=12 and row[0] not in ids and counts.get(gender,0)<6:
  selected.append({'id':'fleurs-'+row[1][:-4],'filename':row[1],'text':row[3],'raw_text':row[2],'source_id':row[0],'gender':gender,'seconds_tsv':seconds});ids.add(row[0]);counts[gender]=counts.get(gender,0)+1
 if len(selected)==12:break
# Some language splits contain one recorded gender only. Fill deterministically,
# without inspecting recognition results, rather than silently claiming12 clips.
for row in rows:
 if len(selected)==12:break
 if not row:continue
 seconds=int(row[5])/16000
 if 3<=seconds<=12 and row[0] not in ids:
  gender=row[6]
  selected.append({'id':'fleurs-'+row[1][:-4],'filename':row[1],'text':row[3],'raw_text':row[2],'source_id':row[0],'gender':gender,'seconds_tsv':seconds});ids.add(row[0]);counts[gender]=counts.get(gender,0)+1
assert len(selected)==12
folder=base/'human';folder.mkdir(exist_ok=True);refs={r['filename']:r for r in selected};needed=set(refs);seen=set()
url='https://huggingface.co/datasets/google/fleurs/resolve/70bb2e84b976b7e960aa89f1c648e09c59f894dd/data/he_il/audio/test.tar.gz'
with urllib.request.urlopen(url,timeout=120) as response,tarfile.open(fileobj=response,mode='r|gz') as archive:
 for entry in archive:
  name=Path(entry.name).name
  if entry.isfile() and name in needed:
   raw=archive.extractfile(entry).read();(folder/name).write_bytes(raw)
   probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','stream=sample_rate,channels,duration,codec_name','-of','json',str(folder/name)]))['streams'][0]
   refs[name].update(sample_rate=int(probe['sample_rate']),channels=probe['channels'],seconds_probe=float(probe['duration']),codec=probe['codec_name'])
   assert abs(refs[name]['seconds_probe']-refs[name]['seconds_tsv'])<.001
   refs[name].update(bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest());seen.add(name)
   print('Humanclip',len(seen),name,flush=True)
   if seen==needed:break
assert seen==needed
out={'dataset':'google/fleurs','revision':'70bb2e84b976b7e960aa89f1c648e09c59f894dd','license':'CC-BY-4.0','url':url,'selection':'Before inference: first distinct transcriptIDs in TSV order with3..12s, initially up to6 per recorded gender; fill to12 in TSV order if gender coverage unavailable. No lexical filtering. TSV QUOTE_NONE.','gender_counts':counts,'records':selected,'scope':'Public human read speech, not user recordings, not kitchen conversations; possible ASR training overlap unknown.'}
Path('research/speech-hebrew/evidence/human-fixtures.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print('Selectedhuman',len(selected),counts,flush=True)

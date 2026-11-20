// Replay the frozen exporter in scratch space, preserving published evidence.
import {readFile,writeFile,mkdir,mkdtemp,symlink,rm,stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const DIR=process.env.SPEECH_PCM_DIR||'/dev/shm/ourrecipes-speech-decoder-input';
const frozen=JSON.parse(await readFile(path.join(ROOT,'evidence/input-reconstruction.json'),'utf8'));
const check=async()=>{
 for(const row of frozen.records){const bytes=await readFile(path.join(DIR,row.file));assert.equal(bytes.length,row.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);}
 const manifest=JSON.parse(await readFile(path.join(DIR,'manifest.json'),'utf8'));
 assert.equal(manifest.allInputHashesMatch,true);assert.equal(manifest.records.length,170);
 for(let i=0;i<170;i++){assert.equal(manifest.records[i].id,frozen.records[i].id);assert.equal(manifest.records[i].sha256,frozen.records[i].sha256);}
};
let exists=false;try{await stat(DIR);exists=true;}catch(error){if(error.code!=='ENOENT')throw error;}
if(exists){await check();console.log('Verified existing170 exact PCM inputs');}
else{
 const scratch=await mkdtemp('/dev/shm/ourrecipes-pcm-replay-');
 try{
  const child=path.join(scratch,'improvements');await mkdir(path.join(child,'evidence'),{recursive:true});
  await writeFile(path.join(child,'export-pcm.mjs'),await readFile(path.join(ROOT,'export-pcm.mjs')));
  for(const name of ['metrics.mjs','cases.json','evidence'])await symlink(path.join(ROOT,'..',name),path.join(scratch,name));
  await symlink(path.resolve(ROOT,'../../..','node_modules'),path.join(scratch,'node_modules'));
  execFileSync(process.execPath,[path.join(child,'export-pcm.mjs')],{env:{...process.env,SPEECH_PCM_DIR:DIR},stdio:'inherit'});
  await check();console.log('Restored170 exact PCM inputs; published manifest preserved');
 }finally{await rm(scratch,{recursive:true,force:true});}
}

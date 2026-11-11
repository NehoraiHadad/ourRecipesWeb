// Real browser tokenizer parity. Dependency lives in an isolated dev directory;
// no CDN or text/model calls are allowed during this check.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const [modelArg,fixtureArg,moduleArg]=process.argv.slice(2);
if(!moduleArg)throw new Error('Usage: node tokenizer-smoke.mjs MODEL_DIR FIXTURES_JSON TOKENIZERS_MJS');
const model=path.resolve(modelArg),fixtureFile=path.resolve(fixtureArg),moduleFile=path.resolve(moduleArg);
const fixtures=JSON.parse(await readFile(fixtureFile,'utf8'));
const routes={'/tokenizers.mjs':moduleFile,'/tokenizer.json':path.join(model,'tokenizer.json'),'/tokenizer_config.json':path.join(model,'tokenizer_config.json')};
const server=createServer(async(req,res)=>{
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="he"><title>Hebrew tokenizer parity</title></html>');return;}
  const file=routes[req.url];if(!file){res.writeHead(404);res.end();return;}
  try{const info=await stat(file);res.setHeader('Content-Length',info.size);res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':'application/json');createReadStream(file).pipe(res);}
  catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
  const page=await browser.newPage(),external=[];
  page.on('request',r=>{if(/^https?:/.test(r.url())&&new URL(r.url()).origin!==base)external.push(r.url());});
  await page.goto(base);
  const result=await page.evaluate(async cases=>{
    const {Tokenizer}=await import('/tokenizers.mjs');
    const started=performance.now();
    const [json,config]=await Promise.all(['/tokenizer.json','/tokenizer_config.json'].map(u=>fetch(u).then(r=>r.json())));
    const tokenizer=new Tokenizer(json,config),loadMs=performance.now()-started;
    const begin=performance.now(),mismatches=[];
    for(const c of cases){
      const encoded=tokenizer.encode(c.text,{text_pair:c.text_pair,return_token_type_ids:true});
      const actual={input_ids:encoded.ids,attention_mask:encoded.attention_mask,token_type_ids:encoded.token_type_ids};
      for(const key of Object.keys(c.expected))if(JSON.stringify(c.expected[key])!==JSON.stringify(actual[key])){
        mismatches.push({id:c.id,field:key,expected:c.expected[key],actual:actual[key]});break;
      }
    }
    return{loadMs,totalEncodeMs:performance.now()-begin,cases:cases.length,mismatchCount:mismatches.length,mismatchExamples:mismatches.slice(0,8),userAgent:navigator.userAgent};
  },fixtures.cases);
  const evidence={date:new Date().toISOString(),scope:'Actual cloud Chromium Python fast-tokenizer vs @huggingface/tokenizers 0.2.0; no physical-device claim',...result,tokenizerJsonSha256:fixtures.tokenizer_json_sha256,externalRequests:external};
  const output=path.join(path.dirname(fixtureFile),'tokenizer-browser.json');
  await writeFile(output,JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
  assert.deepEqual(external,[]);assert.equal(result.mismatchCount,0,'Tokenizer mismatch: inspect saved evidence before deployment');
}finally{await browser.close();server.closeAllConnections();server.close();}

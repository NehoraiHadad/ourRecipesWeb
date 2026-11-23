const el = id => document.getElementById(id);
let manifest, assets, worker, recorder, stream, timer, downloading;
let stage = 'initial', generation = 0;
const micSupported = !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
const status = text => { el('status').textContent = text; };
function state(next) {
  stage = next;
  el('load').disabled = next !== 'empty';
  el('cancel').disabled = next !== 'download';
  el('erase').disabled = !assets || !['ready','failed'].includes(next);
  el('recipe').disabled = next !== 'ready';
  el('start').disabled = next !== 'ready' || !micSupported;
  el('stop').disabled = next !== 'recording';
  el('file').disabled = next !== 'ready';
}
function stopTracks() {
  clearTimeout(timer);
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
}
function forgetWorker() {
  worker?.terminate();
  worker = null;
}
function clearOutputs() {
  for (const id of ['hinted','plain','timing']) el(id).textContent = '';
  el('file').value = '';
}
function erase() {
  generation++;
  downloading?.abort();
  forgetWorker();
  stopTracks();
  if (recorder?.state === 'recording') recorder.stop();
  recorder = null;
  assets = null;
  clearOutputs();
  el('progress').hidden = true;
  state(manifest ? 'empty' : 'initial');
  status('נתוני הבדיקה נמחקו מהלשונית.');
}
window.addEventListener('pagehide',erase);
function request(payload) {
  const current=worker;
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('פג הזמן שהוקצב לפענוח.')),90000);
    current.onerror=e=>{clearTimeout(timeout);reject(Error(e.message));};
    current.onmessage=({data})=>{
      clearTimeout(timeout);
      if(data.type==='error')reject(Error(data.error));else resolve(data);
    };
    current.postMessage(payload);
  });
}
async function openWorker(arm) {
  forgetWorker();
  worker=new Worker('/worker.mjs',{type:'module'});
  const r=await request({type:'load',arm,assets});
  if(r.type!=='ready')throw Error('המפענח לא נטען.');
}
async function warm(id, message) {
  state('warming');
  status('מכין את המפענח למתכון…');
  try {
    await openWorker('hints-'+el('recipe').value);
    if(id!==generation)return;
    state('ready');
    status(message || (micSupported?'אפשר להקליט עד 15 שניות או לבחור קובץ.':'אפשר לבחור קובץ שמע מהמכשיר.'));
  } catch {
    if(id!==generation)return;
    forgetWorker(); state('failed'); status('טעינת המפענח נכשלה. אפשר למחוק מהלשונית ולנסות שוב.');
  }
}
function showIngredients() {
  el('ingredients').textContent=manifest.recipes[el('recipe').value].join(', ');
}
el('recipe').onchange=()=>{ clearOutputs();showIngredients();void warm(++generation); };
el('load').onclick=async()=>{
  const id=++generation, abort=new AbortController();
  downloading=abort;
  state('download');status('מוריד ומאמת את קובצי המודל…');
  const progress=el('progress');
  progress.max=manifest.assets.reduce((sum,a)=>sum+a.size,0);
  progress.value=0;progress.hidden=false;
  try {
    const local={};
    for(const a of manifest.assets){
      const response=await fetch(a.url,{cache:'no-store',signal:abort.signal});
      if(!response.ok)throw Error('ההורדה נכשלה.');
      const reader=response.body.getReader(),chunks=[];
      let bytes=0;
      for(;;){
        const {value,done}=await reader.read();
        if(done)break;
        bytes+=value.length;
        if(bytes>a.size)throw Error('גודל קובץ לא תקין.');
        chunks.push(value);progress.value+=value.length;
      }
      const blob=new Blob(chunks);
      if(bytes!==a.size)throw Error('קובץ חלקי.');
      const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
      const hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
      if(hash!==a.sha256)throw Error('אימות הקובץ נכשל.');
      local[a.url]=blob;
    }
    if(id!==generation || abort.signal.aborted) return;
    assets=local;progress.hidden=true;
    await warm(id);
  } catch(error) {
    if(id!==generation)return;
    assets=null;state('empty');progress.hidden=true;
    status(abort.signal.aborted?'ההורדה בוטלה.':error.message);
  } finally {
    if(id===generation)downloading=null;
  }
};
el('cancel').onclick=()=>{erase();status('ההורדה בוטלה.');};
el('erase').onclick=erase;
async function compare(blob, stopTime, id) {
  state('working');status('מתמלל עם רמזי המתכון…');
  try {
    if(blob.size>8*1024*1024)throw Error('יש לבחור קובץ עד 8 מ״ב.');
    const audio=new OfflineAudioContext(1,1,16000);
    const decoded=await audio.decodeAudioData(await blob.arrayBuffer());
    if(id!==generation)return;
    if(decoded.duration>30 || !decoded.length)throw Error('יש לבחור קטע באורך עד 30 שניות.');
    const pcm=new Float32Array(decoded.length);
    for(let c=0;c<decoded.numberOfChannels;c++){
      const channel=decoded.getChannelData(c);
      for(let i=0;i<pcm.length;i++)pcm[i]+=channel[i]/decoded.numberOfChannels;
    }
    const withHints=await request({type:'transcribe',pcm});
    if(id!==generation)return;
    el('hinted').textContent=withHints.text.trim()||'(לא זוהה דיבור)';
    // Two animation frames provide a proxy for first visible text on the foreground tab.
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(id!==generation)return;
    const displayMs=Math.round(performance.now()-stopTime);
    status('משווה לאותה הקלטה בלי רמזים…');
    await openWorker('beam4');
    if(id!==generation)return;
    const plain=await request({type:'transcribe',pcm});
    if(id!==generation)return;
    if(plain.inputSha256!==withHints.inputSha256)throw Error('הקלטים אינם תואמים.');
    el('plain').textContent=plain.text.trim()||'(לא זוהה דיבור)';
    el('timing').textContent='עד להצגת התמלול הראשון: '+displayMs+' מ״ש. פענוח עם רמזים: '+Math.round(withHints.ms)+' מ״ש, ובלעדיהם: '+Math.round(plain.ms)+' מ״ש.';
    await warm(id,'ההשוואה הסתיימה. אפשר להקליט שוב או להחליף מתכון.');
  } catch(error) {
    if(id!==generation)return;
    await warm(id,'הבדיקה לא הושלמה. '+error.message);
  }
}
el('file').onchange=()=>{
  const file=el('file').files[0];
  if(!file)return;
  clearOutputs();void compare(file,performance.now(),++generation);
};
let stoppedAt;
function finishRecording(){
  if(stage!=='recording')return;
  stoppedAt=performance.now();state('finishing');
  recorder.stop();stopTracks();
}
el('stop').onclick=finishRecording;
el('start').onclick=async()=>{
  const id=++generation;clearOutputs();state('permission');status('ממתין למיקרופון…');
  try{
    const input=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});
    if(id!==generation){input.getTracks().forEach(track=>track.stop());return;}
    stream=input;
    const rec=new MediaRecorder(stream),chunks=[];recorder=rec;
    rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    rec.onerror=()=>{if(id===generation){generation++;stopTracks();recorder=null;state('ready');status('ההקלטה נכשלה. אפשר לבחור קובץ.');}};
    rec.onstop=()=>{
      if(id!==generation)return;
      stopTracks();recorder=null;
      void compare(new Blob(chunks,{type:rec.mimeType}),stoppedAt??performance.now(),id);
    };
    stoppedAt=null;rec.start();state('recording');status('מקליט…');
    timer=setTimeout(finishRecording,15000);
  } catch{
    if(id!==generation)return;
    stopTracks();state('ready');status('המיקרופון אינו זמין. אפשר לבחור קובץ.');
  }
};
try{
  if(!window.isSecureContext || !window.Worker || !window.WebAssembly || !crypto.subtle || !window.OfflineAudioContext)
    throw Error('לבדיקה נדרש דפדפן עם תמיכה במודל וחיבור HTTPS או localhost. אפשר להשתמש בקלט טקסט באפליקציה.');
  const response=await fetch('/manifest.json');
  if(!response.ok)throw Error('רשימת הקבצים אינה זמינה.');
  manifest=await response.json();showIngredients();state('empty');
  status('הטעינה כוללת גם מנוע תמלול של כ־14 מ״ב.');
}catch(error){status(error.message);}

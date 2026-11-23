import {suspect,reconcile} from '/improvements/recipe-actions/retry.mjs';
import {checkWindows} from '/improvements/time-window/window.mjs';
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
function clearClarification() {
  el('clarify').hidden=true;
  el('keep-word').onclick=null;
  el('replace-word').onclick=null;
  el('other-word').onclick=null;
  el('edit-word-form').onsubmit=null;
  el('edit-word-form').hidden=true;
  el('edit-word').setCustomValidity('');
  el('edit-word').value='';
}

function offerClarification(text,id,kept=new Set()) {
  clearClarification();
  if(id!==generation)return;
  const item=suspect(text,manifest.actions).find(s=>!kept.has(s.i));
  if(!item)return;
  el('word-question').textContent='איזו מילה אמרת אחרי השלילה?';
  el('keep-word').textContent='להשאיר ״'+item.from+'״';
  el('replace-word').textContent='התכוונתי ל״'+item.to+'״';
  el('clarify').hidden=false;
  function choose(word) {
    if(id!==generation)return;
    const next=text.slice(0,item.offset)+word+text.slice(item.offset+item.from.length);
    kept.add(item.i);
    el('plain').textContent=next;
    offerClarification(next,id,kept);
  }
  el('keep-word').onclick=()=>choose(item.from);
  el('replace-word').onclick=()=>choose(item.to);
  el('other-word').onclick=()=>{
    el('edit-word-form').hidden=false;
    el('edit-word').focus();
  };
  el('edit-word').oninput=()=>el('edit-word').setCustomValidity('');
  el('edit-word-form').onsubmit=event=>{
    event.preventDefault();
    const input=el('edit-word'), word=input.value.trim();
    if(!/^[\p{L}][\p{L}\p{M}]*$/u.test(word)) {
      input.setCustomValidity('יש להקליד מילה אחת.');
      input.reportValidity();
      return;
    }
    choose(word);
  };
}
function clearOutputs() {
  clearClarification();
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
  const pasta=el('recipe').value==='pasta';
  el('first-label').textContent=pasta?'תמלול ראשוני':'עם רמזי המתכון';
  el('second-label').textContent=pasta?'אחרי בדיקת הפעולה':'בלי רמזים';
  el('description').textContent=pasta
    ? 'בדיקת פעולות במתכון פסטה. אם פועל אחרי שלילה אינו ברור, הדפדפן בודק שוב את ההקלטה.'
    : 'אותה הקלטה, עם מצרכי המתכון ובלעדיהם. הקול והתמלילים נשארים בלשונית.';
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
async function finishActionCheck(first, pcm, id, stopTime, displayMs) {
  const verbs=manifest.actions;
  const needsRetry=suspect(first.text,verbs).length>0;
  let finalText=first.text, clips=0, failed=false;
  if(needsRetry) {
    status('בודק את הפועל מול ההקלטה…');
    try {
      await openWorker('hints-pasta-actions');
      if(id!==generation)return;
      const retry=await request({type:'transcribe',pcm});
      if(id!==generation)return;
      if(retry.inputSha256!==first.inputSha256)throw Error('הקלטים אינם תואמים.');
      finalText=reconcile(first.text,retry.text,verbs).text;
      finalText=await checkWindows(finalText,first,verbs,pcm,async cut=>{
        if(id!==generation)throw Error('הבדיקה הופסקה.');
        clips++;
        return (await request({type:'transcribe',pcm:cut})).text;
      });
    } catch {
      failed=true;
    }
  }
  if(id!==generation)return;
  el('plain').textContent=finalText.trim()||'(לא זוהה דיבור)';
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  if(id!==generation)return;
  const finalMs=Math.round(performance.now()-stopTime);
  el('timing').textContent='עד לתמלול ראשוני: '+displayMs+' מ״ש. עד לסיום הבדיקה: '+finalMs+' מ״ש. '+
    (failed?'הבדיקה החוזרת נקטעה. מוצג התמלול האחרון שהתקבל.':
      needsRetry?'בוצע פענוח חוזר. מספר חלונות קצרים שנבדקו: '+clips+'.':'לא נדרש פענוח חוזר.');
  offerClarification(finalText,id);
  const done='הבדיקה הסתיימה. אפשר להקליט שוב או להחליף מתכון.';
  if(needsRetry) await warm(id,done);
  else {state('ready');status(done);}
}
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
    const actions=el('recipe').value==='pasta';
    const withHints=await request({type:'transcribe',pcm,withTiming:actions});
    if(id!==generation)return;
    el('hinted').textContent=withHints.text.trim()||'(לא זוהה דיבור)';
    // Two animation frames provide a proxy for first visible text on the foreground tab.
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(id!==generation)return;
    const displayMs=Math.round(performance.now()-stopTime);
    if(actions){await finishActionCheck(withHints,pcm,id,stopTime,displayMs);return;}
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

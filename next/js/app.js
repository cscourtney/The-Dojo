import {read,write} from './store.js';
import {connect,disconnect,accessToken,ensureAccess,readTab,syncEntry} from './sheets.js?v=2';
import {Recording,restoredRecording,discardRecording} from './recording.js';
const $ = id => document.getElementById(id);
const fieldDefinitions = [
 ['date','Training date','date'],['entry_type','Session type',['class','drill','technique']],['gi','Training kit',['gi','nogi']],['lesson','Session focus','text'],
 ['technique','What you practiced','area'],['rolls','What happened in rolling','area'],['standup','Standup / takedowns','area'],['drillwork','Solo drilling','area'],['pearls','What clicked · one insight per line','area'],['fundamentals','Principles you noticed','area'],['notes','Other notes','area'],
 ['position','Position','text'],['technique_label','Technique name','text'],['takedown_label','Takedown name','text'],['map_node','Strategy map reference (optional)','text']
];
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; };
let draft = {id:crypto.randomUUID(), date:today(),entry_type:'class',gi:'gi',transcript:'',fields:{}};
let queue = [], busy = false, audioUrl, storageFailed = false;
const logs = [];
function status(message,error=false) {
 for (const id of ['status','review-status']) { $(id).hidden=false; $(id).textContent=message; $(id).classList.toggle('error',error); }
 if (error) logs.push({at:new Date().toISOString(),message});
 if (logs.length>30) logs.shift();
}
window.addEventListener('error', () => status('An unexpected error occurred. Your saved draft is retained. Copy diagnostics in Connection settings.',true));
window.addEventListener('unhandledrejection', () => status('An operation could not finish. Your saved draft is retained. Copy diagnostics in Connection settings.',true));
for (const [key,label,type] of fieldDefinitions) {
 const wrapper = document.createElement('div'); if (type==='area') wrapper.className='wide';
 const caption = document.createElement('label'); caption.htmlFor=key; caption.textContent=label;
 const input = document.createElement(Array.isArray(type)?'select':type==='area'?'textarea':'input'); input.id=key; input.name=key;
 if (Array.isArray(type)) type.forEach(value => { const option=document.createElement('option'); option.value=value; option.textContent={class:'Class',drill:'Home drill',technique:'Technique',gi:'Gi',nogi:'No-gi'}[value];input.append(option); });
 else if (type==='area') input.rows=3; else input.type=type;
 if (key==='date') input.required=true;
 wrapper.append(caption,input); (['date','entry_type','gi','lesson','technique','rolls','pearls'].includes(key)?$('fields'):$('extra-fields')).append(wrapper);
}
function fillFields() { for (const [key] of fieldDefinitions) $(key).value = draft.fields[key] ?? draft[key] ?? ''; $('original').value=draft.transcript; }
function collect() { return Object.fromEntries(fieldDefinitions.map(([key])=>[key,$(key).value.trim()])); }
let draftWrites = Promise.resolve();
function persistDraft() {
 const snapshot = structuredClone(draft);
 draftWrites = draftWrites.catch(()=>{}).then(()=>write('draft',snapshot));
 return draftWrites.catch(() => { storageFailed=true; status('This browser could not save your draft locally. Keep this page open and copy your recap before leaving.',true); throw new Error('Local draft storage unavailable.'); });
}
function changed() { draft.fields=collect(); draft.transcript=$('transcript').value; $('original').value=draft.transcript; persistDraft().catch(()=>{}); }
$('entry-form').addEventListener('input',changed);
$('transcript').addEventListener('input',changed);
function review() { draft.reviewOpen=true; persistDraft().catch(()=>{}); fillFields(); $('review').hidden=false;  $('review').scrollIntoView({behavior:'smooth',block:'start'}); }
function controls() { for (const id of ['organize','save','connect','refresh','new-draft','disconnect']) $(id).disabled = busy || recorder.active || recorder.finishing; for(const input of $('entry-form').querySelectorAll('input, textarea, select')) input.disabled=busy; $('record').disabled=busy || recorder.finishing; $('transcript').readOnly=recorder.active||busy; $('organize').textContent=busy?'Please wait…':'Organize my recap'; $('manual').disabled=busy||recorder.active||recorder.finishing; }
function showAudio(blob) {
 if (!blob?.size) return;
 if (audioUrl) URL.revokeObjectURL(audioUrl);
 audioUrl=URL.createObjectURL(blob); $('audio').src=audioUrl; $('audio').hidden=false;
 $('download').href=audioUrl; $('download').download=blob.type.includes('mp4')?'dojo-recap.m4a':'dojo-recap.webm';$('download').hidden=false;
}
const recorder = new Recording({
 onText:text=>{$('transcript').value=text; changed();},
 onStatus:text=>{$('record-state').textContent=text;},
 onStop:blob=>{showAudio(blob);$('record').textContent='Record more';$('record-state').textContent='Recording stopped. Review your words before organizing.';controls();}
});
$('record').onclick = async () => {
 if (recorder.active) { recorder.stop(); controls(); return; }
 busy=true;controls();
 try { await recorder.start($('transcript').value);$('record').textContent='Stop recording'; }
 catch(error) {status(`Microphone: ${error.message}`,true);}
 busy=false;controls();
};
window.addEventListener('beforeunload',event=>{if(recorder.active){event.preventDefault();event.returnValue='';}});
$('manual').onclick=()=>{changed();review();status('Manual entry: fill in the session details below. AI has not organized this recap.');};
$('organize').onclick=async()=>{
 const transcript=$('transcript').value.trim(); if(!transcript)return status('Add your recap first.',true);
 const url=$('worker-url').value.trim();
 if(!url)return status('AI is not connected yet. Add the new Worker URL under Connection settings, or fill in the details yourself.',true);
 changed();busy=true;controls();status('Organizing your recap. Your original words are retained.');
 try {
  await ensureAccess();
  await persistDraft();
  const endpoint=new URL('/parse-workout',url);if(endpoint.protocol!=='https:' && !(['localhost','127.0.0.1'].includes(endpoint.hostname)&&endpoint.protocol==='http:'))throw new Error('Use an HTTPS Worker URL.');
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${accessToken()}`},body:JSON.stringify({transcript,today:today()}),signal:AbortSignal.timeout(60000)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(`AI HTTP ${response.status}: ${result.error || 'Request failed. Retry or fill in the fields yourself.'}`);
  if(!result.entry || Array.isArray(result.entry) || typeof result.entry!=='object' || !['lesson','technique','rolls','standup','drillwork','pearls','notes'].some(key=>typeof result.entry[key]==='string'&&result.entry[key].trim()))throw new Error('AI returned no session details. Your recap is safe; retry or enter the details manually.');
  // The server validates this schema; accept only known strings in the browser as well.
  const fields={};for(const [key] of fieldDefinitions)if(typeof result.entry[key]==='string')fields[key]=result.entry[key];
  draft.fields={...draft.fields,...fields};draft.transcript=transcript;await persistDraft();review();status('Ready to review. Nothing has been sent to your Sheet yet.');
 }catch(error){status(`Organize recap: ${error.message}`,true);}finally{busy=false;controls();}
};
function displayRecent(snapshot,cached=false) {
 $('recent-list').replaceChildren();
 const rows=[...snapshot.rows].filter(row=>row.date).sort((a,b)=>String(b.date).localeCompare(String(a.date)) || String(b.created_at).localeCompare(String(a.created_at))).slice(0,8);
 $('recent-state').textContent=`${cached?'Cached on this device':'Read from Google Sheets'} · ${rows.length? 'latest sessions':'no sessions yet'}`;
 for(const row of rows){const article=document.createElement('article');article.className='session';const title=document.createElement('strong');title.textContent=row.lesson||row.technique_label||'Training session';const meta=document.createElement('small');meta.textContent=`${row.date} · ${row.entry_type||'class'} · ${row.gi||''}`;const text=document.createElement('p');text.textContent=row.pearls||row.technique||row.notes||'';article.append(meta,document.createElement('br'),title,text);$('recent-list').append(article);}
}
async function loadRecent(){const snapshot=await readTab('data');await write('mirror-data',snapshot);displayRecent(snapshot);}
async function flushQueue(){
 while(queue.length){const entry=queue[0];const tabs=await syncEntry(entry);for(const [name,snapshot]of Object.entries(tabs))await write('mirror-'+name,snapshot);displayRecent(tabs.data);const remaining=queue.slice(1);await write('queue',remaining);queue=remaining;if(draft.id===entry.id)await resetDraft();}
}
$('connect').onclick=async()=>{busy=true;controls();try{await connect();$('connection').textContent='Connected to Google. Your Sheet remains the source of truth.';$('connect').textContent='Reconnect Google';await flushQueue();await loadRecent();status('Connected. Your training history is up to date.');}catch(error){status(error.message,true);}finally{busy=false;controls();}};
$('disconnect').onclick=()=>{disconnect();$('connection').textContent='Disconnected. Local drafts and cached history remain on this device.';$('connect').textContent='Connect Google Sheet';status('Google session disconnected on this page.');};
$('refresh').onclick=async()=>{busy=true;controls();try{await ensureAccess();await flushQueue();await loadRecent();status('Your Sheet is up to date.');}catch(error){status(error.message,true);}finally{busy=false;controls();}};
$('entry-form').onsubmit=async event=>{
 event.preventDefault();if(busy)return;
 const fields=collect();if(!fields.date || !['lesson','technique','rolls','standup','drillwork','pearls','notes'].some(key=>fields[key]))return status('Add a date and at least one session detail.',true);
 const existing=queue.find(entry=>entry.id===draft.id);
 if(existing && JSON.stringify(fields)!==JSON.stringify(draft.queuedFields))return status('This entry has a pending save. Retry it with Refresh & sync before starting a new draft; editing partially saved entries is not enabled in this first version.',true);
 busy=true;controls();
 try{
  changed();await draftWrites;
  const entry=existing||{...fields,id:draft.id,created_at:new Date().toISOString(),notes:[fields.notes,draft.transcript?'Original recap:\n'+draft.transcript:''].filter(Boolean).join('\n\n')};
  if(!existing){const pending=[...queue,entry];await write('queue',pending);queue=pending;draft.queuedFields=fields;await persistDraft();}
  status('Saved on this device. Syncing the journal and linked details…');
  await flushQueue();status('Saved and read back from Google Sheets, including linked techniques and pearls.');
 }catch(error){status(`Save incomplete: ${error.message}\n${queue.length?'The pending entry is retained on this device. Connect Google, then use Refresh & sync.':'Keep this page open and copy your entry if local storage is unavailable.'}`,true);}finally{busy=false;controls();}
};
async function resetDraft(){draft={id:crypto.randomUUID(),date:today(),entry_type:'class',gi:'gi',transcript:'',fields:{}};await persistDraft();$('transcript').value='';fillFields();$('review').hidden=true;$('audio').hidden=true;$('download').hidden=true;await discardRecording();}
$('new-draft').onclick=async()=>{if(!confirm('Start a new draft? Pending saves are retained; the current draft will be cleared.'))return;try{await resetDraft();status('Ready for a new session.');}catch(error){status(error.message,true);}};
$('save-settings').onclick=async()=>{try{const value=$('worker-url').value.trim();if(value){const url=new URL(value);if(url.protocol!=='https:' && !(['localhost','127.0.0.1'].includes(url.hostname)&&url.protocol==='http:'))throw new Error('Use an HTTPS Worker URL.');if(url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Enter only the Worker origin, with no path or credentials.');}await write('worker-url',value);status('Connection setting saved on this device.');}catch(error){status(error.message,true);}};
$('diagnostics').onclick=async()=>{const report=JSON.stringify({version:'next-0.1',time:new Date().toISOString(),userAgent:navigator.userAgent,recordingSupport:!!window.MediaRecorder,speechSupport:!!(window.SpeechRecognition||window.webkitSpeechRecognition),pendingSaves:queue.length,storageFailed,errors:logs},null,2);try{await navigator.clipboard.writeText(report);status('Diagnostics copied. No tokens, transcripts, or journal content are included.');}catch{status(report);}};
window.addEventListener('online',async()=>{if(busy||recorder.active||!queue.length)return;busy=true;controls();try{await flushQueue();status('Pending entries were synced to Google Sheets.');}catch(error){status(`Pending sync: ${error.message}`,true);}finally{busy=false;controls();}});
try{
 const saved=await read('draft');if(saved)draft=saved;queue=await read('queue')||[];$('worker-url').value=await read('worker-url')||'https://yhe-dojo-next.livingthesearch1.workers.dev';$('transcript').value=draft.transcript;fillFields();if(draft.reviewOpen || Object.entries(draft.fields).some(([key,value])=>!['date','entry_type','gi'].includes(key)&&typeof value==='string'&&value.trim())){$('review').hidden=false;}
 const mirror=await read('mirror-data');if(mirror)displayRecent(mirror,true);showAudio(await restoredRecording());if(queue.length)status(`${queue.length} pending save(s) retained on this device. Connect Google to finish syncing.`);
}catch(error){storageFailed=true;status('Local draft storage is unavailable. Keep this page open and copy your recap before leaving.',true);}

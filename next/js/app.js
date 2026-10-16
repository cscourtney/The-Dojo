import {makeBookModel,notebookHTML} from './book-model.js?v=7';
import {StrategyMap} from './strategy-map.js?v=5';
import {renderPrep,renderSearch,renderResources,PrepPlayback} from './workspace-tools.js?v=5';
import {read,write,remove} from './store.js';
import {connect,disconnect,accessToken,ensureAccess,readTab,readWorkbook,syncEntry} from './sheets.js?v=5';
import {FIELDS,POSITIONS,MAP_NODES,newDraft,localToday,techniqueName,positionKey,canonicalMapKey} from './journal.js?v=5';
import {renderJournal,renderKnowledge,techniqueKey} from './views.js?v=5';
const $=id=>document.getElementById(id);
let draft=newDraft(),queue=[],busy=false,storageFailed=false,limit=12,view='journal',selected='';
let workbook=null;let snapshots={},cached=true,logs=[],draftWrites=Promise.resolve(),legacyAudioUrl;
function status(message,error=false){
 for(const id of ['status','review-status']){ $(id).hidden=false;$(id).textContent=message;$(id).classList.toggle('error',error); }
 if(view!=='journal'){ $('workspace-status').hidden=false;$('workspace-status').textContent=message;$('workspace-status').classList.toggle('error',error); }
 if(error){logs.push({at:new Date().toISOString(),message});if(logs.length>30)logs.shift();}
}
window.addEventListener('error',()=>status('An unexpected error occurred. Your saved draft is retained. Use Settings → Copy diagnostics.',true));
window.addEventListener('unhandledrejection',()=>status('An operation could not finish. Your saved draft is retained. Use Settings → Copy diagnostics.',true));
const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
function addOptions(input,options,empty='Select…'){
 input.replaceChildren();if(empty!==null){const option=node('option',empty);option.value='';input.append(option);}
 for(const [value,label]of options){const option=node('option',label);option.value=value;input.append(option);}
}
function inputField(key,label,type,parent){
 const wrapper=node('div');wrapper.id='field-'+key;
 if(type==='area')wrapper.className='wide';
 const caption=node('label',label);caption.htmlFor=key;
 const input=node(Array.isArray(type)?'select':type==='area'?'textarea':'input');input.id=key;input.name=key;
 if(Array.isArray(type))addOptions(input,type,null);else if(type==='area')input.rows=3;else input.type=type;
 if(key==='date')input.required=true;
 wrapper.append(caption,input);parent.append(wrapper);return wrapper;
}
for(const [key,label,type]of FIELDS)inputField(key,label,type,$('fields'));
function toggle(key,label,parent){const wrapper=node('label');wrapper.className='toggle';const input=node('input');input.type='checkbox';input.id=key;wrapper.append(input,document.createTextNode(label));parent.append(wrapper);}
const techniqueLinks=node('div');techniqueLinks.className='link-controls';
inputField('existing-technique','Link an existing technique',[] ,techniqueLinks);
toggle('new-technique','New Technique · add to my library',techniqueLinks);
const techniqueMeta=node('div');techniqueMeta.id='technique-meta';techniqueMeta.className='fields link-panel';
inputField('technique_label','Technique name','text',techniqueMeta);inputField('position','Position',POSITIONS,techniqueMeta);techniqueLinks.append(techniqueMeta);$('field-technique').append(techniqueLinks);
const takedownLinks=node('div');takedownLinks.className='link-controls';
inputField('existing-takedown','Link an existing takedown',[],takedownLinks);toggle('new-takedown','New Takedown · add to my library',takedownLinks);
const takedownMeta=node('div');takedownMeta.id='takedown-meta';takedownMeta.className='link-panel';inputField('takedown_label','Takedown name','text',takedownMeta);takedownLinks.append(takedownMeta);$('field-standup').append(takedownLinks);
const mapLinks=node('div');mapLinks.className='wide link-controls';toggle('link-map','Link to Strategy Map',mapLinks);
const mapMeta=node('div');mapMeta.id='map-meta';inputField('map_node','Strategy map reference',MAP_NODES,mapMeta);const note=node('p','Saves a link to the description under Strategy links. The interactive map comes later.');note.className='hint';mapMeta.append(note);mapLinks.append(mapMeta);$('fields').append(mapLinks);
// Placeholder values must not implicitly select a position or map node.
addOptions($('position'),POSITIONS);addOptions($('map_node'),MAP_NODES);
function persistDraft(){const snapshot=structuredClone(draft);draftWrites=draftWrites.catch(()=>{}).then(()=>write('draft',snapshot));return draftWrites.catch(()=>{storageFailed=true;status('Local draft storage is unavailable. Keep the page open and copy your words before leaving.',true);throw new Error('Local draft storage unavailable.');});}
function currentLinks(){return {createTechnique:$('new-technique').checked,createTakedown:$('new-takedown').checked,linkMap:$('link-map').checked,existingTechnique:$('existing-technique').value,existingTakedown:$('existing-takedown').value};}
function collect(){return Object.fromEntries([...FIELDS.map(([key])=>key),'position','technique_label','takedown_label','map_node'].map(key=>[key,$(key).value.trim()]));}
function changed(){draft.fields=collect();draft.links=currentLinks();draft.transcript=$('transcript').value;$('original').value=draft.transcript;persistDraft().catch(()=>{});}
function setValue(key,value){const el=$(key);if(el.tagName==='SELECT'&&value&&![...el.options].some(option=>option.value===value)){const option=node('option',value);option.value=value;el.append(option);}el.value=value||'';}
function formVisibility(){
 const type=$('entry_type').value;
 for(const key of ['lesson','standup','rolls'])$('field-'+key).hidden=type!=='class';
 $('field-drillwork').hidden=type!=='drill';$('field-technique').hidden=type==='drill';$('field-gi').hidden=type!=='class';
 $('technique-meta').hidden=!$('new-technique').checked&&!$('existing-technique').value;
 $('takedown-meta').hidden=!$('new-takedown').checked&&!$('existing-takedown').value;
 mapLinks.hidden=type==='drill'; $('map-meta').hidden=!$('link-map').checked;
 $('technique_label').readOnly=!!$('existing-technique').value;
 $('position').disabled=busy||!!$('existing-technique').value;
 $('takedown_label').readOnly=!!$('existing-takedown').value;
}
function fillFields(){
 for(const [key]of FIELDS)setValue(key,draft.fields[key]??draft[key]??'');
 for(const key of ['position','technique_label','takedown_label','map_node'])setValue(key,draft.fields[key]||'');
 $('new-technique').checked=!!draft.links?.createTechnique;$('new-takedown').checked=!!draft.links?.createTakedown;$('link-map').checked=!!draft.links?.linkMap;
 setValue('existing-technique',draft.links?.existingTechnique||'');setValue('existing-takedown',draft.links?.existingTakedown||'');
 $('original').value=draft.transcript;formVisibility();
}
function updateExistingOptions(){
 for(const [id,isTakedown]of [['existing-technique',false],['existing-takedown',true]]){
  const previous=$(id).value;const groups=new Map();for(const row of snapshots.techniques?.rows||[]){if(!techniqueName(row))continue;if((positionKey(row.position)==='takedowns')!==isTakedown)continue;groups.set(techniqueKey(row),row);}
  addOptions($(id),[...groups].map(([key,row])=>[key,techniqueName(row)+(row.position?' · '+(POSITIONS.find(([value])=>value===positionKey(row.position))?.[1]||row.position):'')]),'No library link');
  setValue(id,previous||draft.links?.[isTakedown?'existingTakedown':'existingTechnique']||'');
 }
}
function controls(){const pending=queue.some(entry=>entry.id===draft.id);for(const id of ['organize','manual','save','connect','refresh','refresh-knowledge','new-draft','disconnect','prep-refresh','search-refresh','resources-refresh','book-build','book-html'])$(id).disabled=busy;for(const id of ['organize','manual','save'])$(id).disabled=busy||pending;for(const input of $('entry-form').querySelectorAll('input,textarea,select'))input.disabled=busy||pending;$('transcript').readOnly=busy||pending;$('organize').textContent=busy?'Please wait…':'Organize my recap';formVisibility();if(pending)$('position').disabled=true;}
$('entry-form').addEventListener('input',()=>{formVisibility();changed();});
$('transcript').addEventListener('input',changed);
for(const [checkbox,existing]of [['new-technique','existing-technique'],['new-takedown','existing-takedown']])$(checkbox).addEventListener('change',()=>{if($(checkbox).checked)$(existing).value='';formVisibility();changed();});
for(const [id,checkbox,name]of [['existing-technique','new-technique','technique_label'],['existing-takedown','new-takedown','takedown_label']])$(id).addEventListener('change',()=>{const row=(snapshots.techniques?.rows||[]).find(row=>techniqueKey(row)===$(id).value);$(checkbox).checked=false;$(name).value=row?techniqueName(row):'';if(id==='existing-technique')setValue('position',row?.position||'');formVisibility();changed();});
function review(){draft.reviewOpen=true;persistDraft().catch(()=>{});fillFields();$('review').hidden=false;$('review').scrollIntoView({behavior:'smooth',block:'start'});}
$('manual').onclick=()=>{changed();review();status('Enter your session details below. Nothing is saved to Sheets until you tap Save.');};
$('organize').onclick=async()=>{
 const transcript=$('transcript').value.trim(),url=$('worker-url').value.trim();
 if(!transcript)return status('Dictate or type your recap in Your words first.',true);
 if(!url)return status('Set the AI Worker URL in Settings, or enter the details yourself.',true);
 if(draft.reviewOpen&&Object.entries(collect()).some(([key,value])=>!['date','entry_type','gi','position','technique_label','takedown_label','map_node'].includes(key)&&value)&&!confirm('Organize again? This replaces the journal fields with a new interpretation. Your library and map choices are kept.'))return;
 changed();busy=true;controls();status('Organizing your recap…');
 try{
  await ensureAccess();await persistDraft();const endpoint=new URL('/parse-workout',url);
  if(endpoint.protocol!=='https:'&&!(['localhost','127.0.0.1'].includes(endpoint.hostname)&&endpoint.protocol==='http:'))throw new Error('Use an HTTPS Worker URL.');
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${accessToken()}`},body:JSON.stringify({transcript,today:localToday()}),signal:AbortSignal.timeout(60000)});
  const result=await response.json().catch(()=>({}));if(!response.ok){if(response.status===401)disconnect();throw new Error(`AI HTTP ${response.status}: ${result.error||'Request failed. Your words are retained.'}`);}
  if(!result.entry||Array.isArray(result.entry)||!['lesson','technique','rolls','standup','drillwork','pearls','notes','fundamentals'].some(key=>typeof result.entry[key]==='string'&&result.entry[key].trim()))throw new Error('AI returned no session details. Your recap is safe.');
  // AI may organize prose, never opt into library creation or map linking.
  for(const [key]of FIELDS)if(typeof result.entry[key]==='string')draft.fields[key]=result.entry[key];
  if(!['class','drill','technique'].includes(draft.fields.entry_type))draft.fields.entry_type='class';
  if(!['gi','nogi'].includes(draft.fields.gi))draft.fields.gi='gi';
  draft.transcript=transcript;await persistDraft();review();status('Ready to review. Use New Technique or New Takedown only when adding a library entry.');
 }catch(error){status(`Organize recap: ${error.message}`,true);}finally{busy=false;controls();}
};
const strategyMap=new StrategyMap({viewport:$('map-viewport'),holder:$('map-holder'),select:$('map-position'),zoomIn:$('map-in'),zoomOut:$('map-out'),fit:$('map-fit'),onSelect:key=>{location.hash='strategy/'+encodeURIComponent(key);}});
const playback=new PrepPlayback({select:$('prep-voice'),state:$('prep-playback'),play:$('prep-play'),pause:$('prep-pause'),stop:$('prep-stop')});
function render(){
 const journal=view==='journal',knowledge=['techniques','pearls','fundamentals','strategy'].includes(view);
 $('journal-view').hidden=!journal;$('knowledge-view').hidden=!knowledge;$('strategy-map').hidden=view!=='strategy';if(view==='strategy'){strategyMap.update(snapshots,selected);strategyMap.load().catch(error=>status(error.message,true));}
 for(const type of ['prep','search','resources','notebook'])$(type+'-view').hidden=view!==type;
 for(const button of document.querySelectorAll('[data-view]')){if(button.dataset.view===view)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}
 if(journal){const count=renderJournal(snapshots.data,{filter:$('journal-filter').value,type:$('journal-type').value,limit,selected});$('recent-state').textContent=`${cached?'Cached on this device':'From Google Sheets'} · ${count} sessions`;}
 else if(knowledge)renderKnowledge(view,snapshots,{filter:$('knowledge-filter').value,selected,cached:cached||!!(view==='pearls'?snapshots.pearls?.stale:view==='techniques'?snapshots.techniques?.stale:view==='fundamentals'?snapshots.data?.stale:snapshots.techniques?.stale||snapshots.data?.stale)});
 else if(view==='prep'){const prep=renderPrep($('prep-content'),snapshots);playback.update(prep.text);}
 else if(view==='search')renderSearch($('history-results'),snapshots,$('history-query').value);
 else if(view==='resources')renderResources($('resource-list'),snapshots,$('resource-query').value);
 updateExistingOptions();
}
for(const button of document.querySelectorAll('[data-view]')){const option=node('option',button.textContent);option.value=button.dataset.view;$('section-menu').append(option);}
$('section-menu').onchange=()=>{location.hash=$('section-menu').value;};
function updateNavigation(){$('section-menu').value=view;$('nav-hint').hidden=true;}
window.addEventListener('resize',updateNavigation);
function route(){const previous=view;const [target,...parts]=location.hash.slice(1).split('/');view=['journal','techniques','pearls','fundamentals','strategy','prep','search','resources','notebook'].includes(target)?target:'journal';try{selected=decodeURIComponent(parts.join('/'));if(view==='strategy')selected=canonicalMapKey(selected);}catch{selected='';}if(selected){$('journal-filter').value='';$('journal-type').value='';$('knowledge-filter').value='';}if(previous==='prep'&&view!=='prep')playback.cancel();render();updateNavigation();if(selected)$(view==='journal'?'recent-list':'knowledge-list').scrollIntoView({block:'start'});}
window.addEventListener('hashchange',route);
for(const button of document.querySelectorAll('[data-view]'))button.onclick=()=>{selected='';$('knowledge-filter').value='';if(location.hash==='#'+button.dataset.view)route();else location.hash=button.dataset.view;};
$('journal-filter').oninput=()=>{selected='';limit=12;render();};$('journal-type').onchange=()=>{selected='';limit=12;render();};$('knowledge-filter').oninput=()=>{selected='';render();};$('more-sessions').onclick=()=>{limit+=12;render();};
$('history-query').oninput=()=>renderSearch($('history-results'),snapshots,$('history-query').value);
$('resource-query').oninput=()=>renderResources($('resource-list'),snapshots,$('resource-query').value);
async function loadCompleteWorkbook(){
 const latest=await readWorkbook();
 for(const [tab,snapshot]of Object.entries(latest.sheets)){
  if(snapshot.readProblem){if(snapshots[tab])snapshots[tab].stale=true;continue;}
  await write('mirror-'+tab,snapshot);snapshots[tab]=snapshot;
 }
 await write('workbook',latest);workbook=latest;cached=false;render();return latest;
}
async function refreshAllSources(){
 if(busy)return;busy=true;controls();status('Reading every tab from Google Sheets…');
 try{
  await ensureAccess();await flushQueue();const latest=await loadCompleteWorkbook();
  status(`Read ${Object.keys(latest.sheets).length} Sheet tabs.${latest.problems.length?' Some tabs could not be interpreted for app views; their original cells are retained for notebook export: '+latest.problems.map(p=>p.tab).join(', '):''}`);
 }catch(error){status(`Refresh sources: ${error.message}`,true);}finally{busy=false;controls();}
}
for(const id of ['prep-refresh','search-refresh','resources-refresh','book-build','book-html'])$(id).onclick=refreshAllSources;
const bookURLs=[];
function bookMessage(message,error=false){$('book-state').hidden=false;$('book-state').textContent=message;$('book-state').classList.toggle('error',error);}
function bookDownload(bytes,type,name,label){const url=URL.createObjectURL(new Blob([bytes],{type}));bookURLs.push(url);const link=node('a',label);link.href=url;link.download=name;link.className='download-link';$('book-downloads').append(link);}
async function buildNotebook(format){
 if(busy)return;busy=true;controls();bookMessage('Connecting to Google and reading every Sheet tab…');
 try{
  await ensureAccess();await flushQueue();const latest=await loadCompleteWorkbook();
  const stamp=localToday();
  if(format==='pdf'){
   const {createNotebookPDF}=await import('./book-pdf.js?v=7');
   const result=await createNotebookPDF(latest,message=>bookMessage(message),{paper:!$('book-white-paper').checked});
   bookDownload(result.bytes,'application/pdf',`The-Dojo-Notebook-${stamp}.pdf`,'Download PDF notebook');
   bookMessage(`Ready: ${result.pages} pages, ${result.model.tabCount} Sheet tabs, ${result.model.rowCount} original data rows. Snapshot ${latest.fetchedAt}. Use your PDF reader to search or print.`);
  }else{
   const model=makeBookModel(latest);const {notebookFonts}=await import('./book-fonts.js?v=7');const fontCSS=await notebookFonts();bookDownload(notebookHTML(model,{fontCSS,paper:!$('book-white-paper').checked}),'text/html;charset=utf-8',`The-Dojo-Notebook-${stamp}.html`,'Download searchable HTML notebook');
   bookMessage(`Ready: ${model.tabCount} Sheet tabs and ${model.rowCount} original data rows, with an index and search. Open the downloaded HTML file in a browser.`);
  }
 }catch(error){bookMessage(`Notebook export: ${error.message}`,true);}finally{busy=false;controls();}
}
$('book-build').onclick=()=>buildNotebook('pdf');$('book-html').onclick=()=>buildNotebook('html');
window.addEventListener('pagehide',()=>{for(const url of bookURLs)URL.revokeObjectURL(url);playback.cancel(false);});
async function loadWorkspace(){
 const data=await readTab('data');await write('mirror-data',data);snapshots.data=data;cached=false;render();
 const warnings=[];for(const tab of ['techniques','pearls'])try{const snapshot=await readTab(tab);await write('mirror-'+tab,snapshot);snapshots[tab]=snapshot;}catch(error){if(snapshots[tab])snapshots[tab].stale=true;warnings.push(`${tab}: ${error.message}`);}
 render();if(warnings.length)throw new Error('Journal loaded, but these sections could not refresh: '+warnings.join(' '));
}
async function resetDraft(){draft=newDraft();await persistDraft();$('transcript').value='';fillFields();$('review').hidden=true;controls();}
async function flushQueue(){
 while(queue.length){const entry=queue[0];const tabs=await syncEntry(entry);for(const [tab,snapshot]of Object.entries(tabs)){await write('mirror-'+tab,snapshot);snapshots[tab]=snapshot;}cached=false;render();const pending=queue.slice(1);await write('queue',pending);queue=pending;if(draft.id===entry.id)await resetDraft();}
}
async function refresh(){if(busy)return;busy=true;controls();try{await ensureAccess();await flushQueue();await loadWorkspace();status('Your journal and linked sections are up to date.');}catch(error){status(error.message,true);}finally{busy=false;controls();}}
$('refresh').onclick=refresh;$('refresh-knowledge').onclick=refresh;
$('connect').onclick=async()=>{busy=true;controls();try{await connect();$('connection').textContent='Connected to Google Sheets.';$('connect').textContent='Switch Google account';await flushQueue();await loadWorkspace();status('Connected. Your journal and linked sections are up to date.');}catch(error){status(error.message,true);}finally{busy=false;controls();}};
$('disconnect').onclick=()=>{disconnect();$('connection').textContent='Disconnected. Drafts and cached entries remain on this device.';$('connect').textContent='Connect Google Sheet';status('Google session disconnected.');};
function entryFromForm(){
 const fields=collect(),links=currentLinks(),type=fields.entry_type;
 if(!fields.date||!/^\d{4}-\d{2}-\d{2}$/.test(fields.date))throw new Error('Choose a training date.');
 if(type!=='class'){fields.lesson='';fields.standup='';fields.rolls='';fields.gi='';}
 if(type!=='drill')fields.drillwork='';else fields.technique='';
 const hasTechnique=type!=='drill'&&(links.createTechnique||!!links.existingTechnique);
 const hasTakedown=type==='class'&&(links.createTakedown||!!links.existingTakedown);
 if(!hasTechnique){fields.technique_label='';fields.position='';}
 if(!hasTakedown)fields.takedown_label='';
 const useMap=type!=='drill'&&links.linkMap; if(!useMap)fields.map_node='';
 if(links.createTechnique&&type!=='drill'&&(!fields.technique_label||!fields.position||!fields.technique))throw new Error('New Technique needs a name, position, and detailed description.');
 if(links.createTakedown&&type==='class'&&(!fields.takedown_label||!fields.standup))throw new Error('New Takedown needs a name and a Standup description.');
 if(useMap&&(!fields.map_node||(!hasTechnique&&!hasTakedown)))throw new Error('A Strategy Map link needs a reference and a new or existing technique/takedown.');
 if(!['lesson','standup','technique','drillwork','rolls','pearls','fundamentals','notes'].some(key=>fields[key]))throw new Error('Add at least one journal detail.');
 return {...fields,id:draft.id,created_at:new Date().toISOString(),notes:[fields.notes,draft.transcript?'Original recap:\n'+draft.transcript:''].filter(Boolean).join('\n\n'),_createTechnique:hasTechnique&&links.createTechnique,_createTakedown:hasTakedown&&links.createTakedown};
}
$('entry-form').onsubmit=async event=>{
 event.preventDefault();if(busy)return;
 let entry;try{entry=entryFromForm();}catch(error){return status(error.message,true);}
 const existing=queue.find(item=>item.id===draft.id);
 if(existing&&JSON.stringify({fields:collect(),links:currentLinks(),transcript:$('transcript').value})!==JSON.stringify(draft.queuedForm))return status('This entry has a pending save. Finish it with Refresh & sync before changing it; your edits are retained in the draft.',true);
 busy=true;controls();
 // Start renewal from the click gesture, but retain the pending entry even if sign-in fails.
 const auth=ensureAccess().then(()=>null,error=>error);
 try{
  changed();await draftWrites;if(!existing){const pending=[...queue,entry];await write('queue',pending);queue=pending;draft.queuedForm={fields:collect(),links:currentLinks(),transcript:$('transcript').value};await persistDraft();}
  status('Saved on this device. Syncing to Google Sheets…');const authError=await auth;if(authError)throw authError;
  await flushQueue();status('Saved and confirmed in Google Sheets. Your linked sections are updated.');
 }catch(error){status(`Save incomplete: ${error.message}\n${queue.length?'Your pending entry is retained. Use Refresh & sync to finish.':'Keep this page open and copy your entry if local storage is unavailable.'}`,true);}finally{busy=false;controls();}
};
$('new-draft').onclick=async()=>{if(!confirm('Start a new draft? Pending saves are kept; this draft will be cleared.'))return;try{await resetDraft();status('Ready for a new session.');}catch(error){status(error.message,true);}};
$('save-settings').onclick=async()=>{try{const value=$('worker-url').value.trim();if(value){const url=new URL(value);if(url.protocol!=='https:'&&!(['localhost','127.0.0.1'].includes(url.hostname)&&url.protocol==='http:'))throw new Error('Use an HTTPS Worker URL.');if(url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Enter the Worker origin only, without a path or credentials.');}await write('worker-url',value);status('Connection setting saved on this device.');}catch(error){status(error.message,true);}};
$('diagnostics').onclick=async()=>{const report=JSON.stringify({version:'next-0.5',time:new Date().toISOString(),userAgent:navigator.userAgent,input:'native-dictation-or-text',pendingSaves:queue.length,storageFailed,errors:logs},null,2);try{await navigator.clipboard.writeText(report);status('Diagnostics copied. No tokens or training content are included.');}catch{status(report);}};
window.addEventListener('online',async()=>{if(busy||!queue.length)return;busy=true;controls();try{await flushQueue();status('Pending entries synced to Google Sheets.');}catch(error){status(`Pending sync: ${error.message}`,true);}finally{busy=false;controls();}});
async function restoreEarlierRecording(){
 const metadata=await read('recording');if(!metadata)return;const chunks=[];for(let i=0;i<metadata.count;i++){const chunk=await read(`audio-${metadata.id}-${i}`);if(chunk)chunks.push(chunk);}if(!chunks.length)return;
 const blob=new Blob(chunks,{type:metadata.type});legacyAudioUrl=URL.createObjectURL(blob);$('earlier-recording').hidden=false;$('earlier-audio').src=legacyAudioUrl;$('earlier-download').href=legacyAudioUrl;$('earlier-download').download=blob.type.includes('mp4')?'earlier-dojo-recap.m4a':'earlier-dojo-recap.webm';
}
$('discard-audio').onclick=async()=>{if(!confirm('Delete the earlier recording from this device? Download it first if you want to keep it.'))return;try{const metadata=await read('recording');if(metadata){for(let i=0;i<metadata.count;i++)await remove(`audio-${metadata.id}-${i}`);await remove('recording');}$('earlier-recording').hidden=true;if(legacyAudioUrl)URL.revokeObjectURL(legacyAudioUrl);status('Earlier recording removed from this device.');}catch(error){status(error.message,true);}};
try{
 const saved=await read('draft');if(saved)draft={...newDraft(),...saved,links:{...newDraft().links,...saved.links}};
 queue=await read('queue')||[];
 // Preserve unfinished saves made before explicit creation toggles existed.
 for(const entry of queue){if(!Object.hasOwn(entry,'_createTechnique'))entry._createTechnique=!!entry.technique_label;if(!Object.hasOwn(entry,'_createTakedown'))entry._createTakedown=!!entry.takedown_label;}
 workbook=await read('workbook')||null;for(const tab of new Set(['data','techniques','pearls',...Object.keys(workbook?.sheets||{})])){const snapshot=await read('mirror-'+tab);if(snapshot)snapshots[tab]={...snapshot,stale:true};}
 $('worker-url').value=await read('worker-url')||'https://yhe-dojo-next.livingthesearch1.workers.dev';$('transcript').value=draft.transcript;
 updateExistingOptions();fillFields();if(draft.reviewOpen)$('review').hidden=false;
 await restoreEarlierRecording();route();controls();if(queue.length)status(`${queue.length} pending save(s) retained. Use Refresh & sync to finish.`);
}catch(error){storageFailed=true;status('Local storage could not be loaded. Keep this page open and copy your words before leaving.',true);}

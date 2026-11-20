import {isReference} from './library.js?v=9';
import {makePrep,searchHistory,resourceURL} from './insights.js?v=20';
import {SHEET_ID} from './sheets.js?v=9';
export function preferredPrepVoice(voices){return voices.find(voice=>/^en[-_]AU$/i.test(voice.lang)&&/karen|catherine|female/i.test(voice.name))||null;}
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
export function sourceLink(source,snapshots){
 if(source.tab==='__course_references'){const url=resourceURL(source.row);if(!url)return el('span','Source link unavailable');const link=el('a',source.row.kind==='machine_transcript_unreviewed'?'Open course account (see lesson above)':'Read source · '+source.row.kind.replaceAll('_',' '));link.href=url;link.target='_blank';link.rel='noopener';return link;}
 if(source.tab==='privates'&&source.row.id){const link=el('a','Open private lesson');link.href='#privates/'+encodeURIComponent(source.row.id);return link;}
 const link=el('a',source.tab==='data'&&source.row.id?'Open journal entry':'Open source Sheet tab');
 if(source.tab==='data'&&isReference(source.row)){link.textContent=source.row.entry_type==='fundamental'?'Open fundamental':'Open map reference';link.href=source.row.entry_type==='fundamental'?'#fundamentals/'+encodeURIComponent(source.row.id):'#strategy/'+encodeURIComponent(source.row.map_node);}
 else if(source.tab==='data'&&source.row.id)link.href='#journal/'+encodeURIComponent(source.row.id);
 else{link.href=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit${snapshots[source.tab]?.sheetId!==undefined?'#gid='+snapshots[source.tab].sheetId:''}`;link.target='_blank';link.rel='noopener';}
 return link;
}
export function renderPrep(container,snapshots){
 const prep=makePrep(snapshots);container.replaceChildren();
 if(!prep.sections.length){container.append(el('p','Connect Google and refresh your sources to build a briefing from your actual training notes.','empty-state'));return prep;}
 const availability=el('p',`${prep.estimatedSeconds?`About ${prep.estimatedSeconds} seconds · `:''}Built from your saved notes, without an AI call.`,'hint');container.append(availability);
 if(prep.missing.length||prep.stale.length)container.append(el('p',`${prep.missing.length?'Not loaded: '+prep.missing.join(', ')+'. ':''}${prep.stale.length?'Cached sources: '+prep.stale.join(', ')+'. ':''}Use Refresh all sources to check the latest Sheet data.`,'source-notice'));
 for(const section of prep.sections){const article=el('article',undefined,'prep-section');article.append(el('h3',section.title),el('p',section.body),sourceLink(section.source,snapshots));container.append(article);}
 return prep;
}
export function renderSearch(container,snapshots,query){
 container.replaceChildren();
 if(!query.trim()){container.append(el('p','Search across your loaded journal, techniques, pearls, and other Sheet tabs. Matches link back to their source.','empty-state'));return;}
 const results=searchHistory(snapshots,query);
 container.append(el('p',`${results.length} matching records · ${Object.keys(snapshots).length} tabs loaded. Keyword retrieval, not an AI interpretation.`,'hint'));
 for(const result of results){const article=el('article',undefined,'session');article.append(el('small',`${result.tab}${result.date?' · '+result.date:''}${result.stale?' · cached':''}`),el('h3',result.title),el('p',result.detail),sourceLink({tab:result.tab,row:result.row},snapshots));container.append(article);}
 if(!results.length)container.append(el('p','No matching records in the loaded tabs. Try fewer words, or refresh all sources.','empty-state'));
}
export function renderResources(container,snapshots,query='',limit=40){
 container.replaceChildren();const all=snapshots.library?.rows;
 if(!all)container.append(el('p','Refresh all sources to load the library from Google Sheets.','empty-state'));
 const imported=(snapshots.__course_references?.rows||[]).filter(row=>!query||[row.title,row.summary,...row.tags].join(' ').toLowerCase().includes(query.toLowerCase()));
 for(const reference of imported.slice(0,limit)){const article=el('article',undefined,'session');article.append(el('h3',reference.title),el('small','Imported reference · '+reference.kind.replaceAll('_',' ')),el('p',reference.summary),el('p',reference.evidence,'hint'),sourceLink({tab:'__course_references',row:reference},snapshots));container.append(article);}
 const rows=(all||[]).filter(row=>!query||Object.values(row).join(' ').toLowerCase().includes(query.toLowerCase()));
 container.append(el('p',`${rows.length} Sheet resources · ${imported.length} imported references · ${!all?'Sheet library not loaded':snapshots.library?.stale?'cached on this device':'from Google Sheets'}`,'hint'));
 for(const resource of rows.slice(0,limit)){const article=el('article',undefined,'session');article.append(el('h3',resource.title||'Untitled resource'),el('small',[resource.source,resource.type,resource.tags].filter(Boolean).join(' · ')));if(resource.notes)article.append(el('p',resource.notes));const url=resourceURL(resource);if(url){const link=el('a','Open lesson'+(Number(resource.start_seconds)>0?' at '+Math.floor(resource.start_seconds/60)+':'+String(Math.floor(resource.start_seconds%60)).padStart(2,'0'):''));link.href=url;link.target='_blank';link.rel='noopener';article.append(link);}else article.append(el('p','Specific video or lesson URL needed in the Sheet; homepage links are not opened.','source-notice'));container.append(article);}
 if(imported.length>limit||rows.length>limit){container.append(el('p','Showing the first '+limit+' matches from each library. Search to narrow the results.','hint'));const more=el('button','Show more resources','quiet');more.onclick=()=>renderResources(container,snapshots,query,limit+40);container.append(more);}
}
export class PrepPlayback{
 constructor({state,play,pause,stop}){
  Object.assign(this,{state,play,pause,stop});this.active=false;
  this.play.onclick=()=>this.start();this.pause.onclick=()=>this.togglePause();this.stop.onclick=()=>this.cancel();
  if(!window.speechSynthesis){this.play.disabled=true;this.state.textContent='Speech playback is unavailable in this browser. The briefing is readable below.';return;}
 }

 update(text){if(this.active&&this.text!==text)this.cancel();this.text=text;this.play.disabled=!window.speechSynthesis||!text;}
 start(){if(!this.text||!window.speechSynthesis)return;this.cancel(false);const utterance=new SpeechSynthesisUtterance(this.text);const voice=preferredPrepVoice(speechSynthesis.getVoices());if(voice)utterance.voice=voice;utterance.rate=0.95;this.utterance=utterance;this.active=true;this.state.textContent='Playing your prep. Keep this page open; screen-off playback needs testing on your device.';this.play.disabled=true;this.pause.disabled=false;this.stop.disabled=false;utterance.onend=()=>{if(this.utterance===utterance)this.finish('Briefing complete.');};utterance.onerror=()=>{if(this.utterance===utterance)this.finish('Playback stopped. Tap Play to retry, or read the briefing below.');};speechSynthesis.speak(utterance);}
 togglePause(){if(!this.active)return;if(speechSynthesis.paused){speechSynthesis.resume();this.pause.textContent='Pause';this.state.textContent='Playing your prep.';}else{speechSynthesis.pause();this.pause.textContent='Resume';this.state.textContent='Paused.';}}
 finish(message){this.active=false;this.play.disabled=!this.text;this.pause.disabled=true;this.pause.textContent='Pause';this.stop.disabled=true;this.state.textContent=message;}
 cancel(message=true){this.utterance=null;if(window.speechSynthesis)speechSynthesis.cancel();this.finish(message?'Playback stopped.':'');}
}


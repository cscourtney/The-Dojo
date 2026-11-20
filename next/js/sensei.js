import {buildSenseiContext} from './sensei-context.js?v=22';
import {sourceLink} from './workspace-tools.js?v=22';
const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
export function renderSenseiAnswer(host,record,snapshots){
 host.replaceChildren();const answer=record.answer;
 const registry=new Map(record.sources.map(s=>[s.id,s]));
 const section=(title,value)=>{if(!value?.text)return;const article=el('article');article.className='session';article.append(el('h3',title),el('p',value.text));
  const details=el('details');details.append(el('summary','Sources'));
  for(const id of value.source_ids||[]){const source=registry.get(id);if(!source)continue;const p=el('p',source.title+' · '+(source.kind==='training_record'?'your training record':source.kind.replaceAll('_',' '))+(source.stale?' · cached':''));p.append(document.createTextNode(' · '),sourceLink({tab:source.tab,row:source.source_row},snapshots));details.append(p);if(source.evidence)details.append(el('p',source.evidence));}article.append(details);host.append(article);};
 section('Sensei’s answer',answer.summary);for(const [i,focus]of answer.focus.entries())section('Focus '+(i+1),focus);section('Suggested practice experiment',answer.practice);
 if(answer.uncertainties.length){const d=el('details');d.append(el('summary','What remains uncertain'));for(const warning of answer.uncertainties)d.append(el('p',warning));host.append(d);}
 const c=record.coverage;host.append(el('p',`Searched ${c.history_records_scanned} unique training records and ${c.reference_notes_available} imported references; selected ${c.history_records_selected} training records and ${c.reference_notes_selected} references for this answer. ${c.duplicate_rows_ignored} duplicate rows ignored. References are available on this device only.`));
}
function validateAnswer(answer,context){
 const ids=new Set(context.sources.map(s=>s.id));
 const section=x=>{if(!x||typeof x.text!=='string'||x.text.length>1500||!Array.isArray(x.source_ids)||x.source_ids.some(id=>!ids.has(id))||(x.text.trim()&&ids.size&&!x.source_ids.length))throw Error('The answer contained an unsupported source. Try again.');};
 if(!answer||!Array.isArray(answer.focus)||answer.focus.length>3||!Array.isArray(answer.uncertainties)||answer.uncertainties.some(x=>typeof x!=='string'))throw Error('The answer could not be read. Try again.');
 section(answer.summary);section(answer.practice);section(answer.prep);answer.focus.forEach(section);return answer;
}
export class Sensei{
 constructor({getSnapshots,refreshTraining,authorize,getToken,getURL,saveBriefing,onBriefing}){Object.assign(this,{getSnapshots,refreshTraining,authorize,getToken,getURL,saveBriefing,onBriefing});this.record=null;this.busy=false;
  document.getElementById('sensei-form').onsubmit=event=>{event.preventDefault();this.ask(document.getElementById('sensei-question').value,document.getElementById('sensei-mode').value);};
  document.getElementById('sensei-use-prep').onclick=()=>this.useBriefing();
  document.getElementById('prep-ai-build').onclick=()=>this.ask('Build a concise class briefing: one focus supported by my dated training notes, one overall strategy, two course-informed cues, one explicitly suggested positional experiment. Keep the latest-class recap short and distinguish practiced topics from actual reported struggles.','both',true);
 }
 async useBriefing(){if(!this.record?.answer.prep.text||this.busy)return;try{await this.saveBriefing(this.record);this.onBriefing(this.record);document.getElementById('sensei-state').textContent='Saved as your Class Prep briefing on this device.';location.hash='prep';}catch{document.getElementById('sensei-state').textContent='The briefing could not be saved on this device. The answer remains visible.';}}
 async ask(question,mode,forPrep=false){
  if(this.busy)return;question=question.trim();const state=document.getElementById('sensei-state'),prepState=document.getElementById('prep-ai-state');
  const notice=text=>{state.textContent=text;if(forPrep)prepState.textContent=text;};
  if(!question||question.length>1500)return notice('Enter a question of up to 1,500 characters.');
  this.busy=true;for(const id of ['sensei-ask','sensei-use-prep','prep-ai-build'])document.getElementById(id).disabled=true;
  try{
   const endpoint=new URL('/ask-sensei',this.getURL());if(endpoint.protocol!=='https:')throw Error('Set a valid HTTPS AI connection in Settings.');
   notice('Checking the Sensei connection…');
   const capability=await fetch(new URL('/sensei-status',endpoint),{signal:AbortSignal.timeout(12000)});const ready=await capability.json().catch(()=>({}));
   if(!capability.ok||!ready.sensei)throw Error('AI Sensei is not available on this connection yet. Your notes and imports are safe.');
   await this.authorize();if(mode!=='course'){notice('Refreshing your training notes…');await this.refreshTraining();}
   const snapshots=this.getSnapshots();const context=buildSenseiContext(snapshots,question,{mode});
   if(!context.sources.length)throw Error(mode==='course'?'Import reference notes in Resources before asking about a course.':'No matching evidence is loaded. Refresh your sources or import course notes.');
   notice(`Thinking through ${context.coverage.history_records_selected} training records and ${context.coverage.reference_notes_selected} reference notes…`);
   const timer=setTimeout(()=>notice('Still thinking through the sources. Your question is retained.'),18000);
   let response;try{response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+this.getToken()},body:JSON.stringify(context.payload),signal:AbortSignal.timeout(75000)});}finally{clearTimeout(timer);}
   const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||`Sensei could not finish (HTTP ${response.status}).`);
   this.record={question,mode,answer:validateAnswer(data.answer,context),sources:context.sources,coverage:context.coverage,generated_at:new Date().toISOString()};
   renderSenseiAnswer(document.getElementById('sensei-answer'),this.record,snapshots);notice('Answer ready. Open Sources beneath a section to check its evidence.');
   if(forPrep&&this.record.answer.prep.text){await this.saveBriefing(this.record);this.onBriefing(this.record);prepState.textContent='AI briefing ready. Play it below or read its sources.';}
  }catch(error){notice(error.name==='TimeoutError'?'Sensei took too long. Your question is retained; try a narrower question.':error.message);}
  finally{this.busy=false;document.getElementById('sensei-ask').disabled=false;document.getElementById('prep-ai-build').disabled=false;document.getElementById('sensei-use-prep').disabled=!this.record?.answer.prep.text;}
 }
}

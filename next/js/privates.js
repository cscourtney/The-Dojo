import {videoURL} from './links.js?v=14';
import {read,write,remove} from './store.js';
import {localToday,sortedEntries,normalize} from './journal.js?v=14';
const $=id=>document.getElementById(id);
const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
export class PrivateLessons{
 constructor({getSnapshot,onSave,onRefresh,authorize,onBusy}){
  Object.assign(this,{getSnapshot,onSave,onRefresh,authorize,onBusy});this.draft=null;this.pending=null;this.writes=Promise.resolve();this.busy=false;
  $('private-form').oninput=()=>{if(this.pending)return;this.collect();this.persist().catch(()=>this.notice('Local storage failed. Keep the page open and copy your notes.',true));};
  $('private-form').onsubmit=event=>{event.preventDefault();this.submit();};$('private-refresh').onclick=()=>this.refresh();$('private-filter').oninput=()=>this.render();
  $('private-new').onclick=async()=>{if(this.pending||!confirm('Clear this unsaved private lesson draft?'))return;this.draft=this.fresh();await this.persist();this.fill();};
 }
 fresh(){return {id:crypto.randomUUID(),date:localToday(),instructor:'',focus:'',notes:'',video_url:'',created_at:new Date().toISOString()};}
 async restore(){this.draft=await read('private-draft')||this.fresh();this.pending=await read('private-pending')||null;if(this.pending)this.draft=this.pending;this.fill();if(this.pending)this.notice('This lesson has a pending save. Retry Save private lesson to confirm the same entry. Your notes are retained.');}
 collect(){for(const key of ['date','instructor','focus','notes','video_url'])this.draft[key]=$('private-'+key).value.trim();return this.draft;}
 persist(){const draft=structuredClone(this.draft);this.writes=this.writes.catch(()=>{}).then(()=>write('private-draft',draft));return this.writes;}
 fill(){for(const key of ['date','instructor','focus','notes','video_url'])$('private-'+key).value=this.draft[key]||'';this.setBusy(this.externalBusy);}
 notice(message,error=false){$('private-state').hidden=false;$('private-state').textContent=message;$('private-state').classList.toggle('error',error);}
 setBusy(value){this.externalBusy=value;for(const input of $('private-form').querySelectorAll('input,textarea'))input.disabled=!!(this.busy||value||this.pending);$('private-save').disabled=$('private-refresh').disabled=!!(this.busy||value);$('private-new').disabled=!!(this.busy||value||this.pending);}
 render(selected=''){
  const snapshot=this.getSnapshot();$('private-source').textContent=snapshot?.loadError?'Refresh failed: '+snapshot.loadError:snapshot?.missing?'Your first save will create the Private Lessons table in Dojo_Master.':!snapshot?'Connect Google to load your private lessons.':snapshot.stale?'Cached on this device':'From Google Sheets';
  const list=$('private-list');list.replaceChildren();const filter=normalize($('private-filter').value);
  for(const row of sortedEntries(snapshot?.rows||[])){if(selected&&row.id!==selected)continue;if(filter&&!Object.values(row).some(value=>normalize(value).includes(filter)))continue;const card=el('details');card.className='session';card.open=!!selected;const summary=el('summary');summary.append(el('small',(row.date||'Undated')+(row.instructor?' · '+row.instructor:'')),el('strong',row.focus||'Private lesson'));card.append(summary,el('p',row.notes||'No notes recorded.'));for(const [key,value]of Object.entries(row)){if(!['id','date','instructor','focus','notes','video_url','created_at'].includes(key)&&value){card.append(el('strong',key),el('p',String(value)));}}const url=videoURL(row.video_url);if(url){const link=el('a','Open lesson video ↗');link.href=url;link.target='_blank';link.rel='noopener';card.append(link);}else if(row.video_url)card.append(el('p','The saved video link is not a valid HTTP/HTTPS URL.'));list.append(card);}
  if(!list.children.length)list.append(el('p',filter?'No matching private lessons.':'No private lessons in the loaded snapshot yet.'));
 }
 async submit(){
  if(this.busy||this.externalBusy)return;const entry=structuredClone(this.pending||this.collect());if(!entry.notes)return this.notice('Enter lesson notes before saving.',true);if(entry.video_url&&!videoURL(entry.video_url))return this.notice('Enter a complete HTTP or HTTPS video link.',true);
  this.busy=true;this.onBusy(true);this.setBusy(true);const auth=this.authorize().then(()=>null,error=>error);
  try{await this.writes;await write('private-pending',entry);this.pending=entry;this.notice('Retained on this device. Saving the private lesson…');const error=await auth;if(error)throw error;await this.onSave(entry);await remove('private-pending');this.pending=null;this.draft=this.fresh();await this.persist();this.fill();this.render();this.notice('Private lesson saved and confirmed in Google Sheets. It will be included in your next notebook export.');}
  catch(error){this.notice('Save incomplete: '+error.message+' Your notes are retained; retry this same save.',true);}
  finally{this.busy=false;this.onBusy(false);this.setBusy(false);}
 }
 async refresh(){if(this.busy||this.externalBusy)return;this.busy=true;this.onBusy(true);try{await this.authorize();await this.onRefresh();this.render();this.notice('Private lessons refreshed.');}catch(error){this.notice(error.message,true);}finally{this.busy=false;this.onBusy(false);this.setBusy(false);}}
}

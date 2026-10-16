import {ORG_TABS,categoryDefinitions,categoryName} from './organization.js?v=12';
import {POSITIONS,MAP_NODES,localToday,techniqueName,canonicalMapKey} from './journal.js?v=12';
import {categoriesFor,keyForTechnique} from './library.js?v=12';
import {read,write,remove} from './store.js';
const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
export class LibraryEditor{
 constructor({host,getSnapshots,onSave,onNotice,authorize,onBusy}){
  Object.assign(this,{host,getSnapshots,onSave,onNotice,authorize,onBusy});this.draft=null;this.pending=null;this.busy=false;this.writes=Promise.resolve();
  this.actions=el('div');this.actions.className='actions library-actions';
  this.add=el('button');this.add.type='button';this.add.className='primary';this.add.id='library-add';this.add.onclick=()=>this.open(this.view==='strategy'?'techniques':this.view);
  this.link=el('button','Link existing technique');this.link.id='library-link';this.link.type='button';this.link.className='quiet';this.link.onclick=()=>this.open('map-link');
  this.resume=el('button','Resume saved addition');this.resume.type='button';this.resume.className='quiet';this.resume.onclick=()=>this.show();
  this.actions.append(this.add,this.link,this.resume);host.append(this.actions);
  this.form=el('form');this.form.id='library-form';this.form.className='library-form';this.form.hidden=true;
  this.title=el('h3');this.explanation=el('p');this.explanation.className='hint';this.fields=el('div');this.fields.className='fields';
  this.message=el('p');this.message.id='library-save-state';this.message.className='status';this.message.hidden=true;this.message.setAttribute('role','status');
  const buttons=el('div');buttons.className='actions';this.save=el('button','Save to Google Sheets');this.save.id='library-save';this.save.className='primary';this.save.type='submit';this.close=el('button','Close');this.close.className='quiet';this.close.type='button';this.close.onclick=()=>{this.form.hidden=true;this.update(this.view,this.selected);};
  buttons.append(this.save,this.close);this.form.append(this.title,this.explanation,this.fields,buttons,this.message);host.append(this.form);
  this.form.onsubmit=event=>{event.preventDefault();this.submit();};
 }
 async restore(){this.draft=await read('library-draft')||null;this.pending=await read('library-pending')||null;if(this.pending&&!this.draft)this.draft={kind:this.pending.kind,fields:this.pending};this.update(this.view,this.selected);}
 setBusy(value){this.externalBusy=value;this.update(this.view,this.selected);}
 update(view,selected=''){
  if(this.view&&this.view!==view)this.form.hidden=true;
  this.view=view;this.selected=canonicalMapKey(selected);this.add.textContent={techniques:'Add technique',pearls:'Add pearl',fundamentals:'Add fundamental',strategy:'Add technique here'}[view]||'Add';this.link.hidden=view!=='strategy';
  this.resume.hidden=!this.draft||!this.form.hidden;this.resume.textContent=this.pending?'Resume pending save':'Resume saved addition';
  this.add.disabled=this.link.disabled=!!(this.busy||this.externalBusy||this.pending);this.resume.disabled=!!(this.busy||this.externalBusy);
  this.save.disabled=!!(this.busy||this.externalBusy);this.close.disabled=this.busy;
  for(const button of this.fields.querySelectorAll('button'))button.disabled=!!(this.busy||this.externalBusy||this.pending);
  for(const input of this.fields.querySelectorAll('input,textarea,select'))input.disabled=!!(this.busy||this.externalBusy||this.pending)||input.dataset.unavailable==='true';
 }
 notice(message,error=false){this.message.hidden=false;this.message.textContent=message;this.message.classList.toggle('error',error);}
 persist(){const draft=structuredClone(this.draft);this.writes=this.writes.catch(()=>{}).then(()=>write('library-draft',draft));return this.writes;}
 open(kind){
  if(this.draft){this.show();this.notice('Your previous addition is still here. Save it, or discard it before starting another.');return;}
  this.draft={kind,id:'direct:'+crypto.randomUUID(),created_at:new Date().toISOString(),fields:{date:localToday(),gi:'',map_node:this.view==='strategy'?this.selected:'',position:''}};
  this.persist().catch(()=>this.notice('Draft storage is unavailable. Keep this page open and copy your text.',true));this.show();
 }
 field(key,label,type='text',options=[]){
  const wrap=el('div');if(type==='textarea')wrap.className='wide';const caption=el('label',label);caption.htmlFor='library-'+key;
  const input=el(type==='textarea'?'textarea':type==='select'?'select':'input');input.id='library-'+key;input.name=key;
  if(type==='select'){for(const [value,title]of [['','Choose…'],...options]){const option=el('option',title);option.value=value;input.append(option);}}else if(type==='textarea')input.rows=4;else input.type=type;
  input.value=this.draft.fields[key]||'';input.oninput=()=>{this.draft.fields[key]=input.value;this.persist().catch(()=>this.notice('Could not retain this draft locally. Keep the page open.',true));};
  wrap.append(caption,input);this.fields.append(wrap);return input;
 }
 show(){
  if(!this.draft)return;this.form.hidden=false;this.message.hidden=true;this.fields.replaceChildren();const {kind}=this.draft;
  this.title.textContent={techniques:'New technique',pearls:'New pearl',fundamentals:'New fundamental','map-link':'Link a technique to the map'}[kind];
  this.explanation.textContent=kind==='fundamentals'?'Saved in the existing Sheet’s Fundamentals column as a reference note, separate from training sessions.':kind==='map-link'?'Adds a map reference without duplicating the technique or changing its other links.':'Add directly to your Google Sheet. No workout entry is required.';
  this.field('date','Date','date').required=true;
  if(kind==='techniques'){
   this.field('label','Technique name').required=true;this.field('position','Position','select',POSITIONS).required=true;
   const category=this.field('danaher_category','Danaher category');const list=el('datalist');list.id='library-categories';for(const name of categoriesFor(this.getSnapshots())){const option=el('option');option.value=name;list.append(option);}this.fields.append(list);category.setAttribute('list',list.id);
   const snapshot=this.getSnapshots().techniques;
   if(!snapshot||(snapshot.headerKeys||snapshot.headers).includes('danaher_category')===false){category.dataset.unavailable='true';category.disabled=true;const hint=el('p',snapshot?'The Sheet has no Danaher category column. This addition stays in Needs review; no columns will be added automatically.':'Connect and refresh to load your saved categories. You can add an unclassified technique meanwhile.');hint.className='hint';this.fields.append(hint);}
   this.field('description','Detailed description','textarea').required=true;this.field('gi','Gi / No-gi','select',[['gi','Gi'],['nogi','No-gi']]);
   this.field('map_node','Strategy map reference (optional)','select',this.nodeOptions());
  }else if(kind==='map-link'){
   const seen=new Set();const options=[];for(const row of this.getSnapshots().techniques?.rows||[]){const key=keyForTechnique(row);if(!techniqueName(row)||seen.has(key))continue;seen.add(key);options.push([key,techniqueName(row)+' · '+row.position]);}
   this.field('existing','Existing technique','select',options).required=true;this.field('map_node','Strategy map reference','select',this.nodeOptions()).required=true;
   if(!options.length)this.notice('No saved techniques loaded. Close this form, connect Google and refresh Techniques, or add a new technique here.',true);
  }else if(kind==='pearls')this.field('pearl','Pearl','textarea').required=true;
  else{this.field('lesson','Title (optional)');this.field('fundamentals','Fundamental','textarea').required=true;}
  if(!this.pending){const discard=el('button','Discard this draft');discard.type='button';discard.className='quiet wide';discard.onclick=async()=>{try{await this.writes;await remove('library-draft');this.draft=null;this.form.hidden=true;this.update(this.view,this.selected);}catch{this.notice('Could not clear the saved draft.',true);}};this.fields.append(discard);}
  this.update(this.view,this.selected);this.form.scrollIntoView({block:'start',behavior:'smooth'});
  if(this.pending)this.notice('This addition has a pending save. Retry to confirm the same record without adding it twice.');
 }
 nodeOptions(){const nodes=this.getSnapshots()[ORG_TABS.nodes];return nodes&&!nodes.missing&&!nodes.loadError?(nodes.rows||[]).map(row=>[row.id,row.title]):MAP_NODES;}
 async submit(){
  if(this.busy||this.externalBusy)return;let entry=this.pending;
  if(!entry){
   const f=Object.fromEntries(Object.entries(this.draft.fields).map(([key,value])=>[key,String(value).trim()]));const kind=this.draft.kind;
   if(!/^\d{4}-\d{2}-\d{2}$/.test(f.date))return this.notice('Choose a date.',true);
   if(kind==='techniques'&&(!f.label||!f.position||!f.description))return this.notice('Enter the technique name, position, and description.',true);
   if(kind==='pearls'&&!f.pearl||kind==='fundamentals'&&!f.fundamentals)return this.notice('Enter your note before saving.',true);
   if(kind==='techniques'&&f.danaher_category&&!this.getSnapshots()[ORG_TABS.categories]?.missing&&this.getSnapshots()[ORG_TABS.categories]&&!categoryDefinitions(this.getSnapshots()).some(row=>row.label===categoryName(f.danaher_category,this.getSnapshots())) )return this.notice('Add this category under Categories & map organization first, so its definition and order are saved in Sheets.',true);
   entry={...f,kind,id:this.draft.id,created_at:this.draft.created_at};
   if(kind==='pearls'){entry.entry_id=entry.id;delete entry.id;}
   if(kind==='fundamentals')entry.entry_type='fundamental';
   if(kind==='map-link'){
    const row=(this.getSnapshots().techniques?.rows||[]).find(row=>keyForTechnique(row)===f.existing);
    if(!row||!f.map_node)return this.notice('Choose an existing technique and map position.',true);
    Object.assign(entry,{entry_type:'reference',technique_label:techniqueName(row),position:row.position});delete entry.existing;
   }
  }
  this.busy=true;this.onBusy(true);this.update(this.view,this.selected);
  const auth=this.authorize().then(()=>null,error=>error);
  try{
   await this.writes;await write('library-pending',entry);this.pending=entry;this.notice('Retained on this device. Saving to Google Sheets…');
   const authError=await auth;if(authError)throw authError;await this.onSave(entry);await remove('library-pending');this.pending=null;await remove('library-draft');this.draft=null;this.form.hidden=true;this.onNotice('Saved and confirmed in Google Sheets. Your library and map are updated.');
  }catch(error){if(error.safeToEdit){try{await remove('library-pending');this.pending=null;}catch{/* Keep frozen if pending storage cannot be cleared. */}}this.notice('Save incomplete: '+error.message+' Your addition is retained here. Retry this save to finish.',true);}
  finally{this.busy=false;this.onBusy(false);this.update(this.view,this.selected);}
 }
}

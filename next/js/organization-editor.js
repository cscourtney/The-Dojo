import {ORG_TABS,categoryDefinitions} from './organization.js?v=12';
import {read,write,remove} from './store.js';
const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
export class OrganizationEditor{
 constructor({host,getSnapshots,onSetup,onRefresh,onSave,onBusy,authorize}){
  Object.assign(this,{getSnapshots,onSetup,onRefresh,onSave,onBusy,authorize});this.draft=null;this.pending=null;this.saving=false;this.writes=Promise.resolve();
  this.details=el('details');this.details.className='organization';this.details.id='organization';this.details.append(el('summary','Categories & map organization'));host.append(this.details);
  this.state=el('p');this.state.className='hint';this.details.append(this.state);
  const actions=el('div');actions.className='actions';this.setup=el('button','Save organization to Google Sheet');this.setup.id='organization-setup';this.setup.className='primary';this.setup.onclick=()=>this.runSetup();this.refresh=el('button','Refresh organization');this.refresh.id='organization-refresh';this.refresh.className='quiet';this.refresh.onclick=()=>this.runRefresh();actions.append(this.setup,this.refresh);this.details.append(actions);
  const caption=el('label','Edit organization');caption.htmlFor='organization-kind';this.kind=el('select');this.kind.id='organization-kind';for(const [key,title]of Object.entries({categories:'Categories',nodes:'Map positions',edges:'Map connections'})){const o=el('option',title);o.value=key;this.kind.append(o);}this.kind.onchange=()=>this.populate();this.details.append(caption,this.kind);
  this.records=el('select');this.records.id='organization-record';this.records.setAttribute('aria-label','Organization record');this.records.onchange=()=>this.choose();this.details.append(this.records);
  this.resume=el('button','Resume organization draft');this.resume.className='quiet';this.resume.onclick=()=>this.show();this.details.append(this.resume);
  this.form=el('form');this.form.id='organization-form';this.form.className='library-form';this.form.hidden=true;this.title=el('h3');this.fields=el('div');this.fields.className='fields';this.form.append(this.title,this.fields);
  const buttons=el('div');buttons.className='actions';this.save=el('button','Save organization change');this.save.id='organization-save';this.save.className='primary';this.save.type='submit';this.discard=el('button','Discard organization draft');this.discard.className='quiet';this.discard.type='button';this.discard.onclick=async()=>{if(this.saving||this.externalBusy)return;await this.writes;await remove('organization-pending');await remove('organization-draft');this.draft=this.pending=null;this.form.hidden=true;this.update();};buttons.append(this.save,this.discard);this.form.append(buttons);this.form.onsubmit=event=>{event.preventDefault();this.submit();};this.details.append(this.form);
  this.message=el('p');this.message.id='organization-state';this.message.className='status';this.message.hidden=true;this.message.setAttribute('role','status');this.details.append(this.message);this.update();
 }
 async restore(){this.draft=await read('organization-draft')||null;this.pending=await read('organization-pending')||null;if(this.pending)this.draft=this.pending;this.update();}
 notice(message,error=false){this.message.hidden=false;this.message.textContent=message;this.message.classList.toggle('error',error);}
 setBusy(value){this.externalBusy=value;this.update();}
 update(){
  const s=this.getSnapshots();const ready=Object.values(ORG_TABS).every(tab=>s[tab]&&!s[tab].missing&&!s[tab].loadError&&!s[tab].stale);
  this.state.textContent=ready?'Category names, order, map positions, and connections are stored in Google Sheets. Changes here are read back after saving.':'Organization is not fully loaded from Sheets yet. Save it once to preserve the current map and existing categories, or refresh if already set up.';
  this.setup.hidden=ready;this.kind.disabled=this.records.disabled=!ready||this.saving||this.externalBusy;this.setup.disabled=this.refresh.disabled=!!(this.saving||this.externalBusy);this.resume.hidden=!this.draft||!this.form.hidden;this.save.disabled=this.discard.disabled=!!(this.saving||this.externalBusy);
  for(const input of this.fields.querySelectorAll('input,select,textarea'))input.disabled=this.saving||this.externalBusy||!!this.pending;
  const previous=this.records.value;this.populate(previous);
 }
 populate(previous=''){
  const tab=ORG_TABS[this.kind.value];this.records.replaceChildren();const add=el('option','New '+({categories:'category',nodes:'map position',edges:'connection'}[this.kind.value]));add.value='';this.records.append(add);
  const snapshots=this.getSnapshots();for(const row of snapshots[tab]?.rows||[]){const option=el('option',row.label||row.title||`${row.from_node} → ${row.to_node}`);option.value=row.id;this.records.append(option);}this.records.value=previous;
  // Selecting New is an explicit action; do not replace a retained draft on refresh.
  if(!this.records.value)this.records.value='';
  if(!this.add){this.add=el('button','Open selected / new record');this.add.type='button';this.add.className='quiet';this.add.onclick=()=>this.choose();this.records.after(this.add);}
  this.add.disabled=this.kind.disabled;
 }
 choose(){
  if(this.draft){this.show();this.notice('Your previous organization draft is retained. Finish or discard it before opening another record.');return;}
  const kind=this.kind.value,tab=ORG_TABS[kind];const row=(this.getSnapshots()[tab]?.rows||[]).find(row=>row.id===this.records.value);
  this.draft={kind,tab,expected:row?{...row}:null,object:row?{...row}:{id:kind.slice(0,-1)+':'+crypto.randomUUID(),sort_order:'100',...(kind==='nodes'?{type:'n',x:'100',y:'100'}:kind==='edges'?{enabled:'true'}:{aliases:''})}};this.persist();this.show();
 }
 persist(){const draft=structuredClone(this.draft);this.writes=this.writes.catch(()=>{}).then(()=>write('organization-draft',draft));return this.writes.catch(()=>this.notice('Local storage failed. Keep this page open and copy your changes.',true));}
 field(key,label,type='text',options=[]){
  const wrap=el('div');const caption=el('label',label);caption.htmlFor='organization-'+key;const input=el(type==='select'?'select':type==='textarea'?'textarea':'input');input.id='organization-'+key;if(type==='select'){for(const [value,title]of options){const o=el('option',title);o.value=value;input.append(o);}}else if(type==='textarea'){input.rows=3;wrap.className='wide';}else input.type=type;
  input.value=this.draft.object[key]??'';if(type==='number'){input.min='0';input.max=key==='sort_order'?'100000':'10000';}input.oninput=()=>{this.draft.object[key]=input.value;this.persist();};wrap.append(caption,input);this.fields.append(wrap);return input;
 }
 show(){
  if(!this.draft)return;this.details.open=true;this.form.hidden=false;this.fields.replaceChildren();const kind=this.draft.kind;this.title.textContent={categories:'Category',nodes:'Map position',edges:'Map connection'}[kind];
  if(kind==='categories'){this.field('label','Category name').required=true;this.field('sort_order','Display order','number').required=true;this.field('description','Description','textarea');}
  if(kind==='nodes'){this.field('title','Position title').required=true;this.field('type','Type','select',[['n','Neutral'],['o','Offense'],['d','Defense']]);this.field('x','Horizontal position','number').required=true;this.field('y','Vertical position','number').required=true;this.field('sort_order','Display order','number');this.field('notes','Position notes','textarea');}
  if(kind==='edges'){const nodes=(this.getSnapshots()[ORG_TABS.nodes]?.rows||[]).map(row=>[row.id,row.title]);this.field('from_node','From position','select',[['','Choose…'],...nodes]).required=true;this.field('to_node','To position','select',[['','Choose…'],...nodes]).required=true;this.field('label','Connection label');this.field('sort_order','Display order','number');this.field('enabled','Show connection','select',[['true','Yes'],['false','No']]);}
  this.update();this.form.scrollIntoView({block:'start',behavior:'smooth'});if(this.pending)this.notice('A change has a pending save. Retry to confirm it before editing further.');
 }
 async runSetup(){if(this.saving||this.externalBusy)return;this.saving=true;this.onBusy(true);this.update();const auth=this.authorize();try{await auth;this.notice('Saving the current map and existing categories into Google Sheets…');await this.onSetup();this.notice('Organization is saved and confirmed in Google Sheets.');}catch(error){this.notice('Setup incomplete: '+error.message+' Retry to reconcile existing tabs; original data is retained.',true);}finally{this.saving=false;this.onBusy(false);this.update();}}
 async runRefresh(){if(this.saving||this.externalBusy)return;this.saving=true;this.onBusy(true);const auth=this.authorize();try{await auth;await this.onRefresh();this.notice('Organization refreshed from Google Sheets.');}catch(error){this.notice(error.message,true);}finally{this.saving=false;this.onBusy(false);this.update();}}
 async submit(){
  if(this.saving||this.externalBusy)return;this.saving=true;this.onBusy(true);this.update();const auth=this.authorize().then(()=>null,error=>error);
  try{
   await this.writes;const change=structuredClone(this.pending||this.draft);
   if(change.kind==='categories'&&change.expected&&change.object.label!==change.expected.label)change.object.aliases=[...new Set([...(change.object.aliases||'').split('|'),change.expected.label])].filter(Boolean).join('|');
   await write('organization-pending',change);this.pending=change;const error=await auth;if(error)throw error;
   this.notice('Saving and confirming the organization change…');await this.onSave(change);await remove('organization-pending');await remove('organization-draft');this.pending=this.draft=null;this.form.hidden=true;this.notice('Saved and confirmed in Google Sheets. Rebuild the notebook to include the change.');
  }catch(error){this.notice('Save incomplete: '+error.message+' Your draft is retained. Retry, or refresh and review the current Sheet record.',true);}finally{this.saving=false;this.onBusy(false);this.update();}
 }
}

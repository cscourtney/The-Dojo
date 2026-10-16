import {DETAIL_LABELS,sortedEntries,normalize,positionKey,techniqueName,POSITIONS,MAP_NODES,canonicalMapKey} from './journal.js?v=5';
const $=id=>document.getElementById(id);
const element=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
const link=(text,view,id)=>{const node=element('a',text);node.href=`#${view}/${encodeURIComponent(id)}`;return node;};
const positionLabel=value=>POSITIONS.find(([key])=>key===positionKey(value))?.[1]||value||'Unassigned position';
const nodeLabel=value=>MAP_NODES.find(([key])=>key===canonicalMapKey(value))?.[1]||value;
export const techniqueKey=row=>normalize(techniqueName(row))+'|'+positionKey(row.position);
function textDetail(parent,label,value){if(!value)return;const block=element('div',undefined,'journal-detail');block.append(element('dt',label),element('dd',value));parent.append(block);}
function metadata(row){return `${row.date||'Undated'} · ${{class:'Class',drill:'Home drill',technique:'Technique'}[row.entry_type]||row.entry_type||'Class'}${row.gi?' · '+(row.gi==='nogi'?'No-gi':row.gi==='gi'?'Gi':row.gi):''}`;}
export function renderJournal(snapshot,{filter='',type='',limit=12,selected=''}={}){
 const list=$('recent-list');list.replaceChildren();
 const rows=sortedEntries(snapshot?.rows||[]).filter(row=>(!type||row.entry_type===type)&&(!filter||Object.values(row).some(value=>normalize(value).includes(normalize(filter)))));
 const displayed=selected?rows.filter(row=>row.id===selected):rows.slice(0,limit);
 for(const row of displayed){
  const card=element('details',undefined,'session');card.open=!!selected;const summary=element('summary');summary.append(element('small',metadata(row)),element('strong',row.lesson||row.technique_label||row.takedown_label||'Training session'));card.append(summary);
  const details=element('dl');for(const [key,label]of DETAIL_LABELS)textDetail(details,label,row[key]);card.append(details);
  const links=element('div',undefined,'entry-links');
  if(row.technique_label)links.append(link(row.technique_label,'techniques',techniqueKey(row)));
  if(row.takedown_label)links.append(link(row.takedown_label,'techniques',techniqueKey({label:row.takedown_label,position:'takedowns'})));
  if(row.map_node)links.append(link('Strategy: '+nodeLabel(row.map_node),'strategy',row.map_node));
  if(row.pearls)links.append(link('View pearls','pearls',row.id));
  if(row.fundamentals)links.append(link('View fundamentals','fundamentals',row.id));
  card.append(links);list.append(card);
 }
 if(!displayed.length)list.append(element('p',selected?'This session is not in the loaded Sheet snapshot. Refresh to check for it.':'No matching sessions.', 'empty-state'));
 $('more-sessions').hidden=!!selected||rows.length<=limit;
 return rows.length;
}
export function renderKnowledge(view,snapshots,{filter='',selected='',cached=false}={}){
 const list=$('knowledge-list');list.replaceChildren();
 const data=sortedEntries(snapshots.data?.rows||[]);const techniques=sortedEntries(snapshots.techniques?.rows||[]);const pearls=sortedEntries(snapshots.pearls?.rows||[]);
 const matches=row=>!filter||Object.values(row).some(value=>normalize(value).includes(normalize(filter)));
 $('knowledge-title').textContent={techniques:'Techniques',pearls:'Pearls',fundamentals:'Fundamentals',strategy:'Strategy links'}[view];
 const required=view==='techniques'?snapshots.techniques:view==='pearls'?snapshots.pearls:snapshots.data;
 const source=!required?'Not loaded · connect Google and refresh':cached?'Cached on this device':'From Google Sheets';
 let count=0;
 if(view==='techniques'){
  const groups=new Map();for(const row of techniques){const key=techniqueKey(row);if(!techniqueName(row))continue;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
  for(const [key,rows]of groups){if(selected&&selected!==key)continue;if(!rows.some(matches))continue;count++;
   const card=element('details',undefined,'session');card.open=!!selected;const summary=element('summary');summary.append(element('small',positionLabel(rows[0].position)),element('strong',techniqueName(rows[0])));card.append(summary);
   for(const row of rows){const description=element('div',undefined,'technique-instance');description.append(element('small',row.date||'Undated'),element('p',row.description||'No description recorded.'));card.append(description);}
   const linked=data.filter(row=>(row.technique_label&&techniqueKey(row)===key)||(row.takedown_label&&techniqueKey({label:row.takedown_label,position:'takedowns'})===key));
   const links=element('div',undefined,'entry-links');for(const row of linked)links.append(link('Session · '+row.date,'journal',row.id));
   const nodes=[...new Set([...rows,...linked].map(row=>row.map_node).filter(Boolean))];for(const node of nodes)links.append(link('Strategy: '+nodeLabel(node),'strategy',node));card.append(links);list.append(card);
  }
 }else if(view==='pearls'){
  const seen=new Set();for(const row of pearls){if(selected&&row.entry_id!==selected)continue;if(!matches(row)||!row.pearl)continue;const key=String(row.entry_id)+'|'+row.pearl+'|'+row.date;if(seen.has(key))continue;seen.add(key);count++;const card=element('article',undefined,'session');const bullets=element('ul',undefined,'pearl-list');bullets.append(element('li',row.pearl));card.append(element('small',row.date||'Undated'),bullets);if(row.entry_id)card.append(link('Open journal entry','journal',row.entry_id));list.append(card);}
 }else if(view==='fundamentals'){
  for(const row of data){if(!row.fundamentals||(selected&&row.id!==selected)||!matches(row))continue;count++;const card=element('article',undefined,'session');card.append(element('small',metadata(row)),element('p',row.fundamentals),link('Open journal entry','journal',row.id));list.append(card);}
 }else{
  const groups=new Map();for(const row of [...techniques,...data]){if(!row.map_node)continue;const key=canonicalMapKey(row.map_node);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
  for(const [node,rows]of groups){if(selected&&canonicalMapKey(selected)!==node)continue;if(!rows.some(matches))continue;count++;const card=element('details',undefined,'session');card.open=!!selected;card.append(element('summary',nodeLabel(node)));const seen=new Set();for(const row of rows){const text=techniqueName(row)||row.takedown_label||row.lesson||'Training session';const key=text+'|'+(row.description||row.technique||row.standup);if(seen.has(key))continue;seen.add(key);const item=element('div',undefined,'technique-instance');item.append(element('strong',text),element('p',row.description||row.technique||row.standup||techniques.find(t=>techniqueKey(t)===techniqueKey(row))?.description||row.notes||''));if(data.includes(row))item.append(link('Open session · '+row.date,'journal',row.id));else item.append(link('Open technique','techniques',techniqueKey(row)));card.append(item);}list.append(card);}
 }
 $('knowledge-state').textContent=`${source} · ${count} ${view==='techniques'?'techniques':view==='strategy'?'map references':'entries'}${view==='strategy'?' · Sheet-backed descriptions; reference-layout map.':''}`;
 if(!count)list.append(element('p',selected?'No matching linked entry in the loaded Sheet snapshot. Refresh to check.':'Nothing here yet. Save a journal entry with the relevant details, then refresh.', 'empty-state'));
}

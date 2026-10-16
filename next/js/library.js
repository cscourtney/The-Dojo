import {categoryDefinitions,categoryName,ORG_TABS} from './organization.js?v=12';
import {normalize,positionKey,techniqueName,canonicalMapKey,sortedEntries} from './journal.js?v=12';
export const keyForTechnique=row=>normalize(techniqueName(row))+'|'+positionKey(row.position);
export const isReference=row=>['fundamental','reference'].includes(row.entry_type);
export const isDirectID=id=>String(id||'').startsWith('direct:');
export function libraryTechniques(snapshots){
 const journal=sortedEntries(snapshots.data?.rows||[]);
 const rows=(snapshots.techniques?.rows||[]).filter(row=>techniqueName(row)).map(row=>({...row,_source:'techniques'}));
 for(const row of rows){const source=journal.find(entry=>keyForTechnique(entry)===keyForTechnique(row));if(source){if(!row.danaher_category)row.danaher_category=source.danaher_category||'';if(!row.description)row.description=source.technique||'';}}
 const known=new Set(rows.map(keyForTechnique));
 for(const row of sortedEntries(snapshots.data?.rows||[])){
  for(const [name,description,position]of [[row.technique_label,row.technique,row.position],[row.takedown_label,row.standup,'takedowns']]){
   if(!name)continue;const record={...row,label:name,description:description||'',position,_source:'data'};const key=keyForTechnique(record);
   if(!known.has(key)){rows.push(record);known.add(key);}
  }
 }
 return sortedEntries(rows);
}
export function libraryPearls(snapshots){
 const rows=[];const seen=new Set();
 const add=row=>{const value=String(row.pearl||'').trim();if(!value)return;const key=String(row.entry_id||'')+'|'+normalize(value);if(seen.has(key))return;seen.add(key);rows.push({...row,pearl:value});};
 for(const row of snapshots.pearls?.rows||[])add({...row,_source:'pearls'});
 for(const row of snapshots.data?.rows||[])for(const pearl of String(row.pearls||'').split('\n').map(s=>s.replace(/^\d+[.)]\s*/,'').trim()).filter(Boolean))add({date:row.date,gi:row.gi,pearl,entry_id:row.id,_source:'data'});
 return sortedEntries(rows);
}
export function categoryFor(row,snapshots={}){return categoryName(row.danaher_category,snapshots);}
export function categoriesFor(snapshots){
 const definitions=categoryDefinitions(snapshots);const observed=[...new Set(libraryTechniques(snapshots).map(row=>categoryFor(row,snapshots)))];
 if(snapshots[ORG_TABS.categories]&&!snapshots[ORG_TABS.categories].missing)return [...new Set([...definitions.map(row=>row.label),...observed.filter(label=>!definitions.some(row=>row.label===label)).sort()])];
 return [...new Set([...observed,'Submissions','Self Defense','Needs review'])].sort((a,b)=>a==='Needs review'?1:b==='Needs review'?-1:a.localeCompare(b));
}
export function mappedRecords(snapshots){return [...(snapshots.techniques?.rows||[]),...(snapshots.data?.rows||[])].filter(row=>canonicalMapKey(row.map_node));}

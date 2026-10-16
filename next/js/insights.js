import {isReference} from './library.js?v=9';
import {sortedEntries,normalize,localToday} from './journal.js?v=3';
export const STOP_WORDS=new Set('a an and are as at be been but by can could did do does for from had has have how i if in into is it its me my of on or our should so than that the their them there these they this to us was we were what when where which who why will with would you your biggest most about tell show find'.split(' '));
const text=value=>String(value??'').trim();
const short=(value,max=170)=>{const s=text(value).replace(/\s+/g,' ');return s.length>max?s.slice(0,max).replace(/\s+\S*$/,'')+'…':s;};
const active=row=>!['done','complete','completed','fixed','resolved','archived'].includes(normalize(row.status));
export function makePrep(snapshots){
 const entries=sortedEntries(snapshots.data?.rows||[]).filter(row=>!isReference(row)).filter(row=>{const date=Date.parse(String(row.date));return row.date&&(Number.isNaN(date)||date<=new Date(localToday()+'T23:59:59').getTime());});
 const goals=(snapshots.goals?.rows||[]).filter(active).sort((a,b)=>String(a.priority||'').localeCompare(String(b.priority||'')));
 const mistakes=sortedEntries((snapshots.mistakes?.rows||[]).filter(active));
 const pearls=sortedEntries(snapshots.pearls?.rows||[]).filter(row=>row.pearl);
 const sections=[];
 const add=(title,body,source)=>{if(text(body))sections.push({title,body:short(body,240),source});};
 if(goals[0])add('Your focus',goals[0].goal,{tab:'goals',row:goals[0]});
 else if(entries[0])add('Your latest focus',entries[0].lesson||entries[0].technique_label||entries[0].technique,{tab:'data',row:entries[0]});
 for(const row of mistakes.slice(0,2))add('Watch for',`${row.mistake||''}${row.fix?' — '+row.fix:''}`,{tab:'mistakes',row});
 if(entries[0])add('Last session',`${entries[0].date}: ${entries[0].rolls||entries[0].technique||entries[0].drillwork||entries[0].notes||''}`,{tab:'data',row:entries[0]});
 for(const row of pearls.slice(0,2))add('Carry this with you',row.pearl,{tab:'pearls',row});
 const fundamental=entries.find(row=>row.fundamentals);
 if(fundamental)add('Fundamental',fundamental.fundamentals,{tab:'data',row:fundamental});
 const speaking=sections.map(section=>`${section.title}. ${section.body}`).join('\n\n');
 const missing=['data','goals','mistakes','pearls'].filter(tab=>!snapshots[tab]);
 const stale=['data','goals','mistakes','pearls'].filter(tab=>snapshots[tab]?.stale);
 return {builtAt:new Date().toISOString(),sections,text:speaking,missing,stale,estimatedSeconds:Math.round(speaking.split(/\s+/).filter(Boolean).length/2.5)};
}
const ALIASES={back:['back','rear','rnc'],passing:['passing','pass','passes','gpass'],guard:['guard','guards'],mistakes:['mistake','mistakes','error','errors'],takedowns:['takedown','takedowns','standup'],kimura:['kimura','kimuras']};
export function searchHistory(snapshots,query,limit=40){
 const tokens=[...new Set(normalize(query).replace(/[^\p{L}\p{N}\s-]/gu,' ').split(/\s+/).filter(token=>token.length>1&&!STOP_WORDS.has(token)))];
 if(!tokens.length)return [];
 const groups=tokens.map(token=>Object.values(ALIASES).find(values=>values.includes(token))||[token]);
 const results=[];
 for(const [tab,snapshot]of Object.entries(snapshots)){
  if(tab==='readable')continue; // Generated projection duplicates the source journal; book still includes it.
  for(const [index,row]of (snapshot.rows||[]).entries()){
   const searchable=normalize(Object.entries(row).filter(([key])=>!['id','created_at','entry_id'].includes(key)).map(([,value])=>value).join(' '));
   const words=searchable.split(/[^\p{L}\p{N}-]+/u);let score=0,matched=0;
   for(const group of groups){if(group.some(token=>words.includes(token))){score+=4;matched++;}else if(group.some(token=>searchable.includes(token))){score+=1;matched++;}}
   if(!score)continue;
   const title=text(row.lesson||row.label||row.technique_label||row.title||row.goal||row.mistake||row.chain_label||row.name)||tab;
   if(normalize(title).includes(normalize(query)))score+=8;
   // Reward records covering the complete question; do not infer a diagnosis from keyword matches.
   if(matched===groups.length)score+=groups.length*2;
   const detail=text(row.description||row.rolls||row.technique||row.pearl||row.notes||row.chuck_notes||row.goal||row.mistake||Object.values(row).join(' · '));
   results.push({tab,row,index,title,detail,score,matched,total:groups.length,date:row.date||row.added||'',stale:!!snapshot.stale});
  }
 }
 return results.sort((a,b)=>b.score-a.score||String(b.date).localeCompare(String(a.date))).slice(0,limit);
}
export function resourceURL(resource){
 let url;try{url=new URL(resource.url);}catch{return null;}
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return null;
 if(url.pathname==='/'&&!url.search&&!url.hash)return null;
 if(['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname)){
  const video=url.searchParams.get('v')||url.pathname.match(/^\/(?:shorts|embed)\/([\w-]+)/)?.[1];if(!video)return null;
  const stamp=Number(resource.start_seconds);if(Number.isFinite(stamp)&&stamp>0){if(url.pathname.startsWith('/embed/'))url.searchParams.set('start',Math.floor(stamp));else url.searchParams.set('t',Math.floor(stamp)+'s');}
 }else if(url.hostname==='youtu.be'){
  if(!url.pathname.slice(1))return null;const stamp=Number(resource.start_seconds);if(Number.isFinite(stamp)&&stamp>0)url.searchParams.set('t',Math.floor(stamp)+'s');
 }
 return url.href;
}

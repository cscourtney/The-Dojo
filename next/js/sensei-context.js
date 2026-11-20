// Select evidence locally. History and course evidence stay separate and carry source IDs.
const STOP=new Set('a an and are as at be can components could do for from have how i in is it key me most my of on or overall some should that the this to what with you your need focus important distill down'.split(' '));
const text=v=>String(v??'').trim();
const normalize=v=>text(v).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function questionTerms(question){
 const terms=new Set(normalize(question).split(' ').filter(t=>t.length>2&&!STOP.has(t)));
 if([...terms].some(t=>/^pass/.test(t)))for(const t of ['passing','pass','toreando','knee cut','body lock','half guard'])terms.add(t);
 if(terms.has('danaher'))terms.add('john danaher');
 return [...terms];
}
export function sourceDate(value){
 const raw=text(value);let date;
 if(/^\d{5}(?:\.\d+)?$/.test(raw)){const days=Number(raw);if(days<20000||days>80000)return '';date=new Date(Date.UTC(1899,11,30)+Math.floor(days)*86400000);}
 else if(/^\d{4}-\d{2}-\d{2}/.test(raw)){const iso=raw.slice(0,10);date=new Date(iso+'T00:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==iso)return '';}
 else{const parsed=Date.parse(raw);if(!Number.isFinite(parsed))return '';date=new Date(parsed);}
 return date.toISOString().slice(0,10);
}
const searchable=row=>Object.entries(row).filter(([k,v])=>!['id','entry_id','created_at','updated_at','notes'].includes(k)&&typeof v==='string').map(([k,v])=>k+': '+(['date','date_added'].includes(k)?sourceDate(v)||'unrecognized date':v)).join('\n')+'\nnotes: '+text(row.notes).split(/Original recap:/i)[0];
const weight=(content,terms)=>{const value=normalize(content);return terms.reduce((sum,term)=>sum+(value.includes(term)?1:0),0);};
const fingerprint=row=>normalize(Object.entries(row).filter(([k])=>!['id','entry_id','created_at','updated_at'].includes(k)).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+' '+v).join(' '));
export function evidenceExcerpt(content,terms,max=2600){
 const value=text(content);if(value.length<=max)return value;
 const low=value.toLowerCase();let start=0;
 const positions=terms.map(t=>low.indexOf(t)).filter(i=>i>=0).sort((a,b)=>a-b);
 if(positions.length)start=Math.max(0,positions[0]-350);
 return (start?'…':'')+value.slice(start,start+max)+(start+max<value.length?'…':'');
}
export function buildSenseiContext(snapshots,question,{mode='both'}={}){
 const terms=questionTerms(question),sources=[],history=[],references=[];let duplicateRows=0,historyRows=0;
 for(const [tab,snapshot] of Object.entries(snapshots)){
  if(tab.startsWith('__')||['readable','dojo_map_edges','dojo_categories'].includes(tab))continue;
  const seen=new Set();
  for(const row of snapshot.rows||[]){
   if(!row||!Object.values(row).some(v=>text(v)))continue;
   const signature=fingerprint(row);if(seen.has(signature)){duplicateRows++;continue;}seen.add(signature);
   historyRows++;
   if(mode==='course')continue;
   if(!['data','pearls','techniques','privates','goals','mistakes','gameplan','dojo_map_nodes','library','chains'].includes(tab))continue;
   const content=searchable(row);if(!content.trim())continue;
   const date=sourceDate(row.date||row.date_added);const score=weight(content,terms);
   const priority=['goals','mistakes'].includes(tab)&&!['done','complete','completed','fixed','resolved','archived'].includes(normalize(row.status));
   history.push({tab,row,date,score,priority,content,stale:!!snapshot.stale,missing:!!(snapshot.loadError||snapshot.missing)});
  }
 }
 // A related old entry outranks an unrelated recent one. Recent training remains context.
 history.sort((a,b)=>(b.priority-a.priority)||(b.score-a.score)||b.date.localeCompare(a.date));
 const selected=history.filter(x=>x.priority||x.score>0).slice(0,24);
 const latest=history.filter(x=>x.tab==='data'&&!['fundamental','reference'].includes(x.row.entry_type)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4);
 for(const row of latest)if(!selected.includes(row)&&selected.length<28)selected.push(row);
 for(const item of selected){sources.push({id:'S'+(sources.length+1),kind:'training_record',title:item.date?item.date+' · '+(item.row.lesson||item.row.technique_label||item.row.focus||item.tab):(item.row.title||item.row.node_label||item.tab),date:item.date,tab:item.tab,row_id:text(item.row.id||item.row.entry_id),stale:item.stale,content:evidenceExcerpt(item.content,terms),source_row:item.row});}
 if(mode!=='training')for(const row of snapshots.__course_references?.rows||[]){
  const score=weight(row.title+' '+row.tags.join(' ')+' '+row.summary,terms);
  if(score>0)references.push({row,score:score+(row.kind==='ai_interpreted_course_note'?4:row.kind==='official_written_breakdown'?2:0)});
 }
 references.sort((a,b)=>b.score-a.score);
 for(const {row}of references.slice(0,14))sources.push({id:'S'+(sources.length+1),kind:row.kind,title:row.title.slice(0,1200),date:'',tab:'__course_references',row_id:row.id,content:evidenceExcerpt(row.summary,terms,row.kind==='machine_transcript_unreviewed'?3600:2200),evidence:row.evidence.slice(0,3000),url:row.url,citations:row.citations||[],source_row:row});
 const missing=Object.entries(snapshots).filter(([,s])=>s.loadError||s.missing).map(([tab])=>tab);
 const coverage={history_records_scanned:historyRows,duplicate_rows_ignored:duplicateRows,history_records_selected:sources.filter(s=>s.kind==='training_record').length,reference_notes_available:(snapshots.__course_references?.rows||[]).length,reference_notes_selected:sources.filter(s=>s.kind!=='training_record').length,missing_tabs:missing,cached_training_sources:sources.some(s=>s.stale)};
 // Registry retains source rows locally for safe links. Model gets only the selected evidence.
 return {sources,coverage,payload:{mode,question,coverage,sources:sources.map(({source_row,...source})=>source)}};
}

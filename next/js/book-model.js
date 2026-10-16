import {ORG_TABS,categoryDefinitions,categoryName,sheetLayout,mapSVG} from './organization.js?v=12';
import {canonicalHeader,parseTab} from './sheets.js?v=12';
import {canonicalMapKey,normalize,positionKey} from './journal.js?v=12';
const CHAPTERS={data:'Training Journal',techniques:'Technique Library',pearls:'Pearls',mistakes:'Mistake Audit',goals:'Goals',gameplan:'Strategy and Game Plan',chains:'Chains and Sequences',library:'Resource Library',privates:'Private Lessons',principles:'Principles',readable:'Readable Sheet View'};
const ORDER=['data','techniques','pearls','mistakes','goals','gameplan','chains','library','privates','principles','readable'];
const LABELS={date:'Date',entry_type:'Session type',gi:'Gi / No-gi',lesson:'Lesson / Focus',standup:'Standup',technique:'Technique · detailed description',rolls:'Rolls',drillwork:'Drillwork',pearls:'Pearls',fundamentals:'Fundamentals',notes:'Notes',position:'Position',technique_label:'Technique name',takedown_label:'Takedown name',map_node:'Strategy map reference',created_at:'Created',id:'Record ID',entry_id:'Journal entry ID',label:'Name',description:'Description',pearl:'Pearl',url:'URL'};
const GLOSSARY=['Armbar','Back control','Base','Butterfly','Closed guard','De La Riva','Frames','Gi','Guard passing','Guard retention','Half guard','Heel hook','Kimura','Knee slice','Leg drag','Leg locks','Mount','No-gi','Octopus','Posture','Rear naked choke','Side control','Standup','Takedown','Triangle','Turtle','Underhook','X-guard'];
const text=value=>String(value??'');
function columnName(n){let name='';while(n){n--;name=String.fromCharCode(65+n%26)+name;n=Math.floor(n/26);}return name;}
export function makeBookModel(workbook){
 if(!workbook?.sheets||!Array.isArray(workbook.tabNames)||!workbook.complete||workbook.tabNames.some(tab=>!Object.hasOwn(workbook.sheets,tab)))throw new Error('Read the complete workbook before creating a book. Partial cached sections are not enough.');
 const tabs=[...workbook.tabNames].sort((a,b)=>(ORDER.indexOf(a)<0?99:ORDER.indexOf(a))-(ORDER.indexOf(b)<0?99:ORDER.indexOf(b))||a.localeCompare(b));
 const terms=new Set(GLOSSARY);const chapters=[];let rowCount=0,cellCount=0;
 for(const tab of tabs){
  const snapshot=workbook.sheets[tab];if(!Array.isArray(snapshot.rawValues))throw new Error(`Original cells for ${tab} are missing. Refresh the workbook before exporting.`);
  const raw=snapshot.rawValues;const first=raw[0]||[];const hasHeaders=first.some(value=>text(value).trim());
  const headers=hasHeaders?first.map(value=>text(value).trim()):[];const body=hasHeaders?raw.slice(1):raw.slice(1);
  const records=[];
  body.forEach((row,index)=>{
   if(!row.some(value=>text(value)!==''))return;
   const fields=[];const keys={};
   for(let i=0;i<Math.max(headers.length,row.length);i++){
    const value=text(row[i]);if(value==='')continue;const key=headers[i]||'';const label=LABELS[key]||key||`Unnamed column ${columnName(i+1)}`;
    fields.push({key,label,value,column:i+1});if(key&&!Object.hasOwn(keys,key))keys[key]=value;cellCount++;
    if(['label','technique_label','takedown_label','position','map_node','tags'].includes(key))for(const item of value.split(/[,\n]/)){const term=item.trim();if(term&&term.length<=90)terms.add(term);}
   }
   const title=keys.lesson||keys.label||keys.technique_label||keys.title||keys.goal||keys.mistake||keys.chain_label||keys.name||`${tab} · row ${index+2}`;
   const semantic={};for(const [key,value]of Object.entries(keys)){const canonical=canonicalHeader(tab,key);if(!Object.hasOwn(semantic,canonical))semantic[canonical]=value;}
   records.push({keys:semantic,sourceTab:tab,id:`record-${chapters.length}-${index}`,sourceRow:index+2,title:semantic.lesson||semantic.label||semantic.technique_label||semantic.title||title,date:semantic.date||semantic.added||'',fields});
  });
  if(['data','pearls','techniques','privates'].includes(tab))records.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  rowCount+=records.length;chapters.push({id:'chapter-'+chapters.length,tab,title:CHAPTERS[tab]||tab,records,sourceRows:records.length});
 }
 const fundamentals=chapters.find(chapter=>chapter.tab==='data')?.records.filter(record=>record.fields.some(field=>canonicalHeader('data',field.key)==='fundamentals'&&field.value)).map(record=>({id:'fundamental-'+record.id,title:record.title,date:record.date,fields:record.fields.filter(field=>['date','fundamentals','id'].includes(canonicalHeader('data',field.key)))}))||[];
 if(fundamentals.length)chapters.splice(Math.min(3,chapters.length),0,{id:'chapter-fundamentals',tab:'derived-fundamentals',title:'Fundamentals',derived:true,records:fundamentals,sourceRows:0});
 // Interpret organization separately; source cells and unknown columns remain in their chapters.
 const snapshots={...workbook.sheets};
 for(const tab of Object.values(ORG_TABS))if(snapshots[tab]&&!snapshots[tab].rows)snapshots[tab]={...snapshots[tab],...parseTab(tab,snapshots[tab].rawValues)};
 const definitions=categoryDefinitions(snapshots);const library=chapters.find(chapter=>chapter.tab==='techniques');
 if(library&&definitions.length){
  const records=library.records;const journalRecords=chapters.find(chapter=>chapter.tab==='data')?.records||[];const categoryValue=record=>record.keys.danaher_category||journalRecords.find(row=>normalize(row.keys.technique_label)===normalize(record.keys.label)&&positionKey(row.keys.position)===positionKey(record.keys.position))?.keys.danaher_category||'';library.records=[];library.introduction='Organized using the category names and order in your Google Sheet.';
  const labels=[...new Set([...definitions.map(row=>row.label),...records.map(record=>categoryName(categoryValue(record),snapshots))])];
  const parts=labels.map((label,i)=>({id:'technique-category-'+i,tab:'techniques',title:'Techniques · '+label,category:label,records:records.filter(record=>categoryName(categoryValue(record),snapshots)===label),sourceRows:records.filter(record=>categoryName(categoryValue(record),snapshots)===label).length}));
  chapters.splice(chapters.indexOf(library)+1,0,...parts);
 }
 const layout=sheetLayout(snapshots);
 if(layout){
  const sources=chapters.flatMap(chapter=>chapter.records).filter(record=>record.sourceTab==='techniques'||record.sourceTab==='data');
  const techniqueKey=keys=>normalize(keys.label||keys.technique_label)+'|'+positionKey(keys.position);
  const records=Object.entries(layout.nodes).map(([id,node],i)=>{
   const linked=[];const seen=new Set();
   for(const record of sources){if(canonicalMapKey(record.keys?.map_node)!==id)continue;const technique=record.sourceTab==='techniques'?record:sources.find(other=>other.sourceTab==='techniques'&&techniqueKey(other.keys)===techniqueKey(record.keys));const target=technique||record;if(seen.has(target.id))continue;seen.add(target.id);linked.push({id:target.id,title:target.keys?.label||target.keys?.technique_label||target.title});}
   return {id:'map-position-'+i,title:node.title,date:'',fields:[...(node.notes?[{key:'notes',label:'Position notes',value:node.notes}]:[]),{key:'map_node',label:'Map position ID',value:id}],links:linked,nodeID:id};
  });
  const gameplanIndex=chapters.findIndex(chapter=>chapter.tab==='gameplan');const insertion=gameplanIndex<0?chapters.length:gameplanIndex;
  chapters.splice(insertion,0,{id:'chapter-visual-map',tab:'derived-map',title:'Strategy Map',derived:true,visualMap:true,layout,records:[],sourceRows:0},{id:'chapter-map-links',tab:'derived-map-links',title:'Map Positions & Techniques',derived:true,records,sourceRows:0});
 }
 return {title:workbook.title||'Dojo_Master',fetchedAt:workbook.fetchedAt,chapters,tabCount:tabs.length,rowCount,cellCount,terms:[...terms].sort((a,b)=>a.localeCompare(b)),problems:workbook.problems||[]};
}
export function termsForRecord(record,terms){const text=record.fields.map(field=>field.value).join('\n').toLowerCase();return terms.filter(term=>text.includes(term.toLowerCase()));}
const escape=value=>text(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function notebookHTML(model,{fontCSS='',paper=true}={}){
 const mapDetails=model.chapters.find(chapter=>chapter.tab==='derived-map-links');
 const targets=Object.fromEntries((mapDetails?.records||[]).map(record=>[record.nodeID,'#'+record.id]));
 const entries=model.chapters.map(chapter=>`<section id="${chapter.id}" class="chapter${chapter.visualMap?' visual-map':''}"><h2>${escape(chapter.title)}</h2><p class="source">${chapter.visualMap?'Landscape overview · tap a position for its notes and linked techniques.':chapter.derived?'Organized from your Google Sheet; original cells remain in their source chapters.':'Sheet tab: '+escape(chapter.tab)}</p>${chapter.introduction?'<p>'+escape(chapter.introduction)+'</p>':''}${chapter.visualMap?mapSVG(chapter.layout,targets):chapter.records.length?chapter.records.map(record=>`<article id="${record.id}"><h3>${escape(record.date?record.date+' · '+record.title:record.title)}</h3><dl>${record.fields.map(field=>`<dt>${escape(field.label)}</dt><dd>${escape(field.value)}</dd>`).join('')}</dl>${record.links?'<ul>'+record.links.map(link=>'<li><a href="#'+escape(link.id)+'">'+escape(link.title)+'</a></li>').join('')+'</ul>'+(!record.links.length?'<p>No linked technique recorded at this position yet.</p>':''):''}<a class="back" href="#contents">Back to contents</a></article>`).join(''):chapter.introduction?'':'<p>No entries in this category or tab yet.</p>'}</section>`).join('');
 const index=model.terms.map(term=>{const records=model.chapters.flatMap(chapter=>chapter.records).filter(record=>termsForRecord(record,[term]).length);return records.length?`<li><strong>${escape(term)}</strong> ${records.map((record,i)=>`<a href="#${record.id}">${i+1}</a>`).join(', ')}</li>`:'';}).join('');
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>The Dojo · Training notebook</title><style>${fontCSS}body{font:22px/1.45 'Dojo Hand',sans-serif;max-width:850px;margin:40px auto;padding:0 24px;color:#21352b;background:${paper?'#f9f5e9':'#ffffff'};background-image:${paper?'radial-gradient(#a99a7810 .7px,transparent .8px)':'none'};background-size:5px 5px}h1{font:52px 'Dojo Heading',cursive}h2{font:38px 'Dojo Heading',cursive;border-bottom:1px solid #ccd4c8;padding-bottom:12px}h3{font:30px 'Dojo Heading',cursive}a{color:#244d37}article{padding:20px 0;border-bottom:1px solid #dedfd4}dt{font:600 12px system-ui,sans-serif;text-transform:uppercase;margin-top:18px}dd{margin:4px 0;white-space:pre-wrap;overflow-wrap:anywhere}nav li{margin:12px 0}.chapter{margin:60px 0}.source,.back,nav{font:13px system-ui,sans-serif}.notebook-toc{position:fixed;bottom:18px;left:24px;padding:8px 12px;background:#f9f5e9;border:1px solid #d9d5c7;border-radius:6px;font:12px system-ui,sans-serif;z-index:2}.tools{position:sticky;top:0;background:#f4f3e9;padding:14px;display:flex;flex-wrap:wrap;gap:10px}input,button{font:16px system-ui,sans-serif;padding:12px}input{flex:1;min-width:160px}#index li{margin:10px 0}#index a{padding:8px}[hidden]{display:none!important}.visual-map{overflow:auto}.visual-map svg{display:block;width:100%;min-width:680px;height:auto}.visual-map a{cursor:pointer}@media print{.visual-map{page:map;overflow:visible;break-after:page}.visual-map svg{min-width:0;width:100%;max-height:6in}@page map{size:letter landscape;margin:.5in}body{margin:0;max-width:none;background:white!important;background-image:none!important;color:black}.notebook-toc{bottom:0;left:0;border:0;background:white}.tools,.back{display:none}.chapter{break-before:page}article[hidden],.chapter[hidden]{display:block!important}h2,h3,dt{break-after:avoid}a{color:black;text-decoration:none}@page{size:letter;margin:0.7in}}</style></head><body><a class="notebook-toc" href="#contents">Back to contents</a><div class="tools"><input id="find" type="search" placeholder="Search this notebook" aria-label="Search notebook"><button onclick="window.print()">Print / Save PDF</button><span id="count" role="status"></span></div><header><h1>The Dojo</h1><p>Training notebook · ${escape(model.title)}</p><p>${model.tabCount} Sheet tabs · ${model.rowCount} source rows · Snapshot ${escape(model.fetchedAt||'unknown')}</p><p>Your original words, organized by chapter. All tabs are included; generated Sheet views may repeat source material.</p></header><nav id="contents"><h2>Contents</h2><ol>${model.chapters.map(chapter=>`<li><a href="#${chapter.id}">${escape(chapter.title)}</a></li>`).join('')}<li><a href="#index">Index</a></li></ol></nav>${entries}<section id="index" class="chapter"><h2>Index</h2><p>Links point to matching entries.</p><ul>${index}</ul></section><script>const records=[...document.querySelectorAll('article')];document.getElementById('find').addEventListener('input',event=>{const q=event.target.value.trim().toLowerCase();let n=0;for(const record of records){record.hidden=!!q&&!record.textContent.toLowerCase().includes(q);if(!record.hidden)n++;}document.getElementById('count').textContent=q?n+' matching entries':'';});document.addEventListener('click',event=>{const link=event.target.closest('a[href^="#"]');const find=document.getElementById('find');if(link&&find.value){find.value='';find.dispatchEvent(new Event('input'));}});</script></body></html>`;
}

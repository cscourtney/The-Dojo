import {sameTechnique,canonicalMapKey} from './journal.js?v=12';
export const SHEET_ID = '11qPTV7nS28ZdK0Yd1kTAZVMot30lLA9024N1JeYlgwc';
export const CLIENT_ID = '766609056854-bdk65cprg46q2sni85pr2kges9u18mfl.apps.googleusercontent.com';
let token = '', expires = 0;
export function accessToken() {
  if (!token || Date.now() >= expires) throw new Error('Connect Google again to continue. Your draft is safe.');
  return token;
}
export function disconnect() { token = ''; expires = 0; }
export async function connect({chooseAccount=true} = {}) {
  if (!window.google?.accounts?.oauth2) await new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client';
    const timeout = setTimeout(() => reject(new Error('Google sign-in timed out. Try again.')), 20000);
    script.onload = () => { clearTimeout(timeout); resolve(); };
    script.onerror = () => { clearTimeout(timeout); script.remove(); reject(new Error('Could not load Google sign-in.')); };
    document.head.append(script);
  });
  disconnect();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Google sign-in timed out. Please retry.')), 120000);
    let completed = false;
    const finish = (error, value) => {
      if (completed) return; completed = true; clearTimeout(timeout);
      if (error) reject(error); else resolve(value);
    };
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: 'openid email https://www.googleapis.com/auth/spreadsheets',
      callback: response => {
        if (completed) return;
        if (response.error || !response.access_token) return finish(new Error('Google sign-in failed. Please retry.'));
        token = response.access_token; expires = Date.now() + (Number(response.expires_in || 3600) - 60) * 1000;
        finish(null, true);
      },
      error_callback: () => finish(new Error('Google sign-in was closed or blocked. Allow the popup and retry.'))
    });
    client.requestAccessToken({prompt: chooseAccount ? 'select_account' : ''});
  });
}
// Invoke from a user action so Google's popup is permitted. Never sign in on page load.
export async function ensureAccess() {
  try { return accessToken(); }
  catch { await connect({chooseAccount:false}); return accessToken(); }
}
async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}${path}`, {
      ...options, headers: {'Content-Type':'application/json', Authorization:`Bearer ${accessToken()}`}, signal: AbortSignal.timeout(20000)
    });
  } catch (error) { throw new Error(`Sheet connection failed: ${error.message}. Local work is retained.`); }
  if (!response.ok) {
    if (response.status === 401) disconnect();
    throw new Error(`Google Sheets HTTP ${response.status}. ${response.status === 403 ? 'Check that the selected Google account can edit Dojo_Master.' : 'Retry after checking your connection or signing in again.'}`);
  }
  return response.json();
}
export async function readTab(tab) {
  const result = await request(`/values/${encodeURIComponent(tab)}`);
  return {...parseTab(tab, result.values || []),syncedAt:new Date().toISOString()};
}
// Normalize known header labels for reading and writing; physical columns remain unchanged.
export function canonicalHeader(tab,value){
 const key=String(value??'').trim().toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
 const common={record_id:'id',entryid:'entry_id',created:'created_at',createdat:'created_at',map_reference:'map_node',strategy_map_reference:'map_node',technique_name:'label',danaher:'danaher_category',danahercategory:'danaher_category',gi_no_gi:'gi'};
 if(tab==='techniques')return ({technique:'description',technique_label:'label',name:'label',technique_description:'description',detailed_description:'description',details:'description',category:'danaher_category'})[key]||common[key]||key;
 if(tab==='pearls')return ({pearls:'pearl',text:'pearl',journal_entry_id:'entry_id'})[key]||common[key]||key;
 if(tab==='data')return ({focus:'lesson',lesson_focus:'lesson',rolling:'rolls',fundamental:'fundamentals',technique_name:'technique_label',takedown_name:'takedown_label',type:'entry_type',gi_no_gi:'gi'})[key]||common[key]||key;
 return key;
}
export function parseTab(tab, values) {
  const [raw = [], ...rows] = values;
  const headers = raw.map(h => String(h ?? '').trim());
  const headerKeys = headers.map(header=>canonicalHeader(tab,header));
  if (!headers.some(Boolean)) throw new Error(`${tab}: the first row has no named headers.`);
  const columns = new Map();
  headerKeys.forEach((header,index) => { if(header){if(!columns.has(header))columns.set(header,[]);columns.get(header).push(index);} });
  const duplicateHeaders = [...columns].filter(([,indices]) => indices.length > 1).map(([header]) => header);
  // Keep physical column positions, including unnamed columns, for positional appends.
  // Empty headings are ignored on reads; harmless duplicate columns can still be read.
  const records = rows.map((row,index) => {
    const record = {};
    for(const [header,indices] of columns){
      const present = [...new Set(indices.map(i => row[i] ?? '').filter(value => value !== ''))];
      if(present.length > 1) throw new Error(`${tab}: repeated header "${header}" in columns ${indices.map(i=>columnName(i+1)).join(', ')} has conflicting values at row ${index+2}. No Sheet data was changed.`);
      record[header] = present[0] ?? '';
    }
    return record;
  });
  return {headers,headerKeys,rows:records.filter(row=>Object.values(row).some(value=>String(value).trim())),duplicateHeaders};
}
function columnName(number) {
  let name = '';
  while (number) { number--; name = String.fromCharCode(65 + number % 26) + name; number = Math.floor(number / 26); }
  return name;
}
async function append(tab, snapshot, object) {
  const values = (snapshot.headerKeys||snapshot.headers).map(header => header ? object[header] ?? '' : '');
  await request(`/values/${encodeURIComponent(`${tab}!A:${columnName(snapshot.headers.length)}`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {method:'POST', body:JSON.stringify({values:[values]})});
}
function requireHeaders(tab, snapshot, names) {
  const missing = names.filter(name => !(snapshot.headerKeys||snapshot.headers).includes(name));
  const duplicates = (snapshot.duplicateHeaders || []).filter(header=>names.includes(header));
  if(duplicates.length) throw new Error(`${tab}: repeated writable headers ${duplicates.join(', ')}. Reading is safe, but saving is paused to avoid writing to an ambiguous column. No rows were written.`);
  if (missing.length) throw new Error(`${tab}: missing headers ${missing.join(', ')}. Correct the Sheet headers before retrying; no automatic schema changes were made.`);
}
// Read current headers for every save. A timeout is reconciled by stable IDs on retry.
// Google Sheets has no unique constraint: simultaneous saves in two devices are not atomic.
export async function syncEntry(entry) {
  const snapshots = {};
  snapshots.data = await readTab('data');
  const dataFields = ['id','date','entry_type','gi','lesson','standup','technique','rolls','drillwork','pearls','fundamentals','notes','created_at','position','technique_label','takedown_label','map_node'];
  requireHeaders('data', snapshots.data, dataFields);
  const techniques = [];
  if (entry._createTechnique === true && entry.technique_label && entry.technique) techniques.push({label:entry.technique_label, position:entry.position, map_node:entry.map_node, description:entry.technique, date:entry.date, gi:entry.gi, id:entry.id+'_tech', created_at:entry.created_at});
  if (entry._createTakedown === true && entry.takedown_label && entry.standup) techniques.push({label:entry.takedown_label, position:'takedowns', map_node:entry.map_node||'', description:entry.standup, date:entry.date, gi:entry.gi, id:entry.id+'_td', created_at:entry.created_at});
  const pearls = [...new Set((entry.pearls || '').split('\n').map(s => s.replace(/^\d+[.)]\s*/, '').trim()).filter(Boolean))];
  if (techniques.length || entry.technique_label || entry.takedown_label) {
    snapshots.techniques = await readTab('techniques');
    requireHeaders('techniques', snapshots.techniques, ['label','position','map_node','description','date','gi','id','created_at']);
  }
  if (pearls.length) {
    snapshots.pearls = await readTab('pearls');
    requireHeaders('pearls', snapshots.pearls, ['date','gi','pearl','entry_id','created_at']);
  }
  if (entry.technique_label && entry._createTechnique !== true && !snapshots.techniques.rows.some(row => sameTechnique(row,{label:entry.technique_label,position:entry.position}))) throw new Error('The linked technique is no longer in the Sheet. Refresh and choose an existing technique, or explicitly add a new one.');
  if (entry.takedown_label && entry._createTakedown !== true && !snapshots.techniques.rows.some(row => sameTechnique(row,{label:entry.takedown_label,position:'takedowns'}))) throw new Error('The linked takedown is no longer in the Sheet. Refresh and choose an existing takedown, or explicitly add a new one.');
  // Validate every affected tab before starting any write.
  if (!snapshots.data.rows.some(row => row.id === entry.id)) await append('data', snapshots.data, entry);
  for (const technique of techniques) {
    if (!snapshots.techniques.rows.some(row => row.id === technique.id || sameTechnique(row,technique))) await append('techniques', snapshots.techniques, technique);
  }
  for (const pearl of pearls) {
    if (!snapshots.pearls.rows.some(row => row.entry_id === entry.id && row.pearl === pearl)) await append('pearls', snapshots.pearls, {date:entry.date, gi:entry.gi, pearl, entry_id:entry.id, created_at:entry.created_at});
  }
  // A save is complete only after all affected Sheet tabs have been read back.
  const updated = {};
  for (const tab of Object.keys(snapshots)) updated[tab] = await readTab(tab);
  if (!updated.data.rows.some(row => row.id === entry.id) || techniques.some(t => !updated.techniques.rows.some(row => row.id === t.id || sameTechnique(row,t))) || pearls.some(p => !updated.pearls.rows.some(row => row.entry_id === entry.id && row.pearl === p))) throw new Error('Sheet read-back did not confirm every saved row. Retry safely to reconcile this entry.');
  return updated;
}

// Direct library additions use the existing tabs. Stable IDs reconcile uncertain responses.
export async function syncLibraryEntry(entry){
 const {kind}=entry;const object={...entry};delete object.kind;
 let tab,required,linkedInLibrary=false,techniqueSnapshot;
 if(kind==='techniques'){tab='techniques';required=['id','label','position','description','date','created_at'];if(object.map_node)required.push('map_node');if(object.danaher_category)required.push('danaher_category');}
 else if(kind==='pearls'){tab='pearls';required=['entry_id','pearl','date','created_at'];}
 else if(kind==='fundamentals'){tab='data';required=['id','entry_type','date','fundamentals','created_at'];}
 else if(kind==='map-link'){
  tab='data';required=['id','entry_type','date','technique_label','position','map_node','created_at'];
  const library=await readTab('techniques');techniqueSnapshot=library;
  linkedInLibrary=library.rows.some(row=>sameTechnique(row,{label:object.technique_label,position:object.position})&&canonicalMapKey(row.map_node)===canonicalMapKey(object.map_node));
  if(!library.rows.some(row=>sameTechnique(row,{label:object.technique_label,position:object.position})))throw new Error('This technique is no longer in the library. Refresh and select it again.');
 }else throw new Error('Unknown library entry type.');
 if(object.gi)required.push('gi');if(object.lesson)required.push('lesson');
 const snapshot=await readTab(tab);requireHeaders(tab,snapshot,required);
 if(kind==='map-link'&&linkedInLibrary)return {[tab]:snapshot,techniques:techniqueSnapshot};
 const exists=row=>kind==='pearls'?row.entry_id===object.entry_id&&row.pearl===object.pearl:row.id===object.id;
 if(!snapshot.rows.some(exists)){
  if(kind==='techniques'&&snapshot.rows.some(row=>sameTechnique(row,object))){const error=new Error('A technique with this name and position already exists. Open it in Techniques or use Link existing technique on the map.');error.safeToEdit=true;throw error;}
  if(kind==='map-link'&&snapshot.rows.some(row=>sameTechnique(row,{label:object.technique_label,position:object.position})&&canonicalMapKey(row.map_node)===canonicalMapKey(object.map_node)))return {[tab]:snapshot};
  await append(tab,snapshot,object);
 }
 const updated=await readTab(tab);
 if(!updated.rows.some(exists))throw new Error('The Sheet has not confirmed this addition yet. Retry to reconcile the same saved draft.');
 return {[tab]:updated};
}

// Read every tab through the signed-in browser. Credentials never leave the normal Google route.
export async function readWorkbook() {
  const metadata=await request('?fields=properties.title,sheets.properties');
  const tabs=(metadata.sheets||[]).map(sheet=>sheet.properties?.title).filter(Boolean);
  if(!tabs.length)throw new Error('Google returned no Sheet tabs. No export was created.');
  const parameters=new URLSearchParams({majorDimension:'ROWS',valueRenderOption:'FORMATTED_VALUE'});
  for(const tab of tabs)parameters.append('ranges',"'"+tab.replace(/'/g,"''")+"'");
  const response=await request('/values:batchGet?'+parameters.toString());
  if((response.valueRanges||[]).length!==tabs.length)throw new Error('The workbook response was incomplete. Retry before exporting.');
  const sheets={};const problems=[];
  tabs.forEach((tab,index)=>{
    const values=response.valueRanges[index].values||[];
    let parsed;
    try{parsed=parseTab(tab,values);}catch(error){problems.push({tab,message:error.message});parsed={headers:values[0]||[],rows:[]};}
    sheets[tab]={...parsed,sheetId:metadata.sheets[index].properties.sheetId,rawValues:values,syncedAt:new Date().toISOString(),...(problems.some(problem=>problem.tab===tab)?{readProblem:true}:{} )};
  });
  return {complete:true,tabNames:tabs,title:metadata.properties?.title||'Dojo_Master',fetchedAt:new Date().toISOString(),sheets,problems};
}

// Organization is stored in dedicated tabs; the legacy gameplan tab is never replaced.
export async function readOrganization(){
 const {ORG_TABS}=await import('./organization.js?v=12');
 const metadata=await request('?fields=sheets.properties');const names=new Set((metadata.sheets||[]).map(s=>s.properties.title));const snapshots={};
 for(const tab of Object.values(ORG_TABS))if(!names.has(tab))snapshots[tab]={headers:[],rows:[],missing:true,stale:true};else{try{snapshots[tab]=await readTab(tab);}catch(error){snapshots[tab]={headers:[],rows:[],loadError:error.message,stale:true};}}
 return snapshots;
}
export async function setupOrganization(workbook,reference){
 const {ORG_HEADERS,organizationSeeds}=await import('./organization.js?v=12');
 if(!workbook.complete)throw new Error('Read the complete workbook before setting up organization.');
 if(['data','techniques'].some(tab=>workbook.sheets[tab]?.readProblem))throw new Error('Journal or technique headers could not be interpreted. Correct those headers before seeding organization; no organization tables were written.');
 const seeds=organizationSeeds(workbook,reference);const metadata=await request('?fields=sheets.properties');const properties=(metadata.sheets||[]).map(s=>s.properties);const requests=[];const used=new Set(properties.map(p=>p.sheetId));
 for(const [tab,headers]of Object.entries(ORG_HEADERS)){
  if(properties.some(p=>p.title===tab)){const snapshot=await readTab(tab);requireHeaders(tab,snapshot,headers);continue;}
  let sheetId;do{sheetId=Math.floor(Math.random()*2000000000)+1;}while(used.has(sheetId));used.add(sheetId);
  requests.push({addSheet:{properties:{title:tab,sheetId}}});
  const rows=[headers,...seeds[tab].map(row=>headers.map(key=>row[key]??''))].map(row=>({values:row.map(value=>({userEnteredValue:{stringValue:String(value)}}))}));
  requests.push({updateCells:{start:{sheetId,rowIndex:0,columnIndex:0},rows,fields:'userEnteredValue'}});
 }
 if(requests.length){try{await request(':batchUpdate',{method:'POST',body:JSON.stringify({requests})});}catch(error){
  // The batch may have committed before the connection failed. Verify all tabs before retrying.
  const current=await readOrganization();if(!Object.keys(ORG_HEADERS).every(tab=>current[tab]&&!current[tab].loadError&&!current[tab].missing))throw error;
 }}
 // Add only the missing category header, beyond every populated source column.
 const fresh=await request('/values/'+encodeURIComponent('techniques'));const raw=fresh.values||[];const snapshot=parseTab('techniques',raw);
 if(!(snapshot.headerKeys||snapshot.headers).includes('danaher_category')){
  const column=Math.max(...raw.map(row=>row.length),0)+1;
  await request('/values/'+encodeURIComponent('techniques!'+columnName(column)+'1')+'?valueInputOption=RAW',{method:'PUT',body:JSON.stringify({values:[['danaher_category']]})});
 }
 const updated=await readOrganization();for(const [tab,headers]of Object.entries(ORG_HEADERS))requireHeaders(tab,updated[tab]||{headers:[]},headers);
 return updated;
}
export async function saveOrganizationRecord(tab,object,{expected=null}={}){
 const {ORG_HEADERS,ORG_TABS}=await import('./organization.js?v=12');const headers=ORG_HEADERS[tab];if(!headers)throw new Error('Unknown organization tab.');
 if(!object.id)throw new Error('This record needs a stable ID.');
 const fresh=await request('/values/'+encodeURIComponent(tab));const raw=fresh.values||[];const snapshot=parseTab(tab,raw);requireHeaders(tab,snapshot,headers);
 const keyHeaders=snapshot.headerKeys||snapshot.headers;const idColumn=keyHeaders.indexOf('id');const matches=raw.slice(1).map((row,index)=>({row,index:index+2})).filter(item=>String(item.row[idColumn])===object.id);
 if(matches.length>1)throw new Error('Duplicate organization IDs in the Sheet. Correct them before editing.');
 const same=(a,b)=>headers.every(key=>String(a[key]??'')===String(b[key]??''));const current=snapshot.rows.find(row=>row.id===object.id);
 if(current&&same(current,object))return snapshot;
 if(expected&&(!current||!same(current,expected)))throw new Error('This record changed in another device or in the Sheet. Refresh organization before editing it again. Your draft is retained.');
 if(!expected&&current)throw new Error('This ID already exists. Refresh and select the record to edit.');
 if(tab===ORG_TABS.categories){if(!String(object.label||'').trim())throw new Error('Enter a category name.');if(snapshot.rows.some(row=>row.id!==object.id&&String(row.label).trim().toLowerCase()===String(object.label).trim().toLowerCase()))throw new Error('A category with that name already exists.');}
 if(tab===ORG_TABS.nodes){if(!object.title||!['o','d','n'].includes(object.type)||!['x','y'].every(key=>Number.isFinite(Number(object[key]))&&Number(object[key])>=0&&Number(object[key])<=10000))throw new Error('Enter a title, type, and coordinates from 0 to 10000.');}
 if(tab===ORG_TABS.edges){const nodes=await readTab(ORG_TABS.nodes);if(!nodes.rows.some(n=>n.id===object.from_node)||!nodes.rows.some(n=>n.id===object.to_node))throw new Error('Both connected positions must exist in the Sheet.');}
 if(!current)await append(tab,snapshot,object);
 else{
  // Resolve the stable ID from fresh physical rows; update known cells only, preserving extra columns.
  const data=headers.map(key=>({range:tab+'!'+columnName(keyHeaders.indexOf(key)+1)+matches[0].index,values:[[object[key]??'']]}));
  await request('/values:batchUpdate',{method:'POST',body:JSON.stringify({valueInputOption:'RAW',data})});
 }
 const updated=await readTab(tab);if(!updated.rows.some(row=>row.id===object.id&&same(row,object)))throw new Error('Sheet read-back did not confirm this change. Retry the same draft.');return updated;
}

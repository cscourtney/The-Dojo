import {sameTechnique} from './journal.js?v=3';
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
export function parseTab(tab, values) {
  const [raw = [], ...rows] = values;
  const headers = raw.map(h => String(h ?? '').trim());
  if (!headers.some(Boolean)) throw new Error(`${tab}: the first row has no named headers.`);
  const columns = new Map();
  headers.forEach((header,index) => { if(header){if(!columns.has(header))columns.set(header,[]);columns.get(header).push(index);} });
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
  return {headers,rows:records,duplicateHeaders};
}
function columnName(number) {
  let name = '';
  while (number) { number--; name = String.fromCharCode(65 + number % 26) + name; number = Math.floor(number / 26); }
  return name;
}
async function append(tab, snapshot, object) {
  const values = snapshot.headers.map(header => header ? object[header] ?? '' : '');
  await request(`/values/${encodeURIComponent(`${tab}!A:${columnName(snapshot.headers.length)}`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {method:'POST', body:JSON.stringify({values:[values]})});
}
function requireHeaders(tab, snapshot, names) {
  const missing = names.filter(name => !snapshot.headers.includes(name));
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

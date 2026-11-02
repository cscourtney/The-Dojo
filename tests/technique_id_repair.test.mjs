import {test} from 'node:test';
import assert from 'node:assert/strict';
import {connect,repairTechniqueIdHeader,parseTab} from '../next/js/sheets.js';
test('missing technique ID repair preserves every source cell, reconciles a lost response, and is idempotent',async()=>{
 const raw=[['label','position','description','map_node','date','gi','created_at','',''],['Old technique','guard','Keep the description','','2026-01-01','gi','old','','','UNNAMED CELL','ANOTHER UNNAMED CELL']];const original=structuredClone(raw);const writes=[];
 const oldFetch=globalThis.fetch,oldWindow=globalThis.window,oldGoogle=globalThis.google;
 globalThis.window={google:{accounts:{oauth2:{}}}};globalThis.google={accounts:{oauth2:{initTokenClient:config=>({requestAccessToken:()=>config.callback({access_token:'test-only',expires_in:3600})})}}};
 globalThis.fetch=async(url,options)=>{
  if(options.method==='PUT'){writes.push(String(url));assert.ok(decodeURIComponent(String(url)).includes('techniques!L1'));while(raw[0].length<12)raw[0].push('');raw[0][11]='id';return {ok:false,status:500,json:async()=>({})};}
  return {ok:true,json:async()=>({values:structuredClone(raw)})};
 };
 try{await connect();const repaired=await repairTechniqueIdHeader();assert.ok(repaired.headerKeys.includes('id'));assert.deepEqual(raw[1],original[1]);assert.deepEqual(raw[0].slice(0,original[0].length),original[0]);await repairTechniqueIdHeader();assert.equal(writes.length,1);}
 finally{globalThis.fetch=oldFetch;globalThis.window=oldWindow;globalThis.google=oldGoogle;}
});
test('existing technique_id aliases are recognized as stable IDs',()=>{const snapshot=parseTab('techniques',[['Technique ID','Name','Position'],['old-stable-id','Triangle','guard']]);assert.equal(snapshot.rows[0].id,'old-stable-id');assert.equal(snapshot.headerKeys[0],'id');});
test('repair adds id and created_at together when both are missing, preserving existing values',async()=>{
 const raw=[['label','position','description','map_node','date','gi'],['Triangle','guard','Original description','closed-guard','2026-01-01','gi','UNNAMED CONTENT']];const original=structuredClone(raw);let puts=0;
 const oldFetch=globalThis.fetch,oldWindow=globalThis.window,oldGoogle=globalThis.google;
 globalThis.window={google:{accounts:{oauth2:{}}}};globalThis.google={accounts:{oauth2:{initTokenClient:config=>({requestAccessToken:()=>config.callback({access_token:'test-only',expires_in:3600})})}}};
 globalThis.fetch=async(url,options)=>{if(options.method==='PUT'){puts++;assert.deepEqual(JSON.parse(options.body).values,[['id','created_at']]);assert.ok(decodeURIComponent(String(url)).includes('techniques!H1'));while(raw[0].length<7)raw[0].push('');raw[0].push('id','created_at');}return {ok:true,json:async()=>({values:structuredClone(raw)})};};
 try{await connect();const repaired=await repairTechniqueIdHeader();assert.ok(repaired.headerKeys.includes('id')&&repaired.headerKeys.includes('created_at'));assert.equal(puts,1);assert.deepEqual(raw[1],original[1]);assert.deepEqual(raw[0].slice(0,6),original[0]);await repairTechniqueIdHeader();assert.equal(puts,1);}
 finally{globalThis.fetch=oldFetch;globalThis.window=oldWindow;globalThis.google=oldGoogle;}
});

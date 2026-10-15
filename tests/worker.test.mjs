import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/worker.mjs';
const env={ANTHROPIC_API_KEY:'test-only',MODEL:'test-model',ALLOWED_EMAILS:'owner@example.com',AI_RATE_LIMITER:{limit:async()=>({success:true})}};
const fields=['date','entry_type','gi','lesson','standup','technique','rolls','drillwork','pearls','fundamentals','notes','position','technique_label','takedown_label','map_node'];
const entry=Object.fromEntries(fields.map(f=>[f,'']));Object.assign(entry,{date:'2026-10-14',entry_type:'class',gi:'gi',lesson:'Passing'});
function request(body={transcript:'We practiced passing.',today:'2026-10-14'},origin='https://cscourtney.github.io',authorized=true){return new Request('https://worker.test/parse-workout',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(authorized?{Authorization:'Bearer test-session'}:{})},body:JSON.stringify(body)});}
async function mockFetch(run,{email='owner@example.com',providerStatus=200,reply=entry}={}){
 const original=globalThis.fetch;const calls=[];
 globalThis.fetch=async(url,options)=>{calls.push({url,options});if(url.includes('userinfo'))return Response.json({sub:'123',email,email_verified:true});return providerStatus===200?Response.json({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(reply)}]}):new Response('private provider detail',{status:providerStatus});};
 try{await run(calls);}finally{globalThis.fetch=original;}
}
test('rejects untrusted origins and missing authentication without contacting AI',async()=>{assert.equal((await worker.fetch(request({},'https://evil.test'),env)).status,403);assert.equal((await worker.fetch(request(undefined,undefined,false),env)).status,401);});
test('rejects a valid Google identity outside the account allowlist',async()=>{await mockFetch(async calls=>{assert.equal((await worker.fetch(request(),env)).status,403);assert.equal(calls.length,1);},{email:'other@example.com'});});
test('validates and parses a recap using only the server model and key',async()=>{await mockFetch(async calls=>{const response=await worker.fetch(request(),env);assert.equal(response.status,200);assert.deepEqual((await response.json()).entry,entry);const payload=JSON.parse(calls[1].options.body);assert.equal(payload.model,'test-model');assert.equal(calls[1].options.headers['x-api-key'],'test-only');});});
test('rejects oversized, invalid, and malformed interpreted entries',async()=>{await mockFetch(async()=>{assert.equal((await worker.fetch(request({transcript:'x'.repeat(21000),today:'2026-10-14'}),env)).status,400);assert.equal((await worker.fetch(request({transcript:'x',today:'invalid'}),env)).status,400);});await mockFetch(async()=>{assert.equal((await worker.fetch(request(),env)).status,502);},{reply:{date:'invented'}});});
test('rate limits and missing configuration fail closed',async()=>{assert.equal((await worker.fetch(request(),{...env,MODEL:''})).status,503);await mockFetch(async calls=>{assert.equal((await worker.fetch(request(),{...env,AI_RATE_LIMITER:{limit:async()=>({success:false})}})).status,429);assert.equal(calls.length,1);});});
test('provider errors expose status but not provider response contents',async()=>{await mockFetch(async()=>{const response=await worker.fetch(request(),env);assert.equal(response.status,502);const body=await response.text();assert.match(body,/429/);assert.ok(!body.includes('private provider detail'));},{providerStatus:429});});

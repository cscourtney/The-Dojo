import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makePrep,searchHistory,resourceURL} from '../next/js/insights.js';
import {validateReferenceNotes} from '../next/js/course-references.js';
import {preferredPrepVoice,PrepPlayback} from '../next/js/workspace-tools.js';
test('prep retrieves older relevant pearls, strategy, private notes, and written teaching',()=>{
 const snapshots={data:{rows:[{id:'recent',date:'2025-01-04',lesson:'Half guard'},{id:'old',date:'2020-01-01',lesson:'Half guard'}]},goals:{rows:[{goal:'Half guard frames'}]},pearls:{rows:[{date:'2025-01-03',pearl:'Unrelated takedown tip'},{date:'2020-01-01',pearl:'Half guard: recover frames'}]},dojo_map_nodes:{rows:[{id:'half-guard',title:'Half guard',notes:'Connect half guard to butterfly'}]},privates:{rows:[{id:'private',date:'2020-01-01',focus:'Half guard',notes:'Recover inside position'}]},__course_references:{rows:[{title:'Half guard video',kind:'video_listing',summary:'Never use an unwatched video as teaching',tags:['half guard']},{title:'Half guard frames',kind:'official_written_breakdown',summary:'Verified written teaching',tags:['half guard']}]}};
 const prep=makePrep(snapshots);assert.match(prep.text,/2 saved sessions/);assert.match(prep.text,/Connect half guard/);assert.match(prep.text,/Recover inside position/);assert.match(prep.text,/Verified written teaching/);assert.doesNotMatch(prep.text,/unwatched video/);assert.equal(prep.sections.find(s=>s.title==='Carry this with you').source.row.date,'2020-01-01');
});
test('private reference imports validate source links and duplicate identity',()=>{
 const row={id:'one',title:'Frames',summary:'Written instruction',kind:'official_written_breakdown',evidence:'Written article, not transcript',url:'https://example.com/lesson/frames',tags:['frames']};
 assert.equal(validateReferenceNotes([row]).length,1);assert.throws(()=>validateReferenceNotes([row,row]),/unique/);assert.throws(()=>validateReferenceNotes([{...row,url:'javascript:alert(1)'}]),/source/);assert.throws(()=>validateReferenceNotes([{...row,tags:['frames',{}]}]),/tags/);
});
test('playback prefers installed Australian female voice and keeps pause and stop',()=>{
 const karen={lang:'en-AU',name:'Karen'},american={lang:'en-US',name:'Samantha'};
 assert.equal(preferredPrepVoice([american,karen]),karen);assert.equal(preferredPrepVoice([american]),null);
 const originalWindow=globalThis.window,originalSpeech=globalThis.speechSynthesis,originalUtterance=globalThis.SpeechSynthesisUtterance;
 let spoken;const speech={getVoices:()=>[american,karen],cancel(){},speak(value){spoken=value;},pause(){this.paused=true;},resume(){this.paused=false;}};
 globalThis.window={speechSynthesis:speech};globalThis.speechSynthesis=speech;globalThis.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
 try{const controls={state:{},play:{},pause:{},stop:{}};const playback=new PrepPlayback(controls);playback.update('Practice frames');controls.play.onclick();assert.equal(spoken.voice,karen);controls.pause.onclick();assert.equal(speech.paused,true);controls.pause.onclick();assert.equal(speech.paused,false);controls.stop.onclick();assert.equal(playback.active,false);assert.equal(controls.stop.disabled,true);}finally{globalThis.window=originalWindow;globalThis.speechSynthesis=originalSpeech;globalThis.SpeechSynthesisUtterance=originalUtterance;}
});
test('prep uses actual active goals, mistakes, and dated notes with citations',()=>{
 const snapshots={data:{rows:[{id:'one',date:'2025-01-01',lesson:'Passing',rolls:'Lost underhook',fundamentals:'Keep a frame'}]},goals:{rows:[{goal:'Ignore completed goal',status:'done'},{goal:'Retain guard',status:'active'}]},mistakes:{rows:[{mistake:'Crossing arms',fix:'Keep elbows close',status:'active'}]},pearls:{rows:[{date:'2025-01-02',entry_id:'one',pearl:'Secure the underhook'}]}};
 const prep=makePrep(snapshots);assert.match(prep.text,/Retain guard/);assert.doesNotMatch(prep.text,/Ignore completed/);assert.match(prep.text,/Keep elbows close/);assert.equal(prep.sections[0].source.tab,'goals');assert.deepEqual(prep.missing,[]);
});
test('empty or partially loaded sources are disclosed rather than invented',()=>{const prep=makePrep({});assert.equal(prep.text,'');assert.ok(prep.missing.includes('data'));const partial=makePrep({data:{rows:[{date:'2025-01-01',lesson:'Passing'}],stale:true}});assert.ok(partial.stale.includes('data'));assert.ok(partial.missing.includes('goals'));});
test('search reaches old history and other tabs with evidence and no generated diagnoses',()=>{const results=searchHistory({data:{rows:[{id:'old',date:'2020-01-01',lesson:'Back control',rolls:'Lost hooks while taking the back'}]},mistakes:{rows:[{mistake:'Back control mistake',fix:'Chest to back'}]}},'biggest mistakes back control');assert.ok(results.some(r=>r.row.id==='old'));assert.ok(results.some(r=>r.tab==='mistakes'));assert.equal(searchHistory({},'the and my').length,0);});
test('resource links reject homepages, unsafe schemes, and non-video YouTube links',()=>{for(const url of ['https://www.youtube.com','https://www.youtube.com/results?search_query=bjj','javascript:alert(1)','https://www.gracieuniversity.com/'])assert.equal(resourceURL({url}),null);assert.match(resourceURL({url:'https://www.youtube.com/watch?v=abc123',start_seconds:134}),/t=134s/);assert.match(resourceURL({url:'https://www.youtube.com/embed/abc123',start_seconds:134}),/start=134/);assert.ok(resourceURL({url:'https://www.gracieuniversity.com/lesson/123'}));});


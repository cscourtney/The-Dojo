import {test} from 'node:test';
import assert from 'node:assert/strict';
import {libraryTechniques,libraryPearls,categoriesFor,isReference} from '../next/js/library.js';
import {parseTab} from '../next/js/sheets.js';
test('legacy header spellings map to canonical fields without moving physical columns',()=>{
 const tab=parseTab('techniques',[['Technique Name','','Position','Detailed Description','Danaher Category'],['Knee slice','retained raw cell','guard-passing','','Guard passing']]);
 assert.deepEqual(tab.headerKeys,['label','','position','description','danaher_category']);assert.equal(tab.rows[0].label,'Knee slice');assert.equal(tab.headers[1],'');
 assert.equal(parseTab('data',[['Date','Fundamentals','Technique Name'],['2026-01-01','Frames','Kimura']]).rows[0].technique_label,'Kimura');
 assert.equal(parseTab('pearls',[['Pearls','Entry ID'],['Breathe','x']]).rows[0].pearl,'Breathe');
});
test('journal fallback retains library ownership and existing categories without creating rows',()=>{
 const snapshots={techniques:{rows:[{label:'Knee slice',position:'gpass',description:''}]},data:{rows:[{id:'j',technique_label:'Knee slice',position:'guard-passing',technique:'Connected hips',danaher_category:'Passing',pearls:'1. Stay close\nBreathe'},{id:'old',technique_label:'Triangle',position:'guard',technique:'Angle first'}]},pearls:{rows:[{entry_id:'j',pearl:'Stay close'}]}};
 const before=JSON.stringify(snapshots);const techniques=libraryTechniques(snapshots);
 assert.equal(techniques.length,2);assert.equal(techniques.find(row=>row.label==='Knee slice').description,'Connected hips');assert.equal(techniques.find(row=>row.label==='Knee slice').danaher_category,'Passing');assert.equal(libraryPearls(snapshots).length,2);assert.ok(categoriesFor(snapshots).includes('Needs review'));assert.equal(JSON.stringify(snapshots),before);
 assert.equal(isReference({entry_type:'fundamental'}),true);assert.equal(isReference({entry_type:'class'}),false);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseTab} from '../next/js/sheets.js';
test('ignores unnamed columns while preserving physical write positions',()=>{
 const snapshot=parseTab('techniques',[['description','','label','position',''],['Knee slice','unmapped data','Passing','guard-passing']]);
 assert.deepEqual(snapshot.headers,['description','','label','position','']);
 assert.deepEqual(snapshot.rows,[{description:'Knee slice',label:'Passing',position:'guard-passing'}]);
});
test('reads nonconflicting duplicate headers and identifies them for write protection',()=>{
 const snapshot=parseTab('techniques',[['label','position','position'],['Kimura','side-control',''],['Triangle','','guard'],['Armbar','mount','mount']]);
 assert.deepEqual(snapshot.duplicateHeaders,['position']);
 assert.deepEqual(snapshot.rows.map(row=>row.position),['side-control','guard','mount']);
});
test('reports actual conflicting duplicate header and columns without exposing content',()=>{
 assert.throws(()=>parseTab('techniques',[['label','position','position'],['Kimura','private first','private second']]),error=>error.message.includes('"position"')&&error.message.includes('B, C')&&error.message.includes('row 2')&&!error.message.includes('private'));
});
test('does not invent headers for an entirely unnamed sheet',()=>{
 assert.throws(()=>parseTab('techniques',[['',''],['a','b']]),/no named headers/);
});

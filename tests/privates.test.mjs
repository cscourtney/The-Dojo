import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseTab} from '../next/js/sheets.js';
import {videoURL} from '../next/js/links.js';
import {makeBookModel,notebookHTML} from '../next/js/book-model.js';
test('private lesson legacy headers map by name without losing source cells',()=>{
 const rawValues=[['Date','Coach','Topic','Details','Video','','Extra'],['2026-11-02','Coach','Passing','Lesson notes','https://example.com/video?t=37','Keep unnamed','Keep extra']];
 const parsed=parseTab('privates',rawValues);assert.equal(parsed.rows[0].instructor,'Coach');assert.equal(parsed.rows[0].notes,'Lesson notes');assert.equal(parsed.headerKeys[5],'');
 const model=makeBookModel({complete:true,title:'FIXTURE',tabNames:['privates'],sheets:{privates:{...parsed,rawValues}}});const chapter=model.chapters[0];assert.equal(chapter.title,'Private Lessons');assert.equal(chapter.records[0].title,'Passing');assert.ok(chapter.records[0].fields.some(field=>field.value==='Keep unnamed'));const html=notebookHTML(model);assert.ok(html.includes('href="https://example.com/video?t=37"'));assert.ok(html.includes('Lesson notes'));
});
test('video links reject script/file schemes and embedded credentials',()=>{
 for(const value of ['javascript:alert(1)','file:///tmp/video','https://user:secret@example.com/video','not a URL'])assert.equal(videoURL(value),null);
 assert.equal(videoURL('https://example.com/video?t=37'),'https://example.com/video?t=37');
});

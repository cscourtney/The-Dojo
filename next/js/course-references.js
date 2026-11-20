import {resourceURL} from './insights.js?v=20';
// Private course imports remain separate from the Sheet-backed training library.
export function validateReferenceNotes(input){
 if(!Array.isArray(input)||input.length>1000)throw new Error('Choose an array of up to 1,000 reference notes.');
 const ids=new Set();
 return input.map(note=>{
  if(!note||typeof note!=='object'||typeof note.id!=='string'||!note.id.trim()||ids.has(note.id))throw new Error('Each reference needs a unique ID.');
  ids.add(note.id);
  for(const key of ['title','summary','kind','evidence','url'])if(typeof note[key]!=='string'||!note[key].trim()||note[key].length>30000)throw new Error('Each reference needs a title, summary, kind, evidence, and source URL.');
  if(!resourceURL(note))throw new Error('Reference links must point to a specific HTTP or HTTPS source.');
  if(!Array.isArray(note.tags)||note.tags.some(tag=>typeof tag!=='string'||tag.length>200))throw new Error('Reference tags must be short text labels.');
  return {id:note.id,title:note.title,summary:note.summary,kind:note.kind,evidence:note.evidence,url:note.url,tags:note.tags.slice(0,40)};
 });
}

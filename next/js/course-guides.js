// Private portable guide format. Imported HTML is read as data and never executed.
import {resourceURL} from './insights.js?v=20';
const ID=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/;
function value(object,key,max=20000,optional=false){const result=object?.[key];if(optional&&result===undefined)return '';if(typeof result!=='string'||(!optional&&!result.trim())||result.length>max)throw Error('Invalid guide '+key+'.');return result;}
export function validateCourseGuides(bundle){
 if(bundle?.format!=='dojo-course-guides'||bundle.version!==1||!Array.isArray(bundle.guides)||bundle.guides.length>100)throw Error('Choose a Dojo course guide or guide collection.');
 const ids=new Set();let sections=0;
 return bundle.guides.map(guide=>{
  if(!guide||!ID.test(guide.id)||ids.has(guide.id))throw Error('Each guide needs a unique stable ID.');ids.add(guide.id);
  if(!Array.isArray(guide.sections)||!guide.sections.length||guide.sections.length>500||(sections+=guide.sections.length)>5000)throw Error('The guide has too many sections or none.');
  const sectionIDs=new Set();
  return {id:guide.id,title:value(guide,'title',500),instructor:value(guide,'instructor',200),course_title:value(guide,'course_title',500),overview:value(guide,'overview'),review_status:value(guide,'review_status',2000),updated_at:value(guide,'updated_at',100),sections:guide.sections.map(section=>{
   if(!section||!ID.test(section.id)||sectionIDs.has(section.id))throw Error('Each guide section needs a unique stable ID.');sectionIDs.add(section.id);
   const sources=section.sources||[];if(!Array.isArray(sources)||sources.length>30)throw Error('Invalid guide sources.');
   return {id:section.id,title:value(section,'title',500),body:value(section,'body',30000),kind:value(section,'kind',100,true),sources:sources.map(source=>{
    const title=value(source,'title',500),url=value(source,'url',2000,true),locator=value(source,'locator',1200,true);
    if(url&&!resourceURL({url}))throw Error('A guide source needs a specific safe HTTP or HTTPS URL.');
    return {title,url,locator};
   })};
  })};
 });
}
export function parseCourseGuides(content){
 if(typeof content!=='string'||content.length>10000000)throw Error('Choose a guide smaller than 10 MB.');
 let text=content.trim();if(text.startsWith('<')){
  const match=text.match(/<script\b(?=[^>]*\bid=["']dojo-course-guides["'])(?=[^>]*\btype=["']application\/json["'])[^>]*>([\s\S]*?)<\/script\s*>/i);
  if(!match)throw Error('This HTML file has no portable Dojo course guide. Choose the guide file, not a webpage shortcut.');text=match[1];
 }
 let bundle;try{bundle=JSON.parse(text);}catch{throw Error('The guide file could not be read.');}
 return validateCourseGuides(bundle);
}
export function guideBundle(guides){return {format:'dojo-course-guides',version:1,guides:validateCourseGuides({format:'dojo-course-guides',version:1,guides})};}
export function mergeCourseGuides(current,incoming){const map=new Map(current.map(g=>[g.id,g]));for(const guide of incoming)map.set(guide.id,guide);return validateCourseGuides({format:'dojo-course-guides',version:1,guides:[...map.values()]});}
export function guideChapters(guides){return guides.map(guide=>({id:'guide-'+guide.id,tab:'private-course-guide',title:'Course Guide · '+guide.title,courseGuide:true,sourceRows:0,provenance:'Private course guide · '+guide.instructor+' · '+guide.course_title,introduction:guide.overview+'\n\nReview: '+guide.review_status+'\nUpdated: '+guide.updated_at,records:guide.sections.map(section=>({id:'guide-record-'+guide.id.length+'-'+guide.id+'-'+section.id,title:section.title,date:'',fields:[{key:'guide_text',label:section.kind==='practice_suggestion'?'Suggested practice':'Guide',value:section.body},...section.sources.flatMap((source,i)=>[{key:'guide_source_'+i,label:'Source'+(section.sources.length>1?' '+(i+1):''),value:source.title+(source.locator?' · '+source.locator:'')},...(source.url?[{key:'guide_url_'+i,label:'Open source',value:source.url,url:source.url}]:[])])]}))}));}

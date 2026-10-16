export const POSITIONS = [
 ['guard','Guard'], ['guard-passing','Guard Passing'], ['side-control','Side Control'],
 ['side-control-escape','Side Control Escape'], ['mount','Mount'], ['mount-escape','Mount Escape'],
 ['back-control','Back Control'], ['back-defense','Back Defense'], ['butterfly','Butterfly Guard'],
 ['half-guard','Half Guard'], ['octopus','Octopus Guard'], ['x-guard','X-Guard'],
 ['leg-locks','Leg Locks'], ['turtle','Turtle'], ['submissions','Submissions'],
 ['takedowns','Takedowns'], ['self-defense','Self Defense'], ['other','Other']
];
export const MAP_NODES = [
 ['standing','Standing / Clinch'], ['pull-guard','Pull Guard / Open Guard'], ['takedowns','Takedowns'],
 ['takedown-defense','Takedown Defense'], ['closed-guard','Closed Guard'], ['x-guard','X-Guard / Open'],
 ['butterfly','Butterfly Guard'], ['half-guard','Half Guard'], ['octopus','Octopus Guard'],
 ['guard-retention','Guard Retention'], ['guard-passing','Guard Passing'], ['side-control','Side Control'],
 ['side-control-escape','Side Control Escape'], ['mount','Mount'], ['mount-escape','Mount Escape'],
 ['back-control','Back Control'], ['back-defense','Back Defense'], ['leg-locks','Leg Locks'],
 ['turtle','Turtle'], ['submissions','Submissions']
];
export const FIELDS = [
 ['date','Date','date'], ['entry_type','Session type',[['class','Class'],['drill','Home drill'],['technique','Technique']]],
 ['gi','Gi / No-gi',[['gi','Gi'],['nogi','No-gi']]], ['lesson','Lesson / Focus','text'],
 ['standup','Standup','area'], ['technique','Technique · detailed description','area'],
 ['drillwork','Drillwork','area'], ['rolls','Rolls','area'], ['pearls','Pearls','area'],
 ['fundamentals','Fundamentals','area'], ['notes','Notes','area']
];
export const DETAIL_LABELS = [
 ['lesson','Lesson / Focus'], ['standup','Standup'], ['technique','Technique · detailed description'],
 ['drillwork','Drillwork'], ['rolls','Rolls'], ['pearls','Pearls'], ['fundamentals','Fundamentals'], ['notes','Notes']
];
export const normalize = value => String(value || '').trim().toLowerCase().replace(/\s+/g,' ');
export function positionKey(value) {
 const key=normalize(value);
 return ({gpass:'guard-passing',side:'side-control',back:'back-control',leglocks:'leg-locks',selfdef:'self-defense'})[key] || key;
}
export function techniqueName(row) { return row.label || row.technique_label || ''; }
export function sameTechnique(a,b) {
 return normalize(techniqueName(a))===normalize(techniqueName(b)) && positionKey(a.position)===positionKey(b.position);
}
export function sortedEntries(rows) {
 return [...rows].sort((a,b)=>dateKey(b.date).localeCompare(dateKey(a.date)) || String(b.created_at||'').localeCompare(String(a.created_at||'')));
}
function dateKey(value) {
 const text=String(value||'');if(/^\d{4}-\d{2}-\d{2}/.test(text))return text.slice(0,10);
 const parsed=Date.parse(text);return Number.isNaN(parsed)?'':new Date(parsed).toISOString().slice(0,10);
}
export function localToday(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function newDraft(){return {id:crypto.randomUUID(),date:localToday(),entry_type:'class',gi:'gi',transcript:'',fields:{},links:{createTechnique:false,createTakedown:false,linkMap:false}};}

const MAP_ALIASES={pull:'pull-guard',takedown:'takedowns',tddef:'takedown-defense',closed:'closed-guard',xguard:'x-guard',half:'half-guard',retention:'guard-retention',gpass:'guard-passing','side-top':'side-control','side-esc':'side-control-escape','mount-top':'mount','mount-esc':'mount-escape',back:'back-control','back-def':'back-defense',legs:'leg-locks',subs:'submissions'};
export function canonicalMapKey(value){const key=normalize(value);return MAP_ALIASES[key]||key;}

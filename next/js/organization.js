import {canonicalMapKey,normalize} from './journal.js?v=12';
export const ORG_TABS={categories:'dojo_categories',nodes:'dojo_map_nodes',edges:'dojo_map_edges'};
export const ORG_HEADERS={dojo_categories:['id','label','sort_order','aliases','description'],dojo_map_nodes:['id','title','type','x','y','sort_order','notes'],dojo_map_edges:['id','from_node','to_node','label','sort_order','enabled']};
const values=snapshot=>snapshot?.rows||[];
export function categoryDefinitions(snapshots){
 return values(snapshots[ORG_TABS.categories]).filter(row=>row.id&&row.label).sort(ordered);
}
export function ordered(a,b){return (Number(a.sort_order)||0)-(Number(b.sort_order)||0)||String(a.label||a.title||a.id).localeCompare(String(b.label||b.title||b.id));}
export function categoryName(value,snapshots){const key=normalize(value);const definition=categoryDefinitions(snapshots).find(row=>[row.id,row.label,...String(row.aliases||'').split('|')].some(name=>normalize(name)===key));return definition?.label||String(value||'').trim()||'Needs review';}
export function sheetLayout(snapshots){
 const snapshot=snapshots[ORG_TABS.nodes];if(!snapshot||snapshot.missing)return null;
 if(snapshot.loadError||snapshot.readProblem)throw new Error('Map nodes could not be read from Google Sheets. Refresh organization before using the map.');
 const nodes={};for(const row of values(snapshot).sort(ordered)){
  const id=canonicalMapKey(row.id);if(!id||!row.title)throw new Error('Each Sheet map node needs an ID and title.');
  if(nodes[id])throw new Error('The Sheet contains duplicate map node IDs.');
  const x=Number(row.x),y=Number(row.y);if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>10000||y>10000)throw new Error('Map coordinates must be numbers from 0 to 10000.');
  nodes[id]={title:String(row.title),type:['o','d','n'].includes(row.type)?row.type:'n',x,y,notes:row.notes||'',goesTo:[]};
 }
 const edgeSnapshot=snapshots[ORG_TABS.edges];if(!edgeSnapshot||edgeSnapshot.loadError||edgeSnapshot.readProblem)throw new Error('Map connections are not loaded. Refresh organization.');
 const edges=[];for(const row of values(edgeSnapshot).sort(ordered)){
  if(['false','0','no'].includes(normalize(row.enabled)))continue;
  const from=canonicalMapKey(row.from_node),to=canonicalMapKey(row.to_node);
  if(!nodes[from]||!nodes[to])throw new Error('A Sheet map connection refers to a missing node. Correct the connection in Organization.');
  nodes[from].goesTo.push(to);edges.push({...row,from_node:from,to_node:to});
 }
 return {source:'Google Sheets',nodes,edges,width:Math.max(1900,...Object.values(nodes).map(n=>n.x+240)),height:Math.max(1050,...Object.values(nodes).map(n=>n.y+140))};
}
export function organizationSeeds(workbook,reference){
 const snapshots=workbook.sheets;const names=new Set(['Submissions','Self Defense','Needs review']);
 for(const tab of ['techniques','data'])for(const row of values(snapshots[tab]))if(String(row.danaher_category||'').trim())names.add(String(row.danaher_category).trim());
 const uniqueNames=[...new Map([...names].map(label=>[normalize(label),label])).values()];
 const categories=uniqueNames.sort((a,b)=>a==='Needs review'?1:b==='Needs review'?-1:a.localeCompare(b)).map((label,i)=>({id:'category:'+encodeURIComponent(normalize(label)),label,sort_order:(i+1)*10,aliases:label,description:''}));
 const nodes=Object.entries(reference.nodes).map(([id,node],i)=>({id:canonicalMapKey(id),title:node.title,type:node.type,x:node.x,y:node.y,sort_order:(i+1)*10,notes:''}));
 const edges=[];for(const [id,node]of Object.entries(reference.nodes))for(const target of node.goesTo||[])edges.push({id:'edge:'+canonicalMapKey(id)+':'+canonicalMapKey(target),from_node:canonicalMapKey(id),to_node:canonicalMapKey(target),label:'',sort_order:(edges.length+1)*10,enabled:'true'});
 return {[ORG_TABS.categories]:categories,[ORG_TABS.nodes]:nodes,[ORG_TABS.edges]:edges};
}
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mapSVG(layout,targets={}){
 const {width=1900,height=1050}=layout;let body='';
 for(const edge of layout.edges||Object.entries(layout.nodes).flatMap(([id,node])=>(node.goesTo||[]).map(to=>({from_node:id,to_node:to})))){
  const a=layout.nodes[edge.from_node],b=layout.nodes[edge.to_node];if(!a||!b)continue;
  body+=`<path d="M ${a.x+180} ${a.y+38} C ${a.x+270} ${a.y+38}, ${b.x-90} ${b.y+38}, ${b.x} ${b.y+38}" fill="none" stroke="#8e9c89" stroke-width="2" marker-end="url(#arrow)"/>`;
  if(edge.label)body+=`<text x="${(a.x+180+b.x)/2}" y="${(a.y+b.y)/2+30}" font-family="sans-serif" font-size="12" fill="#455641">${escape(edge.label)}</text>`;
 }
 for(const [id,node]of Object.entries(layout.nodes)){
  const color={o:'#5c8468',d:'#b17a60',n:'#869586'}[node.type]||'#869586';const href=targets[id];
  const words=String(node.title).split(/\s+/);const lines=[''];for(const word of words){const i=lines.length-1;if((lines[i]+' '+word).trim().length>21&&lines[i])lines.push(word);else lines[i]=(lines[i]+' '+word).trim();}
  body+=(href?`<a href="${escape(href)}">`:'')+`<g><rect x="${node.x}" y="${node.y}" width="180" height="76" rx="7" fill="#fffdf5" stroke="${color}" stroke-width="3"/>`+lines.map((line,i)=>`<text x="${node.x+10}" y="${node.y+25+i*20}" font-family="sans-serif" font-size="15" fill="#23372f">${escape(line)}</text>`).join('')+'</g>'+(href?'</a>':'');
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Strategy map"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#8e9c89"/></marker></defs>${body}</svg>`;
}

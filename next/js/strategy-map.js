import {canonicalMapKey} from './journal.js?v=5';
const NS='http://www.w3.org/2000/svg';
const create=(tag,attrs={})=>{const element=document.createElementNS(NS,tag);for(const [key,value]of Object.entries(attrs))element.setAttribute(key,value);return element;};
export class StrategyMap{
 constructor({viewport,holder,select,zoomIn,zoomOut,fit,onSelect}){Object.assign(this,{viewport,holder,select,onSelect});this.scale=1;this.layout=null;this.snapshot={};this.selected='';zoomIn.onclick=()=>this.zoom(this.scale+.15);zoomOut.onclick=()=>this.zoom(this.scale-.15);fit.onclick=()=>this.zoom(Math.min(1,(this.viewport.clientWidth-20)/1900));select.onchange=()=>{if(select.value)this.onSelect(select.value);};}
 async load(){if(this.layout)return;const response=await fetch('./assets/strategy-layout.json');if(!response.ok)throw new Error('The reference map layout could not load. The strategy links below are still available.');this.layout=await response.json();this.draw();}
 zoom(scale){this.scale=Math.max(.35,Math.min(1.5,scale));if(this.canvas){this.canvas.style.transform=`scale(${this.scale})`;this.holder.style.width=1900*this.scale+'px';this.holder.style.height=1050*this.scale+'px';}}
 update(snapshots,selected=''){this.snapshot=snapshots;this.selected=canonicalMapKey(selected);if(this.layout)this.draw();}
 draw(){
  const nodes=this.layout.nodes;const counts=new Map();
  for(const tab of ['data','techniques'])for(const row of this.snapshot[tab]?.rows||[]){const key=canonicalMapKey(row.map_node);if(key)counts.set(key,(counts.get(key)||0)+1);}
  const previous=this.select.value;this.select.replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent='Choose a position…';this.select.append(empty);
  this.holder.replaceChildren();this.canvas=document.createElement('div');this.canvas.className='map-canvas';this.canvas.style.width='1900px';this.canvas.style.height='1050px';
  const svg=create('svg',{viewBox:'0 0 1900 1050',width:1900,height:1050,'aria-hidden':'true'});const defs=create('defs');const marker=create('marker',{id:'map-arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto-start-reverse'});marker.append(create('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#8b9c8c'}));defs.append(marker);svg.append(defs);
  for(const [id,node]of Object.entries(nodes))for(const target of node.goesTo||[]){const next=nodes[target];if(!next)continue;const x=node.x+180,y=node.y+38,x2=next.x,y2=next.y+38;svg.append(create('path',{d:`M ${x} ${y} C ${x+90} ${y}, ${x2-90} ${y2}, ${x2} ${y2}`,fill:'none',stroke:'#a7b3a5','stroke-width':1.5,'marker-end':'url(#map-arrow)'}));}
  this.canvas.append(svg);
  for(const [id,node]of Object.entries(nodes)){
   const key=canonicalMapKey(id),count=counts.get(key)||0;const option=document.createElement('option');option.value=key;option.textContent=node.title+(count?' · '+count+' links':'');this.select.append(option);
   const button=document.createElement('button');button.type='button';button.className='map-node '+({o:'offense',d:'defense',n:'neutral'}[node.type]||'neutral');button.style.left=node.x+'px';button.style.top=node.y+'px';button.setAttribute('aria-label',node.title+(count?', '+count+' linked records':', no linked records'));if(this.selected===key)button.setAttribute('aria-pressed','true');
   const title=document.createElement('strong');title.textContent=node.title;const detail=document.createElement('small');detail.textContent=count?`${count} linked records`:'No linked records yet';button.append(title,detail);button.onclick=()=>this.onSelect(key);this.canvas.append(button);
  }
  this.select.value=this.selected||previous;this.holder.append(this.canvas);this.zoom(this.scale);
 }
}

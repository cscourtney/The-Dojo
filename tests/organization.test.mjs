import {test} from 'node:test';
import assert from 'node:assert/strict';
import {categoryName,categoryDefinitions,sheetLayout,organizationSeeds,ORG_HEADERS} from '../next/js/organization.js';
import {makeBookModel,notebookHTML} from '../next/js/book-model.js';
import {parseTab} from '../next/js/sheets.js';
const categories=[['id','label','sort_order','aliases','description'],['b','Passing','20','Old passing',''],['a','Escapes','10','',''],['r','Needs review','30','','']];
const nodes=[['id','title','type','x','y','sort_order','notes'],['guard','Guard','o','20','40','10','Keep frames'],['mount','Mount','o','350','40','20','']];
const edges=[['id','from_node','to_node','label','sort_order','enabled'],['e','guard','mount','Pass then mount','10','true']];
test('organization follows stable IDs and Sheet order, with aliases retained after renaming',()=>{
 const s={dojo_categories:parseTab('dojo_categories',categories),dojo_map_nodes:parseTab('dojo_map_nodes',nodes),dojo_map_edges:parseTab('dojo_map_edges',edges)};
 assert.deepEqual(categoryDefinitions(s).map(r=>r.label),['Escapes','Passing','Needs review']);assert.equal(categoryName('Old passing',s),'Passing');assert.equal(categoryName('b',s),'Passing');assert.deepEqual(sheetLayout(s).nodes.guard.goesTo,['mount']);
 assert.throws(()=>sheetLayout({...s,dojo_map_edges:{rows:[{from_node:'guard',to_node:'missing'}]}}),/missing node/);
});
test('notebook category order and linked visual map derive from the same Sheet organization',()=>{
 const tables={dojo_categories:categories,dojo_map_nodes:nodes,dojo_map_edges:edges,techniques:[['id','label','position','description','danaher_category','map_node'],['t','Knee slice','guard','Actual description','Old passing','guard']],data:[['id','date','lesson'],['j','2026-01-01','Class']]};
 const workbook={complete:true,title:'FIXTURE',tabNames:Object.keys(tables),sheets:Object.fromEntries(Object.entries(tables).map(([tab,rawValues])=>[tab,{...parseTab(tab,rawValues),rawValues}]))};
 const model=makeBookModel(workbook);assert.deepEqual(model.chapters.filter(c=>c.category).map(c=>c.category),['Escapes','Passing','Needs review']);
 const original=model.chapters.flatMap(c=>c.records).find(r=>r.keys?.id==='t');const map=model.chapters.find(c=>c.visualMap);assert.equal(map.layout.nodes.guard.title,'Guard');assert.ok(model.chapters.find(c=>c.tab==='derived-map-links').records[0].links.some(l=>l.id===original.id));
 const html=notebookHTML(model);assert.ok(html.includes('@page map{size:letter landscape'));assert.ok(html.includes('<svg'));assert.ok(html.includes('href="#'+original.id+'"'));assert.ok(html.includes('Keep frames'));
 tables.techniques[1][4]='';tables.data[0].push('technique_label','position','danaher_category');tables.data[1].push('Knee slice','guard','Old passing');const inherited=makeBookModel({...workbook,sheets:Object.fromEntries(Object.entries(tables).map(([tab,rawValues])=>[tab,{...parseTab(tab,rawValues),rawValues}]))});assert.ok(inherited.chapters.find(c=>c.category==='Passing').records.some(r=>r.keys.id==='t'));
 const seeds=organizationSeeds(workbook,{nodes:{guard:{title:'Guard',type:'o',x:20,y:40,goesTo:['mount']},mount:{title:'Mount',type:'o',x:350,y:40,goesTo:[]}}});assert.ok(seeds.dojo_categories.some(c=>c.label==='Old passing'));assert.equal(seeds.dojo_map_edges.length,1);assert.equal(ORG_HEADERS.dojo_map_nodes[0],'id');
});

import {makeBookModel,termsForRecord} from './book-model.js?v=7';
let libraries;
function loadScript(path){return new Promise((resolve,reject)=>{const script=document.createElement('script');const timer=setTimeout(()=>{script.remove();reject(new Error('PDF library timed out. Retry while connected to the app.'));},20000);script.src=new URL(path,import.meta.url).href;script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error('PDF library could not load. Retry while connected to the app.'));};document.head.append(script);});}
async function dependencies(){return libraries ||= (async()=>{if(!window.PDFLib)await loadScript('../vendor/pdf-lib.min.js');if(!window.fontkit)await loadScript('../vendor/fontkit.min.js');return {PDFLib:window.PDFLib,fontkit:window.fontkit};})().catch(error=>{libraries=null;throw error;});}
export async function createNotebookPDF(workbook,onProgress=()=>{},{paper=true}={}){
 const model=makeBookModel(workbook);onProgress('Loading PDF fonts…');const {PDFLib,fontkit}=await dependencies();
 const {PDFDocument,rgb,PDFName,PDFHexString}=PDFLib;
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
 const fontBytes=await Promise.all(['DejaVuSans.ttf','DejaVuSans-Bold.ttf','PatrickHand-Regular.ttf','Caveat.ttf'].map(async name=>{const response=await fetch(new URL('../assets/fonts/'+name,import.meta.url),{signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('Notebook font could not load.');return response.arrayBuffer();}));
 const regular=await pdf.embedFont(fontBytes[0],{subset:true}),bold=await pdf.embedFont(fontBytes[1],{subset:true}),handwriting=await pdf.embedFont(fontBytes[2],{subset:true}),heading=await pdf.embedFont(fontBytes[3],{subset:true});
 const characterSets=new Map([regular,bold,handwriting,heading].map(font=>[font,new Set(font.getCharacterSet())]));let unsupported=0;
 function clean(value,font=regular){const supported=characterSets.get(font);return [...String(value??'').replace(/\t/g,'    ').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'')].map(char=>{if(char==='\n'||supported.has(char.codePointAt(0)))return char;unsupported++;return '[U+'+char.codePointAt(0).toString(16).toUpperCase()+']';}).join('');}
 const ink=rgb(.12,.20,.16),muted=rgb(.35,.40,.36),line=rgb(.78,.81,.76);
 const W=612,H=792,M=54,BOTTOM=60;
 let paperBackground;
 if(paper){const texture=await PDFDocument.create();const sheet=texture.addPage([W,H]);sheet.drawRectangle({x:0,y:0,width:W,height:H,color:rgb(249/255,245/255,233/255)});let seed=4117;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};for(let i=0;i<1900;i++)sheet.drawCircle({x:random()*W,y:random()*H,size:.12+random()*.16,color:rgb(.55,.48,.35),opacity:.035+random()*.025});paperBackground=await pdf.embedPage(sheet);}
 function background(target){if(paperBackground)target.drawPage(paperBackground,{x:0,y:0,width:W,height:H});}
 let page,y;let chapterTitle='';const sectionStarts=[];const indexPages=new Map();
 function newPage(){page=pdf.addPage([W,H]);background(page);y=H-80;page.drawText(clean(chapterTitle),{x:M,y:H-42,size:9,font:regular,color:muted});page.drawLine({start:{x:M,y:H-51},end:{x:W-M,y:H-51},thickness:.5,color:line});return page;}
 function ensure(height){if(!page||y-height<BOTTOM)newPage();}
 function wrap(value,font=regular,size=10.5,width=W-2*M){
  const lines=[];for(const paragraph of clean(value,font).split('\n')){
   if(!paragraph.trim()){lines.push('');continue;}let current='';
   for(let word of paragraph.split(/\s+/)){
    if(font.widthOfTextAtSize(word,size)>width){if(current){lines.push(current);current='';}let part='';for(const char of word){if(font.widthOfTextAtSize(part+char,size)>width){lines.push(part);part=char;}else part+=char;}current=part;continue;}
    const next=current?current+' '+word:word;if(font.widthOfTextAtSize(next,size)>width){lines.push(current);current=word;}else current=next;
   }if(current)lines.push(current);
  }return lines;
 }
 function paragraph(value,{font=handwriting,size=13,leading=18,color=ink,indent=0}={}){if([...String(value)].some(char=>char!=='\n'&&!characterSets.get(font).has(char.codePointAt(0))&&characterSets.get(regular).has(char.codePointAt(0))))font=regular;for(const text of wrap(value,font,size,W-2*M-indent)){ensure(leading);if(text)page.drawText(text,{x:M+indent,y,size,font,color});y-=leading;}}
 function pageNumber(target){return pdf.getPages().indexOf(target)+1;}
 function goto(from,rect,target){const annotation=pdf.context.obj({Type:'Annot',Subtype:'Link',Rect:rect,Border:[0,0,0],Dest:[target.ref,PDFName.of('XYZ'),null,null,null]});const ref=pdf.context.register(annotation);const current=from.node.get(PDFName.of('Annots'));if(current)pdf.context.lookup(current).push(ref);else from.node.set(PDFName.of('Annots'),pdf.context.obj([ref]));}
 let processed=0;
 for(const chapter of model.chapters){
  chapterTitle=chapter.title;newPage();sectionStarts.push({title:chapter.title,page});paragraph(chapter.title,{font:heading,size:29,leading:37});y-=8;paragraph(chapter.derived?'Extracted from journal Fundamentals. The original fields are retained in Training Journal.':`Source tab: ${chapter.tab} · ${chapter.records.length} entries`,{font:regular,size:9,color:muted});y-=16;
  if(!chapter.records.length)paragraph('This tab has no nonempty data rows.');
  for(const record of chapter.records){
   ensure(70);const start=page;paragraph((record.date?record.date+' · ':'')+record.title,{font:heading,size:19,leading:25});y-=5;
   for(const field of record.fields){ensure(42);paragraph(field.label,{font:bold,size:8.5,leading:13,color:muted});paragraph(field.value);y-=7;}
   for(const term of termsForRecord(record,model.terms)){if(!indexPages.has(term))indexPages.set(term,new Set());indexPages.get(term).add(start);}
   ensure(12);page.drawLine({start:{x:M,y},end:{x:W-M,y},thickness:.35,color:line});y-=22;
   processed++;if(processed%10===0){onProgress(`Laying out ${chapter.title} · ${processed} entries…`);await new Promise(resolve=>setTimeout(resolve,0));}
  }
 }
 // Reserve index pages based on the number of entry-start references, then insert front matter.
 const indexRows=[...indexPages].sort(([a],[b])=>a.localeCompare(b));chapterTitle='Index';newPage();sectionStarts.push({title:'Index',page});paragraph('Index',{font:heading,size:29,leading:37});paragraph('Page references point to the start of matching entries.',{font:regular,size:9,color:muted});y-=18;
 const indexLayout=[];
 const frontCount=1+Math.max(1,Math.ceil(sectionStarts.length/18));
 for(const [term,targets]of indexRows){
  const numberRows=[];let current=[],width=0;
  for(const target of targets){const number=String(pdf.getPages().indexOf(target)+1+frontCount);const size=regular.widthOfTextAtSize(number,9)+7;if(current.length&&width+size>W-M-320){numberRows.push(current);current=[];width=0;}current.push(target);width+=size;}if(current.length)numberRows.push(current);
  for(const [i,targetList]of numberRows.entries()){
   const termLines=wrap(term+(i?' (continued)':''),bold,10,235);const height=Math.max(1,termLines.length)*15+10;ensure(height);const targetPage=page,startY=y;
   for(const [j,text]of termLines.entries())targetPage.drawText(text,{x:M,y:startY-j*15,size:10,font:bold,color:ink});
   indexLayout.push({page:targetPage,y:startY,targets:targetList});y-=height;
  }
 }
 const cover=pdf.insertPage(0,[W,H]);background(cover);const tocCount=Math.max(1,Math.ceil(sectionStarts.length/18));const toc=[];for(let i=0;i<tocCount;i++){const page=pdf.insertPage(i+1,[W,H]);background(page);toc.push(page);}
 for(const [i,entry]of sectionStarts.entries()){
  const target=toc[Math.floor(i/18)],row=i%18,x=M,top=H-126-row*32;const lines=wrap(entry.title,regular,12,410);for(const [j,text]of lines.entries())target.drawText(text,{x,y:top-j*14,size:12,font:regular,color:ink});const number=String(pageNumber(entry.page));target.drawText(number,{x:W-M-regular.widthOfTextAtSize(number,12),y:top,size:12,font:regular,color:ink});goto(target,[M,top-14,W-M,top+14],entry.page);
 }
 for(const [i,target]of toc.entries()){target.drawText(i?'Contents, continued':'Contents',{x:M,y:H-72,size:32,font:heading,color:ink});if(i===0)target.drawText('Tap a chapter to go directly to it.',{x:M,y:H-94,size:10,font:regular,color:muted});}
 for(const item of indexLayout){let x=320,top=item.y;for(const [i,target]of item.targets.entries()){if(i&&i%12===0){x=320;top-=15;}const value=String(pageNumber(target)),width=regular.widthOfTextAtSize(value,9);if(x+width>W-M){x=320;top-=15;}item.page.drawText(value,{x,y:top,size:9,font:regular,color:ink});goto(item.page,[x,top-3,x+width+4,top+11],target);x+=width+7;}}
 cover.drawText('The Dojo',{x:M,y:590,size:52,font:heading,color:ink});cover.drawText('Training notebook',{x:M,y:550,size:20,font:regular,color:ink});
 const coverLines=[model.title,`${model.tabCount} Sheet tabs · ${model.rowCount} original data rows`,`${model.cellCount} populated source cells`, 'Snapshot: '+String(model.fetchedAt||'unknown'),'', 'Your original notes, organized into chapters.', 'Includes a linked table of contents, PDF bookmarks, and index.', 'Use your PDF reader’s search to find words throughout the book.', 'Generated Sheet views may repeat source journal material.'];
 if(unsupported)coverLines.push('Symbols outside the embedded font are shown as [U+codes].');
 let cy=490;for(const text of coverLines){for(const lineText of wrap(text,regular,10.5)){if(lineText)cover.drawText(lineText,{x:M,y:cy,size:10.5,font:regular,color:muted});cy-=17;}}
 try{const response=await fetch(new URL('../assets/warrior.png',import.meta.url),{signal:AbortSignal.timeout(5000)});if(response.ok){const image=await pdf.embedPng(await response.arrayBuffer());cover.drawImage(image,{x:W-M-130,y:570,width:110,height:130});}}catch{/* Cover art is optional; training content is never omitted. */}
 const pages=pdf.getPages();for(const [i,target]of pages.entries()){const text=`${i+1} / ${pages.length}`;target.drawText(text,{x:W-M-regular.widthOfTextAtSize(text,9),y:32,size:9,font:regular,color:muted});const label='Back to contents';target.drawText(label,{x:M,y:32,size:9,font:regular,color:muted});const width=regular.widthOfTextAtSize(label,9);target.drawLine({start:{x:M,y:30},end:{x:M+width,y:30},thickness:.35,color:muted});goto(target,[M-4,24,M+width+8,48],toc[0]);}
 // PDF outline bookmarks give readers a second chapter-navigation mechanism.
 const outline=pdf.context.obj({Type:'Outlines',Count:sectionStarts.length});const outlineRef=pdf.context.register(outline);const refs=sectionStarts.map(()=>pdf.context.register(pdf.context.obj({})));
 sectionStarts.forEach((entry,i)=>{const item=pdf.context.lookup(refs[i]);item.set(PDFName.of('Title'),PDFHexString.fromText(entry.title));item.set(PDFName.of('Parent'),outlineRef);item.set(PDFName.of('Dest'),pdf.context.obj([entry.page.ref,PDFName.of('XYZ'),null,null,null]));if(i)item.set(PDFName.of('Prev'),refs[i-1]);if(i<refs.length-1)item.set(PDFName.of('Next'),refs[i+1]);});
 outline.set(PDFName.of('First'),refs[0]);outline.set(PDFName.of('Last'),refs.at(-1));pdf.catalog.set(PDFName.of('Outlines'),outlineRef);pdf.catalog.set(PDFName.of('PageMode'),PDFName.of('UseOutlines'));
 pdf.setTitle('The Dojo — Training Notebook');pdf.setSubject('Complete Google Sheets snapshot with linked chapters and index');pdf.setCreator('The Dojo private browser exporter');
 onProgress('Finishing searchable PDF…');const bytes=await pdf.save();return {bytes,model,pages:pages.length};
}

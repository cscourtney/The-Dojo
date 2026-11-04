"""Offline, paginated HTML reader checks with synthetic workbook data only."""
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright,expect
from pypdf import PdfReader
# The fixture builder is kept with the test to avoid depending on /tmp state.
ROOT=Path(__file__).resolve().parents[1]
BUILD=r'''
import fs from 'node:fs';
import {makeBookModel,notebookHTML} from './next/js/book-model.js';
import {parseTab} from './next/js/sheets.js';
const tables={data:[['id','date','lesson','technique','pearls','notes'],['j1','2026-11-04','Guard passing','Secure the underhook. Keep your hips connected.','Control before progress.','Start '+('Long notebook passage with Paraná and 🥋. '.repeat(220))+' LAST SENTENCE MUST SURVIVE'],['j2','2026-10-30','Back control','Keep chest contact.','Slow down.','A short note.'],['j3','2026-10-20','Unicode and long words','X'.repeat(3500),'','Line one\n\nLine three <script>never execute</script> & 🥋']],techniques:[['id','label','position','description','danaher_category','map_node'],['t1','Knee slice','guard-passing','Secure the underhook before you advance.','Passing','guard-passing']],privates:[['id','date','focus','notes','video_url'],['p1','2026-11-01','Private lesson','Frames and angles.','https://example.com/lesson?t=37']],dojo_categories:[['id','label','sort_order','aliases','description'],['c1','Passing','1','',''],['c2','Needs review','2','','']],dojo_map_nodes:[['id','title','type','x','y','sort_order','notes'],['guard-passing','Guard Passing','o','30','80','1','Connect before advancing'],['back-control','Back Control','o','350','80','2','Keep chest contact']],dojo_map_edges:[['id','from_node','to_node','label','sort_order','enabled'],['e','guard-passing','back-control','Advance','1','true']],custom:[['name','','notes'],['Untouched','UNNAMED CONTENT','<script>not executable</script>']]};
const workbook={complete:true,title:'READER TEST FIXTURE',fetchedAt:'2026-11-04',tabNames:Object.keys(tables),sheets:Object.fromEntries(Object.entries(tables).map(([tab,rawValues])=>[tab,{...parseTab(tab,rawValues),rawValues}]))};
const fonts=[['Dojo Hand','PatrickHand-Regular.ttf'],['Dojo Heading','Caveat.ttf']].map(([name,file])=>`@font-face{font-family:'${name}';src:url(data:font/ttf;base64,${fs.readFileSync('./next/assets/fonts/'+file).toString('base64')})}`).join('\n');
fs.writeFileSync('/tmp/dojo-reader-fixture.html',notebookHTML(makeBookModel(workbook),{fontCSS:fonts}));
'''
def main():
 subprocess.run(['node','--input-type=module'],input=BUILD,text=True,cwd=ROOT,check=True)
 html=Path('/tmp/dojo-reader-fixture.html').read_text()
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);context=browser.new_context(viewport={'width':1366,'height':1000});page=context.new_page();errors=[];requests=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda req:requests.append(req.url));page.set_content(html);page.wait_for_selector('#reader-shell[data-ready="true"]',timeout=60000)
  assert page.locator('.book-spread>.book-page:visible').count()==2
  assert page.locator('.spiral-ring').count()>=10
  total=page.locator('.book-spread>.book-page').count();assert total>10
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  # Every original field value must survive pagination, including whitespace, Unicode, and long unbroken tokens.
  assert page.evaluate('''()=>{const text=[...document.querySelectorAll('#book-spread>.book-page .page-content')].map(n=>n.textContent).join('');return [...document.querySelectorAll('#notebook-source dd')].every(n=>text.includes(n.textContent));}''')
  assert page.evaluate('''()=>[...document.querySelectorAll('#book-spread>.book-page .page-content')].every(n=>{const old=n.parentElement.hidden;n.parentElement.hidden=false;const okay=n.scrollHeight<=n.clientHeight+1;n.parentElement.hidden=old;return okay;})''')
  # Real 3D sheet turn, including a rear face, settles on the next spread.
  page.locator('#book-next').click();expect(page.locator('.turn-leaf')).to_be_attached();assert page.locator('.turn-leaf .leaf-back').count()==1;page.wait_for_timeout(160);assert page.locator('.turn-leaf').evaluate('n=>getComputedStyle(n).transform')!='none';page.screenshot(path='/tmp/dojo-reader-turn.png');page.wait_for_timeout(800);expect(page.locator('#page-state')).to_contain_text('Pages 3–4');page.locator('#book-prev').click();page.wait_for_timeout(900);expect(page.locator('#page-state')).to_contain_text('Pages 1–2')
  # Contents and index resolve to actual visible reader pages, not hidden source elements.
  page.locator('#book-contents').click();page.locator('.book-page:visible a[href="#chapter-0"]').click();expect(page.locator('.book-page:visible').first).to_contain_text('Training Journal')
  page.locator('#find').fill('LAST SENTENCE MUST SURVIVE');expect(page.locator('#count')).to_have_text('1 matching entries')
  assert page.locator('.book-page:visible').all_text_contents() and any('LAST SENTENCE MUST SURVIVE' in value for value in page.locator('.book-page:visible').all_text_contents());assert page.locator('.book-page:visible mark').count()>0
  page.locator('#search-results button').first.click();expect(page.locator('#search-results')).to_be_hidden()
  page.locator('#book-contents').click();page.locator('.book-page:visible a').filter(has_text='Strategy Map').click();expect(page.locator('.book-page:visible .map-enlarge')).to_be_visible();page.locator('.book-page:visible .map-enlarge').click();expect(page.locator('#map-dialog')).to_be_visible();page.locator('#map-dialog svg a').first.click();expect(page.locator('#map-dialog')).not_to_be_visible();assert any('Guard Passing' in value for value in page.locator('.book-page:visible').all_text_contents())
  # Private video links remain usable external links.
  page.locator('#book-contents').click();page.locator('.book-page:visible a').filter(has_text='Private Lessons').click();expect(page.locator('.book-page:visible a[href="https://example.com/lesson?t=37"]')).to_be_visible()
  page.locator('#book-view').click();expect(page.locator('#notebook-source')).to_be_visible();assert page.locator('#notebook-source').inner_text().count('UNNAMED CONTENT')==1;page.locator('#book-view').click();expect(page.locator('#notebook-source')).not_to_be_visible()
  # Keyboard, jump input, resized spreads, and a one-page phone view.
  page.locator('#book-page-number').fill('1');page.locator('#book-page-number').press('Enter');page.locator('#book-next').focus();page.keyboard.press('ArrowRight');page.wait_for_timeout(900);expect(page.locator('#page-state')).to_contain_text('Pages 3–4')
  for label,width,height in [('ipad-landscape',1024,768),('ipad-portrait',768,1024),('phone',390,844)]:
   page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(250);page.wait_for_selector('#reader-shell[data-ready="true"]',timeout=60000);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');assert page.locator('.book-spread>.book-page:visible').count()==(1 if width<720 else 2);page.locator('#book-page-number').fill('1');page.locator('#book-page-number').press('Enter');page.screenshot(path='/tmp/dojo-reader-'+label+'.png',full_page=True)
   assert page.evaluate('''()=>{const text=[...document.querySelectorAll('#book-spread>.book-page .page-content')].map(n=>n.textContent).join('');return [...document.querySelectorAll('#notebook-source dd')].every(n=>text.includes(n.textContent));}''')
  # A horizontal touch gesture turns a phone page without requiring a tiny control.
  page.locator('#book-window').evaluate("n=>{const a=new Touch({identifier:1,target:n,clientX:300,clientY:300});n.dispatchEvent(new TouchEvent('touchstart',{touches:[a],changedTouches:[a],bubbles:true}));const b=new Touch({identifier:1,target:n,clientX:100,clientY:310});n.dispatchEvent(new TouchEvent('touchend',{touches:[],changedTouches:[b],bubbles:true}));}");page.wait_for_timeout(900);expect(page.locator('#page-state')).to_contain_text('Page 2 of')
  # Reduced motion respects the system preference; printing shows the full source, including the landscape map.
  page.emulate_media(reduced_motion='reduce');page.locator('#book-next').click();assert page.locator('.turn-leaf').count()==0
  page.emulate_media(media='print');expect(page.locator('.reader-interface')).not_to_be_visible();expect(page.locator('#notebook-source')).to_be_visible();page.pdf(path='/tmp/dojo-reader-print-fixture.pdf',prefer_css_page_size=True,print_background=False)
  pdf=PdfReader('/tmp/dojo-reader-print-fixture.pdf');text='\n'.join(p.extract_text() for p in pdf.pages);assert 'LAST SENTENCE MUST SURVIVE' in text and 'UNNAMED CONTENT' in text and 'Private Lessons' in text;assert any(p.mediabox.width>p.mediabox.height for p in pdf.pages)
  assert not any(url.startswith(('http:','https:')) for url in requests),requests
  assert not errors,errors;browser.close()
 print('PASS: self-contained two-page spiral reader; full long/Unicode field retention; no clipped pages; 3D page turns; search to matching continuation page; contents/map/video links; map zoom; list view; keyboard/jump/swipe; phone/iPad reflow; reduced motion; complete print with landscape map. Synthetic data only.')
if __name__=='__main__':main()

"""New-workspace checks with public test fixtures only; never contacts real services."""
from urllib.parse import urlparse,parse_qs
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from pypdf import PdfReader
import fitz

def main():
 tables={
 'data':[['id','date','entry_type','gi','lesson','technique','rolls','fundamentals','pearls','notes','map_node','technique_label','position'],['old','2020-01-01','class','gi','Back control','Old back hooks practice','Lost hooks taking the back','Keep a frame','','Historical back-control mistake','back','RNC','back'],['new','2026-01-01','class','nogi','Passing','Named test knee slice detail','Lost underhook','Control first','Underhook before passing','Paraná · '+('PRINTABLE UNIQUE WORD '*150),'gpass','Knee slice','guard-passing']],
 'techniques':[['id','label','position','description','map_node','date'],['new_tech','Knee slice','guard-passing','Named test knee slice detail','guard-passing','2026-01-01']],
 'pearls':[['date','pearl','entry_id'],['2026-01-01','Secure the underhook first','new']],
 'goals':[['goal','priority','status'],['Do not speak completed goal','30-day','done'],['Keep guard retention deliberate','30-day','active']],
 'mistakes':[['mistake','fix','date','status'],['Back control: losing hooks','Keep chest connected','2020-01-01','active']],
 'library':[['title','type','url','start_seconds','notes'],['Exact passing lesson','vid','https://www.youtube.com/watch?v=test123',134,'Watch the underhook'],['Invalid homepage','vid','https://www.youtube.com/','','Needs a specific lesson']],
 'gameplan':[['node','notes'],['guard-passing','Pressure and control']],
 'chains':[['chain_label','description'],['Guard to back','Arm drag then take the back']],
 "Coach's notes":[['note','','note'],['CUSTOM TAB FIRST VALUE','UNNAMED PRIVATE CELL','CUSTOM TAB SECOND VALUE']],
 'readable':[['session','text'],['new','Generated formatted session view']]
 }
 tabnames=list(tables)
 calls=[]
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  context=browser.new_context(viewport={'width':1024,'height':1000},accept_downloads=True)
  context.add_init_script("""
   window.google={accounts:{oauth2:{initTokenClient:c=>({requestAccessToken:()=>c.callback({access_token:'test-only',expires_in:3600})})}}};
   window.voiceCalls=[];
   window.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};
   Object.defineProperty(window,'speechSynthesis',{value:{paused:false,getVoices:()=>[{name:'Test voice',voiceURI:'test-voice',lang:'en-US'}],addEventListener:()=>{},speak(u){voiceCalls.push(['speak',u.text]);window.lastUtterance=u;},pause(){this.paused=true;voiceCalls.push(['pause']);},resume(){this.paused=false;voiceCalls.push(['resume']);},cancel(){this.paused=false;voiceCalls.push(['cancel']);}}});
  """)
  def google(route):
   url=route.request.url;calls.append(url);path=urlparse(url).path
   if path.endswith('/values:batchGet'):
    ranges=parse_qs(urlparse(url).query)['ranges'];assert ranges==["'"+name.replace("'","''")+"'" for name in tabnames]
    return route.fulfill(json={'valueRanges':[{'range':name,'values':tables[name]} for name in tabnames]})
   if '/values/' in path:
    name=path.split('/values/')[1]
    return route.fulfill(json={'values':tables[name]})
   return route.fulfill(json={'properties':{'title':'TEST FIXTURE — NOT USER DATA'},'sheets':[{'properties':{'title':name,'sheetId':i}} for i,name in enumerate(tabnames)]})
  context.route('https://sheets.googleapis.com/**',google)
  context.route('https://accounts.google.com/**',lambda r:r.abort());context.route('https://fonts.googleapis.com/**',lambda r:r.abort())
  page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
  page.goto('http://127.0.0.1:8000/next/');assert not calls
  page.locator('#connect').click();expect(page.locator('#status')).to_contain_text('Connected.')
  page.get_by_role('button',name='Class Prep',exact=True).click();expect(page.locator('#prep-content')).to_contain_text('Not loaded: goals, mistakes')
  assert page.evaluate('voiceCalls.filter(x=>x[0]==="speak").length')==0
  page.locator('#prep-refresh').click();expect(page.locator('#workspace-status')).to_contain_text('Read 10 Sheet tabs')
  expect(page.locator('#prep-content')).to_contain_text('Keep guard retention deliberate');expect(page.locator('#prep-content')).to_contain_text('Keep chest connected');expect(page.locator('#prep-content')).not_to_contain_text('Do not speak completed')
  page.locator('#prep-play').click();expect(page.locator('#prep-playback')).to_contain_text('Playing');page.locator('#prep-pause').click();expect(page.locator('#prep-pause')).to_have_text('Resume');page.locator('#prep-pause').click();page.locator('#prep-stop').click();expect(page.locator('#prep-playback')).to_contain_text('stopped')
  page.get_by_role('button',name='Search history',exact=True).click();page.locator('#history-query').fill('back control mistakes');expect(page.locator('#history-results')).to_contain_text('2020-01-01');expect(page.locator('#history-results')).to_contain_text('Keyword retrieval, not an AI interpretation')
  page.get_by_role('button',name='Resources',exact=True).click();link=page.get_by_role('link',name='Open lesson at 2:14');expect(link).to_have_attribute('href','https://www.youtube.com/watch?v=test123&t=134s');expect(page.locator('#resource-list')).to_contain_text('Specific video or lesson URL needed')
  page.get_by_role('button',name='Strategy links',exact=True).click();expect(page.locator('.map-node')).to_have_count(20)
  page.locator('.map-node').filter(has_text='Guard Passing').click();expect(page.locator('#knowledge-list')).to_contain_text('Named test knee slice detail');assert page.url.endswith('#strategy/guard-passing')
  # PDF is generated from the entire fresh workbook, including conflicted/unheaded custom cells.
  page.get_by_role('button',name='Notebook',exact=True).click();page.locator('#book-build').click();expect(page.locator('#book-state')).to_contain_text('Ready:',timeout=120000)
  with page.expect_download() as info:page.get_by_role('link',name='Download PDF notebook',exact=True).click()
  download=info.value;download.save_as('/tmp/dojo-notebook-fixture.pdf')
  pdf=PdfReader('/tmp/dojo-notebook-fixture.pdf');content='\n'.join(page.extract_text() for page in pdf.pages)
  for value in ['TEST FIXTURE','Training Journal','Technique Library','Pearls','Index','CUSTOM TAB FIRST VALUE','CUSTOM TAB SECOND VALUE','UNNAMED PRIVATE CELL','Paraná','PRINTABLE UNIQUE WORD','Generated formatted session view']:assert value in content,value
  assert len(pdf.pages)>10 and len(pdf.outline)>=10
  assert all(content.count(word)==150 for word in ['PRINTABLE','UNIQUE','WORD'])  # Line/page breaks split phrases, but no words may be lost.
  rendered=fitz.open('/tmp/dojo-notebook-fixture.pdf')
  for pdfpage in rendered:
   for block in pdfpage.get_text('dict')['blocks']:
    for line in block.get('lines',[]):
     for span in line['spans']:assert span['bbox'][1]>=0 and span['bbox'][3]<=pdfpage.rect.height,(pdfpage.number,span['bbox'])
  refs={page.indirect_reference.idnum for page in pdf.pages};links=0;toc_ref=pdf.pages[1].indirect_reference.idnum
  for pdfpage in pdf.pages:
   assert 'Back to contents' in pdfpage.extract_text()
   footer_to_toc=False
   for reference in pdfpage.get('/Annots',[]):
    annotation=reference.get_object();dest=annotation.get('/Dest')
    if dest:
     assert dest[0].idnum in refs;links+=1
     if dest[0].idnum==toc_ref and annotation.get('/Rect')[1]<60:footer_to_toc=True
   assert footer_to_toc, 'Every PDF page must link back to the contents'
  assert links>10
  page.locator('#book-html').click();expect(page.get_by_role('link',name='Download searchable HTML notebook')).to_be_visible()
  with page.expect_download() as info:page.get_by_role('link',name='Download searchable HTML notebook').click()
  info.value.save_as('/tmp/dojo-notebook-fixture.html')
  notebook=context.new_page();notebook.set_content(Path('/tmp/dojo-notebook-fixture.html').read_text());notebook.locator('#find').fill('UNNAMED PRIVATE CELL');expect(notebook.locator('#count')).to_contain_text('1 matching entries')
  # All new views fit inside phone and iPad layouts, including the separately scrollable map.
  for label,width,height in [('phone',390,844),('ipad-portrait',768,1024),('ipad-landscape',1024,768)]:
   page.set_viewport_size({'width':width,'height':height})
   for section in ['Class Prep','Search history','Resources','Strategy links','Notebook']:
    if page.locator('#section-menu').is_visible():
     option=page.locator('#section-menu option').filter(has_text=section).first;page.locator('#section-menu').select_option(option.get_attribute('value'))
    else:page.get_by_role('button',name=section,exact=True).click()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(label,section)
    if section in ['Class Prep','Strategy links']:page.screenshot(path=f'/tmp/dojo-{label}-{section.replace(" ","-").lower()}-v5.png',full_page=True)
  assert not errors,errors
  browser.close();print(f'PASS: complete-workbook reads; sourced Class Prep and playback controls; historical retrieval; exact timestamp links; map alias connections; {len(pdf.pages)}-page PDF with {links} internal links, bookmarks, index, searchable Unicode text; searchable HTML; mobile/iPad layouts. All Sheet data were test fixtures, not the user workbook.')
if __name__=='__main__':main()

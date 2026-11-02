"""Pending journal recovery and private lessons, synthetic Sheet fixtures only."""
from urllib.parse import urlparse,unquote,parse_qs
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from pypdf import PdfReader
import re,json
HEADERS=['id','date','entry_type','gi','lesson','standup','technique','rolls','drillwork','pearls','fundamentals','notes','created_at','position','technique_label','takedown_label','map_node']
TECH=['id','label','position','map_node','description','date','gi','created_at']
AUTH="window.google={accounts:{oauth2:{initTokenClient:c=>({requestAccessToken:()=>c.callback({access_token:'test-only',expires_in:3600})})}}};"
def main():
 tables={'data':[HEADERS.copy()],'techniques':[TECH.copy()],'pearls':[['date','gi','pearl','entry_id','created_at']], 'privates':[['Date','Coach','Topic','Details','Video','Extra',''],['2026-01-01','Old coach','Legacy private','Legacy private notes','https://example.com/old-video','KEEP EXTRA','UNNAMED CONTENT']]}
 ids={tab:i+1 for i,tab in enumerate(tables)};fail={'read':False,'data':False,'private':False};writes=[]
 def colnum(name):
  n=0
  for c in name:n=n*26+ord(c)-64
  return n-1
 def putrange(range,values):
  tab,cell=range.split('!');m=re.match(r'([A-Z]+)(\d+)',cell);x,y=colnum(m[1]),int(m[2])-1
  for j,rowvalues in enumerate(values):
   while len(tables[tab])<=y+j:tables[tab].append([])
   row=tables[tab][y+j]
   for k,value in enumerate(rowvalues):
    while len(row)<=x+k:row.append('')
    row[x+k]=value
 def sheet(route):
  req=route.request;path=unquote(urlparse(req.url).path)
  if path.endswith(':batchUpdate') and '/values' not in path:
   for item in req.post_data_json['requests']:
    if 'addSheet' in item:
     p=item['addSheet']['properties'];tables[p['title']]=[];ids[p['title']]=p['sheetId']
    else:
     p=item['updateCells'];tab=next(t for t,id in ids.items() if id==p['start']['sheetId']);tables[tab]=[[c['userEnteredValue']['stringValue'] for c in row['values']] for row in p['rows']]
   if fail.get('private-setup') and any(item.get('addSheet',{}).get('properties',{}).get('title')=='privates' for item in req.post_data_json['requests']):fail['private-setup']=False;return route.fulfill(status=500,json={})
   return route.fulfill(json={})
  if path.endswith('/values:batchGet'):
   ranges=parse_qs(urlparse(req.url).query)['ranges'];tabs=[r[1:-1].replace("''", "'") for r in ranges];return route.fulfill(json={'valueRanges':[{'values':tables[t]} for t in tabs]})
  if '/values/' in path:
   segment=path.split('/values/')[1];tab=segment.split('!')[0]
   if req.method=='PUT':putrange(segment,req.post_data_json['values']);return route.fulfill(json={})
   if req.method=='POST':
    writes.append(tab)
    if tab=='data' and fail['data']:return route.fulfill(status=500,json={})
    tables[tab].append(req.post_data_json['values'][0])
    if tab=='privates' and fail['private']:fail['private']=False;return route.fulfill(status=500,json={})
    return route.fulfill(json={})
   if tab=='data' and fail['read']:return route.fulfill(status=500,json={})
   return route.fulfill(json={'values':tables[tab]})
  return route.fulfill(json={'properties':{'title':'RECOVERY & PRIVATES FIXTURE'},'sheets':[{'properties':{'title':t,'sheetId':ids[t]}} for t in tables]})
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);context=browser.new_context(viewport={'width':1024,'height':1100},accept_downloads=True);context.add_init_script(AUTH);context.route('https://sheets.googleapis.com/**',sheet);context.route('https://accounts.google.com/**',lambda r:r.abort());page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:8000/next/');page.locator('#connect').click();page.locator('#transcript').fill('Preserve the original dictated recap');page.locator('#manual').click();page.locator('#lesson').fill('Recovery fixture');page.locator('#technique').fill('Knee slice detail');page.locator('#new-technique').check();page.locator('#technique_label').fill('Knee slice');page.locator('#position').select_option('guard-passing');page.locator('#link-map').check();page.locator('#map_node').select_option('guard-passing')
  # A writable header goes missing before the save. No row is written, but the draft is pending and locked.
  tables['techniques'][0][2]='';page.locator('#save').click();expect(page.locator('#status')).to_contain_text('Save incomplete');expect(page.locator('#technique')).to_be_disabled();assert len(tables['data'])==1
  page.reload();expect(page.locator('#pending-saves')).to_be_visible();expect(page.locator('#technique')).to_be_disabled();expect(page.locator('#transcript')).to_have_value('Preserve the original dictated recap')
  # A missing identity column must never be mistaken for proof that no row was saved.
  tables['data'][0][0]='';page.get_by_role('button',name='Check & unlock draft',exact=True).click();expect(page.locator('#status')).to_contain_text('missing headers id');expect(page.locator('#technique')).to_be_disabled();tables['data'][0][0]='id'
  # A failed verification must never discard a pending entry.
  fail['read']=True;page.get_by_role('button',name='Check & unlock draft',exact=True).click();expect(page.locator('#status')).to_contain_text('Could not safely unlock');expect(page.locator('#pending-feedback')).to_contain_text('Could not safely unlock');expect(page.locator('#technique')).to_be_disabled();fail['read']=False
  page.get_by_role('button',name='Check & unlock draft',exact=True).click();expect(page.locator('#status')).to_contain_text('draft is unlocked');expect(page.locator('#technique')).to_be_enabled();expect(page.locator('#map_node')).to_have_value('guard-passing');expect(page.locator('#transcript')).to_have_value('Preserve the original dictated recap')
  assert page.evaluate("async()=>{const s=await import('./js/store.js');return (await s.read('journal-recovery-backups')).length}")==1
  tables['techniques'][0][2]='position';page.locator('#save').click();expect(page.locator('#status')).to_contain_text('Saved and confirmed');saved=dict(zip(HEADERS,tables['data'][-1]));assert saved['notes'].count('Original recap:')==1 and saved['map_node']=='guard-passing';assert len(tables['techniques'])==2
  # Reproduce a partial save: the data row landed, but a required pearl write fails.
  page.locator('#manual').click();page.locator('#lesson').fill('Partial fixture');page.locator('#pearls').fill('Partial pearl');
  original_sheet=sheet
  failing={'pearl':True}
  def partial(route):
   if route.request.method=='POST' and '/pearls' in unquote(route.request.url) and failing['pearl']:return route.fulfill(status=500,json={})
   return original_sheet(route)
  context.unroute('https://sheets.googleapis.com/**');context.route('https://sheets.googleapis.com/**',partial)
  page.locator('#save').click();expect(page.locator('#status')).to_contain_text('Save incomplete');before=len(tables['data']);page.get_by_role('button',name='Check & unlock draft',exact=True).click();expect(page.locator('#status')).to_contain_text('Some of this entry is already saved');expect(page.locator('#lesson')).to_be_disabled()
  with page.expect_download() as download:page.get_by_role('button',name='Download backup',exact=True).click()
  download.value.save_as('/tmp/dojo-recovery-backup-fixture.json');assert json.loads(Path('/tmp/dojo-recovery-backup-fixture.json').read_text())['lesson']=='Partial fixture'
  page.get_by_role('button',name='Keep pending & start another entry').click();expect(page.locator('#transcript')).to_be_enabled();page.locator('#manual').click();expect(page.locator('#lesson')).to_be_enabled();page.locator('#lesson').fill('Separate unsaved draft');page.locator('#refresh').click();expect(page.locator('#status')).to_contain_text('Pending save');expect(page.locator('#lesson')).to_have_value('Separate unsaved draft')
  # A pending journal cannot block an independent private lesson. Alias headers and unknown columns are preserved.
  page.get_by_role('button',name='Privates',exact=True).click();expect(page.locator('#private-list')).to_contain_text('Legacy private')
  page.locator('#private-instructor').fill('Coach fixture');page.locator('#private-focus').fill('Private focus fixture');page.locator('#private-notes').fill('Private detail fixture with frames');page.locator('#private-video_url').fill('javascript:alert(1)');page.locator('#private-save').click();expect(page.locator('#private-state')).to_contain_text('HTTP or HTTPS');assert len(tables['privates'])==2
  page.locator('#private-video_url').fill('https://example.com/training-video?t=37');fail['private']=True;page.locator('#private-save').click();expect(page.locator('#private-state')).to_contain_text('Save incomplete');expect(page.locator('#private-notes')).to_be_disabled();assert len(tables['privates'])==3
  page.reload();expect(page.locator('#private-notes')).to_have_value('Private detail fixture with frames');page.locator('#private-save').click();expect(page.locator('#private-state')).to_contain_text('saved and confirmed');assert len(tables['privates'])==3;assert tables['privates'][1][5:7]==['KEEP EXTRA','UNNAMED CONTENT'];assert 'id' in tables['privates'][0] and 'created_at' in tables['privates'][0]
  saved_private=dict(zip(tables['privates'][0],tables['privates'][-1]));assert saved_private['Coach']=='Coach fixture' and saved_private['Details']=='Private detail fixture with frames'
  page.locator('#private-list details').first.locator('summary').click();expect(page.get_by_role('link',name='Open lesson video ↗').first).to_have_attribute('href','https://example.com/training-video?t=37')
  # Finish the old journal from its own retry button without replacing the separate current draft.
  page.get_by_role('button',name='Journal',exact=True).click();failing['pearl']=False;page.get_by_role('button',name='Retry this save',exact=True).click();expect(page.locator('#status')).to_contain_text('Saved and confirmed');expect(page.locator('#lesson')).to_have_value('Separate unsaved draft');assert len(tables['data'])==before
  # Private lessons are included in the complete notebook, with clickable external video links.
  page.get_by_role('button',name='Notebook',exact=True).click();page.locator('#book-build').click();expect(page.locator('#book-state')).to_contain_text('Ready:',timeout=120000)
  with page.expect_download() as download:page.get_by_role('link',name='Download PDF notebook',exact=True).click()
  download.value.save_as('/tmp/dojo-privates-fixture.pdf');pdf=PdfReader('/tmp/dojo-privates-fixture.pdf');text='\n'.join(p.extract_text() for p in pdf.pages);assert 'Private Lessons' in text and 'Private detail fixture with frames' in text and 'UNNAMED CONTENT' in text
  assert any(str(ref.get_object().get('/A',{}).get('/URI',''))=='https://example.com/training-video?t=37' for p in pdf.pages for ref in p.get('/Annots',[]))
  page.locator('#book-html').click();expect(page.get_by_role('link',name='Download searchable HTML notebook')).to_be_visible()
  with page.expect_download() as download:page.get_by_role('link',name='Download searchable HTML notebook').click()
  download.value.save_as('/tmp/dojo-privates-fixture.html');assert 'href="https://example.com/training-video?t=37"' in Path('/tmp/dojo-privates-fixture.html').read_text()
  other=browser.new_context();other.add_init_script(AUTH);other.route('https://sheets.googleapis.com/**',partial);other.route('https://accounts.google.com/**',lambda r:r.abort());second=other.new_page();second.goto('http://127.0.0.1:8000/next/#privates');second.locator('#connect').click();expect(second.locator('#private-list')).to_contain_text('Private focus fixture')
  for w,h in [(390,844),(768,1024),(1024,768)]:
   second.set_viewport_size({'width':w,'height':h});assert second.evaluate('document.documentElement.scrollWidth<=innerWidth+1');expect(second.locator('#private-notes')).to_be_visible();second.screenshot(path='/tmp/dojo-privates-'+str(w)+'.png',full_page=True)
  # First save on a Sheet without a privates tab creates it once, even after a lost response.
  del tables['privates'];del ids['privates'];fail['private-setup']=True
  fresh=browser.new_context();fresh.add_init_script(AUTH);fresh.route('https://sheets.googleapis.com/**',partial);fresh.route('https://accounts.google.com/**',lambda r:r.abort());third=fresh.new_page();third.goto('http://127.0.0.1:8000/next/#privates');third.locator('#connect').click();third.locator('#private-notes').fill('First private in a new tab');third.locator('#private-save').click();expect(third.locator('#private-state')).to_contain_text('saved and confirmed');assert len(tables['privates'])==2 and tables['privates'][0]==['id','date','instructor','focus','notes','video_url','created_at']
  assert not errors,errors;browser.close()
 print('PASS: preserved/atomic pending recovery; no unlock after partial writes or failed reads; independent per-entry retry; usable separate draft; private lesson alias headers/extra-column preservation; uncertain-save reconciliation; safe video links; PDF/HTML inclusion; second-device read-back; phone/tablet forms. Synthetic data only.')
if __name__=='__main__':main()

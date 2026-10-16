"""Organization migration/editing and landscape PDF, with synthetic data only."""
from urllib.parse import unquote,urlparse,parse_qs
from copy import deepcopy
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from pypdf import PdfReader
import re,fitz
HEADERS=['id','date','entry_type','gi','lesson','standup','technique','rolls','drillwork','pearls','fundamentals','notes','created_at','position','technique_label','takedown_label','map_node','danaher_category']
AUTH="window.google={accounts:{oauth2:{initTokenClient:c=>({requestAccessToken:()=>c.callback({access_token:'test-only',expires_in:3600})})}}};"
def main():
 tables={'data':[HEADERS,['j','2026-01-01','class','gi','Practice','','Description','','','Breathe','Frames','','now','guard-passing','Knee slice','','gpass','Passing']], 'techniques':[['id','label','position','description','map_node','date','created_at',''],['t','Knee slice','guard-passing','Technique fixture description','gpass','2026-01-01','now','EXTRA UNNAMED CELL']], 'pearls':[['date','gi','pearl','entry_id','created_at']], 'gameplan':[['node','notes'],['guard-passing','LEGACY GAMEPLAN MUST STAY']]}
 ids={name:i+1 for i,name in enumerate(tables)};original=deepcopy(tables);fail={'setup':True,'save':False};mutations=[]
 def colnum(name):
  n=0
  for c in name:n=n*26+ord(c)-64
  return n-1
 def putrange(range,values):
  tab,cell=range.split('!');tab=tab.strip("'");m=re.match(r'([A-Z]+)(\d+)',cell);x,y=colnum(m[1]),int(m[2])-1
  for j,valuesrow in enumerate(values):
   while len(tables[tab])<=y+j:tables[tab].append([])
   row=tables[tab][y+j]
   for k,value in enumerate(valuesrow):
    while len(row)<=x+k:row.append('')
    row[x+k]=value
 def sheet(route):
  req=route.request;path=unquote(urlparse(req.url).path)
  if path.endswith(':batchUpdate') and '/values' not in path:
   mutations.append('setup');requests=req.post_data_json['requests']
   for item in requests:
    if 'addSheet' in item:
     p=item['addSheet']['properties'];assert p['title'] not in tables;tables[p['title']]=[];ids[p['title']]=p['sheetId']
    else:
     p=item['updateCells'];name=next(n for n,id in ids.items() if id==p['start']['sheetId']);tables[name]=[[cell['userEnteredValue']['stringValue'] for cell in row['values']] for row in p['rows']]
   if fail['setup']:fail['setup']=False;return route.fulfill(status=500,json={'error':'committed, response lost'})
   return route.fulfill(json={})
  if path.endswith('/values:batchUpdate'):
   mutations.append('edit')
   for item in req.post_data_json['data']:putrange(item['range'],item['values'])
   if fail['save']:fail['save']=False;return route.fulfill(status=500,json={'error':'committed, response lost'})
   return route.fulfill(json={})
  if path.endswith('/values:batchGet'):
   ranges=parse_qs(urlparse(req.url).query)['ranges'];names=[r[1:-1].replace("''", "'") for r in ranges]
   return route.fulfill(json={'valueRanges':[{'values':tables[name]} for name in names]})
  if '/values/' in path:
   segment=path.split('/values/')[1];tab=segment.split('!')[0]
   if req.method=='PUT':mutations.append('header');putrange(segment,req.post_data_json['values']);return route.fulfill(json={})
   if req.method=='POST':mutations.append('append');tables[tab].append(req.post_data_json['values'][0]);return route.fulfill(json={})
   return route.fulfill(json={'values':tables[tab]})
  route.fulfill(json={'properties':{'title':'ORGANIZATION TEST FIXTURE'},'sheets':[{'properties':{'title':name,'sheetId':ids[name]}} for name in tables]})
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);context=browser.new_context(viewport={'width':1024,'height':1100},accept_downloads=True);context.add_init_script(AUTH);context.route('https://sheets.googleapis.com/**',sheet);context.route('https://accounts.google.com/**',lambda r:r.abort());page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:8000/next/#techniques');page.locator('#connect').click();expect(page.locator('#knowledge-state')).to_contain_text('From Google Sheets');page.locator('#organization summary').click();page.locator('#organization-setup').click();expect(page.locator('#organization-state')).to_contain_text('saved and confirmed');assert mutations==['setup','header'];assert tables['gameplan']==original['gameplan'] and tables['data']==original['data'];assert tables['techniques'][1][-1]=='EXTRA UNNAMED CELL';assert tables['techniques'][0][-1]=='danaher_category'
  # A second setup call is a no-op, with existing extra data retained.
  page.evaluate("async()=>{const s=await import('./js/sheets.js?v=12');const w=await s.readWorkbook();await s.setupOrganization(w,await(await fetch('./assets/strategy-layout.json')).json());}");assert mutations==['setup','header']
  cats=tables['dojo_categories'];cat_id=next(r[0] for r in cats[1:] if r[1]=='Passing');cats[0].append('extra');
  for row in cats[1:]:row.append('KEEP EXTRA COLUMN')
  page.locator('#organization-record').select_option(cat_id);page.locator('#organization-label').fill('Passing skills');page.locator('#organization-sort_order').fill('1')
  cats[1:]=list(reversed(cats[1:]));fail['save']=True;page.locator('#organization-save').click();expect(page.locator('#organization-state')).to_contain_text('Save incomplete');assert next(r for r in cats[1:] if r[0]==cat_id)[-1]=='KEEP EXTRA COLUMN'
  page.reload();page.locator('#organization summary').click();page.get_by_role('button',name='Resume organization draft').click();page.locator('#organization-save').click();expect(page.locator('#organization-state')).to_contain_text('Saved and confirmed');expect(page.locator('#technique-categories')).to_contain_text('Passing skills');assert next(r for r in cats[1:] if r[0]==cat_id)[1]=='Passing skills'
  # Edit a map node in Sheets through the app; map and notes reflect the change.
  page.locator('#organization-kind').select_option('nodes');page.locator('#organization-record').select_option('guard-passing');page.locator('#organization-title').fill('My passing position');page.locator('#organization-x').fill('1090');page.locator('#organization-notes').fill('My connected passing notes');page.locator('#organization-save').click();expect(page.locator('#organization-state')).to_contain_text('Saved and confirmed')
  page.get_by_role('button',name='Strategy links',exact=True).click();page.locator('#map-position').select_option('guard-passing');expect(page.locator('#knowledge-list')).to_contain_text('My connected passing notes');expect(page.locator('.map-node').filter(has_text='My passing position')).to_be_visible()
  # Add a map position and a named connection without editing existing IDs.
  page.locator('#organization-kind').select_option('nodes');page.locator('#organization-record').select_option('');page.get_by_role('button',name='Open selected / new record').click();page.locator('#organization-title').fill('Custom position');page.locator('#organization-x').fill('1400');page.locator('#organization-y').fill('850');page.locator('#organization-save').click();expect(page.locator('#organization-form')).to_be_hidden();newid=tables['dojo_map_nodes'][-1][0]
  page.locator('#organization-kind').select_option('edges');page.get_by_role('button',name='Open selected / new record').click();page.locator('#organization-from_node').select_option('guard-passing');page.locator('#organization-to_node').select_option(newid);page.locator('#organization-label').fill('Connect and advance');page.locator('#organization-save').click();expect(page.locator('#organization-form')).to_be_hidden();expect(page.locator('#map-holder svg')).to_contain_text('Connect and advance')
  # Conflicting edits in another device are not silently overwritten.
  page.locator('#organization-kind').select_option('categories');page.locator('#organization-record').select_option(cat_id);page.locator('#organization-label').fill('My stale edit');row=next(r for r in cats[1:] if r[0]==cat_id);row[1]='Edited elsewhere';before=mutations.count('edit');page.locator('#organization-save').click();expect(page.locator('#organization-state')).to_contain_text('changed in another device');assert mutations.count('edit')==before;page.get_by_role('button',name='Discard organization draft').click();row[1]='Passing skills'
  # Complete PDF and HTML exports use Sheet order, landscape nodes, and valid internal links.
  assert page.evaluate("async()=>{const {readWorkbook}=await import('./js/sheets.js?v=12');const {makeBookModel}=await import('./js/book-model.js?v=12');return makeBookModel(await readWorkbook()).chapters.find(c=>c.category==='Passing skills').records.some(r=>r.keys.label==='Knee slice');}")
  page.get_by_role('button',name='Notebook',exact=True).click();page.locator('#book-build').click();expect(page.locator('#book-state')).to_contain_text('Ready:',timeout=120000)
  with page.expect_download() as download:page.get_by_role('link',name='Download PDF notebook',exact=True).click()
  download.value.save_as('/tmp/dojo-organization-fixture.pdf');pdf=PdfReader('/tmp/dojo-organization-fixture.pdf');landscape=[page for page in pdf.pages if page.mediabox.width>page.mediabox.height];assert len(landscape)==1;assert 'Custom position' in landscape[0].extract_text();assert 'My passing position' in landscape[0].extract_text();assert len(landscape[0]['/Annots'])>=22;assert all(float(ref.get_object()['/Dest'][3])>0 for ref in landscape[0]['/Annots'][:-1])
  refs={page.indirect_reference.idnum for page in pdf.pages}
  for pdfpage in pdf.pages:
   assert 'Back to contents' in pdfpage.extract_text()
   for ref in pdfpage.get('/Annots',[]):
    dest=ref.get_object().get('/Dest')
    if dest:assert dest[0].idnum in refs
  rendered=fitz.open('/tmp/dojo-organization-fixture.pdf');land=next(p for p in rendered if p.rect.width>p.rect.height);land.get_pixmap(matrix=fitz.Matrix(1.5,1.5)).save('/tmp/dojo-organization-landscape.png')
  for pdfpage in rendered:
   for block in pdfpage.get_text('dict')['blocks']:
    for line in block.get('lines',[]):
     for span in line['spans']:assert 0<=span['bbox'][0] and span['bbox'][2]<=pdfpage.rect.width and span['bbox'][1]>=0 and span['bbox'][3]<=pdfpage.rect.height,(pdfpage.number,span)
  page.locator('#book-html').click();expect(page.get_by_role('link',name='Download searchable HTML notebook')).to_be_visible()
  with page.expect_download() as download:page.get_by_role('link',name='Download searchable HTML notebook').click()
  download.value.save_as('/tmp/dojo-organization-fixture.html');html=Path('/tmp/dojo-organization-fixture.html').read_text();assert '<svg' in html and 'Custom position' in html and 'My connected passing notes' in html
  notebook=context.new_page();notebook.set_content(html);notebook.locator('#find').fill('Technique fixture description');notebook.locator('svg a').first.click();expect(notebook.locator('#find')).to_have_value('')
  other=browser.new_context();other.add_init_script(AUTH);other.route('https://sheets.googleapis.com/**',sheet);other.route('https://accounts.google.com/**',lambda r:r.abort());second=other.new_page();second.goto('http://127.0.0.1:8000/next/#strategy');second.locator('#connect').click();expect(second.locator('.map-node').filter(has_text='Custom position')).to_be_visible()
  for w,h in [(390,844),(768,1024),(1024,768)]:
   second.set_viewport_size({'width':w,'height':h});second.locator('#organization summary').click() if not second.locator('#organization').get_attribute('open')=='' else None;assert second.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  assert not errors,errors;browser.close()
 print('PASS: organization setup with uncertain response; no duplicate tabs; preservation of legacy/extra cells; reordered-row editing; retry reconciliation; category aliases/order; Sheet-driven nodes and labeled edges; conflict protection; landscape linked PDF/HTML; second-browser reads; phone/tablet widths. Synthetic data only.')
if __name__=='__main__':main()

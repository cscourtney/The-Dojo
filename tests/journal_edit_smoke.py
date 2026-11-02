"""Edit a saved journal entry by fresh stable ID, synthetic Sheets only."""
from urllib.parse import unquote,urlparse
from copy import deepcopy
from playwright.sync_api import sync_playwright,expect
HEADERS=['id','date','entry_type','gi','lesson','standup','technique','rolls','drillwork','pearls','fundamentals','notes','created_at','position','technique_label','takedown_label','map_node','extra']
AUTH="window.google={accounts:{oauth2:{initTokenClient:c=>({requestAccessToken:()=>c.callback({access_token:'test-only',expires_in:3600})})}}};"
def main():
 source={'id':'entry-a','date':'2026-10-16','entry_type':'class','gi':'gi','lesson':'Guard escape','technique':'Original journal detail','pearls':'Frames first\nKeep base','fundamentals':'Original fundamental','notes':'Original recap:\nDictated words','created_at':'2026-10-16T12:00:00Z','position':'guard','technique_label':'Framing','map_node':'closed-guard','extra':'KEEP JOURNAL EXTRA'}
 other={'id':'entry-b','date':'2026-10-01','entry_type':'class','lesson':'Other session','notes':'UNRELATED NOTES','created_at':'old','extra':'KEEP OTHER EXTRA'}
 tables={'data':[HEADERS,[source.get(k,'') for k in HEADERS],[other.get(k,'') for k in HEADERS]],'techniques':[['id','label','position','map_node','description','date','gi','created_at','extra'],['entry-a_tech','Framing','guard','closed-guard','Shared technique definition','2026-10-16','gi','original','KEEP TECH EXTRA'],['shared-other','Other shared','guard','','KEEP OTHER DESCRIPTION','2026-01-01','gi','other','EXTRA']],'pearls':[['entry_id','pearl','date','gi','created_at','extra'],['entry-a','Frames first','2026-10-16','gi','original','KEEP FRAMES EXTRA'],['entry-a','Keep base','2026-10-16','gi','original','KEEP BASE EXTRA'],['entry-b','Other pearl','2026-10-01','gi','other','KEEP OTHER PEARL']]}
 ids={tab:i+1 for i,tab in enumerate(tables)};writes=[];fail={'lost':False}
 def apply(request):
  if 'updateCells' in request:
   p=request['updateCells'];tab=next(t for t,id in ids.items() if id==p['start']['sheetId']);x,y=p['start']['columnIndex'],p['start']['rowIndex'];tables[tab][y][x]=p['rows'][0]['values'][0]['userEnteredValue']['stringValue']
  elif 'appendCells' in request:
   p=request['appendCells'];tab=next(t for t,id in ids.items() if id==p['sheetId']);tables[tab].extend([[cell['userEnteredValue']['stringValue'] for cell in row['values']] for row in p['rows']])
  else:raise AssertionError(request)
 def sheet(route):
  req=route.request;path=unquote(urlparse(req.url).path)
  if path.endswith(':batchUpdate'):
   writes.append(deepcopy(req.post_data_json['requests']))
   for item in req.post_data_json['requests']:apply(item)
   if fail['lost']:fail['lost']=False;return route.fulfill(status=500,json={})
   return route.fulfill(json={})
  if '/values/' in path:return route.fulfill(json={'values':tables[path.split('/values/')[1]]})
  return route.fulfill(json={'sheets':[{'properties':{'title':tab,'sheetId':ids[tab]}} for tab in tables]})
 def data(id):return next(dict(zip(HEADERS,row)) for row in tables['data'][1:] if row[0]==id)
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);context=browser.new_context(viewport={'width':1024,'height':1100});context.add_init_script(AUTH);context.route('https://sheets.googleapis.com/**',sheet);context.route('https://accounts.google.com/**',lambda r:r.abort());page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('dialog',lambda d:d.accept());page.goto('http://127.0.0.1:8000/next/');page.locator('#connect').click();expect(page.locator('#recent-list')).to_contain_text('Guard escape')
  # Starting an edit never overwrites a new workout draft.
  page.locator('#transcript').fill('Separate unsaved new workout');page.locator('#recent-list details').first.locator('summary').click();page.get_by_role('button',name='Edit entry',exact=True).first.click();expect(page.locator('#edit-date')).to_have_value('2026-10-16');expect(page.locator('#transcript')).to_have_value('Separate unsaved new workout')
  page.locator('#edit-date').fill('2026-11-02');page.locator('#edit-gi').select_option('nogi');page.locator('#edit-lesson').fill('Corrected guard escape');page.locator('#edit-technique').fill('Corrected session detail');page.locator('#edit-fundamentals').fill('Corrected fundamental');page.locator('#edit-pearls').fill('Keep base\nCorrected pearl\nThird pearl')
  # Re-sorting all source tabs after opening the edit cannot change which IDs are edited.
  tables['data'][1:]=list(reversed(tables['data'][1:]));tables['pearls'][1:]=list(reversed(tables['pearls'][1:]));tables['techniques'][1:]=list(reversed(tables['techniques'][1:]));unrelated=data('entry-b').copy();fail['lost']=True
  page.locator('#journal-edit-save').click();expect(page.locator('#journal-edit-state')).to_contain_text('Edit not confirmed');expect(page.locator('#edit-date')).to_be_disabled();assert data('entry-a')['date']=='2026-11-02';assert data('entry-b')==unrelated
  page.reload();page.locator('#resume-journal-edit').click();expect(page.locator('#edit-date')).to_have_value('2026-11-02');page.locator('#journal-edit-save').click();expect(page.locator('#status')).to_contain_text('Changes saved and confirmed');assert len(writes)==1
  saved=data('entry-a');assert saved['extra']=='KEEP JOURNAL EXTRA' and saved['created_at']==source['created_at'] and saved['map_node']=='closed-guard' and saved['technique_label']=='Framing';assert saved['notes'].count('Original recap:')==1
  pearls=[dict(zip(tables['pearls'][0],r)) for r in tables['pearls'][1:]];owned=[r for r in pearls if r['entry_id']=='entry-a'];assert len(owned)==3 and all(r['date']=='2026-11-02' and r['gi']=='nogi' for r in owned);assert next(r for r in owned if r['pearl']=='Keep base')['extra']=='KEEP BASE EXTRA';assert next(r for r in pearls if r['entry_id']=='entry-b')['extra']=='KEEP OTHER PEARL'
  owntech=next(dict(zip(tables['techniques'][0],row)) for row in tables['techniques'][1:] if row[0]=='entry-a_tech');assert owntech['date']=='2026-11-02' and owntech['gi']=='nogi' and owntech['description']=='Shared technique definition' and owntech['extra']=='KEEP TECH EXTRA'
  expect(page.locator('#transcript')).to_have_value('Separate unsaved new workout');page.get_by_role('button',name='Fundamentals',exact=True).click();expect(page.locator('#knowledge-list')).to_contain_text('Corrected fundamental');page.get_by_role('button',name='Pearls',exact=True).click();expect(page.locator('#knowledge-list')).to_contain_text('Third pearl')
  # Clear linked pearls: only their owned known cells are cleared; extra and unrelated cells survive.
  page.get_by_role('button',name='Journal',exact=True).click();page.locator('#recent-list details').first.locator('summary').click();page.get_by_role('button',name='Edit entry',exact=True).first.click();page.locator('#edit-pearls').fill('');page.locator('#journal-edit-save').click();expect(page.locator('#journal-editor')).to_be_hidden();expect(page.locator('#status')).to_contain_text('Changes saved and confirmed');assert not any(row[0]=='entry-a' for row in tables['pearls'][1:]);assert any('KEEP BASE EXTRA' in row for row in tables['pearls'][1:]);assert any(row[0]=='entry-b' for row in tables['pearls'][1:])
  # Observed concurrent changes are rejected without overwriting the other person's correction.
  page.locator('#recent-list details').first.locator('summary').click();page.get_by_role('button',name='Edit entry',exact=True).first.click();page.locator('#edit-lesson').fill('My stale edit');row=next(row for row in tables['data'][1:] if row[0]=='entry-a');row[HEADERS.index('lesson')]='Changed elsewhere';before=len(writes);page.locator('#journal-edit-save').click();expect(page.locator('#journal-edit-state')).to_contain_text('changed in another device');assert len(writes)==before;assert data('entry-a')['lesson']=='Changed elsewhere';page.get_by_role('button',name='Discard unsaved changes').click();expect(page.locator('#journal-editor')).to_be_hidden()
  # A clean second browser reads the corrected date/notes directly from Sheets.
  second_context=browser.new_context();second_context.add_init_script(AUTH);second_context.route('https://sheets.googleapis.com/**',sheet);second_context.route('https://accounts.google.com/**',lambda r:r.abort());second=second_context.new_page();second.goto('http://127.0.0.1:8000/next/');second.locator('#connect').click();expect(second.locator('#recent-list')).to_contain_text('2026-11-02');second.locator('#recent-list details').first.locator('summary').click();second.get_by_role('button',name='Edit entry',exact=True).first.click()
  for w,h in [(390,844),(768,1024),(1024,768)]:
   second.set_viewport_size({'width':w,'height':h});assert second.evaluate('document.documentElement.scrollWidth<=innerWidth+1');expect(second.locator('#edit-date')).to_be_visible();second.screenshot(path='/tmp/dojo-edit-'+str(w)+'.png',full_page=True)
  assert not errors,errors;browser.close()
 print('PASS: existing-entry date/details edit; fresh-ID lookup after row sorting; one atomic batch; linked pearl replacement/removal; source/extra cell preservation; shared technique protection; uncertain-response retry without duplicate appends; local new-draft preservation; concurrent-change rejection; second-browser read-back; mobile/tablet editor. Synthetic data only.')
if __name__=='__main__':main()

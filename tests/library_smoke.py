"""Direct library additions and recovery, using synthetic Sheet data only."""
from urllib.parse import unquote,urlparse
from playwright.sync_api import sync_playwright,expect
from pathlib import Path
HEADERS=['id','date','entry_type','gi','lesson','standup','technique','rolls','drillwork','pearls','fundamentals','notes','created_at','position','technique_label','takedown_label','map_node','danaher_category']
AUTH="window.google={accounts:{oauth2:{initTokenClient:c=>({requestAccessToken:()=>c.callback({access_token:'test-only',expires_in:3600})})}}};"
def main():
 tables={
 'data':[HEADERS, ['j1','2026-10-01','class','gi','Passing','','Journal-only description','','','Journal-only pearl','Use frames','','2026-10-01','guard-passing','Old technique','','','Guard passing']],
 'techniques':[['Created At','Technique Name','','Position','Description','Date','Gi','ID','Map Node','Danaher Category'],['2026-01-01','Kimura','','side-control','Control the shoulder','2026-01-01','gi','tech1','','Submission skills']],
 'pearls':[['Created At','Pearls','Entry ID','Date','Gi']]
 }
 fail={'data':False,'readback':False,'afterwrite':False};writes=[]
 def records(tab):
  aliases={'Technique Name':'label','Created At':'created_at','Position':'position','Description':'description','Date':'date','Gi':'gi','ID':'id','Map Node':'map_node','Danaher Category':'danaher_category','Pearls':'pearl','Entry ID':'entry_id'}
  return [dict(zip([aliases.get(h,h) for h in tables[tab][0]],row)) for row in tables[tab][1:]]
 def sheet(route):
  req=route.request
  if '/values/' not in urlparse(req.url).path:return route.fulfill(json={'sheets':[{'properties':{'title':name,'sheetId':i}} for i,name in enumerate(tables)]})
  segment=unquote(urlparse(req.url).path.split('/values/')[1]);tab=segment.split('!')[0]
  if req.method=='POST':
   tables[tab].append(req.post_data_json['values'][0]);writes.append(tab)
   if fail['readback']:fail['afterwrite']=True
   return route.fulfill(json={'updates':{'updatedRows':1}})
  if (tab=='data' and fail['data']) or (fail['afterwrite'] and tab=='pearls'):
   fail['afterwrite']=False;fail['readback']=False
   return route.fulfill(status=500,json={'error':'simulated read failure'})
  route.fulfill(json={'values':tables[tab]})
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);context=browser.new_context(viewport={'width':1024,'height':1100});context.add_init_script(AUTH)
  context.route('https://sheets.googleapis.com/**',sheet);context.route('https://accounts.google.com/**',lambda r:r.abort())
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:8000/next/#techniques');page.locator('#connect').click();expect(page.locator('#knowledge-list')).to_contain_text('Old technique');expect(page.locator('#technique-categories')).to_contain_text('Guard passing')
  page.locator('[data-category="Guard passing"]').click();expect(page.locator('#knowledge-list')).to_contain_text('Old technique');expect(page.locator('#knowledge-list')).not_to_contain_text('Kimura')
  page.locator('[data-category=""]').click()
  page.get_by_role('button',name='Pearls',exact=True).click();expect(page.locator('#knowledge-list')).to_contain_text('Journal-only pearl');assert not writes
  # A write succeeds but its confirmation fails: reload/retry reconciles the same ID.
  page.locator('#library-add').click();page.locator('#library-pearl').fill('Direct pearl fixture');fail['readback']=True;page.locator('#library-save').click();expect(page.locator('#library-save-state')).to_contain_text('Save incomplete');assert len(records('pearls'))==1
  page.reload();page.get_by_role('button',name='Resume pending save').click();expect(page.locator('#library-pearl')).to_have_value('Direct pearl fixture');expect(page.locator('#library-pearl')).to_be_disabled();page.locator('#library-save').click();expect(page.locator('#workspace-status')).to_contain_text('Saved and confirmed');assert len(records('pearls'))==1
  expect(page.locator('#knowledge-list')).to_contain_text('Direct pearl fixture');assert page.locator('#knowledge-list a').count()==1 # only the journal-derived pearl links to a session
  # Technique/category writes obey reordered display-name headers and blank physical columns.
  page.get_by_role('button',name='Techniques',exact=True).click();page.locator('#library-add').click();page.locator('#library-label').fill('Fixture knee slice');page.locator('#library-position').select_option('guard-passing');page.locator('#library-danaher_category').fill('Guard passing');page.locator('#library-description').fill('Connected passing fixture');page.locator('#library-save').click();expect(page.locator('#workspace-status')).to_contain_text('Saved and confirmed');expect(page.locator('#library-form')).to_be_hidden()
  created=records('techniques')[-1];assert created['label']=='Fixture knee slice' and created['danaher_category']=='Guard passing' and created['']=='';assert len(records('data'))==1
  # Duplicate names/positions are rejected before append and the draft remains editable.
  page.locator('#library-add').click();page.locator('#library-label').fill('Fixture knee slice');page.locator('#library-position').select_option('guard-passing');page.locator('#library-description').fill('Do not duplicate');page.locator('#library-save').click();expect(page.locator('#library-save-state')).to_contain_text('already exists');expect(page.locator('#library-label')).to_be_enabled();assert len(records('techniques'))==2;page.get_by_role('button',name='Discard this draft').click()
  # Fundamentals use existing data.fundamentals, never a new tab or a fake workout.
  page.get_by_role('button',name='Fundamentals',exact=True).click();page.locator('#library-add').click();page.locator('#library-lesson').fill('Base');page.locator('#library-fundamentals').fill('Direct fundamental fixture');page.locator('#library-save').click();expect(page.locator('#library-form')).to_be_hidden();expect(page.locator('#knowledge-list')).to_contain_text('Direct fundamental fixture');assert records('data')[-1]['entry_type']=='fundamental'
  page.get_by_role('button',name='Journal',exact=True).click();expect(page.locator('#recent-list')).not_to_contain_text('Direct fundamental fixture');expect(page.locator('#recent-state')).to_contain_text('1 sessions')
  # One technique can link to two map positions without duplicating it or changing previous links.
  page.get_by_role('button',name='Strategy links',exact=True).click();page.locator('#map-position').select_option('guard-passing');page.locator('#library-link').click();expect(page.locator('#library-map_node')).to_have_value('guard-passing');page.locator('#library-existing').select_option('fixture knee slice|guard-passing');page.locator('#library-save').click();expect(page.locator('#library-form')).to_be_hidden();expect(page.locator('#knowledge-list')).to_contain_text('Connected passing fixture');assert len(records('techniques'))==2
  page.locator('#map-position').select_option('side-control');page.locator('#library-link').click();page.locator('#library-existing').select_option('fixture knee slice|guard-passing');page.locator('#library-save').click();expect(page.locator('#library-form')).to_be_hidden();assert [r['map_node'] for r in records('data') if r['entry_type']=='reference']==['guard-passing','side-control']
  first_ref=next(row for row in tables['data'][1:] if row[HEADERS.index('entry_type')]=='reference');first_ref[HEADERS.index('map_node')]='gpass'
  before=len(records('data'));page.locator('#map-position').select_option('guard-passing');page.locator('#library-link').click();page.locator('#library-existing').select_option('fixture knee slice|guard-passing');page.locator('#library-save').click();expect(page.locator('#library-form')).to_be_hidden();assert len(records('data'))==before
  page.locator('#map-position').select_option('side-control')
  # New technique directly at selected map node.
  page.locator('#library-add').click();expect(page.locator('#library-map_node')).to_have_value('side-control');page.locator('#library-label').fill('Map technique fixture');page.locator('#library-position').select_option('side-control');page.locator('#library-description').fill('Map-created description');page.locator('#library-save').click();expect(page.locator('#library-form')).to_be_hidden();expect(page.locator('#knowledge-list')).to_contain_text('Map-created description');assert records('techniques')[-1]['map_node']=='side-control'
  before=len(records('data'));page.locator('#library-link').click();page.locator('#library-existing').select_option('map technique fixture|side-control');page.locator('#library-save').click();expect(page.locator('#library-form')).to_be_hidden();assert len(records('data'))==before
  # Failure of journal reads must not prevent techniques or pearls from refreshing.
  fail['data']=True;page.locator('#refresh-knowledge').click();expect(page.locator('#workspace-status')).to_contain_text('Some sections could not refresh');page.get_by_role('button',name='Techniques',exact=True).click();expect(page.locator('#knowledge-list')).to_contain_text('Fixture knee slice');expect(page.locator('#knowledge-state')).to_contain_text('From Google Sheets')
  fail['data']=False;page.locator('#refresh-knowledge').click();expect(page.locator('#workspace-status')).to_contain_text('up to date')
  # A changed/missing writable category header blocks the save before any append.
  page.locator('#library-add').click();page.locator('#library-label').fill('Header safety fixture');page.locator('#library-position').select_option('guard');page.locator('#library-description').fill('Keep safe');page.locator('#library-danaher_category').fill('Guard skills');
  previous_header=tables['techniques'][0][-1];tables['techniques'][0][-1]='';before=len(writes);page.locator('#library-save').click();expect(page.locator('#library-save-state')).to_contain_text('missing headers danaher_category');assert len(writes)==before
  tables['techniques'][0][-1]=previous_header;page.locator('#library-save').click();expect(page.locator('#library-form')).to_be_hidden();assert records('techniques')[-1]['danaher_category']=='Guard skills'
  # A clean second device reads all direct additions back from the shared Sheet.
  other=browser.new_context();other.add_init_script(AUTH);other.route('https://sheets.googleapis.com/**',sheet);other.route('https://accounts.google.com/**',lambda r:r.abort());second=other.new_page();second.goto('http://127.0.0.1:8000/next/#fundamentals');second.locator('#connect').click();expect(second.locator('#knowledge-list')).to_contain_text('Direct fundamental fixture')
  for label,width,height in [('phone',390,844),('ipad',768,1024),('ipad-landscape',1024,768)]:
   page.set_viewport_size({'width':width,'height':height});page.goto('http://127.0.0.1:8000/next/#techniques');page.locator('#library-add').click();expect(page.locator('#library-description')).to_be_visible();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');page.screenshot(path='/tmp/dojo-library-'+label+'.png',full_page=True);page.get_by_role('button',name='Discard this draft').click()
  assert not errors,errors
  browser.close()
 print('PASS: header aliases; journal fallback; Sheet-backed Danaher categories; direct additions; interrupted-save reconciliation; duplicate protection; multi-position map links; second-device read-back; phone/tablet forms. Synthetic data only.')
if __name__=='__main__':main()

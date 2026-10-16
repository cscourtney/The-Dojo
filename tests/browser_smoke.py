"""Mocked integration tests: no real Google or AI requests, no private Sheet access."""
from urllib.parse import unquote, urlparse
from playwright.sync_api import sync_playwright, expect
HEADERS=['id','date','entry_type','gi','lesson','standup','technique','rolls','drillwork','pearls','fundamentals','notes','created_at','position','technique_label','takedown_label','map_node']

def main():
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  context=browser.new_context(viewport={'width':1024,'height':1366})
  context.add_init_script("window.authPrompts=[];window.google={accounts:{oauth2:{initTokenClient:config=>({requestAccessToken:options=>{authPrompts.push(options.prompt);config.callback({access_token:'test-only',expires_in:3600});}})}}};")
  old={'id':'older-session','date':'2026-09-01','entry_type':'class','gi':'nogi','lesson':'Old focus','standup':'Old standup','technique':'Old detailed technique','rolls':'Old rolling notes','pearls':'Old pearl','fundamentals':'Old frames','notes':'Old additional notes','created_at':'2026-09-01T12:00:00Z','position':'side-control','technique_label':'Kimura','map_node':'side-control'}
  headers=list(reversed(HEADERS))
  tables={'data':[headers,[old.get(k,'') for k in headers]],'techniques':[['description','id','label','position','map_node','date','gi','created_at'],['Old detailed technique','older-session_tech','Kimura','side-control','side-control','2026-09-01','nogi','2026-09-01T12:00:00Z']],'pearls':[['pearl','entry_id','date','gi','created_at'],['Old pearl','older-session','2026-09-01','nogi','2026-09-01T12:00:00Z']]}
  # Blank physical columns and harmless duplicate extra headings must not prevent loading.
  for row in tables['techniques']:
   row.insert(1,'')
  tables['techniques'][0].extend(['category','category'])
  tables['techniques'][1].extend(['reference','reference'])
  fail={'pearl':True};writes=[];requests=[]
  def sheet(route):
   request=route.request;requests.append(request.url);segment=unquote(urlparse(request.url).path.split('/values/')[1]);tab=segment.split('!')[0]
   if request.method!='POST' and tab=='techniques' and fail.get('read-techniques'):
    return route.fulfill(status=500,json={'error':'simulated read failure'})
   if request.method=='POST':
    writes.append(tab)
    if tab=='pearls' and fail['pearl']:
     fail['pearl']=False;return route.fulfill(status=500,json={'error':'simulated failure'})
    tables[tab].append(request.post_data_json['values'][0]);return route.fulfill(json={'updates':{'updatedRows':1}})
   route.fulfill(json={'values':tables[tab]})
  context.route('https://sheets.googleapis.com/**',sheet)
  context.route('https://fonts.googleapis.com/**',lambda r:r.abort())
  context.route('https://accounts.google.com/**',lambda r:r.abort())
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('dialog',lambda d:d.accept())
  page.goto('http://127.0.0.1:8000/next/');expect(page.get_by_role('heading',name='Log your workout')).to_be_visible()
  assert page.locator('#record').count()==0
  assert page.evaluate('authPrompts.length')==0 and not requests
  # Native dictation is text input. It must persist without a recorder or microphone permission.
  page.locator('#transcript').evaluate("el=>{el.value='We drilled knee slices. Keep the underhook.';el.dispatchEvent(new Event('input',{bubbles:true}));}")
  page.wait_for_timeout(150);page.reload();expect(page.locator('#transcript')).to_have_value('We drilled knee slices. Keep the underhook.')
  page.locator('#manual').click();expect(page.locator('#new-technique')).not_to_be_checked()
  expect(page.locator('#standup')).to_be_visible();expect(page.locator('#fundamentals')).to_be_visible()
  page.locator('#lesson').fill('Passing');page.locator('#standup').fill('Arm drag practice');page.locator('#technique').fill('Knee slice with an underhook');page.locator('#rolls').fill('Lost the underhook in round two');page.locator('#notes').fill('Remember to breathe')
  page.locator('#new-technique').check();page.locator('#technique_label').fill('Knee slice');page.locator('#position').select_option('guard-passing');page.locator('#link-map').check();page.locator('#map_node').select_option('guard-passing');page.locator('#pearls').fill('Keep the underhook.');page.locator('#fundamentals').fill('Control before advancing.')
  # Explicit creation and map choices survive a reload too.
  page.wait_for_timeout(100);page.reload();expect(page.locator('#new-technique')).to_be_checked();expect(page.locator('#link-map')).to_be_checked()
  page.locator('#connect').click();expect(page.locator('#status')).to_contain_text('Connected. Your journal')
  page.locator('#save').click();expect(page.locator('#status')).to_contain_text('Save incomplete')
  assert len(tables['data'])==3 and len(tables['techniques'])==3 and len(tables['pearls'])==2
  page.reload();expect(page.locator('#status')).to_contain_text('1 pending save')
  page.locator('#refresh').click();expect(page.locator('#status')).to_contain_text('Your journal and linked sections are up to date')
  assert len(tables['data'])==3 and len(tables['techniques'])==3 and len(tables['pearls'])==3
  saved=dict(zip(tables['data'][0],tables['data'][-1]));assert saved['lesson']=='Passing' and saved['map_node']=='guard-passing';assert 'Original recap:' in saved['notes'];entry_id=saved['id']
  page.locator('#recent-list details').first.locator('summary').click()
  for text in ['Arm drag practice','Knee slice with an underhook','Lost the underhook in round two','Keep the underhook.','Control before advancing.','Remember to breathe']:
   expect(page.locator('#recent-list')).to_contain_text(text)
  # The old journal has full original content, not an arbitrarily selected summary.
  page.locator('#recent-list details').last.locator('summary').click()
  for text in ['Old standup','Old detailed technique','Old rolling notes','Old pearl','Old frames','Old additional notes']:expect(page.locator('#recent-list')).to_contain_text(text)
  # Map and library hyperlinks open the actual saved description, then lead back to the journal.
  page.locator('#recent-list').get_by_role('link',name='Knee slice',exact=True).click()
  expect(page.locator('#knowledge-list')).to_contain_text('Knee slice with an underhook')
  page.locator('#knowledge-list').get_by_role('link',name='Strategy: Guard Passing').click();expect(page.locator('#knowledge-list')).to_contain_text('Knee slice with an underhook')
  page.get_by_role('button',name='Pearls',exact=True).click();expect(page.locator('#knowledge-list')).to_contain_text('Keep the underhook.');expect(page.locator('.pearl-list li').first).to_be_visible();assert page.locator('.pearl-list li').first.evaluate("el=>getComputedStyle(el).display")=='list-item'
  page.get_by_role('button',name='Fundamentals',exact=True).click();expect(page.locator('#knowledge-list')).to_contain_text('Control before advancing.')
  page.locator('#knowledge-list').get_by_role('link',name='Open journal entry').first.click();expect(page.locator('#recent-list')).to_contain_text('Control before advancing.')
  page.get_by_role('button',name='Journal',exact=True).click()
  # Repeating an existing technique links this session, without creating a new library record.
  page.locator('#manual').click();page.locator('#lesson').fill('Repeat passing');page.locator('#technique').fill('Practiced the same knee slice again');page.locator('#existing-technique').select_option('knee slice|guard-passing')
  expect(page.locator('#new-technique')).not_to_be_checked();expect(page.locator('#technique_label')).to_have_value('Knee slice')
  page.locator('#save').click();expect(page.locator('#status')).to_contain_text('Saved and confirmed');assert len(tables['techniques'])==3
  assert dict(zip(headers,tables['data'][-1]))['map_node']==''
  # Even explicit New Technique does not duplicate an existing same-name/position technique.
  page.locator('#manual').click();page.locator('#technique').fill('Another day of the same technique');page.locator('#new-technique').check();page.locator('#technique_label').fill(' Knee slice ');page.locator('#position').select_option('guard-passing');page.locator('#save').click();expect(page.locator('#status')).to_contain_text('Saved and confirmed');assert len(tables['techniques'])==3
  # New takedowns are explicit and are NOT automatically linked to a strategy node.
  page.locator('#manual').click();page.locator('#standup').fill('Pull to the ankle and drive');page.locator('#new-takedown').check();page.locator('#takedown_label').fill('Ankle pick');page.locator('#save').click();expect(page.locator('#status')).to_contain_text('Saved and confirmed');assert len(tables['techniques'])==4
  td=dict(zip(tables['techniques'][0],tables['techniques'][-1]));assert td['label']=='Ankle pick' and td['position']=='takedowns' and td['map_node']==''
  # Hidden class fields must not leak into a Home drill entry.
  page.locator('#manual').click();page.locator('#lesson').fill('Hidden lesson');page.locator('#entry_type').select_option('drill');expect(page.locator('#standup')).not_to_be_visible();expect(page.locator('#drillwork')).to_be_visible();page.locator('#drillwork').fill('Hip escapes at home');page.locator('#fundamentals').fill('Keep a frame');page.locator('#save').click();expect(page.locator('#status')).to_contain_text('Saved and confirmed')
  drill=dict(zip(headers,tables['data'][-1]));assert drill['lesson']=='' and drill['gi']=='' and drill['technique_label']=='' and drill['drillwork']=='Hip escapes at home'
  # A cancelled New Technique toggle must not create anything from hidden name fields.
  page.locator('#manual').click();page.locator('#technique').fill('Practice without library creation');page.locator('#new-technique').check();page.locator('#technique_label').fill('Must not be created');page.locator('#position').select_option('guard');page.locator('#new-technique').uncheck();page.locator('#save').click();expect(page.locator('#status')).to_contain_text('Saved and confirmed');assert len(tables['techniques'])==4;assert dict(zip(headers,tables['data'][-1]))['technique_label']==''
  # AI organizes prose but cannot opt into creating library entries or map links.
  page.locator('#transcript').fill('We worked guard retention.');page.locator('.settings summary').click();page.locator('#worker-url').fill('https://dojo-test.workers.dev');page.locator('#save-settings').click()
  parsed={key:'' for key in HEADERS if key not in ['id','created_at']};parsed.update(date='2026-10-14',entry_type='class',gi='nogi',lesson='Guard retention',technique_label='Invented label',position='guard',map_node='closed-guard')
  context.route('https://dojo-test.workers.dev/parse-workout',lambda r:r.fulfill(json={'entry':parsed}))
  page.locator('#disconnect').click();page.locator('#organize').click();expect(page.locator('#lesson')).to_have_value('Guard retention');assert page.evaluate('authPrompts.at(-1)')==''
  expect(page.locator('#new-technique')).not_to_be_checked();expect(page.locator('#link-map')).not_to_be_checked();expect(page.locator('#technique_label')).to_have_value('');expect(page.locator('#review-status')).to_contain_text('Ready to review')
  context.unroute('https://dojo-test.workers.dev/parse-workout');context.route('https://dojo-test.workers.dev/parse-workout',lambda r:r.fulfill(json={'entry':{}}));page.locator('#organize').click();expect(page.locator('#status')).to_contain_text('AI returned no session details');expect(page.locator('#lesson')).to_have_value('Guard retention')
  # A library read failure keeps the journal usable and labels cached library data honestly.
  fail['read-techniques']=True;page.locator('#refresh').click();expect(page.locator('#status')).to_contain_text('Journal loaded, but these sections could not refresh')
  page.get_by_role('button',name='Techniques',exact=True).click();expect(page.locator('#knowledge-state')).to_contain_text('Cached on this device')
  fail['read-techniques']=False;page.locator('#refresh-knowledge').click();expect(page.locator('#knowledge-state')).to_contain_text('From Google Sheets');page.get_by_role('button',name='Journal',exact=True).click()
  # A separate browser context has no device cache; it reads saved records from the shared Sheet.
  other=browser.new_context()
  other.add_init_script("window.google={accounts:{oauth2:{initTokenClient:c=>({requestAccessToken:()=>c.callback({access_token:'test-only',expires_in:3600})})}}};")
  other.route('https://sheets.googleapis.com/**',sheet);other.route('https://fonts.googleapis.com/**',lambda r:r.abort());other.route('https://accounts.google.com/**',lambda r:r.abort())
  second=other.new_page();second.goto('http://127.0.0.1:8000/next/');second.locator('#connect').click();expect(second.locator('#recent-list')).to_contain_text('Repeat passing');second.get_by_role('button',name='Fundamentals',exact=True).click();expect(second.locator('#knowledge-list')).to_contain_text('Keep a frame')
  for label,width,height in [('phone',390,844),('ipad-portrait',768,1024),('ipad-landscape',1024,768)]:
   second.set_viewport_size({'width':width,'height':height})
   for section in ['Journal','Techniques','Pearls','Fundamentals','Strategy links']:
    second.get_by_role('button',name=section,exact=True).click()
    assert second.evaluate('document.documentElement.scrollWidth<=innerWidth'),(label,section)
    if section in ['Journal','Pearls']:second.screenshot(path=f'/tmp/dojo-{label}-{section.lower()}.png',full_page=True)
  other.close()
  # A deleted library record must not turn an existing-technique link into implicit creation.
  page.locator('#existing-technique').select_option('knee slice|guard-passing');page.locator('#technique').fill('Existing linked technique practice')
  removed=tables['techniques'].pop(2);before=len(writes);page.locator('#save').click();expect(page.locator('#status')).to_contain_text('linked technique is no longer in the Sheet');assert len(writes)==before
  tables['techniques'].insert(2,removed);page.locator('#refresh').click();expect(page.locator('#status')).to_contain_text('Your journal and linked sections are up to date');page.locator('#manual').click();page.locator('#notes').fill('Schema protection test')
  # Missing headers block every write. All saved rows still follow the reordered headers.
  tables['data'][0].remove('map_node');before=len(writes);page.locator('#save').click();expect(page.locator('#status')).to_contain_text('missing headers map_node');assert len(writes)==before
  # Existing audio from the first prototype remains recoverable, without activating a microphone.
  page.evaluate("""async()=>{const store=await import('./js/store.js');await store.write('audio-legacy-0',new Blob(['saved audio'],{type:'audio/webm'}));await store.write('recording',{id:'legacy',count:1,type:'audio/webm'});}""")
  page.reload();page.locator('.settings summary').click();expect(page.locator('#earlier-download')).to_be_visible();assert page.locator('#record').count()==0
  assert not errors,errors
  page.screenshot(path='/tmp/dojo-journal-update.png',full_page=True)
  for width in [390,768]:
   page.set_viewport_size({'width':width,'height':1000});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  browser.close();print('PASS: native dictation draft recovery; original fields/history; explicit library toggles; existing-technique reuse; no duplicate creation; map/pearl/fundamental cross-links; partial-write retry; session types; AI cannot create links; renewal; malformed responses; missing headers; earlier-audio recovery; mobile/tablet layout. External services were simulated.')
if __name__=='__main__':main()

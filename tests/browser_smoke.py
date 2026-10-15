"""Local, mocked integration tests. Never read or write the real Google Sheet."""
import json
from urllib.parse import unquote, urlparse
from playwright.sync_api import sync_playwright, expect

HEADERS = ['id','date','entry_type','gi','lesson','standup','technique','rolls','drillwork','pearls','fundamentals','notes','created_at','position','technique_label','takedown_label','map_node']

def main():
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  context=browser.new_context(viewport={'width':1024,'height':1366})
  context.add_init_script("window.authPrompts=[];window.google={accounts:{oauth2:{initTokenClient:config=>({requestAccessToken:options=>{window.authPrompts.push(options.prompt);config.callback({access_token:'test-only',expires_in:3600});}})}}};")
  tables={'data':[list(reversed(HEADERS))], 'techniques':[['description','id','label','position','map_node','date','gi','created_at']], 'pearls':[['pearl','entry_id','date','gi','created_at']]}
  fail={'pearl':True}; writes=[]
  def sheet(route):
   request=route.request;segment=unquote(urlparse(request.url).path.split('/values/')[1]);tab=segment.split('!')[0]
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
  page.goto('http://127.0.0.1:8000/next/');expect(page.get_by_role('heading',name='Log your workout')).to_be_visible()
  page.locator('#transcript').fill('We drilled knee slices. Keep the underhook.');page.wait_for_timeout(150)
  page.reload();expect(page.locator('#transcript')).to_have_value('We drilled knee slices. Keep the underhook.')
  page.locator('#manual').click();page.locator('#lesson').fill('Passing');page.locator('#technique').fill('Knee slice with an underhook');page.locator('#optional-fields summary').click();page.locator('#technique_label').fill('Knee slice');page.locator('#pearls').fill('Keep the underhook.');
  page.locator('#connect').click();expect(page.locator('#status')).to_contain_text('Connected. Your training history')
  page.locator('#save').click();expect(page.locator('#status')).to_contain_text('Save incomplete')
  assert len(tables['data'])==2 and len(tables['techniques'])==2 and len(tables['pearls'])==1
  page.reload();expect(page.locator('#status')).to_contain_text('1 pending save')
  page.locator('#connect').click();expect(page.locator('#status')).to_contain_text('Connected. Your training history')
  assert len(tables['data'])==2 and len(tables['techniques'])==2 and len(tables['pearls'])==2
  saved=dict(zip(tables['data'][0],tables['data'][1]));assert saved['lesson']=='Passing';assert 'Original recap:' in saved['notes'];assert saved['technique_label']=='Knee slice'
  expect(page.locator('#recent-list')).to_contain_text('Keep the underhook.')
  expect(page.locator('#transcript')).to_have_value('')
  page.locator('#worker-url').evaluate("el => el.value = ''");page.locator('#transcript').fill('New recap.');page.locator('#organize').click();expect(page.locator('#status')).to_contain_text('AI is not connected')
  # The actual UI calls a mocked Worker, while the Worker itself is tested separately.
  page.locator('.settings summary').click();page.locator('#worker-url').fill('https://dojo-test.workers.dev');page.locator('#save-settings').click()
  parsed={key:'' for key in HEADERS if key not in ['id','created_at']};parsed.update(date='2026-10-14',entry_type='class',gi='nogi',lesson='Guard retention')
  context.route('https://dojo-test.workers.dev/parse-workout',lambda r:r.fulfill(json={'entry':parsed}))
  page.locator('#disconnect').click()
  page.locator('#organize').click();expect(page.locator('#lesson')).to_have_value('Guard retention');assert len(tables['data'])==2
  assert page.evaluate('authPrompts.at(-1)')==''
  expect(page.locator('#review-status')).to_contain_text('Ready to review')
  # An empty successful response must not masquerade as an organized session.
  context.unroute('https://dojo-test.workers.dev/parse-workout')
  context.route('https://dojo-test.workers.dev/parse-workout',lambda r:r.fulfill(json={'entry':{}}))
  page.locator('#organize').click();expect(page.locator('#status')).to_contain_text('AI returned no session details')
  expect(page.locator('#lesson')).to_have_value('Guard retention')
  # Missing a required header blocks every write, rather than silently dropping data.
  tables['data'][0].remove('map_node');before=len(writes)
  page.locator('#save').click();expect(page.locator('#status')).to_contain_text('missing headers map_node');assert len(writes)==before
  assert not errors, errors
  page.screenshot(path='/tmp/dojo-next-tablet.png',full_page=True)
  page.set_viewport_size({'width':390,'height':844});page.screenshot(path='/tmp/dojo-next-mobile.png',full_page=True)
  assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
  browser.close()
  print('PASS: draft recovery; reordered headers; linked Sheet writes; partial failure/reload/retry without duplicates; AI review before save; missing-header protection; mobile width; no page errors. Real Google/AI services were not contacted.')
if __name__=='__main__':main()

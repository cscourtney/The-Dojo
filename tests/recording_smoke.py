"""Chromium microphone simulation; not a substitute for a real iPad recording."""
from playwright.sync_api import sync_playwright, expect
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'])
 context=browser.new_context(permissions=['microphone'])
 context.route('https://fonts.googleapis.com/**',lambda r:r.abort())
 context.route('https://accounts.google.com/**',lambda r:r.abort())
 context.add_init_script("""
 class FakeSpeech {
  constructor(){window.testSpeech=this;this.starts=0;}
  start(){this.starts++;}
  stop(){this.onend?.();}
  abort(){}
 }
 window.SpeechRecognition=FakeSpeech;
 """)
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:8000/next/')
 page.locator('#record').click();expect(page.locator('#record')).to_have_text('Stop recording')
 page.evaluate("""()=>{const result=[{transcript:'We practiced kimura.'}];result.isFinal=true;testSpeech.onresult({resultIndex:0,results:[result]});testSpeech.onend();}""")
 page.wait_for_timeout(400);assert page.evaluate('testSpeech.starts')==2
 page.evaluate("""()=>{const result=[{transcript:'Keep the elbow tight.'}];result.isFinal=true;testSpeech.onresult({resultIndex:0,results:[result]});}""")
 expect(page.locator('#transcript')).to_have_value('We practiced kimura. Keep the elbow tight.')
 page.wait_for_timeout(2100);page.locator('#record').click();expect(page.locator('#audio')).to_be_visible();expect(page.locator('#download')).to_be_visible()
 page.reload();expect(page.locator('#audio')).to_be_visible();expect(page.locator('#transcript')).to_have_value('We practiced kimura. Keep the elbow tight.')
 assert not errors,errors
 browser.close()
 print('PASS: simulated microphone audio capture, recognition restart with appended transcript, audio and transcript recovery after reload. Not live iPad validation.')

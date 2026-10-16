import json, urllib.request
from playwright.sync_api import sync_playwright
MOCK='http://127.0.0.1:54321'; BASE='http://localhost:8799'
def post(path,body): return json.loads(urllib.request.urlopen(urllib.request.Request(MOCK+path,json.dumps(body).encode(),{'Content-Type':'application/json'})).read() or b'{}')
post('/__test/reset',{})
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(); logs=[]; pg.on('console',lambda m:logs.append(m.text)); pg.on('pageerror',lambda e:logs.append('ERR '+str(e)))
    pg.goto(BASE); pg.wait_for_selector('.sa-auth'); pg.click('[data-m=register]')
    for k,v in dict(first_name='A',last_name='B',email='a@b.co',password='Passw0rd!!',password2='Passw0rd!!').items(): pg.fill('#'+k,v)
    pg.select_option('#country',index=9); pg.select_option('#occupation','Student'); pg.check('#terms'); pg.click('#saGo'); pg.wait_for_selector('text=Check your email')
    post('/__test/confirm',{'email':'a@b.co'}); pg.goto(BASE); pg.wait_for_selector('#saForm'); pg.fill('#email','a@b.co'); pg.fill('#password','Passw0rd!!'); pg.click('#saGo'); pg.wait_for_selector('text=Welcome')
    k=pg.evaluate("Object.keys(localStorage)"); print(k)
    sess=pg.evaluate("JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.includes('auth-token'))))"); print(list(sess.keys()))
    c=b.new_context(); r=c.new_page(); r.on('console',lambda m:print('C',m.text)); r.on('pageerror',lambda e:print('E',e))
    r.goto(BASE+f"/#access_token={sess['access_token']}&refresh_token={sess['refresh_token']}&expires_in=3600&token_type=bearer&type=recovery"); r.wait_for_timeout(3000); print(r.inner_text('body')[:300]); print(r.url)

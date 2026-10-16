import json, sys, urllib.request, urllib.error
from playwright.sync_api import sync_playwright
BASE='http://localhost:8799'; MOCK='http://127.0.0.1:54321'; res=[]
def ok(n,c,i=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+(' :: '+str(i) if not c and i else ''))
def post(path,body): return json.loads(urllib.request.urlopen(urllib.request.Request(MOCK+path,json.dumps(body).encode(),{'Content-Type':'application/json'})).read() or b'{}')
def state(): return json.loads(urllib.request.urlopen(MOCK+'/__test/state').read())
def signup(pg,fn,em,pw='Passw0rd!!'):
    if pg.query_selector('[data-m=register]'): pg.click('[data-m=register]')
    for k,v in dict(first_name=fn,last_name='Test',email=em,password=pw,password2=pw).items(): pg.fill('#'+k,v)
    pg.select_option('#country',index=9); pg.select_option('#occupation','Panel Builder'); pg.check('#terms'); pg.click('#saGo'); pg.wait_for_selector('text=Check your email')
def login(pg,em,pw='Passw0rd!!'):
    pg.goto(BASE); pg.wait_for_selector('#saForm'); pg.fill('#email',em); pg.fill('#password',pw); pg.click('#saGo')
post('/__test/reset',{})
with sync_playwright() as p:
    b=p.chromium.launch()
    # mobile screenshots
    m=b.new_context(viewport={'width':390,'height':800},device_scale_factor=2); pg=m.new_page(); pg.goto(BASE); pg.wait_for_selector('.sa-auth'); pg.screenshot(path='/tmp/shot_m_login.png')
    ok('mobile: no horizontal scroll on login', pg.evaluate("document.documentElement.scrollWidth<=window.innerWidth"))
    pg.click('[data-m=register]'); pg.screenshot(path='/tmp/shot_m_reg.png',full_page=True)
    ok('mobile: no horizontal scroll on register', pg.evaluate("document.documentElement.scrollWidth<=window.innerWidth"))
    signup(pg,'Mia','mia@example.com'); post('/__test/confirm',{'email':'mia@example.com'})
    login(pg,'mia@example.com'); pg.wait_for_selector('text=Welcome, Mia'); pg.screenshot(path='/tmp/shot_m_dash.png',full_page=True)
    ok('mobile: no horizontal scroll on dashboard', pg.evaluate("document.documentElement.scrollWidth<=window.innerWidth"))
    # desktop
    d=b.new_context(viewport={'width':1366,'height':820}); dp=d.new_page(); dp.goto(BASE); dp.wait_for_selector('.sa-auth'); dp.screenshot(path='/tmp/shot_d_login.png')
    dp.click('[data-m=register]'); dp.screenshot(path='/tmp/shot_d_reg.png')
    login(dp,'mia@example.com'); dp.wait_for_selector('text=Welcome, Mia')
    dp.click('[data-sa=new]'); dp.wait_for_selector('.wrap',state='visible'); dp.wait_for_timeout(1500); dp.screenshot(path='/tmp/shot_d_app.png')
    dp.click('.quick .sa-ub'); dp.screenshot(path='/tmp/shot_d_menu.png',clip={'x':700,'y':0,'width':666,'height':260})
    # language switch on auth page
    dp.click('.sa-menu [data-sa=signout]'); dp.wait_for_selector('.sa-auth'); dp.select_option('#saLang','ro'); dp.wait_for_timeout(500)
    ok('auth page translates (ro)', 'Autentificare' in dp.inner_text('.sa-box') or 'Conectare' in dp.inner_text('.sa-box') or 'Sign in' not in dp.inner_text('.sa-box h2'), dp.inner_text('.sa-box h2'))
    dp.select_option('#saLang','en')
    # conflict: change on server behind client's back
    login(dp,'mia@example.com'); dp.wait_for_selector('text=Welcome, Mia'); dp.click('[data-sa=open]'); dp.wait_for_selector('.wrap',state='visible')
    tok=dp.evaluate("SA.session.access_token"); pid=dp.evaluate("SA.cloudId")
    r=urllib.request.Request(MOCK+f'/rest/v1/projects?id=eq.{pid}',json.dumps({'name':'Edited elsewhere','data':{'x':1}}).encode(),{'Authorization':'Bearer '+tok,'Content-Type':'application/json','apikey':'test-anon-key'},method='PATCH'); urllib.request.urlopen(r)
    dp.evaluate("S.name='Local edit'; refresh(true)"); dp.wait_for_selector('.sa-dlg',timeout=8000); ok('conflict dialog on concurrent edit', 'another device' in dp.inner_text('.sa-dlg'))
    dp.click('[data-sa=keepmine]'); dp.wait_for_timeout(2500); ok('keep-my-version saves', state()['projects']>=1 and not dp.is_visible('.sa-dlg'))
    # recovery link flow (hash tokens like the Supabase email link)
    sess=dp.evaluate("JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.includes('auth-token'))))")
    dp.evaluate("localStorage.clear()"); rc=b.new_context(); rp=rc.new_page()
    rp.goto(BASE+f"/#access_token={sess['access_token']}&refresh_token={sess['refresh_token']}&expires_in=3600&token_type=bearer&type=recovery"); rp.wait_for_selector('text=Choose a new password',timeout=10000); ok('recovery link opens new-password screen', True)
    rp.fill('#password','Brand-new-pw1'); rp.fill('#password2','Brand-new-pw1'); rp.click('#saGo'); rp.wait_for_selector('text=Welcome, Mia',timeout=10000); ok('recovery sets password and signs in', True)
    ok('recovery hash removed from URL', 'access_token' not in rp.url)
    # suspended user
    s=b.new_context(); sp=s.new_page(); sp.goto(BASE); sp.wait_for_selector('.sa-auth'); signup(sp,'Sam','sam@example.com'); post('/__test/confirm',{'email':'sam@example.com'}); login(sp,'sam@example.com'); sp.wait_for_selector('text=Welcome, Sam')
    for pr in json.loads(urllib.request.urlopen(MOCK+'/__test/state').read()) and []: pass
    # mark suspended via mock profile patch (service role) then reload
    req=urllib.request.Request(MOCK+'/rest/v1/profiles?email=eq.sam@example.com',json.dumps({'status':'suspended'}).encode(),{'Authorization':'Bearer test-service-role-key','Content-Type':'application/json'},method='PATCH'); urllib.request.urlopen(req)
    sp.reload(); sp.wait_for_selector('text=Account suspended',timeout=10000); ok('suspended account sees suspended screen', True)
    ok('suspended account cannot reach designer', not sp.is_visible('.wrap'))
    # delete account
    login(rp.context.pages[0] if False else rp,'x') if False else None
    rp.click('#saas [data-sa=account]'); rp.wait_for_selector('[data-sa=delacct]'); rp.click('[data-sa=delacct]'); rp.fill('#delEmail','wrong@example.com'); rp.click('#saDel button.bad'); rp.wait_for_selector('#delErr:not([hidden])'); ok('delete requires matching email', True)
    n0=state()['users']; rp.fill('#delEmail','mia@example.com'); rp.click('#saDel button.bad'); rp.wait_for_selector('.sa-auth',timeout=10000)
    ok('account deleted and signed out', state()['users']==n0-1)
    b.close()
print(sum(res),'passed',len(res)-sum(res),'failed'); sys.exit(0 if all(res) else 1)

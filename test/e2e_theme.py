"""Language selector on the dashboard (desktop and phone) and the light/dark toggle.
Real Worker + front-end, TEST-ONLY Supabase mock."""
import json, sys, urllib.request
from playwright.sync_api import sync_playwright
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8799'; MOCK='http://127.0.0.1:54321'; res=[]
def ok(n,c,i=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+(' :: '+str(i)[:300] if not c and i else ''))
def post(path,body): return json.loads(urllib.request.urlopen(urllib.request.Request(MOCK+path,json.dumps(body).encode(),{'Content-Type':'application/json'})).read() or b'{}')
post('/__test/reset',{})
bg="getComputedStyle(document.body).backgroundColor"
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1366,'height':900},color_scheme='light'); pg=ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('[data-m=register]')
    ok('login page has a theme toggle and language select', pg.is_visible('.sa-auth [data-theme-toggle]') and pg.is_visible('.sa-auth #saLang'))
    pg.click('[data-m=register]')
    for k,v in dict(first_name='Pat',last_name='Test',email='pat@example.com',password='Passw0rd!!',password2='Passw0rd!!').items(): pg.fill('#'+k,v)
    pg.select_option('#country',index=9); pg.select_option('#occupation','Electrician'); pg.check('#terms'); pg.click('#saGo'); pg.wait_for_selector('text=Check your email')
    post('/__test/confirm',{'email':'pat@example.com'})
    pg.goto(BASE); pg.wait_for_selector('#saForm'); pg.fill('#email','pat@example.com'); pg.fill('#password','Passw0rd!!'); pg.click('#saGo'); pg.wait_for_selector('text=Welcome, Pat')
    ok('dashboard shows the language selector', pg.is_visible('.sa-bar #saLang'))
    ok('dashboard shows the theme toggle', pg.is_visible('.sa-bar [data-theme-toggle]'))
    light=pg.evaluate(bg); pg.click('.sa-bar [data-theme-toggle]'); pg.wait_for_timeout(200)
    ok('toggle switches to dark', pg.evaluate("document.documentElement.dataset.theme")=='dark' and pg.evaluate(bg)!=light, (light,pg.evaluate(bg)))
    ok('toggle label flips', pg.get_attribute('.sa-bar [data-theme-toggle]','data-mode')=='dark' and 'light' in pg.get_attribute('.sa-bar [data-theme-toggle]','aria-label'))
    pg.screenshot(path='/tmp/dash_dark.png')
    pg.reload(); pg.wait_for_selector('.sa-bar'); ok('dark choice survives a reload', pg.evaluate("document.documentElement.dataset.theme")=='dark')
    pg.click('.sa-bar [data-theme-toggle]'); pg.wait_for_timeout(200); ok('toggle back to light', pg.evaluate("document.documentElement.dataset.theme")=='light' and pg.evaluate(bg)==light)
    pg.set_viewport_size({'width':390,'height':800}); pg.wait_for_timeout(300)
    ok('phone width: language selector and toggle visible', pg.is_visible('.sa-bar #saLang') and pg.is_visible('.sa-bar [data-theme-toggle]'))
    ok('phone width: no sideways scroll', pg.evaluate("document.documentElement.scrollWidth<=innerWidth+1"), pg.evaluate("[document.documentElement.scrollWidth,innerWidth]"))
    pg.screenshot(path='/tmp/dash_phone.png')
    pg.set_viewport_size({'width':1366,'height':900}); pg.click('[data-sa=new]'); pg.wait_for_selector('.wrap',state='visible'); pg.wait_for_timeout(800)
    ok('designer has the toggle', pg.is_visible('.quick [data-theme-toggle]'))
    pg.click('.quick [data-theme-toggle]'); pg.wait_for_timeout(200); ok('designer toggle works', pg.evaluate("document.documentElement.dataset.theme")=='dark')
    ok('no page errors', not errs, errs); b.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)

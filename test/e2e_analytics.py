"""HeyCatch analytics: SDK snippet, CSP, init key, identity on sign-in and sign-out. The SDK itself is stubbed (no internet to esm.sh in tests)."""
import json, sys, urllib.request
from playwright.sync_api import sync_playwright
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8799'; MOCK='http://127.0.0.1:54321'; res=[]
def ok(n,c,i=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+(' :: '+str(i)[:300] if not c and i else ''))
def post(path,body): return json.loads(urllib.request.urlopen(urllib.request.Request(MOCK+path,json.dumps(body).encode(),{'Content-Type':'application/json'})).read() or b'{}')
post('/__test/reset',{})
STUB="export const analytics={init(o){(window.__hc=window.__hc||[]).push(['init',o])},setIdentity(...a){window.__hc.push(['id',...a])},resetIdentity(){window.__hc.push(['reset'])}};"
r=urllib.request.urlopen(BASE+'/'); csp=r.headers.get('Content-Security-Policy',''); html=r.read().decode()
ok('CSP allows esm.sh and in.heycatch.ai for scripts', "script-src 'self' 'unsafe-inline' https://esm.sh https://in.heycatch.ai" in csp, csp)
ok('CSP allows in.heycatch.ai connections', 'connect-src' in csp and 'https://in.heycatch.ai' in csp.split('connect-src')[1].split(';')[0])
ok('SDK pinned to latest 0.8.5 on esm.sh, static import', "import { analytics } from 'https://esm.sh/@heycatch/sdk@0.8.5'" in html)
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.route('https://esm.sh/**',lambda route:route.fulfill(status=200,content_type='application/javascript',body=STUB))
    pg.goto(BASE); pg.wait_for_selector('[data-m=register]'); pg.wait_for_timeout(500)
    init=pg.evaluate("(window.__hc||[]).find(x=>x[0]=='init')")
    ok('init called once with the project key', init and init[1]['projectKey']=='hck_pk_sM2oLfy39cihCZlwrGywhm6jcXhJQvoR' and pg.evaluate("window.__hc.filter(x=>x[0]=='init').length")==1, init)
    pg.click('[data-m=register]')
    for k,v in dict(first_name='Pat',last_name='Test',email='pat@example.com',password='Passw0rd!!',password2='Passw0rd!!').items(): pg.fill('#'+k,v)
    pg.select_option('#country',index=9); pg.select_option('#occupation','Marine Electrician'); pg.check('#terms'); pg.click('#saGo'); pg.wait_for_selector('text=Check your email')
    post('/__test/confirm',{'email':'pat@example.com'})
    pg.goto(BASE); pg.wait_for_selector('#saForm'); pg.fill('#email','pat@example.com'); pg.fill('#password','Passw0rd!!'); pg.click('#saGo'); pg.wait_for_selector('text=Welcome, Pat')
    ident=pg.evaluate("window.__hc.filter(x=>x[0]=='id').pop()")
    ok('identity set after sign-in with email, name, plan', ident and ident[1] and ident[2].get('email')=='pat@example.com' and ident[2].get('name')=='Pat Test', ident)
    pg.evaluate("saSignOut()"); pg.wait_for_timeout(800)
    ok('identity reset on sign-out', pg.evaluate("window.__hc.some(x=>x[0]=='reset')"))
    ok('no page errors', not errs, errs)
    b.close()
print('%d/%d passed'%(sum(res),len(res))); sys.exit(0 if all(res) else 1)

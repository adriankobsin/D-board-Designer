"""Positioning hero above the tool."""
import json, sys, urllib.request
from playwright.sync_api import sync_playwright
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8799'; MOCK='http://127.0.0.1:54321'; res=[]
def ok(n,c,i=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+(' :: '+str(i)[:300] if not c and i else ''))
def post(path,body): return json.loads(urllib.request.urlopen(urllib.request.Request(MOCK+path,json.dumps(body).encode(),{'Content-Type':'application/json'})).read() or b'{}')
post('/__test/reset',{})
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1366,'height':900}); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('[data-m=register]'); pg.click('[data-m=register]')
    for k,v in dict(first_name='Pat',last_name='Test',email='pat@example.com',password='Passw0rd!!',password2='Passw0rd!!').items(): pg.fill('#'+k,v)
    pg.select_option('#country',index=9); pg.select_option('#occupation','Marine Electrician'); pg.check('#terms'); pg.click('#saGo'); pg.wait_for_selector('text=Check your email')
    post('/__test/confirm',{'email':'pat@example.com'})
    pg.goto(BASE); pg.wait_for_selector('#saForm'); pg.fill('#email','pat@example.com'); pg.fill('#password','Passw0rd!!'); pg.click('#saGo'); pg.wait_for_selector('text=Welcome, Pat')
    pg.click('[data-sa=new]'); pg.wait_for_selector('.wrap',state='visible'); pg.wait_for_timeout(800)
    ok('one h1 names the job', pg.locator('h1:visible').count()==1 and 'distribution board' in pg.inner_text('#hero h1'))
    t=pg.inner_text('#hero')
    ok('subhead names who, what and outputs', 'electricians' in t and 'circuit schedule' in t and 'multi-line diagram' in t)
    ok('pain sentence and standards present', 'wiring diagram' in t and 'BS 7671' in t and 'ABYC E-11' in t)
    ok('hero sits above the tabs', pg.evaluate("document.getElementById('hero').getBoundingClientRect().bottom <= document.getElementById('tabs').getBoundingClientRect().top+1"))
    pg.click('#heroX'); ok('hide works', not pg.is_visible('#hero'))
    pg.reload(); pg.wait_for_timeout(1500)
    ok('no page errors', not errs, errs)
    b.close()
print('%d/%d passed'%(sum(res),len(res))); sys.exit(0 if all(res) else 1)

"""Dashboard tiles / list toggle. Real Worker + front-end, TEST-ONLY Supabase mock."""
import json, sys, urllib.request
from playwright.sync_api import sync_playwright
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8799'; MOCK='http://127.0.0.1:54321'; res=[]
def ok(n,c,i=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+(' :: '+str(i)[:300] if not c and i else ''))
def post(path,body): return json.loads(urllib.request.urlopen(urllib.request.Request(MOCK+path,json.dumps(body).encode(),{'Content-Type':'application/json'})).read() or b'{}')
post('/__test/reset',{})
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1366,'height':820})
    pg.goto(BASE); pg.wait_for_selector('[data-m=register]'); pg.click('[data-m=register]')
    for k,v in dict(first_name='Li',last_name='Test',email='li@example.com',password='Passw0rd!!',password2='Passw0rd!!').items(): pg.fill('#'+k,v)
    pg.select_option('#country',index=9); pg.select_option('#occupation','ETO (Electro-Technical Officer)'); pg.check('#terms'); pg.click('#saGo'); pg.wait_for_selector('text=Check your email')
    post('/__test/confirm',{'email':'li@example.com'})
    pg.goto(BASE); pg.wait_for_selector('#saForm'); pg.fill('#email','li@example.com'); pg.fill('#password','Passw0rd!!'); pg.click('#saGo'); pg.wait_for_selector('text=Welcome, Li')
    for n in ('LCC02-A','LCC595','LCC424'): pg.evaluate("n=>saCreateProject(saBlank(n), n)",n)
    pg.reload(); pg.wait_for_selector('#saList')
    ok('default is tiles', pg.locator('#saList .sa-grid').count()==1 and pg.locator('#saList .sa-proj').count()==3)
    pg.click('[data-sa=pview][data-v=list]'); pg.wait_for_timeout(200)
    ok('list view: one row per project', pg.locator('#saList .sa-prow:not(.hd)').count()==3 and pg.locator('#saList .sa-plist').count()==1)
    ok('list view keeps all actions', pg.locator('#saList .sa-prow:not(.hd)').first.locator('[data-sa=open],[data-sa=pinfo],[data-sa=share],[data-sa=rename],[data-sa=dup],[data-sa=del]').count()==6)
    ok('toggle shows pressed state', pg.get_attribute('[data-v=list]','aria-pressed')=='true' and pg.get_attribute('[data-v=tiles]','aria-pressed')=='false')
    pg.fill('#saQ','595'); pg.wait_for_timeout(200); ok('search filters list rows', pg.locator('#saList .sa-prow:not(.hd)').count()==1)
    pg.fill('#saQ',''); pg.wait_for_timeout(200)
    pg.screenshot(path='/tmp/shot_list.png',full_page=True)
    pg.reload(); pg.wait_for_selector('#saList'); ok('list choice is remembered', pg.locator('#saList .sa-prow:not(.hd)').count()==3)
    pg.locator('#saList .sa-prow:not(.hd) [data-sa=open]').first.click(); pg.wait_for_selector('.wrap',state='visible'); ok('open from list works', True)
    m=b.new_page(viewport={'width':390,'height':800}); m.context.add_cookies([]); 
    pg.evaluate("saGo('dashboard')"); pg.wait_for_selector('#saList')
    pg.set_viewport_size({'width':390,'height':800}); pg.wait_for_timeout(300)
    ok('phone: list has no horizontal scroll', pg.evaluate("document.documentElement.scrollWidth<=window.innerWidth"))
    pg.screenshot(path='/tmp/shot_list_m.png',full_page=True)
    pg.click('[data-sa=pview][data-v=tiles]'); pg.wait_for_timeout(200); ok('back to tiles', pg.locator('#saList .sa-proj').count()==3)
    b.close()
print('%d passed %d failed'%(sum(res),len(res)-sum(res))); sys.exit(0 if all(res) else 1)

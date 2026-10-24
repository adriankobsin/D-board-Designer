"""Save conflicts: a real version conflict can be resolved, and a project that cannot be saved (deleted behind our back)
never loops the dialog. Real Worker + front-end, TEST-ONLY Supabase mock."""
import json, sys, urllib.request
from playwright.sync_api import sync_playwright
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8799'; MOCK='http://127.0.0.1:54321'; res=[]
def ok(n,c,i=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+(' :: '+str(i)[:300] if not c and i else ''))
def post(path,body): return json.loads(urllib.request.urlopen(urllib.request.Request(MOCK+path,json.dumps(body).encode(),{'Content-Type':'application/json'})).read() or b'{}')
def rest(pg,method,pid,body=None):
    tok=pg.evaluate("SA.session.access_token")
    r=urllib.request.Request(MOCK+f'/rest/v1/projects?id=eq.{pid}',json.dumps(body).encode() if body else None,{'Authorization':'Bearer '+tok,'Content-Type':'application/json','apikey':'test-anon-key'},method=method); urllib.request.urlopen(r)
post('/__test/reset',{})
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1366,'height':820})
    pg.goto(BASE); pg.wait_for_selector('[data-m=register]'); pg.click('[data-m=register]')
    for k,v in dict(first_name='Cy',last_name='Test',email='cy@example.com',password='Passw0rd!!',password2='Passw0rd!!').items(): pg.fill('#'+k,v)
    pg.select_option('#country',index=9); pg.select_option('#occupation','Marine Electrician'); pg.check('#terms'); pg.click('#saGo'); pg.wait_for_selector('text=Check your email')
    post('/__test/confirm',{'email':'cy@example.com'})
    pg.goto(BASE); pg.wait_for_selector('#saForm'); pg.fill('#email','cy@example.com'); pg.fill('#password','Passw0rd!!'); pg.click('#saGo'); pg.wait_for_selector('text=Welcome, Cy')
    pg.click('[data-sa=new]'); pg.wait_for_selector('.wrap',state='visible'); pg.wait_for_timeout(1500); pid=pg.evaluate("SA.cloudId")
    # 1. genuine conflict: both buttons resolve it and the dialog goes away
    rest(pg,'PATCH',pid,{'name':'Edited elsewhere','data':{'x':1}}); pg.evaluate("S.name='Local 1'; refresh(true)"); pg.wait_for_selector('.sa-dlg',timeout=8000)
    ok('real conflict offers keep / load', pg.is_visible('[data-sa=keepmine]') and pg.is_visible('[data-sa=loadcloud]'))
    pg.click('[data-sa=keepmine]'); pg.wait_for_timeout(2500); ok('keep my version closes the dialog', not pg.is_visible('.sa-dlg'))
    rest(pg,'PATCH',pid,{'name':'Edited again','data':{'x':2}}); pg.evaluate("S.name='Local 2'; refresh(true)"); pg.wait_for_selector('.sa-dlg',timeout=8000)
    pg.click('[data-sa=loadcloud]'); pg.wait_for_timeout(2500); ok('load saved version closes the dialog', not pg.is_visible('.sa-dlg'))
    # 2. project deleted elsewhere: a different dialog, no loop, and a copy can be saved
    rest(pg,'DELETE',pid); pg.evaluate("S.name='Local 3'; refresh(true)"); pg.wait_for_selector('[data-sa=savecopy]',timeout=8000)
    ok('deleted project: cannot-save dialog (no keep/load)', not pg.is_visible('[data-sa=keepmine]'), pg.inner_text('.sa-dlg'))
    pg.wait_for_timeout(4000); ok('dialog does not multiply', pg.locator('.sa-dlg').count()==1)
    pg.click('[data-sa=savecopy]'); pg.wait_for_timeout(2500); ok('save a copy closes the dialog', not pg.is_visible('.sa-dlg'))
    newid=pg.evaluate("SA.cloudId"); ok('now working on a new saved copy', newid and newid!=pid)
    pg.evaluate("S.name='Local 4'; refresh(true)"); pg.wait_for_timeout(2500); ok('copy autosaves without a dialog', not pg.is_visible('.sa-dlg'))
    # 3. dashboard button leaves cleanly
    rest(pg,'DELETE',newid); pg.evaluate("S.name='Local 5'; refresh(true)"); pg.wait_for_selector('[data-sa=conflictdash]',timeout=8000)
    pg.click('[data-sa=conflictdash]'); pg.wait_for_selector('text=Welcome, Cy',timeout=8000); ok('dashboard button leaves cleanly', not pg.is_visible('.sa-dlg'))
    b.close()
print('%d passed %d failed'%(sum(res),len(res)-sum(res))); sys.exit(0 if all(res) else 1)

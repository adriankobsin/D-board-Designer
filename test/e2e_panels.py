"""Panel details (project, customer, location, status) and the dashboard filters, sorting and grouping.
Real Worker + front-end, TEST-ONLY Supabase mock."""
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
    # a panel gets its details inside the designer (Setup)
    pg.click('[data-sa=new]'); pg.wait_for_selector('.wrap',state='visible'); pg.wait_for_timeout(1000)
    pg.evaluate("tab='setup'; draw(); renderTabs()"); pg.wait_for_selector('[data-f=jobName]')
    ok('Setup has the project and customer card', pg.is_visible('[data-f=customer]') and pg.is_visible('[data-f=location]') and pg.is_visible('[data-f=status]'))
    pg.fill('[data-f=jobName]','M/Y Aurora'); pg.fill('[data-f=customer]','Blue Wave Ltd'); pg.fill('[data-f=location]','Engine room'); pg.fill('[data-f=jobRef]','J-1001'); pg.select_option('[data-f=status]','Installed'); pg.fill('[data-f=instDate]','2026-10-01')
    pg.evaluate("S.name='LCC02-A'; refresh(true)"); pg.wait_for_timeout(3000)
    # more panels, created through the same storage path as the app (name + meta)
    mk="""([n,j,c,l,s])=>{const d=saBlank(n); Object.assign(d,{jobName:j,customer:c,location:l,status:s}); return saCreateProject(d,n)}"""
    for r in (['LCC595','M/Y Aurora','Blue Wave Ltd','Bridge','Quoted'],['LCC424','Villa Sol','Sunrise Hotels','Pool plant','In build'],['LCC14','Villa Sol','Sunrise Hotels','Garage',''],['LCC13','','','','']): pg.evaluate(mk,r)
    pg.evaluate("saGo('dashboard')"); pg.wait_for_selector('#saList .sa-proj'); 
    ok('five panels listed with the count', pg.locator('#saList .sa-proj').count()==5 and 'Showing 5 of 5' in pg.inner_text('#saCount'), pg.inner_text('#saCount'))
    ok('the panel edited in Setup shows its project, customer and location on the dashboard', 'Blue Wave Ltd' in pg.inner_text('#saList') and 'Engine room' in pg.inner_text('#saList') and 'Installed' in pg.inner_text('#saList'))
    pg.select_option('#saFCust','Sunrise Hotels'); pg.wait_for_timeout(200); ok('filter by customer', pg.locator('#saList .sa-proj').count()==2 and 'Showing 2 of 5' in pg.inner_text('#saCount'))
    pg.select_option('#saFStatus','In build'); pg.wait_for_timeout(200); ok('filters combine', pg.locator('#saList .sa-proj').count()==1 and 'LCC424' in pg.inner_text('#saList'))
    pg.click('#saClear'); pg.wait_for_selector('#saList .sa-proj'); ok('clear filters restores everything', pg.locator('#saList .sa-proj').count()==5)
    pg.fill('#saQ','pool'); pg.wait_for_timeout(200); ok('search covers location', pg.locator('#saList .sa-proj').count()==1)
    pg.fill('#saQ','j-1001'); pg.wait_for_timeout(200); ok('search covers job reference', pg.locator('#saList .sa-proj').count()==1 and 'LCC02-A' in pg.inner_text('#saList'))
    pg.fill('#saQ',''); pg.wait_for_timeout(200)
    pg.select_option('#saGroup','job'); pg.wait_for_timeout(200)
    heads=pg.eval_on_selector_all('.sa-grp > h3','e=>e.map(x=>x.textContent.trim())'); ok('group by project: one section each, unassigned last', len(heads)==3 and heads[-1].startswith('Unassigned'), heads)
    pg.select_option('#saSort','name'); pg.select_option('#saGroup','none'); pg.wait_for_timeout(200)
    names=pg.eval_on_selector_all('#saList .sa-proj h3','e=>e.map(x=>x.childNodes[0].textContent.trim())'); ok('sort by name', names==sorted(names,key=str.lower), names)
    pg.click('[data-sa=pview][data-v=list]'); pg.wait_for_timeout(200)
    ok('list view has column headings and all columns', pg.locator('#saList .sa-prow.hd').count()==1 and pg.locator('#saList .sa-prow:not(.hd)').count()==5)
    # edit details from the dashboard
    row=pg.locator('#saList .sa-prow:not(.hd)',has_text='LCC13'); row.locator('[data-sa=pinfo]').click(); pg.wait_for_selector('#pi_customer')
    pg.fill('#pi_jobName','Harbour Yard'); pg.fill('#pi_customer','Delta Marine'); pg.fill('#pi_location','Quay 4'); pg.select_option('#pi_status','Approved'); pg.click('[data-sa=pinfosave]'); pg.wait_for_selector('#saList .sa-prow:not(.hd)')
    pg.wait_for_timeout(500); ok('details edited from the dashboard are shown', 'Delta Marine' in pg.inner_text('#saList') and 'Quay 4' in pg.inner_text('#saList'))
    pg.select_option('#saFCust','Delta Marine'); pg.wait_for_timeout(200); pg.locator('#saList .sa-prow:not(.hd) [data-sa=open]').first.click(); pg.wait_for_selector('.wrap',state='visible'); pg.wait_for_timeout(500)
    ok('details travel with the panel when it is opened', pg.evaluate("S.customer")=='Delta Marine' and pg.evaluate("S.status")=='Approved')
    ok('no script errors', not errs, errs)
    # phone
    pg.evaluate("saGo('dashboard')"); pg.wait_for_selector('#saList'); pg.set_viewport_size({'width':390,'height':800}); pg.wait_for_timeout(300)
    ok('phone: no horizontal scroll with filters and list', pg.evaluate("document.documentElement.scrollWidth<=window.innerWidth"))
    pg.screenshot(path='/tmp/shot_panels_m.png',full_page=True); pg.set_viewport_size({'width':1366,'height':900}); pg.click('#saClear') if pg.is_visible('#saClear') else None; pg.wait_for_timeout(300); pg.screenshot(path='/tmp/shot_panels.png',full_page=True)
    b.close()
print('%d passed %d failed'%(sum(res),len(res)-sum(res))); sys.exit(0 if all(res) else 1)

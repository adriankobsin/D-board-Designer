"""Plans: demo limits, admin controls, Stripe webhook. Real Worker + front-end, TEST-ONLY Supabase mock.
Needs the Worker started with STRIPE_WEBHOOK_SECRET=whsec_test."""
import json, sys, time, hmac, hashlib, urllib.request, urllib.error
from playwright.sync_api import sync_playwright
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8799'; MOCK='http://127.0.0.1:54321'; res=[]; SECRET='whsec_test'
def ok(n,c,i=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+(' :: '+str(i)[:300] if not c and i else ''))
def post(path,body): return json.loads(urllib.request.urlopen(urllib.request.Request(MOCK+path,json.dumps(body).encode(),{'Content-Type':'application/json'})).read() or b'{}')
def hook(payload, sig=True, secret=SECRET, age=0):
    raw=json.dumps(payload); t=int(time.time())-age; h={'Content-Type':'application/json'}
    if sig: h['Stripe-Signature']='t=%d,v1=%s'%(t,hmac.new(secret.encode(),f'{t}.{raw}'.encode(),hashlib.sha256).hexdigest())
    try: r=urllib.request.urlopen(urllib.request.Request(BASE+'/api/stripe/webhook',raw.encode(),h)); return r.status
    except urllib.error.HTTPError as e: return e.code
post('/__test/reset',{})
def register(pg,email,first):
    pg.goto(BASE); pg.wait_for_selector('[data-m=register]'); pg.click('[data-m=register]')
    for k,v in dict(first_name=first,last_name='T',email=email,password='Passw0rd!!',password2='Passw0rd!!').items(): pg.fill('#'+k,v)
    pg.select_option('#country',index=9); pg.select_option('#occupation','Electrician'); pg.check('#terms'); pg.click('#saGo'); pg.wait_for_selector('text=Check your email')
    post('/__test/confirm',{'email':email})
def login(pg,email,first):
    pg.goto(BASE); pg.wait_for_selector('#saForm'); pg.fill('#email',email); pg.fill('#password','Passw0rd!!'); pg.click('#saGo'); pg.wait_for_selector('text=Welcome, '+first)
with sync_playwright() as p:
    b=p.chromium.launch(); errs=[]
    adm=b.new_context(viewport={'width':1366,'height':900}).new_page(); adm.on('pageerror',lambda e:errs.append(str(e)))
    register(adm,'admin@example.com','Ada'); post('/__test/make_admin',{'email':'admin@example.com'}); login(adm,'admin@example.com','Ada')
    usr=b.new_context(viewport={'width':1366,'height':900}).new_page(); usr.on('pageerror',lambda e:errs.append(str(e)))
    register(usr,'demo@example.com','Dan'); login(usr,'demo@example.com','Dan')
    # limits are OFF by default: a new (demo-plan) account behaves as before
    usr.click('[data-sa=new]'); usr.wait_for_selector('.wrap',state='visible'); usr.wait_for_timeout(700); usr.evaluate("saGo('dashboard')"); usr.wait_for_selector('#saList')
    usr.evaluate("saCreateProject(saBlank('Second'),'Second')"); usr.wait_for_timeout(500)
    ok('limits off: a new account can hold several projects', usr.evaluate("SA.projects.length")>=1 and usr.evaluate("(async()=>{await saListProjects(); return SA.projects.length})()")==2)
    # admin screen
    adm.evaluate("SA.adminTab='users'; saGo('admin')"); adm.wait_for_selector('#plMode')
    ok('admin sees plan limits and payments cards', adm.is_visible('#plMode') and adm.is_visible('#payLink') and adm.is_visible('[data-sa=paysave]'))
    ok('users table shows each user\'s plan', adm.locator('[data-sa=uplan]').count()>=1)
    adm.select_option('#plMode','on'); adm.once('dialog',lambda d:d.accept()); adm.click('[data-sa=plsave]'); adm.wait_for_timeout(600)
    ok('admin turned limits on', 'ON' in adm.inner_text('#saAdm').upper() and adm.input_value('#plMode')=='on', adm.inner_text('#saAdm')[:200])
    # demo user is limited
    usr.reload(); usr.wait_for_selector('text=Welcome, Dan'); usr.wait_for_timeout(500)
    ok('demo flag set for the demo user', usr.evaluate("DEMO===true && saFull()===false"))
    usr.evaluate("saCreateProject(saBlank('Third'),'Third').catch(()=>{})"); usr.wait_for_selector('#saModal'); 
    ok('a second project shows the upgrade note', 'full plan' in usr.inner_text('#saModal')); usr.click('#saModal [data-sa=pinfox]')
    usr.evaluate("saGo('import')"); usr.wait_for_timeout(400); ok('import is blocked with an upgrade note', 'full plan' in usr.inner_text('#saas'))
    usr.evaluate("saGo('community')"); usr.wait_for_timeout(800); ok('community shows the read-only note', 'part of the full plan' in usr.inner_text('#saas'))
    # export gating in the designer
    usr.evaluate("saGo('dashboard')"); usr.wait_for_selector('#saList .sa-proj'); usr.evaluate("saOpenProject(SA.projects[0].id)"); usr.wait_for_selector('.wrap',state='visible'); usr.wait_for_timeout(600)
    usr.evaluate("tab='export'; draw(); renderTabs()")
    usr.evaluate("exportXLSX()"); usr.wait_for_selector('#saModal'); ok('Excel export blocked', 'full plan' in usr.inner_text('#saModal')); usr.evaluate("saModalClose()")
    usr.evaluate("exportCSV()"); ok('CSV export blocked', usr.is_visible('#saModal')); usr.evaluate("saModalClose()")
    usr.evaluate("exportJSON()"); ok('project file export blocked', usr.is_visible('#saModal')); usr.evaluate("saModalClose()")
    ok('export tab explains the demo limits', 'Demo plan: only the PDF export' in usr.inner_text('.wrap'))
    with usr.expect_download(timeout=15000) as dl: usr.evaluate("exportPDF()")
    ok('PDF export still works', dl.value.suggested_filename.endswith('.pdf')); dl.value.save_as('/tmp/demo.pdf')
    # admin grants free access
    uid=post('/__test/user',{'email':'demo@example.com'}).get('id') if False else usr.evaluate("SA.user.id")
    adm.evaluate("saRender()"); adm.wait_for_selector('[data-sa=uplan]')
    adm.locator('[data-sa=uplan][data-id="%s"]'%uid).click(); adm.select_option('#upPlan','free'); adm.fill('#upNote','Friend'); adm.click('[data-sa=uplansave]'); adm.wait_for_timeout(700)
    usr.reload(); usr.wait_for_selector('text=Welcome, Dan'); usr.wait_for_timeout(500)
    ok('free access gives full access again', usr.evaluate("DEMO===false && saFull()===true"))
    adm.locator('[data-sa=uplan][data-id="%s"]'%uid).click(); adm.select_option('#upPlan','demo'); adm.click('[data-sa=uplansave]'); adm.wait_for_timeout(700)
    # payments: admin saves a link, demo user sees Upgrade
    adm.fill('#payLink','https://buy.stripe.com/test_123'); adm.fill('#payPrice','USD 9.99 / month'); adm.check('#payOn'); adm.click('[data-sa=paysave]'); adm.wait_for_timeout(700)
    ok('admin payments saved', adm.input_value('#payLink')=='https://buy.stripe.com/test_123' and adm.is_checked('#payOn'))
    usr.reload(); usr.wait_for_selector('text=Welcome, Dan'); usr.wait_for_timeout(500)
    ok('pay link carries the user id', usr.evaluate("saPayUrl()").startswith('https://buy.stripe.com/test_123') and uid in usr.evaluate("saPayUrl()"))
    usr.evaluate("saUpgrade('Test')"); ok('upgrade note has an Upgrade button and the price', usr.is_visible('#saModal [data-sa=payopen]') and 'USD 9.99' in usr.inner_text('#saModal'))
    usr.evaluate("saModalClose()")
    # stripe webhook
    ev={'id':'evt_1','type':'checkout.session.completed','data':{'object':{'client_reference_id':uid,'customer':'cus_1','subscription':'sub_1','mode':'subscription','payment_status':'paid'}}}
    ok('webhook rejects a missing signature', hook(ev,sig=False)==400)
    ok('webhook rejects a wrong secret', hook(ev,secret='nope')==400)
    ok('webhook rejects an old timestamp', hook(ev,age=3600)==400)
    ok('webhook accepts a signed payment', hook(ev)==200)
    usr.reload(); usr.wait_for_selector('text=Welcome, Dan'); usr.wait_for_timeout(500)
    ok('payment makes the user Paid with full access', usr.evaluate("SA.profile.plan")=='paid' and usr.evaluate("saFull()")==True, usr.evaluate("SA.profile.plan"))
    ok('subscription cancelled returns to demo', hook({'id':'evt_2','type':'customer.subscription.deleted','data':{'object':{'id':'sub_1','customer':'cus_1','status':'canceled'}}})==200)
    usr.reload(); usr.wait_for_selector('text=Welcome, Dan'); usr.wait_for_timeout(500); ok('cancelled user is demo again', usr.evaluate("SA.profile.plan")=='demo' and usr.evaluate("DEMO")==True)
    # start date in the future does not limit; in the past does
    adm.evaluate("saApi('/api/admin/settings',{method:'POST',body:JSON.stringify({plans_enforced:false,plans_start_at:'2999-01-01'})})"); adm.wait_for_timeout(400)
    usr.reload(); usr.wait_for_selector('text=Welcome, Dan'); usr.wait_for_timeout(500); ok('a future start date does not limit yet', usr.evaluate("saFull()")==True)
    adm.evaluate("saApi('/api/admin/settings',{method:'POST',body:JSON.stringify({plans_start_at:'2020-01-01'})})"); adm.wait_for_timeout(400)
    usr.reload(); usr.wait_for_selector('text=Welcome, Dan'); usr.wait_for_timeout(500); ok('a past start date limits', usr.evaluate("saFull()")==False)
    # a plain user cannot use admin endpoints or change own plan
    r=usr.evaluate("fetch('/api/admin/settings',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+SA.session.access_token},body:'{\"plans_enforced\":false}'}).then(r=>r.status)")
    ok('non-admin cannot change settings', r in (401,403), r)
    ok('no page errors', not errs, errs); b.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)

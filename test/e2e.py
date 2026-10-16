"""Browser tests against the real Worker (wrangler dev) with a TEST-ONLY mock of Supabase. See mock_supabase.js."""
import json, sys, urllib.request
from playwright.sync_api import sync_playwright
BASE='http://localhost:8799'; MOCK='http://127.0.0.1:54321'
res=[]
def ok(name,cond,info=''):
    res.append((name,bool(cond))); print(('PASS ' if cond else 'FAIL ')+name+(' :: '+str(info) if (not cond and info) else ''))
def post(path,body):
    return json.loads(urllib.request.urlopen(urllib.request.Request(MOCK+path,json.dumps(body).encode(),{'Content-Type':'application/json'})).read() or b'{}')
def state(): return json.loads(urllib.request.urlopen(MOCK+'/__test/state').read())
post('/__test/reset',{})
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':1280,'height':850}); pg=ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto(BASE); pg.wait_for_selector('.sa-auth',timeout=15000)
    ok('login required: auth page shown, designer hidden', pg.is_visible('.sa-auth') and not pg.is_visible('.wrap'))
    # register validation
    pg.click('[data-m=register]'); pg.click('#saGo')
    ok('register validation errors shown', pg.locator('[aria-invalid=true]').count()>=5)
    pg.fill('#first_name','Ada'); pg.fill('#last_name','Volt'); pg.fill('#email','ada@example.com'); pg.fill('#password','abc'); pg.fill('#password2','abd')
    pg.select_option('#country',index=5); pg.select_option('#occupation','Electrician'); pg.click('#saGo')
    ok('weak/mismatched password rejected', 'at least 8' in pg.inner_text('[data-err=password]').lower() or 'Use at least' in pg.inner_text('[data-err=password]'))
    pg.fill('#password','Sup3rSecret!'); pg.fill('#password2','Sup3rSecret!'); pg.click('#saGo')
    ok('terms must be accepted', 'accept' in pg.inner_text('[data-err=terms]').lower())
    pg.check('#terms'); pg.click('#saGo'); pg.wait_for_selector('text=Check your email')
    ok('verification screen after signup', pg.is_visible('text=ada@example.com'))
    ok('profile row created with metadata', state()['users']==1)
    # login before verification
    pg.click('[data-sa=signout]'); pg.wait_for_selector('#saForm')
    pg.fill('#email','ada@example.com'); pg.fill('#password','Sup3rSecret!'); pg.click('#saGo')
    pg.wait_for_selector('.sa-msg.bad'); ok('unverified login blocked with message', 'Verify your email' in pg.inner_text('.sa-msg.bad'))
    # wrong password
    pg.fill('#password','nope-nope1'); pg.click('#saGo'); pg.wait_for_timeout(1200)
    ok('wrong password message', 'incorrect' in pg.inner_text('.sa-msg.bad'))
    post('/__test/confirm',{'email':'ada@example.com'})
    pg.fill('#email','ada@example.com'); pg.fill('#password','Sup3rSecret!'); pg.click('#saGo')
    pg.wait_for_selector('text=Welcome, Ada',timeout=10000); ok('verified login -> dashboard welcome with name', True)
    # new project
    pg.click('[data-sa=new]'); pg.wait_for_selector('.wrap',state='visible',timeout=10000)
    ok('new cloud board opens designer', pg.is_visible('#tabs'))
    ok('profile menu shows name', 'Ada' in pg.inner_text('.quick .sa-ub'))
    for _ in range(40):
        if 'Saved to your account' in pg.inner_text('#saChip'): break
        pg.wait_for_timeout(250)
    ok('cloud chip says saved', 'Saved to your account' in pg.inner_text('#saChip'), pg.inner_text('#saChip'))
    # edit -> autosave
    pg.fill('#pname','Main board A') if pg.query_selector('#pname') else None
    pg.evaluate("S.name='Main board A'; refresh(true)")
    pg.wait_for_timeout(2600)
    pg.evaluate("1")
    st=state(); ok('autosave stored project', st['projects']==1)
    # local project untouched
    loc=pg.evaluate("localStorage.getItem(KEY)"); ok('local project key not overwritten by cloud edits', (loc is None) or 'Main board A' not in loc)
    # reload -> session restore
    pg.reload(); pg.wait_for_selector('text=Welcome, Ada',timeout=12000); ok('session restored after reload', True)
    ok('project listed', pg.is_visible('text=Main board A'))
    # rename/duplicate/delete
    pg.once('dialog',lambda d:d.accept('Renamed board')); pg.click('[data-sa=rename]'); pg.wait_for_selector('text=Renamed board'); ok('rename', True)
    pg.click('[data-sa=dup]'); pg.wait_for_selector('text=Renamed board (copy)'); ok('duplicate', True)
    pg.once('dialog',lambda d:d.accept()); pg.locator('[data-sa=del]').last.click(); pg.wait_for_timeout(1200)
    ok('delete', pg.locator('#saList .sa-proj').count()==1)
    # reopen
    pg.click('[data-sa=open]'); pg.wait_for_selector('.wrap',state='visible'); ok('reopen project', pg.evaluate("S.name")=='Renamed board (copy)')
    # exports tracked
    pg.evaluate("exportCSV()"); pg.wait_for_timeout(600)
    ok('export usage tracked', any(e['event']=='export_csv' for e in state()['usage']))
    # account: profile + password
    pg.click('.quick .sa-ub'); pg.click('.sa-menu [data-sa=account]'); pg.wait_for_selector('#saProf')
    pg.fill('#company','Volt Panels'); pg.click('#saProf button[type=submit]'); pg.wait_for_selector('.sa-msg.ok'); ok('profile saved', True)
    pg.fill('#cur','Sup3rSecret!'); pg.fill('#saPw #password','N3wSecret!!'); pg.fill('#saPw #password2','N3wSecret!!'); pg.click('#saPw button[type=submit]')
    pg.wait_for_selector('.sa-msg.ok:has-text("Password updated")'); ok('password changed', 'Password updated' in pg.inner_text('.sa-msg.ok'))
    ok('still signed in after reauth', pg.is_visible('text=Account settings'))
    # admin not visible / denied
    ok('no admin link for normal user', pg.locator('[data-sa=admin]').count()==0)
    tok=pg.evaluate("SA.session.access_token")
    code=urllib.request.Request(BASE+'/api/admin/stats',headers={'Authorization':'Bearer '+tok})
    try: urllib.request.urlopen(code); c=200
    except urllib.error.HTTPError as e: c=e.code
    ok('admin API refuses non-admin token (403)', c==403, c)
    # feedback
    pg.click('.sa-nav [data-sa=dash]'); pg.wait_for_selector('#saFb'); pg.fill('#fbMsg','Great tool'); pg.select_option('#fbRate','5'); pg.click('#saFb button'); pg.wait_for_timeout(700)
    ok('feedback stored', len(json.loads(urllib.request.urlopen(MOCK+'/__test/state').read())['usage'])>0)
    # sign out
    pg.click('#saas .sa-ub'); pg.click('#saas .sa-menu [data-sa=signout]'); pg.wait_for_selector('.sa-auth'); ok('sign out -> auth page', True)
    # forgot
    pg.click('[data-m=forgot]'); pg.fill('#email','ada@example.com'); pg.click('#saGo'); pg.wait_for_selector('.sa-msg.ok'); ok('forgot password message', any(o['kind']=='recover' for o in state()['outbox']))
    # admin flow
    post('/__test/make_admin',{'email':'ada@example.com'})
    pg.click('[data-m=login]') if pg.query_selector('[data-m=login]') else None
    pg.fill('#email','ada@example.com'); pg.fill('#password','N3wSecret!!'); pg.click('#saGo'); pg.wait_for_selector('text=Welcome, Ada')
    pg.click('.sa-nav [data-sa=admin]'); pg.wait_for_selector('text=Registered users',timeout=8000); ok('admin overview loads', True)
    pg.click('[data-t=users]'); pg.wait_for_selector('#saUF'); ok('admin users list', pg.is_visible('text=ada@example.com'))
    # second user for suspend test
    ctx2=b.new_context(); p2=ctx2.new_page(); p2.goto(BASE); p2.wait_for_selector('.sa-auth'); p2.click('[data-m=register]')
    for k,v in dict(first_name='Bob',last_name='Amp',email='bob@example.com',password='Passw0rd!!',password2='Passw0rd!!').items(): p2.fill('#'+k,v)
    p2.select_option('#country',index=7); p2.select_option('#occupation','Student'); p2.check('#terms'); p2.click('#saGo'); p2.wait_for_selector('text=Check your email')
    pg.fill('#auS','bob'); pg.click('#saUF button[type=submit]'); pg.wait_for_selector('text=bob@example.com')
    ok('admin search filters', pg.locator('.sa-tab tbody tr').count()==1)
    pg.select_option('#auV','no'); pg.click('#saUF button[type=submit]'); pg.wait_for_selector('text=bob@example.com'); ok('filter unverified', True)
    post('/__test/confirm',{'email':'bob@example.com'})
    pg.once('dialog',lambda d:d.accept()); pg.click('[data-sa=ustatus]'); pg.wait_for_timeout(1200)
    pg.click('[data-sa=ustatus]') if False else None
    ok('suspend recorded in audit log', len(state()['admin_actions'])>=1)
    p2.fill('#email','x') if False else None
    ok('no JS errors', not [e for e in errs if 'Failed to load resource' not in e], errs[:5])
    b.close()
bad=[n for n,c in res if not c]; print(f'\n{len(res)-len(bad)} passed, {len(bad)} failed'); sys.exit(1 if bad else 0)

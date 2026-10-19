"""Email-confirmation landing page (/confirmed). Real Worker + front-end, TEST-ONLY Supabase mock. The mock issues the same
tokens Supabase puts in the confirmation link, so this proves the page logic, not real email delivery or Supabase redirect settings."""
import json, sys, urllib.request
from playwright.sync_api import sync_playwright
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8799'; MOCK='http://127.0.0.1:54321'; res=[]
def ok(n,c,i=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+(' :: '+str(i)[:300] if not c and i else ''))
def post(path,body,h=None):
    hd={'Content-Type':'application/json','apikey':'test-anon-key'}; hd.update(h or {})
    return json.loads(urllib.request.urlopen(urllib.request.Request(MOCK+path,json.dumps(body).encode(),hd)).read() or b'{}')
post('/__test/reset',{})
post('/auth/v1/signup',{'email':'grace@example.com','password':'Sup3rSecret!','data':{'first_name':'Grace','last_name':'Hopper'}})
post('/__test/confirm',{'email':'grace@example.com'})
tok=post('/auth/v1/token?grant_type=password',{'email':'grace@example.com','password':'Sup3rSecret!'})
link=BASE+'/confirmed#access_token=%s&refresh_token=%s&expires_in=3600&token_type=bearer&type=signup'%(tok['access_token'],tok['refresh_token'])
with sync_playwright() as p:
    b=p.chromium.launch(); errs=[]
    ctx=b.new_context(viewport={'width':1280,'height':850}); pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' and 'fonts.g' not in m.text and 'ERR_' not in m.text else None)
    pg.goto(link); pg.wait_for_selector('.sa-auth h2',timeout=15000); pg.wait_for_timeout(800)
    ok('confirmation page shows "Email confirmed"', pg.inner_text('.sa-box h2').strip()=='Email confirmed', pg.inner_text('.sa-box h2'))
    ok('email is prefilled', pg.input_value('#email')=='grace@example.com')
    ok('not signed in automatically (no dashboard)', not pg.is_visible('text=Welcome, Grace'))
    ok('app assets loaded from /confirmed (no script errors)', not [e for e in errs if 'Unexpected token' in e or 'supabase' in e.lower()], errs)
    pg.fill('#password','wrong-pass1'); pg.click('#saGo'); pg.wait_for_selector('.sa-msg.bad',timeout=8000)
    ok('wrong password still rejected from this page', 'incorrect' in pg.inner_text('.sa-msg.bad'))
    pg.fill('#password','Sup3rSecret!'); pg.click('#saGo'); pg.wait_for_timeout(3000); print('DBG',pg.evaluate('location.pathname'),pg.inner_text('body')[:300].replace(chr(10),' | ')); pg.wait_for_selector('text=Welcome, Grace',timeout=10000)
    ok('sign in from the confirmation page -> dashboard', True)
    ok('address bar returns to /', pg.evaluate('location.pathname')=='/', pg.evaluate('location.pathname'))
    ctx2=b.new_context(); pg2=ctx2.new_page()
    pg2.goto(BASE+'/confirmed#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'); pg2.wait_for_selector('.sa-msg.bad',timeout=15000)
    ok('expired link: clear message and sign-in form', 'confirmation link' in pg2.inner_text('.sa-msg.bad') and pg2.is_visible('#password'), pg2.inner_text('.sa-msg.bad'))
    ctx3=b.new_context(); pg3=ctx3.new_page(); pg3.goto(BASE+'/confirmed'); pg3.wait_for_selector('#password',timeout=15000)
    ok('opening /confirmed again shows plain sign-in', pg3.is_visible('#email'))
    ctx4=b.new_context(); pg4=ctx4.new_page(); pg4.add_init_script("try{localStorage.setItem('dbd_lang','de')}catch(e){}"); pg4.goto(link); pg4.wait_for_selector('.sa-auth h2',timeout=15000); pg4.wait_for_timeout(800)
    ok('confirmation page translates (de)', pg4.inner_text('.sa-box h2').strip()=='E-Mail bestätigt', pg4.inner_text('.sa-box h2'))
    b.close()
print('%d passed %d failed'%(sum(res),len(res)-sum(res))); sys.exit(0 if all(res) else 1)

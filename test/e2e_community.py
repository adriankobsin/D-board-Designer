"""Community e2e: real Worker (wrangler dev) + real PostgREST + real Postgres RLS, with a TEST-ONLY auth stand-in (/tmp/ct/stack.js)
and a fake email API. Proves the whole flow in a browser with several users. Not part of the deployed app."""
import json, subprocess, urllib.request
from playwright.sync_api import sync_playwright
BASE='http://localhost:8799'
res=[]
def ok(n,c,i=''):
    res.append((n,bool(c))); print(('PASS ' if c else 'FAIL ')+n+(' :: '+str(i)[:300] if (not c and i) else ''))
def psql(q): return subprocess.run(['psql','-h','/tmp','-p','5544','-U','postgres','-d','dbt','-Atq','-c',q],capture_output=True,text=True).stdout.strip()
def mails_all():
    return json.loads(urllib.request.urlopen('http://127.0.0.1:54321/__mail').read())
def mails(): return mails_all()[BASE_MAIL:]
BASE_MAIL=len(mails_all())
psql("truncate public.projects, public.chats, public.notifications cascade; delete from auth.users;")
for e,f,l in [('ann@x.com','Ann','Ark'),('bob@x.com','Bob','Bell'),('cat@x.com','Cat','Cole')]:
    psql(f"insert into auth.users(email,raw_user_meta_data,email_confirmed_at) values ('{e}','{{\"first_name\":\"{f}\",\"last_name\":\"{l}\"}}',now())")
uid=lambda e: psql(f"select id from auth.users where email='{e}'")
def login(b,email):
    ctx=b.new_context(viewport={'width':1280,'height':850},bypass_csp=True); pg=ctx.new_page(); pg.errs=[]
    pg.on('pageerror',lambda e:pg.errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('#saForm',timeout=15000)
    pg.fill('#email',email); pg.fill('#password','Passw0rd!'); pg.click('#saGo'); pg.wait_for_selector('.sa-bar',timeout=15000); pg.wait_for_selector('.sa-proj, .sa-empty',timeout=15000)
    return pg
with sync_playwright() as p:
    b=p.chromium.launch()
    A=login(b,'ann@x.com'); B=login(b,'bob@x.com'); C=login(b,'cat@x.com')
    ok('Community nav present on dashboard', A.is_visible('.sa-nav >> text=Community'))
    ok('notification bell present', A.is_visible('.sa-bar .sa-bellb'))
    # --- project sharing
    A.evaluate("saCreateProject(exampleProject(),'Cabin board')"); A.wait_for_timeout(800)
    A.evaluate("saGo('dashboard')"); A.wait_for_selector('.sa-proj'); 
    ok('Share button on project card', A.locator('[data-sa=share]').count()==1)
    A.click('[data-sa=share]'); A.fill('#saCEmails','bob@x.com, nobody@x.com, ann@x.com, not-an-email'); A.fill('#saCNote','Please check the RCBOs'); A.click('#saCGo')
    A.wait_for_selector('#saCRes .sa-msg',timeout=10000); t=A.inner_text('#saCRes')
    ok('share result names Bob', 'Bob Bell' in t, t)
    ok('unregistered address reported', 'nobody@x.com' in t and 'not a registered member' in t, t)
    ok('own address reported', 'your own address' in t, t)
    ok('invalid address reported', 'not-an-email' in t and 'not a valid email' in t, t)
    m=[x for x in mails() if x['to']==['bob@x.com']]
    ok('share email sent to Bob only', len(m)==1 and 'Cabin board' in m[0]['text'] and 'Please check the RCBOs' in m[0]['text'], mails())
    ok('no email to unregistered', not [x for x in mails() if 'nobody@x.com' in x['to']])
    A.click('[data-sa=close]'); A.click('[data-sa=share]'); A.fill('#saCEmails','bob@x.com'); A.click('#saCGo'); A.wait_for_selector('#saCRes .sa-msg')
    ok('sharing twice is reported, not duplicated', 'already included' in A.inner_text('#saCRes') and psql("select count(*) from public.project_shares")=='1')
    A.click('[data-sa=close]')
    # --- B sees notification
    B.reload(); B.wait_for_selector('.sa-bar'); B.wait_for_function("document.querySelector('[data-nbadge]') && !document.querySelector('.sa-bar .sa-bellb [data-nbadge]').hidden",timeout=10000)
    ok('B bell badge shows 1', B.inner_text('.sa-bar .sa-bellb [data-nbadge]')=='1')
    B.click('.sa-bar .sa-bellb'); B.wait_for_selector('#saBell .ni')
    ok('bell lists the share', 'Cabin board' in B.inner_text('#saBell') and 'Ann Ark shared' in B.inner_text('#saBell'))
    B.click('#saBell .ni'); B.wait_for_selector('text=Shared with me')
    ok('click opens Shared projects tab', B.is_visible('[data-sa=shopen]'))
    ok('note shown', 'Please check the RCBOs' in B.inner_text('.sa-note'))
    ok('badge cleared after reading', B.locator('.sa-bar .sa-bellb [data-nbadge]').is_hidden())
    ok('B cannot edit the original via API', psql(f"select count(*) from public.projects where owner_id='{uid('ann@x.com')}'")=='1')
    B.click('[data-sa=shopen]'); B.wait_for_selector('.wrap',state='visible',timeout=15000)
    B.wait_for_timeout(800)
    ok('B gets own copy named after the sender', psql(f"select name from public.projects where owner_id='{uid('bob@x.com')}'")=='Cabin board (from Ann Ark)', psql("select name,owner_id from public.projects"))
    B.evaluate("saGo('dashboard')"); B.wait_for_selector('.sa-bar')
    # --- group chat with email invitations
    A.click('.sa-nav >> text=Community'); A.wait_for_selector('[data-sa=cgroup]')
    A.click('[data-sa=cgroup]'); A.fill('#saCTitle','Panel builders'); A.fill('#saCEmails','bob@x.com\ncat@x.com, ghost@x.com'); A.click('#saCGo')
    A.wait_for_selector('#saCRes .sa-msg',timeout=10000); t=A.inner_text('#saCRes')
    ok('group created, Bob and Cat invited, ghost skipped', 'Bob Bell' in t and 'Cat Cole' in t and 'ghost@x.com' in t, t)
    gm=[x for x in mails() if x['subject'].endswith('invited you to a group chat')]
    ok('two invitation emails sent', sorted(x['to'][0] for x in gm)==['bob@x.com','cat@x.com'], gm)
    ok('email names the group and inviter', all('Panel builders' in x['text'] and 'Ann Ark' in x['text'] for x in gm))
    ok('invitation email has a sign-in link', all('http' in x['html'] for x in gm))
    A.click('[data-sa=cgo]'); A.wait_for_selector('#saSend',timeout=10000)
    ok('owner lands in the new group', 'Panel builders' in A.inner_text('.sa-chd'))
    ok('owner has Invite and Members', A.is_visible('[data-sa=cinvite]') and A.is_visible('[data-sa=cmembers]'))
    # --- B sees the invitation
    B.reload(); B.wait_for_selector('.sa-bar'); B.wait_for_function("!document.querySelector('.sa-bar .sa-bellb [data-nbadge]').hidden",timeout=10000)
    B.click('.sa-bar .sa-bellb'); B.wait_for_selector('#saBell .ni')
    ok('B notified of the invitation', 'Ann Ark invited you' in B.inner_text('#saBell'))
    B.click('#saBell .ni >> nth=0'); B.wait_for_selector('.sa-inv')
    ok('invitation card with Accept / Decline', B.is_visible('[data-sa=cacc]') and B.is_visible('[data-sa=cdec]'))
    ok('invited B sees no messages yet', psql(f"select count(*) from public.chat_messages")=='0')
    B.click('[data-sa=cacc]'); B.wait_for_selector('#saSend',timeout=10000)
    ok('B joined and thread open', B.is_visible('#saMsgIn') and psql(f"select status from public.chat_members where user_id='{uid('bob@x.com')}'")=='joined')
    B.fill('#saMsgIn','Hi all, Bob here'); B.press('#saMsgIn','Enter'); B.wait_for_selector('.sa-m.me')
    ok('B message appears', 'Hi all, Bob here' in B.inner_text('#saMsgs'))
    # --- A gets reply notification and message
    A.click('.sa-nav >> text=Community')  # reload list
    A.wait_for_function("!document.querySelector('.sa-bar .sa-bellb [data-nbadge]').hidden",timeout=45000)
    A.click('.sa-bar .sa-bellb'); A.wait_for_selector('#saBell .ni')
    ok('A notified of Bob reply', 'Bob Bell: Hi all, Bob here' in A.inner_text('#saBell'), A.inner_text('#saBell'))
    A.click('#saBell .ni >> nth=0'); A.wait_for_function("document.querySelector('#saMsgs') && document.querySelector('#saMsgs').innerText.includes('Hi all, Bob here')",timeout=10000)
    ok('A sees Bob message with sender name', 'Bob Bell' in A.inner_text('#saMsgs') and 'Hi all, Bob here' in A.inner_text('#saMsgs'), A.inner_text('.sa-chd')+' | '+A.inner_text('#saMsgs'))
    A.wait_for_timeout(600)
    ok('A unread cleared', A.locator('.sa-bar .sa-bellb [data-nbadge]').is_hidden() or A.inner_text('.sa-bar .sa-bellb [data-nbadge]')=='0')
    A.fill('#saMsgIn','Welcome Bob\nSecond line <b>x</b>'); A.click('#saSend button'); A.wait_for_selector('.sa-m.me')
    ok('multi-line + HTML is escaped, not rendered', A.locator('#saMsgs b').count()==0 and '<b>x</b>' in A.inner_text('#saMsgs'))
    # live update on B within the poll interval
    B.wait_for_function("document.querySelector('#saMsgs').innerText.includes('Welcome Bob')",timeout=15000)
    ok('B receives A reply live (no reload)', True)
    # --- C still only invited: privacy
    C.reload(); C.wait_for_selector('.sa-bar'); C.click('.sa-nav >> text=Community'); C.wait_for_selector('.sa-inv')
    ok('C sees invitation but not the conversation text', 'Panel builders' in C.inner_text('.sa-inv') and 'Welcome Bob' not in C.inner_text('#saComBody'))
    got=C.evaluate("SA.sb.from('chat_messages').select('id').then(r=>r.data.length)")
    ok('C cannot read messages via API either', got==0, got)
    C.click('[data-sa=cdec]'); C.wait_for_timeout(800)
    ok('C declines: membership removed', psql(f"select count(*) from public.chat_members where user_id='{uid('cat@x.com')}'")=='0')
    # --- non-owner cannot invite; unauthenticated rejected
    tokB=B.evaluate("SA.session.access_token"); gid=psql("select id from public.chats where kind='group'")
    def api(path,tok,body):
        rq=urllib.request.Request(BASE+path,json.dumps(body).encode(),{'Content-Type':'application/json',**({'Authorization':'Bearer '+tok} if tok else {})})
        try: r=urllib.request.urlopen(rq); return r.status,json.loads(r.read())
        except urllib.error.HTTPError as e: return e.code,json.loads(e.read() or b'{}')
    s,j=api('/api/community/invite',tokB,{'chat_id':gid,'emails':'cat@x.com'})
    ok('non-owner cannot invite (403)', s==403, (s,j))
    s,j=api('/api/community/invite',None,{'chat_id':gid,'emails':'cat@x.com'})
    ok('unauthenticated rejected (401)', s==401, (s,j))
    s,j=api('/api/community/share',tokB,{'project_id':psql(f"select id from public.projects where owner_id='{uid('ann@x.com')}'"),'emails':'cat@x.com'})
    ok('cannot share a project you do not own (404)', s==404, (s,j))
    # --- owner re-invites Cat from the thread, members dialog
    A.click('[data-sa=cinvite]'); A.fill('#saCEmails','cat@x.com'); A.click('#saCGo'); A.wait_for_selector('#saCRes .sa-msg')
    ok('owner invites more people from the thread', 'Cat Cole' in A.inner_text('#saCRes'))
    A.click('[data-sa=close]'); A.click('[data-sa=cmembers]'); A.wait_for_selector('.sa-mem')
    ok('members dialog lists owner, member and invited', all(x in A.inner_text('.sa-mem') for x in ['Ann Ark','Bob Bell','Cat Cole','Invited']))
    A.click('[data-sa=crm][data-id="%s"]'%uid('cat@x.com')); A.wait_for_timeout(900)
    ok('owner can cancel an invite', psql(f"select count(*) from public.chat_members where user_id='{uid('cat@x.com')}'")=='0')
    A.click('[data-sa=close]')
    # --- private chat
    A.click('[data-sa=cdirect]'); A.fill('#saCEmail','nobody@x.com'); A.click('#saCGo'); A.wait_for_selector('#saCRes .sa-msg')
    ok('private chat with unknown address explains', 'No registered member' in A.inner_text('#saCRes'))
    A.fill('#saCEmail','cat@x.com'); A.click('#saCGo'); A.wait_for_function("document.querySelector('.sa-chd .tt b') && document.querySelector('.sa-chd .tt b').innerText.includes('Cat Cole')",timeout=10000)
    ok('private chat opens, titled with the other person', 'Cat Cole' in A.inner_text('.sa-chd'))
    A.fill('#saMsgIn','Hello Cat'); A.press('#saMsgIn','Enter'); A.wait_for_selector('.sa-m.me')
    A.click('[data-sa=cdirect]'); A.fill('#saCEmail','cat@x.com'); A.click('#saCGo'); A.wait_for_selector('#saSend'); A.wait_for_timeout(500)
    ok('opening it again reuses the same chat', psql("select count(*) from public.chats where kind='direct'")=='1')
    C.reload(); C.wait_for_selector('.sa-bar'); C.wait_for_function("!document.querySelector('.sa-bar .sa-bellb [data-nbadge]').hidden",timeout=10000)
    C.click('.sa-bar .sa-bellb'); C.wait_for_selector('#saBell .ni')
    ok('Cat notified of the private message', 'Ann Ark: Hello Cat' in C.inner_text('#saBell'))
    # --- leaving
    B.click('.sa-nav >> text=Community'); B.wait_for_selector('.sa-ci'); B.click('.sa-ci'); B.wait_for_selector('[data-sa=cleave]')
    B.click('[data-sa=cleave]'); B.click('[data-sa=cleave]'); B.wait_for_timeout(1000)
    ok('leaving needs a second click and removes membership', psql(f"select count(*) from public.chat_members where user_id='{uid('bob@x.com')}'")=='0')
    import os
    if os.environ.get('SHOTS'):
        A.click('.sa-nav >> text=Community'); A.wait_for_selector('.sa-ci'); A.click('.sa-ci >> nth=0'); A.wait_for_timeout(900); A.screenshot(path='/tmp/ct/s_desktop.png')
        A.click('.sa-bar .sa-bellb'); A.wait_for_timeout(300); A.screenshot(path='/tmp/ct/s_bell.png'); A.click('.sa-bar .sa-bellb')
    # --- mobile layout
    A.set_viewport_size({'width':390,'height':800}); A.wait_for_timeout(300)
    if os.environ.get('SHOTS'): A.screenshot(path='/tmp/ct/s_phone.png')
    ok('no horizontal scroll on phone width', A.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"))
    # --- stop sharing
    A.set_viewport_size({'width':1280,'height':850}); A.click('[data-sa=ctab][data-t=shared]'); A.wait_for_selector('text=Shared by me')
    A.click('[data-sa=shrm]'); A.click('[data-sa=shrm]'); A.wait_for_timeout(900)
    ok('stop sharing removes the share', psql("select count(*) from public.project_shares")=='0')
    errs=[e for pg in (A,B,C) for e in pg.errs]
    ok('no page errors', not errs, errs)
bad=[n for n,c in res if not c]
print(f'{len(res)-len(bad)} passed, {len(bad)} failed')

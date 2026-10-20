"""Reporting and blocking members (needed for the app stores): real Worker + real PostgREST/Postgres RLS, TEST-ONLY stand-ins
for Supabase Auth/Storage and email (/tmp/ct/stack.js). Not part of the deployed app."""
import json, subprocess, urllib.request
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8799'
res = []
def ok(n, c, i=''):
    res.append((n, bool(c))); print(('PASS ' if c else 'FAIL ') + n + (' :: ' + str(i)[:300] if (not c and i) else ''))
def psql(q): return subprocess.run(['psql', '-h', '/tmp', '-p', '5544', '-U', 'postgres', '-d', 'dbt', '-Atq', '-c', q], capture_output=True, text=True).stdout.strip()
mails = lambda: json.loads(urllib.request.urlopen('http://127.0.0.1:54321/__mail').read())
M0 = len(mails())
psql("truncate public.projects, public.chats, public.notifications, public.content_reports, public.user_blocks cascade; delete from auth.users;")
for e, f, l in [('ann@x.com', 'Ann', 'Ark'), ('bob@x.com', 'Bob', 'Bell'), ('cat@x.com', 'Cat', 'Cole')]:
    psql(f"insert into auth.users(email,raw_user_meta_data,email_confirmed_at) values ('{e}','{{\"first_name\":\"{f}\",\"last_name\":\"{l}\"}}',now())")
psql("update public.profiles set role='admin' where email='cat@x.com'")
uid = lambda e: psql(f"select id from auth.users where email='{e}'")
D = psql(f"insert into public.chats(kind,direct_key,created_by) values ('direct','{':'.join(sorted([uid('ann@x.com'), uid('bob@x.com')]))}','{uid('ann@x.com')}') returning id").split('\n')[0]
G = psql(f"insert into public.chats(kind,title,created_by) values ('group','Crew','{uid('ann@x.com')}') returning id").split('\n')[0]
psql(f"insert into public.chat_members(chat_id,user_id,role,status,joined_at) values ('{D}','{uid('ann@x.com')}','owner','joined',now()),('{D}','{uid('bob@x.com')}','member','joined',now()),('{G}','{uid('ann@x.com')}','owner','joined',now()),('{G}','{uid('bob@x.com')}','member','joined',now()),('{G}','{uid('cat@x.com')}','member','joined',now())")
psql(f"insert into public.chat_messages(chat_id,sender_id,body) values ('{D}','{uid('bob@x.com')}','You are useless, buy my stuff'),('{G}','{uid('bob@x.com')}','Bob in the group')")

def login(b, email):
    ctx = b.new_context(viewport={'width': 1280, 'height': 850}, bypass_csp=True); pg = ctx.new_page(); pg.errs = []
    pg.on('pageerror', lambda e: pg.errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('#saForm', timeout=15000)
    pg.fill('#email', email); pg.fill('#password', 'Passw0rd!'); pg.click('#saGo'); pg.wait_for_selector('.sa-bar', timeout=15000); pg.wait_for_selector('.sa-proj, .sa-empty', timeout=15000)
    return pg
def open_chat(pg, name):
    pg.click('.sa-nav >> text=Community'); pg.wait_for_selector('.sa-ci'); pg.click(f'.sa-ci:has-text("{name}")'); pg.wait_for_selector('#saMsgs .sa-m', timeout=10000)
api = lambda pg, path, body, method='POST': pg.evaluate(f"fetch('{path}',{{method:'{method}',headers:{{'Content-Type':'application/json',Authorization:'Bearer '+SA.session.access_token}}{',body:JSON.stringify(' + json.dumps(body) + ')' if method == 'POST' else ''}}}).then(async r=>[r.status,await r.json()])")

with sync_playwright() as p:
    b = p.chromium.launch()
    A = login(b, 'ann@x.com'); B = login(b, 'bob@x.com'); C = login(b, 'cat@x.com')
    # ---------- report a message, and block ----------
    open_chat(A, 'Bob Bell')
    ok('others\' messages have a report button, own do not', A.locator('.sa-m:not(.me) [data-sa=mrep]').count() == 1)
    ok('private chat header has Report or block', A.locator('.sa-chd [data-sa=mopts]').count() == 1)
    A.hover('.sa-m:not(.me)'); A.click('.sa-m:not(.me) [data-sa=mrep]'); A.wait_for_selector('#saRepF')
    A.click('#saRepGo'); A.wait_for_selector('#saRepRes .sa-msg')
    ok('reason is required', 'Choose a reason' in A.inner_text('#saRepRes'))
    A.check('input[name=saRR][value=harassment]'); A.fill('#saRepD', 'Rude and selling things'); A.check('#saRepB'); A.click('#saRepGo')
    A.wait_for_selector('#saRepF .sa-msg.ok', timeout=10000)
    ok('report confirmed, block confirmed', 'report was sent' in A.inner_text('#saRepF') and 'blocked this member' in A.inner_text('#saRepF'))
    ok('report stored with a copy of the message', psql("select reason||'|'||message_body||'|'||details from public.content_reports") == 'harassment|You are useless, buy my stuff|Rude and selling things')
    ok('block stored', psql(f"select count(*) from public.user_blocks where blocker_id='{uid('ann@x.com')}' and blocked_id='{uid('bob@x.com')}'") == '1')
    ok('admin notified on the dashboard', psql(f"select count(*) from public.notifications where user_id='{uid('cat@x.com')}' and kind='report'") == '1')
    mm = [m for m in mails()[M0:] if m['to'] == ['cat@x.com']]
    ok('admin emailed with the message', len(mm) == 1 and 'harassment' in mm[0]['subject'] and 'buy my stuff' in mm[0]['text'], mm)
    ok('reported person is not told', not [m for m in mails()[M0:] if m['to'] == ['bob@x.com']] and psql(f"select count(*) from public.notifications where user_id='{uid('bob@x.com')}' and kind='report'") == '0')
    A.click('[data-sa=close]')
    ok('blocked person\'s messages are hidden in the open chat', 'buy my stuff' not in A.inner_text('#saMsgs') and 'member you blocked' in A.inner_text('#saMsgs'))
    A.click('.sa-ci:has-text("Crew")'); A.wait_for_selector('#saMsgs .sa-m')
    ok('...and in group chats', 'Bob in the group' not in A.inner_text('#saMsgs') and 'member you blocked' in A.inner_text('#saMsgs'))
    # ---------- effects of the block ----------
    A.click('[data-sa=ctab][data-t=members]'); A.wait_for_selector('.sa-mcard')
    ok('blocked member gone from the member list', [x.strip() for x in A.locator('.sa-mcard .tx b').all_inner_texts()] == ['Cat Cole'])
    B.click('.sa-nav >> text=Community'); B.wait_for_selector('[data-t=members]'); B.click('[data-t=members]'); B.wait_for_selector('.sa-mcard')
    ok('blocker gone from the blocked member\'s list too', 'Ann Ark' not in B.inner_text('.sa-dir'))
    s, j = api(B, '/api/community/direct', {'email': 'ann@x.com'})
    ok('blocked member cannot start a chat with the blocker', s == 404 and 'not available' in j.get('error', ''), (s, j))
    s, j = api(A, '/api/community/direct', {'user_id': uid('bob@x.com')})
    ok('blocker is told to unblock first', s == 403 and 'Unblock' in j.get('error', ''), (s, j))
    gid2 = psql(f"insert into public.chats(kind,title,created_by) values ('group','Bob group','{uid('bob@x.com')}') returning id").split('\n')[0]
    psql(f"insert into public.chat_members(chat_id,user_id,role,status,joined_at) values ('{gid2}','{uid('bob@x.com')}','owner','joined',now())")
    s, j = api(B, '/api/community/invite', {'chat_id': gid2, 'emails': 'ann@x.com'})
    ok('blocked member cannot invite the blocker to a group', s == 200 and not j['invited'] and j['skipped'][0]['reason'] == 'not_found', (s, j))
    pid = psql(f"insert into public.projects(owner_id,name,data) values ('{uid('bob@x.com')}','Bob board','{{}}') returning id").split('\n')[0]
    s, j = api(B, '/api/community/share', {'project_id': pid, 'emails': 'ann@x.com'})
    ok('blocked member cannot share a project with the blocker', s == 200 and not j['shared'], (s, j))
    open_chat(B, 'Ann Ark'); B.fill('#saMsgIn', 'hello?'); B.press('#saMsgIn', 'Enter'); B.wait_for_selector('.toast')
    ok('the private chat no longer accepts messages', 'no longer send messages' in B.inner_text('.toast'))
    # ---------- report a member from the list ----------
    A.click('.sa-mcard:has-text("Cat Cole") [data-sa=mopts]'); A.wait_for_selector('[data-sa=mreport]')
    ok('member card offers Report and Block', A.is_visible('[data-sa=mblock]'))
    A.click('[data-sa=mreport]'); A.wait_for_selector('#saRepF'); A.check('input[name=saRR][value=impersonation]'); A.click('#saRepGo'); A.wait_for_selector('#saRepF .sa-msg.ok')
    ok('member report stored without blocking', psql("select count(*) from public.content_reports where reason='impersonation' and message_id is null") == '1' and psql(f"select count(*) from public.user_blocks where blocked_id='{uid('cat@x.com')}'") == '0')
    A.click('[data-sa=close]')
    # ---------- blocked list and unblock ----------
    A.evaluate("saGo('account')"); A.wait_for_selector('#saBlocked li', timeout=10000)
    ok('Account lists blocked members', 'Bob Bell' in A.inner_text('#saBlocked'))
    A.click('#saBlocked [data-sa=munblock]'); A.wait_for_selector('#saBlocked >> text=not blocked anyone', timeout=10000)
    ok('unblock from Account', psql("select count(*) from public.user_blocks") == '0')
    # ---------- admin review ----------
    s, j = api(A, '/api/admin/reports', None, 'GET')
    ok('non-admins cannot read reports', s == 403, (s, j))
    C.reload(); C.wait_for_selector('.sa-bar'); C.wait_for_function("!document.querySelector('.sa-bar .sa-bellb [data-nbadge]').hidden", timeout=15000)
    C.click('.sa-bar .sa-bellb'); C.wait_for_selector('#saBell .ni')
    ok('admin bell shows the report', 'New report' in C.inner_text('#saBell'))
    C.click('#saBell .ni:has-text("harassment")'); C.wait_for_selector('.sa-quote', timeout=10000)
    t = C.inner_text('#saAdm')
    ok('Reports tab shows both reports with names and the message', 'Harassment or threats' in t and 'Pretending to be someone else' in t and 'buy my stuff' in t and 'Bob Bell' in t, t)
    C.on('dialog', lambda d: d.accept())
    C.click('[data-sa=rdel]'); C.wait_for_selector('#saAdm >> text=Message deleted', timeout=10000)
    ok('admin deletes the reported message', psql("select count(*) from public.chat_messages where body like '%buy my stuff%'") == '0')
    C.click('.sa-card:has-text("Harassment") [data-sa=ustatus]'); C.wait_for_timeout(1200)
    ok('admin suspends the reported member', psql(f"select status from public.profiles where id='{uid('bob@x.com')}'") == 'suspended')
    C.click('.sa-card:has-text("Harassment") [data-sa=rstat]'); C.wait_for_timeout(1000)
    ok('admin marks the report reviewed', psql("select status from public.content_reports where reason='harassment'") == 'reviewed')
    errs = A.errs + B.errs + C.errs
    ok('no JavaScript errors', not errs, errs)
    b.close()
print(sum(1 for _, c in res if c), 'passed,', sum(1 for _, c in res if not c), 'failed')

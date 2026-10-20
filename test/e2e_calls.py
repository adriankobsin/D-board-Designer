"""Calls: real Worker + PostgREST/Postgres RLS, TEST-ONLY stand-ins for Supabase Auth/Storage and for Cloudflare's RealtimeKit API
(/tmp/ct/stack.js, /__rtk). Proves rooms, join tokens, ringing, call cards and the call screen frame. It cannot prove real audio/video,
which needs the real RealtimeKit service."""
import json, subprocess, urllib.request
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8799'; res = []
def ok(n, c, i=''):
    res.append((n, bool(c))); print(('PASS ' if c else 'FAIL ') + n + (' :: ' + str(i)[:300] if (not c and i) else ''))
def psql(q): return subprocess.run(['psql', '-h', '/tmp', '-p', '5544', '-U', 'postgres', '-d', 'dbt', '-Atq', '-c', q], capture_output=True, text=True).stdout.strip()
rtk = lambda: json.loads(urllib.request.urlopen('http://127.0.0.1:54321/__rtklog').read())
R0 = len(rtk())
psql("truncate public.projects, public.chats, public.notifications, public.content_reports, public.user_blocks cascade; delete from auth.users;")
for e, f in [('ann@x.com', 'Ann'), ('bob@x.com', 'Bob'), ('cat@x.com', 'Cat')]:
    psql(f"insert into auth.users(email,raw_user_meta_data,email_confirmed_at) values ('{e}','{{\"first_name\":\"{f}\",\"last_name\":\"Test\"}}',now())")
uid = lambda e: psql(f"select id from auth.users where email='{e}'")
A_, B_, C_ = uid('ann@x.com'), uid('bob@x.com'), uid('cat@x.com')
D = psql(f"insert into public.chats(kind,direct_key,created_by) values ('direct','{':'.join(sorted([A_, B_]))}','{A_}') returning id").split('\n')[0]
G = psql(f"insert into public.chats(kind,title,created_by) values ('group','Refit crew','{A_}') returning id").split('\n')[0]
psql(f"insert into public.chat_members(chat_id,user_id,role,status,joined_at) values ('{D}','{A_}','owner','joined',now()),('{D}','{B_}','member','joined',now()),('{G}','{A_}','owner','joined',now()),('{G}','{B_}','member','joined',now()),('{G}','{C_}','member','joined',now())")
def login(b, email):
    pg = b.new_context(viewport={'width': 1280, 'height': 850}, bypass_csp=True, permissions=['camera', 'microphone']).new_page(); pg.errs = []
    pg.on('pageerror', lambda e: pg.errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('#saForm'); pg.fill('#email', email); pg.fill('#password', 'Passw0rd!'); pg.click('#saGo'); pg.wait_for_selector('.sa-proj, .sa-empty', timeout=15000); return pg
def open_chat(pg, cid):
    pg.evaluate(f"SA.com.tab='chats'; SA.com.active='{cid}'; saGo('community')"); pg.wait_for_selector('#saSend', timeout=10000)
api = lambda pg, body: pg.evaluate(f"fetch('/api/community/call',{{method:'POST',headers:{{'Content-Type':'application/json',Authorization:'Bearer '+SA.session.access_token}},body:JSON.stringify({json.dumps(body)})}}).then(async r=>[r.status,await r.json()])")
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'])
    A = login(b, 'ann@x.com'); B = login(b, 'bob@x.com'); C = login(b, 'cat@x.com')
    open_chat(A, D)
    ok('chat header has audio and video call buttons', A.locator('[data-sa=callstart][data-v="0"]').count() == 1 and A.locator('[data-sa=callstart][data-v="1"]').count() == 1)
    A.click('[data-sa=callstart][data-v="1"]'); A.wait_for_selector('#saCallWrap iframe', timeout=10000)
    calls = rtk()[R0:]
    ok('a call room is created for the chat', [c['path'] for c in calls if c['method'] == 'POST'][:1] == ['/meetings'] and psql(f"select rtk_meeting_id is not null from public.chats where id='{D}'") == 't', calls)
    part = [c for c in calls if c['path'].endswith('/participants')]
    ok('Ann joins with her member id, name and the group-call host preset', len(part) == 1 and part[0]['body']['custom_participant_id'] == A_ and part[0]['body']['preset_name'] == 'group_call_host' and part[0]['body']['name'] == 'Ann Test', part)
    src = A.get_attribute('#saCallWrap iframe', 'src')
    ok('call screen opens with the join token in the # part, camera on', src.startswith('/call#t=tok.') and src.endswith('&v=1'), src)
    ok('frame may use camera, microphone and screen sharing', all(x in A.get_attribute('#saCallWrap iframe', 'allow') for x in ['camera', 'microphone', 'display-capture']))
    fr = A.frame_locator('#saCallWrap iframe')
    A.wait_for_timeout(2500)
    f = [x for x in A.frames if '/call' in x.url][0]
    ok('call component loaded inside the call screen', f.evaluate("typeof RealtimeKitClient !== 'undefined' && typeof RtkUiKit !== 'undefined'"))
    ok('token removed from the frame address', '#' not in f.url and 'tok.' not in f.url, f.url)
    ok('call card posted in the chat', psql(f"select call->>'video' from public.chat_messages where chat_id='{D}'") == 'true')
    ok('Bob is rung (call notification)', psql(f"select kind||'|'||body from public.notifications where user_id='{B_}'") == 'call|Ann Test is video calling', psql(f"select * from public.notifications where user_id='{B_}'"))
    A.click('[data-sa=callx]'); A.wait_for_timeout(900)
    ok('✕ closes the call screen', A.locator('#saCallWrap').count() == 0)
    A.wait_for_selector('.sa-callcard', timeout=10000)
    ok('call card shows in the chat with Join', 'Video call' in A.inner_text('.sa-callcard') and A.locator('.sa-callcard [data-sa=calljoin]').count() == 1)
    # Bob: ring banner, join
    B.evaluate("saNotifLoad()"); B.wait_for_selector('#saRing', timeout=10000)
    ok('incoming call banner for Bob', 'Ann Test' in B.inner_text('#saRing') and B.locator('#saRing [data-sa=ringyes]').count() == 1)
    n0 = len(rtk())
    B.click('#saRing [data-sa=ringyes]'); B.wait_for_selector('#saCallWrap iframe', timeout=10000)
    calls = rtk()[n0:]
    ok('Bob joins the same room (no new room, one new participant)', not [c for c in calls if c['path'] == '/meetings'] and len([c for c in calls if c['path'].endswith('/participants')]) == 1, calls)
    ok('the ring notification is marked read', psql(f"select read_at is not null from public.notifications where user_id='{B_}' and kind='call'") == 't')
    ok('joining does not ring again', psql(f"select count(*) from public.chat_messages where call is not null") == '1')
    B.click('[data-sa=callx]'); B.wait_for_timeout(700)
    # token reuse
    n0 = len(rtk())
    s, j = api(A, {'chat_id': D, 'video': False, 'ring': False})
    ok("Ann's saved join token is reused", s == 200 and j['token'].startswith('tok.' + A_) and not [c for c in rtk()[n0:] if c['path'].endswith('/participants')], (s, j))
    ok('join tokens are not readable from the browser', 'permission denied' in A.evaluate("SA.sb.from('chat_call_tokens').select('*').then(r=>JSON.stringify(r.error))"))
    # group call
    open_chat(C, G); C.click('[data-sa=callstart][data-v="0"]'); C.wait_for_selector('#saCallWrap iframe', timeout=10000)
    mt = [c for c in rtk() if c['path'] == '/meetings']
    ok('group call room titled after the group', mt[-1]['body']['title'] == 'Refit crew', mt[-1])
    ok('both other group members are rung for an audio call', psql(f"select count(*) from public.notifications where kind='call' and ref_id='{G}' and body like '%is calling'") == '2')
    C.click('[data-sa=callx]')
    pv = subprocess.run(['psql','-h','/tmp','-p','5544','-U','postgres','-d','dbt','-Atq','-c',f"set role authenticated; select set_config('request.jwt.claims','{{\"sub\":\"{C_}\",\"role\":\"authenticated\"}}',false); select last_body from public.my_chats() where id='{G}'"],capture_output=True,text=True).stdout
    ok('chat list preview shows the call', '📞 Audio call' in pv, pv)
    # refusals
    s, j = api(C, {'chat_id': D, 'video': True, 'ring': True})
    ok('someone outside the chat cannot join its call', s == 403, (s, j))
    psql(f"insert into public.user_blocks(blocker_id,blocked_id) values ('{B_}','{A_}')")
    s, j = api(A, {'chat_id': D, 'video': True, 'ring': True})
    ok('no calls in a private chat with a block', s == 403 and 'no longer call' in j.get('error', ''), (s, j))
    s, j = api(A, {'chat_id': 'not-a-uuid'})
    ok('invalid chat refused', s == 400, (s, j))
    errs = A.errs + B.errs + C.errs
    ok('no JavaScript errors in the app', not errs, errs)
    b.close()
print(sum(1 for _, c in res if c), 'passed,', sum(1 for _, c in res if not c), 'failed')

"""Members list, files in chats and projects shared into chats: real Worker (wrangler dev) + real PostgREST + real Postgres RLS,
with TEST-ONLY stand-ins for Supabase Auth and Storage (/tmp/ct/stack.js; storage reads and writes run under the real storage policies).
Not part of the deployed app."""
import json, subprocess, urllib.request, os
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8799'
res = []
def ok(n, c, i=''):
    res.append((n, bool(c))); print(('PASS ' if c else 'FAIL ') + n + (' :: ' + str(i)[:300] if (not c and i) else ''))
def psql(q): return subprocess.run(['psql', '-h', '/tmp', '-p', '5544', '-U', 'postgres', '-d', 'dbt', '-Atq', '-c', q], capture_output=True, text=True).stdout.strip()
psql("truncate public.projects, public.chats, public.notifications cascade; delete from auth.users; delete from storage.objects;")
psql("insert into storage.buckets(id,name,file_size_limit) values ('chat-files','chat-files',26214400) on conflict do nothing")
people = [('ann@x.com', 'Ann', 'Ark', 'Ark Marine', 'Romania', 'Electrician', True), ('bob@x.com', 'Bob', 'Bell', '', 'Italy', 'Panel Builder', True),
          ('cat@x.com', 'Cat', 'Cole', 'Cole Yachts', 'Singapore', 'System Integrator', True), ('dan@x.com', 'Dan', 'Dorn', '', '', '', False),
          ('eve@x.com', 'Eve', 'Earl', '', 'France', 'Electrical Engineer', True)]
for e, f, l, co, cn, oc, conf in people:
    meta = json.dumps({'first_name': f, 'last_name': l, 'company': co, 'country': cn, 'occupation': oc})
    psql(f"insert into auth.users(email,raw_user_meta_data,email_confirmed_at) values ('{e}','{meta}',{'now()' if conf else 'null'})")
uid = lambda e: psql(f"select id from auth.users where email='{e}'")
D = '/tmp/ct/up'; os.makedirs(D, exist_ok=True)
open(f'{D}/wiring.pdf', 'wb').write(b'%PDF-1.4 test wiring diagram ' * 40)
import base64
open(f'{D}/panel photo é.png', 'wb').write(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAF0lEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDK+mmyAAAAABJRU5ErkJggg=='))
open(f'{D}/big.bin', 'wb').write(b'\0' * (25 * 1024 * 1024 + 10))
open(f'{D}/notes.txt', 'wb').write(b'cable schedule v2')

def login(b, email, w=1280, h=850, csp_off=True):
    ctx = b.new_context(viewport={'width': w, 'height': h}, bypass_csp=csp_off, accept_downloads=True); pg = ctx.new_page(); pg.errs = []
    pg.on('pageerror', lambda e: pg.errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('#saForm', timeout=15000)
    pg.fill('#email', email); pg.fill('#password', 'Passw0rd!'); pg.click('#saGo'); pg.wait_for_selector('.sa-bar', timeout=15000); pg.wait_for_selector('.sa-proj, .sa-empty', timeout=15000)
    return pg
def members(pg):
    pg.click('.sa-nav >> text=Community'); pg.wait_for_selector('[data-sa=ctab][data-t=members]'); pg.click('[data-sa=ctab][data-t=members]')
    pg.wait_for_selector('.sa-mcard, .sa-dir .sa-empty', timeout=10000)
def card_names(pg): return [x.strip() for x in pg.locator('.sa-mcard .tx b').all_inner_texts()]

with sync_playwright() as p:
    b = p.chromium.launch()
    A = login(b, 'ann@x.com'); C = login(b, 'cat@x.com')
    # ---------- directory ----------
    members(A)
    ok('Members tab lists other verified members', card_names(A) == ['Bob Bell', 'Cat Cole', 'Eve Earl'], card_names(A))
    ok('unverified member and yourself are not listed', 'Dan Dorn' not in card_names(A) and 'Ann Ark' not in card_names(A))
    t = A.inner_text('.sa-dir')
    ok('cards show occupation, company and country', 'System Integrator · Cole Yachts' in t and 'Singapore' in t and 'Member since' in t, t)
    ok('no email addresses on the page', '@x.com' not in A.inner_text('#saComBody'))
    ok('member count shown', A.inner_text('#saDirN') == '3 members', A.inner_text('#saDirN'))
    A.fill('#saDirQ', 'singap'); A.wait_for_function("document.querySelectorAll('.sa-mcard').length==1", timeout=5000)
    ok('search narrows the list', card_names(A) == ['Cat Cole'])
    A.fill('#saDirQ', 'zzz'); A.wait_for_selector('.sa-dir .sa-empty'); ok('no-match message', 'No members match' in A.inner_text('.sa-dir'))
    A.fill('#saDirQ', ''); A.wait_for_function("document.querySelectorAll('.sa-mcard').length==3", timeout=5000)
    # ---------- message a member, files ----------
    A.click('.sa-mcard:has-text("Cat Cole") [data-sa=mchat]'); A.wait_for_selector('#saSend', timeout=10000)
    ok('Message opens a private chat with that member', 'Cat Cole' in A.inner_text('.sa-chd') and A.is_visible('[data-t=chats][aria-current]'))
    ok('composer has attach and share-project buttons', A.is_visible('[data-sa=cattach]') and A.is_visible('[data-sa=cproj]'))
    A.fill('#saMsgIn', 'Hi Cat, drawings attached'); A.press('#saMsgIn', 'Enter'); A.wait_for_selector('.sa-m.me')
    A.set_input_files('#saFileIn', [f'{D}/wiring.pdf', f'{D}/panel photo é.png'])
    A.wait_for_selector('.sa-file[href]', timeout=15000); A.wait_for_selector('.sa-fimg img', timeout=15000)
    ok('file appears as a download chip with name and size', 'wiring.pdf' in A.inner_text('.sa-file') and 'KB' in A.inner_text('.sa-file'), A.inner_text('#saMsgs'))
    A.wait_for_function("document.querySelector('.sa-fimg img').naturalWidth>0", timeout=10000)
    ok('image shows as a thumbnail', True)
    ok('original file name kept (accented)', psql("select count(*) from public.chat_messages where attachment->>'name'='panel photo é.png'") == '1')
    ok('upload stored in the chat folder', psql("select count(*) from storage.objects where name like (select id::text from public.chats limit 1)||'/%'") == '2')
    href = A.get_attribute('.sa-file', 'href')
    ok('download link returns the file', urllib.request.urlopen(href).read().startswith(b'%PDF-1.4 test'))
    ok('upload indicator cleared', A.inner_text('#saUps').strip() == '')
    A.set_input_files('#saFileIn', [f'{D}/big.bin']); A.wait_for_selector('.sa-up.bad')
    ok('file over 25 MB refused with a message', 'Larger than 25 MB' in A.inner_text('#saUps'))
    A.click('[data-sa=updismiss]'); ok('error can be dismissed', A.locator('.sa-up').count() == 0)
    ok('chat list preview shows the last file', '📎' in A.inner_text('#saCList'))
    # ---------- share a project into the chat ----------
    A.evaluate("saCreateProject(exampleProject(),'Cabin board')"); A.wait_for_timeout(500)
    A.click('[data-sa=cproj]'); A.wait_for_selector('#saCProj')
    ok('project picker lists my saved projects', 'Cabin board' in A.inner_text('#saCProj'))
    A.fill('#saCNote', 'Check the RCBOs'); A.click('#saCGo'); A.wait_for_selector('.sa-pcard', timeout=10000)
    ok('project card appears in the chat with the note', 'Cabin board' in A.inner_text('.sa-pcard') and 'Check the RCBOs' in A.inner_text('#saMsgs'))
    ok('owner sees Open (not a copy)', A.locator('.sa-pcard [data-sa=popen]').count() == 1)
    ok('share recorded for Cat, tied to the chat', psql(f"select count(*) from public.project_shares where recipient_id='{uid('cat@x.com')}' and chat_id is not null") == '1')
    ok('no separate share notification for Cat', psql(f"select count(*) from public.notifications where user_id='{uid('cat@x.com')}' and kind='project_share'") == '0')
    # ---------- Cat's side ----------
    C.reload(); C.wait_for_selector('.sa-bar'); C.wait_for_function("!document.querySelector('.sa-bar .sa-bellb [data-nbadge]').hidden", timeout=15000)
    C.click('.sa-bar .sa-bellb'); C.wait_for_selector('#saBell .ni')
    ok('Cat notified, preview names the project', '▦ Cabin board' in C.inner_text('#saBell') or 'Check the RCBOs' in C.inner_text('#saBell'), C.inner_text('#saBell'))
    C.click('#saBell .ni >> nth=0'); C.wait_for_selector('.sa-pcard', timeout=10000); C.wait_for_selector('.sa-file[href]', timeout=10000)
    ok('Cat sees text, file and image', all(x in C.inner_text('#saMsgs') for x in ['drawings attached', 'wiring.pdf']) and C.locator('.sa-fimg').count() == 1)
    # a separate browser with the site's Content Security Policy enforced (the test helpers above need it relaxed)
    S = login(b, 'cat@x.com', csp_off=False); S.click('.sa-nav >> text=Community'); S.wait_for_selector('.sa-ci'); S.click('.sa-ci:has-text("Ann Ark")'); S.wait_for_selector('.sa-fimg img', timeout=10000)
    for _ in range(40):
        if S.evaluate("document.querySelector('.sa-fimg img').complete"): break
        S.wait_for_timeout(250)
    ok('image thumbnail loads with the site security policy enforced', S.evaluate("document.querySelector('.sa-fimg img').naturalWidth>0"))
    S.context.close()
    ok('Cat can download the file', urllib.request.urlopen(C.get_attribute('.sa-file', 'href')).read().startswith(b'%PDF'))
    C.click('[data-sa=pcopy]'); C.wait_for_selector('.wrap', state='visible', timeout=15000); C.wait_for_timeout(800)
    ok('Cat opens her own copy of the project', psql(f"select name from public.projects where owner_id='{uid('cat@x.com')}'") == 'Cabin board (from Ann Ark)')
    C.evaluate("saGo('community')"); C.wait_for_selector('#saSend', timeout=10000)
    C.set_input_files('#saFileIn', [f'{D}/notes.txt']); C.wait_for_function("[...document.querySelectorAll('.sa-m.me .sa-file')].some(e=>e.innerText.includes('notes.txt'))", timeout=15000)
    ok('Cat replies with a file', True)
    # ---------- outsiders cannot reach the files ----------
    E = login(b, 'eve@x.com')
    path = psql("select attachment->>'path' from public.chat_messages where attachment is not null limit 1")
    r = E.evaluate(f"SA.sb.storage.from('chat-files').createSignedUrls(['{path}'],60).then(x=>JSON.stringify(x))")
    ok('outsider cannot get a link to the file', 'null' in r and 'signedUrl":"http' not in r, r)
    r = E.evaluate(f"SA.sb.storage.from('chat-files').upload('{path.split('/')[0]}/'+crypto.randomUUID()+'/x.txt', new Blob(['x'])).then(x=>JSON.stringify(x.error))")
    ok('outsider cannot upload into the chat', r != 'null', r)
    r = E.evaluate(f"SA.sb.from('chat_messages').select('id').then(x=>x.data.length)")
    ok('outsider sees no messages', r == 0, r)
    # ---------- select several members: group, add to group, share ----------
    members(A)
    A.check('.sa-mcard:has-text("Bob Bell") [data-sa=msel]'); A.check('.sa-mcard:has-text("Eve Earl") [data-sa=msel]')
    ok('selection bar shows the count', '2 selected' in A.inner_text('#saSelBar') and A.is_visible('#saSelBar'))
    ok('selected cards are highlighted', A.locator('.sa-mcard.on').count() == 2)
    A.click('#saSelBar [data-sa=mgroup]'); A.wait_for_selector('#saCTitle')
    ok('group dialog names the selected members', 'Bob Bell' in A.inner_text('.sa-dlg') and 'Eve Earl' in A.inner_text('.sa-dlg'))
    A.fill('#saCTitle', 'Refit team'); A.click('#saCGo'); A.wait_for_selector('#saCRes .sa-msg', timeout=10000)
    ok('both invited to the new group', 'Bob Bell' in A.inner_text('#saCRes') and 'Eve Earl' in A.inner_text('#saCRes'), A.inner_text('#saCRes'))
    ok('invitation emails sent to both', psql(f"select count(*) from public.chat_members where status='invited'") == '2')
    A.click('[data-sa=cgo]'); A.wait_for_selector('#saSend', timeout=10000)
    ok('owner lands in the new group', 'Refit team' in A.inner_text('.sa-chd'))
    members(A)
    ok('selection cleared after creating the group', A.locator('.sa-mcard.on').count() == 0 and A.is_hidden('#saSelBar'))
    A.check('.sa-mcard:has-text("Cat Cole") [data-sa=msel]'); A.check('.sa-mcard:has-text("Eve Earl") [data-sa=msel]')
    A.click('#saSelBar [data-sa=madd]'); A.wait_for_selector('#saCGroup')
    ok('Add to my group offers groups I own', 'Refit team' in A.inner_text('#saCGroup'))
    A.click('#saCGo'); A.wait_for_selector('#saCRes .sa-msg', timeout=10000); t = A.inner_text('#saCRes')
    ok('Cat invited, Eve reported as already included', 'Cat Cole' in t and 'Eve Earl' in t and 'already included' in t, t)
    A.click('[data-sa=close]')
    A.click('.sa-mcard:has-text("Bob Bell") [data-sa=mshare]'); A.wait_for_selector('#saCProj')
    A.click('#saCGo'); A.wait_for_selector('#saCRes .sa-msg', timeout=10000)
    ok('share a project with one member from the list', 'Bob Bell' in A.inner_text('#saCRes'))
    ok('Bob gets a share notification', psql(f"select count(*) from public.notifications where user_id='{uid('bob@x.com')}' and kind='project_share'") == '1')
    A.click('[data-sa=close]')
    # ---------- send a file straight from a member card ----------
    with A.expect_file_chooser() as fc: A.click('.sa-mcard:has-text("Eve Earl") [data-sa=mfile]')
    fc.value.set_files(f'{D}/wiring.pdf')
    A.wait_for_function("document.querySelector('.sa-chd') && document.querySelector('.sa-chd').innerText.includes('Eve Earl') && document.querySelector('.sa-file[href]')", timeout=20000)
    ok('Send file opens a chat with that member and sends it', 'wiring.pdf' in A.inner_text('#saMsgs'))
    # ---------- server-side checks ----------
    api = lambda pg, path, body: pg.evaluate(f"fetch('{path}',{{method:'POST',headers:{{'Content-Type':'application/json',Authorization:'Bearer '+SA.session.access_token}},body:JSON.stringify({json.dumps(body)})}}).then(async r=>[r.status,await r.json()])")
    s, j = api(A, '/api/community/direct', {'user_id': uid('dan@x.com')})
    ok('cannot reach an unverified member by id', s == 404, (s, j))
    s, j = api(A, '/api/community/direct', {'user_id': uid('ann@x.com')})
    ok('cannot chat with yourself', s == 400, (s, j))
    pid = psql(f"select id from public.projects where owner_id='{uid('cat@x.com')}'")
    s, j = api(A, '/api/community/share', {'project_id': pid, 'user_ids': [uid('bob@x.com')]})
    ok('cannot share someone else\'s project', s == 404, (s, j))
    gid = psql("select id from public.chats where kind='group'")
    s, j = api(C, '/api/community/share', {'project_id': pid, 'chat_id': gid})
    ok('cannot post a project into a chat you are not in', s == 403, (s, j))
    # ---------- hide from directory ----------
    C.evaluate("saGo('account')"); C.wait_for_selector('#show_dir')
    ok('account has the member-list switch, on by default', C.is_checked('#show_dir'))
    C.uncheck('#show_dir'); C.click('#saProf button[type=submit]'); C.wait_for_selector('.sa-msg.ok', timeout=10000)
    ok('switch saved', psql(f"select show_in_directory from public.profiles where id='{uid('cat@x.com')}'") == 'f')
    members(A)
    ok('hidden member no longer listed', 'Cat Cole' not in card_names(A), card_names(A))
    s, j = api(A, '/api/community/direct', {'user_id': uid('cat@x.com')})
    ok('hidden member cannot be reached by id', s == 404, (s, j))
    s, j = api(A, '/api/community/direct', {'email': 'cat@x.com'})
    ok('hidden member still reachable by exact email', s == 200, (s, j))
    C.evaluate("saGo('account')"); C.wait_for_selector('#show_dir'); C.check('#show_dir'); C.click('#saProf button[type=submit]'); C.wait_for_selector('.sa-msg.ok')
    # ---------- phone width ----------
    M = login(b, 'bob@x.com', 390, 844); members(M)
    ok('phone: member list fits the screen', M.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"))
    M.check('.sa-mcard >> nth=0 >> [data-sa=msel]')
    ok('phone: selection bar visible', M.is_visible('#saSelBar'))
    M.click('.sa-mcard:has-text("Ann Ark") [data-sa=mchat]'); M.wait_for_selector('#saSend', timeout=10000); M.wait_for_selector('.sa-file[href]', timeout=10000) if M.locator('.sa-file').count() else None
    ok('phone: chat composer fits', M.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1") and M.is_visible('[data-sa=cattach]'))
    M.screenshot(path='/tmp/ct/phone_chat.png'); members(M); M.screenshot(path='/tmp/ct/phone_members.png')
    A.set_viewport_size({'width': 1280, 'height': 850}); members(A); A.screenshot(path='/tmp/ct/desk_members.png', full_page=True)
    errs = A.errs + C.errs + E.errs + M.errs
    ok('no JavaScript errors', not errs, errs)
    b.close()
print(sum(1 for _, c in res if c), 'passed,', sum(1 for _, c in res if not c), 'failed')

"""Deleting an account removes the files that person sent in chats (real Worker + PostgREST/Postgres, TEST-ONLY Auth/Storage stand-in)."""
import json, subprocess, os
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8799'; res = []
def ok(n, c, i=''):
    res.append((n, bool(c))); print(('PASS ' if c else 'FAIL ') + n + (' :: ' + str(i)[:300] if (not c and i) else ''))
def psql(q): return subprocess.run(['psql', '-h', '/tmp', '-p', '5544', '-U', 'postgres', '-d', 'dbt', '-Atq', '-c', q], capture_output=True, text=True).stdout.strip()
psql("truncate public.projects, public.chats, public.notifications, public.content_reports, public.user_blocks cascade; delete from auth.users; delete from storage.objects;")
psql("insert into storage.buckets(id,name,file_size_limit) values ('chat-files','chat-files',26214400) on conflict do nothing")
for e, f in [('ann@x.com', 'Ann'), ('bob@x.com', 'Bob')]:
    psql(f"insert into auth.users(email,raw_user_meta_data,email_confirmed_at) values ('{e}','{{\"first_name\":\"{f}\",\"last_name\":\"Test\"}}',now())")
os.makedirs('/tmp/ct/up', exist_ok=True); open('/tmp/ct/up/a.txt', 'w').write('from bob'); open('/tmp/ct/up/b.txt', 'w').write('from ann')
with sync_playwright() as p:
    b = p.chromium.launch()
    def login(email):
        pg = b.new_context(bypass_csp=True).new_page(); pg.goto(BASE); pg.wait_for_selector('#saForm'); pg.fill('#email', email); pg.fill('#password', 'Passw0rd!'); pg.click('#saGo'); pg.wait_for_selector('.sa-proj, .sa-empty'); return pg
    B = login('bob@x.com')
    B.evaluate("fetch('/api/community/direct',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+SA.session.access_token},body:JSON.stringify({email:'ann@x.com'})}).then(r=>r.json()).then(j=>{SA.com.active=j.chat_id; SA.com.tab='chats'; saGo('community')})")
    B.wait_for_selector('#saSend'); B.set_input_files('#saFileIn', ['/tmp/ct/up/a.txt']); B.wait_for_selector('.sa-file[href]', timeout=15000)
    A = login('ann@x.com'); A.click('.sa-nav >> text=Community'); A.wait_for_selector('.sa-ci'); A.click('.sa-ci'); A.wait_for_selector('#saSend')
    A.set_input_files('#saFileIn', ['/tmp/ct/up/b.txt']); A.wait_for_selector('.sa-m.me .sa-file[href]', timeout=15000)
    ok('two files stored', psql("select count(*) from storage.objects") == '2')
    r = B.evaluate("fetch('/api/me/delete',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+SA.session.access_token},body:JSON.stringify({email:'bob@x.com'})}).then(r=>r.status)")
    ok('Bob deletes his account', r == 200 and psql("select count(*) from auth.users where email='bob@x.com'") == '0', r)
    ok("Bob's file is removed from storage", psql("select string_agg(name, ',') from storage.objects").endswith('b.txt') and psql("select count(*) from storage.objects") == '1', psql("select name from storage.objects"))
    ok("Ann's file stays", psql("select count(*) from public.chat_messages where attachment is not null") == '1')
    b.close()
print(sum(1 for _, c in res if c), 'passed,', sum(1 for _, c in res if not c), 'failed')

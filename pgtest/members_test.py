"""0005: member directory, files in chats, project cards. Runs against real Postgres with the test stub (pgtest/stub.sql)."""
import subprocess, json, uuid
def sql(q, role=None, sub=None):
    pre = ''
    if role: pre += f"set role {role};"
    if sub: pre += f"select set_config('request.jwt.claims','{json.dumps({'sub': sub, 'role': role})}',false);"
    r = subprocess.run(['psql', '-h', '/tmp', '-p', '5544', '-U', 'postgres', '-d', 'dbt', '-Atq', '-v', 'ON_ERROR_STOP=1', '-c', pre + q], capture_output=True, text=True)
    out = [l for l in (r.stdout + r.stderr).split('\n') if l.strip() and not l.startswith('{"sub"') and l.strip() != 'SET' and not l.startswith(('INSERT ', 'UPDATE ', 'DELETE '))]
    return r.returncode, '\n'.join(out)
ok = bad = 0
def check(n, c, d=''):
    global ok, bad
    if c: ok += 1; print('PASS', n)
    else: bad += 1; print('FAIL', n, d)
A, B, C, D, E, S = [str(uuid.uuid4()) for _ in range(6)]
sql("truncate public.profiles, public.projects, public.chats, public.notifications cascade; delete from auth.users; delete from storage.objects;")
sql(f"""insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('{A}','ann@x.com','{{"first_name":"Ann","last_name":"Ark","company":"Ark Marine","country":"Romania","occupation":"Electrician"}}',now()),
 ('{B}','bob@x.com','{{"first_name":"Bob","last_name":"Bell","company":"Bell_Panels 100%"}}',now()),
 ('{C}','cat@x.com','{{"first_name":"Cat","last_name":"Cole","country":"Singapore"}}',now()),
 ('{D}','dan@x.com','{{"first_name":"Dan"}}',null),
 ('{E}','eve@x.com','{{"first_name":"Eve"}}',now()),
 ('{S}','sus@x.com','{{"first_name":"Sue"}}',now());""")
sql(f"update public.profiles set status='suspended' where id='{S}'")
# ---- directory
dir_ = lambda who, q='', lim=60, off=0: sql(f"select name||'|'||coalesce(company,'')||'|'||total from public.member_directory('{q}',{lim},{off})", 'authenticated', who)[1].split('\n')
rows = dir_(A)
names = [r.split('|')[0] for r in rows if r]
check('directory lists other verified active members', names == ['Bob Bell', 'Cat Cole', 'Eve'], rows)
check('directory excludes yourself, unverified and suspended', 'Ann Ark' not in names and 'Dan' not in names and 'Sue' not in names)
check('directory reports total', rows[0].endswith('|3'), rows)
rc, o = sql("select * from public.member_directory()", 'authenticated', A)
check('directory never returns email addresses', '@x.com' not in o, o)
check('search by name', [r.split('|')[0] for r in dir_(A, 'cat')] == ['Cat Cole'])
check('search by country', [r.split('|')[0] for r in dir_(B, 'roman')] == ['Ann Ark'])
check('search by company', [r.split('|')[0] for r in dir_(C, 'ark marine')] == ['Ann Ark'])
check('% and _ are literal in search', [r.split('|')[0] for r in dir_(A, '100%')] == ['Bob Bell'] and dir_(A, '_') == ['Bob Bell|Bell_Panels 100%|1'], dir_(A, '_'))
check('paging', [r.split('|')[0] for r in dir_(A, '', 2, 0)] == ['Bob Bell', 'Cat Cole'] and [r.split('|')[0] for r in dir_(A, '', 2, 2)] == ['Eve'])
check('page size capped at 100', sql("select count(*) from public.member_directory('',100000,0)", 'authenticated', A)[1] == '3')
rc, o = sql("update public.profiles set show_in_directory=false where id=auth.uid()", 'authenticated', C)
check('member can hide themselves', rc == 0, o)
check('hidden member left out', 'Cat Cole' not in '\n'.join(dir_(A)))
rc, o = sql("select * from public.member_directory()", 'authenticated', S)
check('suspended user gets an empty directory', o == '', o)
rc, o = sql("select * from public.member_directory()", 'anon')
check('signed-out visitors cannot read the directory', rc != 0, o)
rc, o = sql(f"select first_name from public.profiles where id='{B}'", 'authenticated', A)
check('profiles table itself stays private', o == '', o)
sql("update public.profiles set show_in_directory=true where id=auth.uid()", 'authenticated', C)
# ---- chat with A and B, files
G = str(uuid.uuid4())
sql(f"""insert into public.chats(id,kind,direct_key,created_by) values ('{G}','direct','x','{A}');
insert into public.chat_members(chat_id,user_id,role,status,joined_at) values ('{G}','{A}','owner','joined',now()),('{G}','{B}','member','joined',now());""")
sql("insert into storage.buckets(id,name) values ('chat-files','chat-files') on conflict do nothing")
p1 = f"{G}/{uuid.uuid4()}/wiring.pdf"
rc, o = sql(f"insert into storage.objects(bucket_id,name) values ('chat-files','{p1}')", 'authenticated', A)
check('member uploads into their chat folder', rc == 0, o)
rc, o = sql(f"insert into storage.objects(bucket_id,name) values ('chat-files','{G}/{uuid.uuid4()}/x.pdf')", 'authenticated', C)
check('outsider cannot upload into the chat', rc != 0, o)
rc, o = sql(f"insert into storage.objects(bucket_id,name) values ('chat-files','{G}/notauuid/x.pdf')", 'authenticated', A)
check('malformed path refused', rc != 0, o)
rc, o = sql(f"insert into storage.objects(bucket_id,name) values ('chat-files','{G}/{uuid.uuid4()}/a/b.pdf')", 'authenticated', A)
check('nested path refused', rc != 0, o)
check('other member can read the file', sql("select count(*) from storage.objects", 'authenticated', B)[1] == '1')
check('outsider cannot see the file', sql("select count(*) from storage.objects", 'authenticated', C)[1] == '0')
rc, o = sql(f"delete from storage.objects where name='{p1}' returning name", 'authenticated', B)
check('other member cannot delete it', p1 not in o, o)
att = lambda p, extra='': json.dumps(dict({'path': p, 'name': 'wiring.pdf', 'size': 1234, 'type': 'application/pdf'}, **(json.loads(extra) if extra else {})))
rc, o = sql(f"insert into public.chat_messages(chat_id,body,attachment) values ('{G}','','{att(p1)}') returning attachment->>'name'", 'authenticated', A)
check('message with only a file is stored', rc == 0 and 'wiring.pdf' in o, o)
rc, o = sql(f"insert into public.chat_messages(chat_id,body,attachment) values ('{G}','','{att(G + '/' + str(uuid.uuid4()) + '/ghost.pdf')}')", 'authenticated', A)
check('reference to a file that was not uploaded refused', rc != 0 and 'not uploaded' in o, o)
H = str(uuid.uuid4())
rc, o = sql(f"insert into public.chat_messages(chat_id,body,attachment) values ('{G}','','{att(H + '/' + str(uuid.uuid4()) + '/x.pdf')}')", 'authenticated', A)
check('file from another chat refused', rc != 0 and 'Invalid file' in o, o)
rc, o = sql(f"insert into public.chat_messages(chat_id,body,attachment) values ('{G}','','\"oops\"')", 'authenticated', A)
check('non-object attachment refused', rc != 0, o)
rc, o = sql(f"insert into public.chat_messages(chat_id,body,attachment) values ('{G}','','{att(p1, json.dumps({'size': 9e12, 'extra': 'x'}))}') returning attachment", 'authenticated', A)
check('attachment cleaned: size clamped, extra keys dropped', rc == 0 and '"extra"' not in o and '26214400' in o, o)
rc, o = sql(f"insert into public.chat_messages(chat_id,body) values ('{G}','   ')", 'authenticated', A)
check('empty message without file still refused', rc != 0, o)
rc, o = sql(f"insert into public.chat_messages(chat_id,body,project_id,project_name) values ('{G}','','{uuid.uuid4()}','Fake')", 'authenticated', A)
check('browser cannot post a project card', rc != 0 and 'permission denied' in o, o)
check('notification preview shows the file name', '📎 wiring.pdf' in sql(f"select body from public.notifications where user_id='{B}' and kind='chat_message'")[1])
check('chat list preview shows the file name', sql("select last_body from public.my_chats()", 'authenticated', B)[1].startswith('📎 wiring.pdf'))
check('message select returns attachment', sql("select count(*) from public.chat_messages where attachment is not null", 'authenticated', B)[1] == '2')
# daily file cap
sql(f"insert into public.chat_messages(chat_id,sender_id,body,attachment,created_at) select '{G}','{A}','',jsonb_build_object('path','{p1}','name','x'),now()-interval '2 minutes' from generate_series(1,98)")
rc, o = sql(f"insert into public.chat_messages(chat_id,body,attachment) values ('{G}','','{att(p1)}')", 'authenticated', A)
check('101st file in a day refused', rc != 0 and 'Daily file limit' in o, o)
rc, o = sql(f"insert into public.chat_messages(chat_id,body) values ('{G}','text still works')", 'authenticated', A)
check('text messages unaffected by the file cap', rc == 0, o)
sql(f"delete from public.chat_messages where chat_id='{G}'")
# ---- project shared into chat (Worker path, service role)
rc, o = sql("insert into public.projects(name,data) values ('Cabin board','{\"circuits\":[]}') returning id", 'authenticated', A); pid = o.split('\n')[0]
sql(f"insert into public.project_shares(project_id,owner_id,recipient_id,project_name,chat_id) values ('{pid}','{A}','{B}','Cabin board','{G}')")
sql(f"insert into public.chat_messages(chat_id,sender_id,body,project_id,project_name) values ('{G}','{A}','','{pid}','Cabin board')")
check('share via chat: no separate share notification', sql(f"select count(*) from public.notifications where user_id='{B}' and kind='project_share'")[1] == '0')
check('share via chat: chat notification names the project', '▦ Cabin board' in sql(f"select body from public.notifications where user_id='{B}' and kind='chat_message'")[1])
check('recipient can open the shared project', sql(f"select name from public.projects where id='{pid}'", 'authenticated', B)[1] == 'Cabin board')
sql(f"insert into public.project_shares(project_id,owner_id,recipient_id,project_name) values ('{pid}','{A}','{E}','Cabin board')")
check('share outside chat still notifies', sql(f"select count(*) from public.notifications where user_id='{E}' and kind='project_share'")[1] == '1')
sql(f"delete from public.projects where id='{pid}'")
check('deleting the project keeps the chat card', sql(f"select project_name||'|'||coalesce(project_id::text,'null') from public.chat_messages where chat_id='{G}'")[1] == 'Cabin board|null')
rc, o = sql(f"select count(*) from public.directory_members(array['{A}','{B}','{D}','{S}']::uuid[])", 'service_role')
check('Worker id lookup returns only verified, active, listed members', o == '2', o)
rc, o = sql(f"select * from public.directory_members(array['{B}']::uuid[])", 'authenticated', A)
check('browser cannot call the id lookup (it returns emails)', rc != 0 and 'permission denied' in o, o)
print(f'{ok} passed, {bad} failed')

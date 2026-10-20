"""0006: blocking and reporting. Real Postgres with the test stub (pgtest/stub.sql)."""
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
A, B, C = [str(uuid.uuid4()) for _ in range(3)]
sql("truncate public.profiles, public.projects, public.chats, public.notifications, public.content_reports, public.user_blocks cascade; delete from auth.users;")
sql(f"""insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('{A}','ann@x.com','{{"first_name":"Ann"}}',now()),('{B}','bob@x.com','{{"first_name":"Bob"}}',now()),('{C}','cat@x.com','{{"first_name":"Cat"}}',now());""")
D, G = str(uuid.uuid4()), str(uuid.uuid4())
sql(f"""insert into public.chats(id,kind,direct_key,created_by) values ('{D}','direct','k','{A}');
insert into public.chat_members(chat_id,user_id,role,status,joined_at) values ('{D}','{A}','owner','joined',now()),('{D}','{B}','member','joined',now());
insert into public.chats(id,kind,title,created_by) values ('{G}','group','Crew','{A}');
insert into public.chat_members(chat_id,user_id,role,status,joined_at) values ('{G}','{A}','owner','joined',now()),('{G}','{B}','member','joined',now()),('{G}','{C}','member','joined',now());""")
names = lambda who: sql("select string_agg(name, ',' order by name) from public.member_directory()", 'authenticated', who)[1]
check('before blocking, Ann sees Bob and Cat', names(A) == 'Bob,Cat', names(A))
rc, o = sql(f"insert into public.user_blocks(blocker_id,blocked_id) values ('{A}','{B}')", 'authenticated', A)
check('Ann blocks Bob', rc == 0, o)
rc, o = sql(f"insert into public.user_blocks(blocker_id,blocked_id) values ('{B}','{C}')", 'authenticated', A)
check('cannot create a block on someone else\'s behalf', rc != 0, o)
rc, o = sql(f"insert into public.user_blocks(blocker_id,blocked_id) values ('{A}','{A}')", 'authenticated', A)
check('cannot block yourself', rc != 0, o)
check('Ann no longer sees Bob in the member list', names(A) == 'Cat', names(A))
check('Bob no longer sees Ann either', names(B) == 'Cat', names(B))
check('Cat still sees both', names(C) == 'Ann,Bob', names(C))
check('Ann sees her own block', sql("select count(*) from public.user_blocks", 'authenticated', A)[1] == '1')
check('Bob cannot see that Ann blocked him', sql("select count(*) from public.user_blocks", 'authenticated', B)[1] == '0')
rc, o = sql(f"select public.blocked_between('{A}','{B}')", 'authenticated', B)
check('block lookup not callable from the browser', rc != 0 and 'permission denied' in o, o)
check('my_blocks lists Bob for Ann', sql("select name from public.my_blocks()", 'authenticated', A)[1] == 'Bob')
rc, o = sql(f"insert into public.chat_messages(chat_id,body) values ('{D}','hi Ann')", 'authenticated', B)
check('Bob cannot message Ann in their private chat', rc != 0, o)
rc, o = sql(f"insert into public.chat_messages(chat_id,body) values ('{D}','hi Bob')", 'authenticated', A)
check('Ann cannot message Bob there either (chat is closed)', rc != 0, o)
rc, o = sql(f"insert into public.chat_messages(chat_id,body) values ('{G}','group hello from Bob')", 'authenticated', B)
check('group chat still works', rc == 0, o)
check('Ann gets no notification from Bob', sql(f"select count(*) from public.notifications where user_id='{A}' and kind='chat_message'")[1] == '0')
check('Cat is notified as usual', sql(f"select count(*) from public.notifications where user_id='{C}' and kind='chat_message'")[1] == '1')
rc, o = sql(f"delete from public.user_blocks where blocked_id='{B}'", 'authenticated', A)
check('Ann unblocks Bob', rc == 0 and sql("select count(*) from public.user_blocks")[1] == '0', o)
rc, o = sql(f"insert into public.chat_messages(chat_id,body) values ('{D}','hi again')", 'authenticated', B)
check('private chat works again after unblocking', rc == 0, o)
# reports: only the Worker (service role) writes them; browsers cannot read them
rc, o = sql(f"insert into public.content_reports(reporter_id,target_user_id,reason) values ('{A}','{B}','spam')", 'authenticated', A)
check('browser cannot write reports directly', rc != 0 and 'permission denied' in o, o)
sql(f"insert into public.content_reports(reporter_id,target_user_id,reason,message_body) values ('{A}','{B}','harassment','x')")
rc, o = sql("select count(*) from public.content_reports", 'authenticated', A)
check('browser cannot read reports, not even their own', rc != 0 and 'permission denied' in o, o)
rc, o = sql("insert into public.content_reports(reason) values ('nonsense')")
check('unknown reason refused', rc != 0, o)
rc, o = sql(f"insert into public.notifications(user_id,kind,title,body) values ('{A}','report','New report','x')")
check('admin report notification allowed', rc == 0, o)
mid = sql(f"select id from public.chat_messages where chat_id='{D}' limit 1")[1]
sql(f"update public.content_reports set message_id={mid}")
sql(f"delete from public.chat_messages where id={mid}")
check('report keeps its copy after the message is deleted', sql("select message_body||'|'||coalesce(message_id::text,'null') from public.content_reports")[1] == 'x|null')
sql(f"delete from auth.users where id='{B}'")
check('deleting the reported user keeps the report', sql("select count(*) from public.content_reports")[1] == '1')
print(f'{ok} passed, {bad} failed')

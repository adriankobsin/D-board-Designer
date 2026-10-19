import subprocess,json,uuid
def sql(q,role=None,sub=None):
    pre=''
    if role: pre+=f"set role {role};"
    if sub: pre+=f"select set_config('request.jwt.claims','{json.dumps({'sub':sub,'role':role})}',false);"
    r=subprocess.run(['psql','-h','/tmp','-p','5544','-U','postgres','-d','dbt','-Atq','-v','ON_ERROR_STOP=1','-c',pre+q],capture_output=True,text=True)
    out=[l for l in (r.stdout+r.stderr).split('\n') if l.strip() and not l.startswith('{"sub"') and l.strip()!='SET' and not l.startswith(('INSERT ','UPDATE ','DELETE '))]
    return r.returncode,'\n'.join(out)
ok=bad=0
def check(n,c,d=''):
    global ok,bad
    if c: ok+=1; print('PASS',n)
    else: bad+=1; print('FAIL',n,d)
A,B,C=[str(uuid.uuid4()) for _ in range(3)]
sql("truncate public.profiles, public.projects cascade; delete from auth.users;")
sql(f"""insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('{A}','ann@x.com','{{"first_name":"Ann","last_name":"Ark"}}',now()),
 ('{B}','bob@x.com','{{"first_name":"Bob"}}',now()),
 ('{C}','cat@x.com','{{"first_name":"Cat"}}',now());""")
# projects + sharing
rc,o=sql("insert into public.projects(name,data) values ('Board','{\"circuits\":[]}') returning id",'authenticated',A); pid=o.split('\n')[0]
check('B cannot read A project before share',sql("select count(*) from public.projects",'authenticated',B)[1]=='0')
rc,o=sql(f"insert into public.project_shares(project_id,owner_id,recipient_id,project_name) values ('{pid}','{A}','{B}','Board')",'authenticated',A)
check('browser cannot create shares (Worker only)',rc!=0 and 'permission denied' in o,o)
sql(f"insert into public.project_shares(project_id,owner_id,recipient_id,project_name,note) values ('{pid}','{A}','{B}','Board','have a look')")
check('B can read the shared project',sql("select count(*) from public.projects",'authenticated',B)[1]=='1')
check('C still cannot read it',sql("select count(*) from public.projects",'authenticated',C)[1]=='0')
rc,o=sql(f"update public.projects set name='x' where id='{pid}' returning id",'authenticated',B)
check('B cannot edit shared project',pid not in o,o)
rc,o=sql(f"delete from public.projects where id='{pid}' returning id",'authenticated',B)
check('B cannot delete shared project',pid not in o,o)
check('share notification created for B',sql(f"select count(*) from public.notifications where user_id='{B}' and kind='project_share'")[1]=='1')
check('my_shares for B shows received from Ann',sql("select direction||':'||other_name from public.my_shares()",'authenticated',B)[1]=='received:Ann Ark',sql("select * from public.my_shares()",'authenticated',B))
check('my_shares for A shows sent to Bob',sql("select direction||':'||other_name from public.my_shares()",'authenticated',A)[1]=='sent:Bob')
check('C sees no shares',sql("select count(*) from public.my_shares()",'authenticated',C)[1]=='0')
rc,o=sql(f"update public.project_shares set recipient_id='{C}' where project_id='{pid}'",'authenticated',B)
check('B cannot redirect a share',rc!=0,o)
sql("update public.project_shares set seen_at=now()",'authenticated',B)
check('B can mark seen',sql("select count(*) from public.project_shares where seen_at is not null")[1]=='1')
sql(f"delete from public.project_shares where recipient_id='{B}'",'authenticated',B)
check('B can remove share; read access ends',sql("select count(*) from public.projects",'authenticated',B)[1]=='0')
# group chat (created by Worker)
G=str(uuid.uuid4())
sql(f"""insert into public.chats(id,kind,title,created_by) values ('{G}','group','Panel builders','{A}');
insert into public.chat_members(chat_id,user_id,role,status,joined_at) values ('{G}','{A}','owner','joined',now());
insert into public.chat_members(chat_id,user_id,role,status,invited_by) values ('{G}','{B}','member','invited','{A}');""")
check('invite notification for B',sql(f"select title||'|'||body from public.notifications where user_id='{B}' and kind='chat_invite'")[1]=='Panel builders|Ann Ark invited you to join this group chat.',sql(f"select * from public.notifications where user_id='{B}'"))
check('invited B sees chat in my_chats as invited',sql("select my_status from public.my_chats()",'authenticated',B)[1]=='invited')
check('C does not see the chat',sql("select count(*) from public.my_chats()",'authenticated',C)[1]=='0')
rc,o=sql(f"insert into public.chat_messages(chat_id,body) values ('{G}','hello')",'authenticated',B)
check('invited B cannot post',rc!=0,o)
rc,o=sql(f"insert into public.chat_messages(chat_id,body) values ('{G}','hello')",'authenticated',C)
check('outsider C cannot post',rc!=0,o)
rc,o=sql(f"insert into public.chat_messages(chat_id,body) values ('{G}','Welcome everyone')",'authenticated',A)
check('owner A posts',rc==0,o)
check('invited B cannot read messages',sql("select count(*) from public.chat_messages",'authenticated',B)[1]=='0')
check('no reply notification for invited B',sql(f"select count(*) from public.notifications where user_id='{B}' and kind='chat_message'")[1]=='0')
rc,o=sql(f"update public.chat_members set role='owner' where chat_id='{G}' and user_id='{B}'",'authenticated',B)
check('B cannot promote self',sql(f"select role from public.chat_members where chat_id='{G}' and user_id='{B}'")[1]=='member',o)
rc,o=sql(f"update public.chat_members set status='joined' where chat_id='{G}' and user_id='{B}'",'authenticated',B)
check('B accepts invitation',rc==0 and sql(f"select status from public.chat_members where chat_id='{G}' and user_id='{B}'")[1]=='joined',o)
check('joined_at stamped',sql(f"select joined_at is not null from public.chat_members where chat_id='{G}' and user_id='{B}'")[1]=='t')
rc,o=sql(f"update public.chat_members set status='joined' where chat_id='{G}' and user_id='{C}'",'authenticated',B)
check('B cannot accept for C',sql(f"select count(*) from public.chat_members where chat_id='{G}' and user_id='{C}'")[1]=='0')
check('B can now read earlier messages',sql("select count(*) from public.chat_messages",'authenticated',B)[1]=='1')
rc,o=sql(f"insert into public.chat_messages(chat_id,body) values ('{G}','Thanks Ann')",'authenticated',B)
check('B posts',rc==0,o)
check('A gets a reply notification',sql(f"select body from public.notifications where user_id='{A}' and kind='chat_message'")[1]=='Bob: Thanks Ann')
sql(f"insert into public.chat_messages(chat_id,body) values ('{G}','second reply')",'authenticated',B) if False else None
sql("select 1")
for i in range(2): sql(f"insert into public.chat_messages(chat_id,body) values ('{G}','more {i}')",'authenticated',B)
check('replies collapse into one unread notification',sql(f"select count(*)||':'||max(count) from public.notifications where user_id='{A}' and kind='chat_message'")[1]=='1:3',sql(f"select * from public.notifications where user_id='{A}'"))
check('unread count for A',sql("select unread from public.my_chats()",'authenticated',A)[1]=='3')
sql(f"update public.chat_members set last_read_at=now() where chat_id='{G}' and user_id='{A}'",'authenticated',A)
check('read marker clears unread',sql("select unread from public.my_chats()",'authenticated',A)[1]=='0')
check('sender names visible to members',sql(f"select count(*) from public.chat_senders('{G}')",'authenticated',B)[1]=='2')
check('sender names hidden from outsider',sql(f"select count(*) from public.chat_senders('{G}')",'authenticated',C)[1]=='0')
rc,o=sql(f"delete from public.chat_messages where sender_id='{A}'",'authenticated',B)
check('B cannot delete A messages',sql("select count(*) from public.chat_messages where sender_id='"+A+"'")[1]=='1')
rc,o=sql(f"update public.chats set title='Hijack' where id='{G}'",'authenticated',B)
check('non-owner cannot rename',sql(f"select title from public.chats where id='{G}'")[1]=='Panel builders')
sql(f"update public.chats set title='Builders' where id='{G}'",'authenticated',A)
check('owner renames',sql(f"select title from public.chats where id='{G}'")[1]=='Builders')
rc,o=sql(f"insert into public.chats(kind,title) values ('group','x')",'authenticated',A)
check('browser cannot create chats',rc!=0,o)
rc,o=sql(f"insert into public.chat_members(chat_id,user_id,status) values ('{G}','{C}','joined')",'authenticated',B)
check('member cannot add people directly',rc!=0,o)
# rate limit
rc=0
for i in range(32):
    rc,o=sql(f"insert into public.chat_messages(chat_id,body) values ('{G}','spam {i}')",'authenticated',B)
    if rc!=0: break
check('rate limit stops spam',rc!=0 and 'too quickly' in o,o)
# notifications privacy
check('B sees only own notifications',sql("select count(*) from public.notifications",'authenticated',B)[1]==sql(f"select count(*) from public.notifications where user_id='{B}'")[1])
rc,o=sql(f"update public.notifications set read_at=now() where user_id='{A}'",'authenticated',B)
check('B cannot mark A notifications',sql(f"select count(*) from public.notifications where user_id='{A}' and read_at is not null")[1]=='0')
rc,o=sql(f"insert into public.notifications(user_id,kind,title) values ('{A}','chat_invite','spoof')",'authenticated',B)
check('browser cannot forge notifications',rc!=0,o)
# leaving / ownership
sql(f"delete from public.chat_members where chat_id='{G}' and user_id='{A}'",'authenticated',A)
check('owner leaves -> B becomes owner',sql(f"select role from public.chat_members where chat_id='{G}' and user_id='{B}'")[1]=='owner')
sql(f"delete from public.chat_members where chat_id='{G}' and user_id='{B}'",'authenticated',B)
check('last member leaves -> chat and messages removed',sql(f"select count(*) from public.chats where id='{G}'")[1]=='0' and sql("select count(*) from public.chat_messages")[1]=='0')
# direct chat
D=str(uuid.uuid4())
sql(f"""insert into public.chats(id,kind,direct_key,created_by) values ('{D}','direct','{min(A,B)}:{max(A,B)}','{A}');
insert into public.chat_members(chat_id,user_id,status,joined_at) values ('{D}','{A}','joined',now()),('{D}','{B}','joined',now());""")
sql(f"insert into public.chat_messages(chat_id,body) values ('{D}','hi bob')",'authenticated',A)
check('direct chat: B notified with sender name as title',sql(f"select title from public.notifications where user_id='{B}' and kind='chat_message'")[1]=='Ann Ark')
rc,o=sql(f"update public.chats set title='x' where id='{D}'",'authenticated',A)
check('direct chats cannot be renamed',sql(f"select coalesce(title,'none') from public.chats where id='{D}'")[1]=='none')
rc,o=sql(f"insert into public.chats(kind,direct_key) values ('direct','{min(A,B)}:{max(A,B)}')")
check('duplicate direct chat blocked',rc!=0)
# suspended user
sql(f"update public.profiles set status='suspended' where id='{B}'")
rc,o=sql(f"insert into public.chat_messages(chat_id,body) values ('{D}','hello')",'authenticated',B)
check('suspended user cannot post',rc!=0,o)
check('suspended user gets no chat list',sql("select count(*) from public.my_chats()",'authenticated',B)[1]=='0')
# account deletion cascades
sql(f"delete from auth.users where id='{A}'")
check('deleting a user removes their shares/memberships',sql(f"select count(*) from public.chat_members where user_id='{A}'")[1]=='0' and sql(f"select count(*) from public.project_shares where owner_id='{A}'")[1]=='0')
print(f'{ok} passed, {bad} failed')

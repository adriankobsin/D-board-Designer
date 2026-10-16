import subprocess,json,sys,uuid
def sql(q,role=None,sub=None,expect_fail=False):
    pre=''
    if role: pre+=f"set role {role};"
    if sub: pre+=f"select set_config('request.jwt.claims','{json.dumps({'sub':sub,'role':role})}',false);"
    r=subprocess.run(['psql','-h','/tmp','-p','5544','-U','postgres','-d','dbt','-Atq','-v','ON_ERROR_STOP=1','-c',pre+q],capture_output=True,text=True)
    out='\n'.join(l for l in (r.stdout+r.stderr).split('\n') if not l.startswith('{"sub"') and l.strip() not in ('SET',) and not l.startswith('INSERT ') and not l.startswith('UPDATE ') and not l.startswith('DELETE ')).strip()
    return r.returncode,out
ok=0;bad=0
def check(name,cond,detail=''):
    global ok,bad
    if cond: ok+=1; print('PASS',name)
    else: bad+=1; print('FAIL',name,detail)
A=str(uuid.uuid4());B=str(uuid.uuid4());ADM=str(uuid.uuid4())
sql("truncate public.profiles, public.projects, public.feedback, public.usage_events, public.admin_actions cascade; delete from auth.users;")
rc,o=sql(f"""insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('{A}','a@x.com','{{"first_name":"Ann","last_name":"Ark","company":"Ark Ltd","country":"UK","occupation":"Electrician","accepted_terms":"true"}}',now()),
 ('{B}','b@x.com','{{"first_name":"Bob","occupation":"Hacker"}}',null),
 ('{ADM}','admin@x.com','{{}}',now());""")
check('signup trigger creates profiles',rc==0 and sql("select count(*) from public.profiles")[1]=='3',o)
check('invalid occupation becomes Other',sql(f"select occupation from public.profiles where id='{B}'")[1]=='Other')
check('terms accepted timestamp stored',sql(f"select accepted_terms_at is not null from public.profiles where id='{A}'")[1]=='t')
sql(f"update public.profiles set role='admin' where id='{ADM}'")
check('A sees only own profile',sql("select count(*) from public.profiles",'authenticated',A)[1].split('\n')[-1]=='1')
rc,o=sql("update public.profiles set first_name='Anna' where id=(select auth.uid()) returning first_name",'authenticated',A)
check('A can edit own name',rc==0 and 'Anna' in o,o)
rc,o=sql("update public.profiles set role='admin' where id=auth.uid()",'authenticated',A)
check('A cannot self-promote to admin',rc!=0 and 'permission denied' in o,o)
rc,o=sql("update public.profiles set status='active' where id=auth.uid()",'authenticated',A)
check('A cannot change own status',rc!=0 and 'permission denied' in o,o)
rc,o=sql(f"update public.profiles set first_name='Hacked' where id='{B}' returning id",'authenticated',A)
check('A cannot edit B profile',rc==0 and 'Hacked' not in o)
check('A cannot delete profiles',sql(f"delete from public.profiles where id='{A}'",'authenticated',A)[0]!=0)
# projects
rc,o=sql("insert into public.projects(name,data) values ('Board 1','{\"circuits\":[]}') returning id",'authenticated',A)
pid=o.split('\n')[0] if rc==0 else ''
check('A inserts project (owner defaults to auth.uid)',rc==0 and len(pid)==36,o)
check('owner id set to A',sql(f"select owner_id='{A}' from public.projects where id='{pid}'")[1]=='t')
check('B cannot see A project',sql("select count(*) from public.projects",'authenticated',B)[1].split('\n')[-1]=='0')
rc,o=sql(f"update public.projects set name='stolen' where id='{pid}' returning id",'authenticated',B)
check('B cannot update A project',rc==0 and pid not in o,o)
rc,o=sql(f"delete from public.projects where id='{pid}' returning id",'authenticated',B)
check('B cannot delete A project',rc==0 and pid not in o,o)
rc,o=sql(f"insert into public.projects(owner_id,name,data) values ('{A}','spoof','{{}}')",'authenticated',B)
check('B cannot insert project owned by A',rc!=0 and 'row-level security' in o,o)
sql(f"update public.projects set owner_id='{B}' where id='{pid}'",'authenticated',A)
check('A cannot hand project to B (owner unchanged)',sql(f"select owner_id='{A}' from public.projects where id='{pid}'")[1]=='t')
rc,o=sql("insert into public.projects(name,data) values ('x','[1,2]')",'authenticated',A)
check('data must be a JSON object',rc!=0,o)
rc,o=sql("insert into public.projects(name,data) values ('','{}')",'authenticated',A)
check('empty name rejected',rc!=0,o)
check('anon cannot read projects',sql("select count(*) from public.projects",'anon')[0]!=0)
check('anon cannot read profiles',sql("select count(*) from public.profiles",'anon')[0]!=0)
# updated_at semantics
t1=sql(f"select updated_at from public.projects where id='{pid}'")[1]
sql(f"update public.projects set last_opened_at=now() where id='{pid}'",'authenticated',A)
t2=sql(f"select updated_at from public.projects where id='{pid}'")[1]
check('opening a project does not bump updated_at',t1==t2,(t1,t2))
sql("select pg_sleep(0.05)")
sql(f"""update public.projects set data='{{"circuits":[1]}}' where id='{pid}'""",'authenticated',A)
t3=sql(f"select updated_at from public.projects where id='{pid}'")[1]
check('editing data bumps updated_at',t3!=t1,(t1,t3))
# duplicate + rename (client does insert; verify both work)
rc,o=sql("update public.projects set name='Renamed' where name='Board 1' returning name",'authenticated',A)
check('A can rename',rc==0 and 'Renamed' in o,o)
# usage + feedback
check('A logs usage event',sql("insert into public.usage_events(event) values ('login')",'authenticated',A)[0]==0)
check('A cannot log as B',sql(f"insert into public.usage_events(user_id,event) values ('{B}','login')",'authenticated',A)[0]!=0)
check('A cannot read usage events',sql("select * from public.usage_events",'authenticated',A)[0]!=0)
check('bad event name rejected',sql("insert into public.usage_events(event) values ('drop table')",'authenticated',A)[0]!=0)
check('A sends feedback',sql("insert into public.feedback(message,rating,page) values ('Great',5,'tools')",'authenticated',A)[0]==0)
check('B cannot read A feedback',sql("select count(*) from public.feedback",'authenticated',B)[1].split('\n')[-1]=='0')
check('A cannot post feedback as B',sql(f"insert into public.feedback(user_id,message) values ('{B}','hi')",'authenticated',A)[0]!=0)
check('A cannot mark feedback reviewed on insert',sql("insert into public.feedback(message,status) values ('x','reviewed')",'authenticated',A)[0]!=0)
check('A cannot touch admin_actions',sql("select * from public.admin_actions",'authenticated',A)[0]!=0)
check('touch_last_seen works for A',sql("select public.touch_last_seen()",'authenticated',A)[0]==0 and sql(f"select last_seen_at is not null from public.profiles where id='{A}'")[1]=='t')
# admin functions
check('authenticated cannot call admin_stats',sql("select public.admin_stats()",'authenticated',ADM)[0]!=0)
check('anon cannot call admin_list_users',sql("select * from public.admin_list_users()",'anon')[0]!=0)
rc,o=sql("select public.admin_stats()",'service_role')
st=json.loads(o) if rc==0 else {}
check('service role gets stats',rc==0 and st.get('users_total')==3 and st.get('projects_total')==1 and st.get('users_verified')==2,o[:200])
check('signup chart has 30 days',len(st.get('signups_by_day',[]))==30)
rc,o=sql("select email,project_count,total_count from public.admin_list_users('ann',null,null,10,0)",'service_role')
check('admin search by name works',rc==0 and 'a@x.com|1|1' in o,o)
rc,o=sql("select email from public.admin_list_users(null,null,'no',10,0)",'service_role')
check('admin filter unverified',rc==0 and o.strip()=='b@x.com',o)
rc,o=sql("select count(*) from public.admin_list_users('%',null,null,10,0)",'service_role')
check('wildcards in search are neutralised',rc==0 and o=='3',o)
# suspension
sql(f"update public.profiles set status='suspended' where id='{A}'")
check('suspended user can still read own projects',sql("select count(*) from public.projects",'authenticated',A)[1].split('\n')[-1]=='1')
rc,o=sql("insert into public.projects(name,data) values ('new','{}')",'authenticated',A)
check('suspended user cannot create projects',rc!=0,o)
sql("update public.projects set name='z'",'authenticated',A)
check('suspended user cannot edit projects',sql(f"select name<>'z' from public.projects where id='{pid}'")[1]=='t')
sql("delete from public.projects",'authenticated',A)
check('suspended user cannot delete projects',sql("select count(*) from public.projects")[1]=='1')
check('suspended user cannot log events',sql("insert into public.usage_events(event) values ('login')",'authenticated',A)[0]!=0)
sql(f"update public.profiles set status='active' where id='{A}'")
# cascade
sql(f"delete from auth.users where id='{A}'")
check('deleting user cascades profile+projects+events',sql("select (select count(*) from public.profiles where id='%s')+(select count(*) from public.projects)+(select count(*) from public.usage_events)"%A)[1]=='0')
check('feedback survives deletion, anonymised',sql("select count(*) from public.feedback where user_id is null")[1]=='1')
print(f'\n{ok} passed, {bad} failed'); sys.exit(1 if bad else 0)

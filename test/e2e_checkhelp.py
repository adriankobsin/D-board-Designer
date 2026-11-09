"""Checks tab: every fail shows what is wrong, how to fix it and a button to go there.
Real Worker + front-end, TEST-ONLY Supabase mock."""
import json, sys, urllib.request
from playwright.sync_api import sync_playwright
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8799'; MOCK='http://127.0.0.1:54321'; res=[]
def ok(n,c,i=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+(' :: '+str(i)[:300] if not c and i else ''))
def post(path,body): return json.loads(urllib.request.urlopen(urllib.request.Request(MOCK+path,json.dumps(body).encode(),{'Content-Type':'application/json'})).read() or b'{}')
post('/__test/reset',{})
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1366,'height':900}); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('[data-m=register]'); pg.click('[data-m=register]')
    for k,v in dict(first_name='Pat',last_name='Test',email='pat@example.com',password='Passw0rd!!',password2='Passw0rd!!').items(): pg.fill('#'+k,v)
    pg.select_option('#country',index=9); pg.select_option('#occupation','Marine Electrician'); pg.check('#terms'); pg.click('#saGo'); pg.wait_for_selector('text=Check your email')
    post('/__test/confirm',{'email':'pat@example.com'})
    pg.goto(BASE); pg.wait_for_selector('#saForm'); pg.fill('#email','pat@example.com'); pg.fill('#password','Passw0rd!!'); pg.click('#saGo'); pg.wait_for_selector('text=Welcome, Pat')
    pg.click('[data-sa=new]'); pg.wait_for_selector('.wrap',state='visible'); pg.wait_for_timeout(1000)
    layout=[(1,'M1',1),(2,'M1',2),(3,'M1',3),(4,'M1',4),(5,'M2',1),(6,'M2',2),(7,'M2',3),(8,'M2',4),(9,'M3',1),(10,'M3',2),(14,'M3',3),(15,'M3',4),(16,'M4',1),(17,'M4',2),(18,'M4',3),(19,'M4',4),(20,'M5',1),(21,'M5',2),(22,'M5',3),(23,'M5',4),(24,'M6',1),(25,'M6',2),(26,'M6',3),(27,'M6',4),(28,'M7',1),(29,'M7',4),(30,'M8',1),(31,'M8',2),(32,'M8',3)]
    circ=lambda i,ref,mod,zone: dict(P=200,id='c%d'%i,pf=.95,ctl='',dem=1,grp=1,inO=0,len=10,mod=mod,ref=ref,area='',name='GR',prot='MCB',size='auto',type='lighting',zone=zone,cable='pvc',curve='B',phase='L1')
    cs=[circ(i,'C%d'%i,m,z) for i,m,z in layout]+[circ(i,'C%d'%(30+k),'',1) for k,i in enumerate(range(33,46))]
    mods=[dict(id='M%d'%i,len=8,size='auto',bname='DIMMER %d'%i,cable='pvc',inSel=10,model='LQSE-4A5-120-D',phase='L1') for i in range(1,12)]
    d=dict(f=50,ik=6,seg=True,spd=True,std='bs',vLN=230,vdL=None,vdO=None,cols=24,dali=dict(units=[],custom=[]),name='EXT',enclW=0,sysId='1p230',custom=[],incLen=12,phases=1,ambient=30,dcPoles='2P',incomer=32,modules=mods,cabinAmb=40,circuits=cs,incCable='xlpe',diversity=.8,rcboW=1)
    pg.evaluate("(d)=>{ Object.keys(S).forEach(k=>delete S[k]); Object.assign(S,d); fix(); refresh(true); tab='checks'; draw(); renderTabs(); }",d)
    pg.wait_for_selector('.checks li.chk')
    n=pg.locator('.checks li.err').count()
    ok('12 fails listed', n==12, n)
    ok('every fail has a How to fix line', pg.locator('.checks li.err').count()==pg.locator('.checks li.err .how b').count())
    txt=pg.inner_text('.checks')
    ok('voltage fail names the 230 V module', 'LQSE-4A5-230-D' in txt, txt[:400])
    ok('incomer fail says to choose 40 A', 'Incomer rating override (A) to 40 A' in txt, txt[-600:])
    li=pg.locator('.checks li.err').first
    ok('each fail has a go-to button', li.locator('[data-a=chkgo]').count()==1)
    li.locator('[data-a=chkgo]').click(); pg.wait_for_timeout(400)
    ok('go-to opens the module in the Panel', pg.evaluate("tab")=='panel' and pg.evaluate("sel")=='m:M1', pg.evaluate("[tab,sel]"))
    ok('inspector shows the problems with this item', 'Problems with this item' in pg.inner_text('.insp') and 'How to fix' in pg.inner_text('.insp'))
    ok('summary line has a See how to fix button', pg.locator('.stats [data-a=tab][data-t=checks]').count()>=1)
    pg.locator('.stats [data-a=tab][data-t=checks]').first.click(); pg.wait_for_timeout(300)
    ok('that button opens Checks', pg.evaluate("tab")=='checks')
    pg.evaluate("S.modules.forEach(m=>m.model='LQSE-4A5-230-D'); S.incomer=40; refresh(true)")
    ok('after applying the suggested fixes no fail remains', pg.locator('.checks li.err').count()==0 and pg.evaluate("R.checks.filter(c=>c.lvl=='err').length")==0, pg.evaluate("R.checks.filter(c=>c.lvl=='err').map(c=>c.msg)"))
    ok('no page errors', not errs, errs)
    b.close()
print('%d/%d passed'%(sum(res),len(res))); sys.exit(0 if all(res) else 1)

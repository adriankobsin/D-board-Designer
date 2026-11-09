"""Lighting circuit details (ref, area, controlled by) in the diagram, schedule and PDF export."""
import json, sys, subprocess, urllib.request
from playwright.sync_api import sync_playwright
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8799'; MOCK='http://127.0.0.1:54321'; res=[]
def ok(n,c,i=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+(' :: '+str(i)[:300] if not c and i else ''))
def post(path,body): return json.loads(urllib.request.urlopen(urllib.request.Request(MOCK+path,json.dumps(body).encode(),{'Content-Type':'application/json'})).read() or b'{}')
post('/__test/reset',{})
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1366,'height':900},accept_downloads=True); pg=ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('[data-m=register]'); pg.click('[data-m=register]')
    for k,v in dict(first_name='Pat',last_name='Test',email='pat@example.com',password='Passw0rd!!',password2='Passw0rd!!').items(): pg.fill('#'+k,v)
    pg.select_option('#country',index=9); pg.select_option('#occupation','Marine Electrician'); pg.check('#terms'); pg.click('#saGo'); pg.wait_for_selector('text=Check your email')
    post('/__test/confirm',{'email':'pat@example.com'})
    pg.goto(BASE); pg.wait_for_selector('#saForm'); pg.fill('#email','pat@example.com'); pg.fill('#password','Passw0rd!!'); pg.click('#saGo'); pg.wait_for_selector('text=Welcome, Pat')
    pg.click('[data-sa=new]'); pg.wait_for_selector('.wrap',state='visible'); pg.wait_for_timeout(1000)
    pg.evaluate("S.modules.length || (S.modules.push({id:'M1',model:'LQSE-4A-D',phase:'L1',len:10,inSel:0,cable:'pvc',size:'auto'}), refresh(true))")
    mid=pg.evaluate("S.modules.find(m=>(libOf(m.model)||{}).power&&libOf(m.model).zones>=2).id")
    drv=pg.evaluate("DALI_CAT.find(c=>c.k=='driver'&&c.mt=='din').m")
    pg.evaluate("dS().units.push({id:'D1',model:%s,link:'',label:'Dining drivers',area:'Dining'}); refresh(true)"%json.dumps(drv))
    pg.evaluate("""(()=>{const mk=(o)=>Object.assign({id:nextId(S.circuits,'c'),ref:'L'+(S.circuits.length+1),type:'lighting',mod:'',ctl:'',area:'',zone:1,P:200,pf:1,phase:'L1',len:10,prot:'MCB',curve:'B',dem:1,grp:1,cable:'pvc',size:'auto',inO:0},o);
      S.circuits.push(mk({ref:'LT1',name:'Saloon cove',area:'Main saloon',mod:'%s',zone:1,P:300}));
      S.circuits.push(mk({ref:'LT2',name:'Dining downlights',area:'Dining room',ctl:'d:D1'}));
      S.circuits.push(mk({ref:'LT3',name:'Bridge lamps',area:'Wheelhouse'}));
      fix(); refresh(true);})()"""%mid)
    pg.evaluate("tab='diagram'; draw(); renderTabs()")
    svg=pg.evaluate("document.querySelector('#view').innerText")
    ok('diagram shows area for a dimmer-channel circuit', 'Area: Main saloon' in svg, svg[-400:])
    ok('diagram shows area and driver for a DALI circuit', 'Area: Dining room' in svg and 'Ctrl: D1' in svg)
    ok('diagram shows area for a direct lighting circuit', 'Area: Wheelhouse' in svg)
    rows=pg.evaluate("schedRows()"); head=pg.evaluate("SCHED_HEAD")
    ok('schedule has Area and Controlled by columns', head[-2:]==['Area','Controlled by'] and all(len(r)==len(head) for r in rows), head)
    r2=[r for r in rows if r[0]=='LT2'][0]
    ok('schedule row carries area and controller', r2[16]=='Dining room' and 'D1' in r2[17], r2)
    pg.evaluate("tab='export'; draw(); renderTabs()")
    pg.evaluate("Object.keys(pdfOpt).forEach(k=>pdfOpt[k]=false); pdfOpt.diagram=true; pdfOpt.sched=true; pdfOpt.lighting=true")
    with pg.expect_download(timeout=60000) as d: pg.evaluate("exportPDF()")
    f='/tmp/lightdraw.pdf'; d.value.save_as(f)
    txt=subprocess.run(['pdftotext','-layout',f,'-'],capture_output=True,text=True).stdout
    ok('PDF diagram shows area line', 'Area: Main saloon' in txt, txt[:200])
    ok('PDF circuit schedule has Area column', 'Dining room' in txt and 'Area' in txt)
    ok('PDF has lighting schedule section', 'Lighting schedule' in txt and 'What each output controls' in txt)
    ok('PDF lighting schedule lists controllers', 'Dining drivers' in txt or 'D1' in txt)
    ok('no page errors', not errs, errs)
    b.close()
print('%d/%d passed'%(sum(res),len(res))); sys.exit(0 if all(res) else 1)

"""Phone layout audit (test stack): every screen at 360x740, 412x915 and 740x360 must fit the screen width without the browser zooming out; an open chat must show its message box. Screenshots go to /tmp/ct/phone-audit."""
import json, subprocess, os, sys
from playwright.sync_api import sync_playwright
OUT = '/tmp/ct/phone-audit'; os.makedirs(OUT, exist_ok=True)
def psql(q): return subprocess.run(['psql', '-h', '/tmp', '-p', '5544', '-U', 'postgres', '-d', 'dbt', '-Atq', '-c', q], capture_output=True, text=True).stdout.strip()
psql("truncate public.projects, public.chats, public.notifications, public.content_reports, public.user_blocks cascade; delete from auth.users;")
for e, f, l in [('demo@waveavi.com', 'Adrian', 'Kobsin'), ('marta@x.com', 'Marta', 'Silva')]:
    psql(f"insert into auth.users(email,raw_user_meta_data,email_confirmed_at) values ('{e}','{json.dumps({'first_name': f, 'last_name': l, 'company': 'Atlântico Marine Engineering Ltd', 'country': 'Portugal', 'occupation': 'Panel Builder'})}',now())")
psql("update public.profiles set role='admin' where email='demo@waveavi.com'")
FIND = """() => {
  const W = innerWidth, out = [];
  const scrollable = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement){ const cs = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(cs.overflowX) && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
  document.querySelectorAll('body *').forEach(el => {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.position === 'fixed' && r.right <= W + 1) return;
    if (r.right > W + 1 || r.left < -1){ if (scrollable(el)) return;
      out.push((el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')) + ' [' + Math.round(r.left) + '..' + Math.round(r.right) + ']'); }
  });
  return {doc: document.documentElement.scrollWidth, W, items: out.slice(0, 8)};
}"""
def check(pg, name, tag):
    pg.wait_for_timeout(600)
    r = pg.evaluate(FIND)
    want = int(tag.split('x')[0])
    bad = r['doc'] > r['W'] + 1 or r['items'] or r['W'] != want
    print(('BAD ' if bad else 'ok  ') + f"{tag} {name}: page {r['doc']}/{r['W']} (screen {want})" + ('' if not r['items'] else ' -> ' + '; '.join(r['items'])))
    pg.screenshot(path=f'{OUT}/{tag}_{name}.png', full_page=False)
with sync_playwright() as p:
    b = p.chromium.launch()
    for W, H in [(360, 740), (412, 915), (740, 360)]:
        tag = f'{W}x{H}'
        ctx = b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=2, is_mobile=True, has_touch=True, bypass_csp=True); pg = ctx.new_page()
        pg.goto('http://localhost:8799'); pg.wait_for_selector('#saForm'); check(pg, 'signin', tag)
        pg.click('text=Create account') if pg.locator('text=Create account').count() else None; pg.wait_for_timeout(300); check(pg, 'register', tag)
        pg.goto('http://localhost:8799'); pg.wait_for_selector('#saForm'); pg.fill('#email', 'demo@waveavi.com'); pg.fill('#password', 'Passw0rd!'); pg.click('#saGo'); pg.wait_for_selector('.sa-proj, .sa-empty')
        pg.evaluate("(async()=>{ await saCreateProject(exampleProject(),'Main deck distribution DB-1 with a long project name'); })()"); pg.wait_for_timeout(1200)
        pg.evaluate("saGo('dashboard')"); pg.wait_for_selector('.sa-proj'); check(pg, 'dashboard', tag)
        pg.click('.sa-bar [data-sa=menu]'); check(pg, 'menu', tag); pg.click('.sa-bar [data-sa=menu]')
        pg.evaluate("SA.com.tab='members'; saGo('community')"); pg.wait_for_selector('.sa-mcard'); check(pg, 'members', tag)
        pg.evaluate("saOpenDirect && document.querySelector('.sa-mcard [data-sa=mchat]').click()"); pg.wait_for_selector('#saSend', timeout=10000); pg.wait_for_timeout(500); check(pg, 'chat', tag)
        r = pg.evaluate("(()=>{const f=document.querySelector('#saSend').getBoundingClientRect(), h=document.querySelector('.sa-chd').getBoundingClientRect(); return [Math.round(h.top), Math.round(f.bottom), innerHeight, Math.round(document.querySelector('.sa-bar').getBoundingClientRect().height)]})()")
        print(('ok  ' if r[1] <= r[2] and r[0] >= r[3] - 2 else 'BAD ') + f"{tag} chat fits: chat header top {r[0]} (below app header {r[3]}), message box bottom {r[1]} of screen {r[2]}")
        pg.evaluate("SA.com.tab='shared'; SA.com.active=null; saGo('community')"); pg.wait_for_timeout(800); check(pg, 'shared', tag)
        pg.evaluate("saGo('import')"); pg.wait_for_timeout(800); check(pg, 'import', tag)
        pg.evaluate("saGo('account')"); pg.wait_for_selector('#saProf'); check(pg, 'account', tag)
        pg.evaluate("SA.adminTab='users'; saGo('admin')"); pg.wait_for_timeout(1500); check(pg, 'admin_users', tag)
        pg.evaluate("SA.adminTab='reports'; saGo('admin')"); pg.wait_for_timeout(1200); check(pg, 'admin_reports', tag)
        pg.evaluate("saGo('dashboard')"); pg.wait_for_selector('.sa-proj'); pg.click('.sa-proj >> nth=0 >> [data-sa=open]'); pg.wait_for_selector('.wrap', state='visible'); pg.wait_for_timeout(800)
        for t in ['setup', 'panel', 'circuits', 'equipment', 'checks', 'diagram', 'dali', 'tools', 'export', 'help']:
            pg.evaluate("window.scrollTo(0,0)"); pg.click(f'#tabs [data-t={t}]') if pg.locator(f'#tabs [data-t={t}]').count() else pg.click('#helpbtn'); pg.wait_for_timeout(700); check(pg, 'designer_' + t, tag)
        ctx.close()
    b.close()

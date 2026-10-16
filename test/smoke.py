from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(accept_downloads=True,viewport={'width':1280,'height':850}); pg=c.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.goto('http://localhost:8800'); pg.wait_for_selector('#tabs button'); 
    print('local mode: designer visible', pg.is_visible('.wrap'), 'saas chrome', pg.query_selector('#saUM') is not None)
    for t in ['setup','circuits','equipment','checks','diagram','tools','export','help','panel']:
        pg.click(f'#tabs [data-t={t}]') if pg.query_selector(f'#tabs [data-t={t}]') else pg.click(f'text={t.capitalize()}'); pg.wait_for_timeout(250)
    pg.click('#tabs >> text=Export')
    for label in ['PDF','Excel','CSV']:
        try:
            with pg.expect_download(timeout=8000) as d: pg.click(f'#view button:has-text("{label}")')
            print('download',label,d.value.suggested_filename)
        except Exception as e: print('download',label,'FAIL',str(e)[:80])
    print('errors',[e for e in errs if 'Failed to load resource' not in e][:5])

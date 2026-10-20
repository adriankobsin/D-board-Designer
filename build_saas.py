#!/usr/bin/env python3
"""Assemble public/ (the static frontend served by the Worker) from the designer sources plus the account layer.
Usage:  python3 build_saas.py            (run from the saas/ folder)"""
import os, re, shutil, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.environ.get('DESIGNER_SRC', os.path.join(HERE, 'designer'))   # designer sources (calc.js, ui.js, ...)
PWA = os.path.join(HERE, 'pwa_base')                                     # index.html template, icons, manifest, vendor libs
OUT = os.path.join(HERE, 'public')
rd = lambda p: open(p, encoding='utf-8').read()
subprocess.run([sys.executable, 'mki18n.py'], cwd=SRC, check=True, stdout=subprocess.DEVNULL)   # regenerates i18n-data.js
idx = rd(os.path.join(PWA, 'index.html'))
head = idx[:idx.index('<style>')]
style = rd(os.path.join(SRC, 'style.css')) + '\n' + rd(os.path.join(HERE, 'src_app', 'saas.css'))
a = idx.index('</style>\n') + len('</style>\n'); b = idx.index('<script src="vendor/xlsx')
body = rd(os.path.join(SRC, 'body.html'))
js = '\n'.join(rd(os.path.join(SRC, f)) for f in ['calc.js', 'seed.js', 'i18n.js', 'i18n-data.js', 'tools.js', 'dali.js', 'ui.js']) + '\n' + rd(os.path.join(HERE, 'src_app', 'saas.js'))
sw_reg = idx[idx.index("if ('serviceWorker'"):idx.index('</script>', idx.index("if ('serviceWorker'"))]
html = head + '<style>' + style + '</style>\n' + body + '<script src="vendor/xlsx.full.min.js"></script>\n<script src="vendor/jspdf.umd.min.js"></script>\n<script src="vendor/supabase.js"></script>\n<script>\n' + js + '\n' + sw_reg + '</script>\n' + idx[idx.index('</script>', idx.index("if ('serviceWorker'")) + 9:]
os.makedirs(os.path.join(OUT, 'vendor'), exist_ok=True)
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(html)
for f in ['manifest.webmanifest']: shutil.copy(os.path.join(PWA, f), os.path.join(OUT, f))
shutil.copytree(os.path.join(PWA, 'icons'), os.path.join(OUT, 'icons'), dirs_exist_ok=True)
for f in ['xlsx.full.min.js', 'jspdf.umd.min.js', 'supabase.js']: shutil.copy(os.path.join(HERE, 'vendor_src', f) if f == 'supabase.js' else os.path.join(PWA, 'vendor', f), os.path.join(OUT, 'vendor', f))
shutil.copy(os.path.join(HERE, 'src_app', 'call.html'), os.path.join(OUT, 'call.html'))   # call screen (RealtimeKit)
shutil.copytree(os.path.join(HERE, 'vendor_src', 'rtk'), os.path.join(OUT, 'vendor', 'rtk'), dirs_exist_ok=True)
for f in os.listdir(os.path.join(HERE, 'pages')):   # public pages for the app stores: privacy, terms, support, delete-account
    if f.endswith('.html'): shutil.copy(os.path.join(HERE, 'pages', f), os.path.join(OUT, f))
sw = rd(os.path.join(HERE, 'src_app', 'sw.js')); open(os.path.join(OUT, 'sw.js'), 'w').write(sw)
print('built public/index.html', len(html) // 1024, 'KB')

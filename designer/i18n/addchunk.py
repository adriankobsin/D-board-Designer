#!/usr/bin/env python3
"""Reads chunks/*.txt rows 'N ‖ ro ‖ it ‖ fr ‖ es ‖ pt ‖ ja ‖ vi ‖ th ‖ ru ‖ pl ‖ de ‖ zh ‖ km' and writes new_<lang>.txt.
   Row N must exist in new_en.txt (or master.txt for Khmer back-fill rows, flagged with prefix K)."""
import re,glob,os,sys
LANGS=['ro','it','fr','es','pt','ja','vi','th','ru','pl','de','zh','km']
os.chdir(os.path.dirname(os.path.abspath(__file__)))
en={}
for f in ('master.txt','new_en.txt'):
    for l in open(f,encoding='utf8').read().split('\n'):
        if '|' in l:
            n,t=l.split('|',1); en[n]=t
ph=lambda s:sorted(re.findall(r'\{\d+\}',s)); tg=lambda s:sorted(re.findall(r'</?\w+[^>]*>',s))
out={L:{} for L in LANGS}; errs=[]
for f in sorted(glob.glob('chunks/*.txt')):
    for ln in open(f,encoding='utf8').read().split('\n'):
        if not ln.strip() or ln.startswith('#'): continue
        p=[x.strip() for x in ln.split('‖')]
        n=p[0]
        if n not in en: errs.append((f,n,'unknown number')); continue
        cols=p[1:]
        if len(cols)==1 and f.endswith('_km.txt'): cols=[None]*12+cols
        if len(cols)!=13: errs.append((f,n,'columns %d'%len(cols))); continue
        for L,t in zip(LANGS,cols):
            if not t: continue
            if ph(en[n])!=ph(t): errs.append((f,n,L,'placeholders',ph(en[n]),ph(t))); continue
            if tg(en[n])!=tg(t): errs.append((f,n,L,'tags')); continue
            out[L][n]=t
for L in LANGS:
    open('new_%s.txt'%L,'w',encoding='utf8').write('\n'.join('%s|%s'%(n,t) for n,t in sorted(out[L].items(),key=lambda x:int(x[0])))+'\n')
want=[n for n in en if int(n)>=716]
print({L:len(out[L]) for L in LANGS}); print('errors',errs[:20],len(errs))

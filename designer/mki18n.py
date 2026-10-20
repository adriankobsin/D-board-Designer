import json,os,re,sys
LANGS=['ro','it','fr','es','pt','ja','vi','th','ru','pl','de','zh','km','id']
os.chdir(os.path.dirname(os.path.abspath(__file__)))
master={}
order=[]
if os.path.exists('i18n/master.txt'):
    for ln in open('i18n/master.txt',encoding='utf8').read().split('\n'):
        if not ln.strip(): continue
        n,t=ln.split('|',1); master[n]=t; order.append(n)
ph=lambda s:sorted(re.findall(r'\{\d+\}',s))
tg=lambda s:sorted(re.findall(r'</?\w+[^>]*>',s))
out={}
rep=[]
for L in LANGS:
    E={};P=[];miss=[];bad=[]
    tl={}
    p='i18n/%s.txt'%L
    if os.path.exists(p):
        for ln in open(p,encoding='utf8').read().split('\n'):
            if '|' not in ln: continue
            n,t=ln.split('|',1); tl[n]=t
    for n in order:
        en=master[n]; t=tl.get(n)
        if not t: miss.append(n); continue
        if ph(en)!=ph(t): bad.append((n,'placeholders')); continue
        if tg(en)!=tg(t): bad.append((n,'tags')); continue
        if re.search(r'\{\d+\}',en): P.append([en,t])
        else: E[en]=t
    # longest literal first for patterns
    P.sort(key=lambda x:-len(re.sub(r'\{\d+\}','',x[0])))
    out[L]={'E':E,'P':P}
    if L in ('ja','zh'): out[L]['sp']=0
    rep.append((L,len(order),len(miss),bad))
open('i18n-data.js','w',encoding='utf8').write('window.DICT='+json.dumps(out,ensure_ascii=False,separators=(',',':'))+';\n')
for L,n,m,b in rep:
    print(L,'total',n,'missing',m,'bad',b[:5])

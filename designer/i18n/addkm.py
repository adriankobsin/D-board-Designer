import re,glob,sys
ph=lambda s:sorted(re.findall(r'\{\d+\}',s))
tg=lambda s:sorted(re.findall(r'</?\w+[^>]*>',s))
master={}
for l in open('master.txt',encoding='utf8').read().split('\n'):
    if '|' in l:
        n,t=l.split('|',1); master[n]=t
have={}
for l in open('km.txt',encoding='utf8').read().split('\n'):
    if '|' in l:
        n,t=l.split('|',1); have[n]=t
errs=[];add=0
for f in sorted(glob.glob('kmchunks/*.txt')):
    for l in open(f,encoding='utf8').read().split('\n'):
        if not l.strip(): continue
        n,t=[x.strip() for x in l.split(' ‖ ',1)]
        if n not in master: errs.append((f,n,'unknown')); continue
        if ph(master[n])!=ph(t): errs.append((f,n,'ph')); continue
        if tg(master[n])!=tg(t): errs.append((f,n,'tags')); continue
        if n not in have: have[n]=t; add+=1
open('km.txt','w',encoding='utf8').write('\n'.join('%s|%s'%(n,have[n]) for n in sorted(have,key=int))+'\n')
print('km total',len(have),'added',add,'errors',errs)

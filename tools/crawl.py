import re,html,json,subprocess,sys,os,concurrent.futures as cf
B='https://docs.sadrp.net'
def get(p):
    r=subprocess.run(['curl','-sS','-m','30',B+p],capture_output=True,text=True)
    return r.stdout
def links(s): return set(re.findall(r'href="(/[^"#?]*)"',s))
os.chdir(os.path.dirname(os.path.abspath(__file__)))
idx=get('/penal-code')
all_links=links(idx)
skip=('/acts','/case-laws','/doctrines','/sadrp-bill','/rules','/server-rules','/gameplay','/discord','/auth','/search','/driving-record','/civilian','/miscellaneous','/sadrp-hub','/penal-code','/municipal')
cats=sorted(l for l in all_links if l.count('/')==1 and not l.startswith(skip) and l!='/')
# discover more from category pages
with cf.ThreadPoolExecutor(8) as ex:
    pages=dict(zip(cats,ex.map(get,cats)))
charges=set()
for c,s in pages.items():
    for l in links(s)|all_links:
        if l.startswith(c+'/') : charges.add(l)
charges=sorted(charges)
print(len(cats),len(charges),file=sys.stderr)
def parse(p):
    s=get(p)
    s2=re.sub(r'<(script|style)[^>]*>.*?</\1>','',s,flags=re.S)
    i=s2.find('art-content')
    seg=s2[i:]
    t=re.sub(r'<br\s*/?>','\n',seg); t=re.sub(r'</(p|li|div|h\d)>','\n',t)
    t=re.sub(r'<[^>]+>','',t); t=html.unescape(t)
    lines=[x.strip() for x in t.split('\n') if x.strip()]
    return {'path':p,'category_path':'/'+p.split('/')[1],'lines':lines}
with cf.ThreadPoolExecutor(8) as ex:
    res=list(ex.map(parse,charges))
catnames={}
for c,s in pages.items():
    m=re.search(r'<title>(.*?)</title>',s,re.S); catnames[c]=html.unescape(m.group(1)).split(' — ')[0].strip() if m else c
json.dump({'cats':catnames,'pages':res},open('raw.json','w'),indent=1)

import json,re,sys
d=json.load(open(sys.argv[1]))
H=re.compile(r'^\[(\d+)\]\s*([\d.]+)\s*-\s*(.+)$')
CL=re.compile(r'^\**\s*(Felony|Misdemeanor|Infraction|Federal Charge)\b(.*)$',re.I)
def num(s,keys):
    for k in keys:
        m=re.search(k+r'\s*[:\-]\s*([^\n]+?)$',s,re.I|re.M)
        if m: return m.group(1).strip()
MENS=['with premeditation','premeditation and deliberation','with malice','with the intent','with intent','with the specific intent','intentionally','knowingly','willfully','wilfully','purposely','recklessly','with reckless disregard','negligently','criminal negligence','maliciously','unlawfully']
def elements(defn,cls):
    E=[{'key':'identity','text':'Identity — the suspect is positively identified as the person who committed the offense.'}]
    sents=[s.strip() for s in re.split(r'(?<=[.;])\s+(?=[A-Z])',defn) if s.strip()]
    for i,s in enumerate(sents[:4]):
        if len(s)<12: continue
        E.append({'key':f'act{i+1}','text':('Conduct — ' if i==0 else 'Circumstance — ')+s})
    low=defn.lower()
    found=[m for m in MENS if m in low and m!='unlawfully']
    if found:
        E.append({'key':'mens','text':'Mental state — the suspect acted '+found[0]+' (as required by statute).'})
    E.append({'key':'juris','text':'Jurisdiction & venue — the offense occurred within the State of San Andreas (Blaine County / Los Santos) and within the investigating agency\'s authority.'})
    return E
out=[]
for p in d['pages']:
    L=p['lines']
    vi=next((k for k,x in enumerate(L) if re.match(r'^[\d,]+ views?$',x)),None)
    if vi is None: continue
    end=next((k for k,x in enumerate(L) if x.startswith('v1.')),len(L))
    body=L[vi+1:end]
    while body and H.match(body[-1]): body.pop()
    top=H.match(L[vi-3] if H.match(L[vi-3]) else L[5])
    if not top: continue
    # split into blocks
    blocks=[[top.groups(),[]]]
    for x in body:
        m=H.match(x)
        if m and m.group(2).count('.')>=1 and m.group(2).split('.')[0]==top.group(2):
            blocks.append([m.groups(),[]]); continue
        blocks[-1][1].append(x)
    for (t,s,name),lines in blocks:
        ci=next((k for k,x in enumerate(lines) if CL.match(x) and len(x)<60),None)
        txt='\n'.join(lines)
        if ci is None and len(blocks)>1 and s==top.group(2): continue  # parent placeholder
        cls=None
        if ci is not None:
            cl=lines[ci].strip('* :')
            cls=re.sub(r'\s*Sentence.*','',cl).strip(' :')
            defn=' '.join(lines[:ci]); rest=lines[ci+1:]
        else:
            defn=' '.join(lines[:1]); rest=lines[1:]
        ex=[];det=[];mode=0
        for x in rest:
            if re.match(r'^Examples?:?$',x): mode=1;continue
            if mode and re.match(r'^\d+\.',x): ex.append(re.sub(r'^\d+\.\s*','',x));continue
            mode=0
            if re.match(r'^(Sentence|Fines?)\s*[:\-]',x): continue
            det.append(x)
        sent=num(txt,['Sentence']) ; fine=num(txt,['Fines?'])
        name=re.sub(r'\s+',' ',name).strip()
        fed='(Federal Charge)' in name or (cls or '').lower().startswith('federal')
        out.append(dict(code=f'[{t}] {s}',title=t,section=s,name=name,category=d['cats'][p['category_path']],
          url='https://docs.sadrp.net'+p['path'],classification=cls or ('Federal Charge' if fed else 'See statute'),
          federal=fed,definition=defn.strip(),sentence=sent,fine=fine,details=det[:12],examples=ex,
          elements=elements(defn,cls)))
def key(o): return [int(o['title'])]+[int(x) for x in o['section'].split('.') if x.isdigit()]
out.sort(key=key)
json.dump(out,open(sys.argv[2],'w'),indent=1,ensure_ascii=False)
print(len(out))
from collections import Counter; print(Counter(o['classification'] for o in out).most_common(20))
for o in out:
  if o['title']=='2': print(o['code'],o['name'],'|',o['classification'],o['sentence'],o['fine'],len(o['elements']))

import json,re,unicodedata,csv,time
from pathlib import Path
from collections import defaultdict,Counter
ROOT=Path('/mnt/data/c2a21_work/modules/modules/hanzi-stroke'); DATA=ROOT/'data'
RADROOT=Path('/mnt/data/c2a21_work/rad214/modules/hanzi-stroke/data/learning/radicals')
OUT=Path('/mnt/data/c2a21_out/modules/hanzi-stroke/data/learning/unified-lookup/all-sources'); (OUT/'records').mkdir(parents=True,exist_ok=True)
HAN=re.compile(r'[\u3400-\u9fff\U00020000-\U0002EBEF]')
def hans(s): return ''.join(HAN.findall(s or ''))
def jp(p,d=None):
 try:return json.load(open(p,encoding='utf-8'))
 except:return d
def py(s):return re.sub(r'\s+',' ',(s or '').replace('*',' ').strip())
def norm(s):
 s=unicodedata.normalize('NFC',(s or '').lower()); s=re.sub(r'[^0-9a-zà-ỹ\s]',' ',s); return re.sub(r'\s+',' ',s).strip()
def sm(s):
 s=(s or '').strip()
 for sep in [' / ',';','. ']:
  if sep in s:return '; '.join([x.strip() for x in s.split(sep) if x.strip()][:2])
 return s[:160]
def uniq(a,key):
 out=[]; seen=set()
 for x in a:
  k=key(x)
  if not k or k in seen:continue
  seen.add(k);out.append(x)
 return out

t=time.time(); items=[]
for p in sorted((DATA/'learning/hsk').glob('hsk_[1-8].json')):
 d=jp(p,{}); lvl=d.get('level')
 for x in d.get('items',[]):
  y=dict(x);y['_level']=lvl;y['_file']=p.name;items.append(y)
by=defaultdict(list)
for x in items:
 w=hans(x.get('word') or x.get('simplified') or '')
 if w:by[w].append(x)
words=set(by); chars=set(c for w in words for c in w); maxlen=min(10,max(map(len,words)))
print('loaded',len(items),len(words),len(chars),time.time()-t,flush=True)
# indexes
char_index=jp(DATA/'char-index.json',[]); charpath={x['char']:DATA/x['path'] for x in char_index}; ccache={}
def cd(c):
 if c not in ccache:ccache[c]=jp(charpath.get(c,''),{}) if c in charpath else {}
 return ccache[c]
rad=jp(RADROOT/'radical_learning_notes.json',{}); alias=jp(RADROOT/'radical_alias_index.json',{}); main={v.get('mainForm'):k for k,v in rad.items() if v.get('mainForm')}
# Add every character appearing in the full vocabulary as its own lookup target.
# Also add 214 radical main forms and aliases so variants such as 氵/忄/扌 are searchable.
for c in list(chars):
 if c not in by:
  d=cd(c)
  by[c].append({'word':c,'simplified':c,'traditional':d.get('traditional') or c,'pinyin':d.get('pinyin') or '',
                'meaningVi':d.get('meaningVi') or '', 'translationVi':sm(d.get('meaningVi') or ''),
                'wordType':'single-character','wordTypeExplanation':'','usageNote':'','examples':[],
                'collocations':[],'components':[],'memoryTips':{},'libraries':['char_dictionary'],
                'routes':[],'_level':d.get('hsk') or 99,'_file':f'data/chars/{ord(c):04X}.json'})
for rid,r in rad.items():
 forms=[r.get('mainForm'),r.get('sideForm'),*(r.get('variants') or [])]
 for c in [x for x in forms if x]:
  if c not in by:
   by[c].append({'word':c,'simplified':c,'traditional':c,'pinyin':r.get('pinyin') or '',
                 'meaningVi':(r.get('shortForCharLookup') or {}).get('meaningLine',''),
                 'translationVi':(r.get('shortForCharLookup') or {}).get('meaningLine',''),
                 'wordType':'radical-form','wordTypeExplanation':'','usageNote':'','examples':[],
                 'collocations':[],'components':[],'memoryTips':{},'libraries':['radicals_214'],
                 'routes':[],'_level':99,'_file':'radical_learning_notes.json'})
words=set(by); chars=set(c for w in words for c in w); maxlen=min(10,max(map(len,words)))
print('expanded targets',len(words),len(chars),flush=True)
def rdetail(rid,inp,typ,src):
 r=rad[rid]; return {'status':'resolved','id':rid,'inputForm':inp,'mainForm':r.get('mainForm',''),'sideForm':r.get('sideForm',''),'displayNameVi':r.get('displayNameVi',''),'pinyin':r.get('pinyin',''),'hanViet':r.get('hanViet',''),'meaningVi':(r.get('shortForCharLookup') or {}).get('meaningLine',''),'kangxiNo':r.get('kangxiNo'),'resolutionType':typ,'source':src}
def rsolve(c):
 if c in main:return rdetail(main[c],c,'self-radical','radical_learning_notes.json')
 ids=alias.get(c,[])
 if len(ids)==1:return rdetail(ids[0],c,'radical-variant','radical_alias_index.json')
 raw=cd(c).get('radical','');ids=alias.get(raw,[]) if raw else []
 if len(ids)==1:return rdetail(ids[0],raw,'record-radical',f'data/chars/{ord(c):04X}.json')
 return {'status':'not-resolved','inputForm':raw,'resolutionType':'not-resolved'}
rmap={c:rsolve(c) for c in chars}; byr=defaultdict(list)
for c,r in rmap.items():
 if r.get('status')=='resolved':byr[r['id']].append(c)
print('radicals',sum(1 for x in rmap.values() if x.get('status')=='resolved'),time.time()-t,flush=True)
# best item
def best(arr):
 return min(arr,key=lambda x:(x['_level'],len(x.get('meaningVi') or ''),len(x.get('word') or '')))
# related inverted
wbc=defaultdict(set)
for w in words:
 for c in set(w):wbc[c].add(w)
# sentence and colloc map via ngrams
smap=defaultdict(list); cmap=defaultdict(list)
def add_matches(h,row,mp):
 matched=set()
 for i in range(len(h)):
  for L in range(1,min(maxlen,len(h)-i)+1):
   z=h[i:i+L]
   if z in words:matched.add(z)
 for z in matched:mp[z].append(row)
for x in items:
 for e in x.get('examples') or []:
  zh=e.get('chinese') or e.get('zh') or ''; pp=py(e.get('pinyin')); vi=e.get('meaning_vi') or e.get('meaningVi') or ''
  if zh and pp and vi:add_matches(hans(zh),{'chinese':zh,'pinyin':pp,'meaningVi':vi,'level':x['_level'],'sourceFile':x['_file']},smap)
 for e in x.get('collocations') or []:
  tx=e.get('chinese') or e.get('text') or ''; pp=py(e.get('pinyin')); vi=e.get('meaning_vi') or e.get('meaningVi') or ''
  if tx and pp and vi:add_matches(hans(tx),{'text':tx,'pinyin':pp,'meaningVi':vi,'level':x['_level'],'sourceFile':x['_file']},cmap)
print('sentence maps',len(smap),len(cmap),time.time()-t,flush=True)
# grammar map exact ngram
gmap=defaultdict(list)
for p in sorted((DATA/'learning/grammar').glob('*.json')):
 if p.name=='grammar_summary.json':continue
 for g in jp(p,{}).get('items',[]):
  txt=hans(json.dumps(g,ensure_ascii=False)); matched=set()
  for i in range(len(txt)):
   for L in range(1,min(maxlen,len(txt)-i)+1):
    z=txt[i:i+L]
    if z in words:matched.add(z)
  row={'topic':g.get('topic') or g.get('title') or 'Cách dùng','syntax':g.get('syntax') or g.get('formula') or '','explanationVi':g.get('explanationVi') or g.get('explanation') or g.get('descriptionVi') or '','sourceFile':p.name}
  for z in matched:
   if len(gmap[z])<4:gmap[z].append(row)
print('grammar',len(gmap),time.time()-t,flush=True)
# reviewed overlays
revdir=Path('/mnt/data/c2a21_work/latest/modules/hanzi-stroke/prototypes/lookup-c1-2/data'); rev={}
ri=jp(revdir/'index.json',{})
for c,p in (ri.get('characters') or {}).items():rev[c]=jp(revdir/p,{})
# build buckets
buckets=defaultdict(dict); search=[]; stats=Counter(); radical_rows=[]; relation_rows=[]; sent_rows=[]; coverage=[]
for n,target in enumerate(sorted(words),1):
 arr=by[target]; b=best(arr); single=len(target)==1
 full=b.get('meaningVi') or b.get('translationVi') or ''; short=b.get('translationVi') or sm(full); pinyin=py(b.get('pinyin'))
 # related exact target containment
 cand=None
 for c in set(target):cand=wbc[c].copy() if cand is None else cand&wbc[c]
 rel=[]
 for w in cand or []:
  if w==target or target not in w:continue
  bi=best(by[w]); rw={'word':w,'pinyin':py(bi.get('pinyin')),'meaningVi':bi.get('translationVi') or sm(bi.get('meaningVi')),'level':bi['_level'],'relationType':'contains-target'}
  if rw['pinyin'] and rw['meaningVi']:rel.append(rw)
 rel=sorted(uniq(rel,lambda x:x['word']),key=lambda x:(x['level'],len(x['word']),x['word']))[:15]; relset={x['word'] for x in rel}
 # sentences ranked
 mt=set(norm(short).split())-{'là','và','của','một','các','cho','trong','được'}; ss=[]
 for s in smap.get(target,[]):
  m=[w for w in relset if w in s['chinese']]; ov=len(mt&set(norm(s['meaningVi']).split())); q=dict(s);q['matchedRelatedWords']=m[:3];q['relevanceScore']=1+4*bool(m)+min(3,ov);ss.append(q)
 ss=sorted(uniq(ss,lambda x:(x['chinese'],x['pinyin'])),key=lambda x:(-x['relevanceScore'],x['level'],len(x['chinese'])))[:10]
 cc=sorted(uniq([x for x in cmap.get(target,[]) if target in x['text']],lambda x:x['text']),key=lambda x:(x['level'],len(x['text'])))[:10]
 libs=sorted({l for x in arr for l in (x.get('libraries') or [])}); levels=sorted({x['_level'] for x in arr}); routes=uniq([r for x in arr for r in (x.get('routes') or [])],lambda r:(r.get('libraryId'),r.get('levelNo'),r.get('sectionId'),r.get('orderInSection')))[:30]
 cis=[{'char':c,'pinyin':cd(c).get('pinyin',''),'hanViet':cd(c).get('hanViet',''),'meaningVi':cd(c).get('meaningVi',''),'radical':rmap[c]} for c in target]
 rr=rmap[target] if single else None; compof=[]
 if single and rr.get('status')=='resolved':
  for c in sorted(byr[rr['id']]):
   if c!=target:compof.append({'char':c,'pinyin':cd(c).get('pinyin',''),'meaningVi':sm(cd(c).get('meaningVi',''))})
  compof=compof[:24]
 comps=[]
 for x in b.get('components') or []:
  ch=x.get('character') or (x.get('radical') or {}).get('character') or ''
  if ch:comps.append({'char':ch,'meaningVi':(x.get('radical') or {}).get('meaning',''),'source':'hsk-components'})
 mem=b.get('memoryTips') or {}
 if target in rev:
  o=rev[target]
  if o.get('components'):comps=o['components']
  if o.get('memoryStory'):mem['reviewedStory']=o['memoryStory']
 rec={'schemaVersion':'unified-lookup-v1','target':target,'targetType':'single-character' if single else 'multi-character-word','pinyin':pinyin,'hanViet':cd(target).get('hanViet','') if single else '','meaningShortVi':short,'meaningFullVi':full,'traditional':b.get('traditional',''),'wordType':b.get('wordType',''),'wordTypeExplanation':b.get('wordTypeExplanation',''),'usageNoteVi':b.get('usageNote',''),'levels':levels,'libraries':libs,'routes':routes,'writing':{'enabled':True,'characters':list(target)},'radical':rr,'radicalComponentOf':compof,'characters':cis,'components':comps,'memory':mem,'relatedWords':rel,'collocations':cc,'sentences':ss,'grammar':gmap.get(target,[]),'sources':[{'file':x['_file'],'libraries':x.get('libraries') or []} for x in arr]}
 bucket=f'{ord(target[0])%256:02X}'; buckets[bucket][target]=rec; search.append({'target':target,'bucket':bucket,'type':rec['targetType'],'pinyin':pinyin,'meaningVi':short,'levels':levels,'libraries':libs})
 stats['targets']+=1;stats['single']+=single;stats['multi']+=not single;stats['withRelated']+=bool(rel);stats['withSentences']+=bool(ss);stats['withCollocations']+=bool(cc);stats['withGrammar']+=bool(gmap.get(target));stats['singleRadicalResolved']+=bool(single and rr.get('status')=='resolved');stats['singleComponentOf']+=bool(compof)
 coverage.append([target,rec['targetType'],pinyin,short,','.join(map(str,levels)),','.join(libs),rr.get('status','') if rr else '',rr.get('mainForm','') if rr else '',len(rel),len(cc),len(ss),len(gmap.get(target,[])),len(comps),bool(mem)])
 if rr:radical_rows.append([target,pinyin,short,rr.get('status'),rr.get('mainForm',''),rr.get('displayNameVi',''),rr.get('resolutionType',''),len(compof)])
 for x in rel:relation_rows.append([target,x['word'],x['pinyin'],x['meaningVi'],x['level']])
 for x in ss:sent_rows.append([target,x['chinese'],x['pinyin'],x['meaningVi'],x['level'],x['relevanceScore'],','.join(x['matchedRelatedWords'])])
 if n%2000==0:print('built',n,time.time()-t,flush=True)
for b,d in buckets.items():json.dump({'schemaVersion':'unified-record-bucket-v1','records':d},open(OUT/'records'/f'{b}.json','w',encoding='utf-8'),ensure_ascii=False,separators=(',',':'))
json.dump({'schemaVersion':'unified-index-v1','targets':{x['target']:x['bucket'] for x in search}},open(OUT/'unified-target-index.json','w',encoding='utf-8'),ensure_ascii=False,separators=(',',':'))
json.dump({'schemaVersion':'unified-search-v1','items':search},open(OUT/'search-index.json','w',encoding='utf-8'),ensure_ascii=False,separators=(',',':'))
source=jp(DATA/'learning/hsk/source_summary.json',{})
report={'summary':dict(stats),'sourceInventory':{'sourceItems':len(items),'uniqueTargets':len(words),'uniqueCharacters':len(chars),'libraries':['hsk','new_hsk','yct','boya'],'radicals':len(rad),'charDictionary':len(char_index),'grammarFiles':len(list((DATA/'learning/grammar').glob('*.json')))-1,'sourceSummary':source,'notIncludedBecauseAbsent':['301 dialogue data','separate business workbook/PDF','other data not embedded in modules(1).zip']},'rules':{'runtime':'one unified index + one bucket file','radical':'self radical -> variant -> record radical -> blank','relatedWords':'exact target containment','sentences':'exact target containment; related-word and Vietnamese-overlap ranking','advanced':'source-only'}}
json.dump(report,open(OUT/'build-report.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
for fn,head,rows in [('target-coverage.csv',['target','type','pinyin','meaning','levels','libraries','radicalStatus','radical','relatedCount','collocationCount','sentenceCount','grammarCount','componentCount','hasMemory'],coverage),('radical-resolution.csv',['target','pinyin','meaning','status','mainForm','name','resolutionType','componentOfCount'],radical_rows),('related-words.csv',['target','relatedWord','pinyin','meaning','level'],relation_rows),('sentence-links.csv',['target','sentence','pinyin','meaning','level','score','matchedRelatedWords'],sent_rows)]:
 with open(OUT/fn,'w',encoding='utf-8-sig',newline='') as f:w=csv.writer(f);w.writerow(head);w.writerows(rows)
print(json.dumps(report['summary'],ensure_ascii=False),flush=True)

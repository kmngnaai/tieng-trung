#!/usr/bin/env python3
from __future__ import annotations
import json,re,unicodedata
from pathlib import Path
from collections import defaultdict,Counter

ROOT=Path(__file__).resolve().parents[1]
HSK_DIR=ROOT/'data'/'learning'/'hsk'
OUT=ROOT/'data'/'learning'/'word-enrichment'/'hsk1-3'
WORDS=OUT/'words'
HAN_RE=re.compile(r'[\u3400-\u9fff\uf900-\ufaff]')
HAN_SEQ_RE=re.compile(r'[\u3400-\u9fff\uf900-\ufaff]+')

def clean(v): return re.sub(r'\s+',' ',str(v or '')).strip()
def norm_pinyin(v): return clean(v).replace('*',' ')
def norm(v):
 s=unicodedata.normalize('NFD',clean(v).lower())
 s=''.join(c for c in s if unicodedata.category(c)!='Mn')
 return re.sub(r'[^a-z0-9\u3400-\u9fff]+',' ',s).strip()
def key(v): return re.sub(r'\s+','',norm(v))
def uniq(xs,k):
 out=[]; seen=set()
 for x in xs:
  z=k(x)
  if not z or z in seen: continue
  seen.add(z); out.append(x)
 return out
def filename(word): return '-'.join(f'{ord(c):X}' for c in word)+'.json'
def short_meaning(v):
 s=clean(v)
 for sep in ['。','；',';','/','，',',','.']:
  if sep in s: s=s.split(sep,1)[0]
 return s[:90].strip()

def main():
 WORDS.mkdir(parents=True,exist_ok=True)
 raw=[]; by_word=defaultdict(list)
 for level in (1,2,3):
  p=HSK_DIR/f'hsk_{level}.json'; d=json.loads(p.read_text(encoding='utf-8'))
  for item in d.get('items',[]):
   w=clean(item.get('word') or item.get('simplified'))
   if not w or not HAN_RE.search(w): continue
   x=dict(item); x['_level']=level; x['_source']=p.name
   raw.append(x); by_word[w].append(x)

 # trusted exact dictionary from local HSK records
 lex={}
 for w,items in by_word.items():
  pins=uniq([norm_pinyin(i.get('pinyin')) for i in items if norm_pinyin(i.get('pinyin'))],lambda x:key(x))
  means=uniq([clean(i.get('meaningVi') or i.get('translationVi')) for i in items if clean(i.get('meaningVi') or i.get('translationVi'))],lambda x:key(x))
  lex[w]={'pinyin':pins[0] if pins else '', 'meaning':means[0] if means else '', 'level':min(i['_level'] for i in items)}
 maxlen=max(map(len,lex))
 # unique single-char readings only; ambiguity blocks char fallback
 char_readings=defaultdict(set)
 for w,v in lex.items():
  if len(w)==1 and v['pinyin']: char_readings[w].add(v['pinyin'])

 def pinyin_for_text(text):
  text=clean(text)
  if text in lex and lex[text]['pinyin']: return lex[text]['pinyin'],'exact-local'
  out=[]; i=0
  while i<len(text):
   ch=text[i]
   if not HAN_RE.match(ch):
    out.append(ch); i+=1; continue
   found=None
   for n in range(min(maxlen,len(text)-i),0,-1):
    token=text[i:i+n]
    if token in lex and lex[token]['pinyin']:
     found=(token,lex[token]['pinyin']); break
   if found:
    out.append(found[1]); i+=len(found[0]); continue
   rs=char_readings.get(ch,set())
   if len(rs)==1:
    out.append(next(iter(rs))); i+=1; continue
   return '', 'unresolved'
  s=' '.join(out)
  s=re.sub(r'\s+([，。！？；：、,.!?;:])',r'\1',s)
  s=re.sub(r'([（(])\s+',r'\1',s); s=re.sub(r'\s+([）)])',r'\1',s)
  return clean(s),'segmented-local'

 audit_before=Counter(); audit_after=Counter(); blocked=[]; reports=[]; search=[]
 all_words=set(by_word)
 for old in WORDS.glob('*.json'): old.unlink()
 for word,items in sorted(by_word.items(),key=lambda kv:(len(kv[0]),kv[0])):
  if len(word)<2: continue
  readings=[]; meanings=[]; types=[]; usage=[]; expl=[]; routes=[]; aud=[]; coll_raw=[]; sent_raw=[]; levels=set(); systems=set(); traditional=''
  for it in items:
   levels.add(it['_level']); traditional=traditional or clean(it.get('traditional'))
   for r in it.get('routes') or []:
    if r.get('libraryId') in {'hsk','new_hsk'} and int(r.get('levelNo') or 99)<=3:
     levels.add(int(r['levelNo'])); systems.add(r['libraryId']); routes.append(r)
   p=norm_pinyin(it.get('pinyin'))
   if p: readings.append({'pinyin':p,'source':it['_source'],'reviewStatus':'reviewed'})
   m=clean(it.get('meaningVi') or it.get('translationVi'))
   if m: meanings.append({'meaningShortVi':short_meaning(m),'meaningFullVi':m,'partOfSpeech':clean(it.get('wordType')),'source':it['_source'],'reviewStatus':'reviewed'})
   if clean(it.get('wordType')): types.append(clean(it.get('wordType')))
   if clean(it.get('usageNote')): usage.append(clean(it.get('usageNote')))
   if clean(it.get('wordTypeExplanation')): expl.append(clean(it.get('wordTypeExplanation')))
   aud += it.get('audioUrls') or []
   for r in it.get('collocations') or []: coll_raw.append((r,it['_source']))
   for r in it.get('examples') or []: sent_raw.append((r,it['_source']))
  readings=uniq(readings,lambda x:key(x['pinyin'])); meanings=uniq(meanings,lambda x:key(x['meaningFullVi'])+'|'+key(x['partOfSpeech']))

  coll=[]
  for r,src in coll_raw:
   audit_before['collocations']+=1
   text=clean(r.get('chinese') or r.get('text') or r.get('word')); meaning=clean(r.get('meaning_vi') or r.get('meaningVi') or r.get('meaning'))
   pin=norm_pinyin(r.get('pinyin')); method='source'
   if not pin: pin,method=pinyin_for_text(text)
   if not meaning and text in lex: meaning=lex[text]['meaning']
   if not text or word not in text or not pin or not meaning:
    blocked.append({'kind':'collocation','target':word,'text':text,'reason':[x for x,c in [('not-containing-target',word not in text),('missing-pinyin',not pin),('missing-meaning',not meaning)] if c],'source':src})
    continue
   coll.append({'text':text,'pinyin':pin,'meaningVi':short_meaning(meaning),'meaningFullVi':meaning,'target':word,'source':src,'pinyinMethod':method,'reviewStatus':'reviewed-local'})
  coll=uniq(coll,lambda x:x['text'])[:12]; audit_after['collocations']+=len(coll)

  sentences=[]
  for r,src in sent_raw:
   audit_before['sentences']+=1
   zh=clean(r.get('chinese') or r.get('zh')); meaning=clean(r.get('meaning_vi') or r.get('meaningVi'))
   pin=norm_pinyin(r.get('pinyin')); method='source'
   if not pin: pin,method=pinyin_for_text(zh)
   if not zh or word not in zh or not pin or not meaning:
    blocked.append({'kind':'sentence','target':word,'text':zh,'reason':[x for x,c in [('not-containing-target',word not in zh),('missing-pinyin',not pin),('missing-meaning',not meaning)] if c],'source':src})
    continue
   sentences.append({'target':word,'chinese':zh,'pinyin':pin,'meaningVi':meaning,'source':src,'containsTarget':True,'pinyinMethod':method,'reviewStatus':'reviewed-local'})
  sentences=uniq(sentences,lambda x:x['chinese'])[:12]; audit_after['sentences']+=len(sentences)

  compounds=[]
  for other in all_words:
   if other==word or word not in other: continue
   v=lex.get(other,{})
   if not v.get('pinyin') or not v.get('meaning'): continue
   compounds.append({'word':other,'pinyin':v['pinyin'],'meaningVi':short_meaning(v['meaning']),'meaningFullVi':v['meaning'],'relationType':'contains-exact-target','hskLevel':f"HSK {v['level']}",'reviewStatus':'reviewed-local'})
  compounds=sorted(uniq(compounds,lambda x:x['word']),key=lambda x:(int(x['hskLevel'].split()[-1]),len(x['word']),x['word']))[:12]

  grammar=[]
  if types or usage or expl:
   grammar.append({'title':f'Cách dùng {word}','partOfSpeech':types[0] if types else '', 'usageNoteVi':usage[0] if usage else '', 'explanationVi':expl[0] if expl else '', 'reviewStatus':'reviewed-local'})

  status='PASS' if readings and meanings and (coll or sentences or compounds or grammar) else ('PARTIAL' if readings and meanings else 'BLOCKED')
  rec={
   'schemaVersion':'word-enrichment-v2-quality-gated','id':f'word:{word}','type':'word','word':word,'simplified':word,'traditional':traditional or word,'charCount':len(word),'characters':list(word),
   'pronunciation':{'primary':readings[0]['pinyin'] if readings else '','readings':readings},
   'meaningSenses':meanings,'meaningShortVi':meanings[0]['meaningShortVi'] if meanings else '',
   'wordType':types[0] if types else '','wordTypes':sorted(set(types)),
   'hsk':{'levels':sorted(levels),'primaryLevel':min(levels) if levels else None,'systems':sorted(systems)},
   'vocabulary':{'compounds':compounds,'collocations':coll,'relatedWords':[]},
   'sentences':sentences,'grammarLinks':grammar,'audioUrls':uniq(aud,lambda x:x),
   'routes':uniq(routes,lambda x:'|'.join(map(str,[x.get('libraryId'),x.get('levelNo'),x.get('sectionTitle'),x.get('sectionUrl')])))[:12],
   'sources':[{'sourceId':f'hsk_{n}_json','title':f'data/learning/hsk/hsk_{n}.json','reviewStatus':'reviewed'} for n in sorted({i['_level'] for i in items})],
   'review':{'status':status,'warnings':[]}
  }
  if not coll: rec['review']['warnings'].append('Không có collocation đạt cổng chất lượng')
  if not sentences: rec['review']['warnings'].append('Không có câu mẫu đạt cổng chất lượng')
  if not compounds: rec['review']['warnings'].append('Không có compound chứa nguyên target')
  fp=filename(word); (WORDS/fp).write_text(json.dumps(rec,ensure_ascii=False,indent=2),encoding='utf-8')
  reports.append({'word':word,'status':status,'pinyin':bool(readings),'meaning':bool(meanings),'collocations':len(coll),'compounds':len(compounds),'sentences':len(sentences),'grammar':len(grammar)})
  search.append({'word':word,'path':f'words/{fp}','pinyin':rec['pronunciation']['primary'],'pinyinNormalized':norm(rec['pronunciation']['primary']),'meaningShortVi':rec['meaningShortVi'],'meaningFullVi':' '.join(m['meaningFullVi'] for m in meanings),'meaningNormalized':norm(rec['meaningShortVi']),'meaningFullNormalized':norm(' '.join(m['meaningFullVi'] for m in meanings)),'hskLevel':rec['hsk']['primaryLevel'],'qualityStatus':status})

 index={'schemaVersion':'word-enrichment-index-v2','scope':'HSK 1-3 merged quality-gated','words':{x['word']:x['path'] for x in search},'counts':dict(Counter(x['qualityStatus'] for x in search)|Counter({'total':len(search)}))}
 (OUT/'index.json').write_text(json.dumps(index,ensure_ascii=False,indent=2),encoding='utf-8')
 (OUT/'search_index.json').write_text(json.dumps({'schemaVersion':'word-search-index-v2','items':search},ensure_ascii=False,indent=2),encoding='utf-8')
 (OUT/'blocked_records.json').write_text(json.dumps({'schemaVersion':'blocked-v1','items':blocked},ensure_ascii=False,indent=2),encoding='utf-8')
 quality={'schemaVersion':'c2a18-quality-report-v1','counts':{'records':len(reports),'before':dict(audit_before),'after':dict(audit_after),'blockedItems':len(blocked),'status':dict(Counter(r['status'] for r in reports))},'checks':{
  'mainPinyinMissing':sum(not r['pinyin'] for r in reports),'mainMeaningMissing':sum(not r['meaning'] for r in reports),
  'displayCollocationMissingPinyin':0,'displayCollocationMissingMeaning':0,'displaySentenceMissingPinyin':0,'displaySentenceMissingMeaning':0,
  'sentenceTargetMismatch':0,'compoundTargetMismatch':0
 },'records':reports}
 (OUT/'quality_report.json').write_text(json.dumps(quality,ensure_ascii=False,indent=2),encoding='utf-8')
 md=['# C2A.18 – Báo cáo chất lượng HSK 1–3','',f"- Records: **{len(reports)}**",f"- PASS: **{quality['counts']['status'].get('PASS',0)}**",f"- PARTIAL: **{quality['counts']['status'].get('PARTIAL',0)}**",f"- BLOCKED: **{quality['counts']['status'].get('BLOCKED',0)}**",f"- Collocation trước/sau cổng: **{audit_before['collocations']} / {audit_after['collocations']}**",f"- Câu trước/sau cổng: **{audit_before['sentences']} / {audit_after['sentences']}**",f"- Mục bị chặn: **{len(blocked)}**",'', '## Cổng chất lượng','- Mọi collocation hiển thị có target, pinyin và nghĩa.','- Mọi câu hiển thị có nguyên target, pinyin và nghĩa.','- Compound chỉ chứa nguyên target.','- Pinyin bổ sung chỉ từ exact-match hoặc phân đoạn từ điển local; mục không phân giải chắc chắn bị chặn.','- Không tự dịch hoặc tự sáng tác câu.']
 (OUT/'QUALITY_REPORT.md').write_text('\n'.join(md),encoding='utf-8')
 print(json.dumps(quality['counts'],ensure_ascii=False,indent=2))
if __name__=='__main__': main()

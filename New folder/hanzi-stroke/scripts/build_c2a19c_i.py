#!/usr/bin/env python3
from __future__ import annotations
import json,re,unicodedata,glob,os,shutil,csv
from pathlib import Path
from collections import defaultdict,Counter

WORK=Path('/mnt/data/c2a19c_work')
BASE=WORK/'c2a18/modules/hanzi-stroke/data/learning/word-enrichment/hsk1-3'
SINGLE=WORK/'c2a19ab/modules/hanzi-stroke/data/learning/character-enrichment/hsk1-3-single'
SRC=WORK/'modules_src/modules/hanzi-stroke/data/learning'
OUT=WORK/'c2a19ci_out/modules/hanzi-stroke/data/learning/word-enrichment/hsk1-3'
WORDS=OUT/'words'
SCRIPTS=WORK/'c2a19ci_out/modules/hanzi-stroke/scripts'
OUT.mkdir(parents=True,exist_ok=True); WORDS.mkdir(parents=True,exist_ok=True); SCRIPTS.mkdir(parents=True,exist_ok=True)

HAN_RE=re.compile(r'[\u3400-\u9fff\uf900-\ufaff]')
def clean(v): return re.sub(r'\s+',' ',str(v or '')).strip()
def norm_pinyin(v): return clean(v).replace('*',' ')
def norm_vi(v):
 s=unicodedata.normalize('NFC',clean(v).lower())
 return re.sub(r'[^0-9a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ\u3400-\u9fff]+',' ',s).strip()
def norm_key(v): return re.sub(r'\s+','',norm_vi(v))
def short_meaning(v):
 s=clean(v)
 # Prefer first clear sense, keep Vietnamese accents.
 for sep in ['。','；',';','/','，',',']:
  if sep in s: s=s.split(sep,1)[0]
 return s[:100].strip(' .;，,')
def uniq(rows,key):
 out=[]; seen=set()
 for r in rows:
  k=key(r)
  if not k or k in seen: continue
  seen.add(k); out.append(r)
 return out
def fn(word): return '-'.join(f'{ord(c):X}' for c in word)+'.json'

# Copy current records as base.
for p in (BASE/'words').glob('*.json'): shutil.copy2(p,WORDS/p.name)
for name in ['index.json','search_index.json','audit_before.json','blocked_records.json']:
 shutil.copy2(BASE/name,OUT/name)

index=json.load(open(BASE/'index.json',encoding='utf-8'))
records={}
for w,rel in index['words'].items(): records[w]=json.load(open(BASE/rel,encoding='utf-8'))

# All local HSK 1-6 records, exact word evidence.
raw_by_word=defaultdict(list); lex={}
for level in range(1,7):
 p=SRC/'hsk'/f'hsk_{level}.json'
 d=json.load(open(p,encoding='utf-8'))
 for it in d.get('items',[]):
  w=clean(it.get('word') or it.get('simplified'))
  if not w: continue
  raw_by_word[w].append((level,p.name,it))
  if w not in lex:
   lex[w]={'pinyin':norm_pinyin(it.get('pinyin')),'meaning':clean(it.get('translationVi') or it.get('meaningVi')),'full':clean(it.get('meaningVi') or it.get('translationVi')),'level':level,'wordType':clean(it.get('wordType'))}
  else:
   if not lex[w]['pinyin']: lex[w]['pinyin']=norm_pinyin(it.get('pinyin'))
   if not lex[w]['meaning']: lex[w]['meaning']=clean(it.get('translationVi') or it.get('meaningVi'))
   if not lex[w]['full']: lex[w]['full']=clean(it.get('meaningVi') or it.get('translationVi'))
   lex[w]['level']=min(lex[w]['level'],level)

scope_words=set(records)
# Add single characters for relation network only.
single_idx=json.load(open(SINGLE/'index.json',encoding='utf-8'))
for ch,rel in single_idx.get('characters',single_idx.get('chars',single_idx.get('items',{}))).items() if isinstance(single_idx,dict) else []:
 pass
# index structure check
if isinstance(single_idx,dict):
 mapping=single_idx.get('characters') or single_idx.get('chars') or single_idx.get('items') or {}
 if isinstance(mapping,dict): scope_words.update(mapping.keys())

# Grammar corpus, exact evidence.
grammar_items=[]; grammar_examples=[]
for p in glob.glob(str(SRC/'grammar'/'*.json')):
 d=json.load(open(p,encoding='utf-8'))
 if not isinstance(d,dict) or 'items' not in d: continue
 for g in d.get('items',[]):
  row={'sourceFile':Path(p).name,'curriculum':g.get('curriculum'),'level':g.get('hsk_level') or d.get('level'),'id':g.get('id'),'topic':clean(g.get('topic')),'syntax':clean(g.get('grammar_syntax')),'explanation':clean(g.get('grammar_explanation')),'tips':clean(g.get('grammar_tips')),'attentions':clean(g.get('grammar_attentions')),'examples':g.get('example') or []}
  grammar_items.append(row)
  for ex in row['examples']:
   zh=clean(ex.get('chinese')); py=norm_pinyin(ex.get('pinyin')); me=clean(ex.get('vietnamese') or ex.get('meaningVi'))
   if zh and py and me: grammar_examples.append((row,{'chinese':zh,'pinyin':py,'meaningVi':me}))

# Relation candidates based on exact pinyin or exact short meaning. Exact meaning remains candidate, not reviewed.
pinyin_groups=defaultdict(list); meaning_groups=defaultdict(list)
for w,v in lex.items():
 if w not in scope_words: continue
 if v.get('pinyin'): pinyin_groups[norm_key(v['pinyin'])].append(w)
 if v.get('meaning'): meaning_groups[norm_vi(short_meaning(v['meaning']))].append(w)

all_scope_hsk=set(records)
summary_rows=[]; relation_rows=[]; coll_sentence_rows=[]; grammar_rows=[]; missing_sentence_before=0; missing_sentence_after=0
partial_before=[]; status_counter=Counter(); blocked_final=[]

for word,rec in records.items():
 old_status=rec.get('review',{}).get('status','')
 if old_status=='PARTIAL': partial_before.append(word)
 if not rec.get('sentences'): missing_sentence_before+=1
 # Meaning normalization from strongest exact local source, preserve old full as alternate.
 exacts=raw_by_word.get(word,[])
 trans=[]; fulls=[]; types=[]; usages=[]; explanations=[]
 for lv,src,it in exacts:
  tr=clean(it.get('translationVi')); fu=clean(it.get('meaningVi') or it.get('translationVi'))
  if tr: trans.append((lv,tr,src))
  if fu: fulls.append((lv,fu,src))
  if clean(it.get('wordType')): types.append((lv,clean(it.get('wordType')),src))
  if clean(it.get('usageNote')): usages.append((lv,clean(it.get('usageNote')),src))
  if clean(it.get('wordTypeExplanation')): explanations.append((lv,clean(it.get('wordTypeExplanation')),src))
 trans.sort(); fulls.sort(); types.sort(); usages.sort(); explanations.sort()
 short=short_meaning(trans[0][1] if trans else rec.get('meaningShortVi') or (rec.get('meaningSenses') or [{}])[0].get('meaningFullVi',''))
 full=fulls[0][1] if fulls else ((rec.get('meaningSenses') or [{}])[0].get('meaningFullVi') or short)
 rec['meaningShortVi']=short
 rec['meaningFullVi']=full
 rec['meaningNormalization']={'shortSource':trans[0][2] if trans else 'c2a18-record','fullSource':fulls[0][2] if fulls else 'c2a18-record','reviewStatus':'reviewed-local'}
 # Replace primary sense with normalized short/full but preserve other senses.
 if rec.get('meaningSenses'):
  rec['meaningSenses'][0]['meaningShortVi']=short; rec['meaningSenses'][0]['meaningFullVi']=full
 else:
  rec['meaningSenses']=[{'meaningShortVi':short,'meaningFullVi':full,'partOfSpeech':types[0][1] if types else rec.get('wordType',''),'source':trans[0][2] if trans else 'c2a18','reviewStatus':'reviewed'}]

 # Rebuild compounds using HSK 1-6 exact target containment, favor lower levels.
 compounds=[]
 for other,v in lex.items():
  if other==word or word not in other or not v.get('pinyin') or not v.get('meaning'): continue
  compounds.append({'word':other,'pinyin':v['pinyin'],'meaningVi':short_meaning(v['meaning']),'meaningFullVi':v.get('full') or v['meaning'],'relationType':'contains-exact-target','hskLevel':v['level'],'source':f'hsk_{v["level"]}.json','reviewStatus':'reviewed-local'})
 compounds=sorted(uniq(compounds,lambda x:x['word']),key=lambda x:(x['hskLevel'],len(x['word']),x['word']))[:20]

 # Rebuild collocations from all exact-word HSK 1-6 source items; only complete rows containing target.
 colls=list(rec.get('vocabulary',{}).get('collocations') or [])
 for lv,src,it in exacts:
  for x in it.get('collocations') or []:
   text=clean(x.get('chinese') or x.get('text') or x.get('word')); py=norm_pinyin(x.get('pinyin')); me=clean(x.get('meaning_vi') or x.get('meaningVi') or x.get('meaning'))
   if text and word in text and py and me:
    colls.append({'text':text,'pinyin':py,'meaningVi':short_meaning(me),'meaningFullVi':me,'target':word,'source':src,'hskSourceLevel':lv,'reviewStatus':'reviewed-local'})
 colls=uniq(colls,lambda x:clean(x.get('text')))[:20]

 # Supplement sentences from all exact-word HSK 1-6 and grammar examples. No creation/translation.
 sents=list(rec.get('sentences') or [])
 for lv,src,it in exacts:
  for x in it.get('examples') or []:
   zh=clean(x.get('chinese') or x.get('zh')); py=norm_pinyin(x.get('pinyin')); me=clean(x.get('meaning_vi') or x.get('meaningVi'))
   if zh and word in zh and py and me:
    sents.append({'target':word,'chinese':zh,'pinyin':py,'meaningVi':me,'source':src,'sourceLevel':lv,'containsTarget':True,'reviewStatus':'reviewed-local'})
 for g,ex in grammar_examples:
  if word in ex['chinese']:
   sents.append({'target':word,'chinese':ex['chinese'],'pinyin':ex['pinyin'],'meaningVi':ex['meaningVi'],'source':g['sourceFile'],'grammarId':g['id'],'grammarTopic':g['topic'],'containsTarget':True,'reviewStatus':'reviewed-local'})
 sents=uniq(sents,lambda x:clean(x.get('chinese')))[:20]

 # Link sentences to each collocation, exact phrase only.
 linked=[]
 for c in colls:
  phrase=c['text']; cs=[s for s in sents if phrase in s.get('chinese','')][:3]
  cc=dict(c); cc['sentences']=cs; cc['sentenceCount']=len(cs); linked.append(cc)
  for s in cs: coll_sentence_rows.append([word,phrase,c.get('pinyin',''),c.get('meaningVi',''),s['chinese'],s['pinyin'],s['meaningVi'],s.get('source','')])

 # Grammar links: exact word occurrence in topic/syntax/explanation/tips/attention or examples.
 grams=[]
 for g in grammar_items:
  fields=' '.join([g['topic'],g['syntax'],g['explanation'],g['tips'],g['attentions']])
  matching=[ex for ex in g['examples'] if word in clean(ex.get('chinese'))]
  if word in fields or matching:
   grams.append({'grammarId':g['id'],'title':g['topic'],'syntax':g['syntax'],'explanationVi':g['explanation'],'tipsVi':g['tips'],'attentionsVi':g['attentions'],'examples':[{'chinese':clean(x.get('chinese')),'pinyin':norm_pinyin(x.get('pinyin')),'meaningVi':clean(x.get('vietnamese'))} for x in matching if clean(x.get('chinese')) and norm_pinyin(x.get('pinyin')) and clean(x.get('vietnamese'))][:3],'source':g['sourceFile'],'curriculum':g['curriculum'],'hskLevel':g['level'],'matchMethod':'exact-word-occurrence','reviewStatus':'reviewed-local'})
 grams=uniq(grams,lambda x:str(x.get('grammarId')))[:10]
 # Also keep exact word usage note as grammar/usage, grounded in local item.
 if types or usages or explanations:
  grams.insert(0,{'grammarId':f'usage:{word}','title':f'Cách dùng {word}','partOfSpeech':types[0][1] if types else rec.get('wordType',''),'usageNoteVi':usages[0][1] if usages else '','explanationVi':explanations[0][1] if explanations else '','source':types[0][2] if types else (usages[0][2] if usages else explanations[0][2]),'matchMethod':'exact-word-record','reviewStatus':'reviewed-local'})
 grams=uniq(grams,lambda x:str(x.get('grammarId')))[:10]

 # Relations. Homophones are verified phonetic relations. Exact meaning is a candidate only.
 relations=[]; candidates=[]
 pk=norm_key(rec.get('pronunciation',{}).get('primary',''))
 for other in pinyin_groups.get(pk,[]):
  if other!=word and other in lex:
   relations.append({'targetWord':other,'pinyin':lex[other]['pinyin'],'meaningVi':short_meaning(lex[other]['meaning']),'relationType':'homophone','evidence':'exact normalized pinyin match in local HSK data','source':f'hsk_{lex[other]["level"]}.json','reviewStatus':'reviewed-local'})
 mk=norm_vi(short)
 if mk and len(mk)>=2:
  for other in meaning_groups.get(mk,[]):
   if other!=word and other in lex:
    candidates.append({'targetWord':other,'pinyin':lex[other]['pinyin'],'meaningVi':short_meaning(lex[other]['meaning']),'relationType':'same-short-meaning-candidate','evidence':f'exact normalized Vietnamese short meaning: {short}','source':f'hsk_{lex[other]["level"]}.json','reviewStatus':'needs-review'})
 relations=uniq(relations,lambda x:x['targetWord']+'|'+x['relationType'])[:12]
 candidates=uniq(candidates,lambda x:x['targetWord']+'|'+x['relationType'])[:12]
 for r in relations+candidates: relation_rows.append([word,r['targetWord'],r['relationType'],r['pinyin'],r['meaningVi'],r['evidence'],r['source'],r['reviewStatus']])

 rec.setdefault('vocabulary',{})['compounds']=compounds
 rec['vocabulary']['collocations']=linked
 rec['vocabulary']['relatedWords']=relations
 rec['vocabulary']['candidateRelations']=candidates
 rec['sentences']=sents
 rec['grammarLinks']=grams
 # Resolve prior PARTIAL transparently.
 evidence_count=len(compounds)+len(colls)+len(sents)+len(grams)+len(relations)
 if rec.get('pronunciation',{}).get('primary') and short and evidence_count>0:
  new_status='PASS'
 elif rec.get('pronunciation',{}).get('primary') and short:
  new_status='BLOCKED-NO-SUPPORTING-EVIDENCE'
  blocked_final.append({'word':word,'reason':'No compound, collocation, sentence, grammar or reviewed relation found in available local sources'})
 else:
  new_status='BLOCKED-CORE-MISSING'
  blocked_final.append({'word':word,'reason':'Missing core pinyin or meaning'})
 rec['review']={'status':new_status,'warnings':[],'previousStatus':old_status,'evidenceCounts':{'compounds':len(compounds),'collocations':len(colls),'sentences':len(sents),'grammar':len(grams),'reviewedRelations':len(relations),'candidateRelations':len(candidates)}}
 if not compounds: rec['review']['warnings'].append('Không có compound chứa nguyên target trong dữ liệu HSK 1-6')
 if not colls: rec['review']['warnings'].append('Không có collocation đầy đủ và chứa nguyên target')
 if not sents: rec['review']['warnings'].append('Không có câu nguồn đầy đủ chứa nguyên target')
 if not grams: rec['review']['warnings'].append('Không có liên kết ngữ pháp/cách dùng exact-match')
 if not relations: rec['review']['warnings'].append('Không có quan hệ đã xác minh; candidate nếu có không tự xuất bản')
 if not sents: missing_sentence_after+=1
 status_counter[new_status]+=1
 json.dump(rec,open(WORDS/fn(word),'w',encoding='utf-8'),ensure_ascii=False,indent=2)
 for g in grams: grammar_rows.append([word,g.get('grammarId',''),g.get('title',''),g.get('partOfSpeech',''),g.get('syntax',''),g.get('usageNoteVi',''),g.get('explanationVi',''),g.get('tipsVi',''),g.get('attentionsVi',''),g.get('source',''),g.get('reviewStatus','')])
 summary_rows.append({'word':word,'hsk':rec.get('hsk',{}).get('primaryLevel'),'charCount':rec.get('charCount'),'pinyin':rec.get('pronunciation',{}).get('primary'),'meaningShortVi':short,'meaningFullVi':full,'compounds':len(compounds),'collocations':len(colls),'collocationsWithSentences':sum(1 for c in linked if c['sentenceCount']),'linkedCollocationSentences':sum(c['sentenceCount'] for c in linked),'sentences':len(sents),'grammar':len(grams),'reviewedRelations':len(relations),'candidateRelations':len(candidates),'oldStatus':old_status,'newStatus':new_status})

# Updated indexes/search.
new_index={'schemaVersion':'word-enrichment-index-v3-c2a19','scope':'HSK 1-3 multi-character words; enrichment evidence may use local HSK 1-6 and grammar files','words':{w:f'words/{fn(w)}' for w in sorted(records)},'counts':{'total':len(records),**dict(status_counter)}}
json.dump(new_index,open(OUT/'index.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
search=[]
for r in summary_rows:
 search.append({'word':r['word'],'path':f'words/{fn(r["word"])}','pinyin':r['pinyin'],'pinyinNormalized':norm_vi(r['pinyin']),'meaningShortVi':r['meaningShortVi'],'meaningFullVi':r['meaningFullVi'],'meaningNormalized':norm_vi(r['meaningShortVi']),'meaningFullNormalized':norm_vi(r['meaningFullVi']),'hskLevel':r['hsk'],'qualityStatus':r['newStatus']})
json.dump({'schemaVersion':'word-search-index-v3-c2a19','items':search},open(OUT/'search_index.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)

partial_resolution=[]
for w in partial_before:
 r=next(x for x in summary_rows if x['word']==w)
 partial_resolution.append({'word':w,'oldStatus':'PARTIAL','newStatus':r['newStatus'],'compounds':r['compounds'],'collocations':r['collocations'],'sentences':r['sentences'],'grammar':r['grammar'],'reviewedRelations':r['reviewedRelations']})

report={'schemaVersion':'c2a19c-i-report-v1','scope':'HSK 1-3 multi-character records with evidence from local HSK 1-6 + grammar HSK/New HSK','policy':{'unverifiedRadicals':'leave blank','unverifiedFormationType':'leave blank','noGeneratedTranslations':True,'noGeneratedSentences':True,'semanticCandidateNotPublished':True},'counts':{'records':len(records),'missingSentenceBefore':missing_sentence_before,'missingSentenceAfter':missing_sentence_after,'sentencesAddedCoverage':missing_sentence_before-missing_sentence_after,'status':dict(status_counter),'compounds':sum(x['compounds'] for x in summary_rows),'collocations':sum(x['collocations'] for x in summary_rows),'collocationsWithSentences':sum(x['collocationsWithSentences'] for x in summary_rows),'linkedCollocationSentences':sum(x['linkedCollocationSentences'] for x in summary_rows),'sentences':sum(x['sentences'] for x in summary_rows),'grammarLinks':sum(x['grammar'] for x in summary_rows),'reviewedRelations':sum(x['reviewedRelations'] for x in summary_rows),'candidateRelations':sum(x['candidateRelations'] for x in summary_rows),'partialBefore':len(partial_before),'partialResolvedToPass':sum(x['newStatus']=='PASS' for x in partial_resolution),'partialResolvedToBlocked':sum(x['newStatus']!='PASS' for x in partial_resolution)},'partialResolution':partial_resolution,'validation':{}}

# Validator.
errors=[]
for w in records:
 rec=json.load(open(WORDS/fn(w),encoding='utf-8'))
 if not rec.get('pronunciation',{}).get('primary'): errors.append([w,'core','missing-pinyin'])
 if not rec.get('meaningShortVi'): errors.append([w,'core','missing-short-meaning'])
 for c in rec.get('vocabulary',{}).get('compounds',[]):
  if w not in c.get('word',''): errors.append([w,'compound','target-mismatch:'+c.get('word','')])
  if not c.get('pinyin') or not c.get('meaningVi'): errors.append([w,'compound','incomplete:'+c.get('word','')])
 for c in rec.get('vocabulary',{}).get('collocations',[]):
  if w not in c.get('text',''): errors.append([w,'collocation','target-mismatch:'+c.get('text','')])
  if not c.get('pinyin') or not c.get('meaningVi'): errors.append([w,'collocation','incomplete:'+c.get('text','')])
  for s in c.get('sentences',[]):
   if c.get('text','') not in s.get('chinese',''): errors.append([w,'collocation-sentence','phrase-mismatch'])
 for s in rec.get('sentences',[]):
  if w not in s.get('chinese',''): errors.append([w,'sentence','target-mismatch:'+s.get('chinese','')])
  if not s.get('pinyin') or not s.get('meaningVi'): errors.append([w,'sentence','incomplete:'+s.get('chinese','')])
 for r in rec.get('vocabulary',{}).get('relatedWords',[]):
  if r.get('reviewStatus')!='reviewed-local': errors.append([w,'relation','unreviewed-in-published'])
report['validation']={'errors':len(errors),'passed':len(errors)==0}
json.dump(report,open(OUT/'c2a19_report.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
json.dump({'schemaVersion':'c2a19-validation-v1','errorCount':len(errors),'errors':errors},open(OUT/'validation_report.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
json.dump({'schemaVersion':'c2a19-blocked-v1','items':blocked_final},open(OUT/'blocked_records_c2a19.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)

# CSVs for Excel/report traceability.
def write_csv(name,header,rows):
 with open(OUT/name,'w',encoding='utf-8-sig',newline='') as f:
  w=csv.writer(f);w.writerow(header);w.writerows(rows)
write_csv('word_coverage_c2a19.csv',list(summary_rows[0].keys()),[[r[k] for k in summary_rows[0].keys()] for r in summary_rows])
write_csv('relations_c2a19.csv',['sourceWord','targetWord','relationType','pinyin','meaningVi','evidence','source','reviewStatus'],relation_rows)
write_csv('collocation_sentence_links_c2a19.csv',['word','collocation','collocationPinyin','collocationMeaning','sentenceChinese','sentencePinyin','sentenceMeaning','source'],coll_sentence_rows)
write_csv('grammar_links_c2a19.csv',['word','grammarId','title','partOfSpeech','syntax','usageNoteVi','explanationVi','tipsVi','attentionsVi','source','reviewStatus'],grammar_rows)
write_csv('partial_resolution_c2a19.csv',['word','oldStatus','newStatus','compounds','collocations','sentences','grammar','reviewedRelations'],[[x[k] for k in ['word','oldStatus','newStatus','compounds','collocations','sentences','grammar','reviewedRelations']] for x in partial_resolution])

readme=f'''# C2A.19C–I — HSK 1–3 Evidence-based Enrichment\n\n## Nguyên tắc\n- 85 chữ chưa xác minh bộ thủ và 266 loại chữ chưa chắc chắn được giữ trống; gói này không tự điền.\n- Không tự sáng tác câu, pinyin hoặc nghĩa.\n- Compound/collocation/câu chỉ hiển thị khi chứa nguyên target và đủ pinyin + nghĩa.\n- Dữ liệu bổ sung dùng exact-word records từ HSK 1–6 local và exact occurrence trong grammar HSK/New HSK.\n- Quan hệ đồng âm là reviewed-local vì dựa trên pinyin exact-match.\n- Quan hệ cùng nghĩa chỉ là candidate needs-review, không tự xuất bản.\n\n## Kết quả\n- Records: {len(records)}\n- Thiếu câu trước/sau: {missing_sentence_before} / {missing_sentence_after}\n- PASS: {status_counter['PASS']}\n- BLOCKED không có bằng chứng phụ trợ: {status_counter['BLOCKED-NO-SUPPORTING-EVIDENCE']}\n- Compounds: {report['counts']['compounds']}\n- Collocations: {report['counts']['collocations']}\n- Collocations có câu exact: {report['counts']['collocationsWithSentences']}\n- Câu: {report['counts']['sentences']}\n- Grammar links: {report['counts']['grammarLinks']}\n- Reviewed relations: {report['counts']['reviewedRelations']}\n- Candidate relations: {report['counts']['candidateRelations']}\n- Validator errors: {len(errors)}\n\n## 24 PARTIAL\n- Chuyển PASS khi tìm được bằng chứng local: {report['counts']['partialResolvedToPass']}\n- Chuyển BLOCKED rõ lý do khi không có bằng chứng: {report['counts']['partialResolvedToBlocked']}\n'''
(WORK/'c2a19ci_out/README_C2A_19C_I.md').write_text(readme,encoding='utf-8')
# Copy scripts used.
shutil.copy2(__file__,SCRIPTS/'build_c2a19c_i.py')
print(json.dumps(report['counts'],ensure_ascii=False,indent=2)); print('validation errors',len(errors))

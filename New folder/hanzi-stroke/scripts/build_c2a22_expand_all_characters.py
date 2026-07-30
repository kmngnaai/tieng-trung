import json, re, shutil, csv, time, unicodedata
from pathlib import Path
from collections import defaultdict, Counter

WORK=Path('/mnt/data/c2a22_work')
BASE=WORK/'base'
CUR=WORK/'current'
SRC=WORK/'modules_src/modules/hanzi-stroke/data'
OUT=WORK/'out'
if OUT.exists(): shutil.rmtree(OUT)
shutil.copytree(BASE, OUT)
# overlay latest app/data patches
for src in CUR.rglob('*'):
    if src.is_file():
        rel=src.relative_to(CUR)
        dst=OUT/rel
        dst.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(src,dst)

UROOT=OUT/'modules/hanzi-stroke/data/learning/unified-lookup/all-sources'
RROOT=OUT/'modules/hanzi-stroke/data/learning/radicals'
SCRIPTROOT=OUT/'modules/hanzi-stroke/scripts'
SCRIPTROOT.mkdir(parents=True,exist_ok=True)
HAN_RE=re.compile(r'[\u3400-\u9fff\U00020000-\U0002EBEF]')

def load(p, default=None):
    try:
        with open(p,encoding='utf-8') as f:return json.load(f)
    except Exception:return default

def clean(s):return re.sub(r'\s+',' ',str(s or '')).strip()
def pclean(s):return clean(str(s or '').replace('*',' '))
def short(s,n=180):
    s=clean(s)
    for sep in [' / ',';','. ']:
        if sep in s:
            vals=[x.strip() for x in s.split(sep) if x.strip()]
            if vals:return '; '.join(vals[:2])[:n]
    return s[:n]
def unique(seq,key):
    out=[];seen=set()
    for x in seq:
        k=key(x)
        if not k or k in seen:continue
        seen.add(k);out.append(x)
    return out

# Existing unified data (latest records overlaid; indexes from base)
index_payload=load(UROOT/'unified-target-index.json',{'targets':{}})
old_index=index_payload.get('targets',{})
records={}
for p in sorted((UROOT/'records').glob('*.json')):
    payload=load(p,{'records':{}})
    records.update(payload.get('records',{}))
print('existing records',len(records),'index',len(old_index),flush=True)

# Source character inventory
char_index=load(SRC/'char-index.json',[])
char_data={}
for row in char_index:
    d=load(SRC/row['path'],{})
    if d:char_data[row['char']]=d
print('char inventory',len(char_data),flush=True)

# Radical inventory
rad_notes=load(RROOT/'radical_learning_notes.json',{})
alias=load(RROOT/'radical_alias_index.json',{})
main_to_id={v.get('mainForm'):k for k,v in rad_notes.items() if v.get('mainForm')}

def radical_detail(rid,input_form,resolution,source):
    r=rad_notes[rid]
    return {
        'status':'resolved','id':rid,'inputForm':input_form or r.get('mainForm',''),
        'mainForm':r.get('mainForm',''),'sideForm':r.get('sideForm',''),
        'displayNameVi':r.get('displayNameVi',''),'pinyin':r.get('pinyin',''),
        'hanViet':r.get('hanViet',''),
        'meaningVi':(r.get('shortForCharLookup') or {}).get('meaningLine') or r.get('shortMeaningVi','') or '',
        'kangxiNo':r.get('kangxiNo'),'resolutionType':resolution,'source':source
    }

def resolve_radical(ch,d):
    # B: target itself is an official radical (must win for 青 etc.)
    if ch in main_to_id:
        return radical_detail(main_to_id[ch],ch,'self-radical','radical_learning_notes.json')
    # C: target itself is one unique variant/alias
    ids=alias.get(ch,[]) or []
    if len(ids)==1:
        return radical_detail(ids[0],ch,'radical-variant','radical_alias_index.json')
    # A: record has a radical form that maps uniquely to the 214-radical store
    raw=clean(d.get('radical'))
    ids=alias.get(raw,[]) if raw else []
    if len(ids)==1:
        return radical_detail(ids[0],raw,'record-radical',f"data/{d.get('_path','chars')}")
    return {'status':'not-resolved','inputForm':raw,'mainForm':'','resolutionType':'not-resolved','source':f"data/{d.get('_path','chars')}"}

# Existing target info for related word indexing
multi_records={k:v for k,v in records.items() if len(k)>1 and v.get('targetType')=='multi-character-word'}
char_to_words=defaultdict(list)
for target,rec in multi_records.items():
    for ch in set(HAN_RE.findall(target)):
        char_to_words[ch].append({
            'word':target,'pinyin':rec.get('pinyin',''),'meaningVi':rec.get('meaningShortVi') or short(rec.get('meaningFullVi','')),
            'level':min(rec.get('levels') or [99]),'relationType':'contains-target','source':'unified-existing-target'
        })

# Sentence candidates from all existing records, indexed by every Han character in sentence.
char_to_sentences=defaultdict(list)
seen_sentence_global=set()
for target,rec in records.items():
    for s in rec.get('sentences') or []:
        zh=clean(s.get('chinese'))
        py=pclean(s.get('pinyin'))
        vi=clean(s.get('meaningVi'))
        if not (zh and py and vi):continue
        basekey=(zh,py,vi)
        # add to each char once
        for ch in set(HAN_RE.findall(zh)):
            k=(ch,)+basekey
            if k in seen_sentence_global:continue
            seen_sentence_global.add(k)
            char_to_sentences[ch].append({
                'chinese':zh,'pinyin':py,'meaningVi':vi,
                'level':s.get('level',99),'sourceFile':s.get('sourceFile') or 'unified-existing-sentence',
                'relevanceScore':1,'matchedRelatedWords':[]
            })

# Build/enrich every char record
stats=Counter(); detail_rows=[]; radical_rows=[]; missing_rows=[]
all_chars=set(char_data)
for i,ch in enumerate(sorted(all_chars),1):
    d=dict(char_data[ch]); d['_path']=next((x['path'] for x in char_index if x['char']==ch),'')
    existing=records.get(ch,{})
    pinyin=pclean(existing.get('pinyin') or d.get('pinyin'))
    hanviet=clean(existing.get('hanViet') or d.get('hanViet'))
    meaning_full=clean(existing.get('meaningFullVi') or d.get('meaningVi'))
    meaning_short=clean(existing.get('meaningShortVi') or short(meaning_full))
    radical=existing.get('radical') if (existing.get('radical') or {}).get('status')=='resolved' else resolve_radical(ch,d)

    rel=[]
    # exact source-provided related words
    for rw in d.get('relatedWords') or []:
        w=clean(rw.get('word'))
        if ch not in w or w==ch:continue
        item={'word':w,'pinyin':pclean(rw.get('pinyin')),'meaningVi':clean(rw.get('meaningVi')),
              'level':rw.get('hsk') or 99,'relationType':'contains-target','source':d['_path']}
        if item['pinyin'] and item['meaningVi']:rel.append(item)
    # existing unified words containing target
    rel.extend(char_to_words.get(ch,[]))
    rel=unique(rel,lambda x:x['word'])
    rel.sort(key=lambda x:(x.get('level',99),len(x['word']),x['word']))
    rel=rel[:20]
    relset={x['word'] for x in rel}

    sent=[]
    for s in char_to_sentences.get(ch,[]):
        q=dict(s)
        matched=[w for w in relset if w in q['chinese']]
        q['matchedRelatedWords']=matched[:3]
        q['relevanceScore']=5 if matched else 1
        sent.append(q)
    sent=unique(sent,lambda x:(x['chinese'],x['pinyin']))
    sent.sort(key=lambda x:(-x.get('relevanceScore',0),x.get('level',99),len(x['chinese'])))
    sent=sent[:10]

    has_pinyin=bool(pinyin);has_meaning=bool(meaning_short or meaning_full)
    has_radical=radical.get('status')=='resolved'
    if has_pinyin and has_meaning and has_radical and rel and sent:
        tier='A'
    elif has_pinyin and has_meaning and has_radical:
        tier='B'
    else:
        tier='C'

    base={
        'schemaVersion':'unified-lookup-v2-all-characters',
        'target':ch,'targetType':'single-character','dataTier':tier,
        'dataTierDefinition':{
            'A':'pinyin + nghĩa + bộ thủ + từ liên quan + câu liên quan',
            'B':'pinyin + nghĩa + bộ thủ + cách viết',
            'C':'dữ liệu ký tự cơ bản từ kho local'
        }[tier],
        'pinyin':pinyin,'hanViet':hanviet,'meaningShortVi':meaning_short,'meaningFullVi':meaning_full,
        'traditional':clean(existing.get('traditional') or d.get('traditional')),
        'wordType':existing.get('wordType') or 'single-character',
        'wordTypeExplanation':existing.get('wordTypeExplanation') or '',
        'usageNoteVi':existing.get('usageNoteVi') or '',
        'levels':existing.get('levels') or ([d.get('hsk')] if d.get('hsk') is not None else []),
        'libraries':unique((existing.get('libraries') or [])+['char_dictionary'],lambda x:x),
        'routes':existing.get('routes') or [],
        'writing':{'enabled':True,'characters':[ch],'availability':'hanzi-writer-runtime'},
        'radical':radical,
        'radicalComponentOf':existing.get('radicalComponentOf') or [],
        'characters':[{'char':ch,'pinyin':pinyin,'hanViet':hanviet,'meaningVi':meaning_short,'radical':radical}],
        'components':existing.get('components') or [],
        'memory':existing.get('memory') or {},
        'relatedWords':rel,
        'collocations':existing.get('collocations') or [],
        'sentences':sent,
        'grammar':existing.get('grammar') or [],
        'strokeCount':existing.get('strokeCount') if existing.get('strokeCount') is not None else d.get('strokeCount'),
        'sources':unique((existing.get('sources') or [])+[
            {'file':d['_path'],'libraries':['char_dictionary']}
        ],lambda x:(x.get('file'),tuple(x.get('libraries') or [])))
    }
    # Preserve source-backed advanced fields from existing unified record.
    for key in ['etymology','learningStory','visualComponents','historicalComponents','sinoVietnameseMirror','unlockWords']:
        if key in existing:base[key]=existing[key]
    records[ch]=base
    stats['characters']+=1;stats[f'tier{tier}']+=1
    stats['withPinyin']+=has_pinyin;stats['withMeaning']+=has_meaning;stats['withRadical']+=has_radical
    stats['withRelated']+=bool(rel);stats['withSentences']+=bool(sent);stats['withHanViet']+=bool(hanviet)
    detail_rows.append([ch,tier,pinyin,hanviet,meaning_short,radical.get('status',''),radical.get('mainForm',''),radical.get('displayNameVi',''),radical.get('resolutionType',''),len(rel),len(sent),d.get('hsk'),d['_path']])
    radical_rows.append([ch,tier,radical.get('status',''),radical.get('inputForm',''),radical.get('mainForm',''),radical.get('displayNameVi',''),radical.get('kangxiNo'),radical.get('resolutionType',''),radical.get('source','')])
    missing=[]
    if not has_meaning:missing.append('nghĩa')
    if not has_radical:missing.append('bộ thủ')
    if not rel:missing.append('từ liên quan')
    if not sent:missing.append('câu liên quan')
    if not hanviet:missing.append('Hán Việt')
    if missing:missing_rows.append([ch,tier,pinyin,meaning_short,', '.join(missing),d['_path']])
    if i%2000==0:print('processed',i,dict(stats),flush=True)

# Rebuild all buckets/index/search, preserving all multi-word records.
for p in (UROOT/'records').glob('*.json'):p.unlink()
buckets=defaultdict(dict); search=[]
for target,rec in sorted(records.items()):
    bucket=f'{ord(target[0])%256:02X}'
    buckets[bucket][target]=rec
    search.append({'target':target,'bucket':bucket,'type':rec.get('targetType',''),
                   'pinyin':rec.get('pinyin',''),'meaningVi':rec.get('meaningShortVi',''),
                   'levels':rec.get('levels') or [],'libraries':rec.get('libraries') or [],
                   'dataTier':rec.get('dataTier','')})
for b,d in buckets.items():
    with open(UROOT/'records'/f'{b}.json','w',encoding='utf-8') as f:
        json.dump({'schemaVersion':'unified-record-bucket-v2','records':d},f,ensure_ascii=False,separators=(',',':'))
with open(UROOT/'unified-target-index.json','w',encoding='utf-8') as f:
    json.dump({'schemaVersion':'unified-index-v2','targets':{x['target']:x['bucket'] for x in search}},f,ensure_ascii=False,separators=(',',':'))
with open(UROOT/'search-index.json','w',encoding='utf-8') as f:
    json.dump({'schemaVersion':'unified-search-v2','items':search},f,ensure_ascii=False,separators=(',',':'))

# Report files
report={
 'schemaVersion':'c2a22-all-character-expansion-v1',
 'summary':dict(stats)|{'totalUnifiedTargets':len(records),'multiWordTargets':sum(1 for x in records.values() if x.get('targetType')=='multi-character-word'),'bucketFiles':len(buckets)},
 'tierRules':{
   'A':'Có pinyin, nghĩa, bộ thủ giải được từ kho 214, ít nhất một từ liên quan chứa target và một câu chứa target.',
   'B':'Có pinyin, nghĩa, bộ thủ giải được từ kho 214 và có cơ chế luyện viết runtime; chưa đủ cả từ và câu.',
   'C':'Giữ nguyên dữ liệu ký tự cơ bản có trong data/chars; trường thiếu để trống, không suy đoán.'
 },
 'sourceRules':{
   'pinyinMeaning':'data/chars và record unified có sẵn',
   'radical':'target là bộ chính -> target là alias/biến thể -> radical trong record ánh xạ duy nhất',
   'relatedWords':'chỉ từ chứa nguyên target, lấy từ data/chars.relatedWords và target unified',
   'sentences':'chỉ câu chứa nguyên target, lấy từ câu local đã có; ưu tiên câu chứa từ liên quan',
   'advanced':'chỉ giữ phần đã tồn tại trong record unified; không sinh mới'
 }
}
with open(UROOT/'character-expansion-report.json','w',encoding='utf-8') as f:json.dump(report,f,ensure_ascii=False,indent=2)
for fn,head,rows in [
 ('character-tier-coverage.csv',['char','tier','pinyin','hanViet','meaningVi','radicalStatus','radical','radicalName','resolutionType','relatedCount','sentenceCount','hsk','source'],detail_rows),
 ('character-radical-resolution.csv',['char','tier','status','inputForm','mainForm','radicalName','kangxiNo','resolutionType','source'],radical_rows),
 ('character-missing-data.csv',['char','tier','pinyin','meaningVi','missing','source'],missing_rows)
]:
    with open(UROOT/fn,'w',encoding='utf-8-sig',newline='') as f:
        w=csv.writer(f);w.writerow(head);w.writerows(rows)

# Validator
errors=[]
idx=load(UROOT/'unified-target-index.json',{}).get('targets',{})
for ch in all_chars:
    if ch not in idx:errors.append(f'missing-index:{ch}');continue
    rec=records.get(ch)
    if not rec:errors.append(f'missing-record:{ch}');continue
    if rec.get('dataTier') not in {'A','B','C'}:errors.append(f'bad-tier:{ch}')
    r=rec.get('radical') or {}
    if r.get('status')=='resolved' and r.get('id') not in rad_notes:errors.append(f'bad-radical:{ch}')
    for x in rec.get('relatedWords') or []:
        if ch not in x.get('word',''):errors.append(f'bad-related:{ch}:{x.get("word")}')
    for x in rec.get('sentences') or []:
        if ch not in x.get('chinese',''):errors.append(f'bad-sentence:{ch}')
validation={'passed':not errors,'errorCount':len(errors),'errors':errors[:500],
            'characterInventory':len(all_chars),'charactersInUnified':sum(1 for c in all_chars if c in idx),
            'totalUnifiedTargets':len(idx),'bucketFiles':len(list((UROOT/'records').glob('*.json')))}
with open(UROOT/'character-expansion-validation.json','w',encoding='utf-8') as f:json.dump(validation,f,ensure_ascii=False,indent=2)

# Copy reproducible script into package
shutil.copy2(__file__,SCRIPTROOT/'build_c2a22_expand_all_characters.py')
print(json.dumps(report['summary'],ensure_ascii=False,indent=2))
print(json.dumps(validation,ensure_ascii=False,indent=2))

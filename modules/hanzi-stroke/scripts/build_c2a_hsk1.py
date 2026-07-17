from __future__ import annotations
import json, re, unicodedata, shutil
from pathlib import Path
from collections import defaultdict
from datetime import datetime, timezone

ROOT = Path('/mnt/data/current_module/modules/hanzi-stroke')
OUT_ROOT = Path('/mnt/data/c2a_build/modules/hanzi-stroke/data/learning/character-enrichment/hsk1')
CHARS_OUT = OUT_ROOT / 'chars'
PDF_TEXT = Path('/mnt/data/c2a_work/pdf_text/chiet_tu.txt')
SAMPLES = Path('/mnt/data/c1_1_work')

OUT_ROOT.mkdir(parents=True, exist_ok=True)
CHARS_OUT.mkdir(parents=True, exist_ok=True)

def load_json(path):
    with open(path, encoding='utf-8') as f: return json.load(f)

def clean(s):
    return re.sub(r'\s+', ' ', str(s or '')).strip()

def cphex(ch):
    return f'{ord(ch):X}'

def is_han_char(ch):
    return len(ch)==1 and ('\u3400' <= ch <= '\u9fff' or '\U00020000' <= ch <= '\U0002FA1F')

def uniq(seq, key=lambda x:x):
    out=[]; seen=set()
    for x in seq:
        k=key(x)
        if k in seen: continue
        seen.add(k); out.append(x)
    return out

hsk = load_json(ROOT/'data/learning/hsk/hsk_1.json')
all_items = hsk['items']
selected=[]
for item in all_items:
    routes=[r for r in item.get('routes',[]) if r.get('libraryId') in {'hsk','new_hsk'} and int(r.get('levelNo') or 0)==1]
    if routes:
        x=dict(item); x['_selectedRoutes']=routes; selected.append(x)

# merge same word, preserve source memberships
by_word={}
for item in selected:
    word=clean(item.get('simplified') or item.get('word'))
    if not word: continue
    if word not in by_word:
        by_word[word]=dict(item)
        by_word[word]['_selectedRoutes']=list(item['_selectedRoutes'])
        by_word[word]['_libraries']=sorted({r['libraryId'] for r in item['_selectedRoutes']})
    else:
        cur=by_word[word]
        cur['_selectedRoutes'].extend(item['_selectedRoutes'])
        cur['_libraries']=sorted(set(cur['_libraries'])|{r['libraryId'] for r in item['_selectedRoutes']})
        # merge examples/collocations
        cur['examples']=uniq((cur.get('examples') or [])+(item.get('examples') or []), key=lambda z:clean(z.get('chinese')))
        cur['collocations']=uniq((cur.get('collocations') or [])+(item.get('collocations') or []), key=lambda z:clean(z.get('chinese')))

words=list(by_word.values())
chars=sorted({ch for w in by_word for ch in w if is_han_char(ch)}, key=ord)

# Local dictionary index only for exact single-char fallback, loaded once
local_dict = load_json(ROOT/'data/dictionary.json')
dict_single={x.get('s'):x for x in local_dict if len(x.get('s',''))==1 and is_han_char(x.get('s',''))}

# Radical metadata index
rad_groups=load_json(ROOT/'data/learning/radicals/radical_groups.json')
rad_records=[]
if isinstance(rad_groups,dict):
    for v in rad_groups.values():
        if isinstance(v,list): rad_records.extend(v)
        elif isinstance(v,dict): rad_records.append(v)
elif isinstance(rad_groups,list): rad_records=rad_groups
rad_by_form={}
for r in rad_records:
    forms=[]
    for k in ('mainForm','sideForm','radical','char','variant'):
        v=r.get(k)
        if v: forms.extend(v if isinstance(v,list) else [v])
    for form in forms: rad_by_form[form]=r

# PDF pages split by form feed
pdf_pages=PDF_TEXT.read_text(encoding='utf-8',errors='ignore').split('\f') if PDF_TEXT.exists() else []
formation_patterns=[
    ('pictographic','tượng hình',re.compile(r't[ƣưự]ợng\s+hình',re.I)),
    ('ideographic','chỉ sự',re.compile(r'chỉ\s+sự',re.I)),
    ('associative','hội ý',re.compile(r'hội\s+ý',re.I)),
    ('phono-semantic','hình thanh',re.compile(r'hình\s+thanh',re.I)),
]

def pdf_evidence(ch):
    candidates=[]
    exact_line=re.compile(rf'(?m)^\s*{re.escape(ch)}\s*$')
    for i,p in enumerate(pdf_pages, start=1):
        if exact_line.search(p):
            candidates.append((i,p))
    if not candidates:
        return None
    # choose page with a paragraph mentioning "Chữ ... <char>" if possible
    page_no,page=max(candidates,key=lambda t: (bool(re.search(rf'Chữ[^\n]{{0,30}}{re.escape(ch)}',t[1],re.I)), len(t[1])))
    txt=clean(page)
    # focus around first occurrence of "Chữ" near char; otherwise around standalone char
    m=re.search(rf'Chữ[^.]{{0,120}}{re.escape(ch)}[^.]*\.(?:[^.]*\.){{0,3}}',txt,re.I)
    if not m:
        pos=txt.find(ch)
        snippet=txt[max(0,pos-80):pos+700]
    else:
        snippet=m.group(0)
    snippet=clean(snippet)[:1200]
    found=[]
    for code,vi,pat in formation_patterns:
        if pat.search(page): found.append((code,vi))
    formation=found[0] if len(found)==1 else ('','')
    return {
        'pagePdf': page_no,
        'snippetVi': snippet,
        'formationType': formation[0],
        'formationTypeVi': formation[1],
        'reviewStatus': 'needs-review',
        'sourceTitle': 'Bí Quyết Chiết Tự Chữ Hán'
    }

# curated samples supersede generated data
sample_map={}
for path in SAMPLES.glob('sample_*.json'):
    data=load_json(path); sample_map[data['char']]=data

word_membership={w: set(by_word[w]['_libraries']) for w in by_word}
records={}
coverage=defaultdict(int)
for ch in chars:
    char_path=ROOT/'data/chars'/f'{cphex(ch)}.json'
    raw=load_json(char_path) if char_path.exists() else {'char':ch}
    exact=by_word.get(ch)
    d=dict_single.get(ch,{})
    meaning=clean((exact or {}).get('meaningVi')) or clean(raw.get('meaningVi')) or clean(d.get('vi')) or clean(raw.get('meaningEn'))
    pinyin=clean((exact or {}).get('pinyin')) or clean(raw.get('pinyin')) or clean(d.get('p'))
    hanviet=clean(raw.get('hanViet')) or clean(d.get('sv'))
    radical=clean(raw.get('radical'))
    rad_meta=rad_by_form.get(radical,{})
    compounds=[]
    # HSK1 merged words first
    for w,item in by_word.items():
        if ch not in w or w==ch: continue
        compounds.append({
            'word':w,'pinyin':clean(item.get('pinyin')),'meaningVi':clean(item.get('meaningVi')),
            'relationType':'contains-target-character','hskLevel':'HSK 1 / New HSK 1',
            'source':sorted(word_membership[w]),'reviewStatus':'reviewed'
        })
    # local char related words
    for x in raw.get('relatedWords') or []:
        w=clean(x.get('word'))
        if not w or ch not in w: continue
        compounds.append({'word':w,'pinyin':clean(x.get('pinyin')),'meaningVi':clean(x.get('meaningVi') or x.get('meaningEn')),
                          'relationType':'contains-target-character','hskLevel':'','source':['local_chars'],'reviewStatus':'reviewed'})
    compounds=uniq(compounds,key=lambda z:z['word'])[:24]

    collocations=[]; sentences=[]
    for w,item in by_word.items():
        if ch not in w: continue
        for c in item.get('collocations') or []:
            text=clean(c.get('chinese'))
            if ch in text:
                collocations.append({'text':text,'pinyin':clean(c.get('pinyin')),'meaningVi':clean(c.get('meaning_vi') or c.get('meaningVi')),
                                     'target':w,'source':'local_hsk_merged','reviewStatus':'reviewed'})
        for e in item.get('examples') or []:
            text=clean(e.get('chinese'))
            if ch in text:
                sentences.append({'target':w,'targetType':'word' if len(w)>1 else 'character','chinese':text,
                                  'pinyin':clean(e.get('pinyin')),'meaningVi':clean(e.get('meaning_vi') or e.get('meaningVi')),
                                  'source':'local_hsk_merged','sourceRef':f'{w}.examples','containsTarget':True,'reviewStatus':'reviewed'})
    collocations=uniq(collocations,key=lambda z:z['text'])[:12]
    sentences=uniq(sentences,key=lambda z:z['chinese'])[:12]

    pdf=pdf_evidence(ch)
    formationType=pdf.get('formationType','') if pdf else ''
    formationVi=pdf.get('formationTypeVi','chưa xác định') if pdf else 'chưa xác định'
    components=[]
    if radical:
        components=[{'char':radical,'position':'unknown','role':'unknown','roleVi':'bộ thủ',
                     'meaningVi':clean(rad_meta.get('shortMeaningVi') or rad_meta.get('meaningVi') or ''),
                     'soundHint':'','reviewStatus':'needs-review'}]
    explanation=(pdf.get('snippetVi') if pdf else '') or 'Chưa tìm thấy mục chiết tự phù hợp trong PDF có lớp văn bản. Dữ liệu cơ bản vẫn dùng nguồn local.'
    sources=[
        {'sourceId':'local_chars','sourceTitle':'data/chars','sourceType':'local-json','pathOrPage':f'data/chars/{cphex(ch)}.json','fields':['pinyin','hanViet','radical','relatedWords'],'reviewStatus':'reviewed'},
        {'sourceId':'local_hsk_merged','sourceTitle':'HSK 1 thường + New HSK 1','sourceType':'local-json','pathOrPage':'data/learning/hsk/hsk_1.json','fields':['meaning','compounds','collocations','sentences'],'reviewStatus':'reviewed'}
    ]
    if pdf:
        sources.append({'sourceId':'pdf_chiet_tu','sourceTitle':pdf['sourceTitle'],'sourceType':'pdf','pathOrPage':f'PDF page {pdf["pagePdf"]}',
                        'fields':['formationTypeCandidate','decompositionCandidate','memoryCandidate'],'reviewStatus':'needs-review','note':'Trích tự động từ trang có tiêu đề đúng chữ; cần duyệt trước khi coi là kiến thức chuẩn.'})
    sources.append({'sourceId':'pdf_500_chars','sourceTitle':'500 Ký Tự Tiếng Hoa Cơ Bản','sourceType':'pdf-scan','pathOrPage':'PDF scan','fields':[], 'reviewStatus':'pdf-pending-visual','note':'PDF không có text layer; chưa OCR hàng loạt để tránh nhận sai chữ Hán.'})

    record={
      'schemaVersion':'character-enrichment-c2a-v1', 'id':f'char:{ch}', 'type':'character','char':ch,
      'simplified':ch,'traditional':clean(raw.get('traditional')) or ch,
      'scope':{'hsk1': 'hsk' in ({r['libraryId'] for r in (exact or {}).get('_selectedRoutes',[])} if exact else set()) or any('hsk' in word_membership[w] for w in by_word if ch in w),
               'newHsk1':'new_hsk' in ({r['libraryId'] for r in (exact or {}).get('_selectedRoutes',[])} if exact else set()) or any('new_hsk' in word_membership[w] for w in by_word if ch in w)},
      'pronunciation':{'pinyin':[pinyin] if pinyin else [],'hanViet':hanviet.lower()},
      'meaningSenses':[{'partOfSpeech':clean((exact or {}).get('wordType')),'meaningVi':meaning,'source':['local_hsk_merged' if exact else 'local_chars'],'reviewStatus':'reviewed' if meaning else 'needs-review'}],
      'characterInfo':{'strokeCount':raw.get('strokeCount'),'structureType':'','formationType':formationType,'formationTypeVi':formationVi,
                       'radical':{'mainForm':radical,'variant':radical,'nameVi':clean(rad_meta.get('displayNameVi') or (f'Bộ {radical}' if radical else '')),
                                  'pinyin':clean(rad_meta.get('pinyin')),'hanViet':clean(rad_meta.get('hanViet')),'meaningVi':clean(rad_meta.get('shortMeaningVi') or rad_meta.get('meaningVi'))}},
      'components':components,
      'etymology':{'standardExplanationVi':explanation,'historicalNoteVi':'Nội dung PDF trích tự động chỉ là ứng viên cho đến khi được duyệt.','confidence':'needs-review' if pdf else 'not-available'},
      'learningStory':{'memoryStoryVi': explanation if pdf else '', 'memoryPoemVi':'','isHistoricalClaim':False,'reviewStatus':'needs-review' if pdf else 'not-available'},
      'vocabulary':{'compounds':compounds,'relatedWords':[],'collocations':collocations},
      'sentences':sentences,'grammarLinks':[],'sameRadicalCharacters':[], 'pdfEvidence':pdf,
      'sources':sources,
      'review':{'status':'auto-generated-c2a','reviewedFields':['core','hskVocabulary','sentences-target-check'],
                'warnings':(['Chiết tự và câu chuyện từ PDF đang ở trạng thái ứng viên, cần duyệt.'] if pdf else ['Không tìm thấy mục PDF text cho chữ này.'])}
    }
    if ch in sample_map:
        record=sample_map[ch]
        record['schemaVersion']='character-enrichment-c2a-v1-reviewed'
        record['scope']={'hsk1':any(ch in w and 'hsk' in word_membership[w] for w in by_word), 'newHsk1':any(ch in w and 'new_hsk' in word_membership[w] for w in by_word)}
        record['review']['status']='reviewed-c2a-seed'
    records[ch]=record
    coverage['pdf_found'] += bool(pdf)
    coverage['reviewed_seed'] += ch in sample_map
    coverage['has_meaning'] += bool(meaning)
    coverage['has_pinyin'] += bool(pinyin)
    coverage['has_hanviet'] += bool(hanviet)
    coverage['has_radical'] += bool(radical)
    coverage['has_sentences'] += bool(sentences)
    coverage['has_compounds'] += bool(compounds)

for ch,rec in records.items():
    with open(CHARS_OUT/f'{cphex(ch)}.json','w',encoding='utf-8') as f: json.dump(rec,f,ensure_ascii=False,indent=2)

index={
 'schemaVersion':'character-enrichment-c2a-index-v1',
 'generatedAt':datetime.now(timezone.utc).isoformat(),
 'scope':{'libraries':['hsk','new_hsk'],'level':1,'mergeRule':'unique word; unique Han character'},
 'counts':{'hsk1SourceWords':sum(1 for x in words if 'hsk' in x['_libraries']),
           'newHsk1SourceWords':sum(1 for x in words if 'new_hsk' in x['_libraries']),
           'mergedUniqueWords':len(words),'uniqueCharacters':len(chars)},
 'characters':{ch:f'../../data/learning/character-enrichment/hsk1/chars/{cphex(ch)}.json' for ch in chars},
 'pinyinIndex':defaultdict(list),
 'sampleCharacters':['休','住','清']
}
for ch,rec in records.items():
    for py in rec.get('pronunciation',{}).get('pinyin',[]):
        key=unicodedata.normalize('NFD',py.lower())
        key=''.join(c for c in key if unicodedata.category(c)!='Mn')
        key=re.sub('[^a-z0-9]','',key)
        if key: index['pinyinIndex'][key].append(ch)
index['pinyinIndex']=dict(index['pinyinIndex'])
with open(OUT_ROOT/'index.json','w',encoding='utf-8') as f: json.dump(index,f,ensure_ascii=False,indent=2)

report={
 'schemaVersion':'c2a-build-report-v1','generatedAt':index['generatedAt'],
 'scope':'HSK 1 thường + New HSK 1', 'counts':index['counts'], 'coverage':dict(coverage),
 'qualityRules':{
   'compoundMustContainTarget':all(ch in x['word'] for ch,r in records.items() for x in r.get('vocabulary',{}).get('compounds',[])),
   'sentenceMustContainTargetCharacter':all(ch in x['chinese'] for ch,r in records.items() for x in r.get('sentences',[])),
   'pdfCandidatesNotAutoReviewed':all((not r.get('pdfEvidence')) or r.get('review',{}).get('status')!='reviewed' for ch,r in records.items() if ch not in sample_map)
 },
 'notes':['PDF 500 Ký Tự là bản scan không có text layer, được đánh dấu pdf-pending-visual.',
          'Chỉ ba seed 休/住/清 là dữ liệu chiết tự đã duyệt. Các chữ còn lại có trích đoạn PDF chỉ ở trạng thái needs-review.']
}
with open(OUT_ROOT/'build_report.json','w',encoding='utf-8') as f: json.dump(report,f,ensure_ascii=False,indent=2)
with open(OUT_ROOT/'quality_report.json','w',encoding='utf-8') as f: json.dump({'qualityRules':report['qualityRules'],'coverage':dict(coverage)},f,ensure_ascii=False,indent=2)

md=f'''# C2A - HSK 1 thường + New HSK 1\n\n- HSK 1 source words: {index['counts']['hsk1SourceWords']}\n- New HSK 1 source words: {index['counts']['newHsk1SourceWords']}\n- Unique merged words: {len(words)}\n- Unique Han characters: {len(chars)}\n- PDF exact-page candidates: {coverage['pdf_found']}\n- Reviewed seed records: {coverage['reviewed_seed']}\n- Characters with pinyin: {coverage['has_pinyin']}\n- Characters with Hán Việt: {coverage['has_hanviet']}\n- Characters with radical: {coverage['has_radical']}\n- Characters with compounds: {coverage['has_compounds']}\n- Characters with validated target-containing sentences: {coverage['has_sentences']}\n\n## Safety rule\n\nPDF-derived formation, decomposition and memory text remain `needs-review`. Only reviewed seed records are presented as reviewed knowledge.\n'''
(OUT_ROOT/'BUILD_REPORT.md').write_text(md,encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))

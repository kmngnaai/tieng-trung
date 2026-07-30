#!/usr/bin/env python3
from __future__ import annotations
import json, re, unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HSK_DIR = ROOT / 'data' / 'learning' / 'hsk'
OUT_DIR = ROOT / 'data' / 'learning' / 'word-enrichment' / 'hsk1-3'
WORDS_DIR = OUT_DIR / 'words'

HAN_RE = re.compile(r'[\u3400-\u9fff\uf900-\ufaff]')

def clean(v):
    return re.sub(r'\s+', ' ', str(v or '')).strip()

def norm_pinyin(v):
    return clean(v).replace('*', ' ')

def key_text(v):
    s = unicodedata.normalize('NFD', clean(v).lower())
    s = ''.join(ch for ch in s if unicodedata.category(ch) != 'Mn')
    return re.sub(r'[^a-z0-9\u3400-\u9fff]+', '', s)

def uniq(items, key):
    out=[]; seen=set()
    for item in items:
        k=key(item)
        if not k or k in seen: continue
        seen.add(k); out.append(item)
    return out

def filename(word):
    return '-'.join(f'{ord(ch):X}' for ch in word) + '.json'

def levels_for(item, file_level):
    levels=set()
    systems=set()
    for route in item.get('routes') or []:
        lib=route.get('libraryId')
        lv=route.get('levelNo')
        if lib in {'hsk','new_hsk'} and isinstance(lv,(int,float)) and 1 <= int(lv) <= 3:
            levels.add(int(lv)); systems.add(lib)
    if not levels: levels.add(file_level)
    return sorted(levels), sorted(systems)

def sentence_row(row, target, source):
    zh=clean(row.get('chinese') or row.get('zh'))
    return {
        'target': target,
        'chinese': zh,
        'pinyin': norm_pinyin(row.get('pinyin')),
        'meaningVi': clean(row.get('meaning_vi') or row.get('meaningVi')),
        'source': source,
        'containsTarget': target in zh,
        'reviewStatus': 'reviewed'
    }

def collocation_row(row, target, source):
    text=clean(row.get('chinese') or row.get('text') or row.get('word'))
    return {
        'text': text,
        'pinyin': norm_pinyin(row.get('pinyin')),
        'meaningVi': clean(row.get('meaning_vi') or row.get('meaningVi') or row.get('meaning')),
        'target': target,
        'source': source,
        'reviewStatus': 'reviewed'
    }

def main():
    WORDS_DIR.mkdir(parents=True, exist_ok=True)
    raw=[]
    by_word_items=defaultdict(list)
    for level in (1,2,3):
        path=HSK_DIR / f'hsk_{level}.json'
        data=json.loads(path.read_text(encoding='utf-8'))
        for item in data.get('items',[]):
            word=clean(item.get('word') or item.get('simplified'))
            if len(word) < 2 or not HAN_RE.search(word):
                continue
            item['_fileLevel']=level
            item['_sourceFile']=f'hsk_{level}.json'
            raw.append(item)
            by_word_items[word].append(item)

    all_words=set(by_word_items)
    index={'schemaVersion':'word-enrichment-index-v1','scope':'HSK 1-3 merged','words':{},'counts':{}}
    reports=[]

    for word, items in sorted(by_word_items.items(), key=lambda kv:(len(kv[0]), kv[0])):
        readings=[]; meanings=[]; word_types=[]; usage=[]; explanations=[]; routes=[]; collocations=[]; sentences=[]; audio=[]; levels=set(); systems=set(); traditional=''
        for item in items:
            lv, sys = levels_for(item, item['_fileLevel']); levels.update(lv); systems.update(sys)
            traditional = traditional or clean(item.get('traditional'))
            p=norm_pinyin(item.get('pinyin'))
            if p: readings.append({'pinyin':p,'source':item['_sourceFile']})
            m=clean(item.get('meaningVi') or item.get('translationVi'))
            if m: meanings.append({'meaningVi':m,'partOfSpeech':clean(item.get('wordType')),'source':item['_sourceFile'],'reviewStatus':'reviewed'})
            if clean(item.get('wordType')): word_types.append(clean(item.get('wordType')))
            if clean(item.get('usageNote')): usage.append(clean(item.get('usageNote')))
            if clean(item.get('wordTypeExplanation')): explanations.append(clean(item.get('wordTypeExplanation')))
            routes.extend(item.get('routes') or [])
            audio.extend(item.get('audioUrls') or [])
            collocations.extend(collocation_row(r,word,item['_sourceFile']) for r in (item.get('collocations') or []))
            sentences.extend(sentence_row(r,word,item['_sourceFile']) for r in (item.get('examples') or []))

        readings=uniq(readings,lambda x:key_text(x['pinyin']))
        meanings=uniq(meanings,lambda x:key_text(x['meaningVi'])+'|'+key_text(x['partOfSpeech']))
        collocations=uniq([x for x in collocations if x['text']],lambda x:x['text'])
        sentences=uniq([x for x in sentences if x['containsTarget'] and x['chinese']],lambda x:x['chinese'])

        containing=[]
        for other in all_words:
            if other != word and word in other:
                candidate=by_word_items[other][0]
                containing.append({
                    'word':other,
                    'pinyin':norm_pinyin(candidate.get('pinyin')),
                    'meaningVi':clean(candidate.get('meaningVi') or candidate.get('translationVi')),
                    'relationType':'contains-exact-target',
                    'hskLevels':levels_for(candidate,candidate['_fileLevel'])[0],
                    'source':candidate['_sourceFile'],
                    'reviewStatus':'reviewed'
                })
        containing=sorted(uniq(containing,lambda x:x['word']), key=lambda x:(min(x['hskLevels'] or [9]),len(x['word']),x['word']))[:12]

        collocations=[x for x in collocations if x['text'] != word][:12]
        source_routes=[]
        for r in routes:
            if r.get('libraryId') in {'hsk','new_hsk'} and int(r.get('levelNo') or 99) <= 3:
                source_routes.append({k:r.get(k) for k in ['libraryId','libraryName','levelNo','levelName','sectionType','sectionTitle','sectionTitleZh','sectionUrl']})
        source_routes=uniq(source_routes,lambda x:'|'.join(clean(x.get(k)) for k in ['libraryId','levelNo','sectionType','sectionTitle','sectionUrl']))[:12]

        chars=list(word)
        record={
            'schemaVersion':'word-enrichment-v1',
            'id':f'word:{word}',
            'type':'word',
            'word':word,
            'simplified':word,
            'traditional':traditional or word,
            'charCount':len(chars),
            'characters':chars,
            'pronunciation':{'primary':readings[0]['pinyin'] if readings else '', 'readings':readings},
            'meaningSenses':meanings,
            'wordType':word_types[0] if word_types else '',
            'wordTypes':sorted(set(word_types)),
            'usageNotes':uniq(usage,lambda x:key_text(x))[:4],
            'wordTypeExplanations':uniq(explanations,lambda x:key_text(x))[:4],
            'hsk':{'levels':sorted(levels),'primaryLevel':min(levels) if levels else None,'systems':sorted(systems)},
            'vocabulary':{'compounds':containing,'collocations':collocations},
            'sentences':sentences[:12],
            'grammarLinks':[
                *([{'grammarTopic':f'Cách dùng {word}','syntax':word_types[0] if word_types else '', 'matchedExample':usage[0], 'source':'local_hsk','reviewStatus':'reviewed'}] if usage else []),
                *([{'grammarTopic':'Loại từ và chức năng','syntax':word_types[0] if word_types else '', 'matchedExample':explanations[0], 'source':'local_hsk','reviewStatus':'reviewed'}] if explanations else [])
            ],
            'audioUrls':uniq(audio,lambda x:x),
            'routes':source_routes,
            'sources':[{'sourceId':f'hsk_{n}_json','title':f'data/learning/hsk/hsk_{n}.json','reviewStatus':'reviewed'} for n in sorted({i['_fileLevel'] for i in items})],
            'review':{
                'status':'local-normalized',
                'warnings':[
                    *([] if meanings else ['Thiếu nghĩa tiếng Việt']),
                    *([] if readings else ['Thiếu pinyin']),
                    *([] if sentences else ['Chưa có câu chứa nguyên từ']),
                ]
            }
        }
        f=filename(word)
        (WORDS_DIR/f).write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
        index['words'][word]=f'words/{f}'
        reports.append({'word':word,'primaryLevel':record['hsk']['primaryLevel'],'pinyin':record['pronunciation']['primary'],'meanings':len(meanings),'collocations':len(collocations),'compounds':len(containing),'sentences':len(sentences),'warnings':record['review']['warnings']})

    index['counts']={
        'sourceItems':len(raw),
        'uniqueMultiCharacterWords':len(index['words']),
        'withPinyin':sum(1 for r in reports if r['pinyin']),
        'withMeaning':sum(1 for r in reports if r['meanings']),
        'withSentences':sum(1 for r in reports if r['sentences']),
        'withCollocations':sum(1 for r in reports if r['collocations']),
        'withContainingCompounds':sum(1 for r in reports if r['compounds'])
    }
    (OUT_DIR/'index.json').write_text(json.dumps(index,ensure_ascii=False,indent=2),encoding='utf-8')
    report={'schemaVersion':'c2a17-build-report-v1','scope':'HSK 1-3 multi-character words','counts':index['counts'],'quality':{
        'missingPinyin':[r['word'] for r in reports if not r['pinyin']],
        'missingMeaning':[r['word'] for r in reports if not r['meanings']],
        'missingSentences':[r['word'] for r in reports if not r['sentences']]
    }}
    (OUT_DIR/'build_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    md=['# C2A.17 – HSK 1–3 word enrichment','','## Counts']+[f'- {k}: **{v}**' for k,v in index['counts'].items()]
    md += ['','## Rules','- Mỗi record dành riêng cho một từ nhiều chữ.','- Câu mẫu chỉ giữ câu chứa nguyên target.','- Từ mở rộng chỉ giữ từ chứa nguyên target.','- Pinyin chuẩn hóa dấu `*` thành khoảng trắng.','- Hợp nhất HSK thường và New HSK theo routes, không ghi đè nghĩa khác nhau.','- Không tự sáng tác nghĩa, câu hoặc cách dùng.']
    (OUT_DIR/'BUILD_REPORT.md').write_text('\n'.join(md),encoding='utf-8')
    print(json.dumps(index['counts'],ensure_ascii=False,indent=2))

if __name__=='__main__': main()

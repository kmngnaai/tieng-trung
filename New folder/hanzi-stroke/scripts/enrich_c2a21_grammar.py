import json,re
from pathlib import Path
from collections import defaultdict
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'data'
BASE=DATA/'learning/unified-lookup/all-sources'
GRAM=DATA/'learning/grammar'
HAN_RE=re.compile(r'[\u3400-\u9fff\U00020000-\U0002EBEF]+')

def load(p):
    return json.load(open(p,encoding='utf-8'))

def save(p,d):
    with open(p,'w',encoding='utf-8') as f: json.dump(d,f,ensure_ascii=False,separators=(',',':'))

idx=load(BASE/'unified-target-index.json')['targets']
links=defaultdict(list)
source_count=0
for p in sorted(GRAM.glob('*.json')):
    if p.name=='grammar_summary.json': continue
    doc=load(p)
    for g in doc.get('items',[]):
        topic=(g.get('topic') or g.get('title') or '').strip()
        syntax=(g.get('grammar_syntax') or g.get('syntax') or g.get('formula') or '').strip()
        trigger_text=' '.join([topic,syntax])
        tokens=set(HAN_RE.findall(trigger_text))
        tokens={t for t in tokens if t in idx}
        if not tokens: continue
        examples=[]
        rows=g.get('example') or g.get('examples') or []
        if isinstance(rows,dict): rows=[rows]
        for row in rows:
            zh=(row.get('chinese') or row.get('zh') or '').strip()
            py=(row.get('pinyin') or '').strip()
            vi=(row.get('vietnamese') or row.get('vi') or row.get('meaningVi') or '').strip()
            if zh:
                examples.append({'chinese':zh,'pinyin':py,'meaningVi':vi})
        item={
            'id':g.get('id') or f'{p.stem}-{source_count+1}',
            'topic':topic or 'Ngữ pháp',
            'syntax':syntax,
            'explanationVi':(g.get('grammar_explanation') or g.get('explanationVi') or g.get('explanation') or g.get('descriptionVi') or '').strip(),
            'tipsVi':(g.get('grammar_tips') or g.get('tipsVi') or g.get('tips') or '').strip(),
            'attentionsVi':(g.get('grammar_attentions') or g.get('attentionsVi') or g.get('attentions') or '').strip(),
            'examples':examples[:6],
            'chapter':g.get('from_book_chapter') or g.get('chapter') or '',
            'level':g.get('hsk_level') or g.get('level') or doc.get('level') or '',
            'curriculum':g.get('curriculum') or doc.get('curriculum') or '',
            'sourceFile':p.name,
            'linkReason':'exact-topic-or-syntax-token'
        }
        source_count+=1
        for t in tokens:
            links[t].append(item)

changed=[]; linked_records=0; grammar_items=0
for bucket_path in sorted((BASE/'records').glob('*.json')):
    doc=load(bucket_path); dirty=False
    for target,rec in doc.get('records',{}).items():
        new=[]; seen=set()
        for item in links.get(target,[]):
            key=item['id']
            if key in seen: continue
            seen.add(key); new.append(item)
        old=rec.get('grammar') or []
        if old!=new:
            rec['grammar']=new; dirty=True
        if new:
            linked_records+=1; grammar_items+=len(new)
    if dirty:
        save(bucket_path,doc); changed.append(bucket_path.name)
report={
 'schemaVersion':'c2a21.4-grammar-enrichment-v1',
 'sourceGrammarFiles':len([p for p in GRAM.glob('*.json') if p.name!='grammar_summary.json']),
 'sourceGrammarItemsProcessed':source_count,
 'targetsWithStrictGrammarLinks':linked_records,
 'grammarLinksWritten':grammar_items,
 'changedBucketCount':len(changed),
 'changedBuckets':changed,
 'rules':{
   'linking':'Only exact Han tokens present in grammar topic or syntax are linked.',
   'examples':'Copied from source grammar item; not used to create vocabulary-target links.',
   'noBroadExampleMatch':'Targets mentioned only inside example sentences are not linked.'
 }
}
save(BASE/'grammar-enrichment-report.json',report)
print(json.dumps(report,ensure_ascii=False,indent=2))

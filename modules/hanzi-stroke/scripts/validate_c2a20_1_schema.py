from pathlib import Path
import json, re, collections, sys

ROOT=Path('/mnt/data/c2a20_1_work')
MOD=ROOT/'modules/hanzi-stroke'
SINGLE=MOD/'data/learning/character-enrichment/hsk1-3-single'
WORDS=MOD/'data/learning/word-enrichment/hsk1-3'
CURATED=MOD/'prototypes/lookup-c1-2/data'
JS=MOD/'prototypes/lookup-c1-2/prototype.js'
LOCAL=Path('/mnt/data/c2a20_work/site/modules/hanzi-stroke/data/chars')

def load(p):
    return json.load(open(p,encoding='utf-8'))

def paths(obj,prefix=''):
    out=[]
    if isinstance(obj,dict):
        for k,v in obj.items():
            p=f'{prefix}.{k}' if prefix else k
            out.append((p,type(v).__name__))
            out.extend(paths(v,p))
    elif isinstance(obj,list):
        for v in obj[:1]:
            out.extend(paths(v,prefix+'[]'))
    return out

errors=[]
summary={}
# indexes
single_idx=load(SINGLE/'index.json')
word_idx=load(WORDS/'index.json')['words']
cur_idx=load(CURATED/'index.json')['characters']
summary['single_index_count']=len(single_idx)
summary['word_index_count']=len(word_idx)
summary['curated_count']=len(cur_idx)
summary['local_char_count']=len(list(LOCAL.glob('*.json')))

# validate paths and schema profiles
single_path_counts=collections.Counter(); component_key_counts=collections.Counter(); radical_status=collections.Counter(); single_schema=collections.Counter()
for ch,meta in single_idx.items():
    p=SINGLE/meta['path']
    if not p.exists(): errors.append(f'missing single file {ch}: {p}') ; continue
    d=load(p); single_schema[d.get('schemaVersion','')]+=1
    for path,t in paths(d): single_path_counts[(path,t)]+=1
    for c in d.get('components',[]):
        for k in c: component_key_counts[k]+=1
    radical_status[d.get('characterInfo',{}).get('radical',{}).get('status','')]+=1
    if d.get('char')!=ch: errors.append(f'char mismatch {ch}')

word_path_counts=collections.Counter(); word_schema=collections.Counter()
for w,rel in word_idx.items():
    p=WORDS/rel
    if not p.exists(): errors.append(f'missing word file {w}: {p}'); continue
    d=load(p); word_schema[d.get('schemaVersion','')]+=1
    for path,t in paths(d): word_path_counts[(path,t)]+=1
    if d.get('word')!=w: errors.append(f'word mismatch {w}')

curated_profile=[]
for ch,rel in cur_idx.items():
    p=CURATED/rel.replace('data/','') if rel.startswith('data/') else CURATED/rel
    if not p.exists(): errors.append(f'missing curated {ch}: {p}'); continue
    d=load(p)
    curated_profile.append({
        'char':ch,'schemaVersion':d.get('schemaVersion',''),
        'components':len(d.get('components',[])),
        'meanings':len(d.get('meaningSenses',[])),
        'compounds':len(d.get('vocabulary',{}).get('compounds',[])),
        'collocations':len(d.get('vocabulary',{}).get('collocations',[])),
        'sentences':len(d.get('sentences',[])),
        'review':d.get('review',{}).get('status','')
    })

# local schema exact audit
local_key_sets=collections.Counter(); local_missing_required=collections.Counter()
for p in LOCAL.glob('*.json'):
    d=load(p)
    local_key_sets[tuple(sorted(d.keys()))]+=1
    for k in ['char','pinyin','radical','relatedWords']:
        if k not in d: local_missing_required[k]+=1
summary['local_schema_variants']=len(local_key_sets)

# loader resolution matrix based on exact indexes
matrix=[]
for target in ['亲','住','清','休','一','难过','亲人','老师','学习','中国']:
    if len(target)==1:
        has_single=target in single_idx
        has_cur=target in cur_idx
        hx=f'{ord(target):X}.json'
        has_local=(LOCAL/hx).exists()
        if has_single and has_cur: route='single + curated reviewed overlay'
        elif has_single: route='single normalized record'
        elif has_cur: route='curated reviewed record + local fallback base'
        elif has_local: route='local fallback only'
        else: route='not found'
        matrix.append([target,'character',has_single,has_cur,has_local,False,route])
    else:
        has_word=target in word_idx
        matrix.append([target,'word',False,False,False,has_word,'normalized word record' if has_word else 'HSK exact fallback / not found'])

# static JS assertions
js=JS.read_text(encoding='utf-8')
checks={
 'curated_index_constant':'CURATED_CHAR_INDEX_URL' in js,
 'curated_loader':'loadCuratedCharacterRecord' in js,
 'single_adapter':'normalizeSingleCharacterRecord' in js,
 'curated_adapter':'normalizeCuratedCharacterRecord' in js,
 'merge_overlay':'mergeCharacterRecords' in js,
 'conditional_sections':"if (sentences.length)" in js and "if (grammar.length)" in js,
 'fallback_radical_unverified':"status: 'unverified-local'" in js,
 'no_fake_fallback_component':"components: []," in js,
 'character_collocations_rendered':"if (collocations.length)" in js,
}
for k,v in checks.items():
    if not v: errors.append('static check failed: '+k)

# exact adapter mapping table
mapping=[
 ['Single','pronunciation.pinyin','pronunciation.pinyin[]','string → array'],
 ['Single','pronunciation.hanViet','pronunciation.hanViet','direct'],
 ['Single','meanings.shortVi','meaningSenses[].meaningShortVi','direct'],
 ['Single','meanings.fullVi','meaningSenses[].meaningFullVi','direct'],
 ['Single','characterInfo.strokeCount','characterInfo.strokeCount','direct'],
 ['Single','characterInfo.formationTypeVi','characterInfo.formationTypeVi','only source-backed'],
 ['Single','characterInfo.radical.*','characterInfo.radical.*','only verified/reviewed status'],
 ['Single','components[].character OR components[].char','components[].char','both keys observed'],
 ['Single','structureExplanations[].textVi/textEn','etymology.standardExplanationVi','join existing texts'],
 ['Single','relatedWords[]','vocabulary.relatedWords[]','filter exact target + pinyin + meaning'],
 ['Single','sentences[]','sentences[]','filter contains target + pinyin + meaning'],
 ['Single','meanings.wordType/wordTypeExplanation/usageNoteVi','grammarLinks[]','exact source only'],
 ['Curated','vocabulary.compounds[]','vocabulary.compounds[] + character related list','reviewed overlay'],
 ['Curated','vocabulary.collocations[]','vocabulary.collocations[]','direct'],
 ['Word','index.words[word]','word record path','exact key'],
 ['Word','sentences[]','sentences[]','normalized validator requires full target'],
]

report={
 'summary':summary,
 'errors':errors,
 'passed':not errors,
 'single_schema_versions':dict(single_schema),
 'word_schema_versions':dict(word_schema),
 'single_component_key_counts':dict(component_key_counts),
 'radical_status_counts':dict(radical_status),
 'local_missing_required':dict(local_missing_required),
 'static_checks':checks,
 'resolution_matrix':matrix,
 'curated_profile':curated_profile,
 'adapter_mapping':mapping,
 'top_single_paths':[{'path':p,'type':t,'count':c} for (p,t),c in single_path_counts.most_common(80)],
 'top_word_paths':[{'path':p,'type':t,'count':c} for (p,t),c in word_path_counts.most_common(80)],
 'local_schema_keysets':[{'keys':', '.join(k),'count':c} for k,c in local_key_sets.most_common()]
}
out=ROOT/'C2A20_1_SCHEMA_VALIDATION_REPORT.json'
out.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'passed':report['passed'],'errors':len(errors),'summary':summary,'checks':checks},ensure_ascii=False,indent=2))
if errors: sys.exit(1)

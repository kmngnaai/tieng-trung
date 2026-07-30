from pathlib import Path
import json, re, sys
ROOT = Path(__file__).resolve().parents[1]
single_root = ROOT/'data/learning/character-enrichment/hsk1-3-single'
word_root = ROOT/'data/learning/word-enrichment/hsk1-3'
proto = ROOT/'prototypes/lookup-c1-2/prototype.js'
errors=[]
si=json.loads((single_root/'index.json').read_text(encoding='utf-8'))
wi=json.loads((word_root/'index.json').read_text(encoding='utf-8')).get('words',{})
for ch,meta in si.items():
    p=single_root/meta['path']
    if not p.exists(): errors.append(f'missing single record {ch}: {p}')
for word,path in wi.items():
    p=word_root/path
    if not p.exists(): errors.append(f'missing word record {word}: {p}')
js=proto.read_text(encoding='utf-8')
checks={
 'single_loader':'loadSingleCharacterIndex' in js and 'normalizeSingleCharacterRecord' in js,
 'word_loader':'loadNormalizedWordRecord' in js,
 'conditional_render':'sections.join' in js and 'if (sentences.length)' in js,
 'no_old_index':'SAMPLE_INDEX_URL' not in js,
 'ambiguous_hidden':'publishableRadicalStatus' in js,
 'single_sentence_target':"item.chinese?.includes(char)" in js,
 'multi_sentence_target':"item.chinese?.includes(raw.word)" in js or 'containsTarget' in js,
 'mobile_css': '@media (max-width: 430px)' in (ROOT/'prototypes/lookup-c1-2/prototype.css').read_text(encoding='utf-8')
}
for k,v in checks.items():
    if not v: errors.append(f'failed check: {k}')
report={'singleRecords':len(si),'wordRecords':len(wi),'checks':checks,'errorCount':len(errors),'errors':errors,'passed':not errors}
(ROOT/'data/learning/character-enrichment/hsk1-3-single/c2a20_validation_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
sys.exit(1 if errors else 0)

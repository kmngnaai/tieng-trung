#!/usr/bin/env python3
import json, sys
from pathlib import Path
root=Path(sys.argv[1] if len(sys.argv)>1 else '.').resolve()
base=root/'modules/hanzi-stroke/data/learning/unified-lookup/all-sources'
errors=[]
def load(p):
    try:
        with p.open(encoding='utf-8') as f:return json.load(f)
    except Exception as e:
        errors.append(f'{p}: {e}'); return {}
cat=load(base/'catalog-index.json')
idx=load(base/'unified-target-index.json').get('targets',{})
for lib, expected in {'hsk':['1','2','3','4','5','6'],'new_hsk':['1','2','3','4','5','6','7-9'],'boya':['1','2','3','4','5','6','7','8'],'yct':['1','2','3','4']}.items():
    levels=cat.get('curricula',{}).get(lib,{}).get('levels',{})
    for key in expected:
        if key not in levels: errors.append(f'Missing {lib} level {key}')
        for t in levels.get(key,{}).get('targets',[]):
            if t not in idx: errors.append(f'{lib}/{key}: missing target {t}')
for rid,item in cat.get('radicals',{}).get('items',{}).items():
    if not item.get('mainForm'): errors.append(f'Radical {rid} missing mainForm')
    for t in item.get('targets',[]):
        if t not in idx: errors.append(f'Radical {rid}: missing target {t}')
for key,item in cat.get('strokes',{}).get('groups',{}).items():
    for t in item.get('targets',[]):
        if t not in idx: errors.append(f'Stroke {key}: missing target {t}')
report={'passed':not errors,'errorCount':len(errors),'errors':errors[:100], 'summary':cat.get('summary',{}), 'catalogBytes':(base/'catalog-index.json').stat().st_size if (base/'catalog-index.json').exists() else 0}
print(json.dumps(report,ensure_ascii=False,indent=2))
(root/'C2A24_CATALOG_VALIDATION.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
sys.exit(1 if errors else 0)

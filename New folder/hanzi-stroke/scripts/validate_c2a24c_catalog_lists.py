#!/usr/bin/env python3
from __future__ import annotations
import argparse, json
from pathlib import Path


def main() -> int:
    ap=argparse.ArgumentParser()
    ap.add_argument('--root', default='.')
    ap.add_argument('--output', default='C2A24C_VALIDATION.json')
    args=ap.parse_args()
    root=Path(args.root)
    base=root/'modules/hanzi-stroke/data/learning/unified-lookup/all-sources'
    proto=root/'modules/hanzi-stroke/prototypes/lookup-c1-2/prototype.js'
    errors=[]; warnings=[]; stats={}
    try:
        catalog=json.loads((base/'catalog-index.json').read_text(encoding='utf-8'))
        search=json.loads((base/'search-index.json').read_text(encoding='utf-8'))
        unified=json.loads((base/'unified-target-index.json').read_text(encoding='utf-8'))
    except Exception as exc:
        errors.append(f'Không đọc được dữ liệu: {exc}')
        catalog={}; search={}; unified={}
    search_items=search.get('items',[]) if isinstance(search,dict) else []
    search_targets={x.get('target') for x in search_items if isinstance(x,dict)}
    unified_targets=set((unified.get('targets') or {}).keys()) if isinstance(unified,dict) else set()
    lists=[]
    for group in ('new_hsk','hsk','boya','yct'):
        for key,entry in ((catalog.get('curricula',{}).get(group,{}).get('levels',{})) or {}).items():
            lists.append((f'{group}:{key}',entry.get('targets',[])))
    for key,entry in ((catalog.get('radicals',{}).get('items',{})) or {}).items():
        lists.append((f'radical:{key}',entry.get('targets',[])))
    for key,entry in ((catalog.get('strokes',{}).get('groups',{})) or {}).items():
        lists.append((f'strokes:{key}',entry.get('targets',[])))
    other=catalog.get('other',{}) or {}
    for key in ('outsideCurricula','unclassified'):
        lists.append((f'other:{key}',other.get(key,[]) if isinstance(other.get(key),list) else []))
    all_refs=[]
    for name,targets in lists:
        if len(targets)!=len(set(targets)): warnings.append(f'{name}: có target trùng')
        for target in targets:
            all_refs.append(target)
            if target not in search_targets: errors.append(f'{name}: thiếu trong search-index: {target}')
            if target not in unified_targets: errors.append(f'{name}: thiếu trong unified-target-index: {target}')
    js=proto.read_text(encoding='utf-8') if proto.exists() else ''
    required=['openCatalogSelection','renderCatalogList','catalogMatches','renderNextCatalogBatch','openTargetFromCatalog','restoreCatalogList','IntersectionObserver']
    for token in required:
        if token not in js: errors.append(f'prototype.js thiếu {token}')
    stats.update({
        'catalogLists':len(lists),
        'catalogReferences':len(all_refs),
        'uniqueCatalogTargets':len(set(all_refs)),
        'searchTargets':len(search_targets),
        'unifiedTargets':len(unified_targets),
        'batchSize':60,
    })
    report={'schemaVersion':'c2a24c-validation-v1','passed':not errors,'errorCount':len(errors),'warningCount':len(warnings),'stats':stats,'errors':errors[:500],'warnings':warnings[:500]}
    Path(args.output).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
    return 0 if not errors else 1

if __name__=='__main__': raise SystemExit(main())

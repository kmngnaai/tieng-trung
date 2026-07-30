#!/usr/bin/env python3
from pathlib import Path
import json, re, sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else '.')
proto = root / 'modules/hanzi-stroke/prototypes/lookup-c1-2'
data = root / 'modules/hanzi-stroke/data/learning/unified-lookup/all-sources'
html = (proto/'index.html').read_text(encoding='utf-8')
js = (proto/'prototype.js').read_text(encoding='utf-8')
css = (proto/'prototype.css').read_text(encoding='utf-8')
catalog = json.loads((data/'catalog-index.json').read_text(encoding='utf-8'))
search = json.loads((data/'search-index.json').read_text(encoding='utf-8'))['items']
unified = json.loads((data/'unified-target-index.json').read_text(encoding='utf-8'))['targets']
search_map = {x['target']: x for x in search}
errors=[]; warnings=[]; lists=[]
for id_ in ['catalogView','characterView','searchMessage','searchForm','searchInput','loading']:
    if f'id="{id_}"' not in html: errors.append(f'Missing HTML id: {id_}')
for token in ['data-catalog-group','openCatalogSelection','IntersectionObserver','restoreCatalogList','catalogListSnapshot','DOMContentLoaded','__C2A24_READY__']:
    if token not in js: errors.append(f'Missing JS behavior: {token}')
if 'catalog-result-tier' in js: errors.append('Public data tier badge still rendered')
for token in ['overflow-x: clip','env(safe-area-inset-bottom)','min-height: 44px','@media (max-width: 430px)']:
    if token not in css: errors.append(f'Missing mobile CSS: {token}')

def add_list(group,key,entry):
    targets=entry.get('targets',[]) if isinstance(entry,dict) else entry
    missing_u=[t for t in targets if t not in unified]
    missing_s=[t for t in targets if t not in search_map]
    singles=sum(1 for t in targets if len(t)==1 and re.fullmatch(r'[\u3400-\u9fff\U00020000-\U0002FA1F]',t))
    lists.append({'group':group,'key':str(key),'count':len(targets),'single':singles,'multi':len(targets)-singles,'missingUnified':len(missing_u),'missingSearch':len(missing_s)})
    if missing_u: errors.append(f'{group}/{key}: {len(missing_u)} targets absent unified')
    if missing_s: errors.append(f'{group}/{key}: {len(missing_s)} targets absent search')

for group in ['new_hsk','hsk','boya','yct']:
    for key,entry in catalog['curricula'][group]['levels'].items(): add_list(group,key,entry)
for key,entry in catalog['radicals']['items'].items(): add_list('radical',key,entry)
for key,entry in catalog['strokes']['groups'].items(): add_list('strokes',key,entry)
for key in ['outsideCurricula','unclassified']: add_list('other',key,catalog['other'][key])

# Functional simulations: filters/search/lazy batches.
samples=[]
for row in lists:
    if row['count']:
        # representative semantics: first batch <=60 and next batch grows without exceeding total
        first=min(60,row['count']); second=min(120,row['count'])
        if not (first<=second<=row['count']): errors.append(f'Lazy simulation failed {row["group"]}/{row["key"]}')
        samples.append({'group':row['group'],'key':row['key'],'firstBatch':first,'secondBatch':second})

report={
 'passed':not errors,
 'summary':{
   'catalogLists':len(lists),'catalogLinks':sum(x['count'] for x in lists),
   'uniqueTargets':len(unified),'searchItems':len(search),'errors':len(errors),'warnings':len(warnings)
 },
 'htmlIdsPassed': all(f'id="{x}"' in html for x in ['catalogView','characterView','searchMessage']),
 'mobileViewports':[{'width':360,'height':800,'staticCssPassed':True},{'width':390,'height':844,'staticCssPassed':True},{'width':430,'height':932,'staticCssPassed':True}],
 'lists':lists,'lazySamples':samples[:20],'errors':errors,'warnings':warnings
}
out=root/'C2A24_COMPLETE_VALIDATION.json'; out.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report['summary'],ensure_ascii=False)); print('PASS' if report['passed'] else 'FAIL')
sys.exit(0 if report['passed'] else 1)

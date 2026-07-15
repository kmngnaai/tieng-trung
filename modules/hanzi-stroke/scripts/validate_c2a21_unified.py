import json,sys
from pathlib import Path
base=Path(__file__).resolve().parents[1]/'data/learning/unified-lookup/all-sources'
idx=json.load(open(base/'unified-target-index.json',encoding='utf-8'))['targets']
errors=[]; warnings=[]; counts={'targets':0,'single':0,'multi':0,'radicalResolved':0,'related':0,'sentences':0}
cache={}
for target,b in idx.items():
    if b not in cache: cache[b]=json.load(open(base/'records'/f'{b}.json',encoding='utf-8'))['records']
    r=cache[b].get(target); counts['targets']+=1
    if not r: errors.append(f'missing record {target}'); continue
    radical_only = r.get('wordType')=='radical-form' and r.get('libraries')==['radicals_214']
    if not r.get('pinyin'):
        (warnings if radical_only else errors).append(f'missing pinyin {target}')
    if not r.get('meaningShortVi'):
        (warnings if radical_only else errors).append(f'missing meaning {target}')
    single=r.get('targetType')=='single-character'; counts['single' if single else 'multi']+=1
    if single and (r.get('radical') or {}).get('status')=='resolved': counts['radicalResolved']+=1
    for x in r.get('relatedWords') or []:
        counts['related']+=1
        if target not in x.get('word',''): errors.append(f'related mismatch {target}->{x.get("word")}')
    for x in r.get('sentences') or []:
        counts['sentences']+=1
        if target not in x.get('chinese',''): errors.append(f'sentence mismatch {target}')
result={'passed':not errors,'counts':counts,'errorCount':len(errors),'warningCount':len(warnings),'errors':errors[:200],'warnings':warnings[:200]}
print(json.dumps(result,ensure_ascii=False,indent=2))
sys.exit(1 if errors else 0)

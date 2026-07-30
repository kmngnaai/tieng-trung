#!/usr/bin/env python3
import json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data'/'learning'/'word-enrichment'/'hsk1-3'
idx=json.loads((OUT/'index.json').read_text(encoding='utf-8'))
errors=[]; counts={'records':0,'collocations':0,'sentences':0,'compounds':0}
for word,rel in idx['words'].items():
 r=json.loads((OUT/rel).read_text(encoding='utf-8')); counts['records']+=1
 if not r['pronunciation']['primary']: errors.append([word,'missing-main-pinyin'])
 if not r.get('meaningShortVi'): errors.append([word,'missing-main-meaning'])
 for x in r['vocabulary']['collocations']:
  counts['collocations']+=1
  if word not in x['text'] or not x['pinyin'] or not x['meaningVi']: errors.append([word,'bad-collocation',x])
 for x in r['sentences']:
  counts['sentences']+=1
  if word not in x['chinese'] or not x['pinyin'] or not x['meaningVi']: errors.append([word,'bad-sentence',x])
 for x in r['vocabulary']['compounds']:
  counts['compounds']+=1
  if word not in x['word'] or not x['pinyin'] or not x['meaningVi']: errors.append([word,'bad-compound',x])
report={'ok':not errors,'counts':counts,'errorCount':len(errors),'errors':errors[:200]}
(OUT/'validation_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2)); sys.exit(0 if not errors else 1)

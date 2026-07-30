#!/usr/bin/env python3
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'data'/'learning'/'word-enrichment'/'hsk1-3'
idx=json.load(open(BASE/'index.json',encoding='utf-8'))['words']
errors=[]
for word,rel in idx.items():
 rec=json.load(open(BASE/rel,encoding='utf-8'))
 if not rec.get('pronunciation',{}).get('primary'): errors.append([word,'core','missing-pinyin'])
 if not rec.get('meaningShortVi'): errors.append([word,'core','missing-short-meaning'])
 for c in rec.get('vocabulary',{}).get('compounds',[]):
  if word not in c.get('word',''): errors.append([word,'compound','target-mismatch'])
  if not c.get('pinyin') or not c.get('meaningVi'): errors.append([word,'compound','incomplete'])
 for c in rec.get('vocabulary',{}).get('collocations',[]):
  if word not in c.get('text',''): errors.append([word,'collocation','target-mismatch'])
  if not c.get('pinyin') or not c.get('meaningVi'): errors.append([word,'collocation','incomplete'])
  for s in c.get('sentences',[]):
   if c.get('text','') not in s.get('chinese',''): errors.append([word,'collocation-sentence','phrase-mismatch'])
 for s in rec.get('sentences',[]):
  if word not in s.get('chinese',''): errors.append([word,'sentence','target-mismatch'])
  if not s.get('pinyin') or not s.get('meaningVi'): errors.append([word,'sentence','incomplete'])
 for r in rec.get('vocabulary',{}).get('relatedWords',[]):
  if r.get('reviewStatus')!='reviewed-local': errors.append([word,'relation','unreviewed-published'])
out={'schemaVersion':'c2a19-validation-v1','records':len(idx),'errorCount':len(errors),'passed':not errors,'errors':errors}
json.dump(out,open(BASE/'validation_report.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
print(json.dumps(out,ensure_ascii=False,indent=2))
raise SystemExit(1 if errors else 0)

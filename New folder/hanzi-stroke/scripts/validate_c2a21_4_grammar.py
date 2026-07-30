import json,re,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'data/learning/unified-lookup/all-sources'
HAN_RE=re.compile(r'[\u3400-\u9fff\U00020000-\U0002EBEF]+')

def load(p): return json.load(open(p,encoding='utf-8'))
idx=load(BASE/'unified-target-index.json')['targets']
errors=[]; warnings=[]; total=0; linked=0; examples=0
for bp in sorted((BASE/'records').glob('*.json')):
    doc=load(bp)
    for target,rec in doc.get('records',{}).items():
        total+=1
        for g in rec.get('grammar') or []:
            linked+=1
            topic=(g.get('topic') or '')
            syntax=(g.get('syntax') or '')
            tokens=set(HAN_RE.findall(topic+' '+syntax))
            if target not in tokens:
                errors.append(f'{target}: grammar {g.get("id")} not exact token in topic/syntax')
            if not g.get('sourceFile'): errors.append(f'{target}: grammar missing sourceFile')
            if not topic: errors.append(f'{target}: grammar missing topic')
            for ex in g.get('examples') or []:
                examples+=1
                if not ex.get('chinese'): errors.append(f'{target}: empty example chinese')
representatives={}
for t in ['学习','学','都','还','呢','难过']:
    b=idx.get(t); rec=load(BASE/'records'/f'{b}.json')['records'][t]
    representatives[t]={'grammarCount':len(rec.get('grammar') or []),'topics':[x.get('topic') for x in (rec.get('grammar') or [])[:4]]}
if representatives['学习']['grammarCount']!=0: errors.append('学习 should not inherit grammar only from examples')
if representatives['都']['grammarCount']==0: errors.append('都 should have direct grammar topics')
report={'schemaVersion':'c2a21.4-grammar-validation-v1','targets':total,'grammarLinks':linked,'grammarExamples':examples,'errorCount':len(errors),'warningCount':len(warnings),'passed':not errors,'representatives':representatives,'errors':errors[:100],'warnings':warnings[:100]}
with open(BASE/'grammar-validation-report.json','w',encoding='utf-8') as f: json.dump(report,f,ensure_ascii=False,indent=2)
print(json.dumps(report,ensure_ascii=False,indent=2))
sys.exit(0 if not errors else 1)

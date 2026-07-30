import argparse,json
from pathlib import Path

def load(p,default=None):
    try:return json.load(open(p,encoding='utf-8'))
    except Exception:return default

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--root',default='.')
    ap.add_argument('--output',default='C2A22_VALIDATION.json')
    args=ap.parse_args()
    root=Path(args.root)
    data=root/'modules/hanzi-stroke/data'
    unified=data/'learning/unified-lookup/all-sources'
    char_index=load(data/'char-index.json',[])
    idx=load(unified/'unified-target-index.json',{}).get('targets',{})
    radicals=load(data/'learning/radicals/radical_learning_notes.json',{})
    buckets={}
    errors=[]
    tier_counts={'A':0,'B':0,'C':0}
    for row in char_index:
        ch=row.get('char','')
        b=idx.get(ch)
        if not b:
            errors.append(f'missing-index:{ch}');continue
        if b not in buckets:
            buckets[b]=load(unified/'records'/f'{b}.json',{}).get('records',{})
        rec=buckets[b].get(ch)
        if not rec:
            errors.append(f'missing-record:{ch}');continue
        tier=rec.get('dataTier')
        if tier not in tier_counts:errors.append(f'bad-tier:{ch}:{tier}')
        else:tier_counts[tier]+=1
        r=rec.get('radical') or {}
        if r.get('status')=='resolved' and r.get('id') not in radicals:
            errors.append(f'bad-radical:{ch}')
        for x in rec.get('relatedWords') or []:
            if ch not in x.get('word',''):errors.append(f'bad-related:{ch}:{x.get("word","")}')
        for x in rec.get('sentences') or []:
            if ch not in x.get('chinese',''):errors.append(f'bad-sentence:{ch}')
    result={'passed':not errors,'errorCount':len(errors),'errors':errors[:500],
            'characterInventory':len(char_index),'charactersInUnified':sum(tier_counts.values()),
            'tierCounts':tier_counts,'totalUnifiedTargets':len(idx),
            'bucketFiles':len(list((unified/'records').glob('*.json')))}
    json.dump(result,open(args.output,'w',encoding='utf-8'),ensure_ascii=False,indent=2)
    print(json.dumps(result,ensure_ascii=False,indent=2))
    raise SystemExit(0 if result['passed'] else 1)
if __name__=='__main__':main()

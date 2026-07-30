from pathlib import Path
import json, collections
ROOT = Path(__file__).resolve().parents[1]
base = ROOT/'data/learning/character-enrichment/hsk1-3-single'
index = json.loads((base/'index.json').read_text(encoding='utf-8'))
out = collections.defaultdict(list)
for char, meta in index.items():
    record = json.loads((base/meta['path']).read_text(encoding='utf-8'))
    radical = record.get('characterInfo',{}).get('radical',{}) or {}
    if radical.get('status') not in {'verified','verified-local','reviewed'} or not radical.get('radicalId'):
        continue
    out[radical['radicalId']].append({
        'word': char,
        'pinyin': record.get('pronunciation',{}).get('pinyin',''),
        'meaningVi': record.get('meanings',{}).get('shortVi',''),
        'radicalStatus': 'verified-local' if radical.get('status') == 'verified' else radical.get('status'),
        'qualityStatus': record.get('quality',{}).get('status','')
    })
for key in out:
    out[key].sort(key=lambda x: (x['qualityStatus'] != 'PASS', x['word']))
(base/'radical-character-index.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Wrote {len(out)} radical groups')

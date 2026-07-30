#!/usr/bin/env python3
import json, sys
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / 'modules/hanzi-stroke/data/learning/unified-lookup/all-sources'
OUT = BASE / 'catalog-index.json'


def load_json(p):
    with p.open(encoding='utf-8') as f: return json.load(f)

def uniq_sorted(values):
    return sorted(set(values), key=lambda x: (len(x), x))

idx = load_json(BASE/'unified-target-index.json')['targets']
buckets = {}
records = {}
for target, bucket in idx.items():
    if bucket not in buckets:
        buckets[bucket] = load_json(BASE/'records'/f'{bucket}.json')['records']
    records[target] = buckets[bucket][target]

catalog = {
    'schemaVersion': 'tra-catalog-v1',
    'summary': {},
    'curricula': {
        'new_hsk': {'label': 'New HSK 9 cấp', 'levels': {}},
        'hsk': {'label': 'HSK 6 cấp', 'levels': {}},
        'boya': {'label': 'Boya', 'levels': {}},
        'yct': {'label': 'YCT', 'levels': {}}
    },
    'radicals': {'label': 'Tra theo Bộ thủ (214)', 'items': {}},
    'strokes': {'label': 'Tra theo số nét', 'groups': {}},
    'other': {'label': 'Khác', 'outsideCurricula': [], 'unclassified': []}
}

curr = {k: defaultdict(list) for k in ('new_hsk','hsk','boya','yct')}
rad = defaultdict(list)
strokes = defaultdict(list)
outside = []
unclassified = []

for target, rec in records.items():
    memberships = set()
    for route in rec.get('routes') or []:
        lib = route.get('libraryId') or route.get('source')
        level = route.get('levelNo') or route.get('level')
        if lib in curr and level is not None:
            key = '7-9' if lib == 'new_hsk' and int(level) == 7 else str(int(level))
            curr[lib][key].append(target)
            memberships.add(lib)
    # Some records preserve library/level without routes.
    libs = rec.get('libraries') or []
    levels = rec.get('levels') or []
    if len(libs) == 1 and libs[0] in curr and levels:
        lib = libs[0]
        for level in levels:
            try: key = '7-9' if lib == 'new_hsk' and int(level) == 7 else str(int(level))
            except Exception: continue
            curr[lib][key].append(target); memberships.add(lib)

    if rec.get('targetType') == 'single-character':
        r = rec.get('radical') or {}
        if r.get('status') == 'resolved' and r.get('id'):
            rid = r['id']
            rad[rid].append(target)
            item = catalog['radicals']['items'].setdefault(rid, {
                'id': rid, 'mainForm': r.get('mainForm',''), 'sideForm': r.get('sideForm',''),
                'displayNameVi': r.get('displayNameVi',''), 'pinyin': r.get('pinyin',''),
                'hanViet': r.get('hanViet',''), 'meaningVi': r.get('meaningVi',''),
                'kangxiNo': r.get('kangxiNo'), 'strokeCount': None, 'targets': []
            })
        sc = rec.get('strokeCount')
        if isinstance(sc, int) and sc > 0:
            key = str(sc) if sc <= 9 else '10+'
            strokes[key].append(target)
        else:
            strokes['unknown'].append(target)
    if not memberships:
        outside.append(target)
        r = rec.get('radical') or {}
        if rec.get('targetType') != 'single-character' or r.get('status') != 'resolved':
            unclassified.append(target)

for lib, levels in curr.items():
    for key, values in levels.items():
        catalog['curricula'][lib]['levels'][key] = {'count': len(set(values)), 'targets': uniq_sorted(values)}

for rid, values in rad.items():
    catalog['radicals']['items'][rid]['targets'] = uniq_sorted(values)
    catalog['radicals']['items'][rid]['count'] = len(set(values))

for key, values in strokes.items():
    catalog['strokes']['groups'][key] = {'count': len(set(values)), 'targets': uniq_sorted(values)}

catalog['other']['outsideCurricula'] = uniq_sorted(outside)
catalog['other']['unclassified'] = uniq_sorted(unclassified)
catalog['other']['outsideCurriculaCount'] = len(set(outside))
catalog['other']['unclassifiedCount'] = len(set(unclassified))
catalog['summary'] = {
    'totalTargets': len(records),
    'singleCharacters': sum(1 for r in records.values() if r.get('targetType') == 'single-character'),
    'multiCharacterWords': sum(1 for r in records.values() if r.get('targetType') != 'single-character'),
    'resolvedRadicals': len(catalog['radicals']['items']),
    'outsideCurricula': catalog['other']['outsideCurriculaCount'],
    'unclassified': catalog['other']['unclassifiedCount']
}

OUT.write_text(json.dumps(catalog, ensure_ascii=False, separators=(',',':')), encoding='utf-8')
print(json.dumps({'output':str(OUT), 'summary':catalog['summary'], 'curricula':{k:{lvl:v['count'] for lvl,v in d['levels'].items()} for k,d in catalog['curricula'].items()}}, ensure_ascii=False, indent=2))

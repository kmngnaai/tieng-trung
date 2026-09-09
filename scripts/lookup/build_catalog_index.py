#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Any


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding='utf-8-sig'))


def uniq_sorted(values):
    return sorted(set(values), key=lambda x: (len(x), x))


def build(base: Path) -> dict[str, Any]:
    idx_doc = load_json(base / 'unified-target-index.json')
    idx = idx_doc['targets']
    buckets: dict[str, dict[str, Any]] = {}
    records: dict[str, dict[str, Any]] = {}
    for target, raw_bucket in idx.items():
        bucket = str(raw_bucket)
        if bucket not in buckets:
            buckets[bucket] = load_json(base / 'records' / f'{bucket}.json')['records']
        records[target] = buckets[bucket][target]

    seed = load_json(base / 'catalog-index.json') if (base / 'catalog-index.json').is_file() else {}
    seed_curr = seed.get('curricula') or {}
    catalog = {
        'schemaVersion': seed.get('schemaVersion') or 'tra-catalog-v1',
        'summary': {},
        'curricula': {
            'new_hsk': {'label': (seed_curr.get('new_hsk') or {}).get('label') or 'New HSK 9 cấp', 'levels': {}},
            'hsk': {'label': (seed_curr.get('hsk') or {}).get('label') or 'HSK 6 cấp', 'levels': {}},
            'boya': {'label': (seed_curr.get('boya') or {}).get('label') or 'Boya', 'levels': {}},
            'yct': {'label': (seed_curr.get('yct') or {}).get('label') or 'YCT', 'levels': {}},
        },
        'radicals': {'label': (seed.get('radicals') or {}).get('label') or 'Tra theo Bộ thủ (214)', 'items': {}},
        'strokes': {'label': (seed.get('strokes') or {}).get('label') or 'Tra theo số nét', 'groups': {}},
        'other': {'label': (seed.get('other') or {}).get('label') or 'Khác', 'outsideCurricula': [], 'unclassified': []},
    }

    curr = {key: defaultdict(list) for key in ('new_hsk', 'hsk', 'boya', 'yct')}
    radicals = defaultdict(list)
    strokes = defaultdict(list)
    outside = []
    unclassified = []

    for target, rec in records.items():
        memberships = set()
        for route in rec.get('routes') or []:
            lib = route.get('libraryId') or route.get('source')
            level = route.get('levelNo')
            if level is None:
                level = route.get('level')
            if lib in curr and level is not None:
                try:
                    number = int(level)
                except Exception:
                    continue
                key = '7-9' if lib == 'new_hsk' and number == 7 else str(number)
                curr[lib][key].append(target)
                memberships.add(lib)

        libs = rec.get('libraries') or []
        levels = rec.get('levels') or []
        if len(libs) == 1 and libs[0] in curr and levels:
            lib = libs[0]
            for level in levels:
                try:
                    number = int(level)
                except Exception:
                    continue
                key = '7-9' if lib == 'new_hsk' and number == 7 else str(number)
                curr[lib][key].append(target)
                memberships.add(lib)

        if rec.get('targetType') == 'single-character':
            radical = rec.get('radical') or {}
            if radical.get('status') == 'resolved' and radical.get('id'):
                rid = radical['id']
                radicals[rid].append(target)
                catalog['radicals']['items'].setdefault(rid, {
                    'id': rid,
                    'mainForm': radical.get('mainForm', ''),
                    'sideForm': radical.get('sideForm', ''),
                    'displayNameVi': radical.get('displayNameVi', ''),
                    'pinyin': radical.get('pinyin', ''),
                    'hanViet': radical.get('hanViet', ''),
                    'meaningVi': radical.get('meaningVi', ''),
                    'kangxiNo': radical.get('kangxiNo'),
                    'strokeCount': None,
                    'targets': [],
                })
            stroke_count = rec.get('strokeCount')
            if isinstance(stroke_count, int) and stroke_count > 0:
                key = str(stroke_count) if stroke_count <= 9 else '10+'
                strokes[key].append(target)
            else:
                strokes['unknown'].append(target)

        if not memberships:
            outside.append(target)
            radical = rec.get('radical') or {}
            if rec.get('targetType') != 'single-character' or radical.get('status') != 'resolved':
                unclassified.append(target)

    for lib, levels in curr.items():
        for key, values in levels.items():
            catalog['curricula'][lib]['levels'][key] = {'count': len(set(values)), 'targets': uniq_sorted(values)}
    for rid, values in radicals.items():
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
        'singleCharacters': sum(1 for rec in records.values() if rec.get('targetType') == 'single-character'),
        'multiCharacterWords': sum(1 for rec in records.values() if rec.get('targetType') != 'single-character'),
        'resolvedRadicals': len(catalog['radicals']['items']),
        'outsideCurricula': catalog['other']['outsideCurriculaCount'],
        'unclassified': catalog['other']['unclassifiedCount'],
    }
    return catalog


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', type=Path, required=True)
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()
    base = args.base.resolve()
    output = base / 'catalog-index.json'
    payload = build(base)
    rendered = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
    if args.check:
        current = output.read_text(encoding='utf-8-sig') if output.exists() else ''
        if current != rendered:
            print('catalog-index.json is stale; rebuild it')
            return 1
        print(f"PASS catalog projection: {payload['summary']['totalTargets']} targets")
        return 0
    output.write_text(rendered, encoding='utf-8')
    print(json.dumps({'output': str(output), 'summary': payload['summary']}, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

#!/usr/bin/env python3
from __future__ import annotations

import argparse
import copy
import json
import re
import shutil
from collections import defaultdict
from pathlib import Path
from typing import Any

HAN = re.compile(r'[\u3400-\u9fff\U00020000-\U0002EBEF]')
ALLOWED_EXISTING_FIELDS = {'levels', 'libraries', 'routes'}


def hans(value: str) -> str:
    return ''.join(HAN.findall(str(value or '')))


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')


def route_key(route: dict[str, Any]) -> tuple[str, str, str, str]:
    level = route.get('levelNo')
    if level is None:
        level = route.get('level')
    return (
        str(route.get('libraryId') or route.get('source') or ''),
        str(level if level is not None else ''),
        str(route.get('sectionId') or ''),
        str(route.get('orderInSection') if route.get('orderInSection') is not None else ''),
    )


def pinyin_clean(value: str) -> str:
    return re.sub(r'\s+', ' ', str(value or '').replace('*', ' ').strip())


def short_meaning(value: str) -> str:
    text = str(value or '').strip()
    for sep in (' / ', ';', '. '):
        if sep in text:
            return '; '.join(x.strip() for x in text.split(sep) if x.strip())[:160]
    return text[:160]


def aggregate_runtime(runtime: Path) -> tuple[dict[str, dict[str, Any]], set[str]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    raw_words: set[str] = set()
    for level in range(1, 9):
        path = runtime / f'hsk_{level}.json'
        doc = read_json(path)
        shard_level = int(doc.get('level') or level)
        for raw_item in doc.get('items', []):
            item = dict(raw_item)
            surface = str(item.get('word') or item.get('simplified') or '').strip()
            target = hans(surface)
            if not target:
                continue
            raw_words.add(surface)
            item['_level'] = shard_level
            item['_file'] = path.name
            item['_surface'] = surface
            grouped[target].append(item)

    result: dict[str, dict[str, Any]] = {}
    for target, items in grouped.items():
        levels = sorted({int(x['_level']) for x in items})
        libraries = sorted({str(lib) for x in items for lib in (x.get('libraries') or []) if str(lib)})
        routes: dict[tuple[str, str, str, str], dict[str, Any]] = {}
        for item in items:
            for route in item.get('routes') or []:
                key = route_key(route)
                if key not in routes:
                    routes[key] = copy.deepcopy(route)
        surfaces = sorted({x['_surface'] for x in items if x['_surface']})
        best = min(
            items,
            key=lambda x: (
                int(x['_level']),
                len(str(x.get('meaningVi') or '')),
                len(str(x.get('word') or '')),
                str(x.get('word') or ''),
            ),
        )
        result[target] = {
            'items': items,
            'levels': levels,
            'libraries': libraries,
            'routes': routes,
            'surfaces': surfaces,
            'best': best,
        }
    return result, raw_words


def load_records(base: Path, target_index: dict[str, str]) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    bucket_docs: dict[str, dict[str, Any]] = {}
    records: dict[str, dict[str, Any]] = {}
    for target, raw_bucket in target_index.items():
        bucket = str(raw_bucket)
        if bucket not in bucket_docs:
            bucket_docs[bucket] = read_json(base / 'records' / f'{bucket}.json')
        record = (bucket_docs[bucket].get('records') or {}).get(target)
        if not isinstance(record, dict):
            raise RuntimeError(f'Base unified record missing: {target} -> {bucket}')
        records[target] = record
    return bucket_docs, records


def character_rows(target: str, records: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for char in target:
        rec = records.get(char)
        if not rec:
            raise RuntimeError(f'Character prerequisite missing for new target {target}: {char}')
        rows.append({
            'char': char,
            'pinyin': str(rec.get('pinyin') or ''),
            'hanViet': str(rec.get('hanViet') or ''),
            'meaningVi': str(rec.get('meaningShortVi') or rec.get('meaningFullVi') or ''),
            'radical': copy.deepcopy(rec.get('radical')),
        })
    return rows


def source_rows(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen = set()
    rows = []
    for item in items:
        row = {
            'file': str(item.get('_file') or ''),
            'libraries': sorted({str(x) for x in (item.get('libraries') or []) if str(x)}),
        }
        key = (row['file'], tuple(row['libraries']))
        if key in seen:
            continue
        seen.add(key)
        rows.append(row)
    return rows


def make_new_record(target: str, aggregate: dict[str, Any], records: dict[str, dict[str, Any]]) -> dict[str, Any]:
    best = aggregate['best']
    full = str(best.get('meaningVi') or best.get('translationVi') or '').strip()
    short = str(best.get('translationVi') or '').strip() or short_meaning(full)
    aliases = [surface for surface in aggregate['surfaces'] if surface and surface != target]
    record: dict[str, Any] = {
        'schemaVersion': 'unified-lookup-v1',
        'target': target,
        'targetType': 'multi-character-word',
        'pinyin': pinyin_clean(best.get('pinyin')),
        'hanViet': '',
        'meaningShortVi': short,
        'meaningFullVi': full,
        'traditional': str(best.get('traditional') or ''),
        'wordType': str(best.get('wordType') or ''),
        'wordTypeExplanation': str(best.get('wordTypeExplanation') or ''),
        'usageNoteVi': str(best.get('usageNote') or best.get('usageNoteVi') or ''),
        'levels': list(aggregate['levels']),
        'libraries': list(aggregate['libraries']),
        'routes': [copy.deepcopy(aggregate['routes'][key]) for key in sorted(aggregate['routes'], key=lambda k: tuple(map(str, k)))],
        'writing': {'enabled': True, 'characters': list(target)},
        'radical': None,
        'radicalComponentOf': [],
        'characters': character_rows(target, records),
        'components': [],
        'memory': copy.deepcopy(best.get('memoryTips') or {}),
        'relatedWords': [],
        'collocations': [],
        'sentences': [],
        'grammar': [],
        'sources': source_rows(aggregate['items']),
        'dataTier': '',
    }
    if aliases:
        record['aliases'] = aliases
    return record


def merge_existing(record: dict[str, Any], delta: dict[str, Any]) -> None:
    protected_before = {k: copy.deepcopy(v) for k, v in record.items() if k not in ALLOWED_EXISTING_FIELDS}
    record['levels'] = sorted(set(record.get('levels') or []) | {int(x) for x in delta.get('addLevels', [])})
    record['libraries'] = sorted(set(str(x) for x in (record.get('libraries') or [])) | {str(x) for x in delta.get('addLibraries', [])})
    routes = [copy.deepcopy(x) for x in (record.get('routes') or [])]
    seen = {route_key(x) for x in routes}
    for route in delta.get('addRoutes', []):
        key = route_key(route)
        if key not in seen:
            routes.append(copy.deepcopy(route))
            seen.add(key)
    record['routes'] = routes
    protected_after = {k: v for k, v in record.items() if k not in ALLOWED_EXISTING_FIELDS}
    if protected_before != protected_after:
        raise RuntimeError(f'Protected-field mutation detected for {record.get("target")}')


def reconcile(base: Path, runtime: Path, delta_path: Path, output: Path) -> dict[str, Any]:
    delta = read_json(delta_path)
    if delta.get('schemaVersion') != 'hsk-unified-phase-a-delta-v1':
        raise RuntimeError('Unexpected delta schema')

    if output.exists():
        shutil.rmtree(output)
    shutil.copytree(base, output)

    index_doc = read_json(output / 'unified-target-index.json')
    targets = index_doc.get('targets') or {}
    if not isinstance(targets, dict):
        raise RuntimeError('Invalid unified target index')
    base_targets = dict(targets)
    if len(base_targets) != int(delta['baseUnifiedTargetCount']):
        raise RuntimeError(f'Unexpected base unified target count: {len(base_targets)}')

    bucket_docs, records = load_records(output, base_targets)
    aggregate, raw_words = aggregate_runtime(runtime)
    normalized_words = set(aggregate)
    if len(raw_words) != int(delta['candidateHskRawUnique']):
        raise RuntimeError(f'Unexpected HSK raw unique count: {len(raw_words)}')
    if len(normalized_words) != int(delta['candidateHskNormalizedUnique']):
        raise RuntimeError(f'Unexpected HSK normalized unique count: {len(normalized_words)}')

    existing_updates = delta.get('existingTargetUpdates') or {}
    new_targets = delta.get('newTargets') or {}
    missing_existing = sorted(set(existing_updates) - set(base_targets))
    preexisting_new = sorted(set(new_targets) & set(base_targets))
    missing_from_runtime = sorted((set(existing_updates) | set(new_targets)) - normalized_words)
    if missing_existing or preexisting_new or missing_from_runtime:
        raise RuntimeError(json.dumps({
            'missingExistingDeltaTargets': missing_existing[:20],
            'newTargetsAlreadyPresent': preexisting_new[:20],
            'deltaTargetsMissingFromRuntime': missing_from_runtime[:20],
        }, ensure_ascii=False))

    modified_buckets: set[str] = set()
    protected_changes: list[str] = []
    for target in sorted(existing_updates):
        bucket = str(base_targets[target])
        record = (bucket_docs[bucket]['records'])[target]
        before = {k: copy.deepcopy(v) for k, v in record.items() if k not in ALLOWED_EXISTING_FIELDS}
        merge_existing(record, existing_updates[target])
        after = {k: copy.deepcopy(v) for k, v in record.items() if k not in ALLOWED_EXISTING_FIELDS}
        if before != after:
            protected_changes.append(target)
        modified_buckets.add(bucket)

    new_record_targets = []
    for target in sorted(new_targets):
        agg = aggregate[target]
        expected = new_targets[target]
        if list(agg['levels']) != list(expected.get('levels') or []):
            raise RuntimeError(f'New target levels drift: {target}')
        if list(agg['libraries']) != list(expected.get('libraries') or []):
            raise RuntimeError(f'New target libraries drift: {target}')
        if list(agg['surfaces']) != list(expected.get('rawSurfaces') or []):
            raise RuntimeError(f'New target surface drift: {target}')
        if len(target) < 2:
            raise RuntimeError(f'Unexpected new single-character target: {target}')
        bucket = f'{ord(target[0]) % 256:02X}'
        if bucket not in bucket_docs:
            path = output / 'records' / f'{bucket}.json'
            bucket_docs[bucket] = read_json(path) if path.exists() else {'schemaVersion': 'unified-record-bucket-v1', 'records': {}}
        record = make_new_record(target, agg, records)
        bucket_docs[bucket].setdefault('records', {})[target] = record
        records[target] = record
        targets[target] = bucket
        modified_buckets.add(bucket)
        new_record_targets.append(target)

    mapping_changes = [t for t, bucket in base_targets.items() if str(targets.get(t)) != str(bucket)]
    lost_base_targets = sorted(set(base_targets) - set(targets))
    if mapping_changes or lost_base_targets or protected_changes:
        raise RuntimeError(json.dumps({
            'baseBucketMappingChanges': mapping_changes[:20],
            'lostBaseTargets': lost_base_targets[:20],
            'protectedFieldChanges': protected_changes[:20],
        }, ensure_ascii=False))

    for bucket in sorted(modified_buckets):
        doc = bucket_docs[bucket]
        recs = doc.get('records') or {}
        doc['records'] = {key: recs[key] for key in sorted(recs)}
        write_json(output / 'records' / f'{bucket}.json', doc)

    index_doc['targets'] = {key: targets[key] for key in sorted(targets)}
    write_json(output / 'unified-target-index.json', index_doc)

    generated_targets = set(targets)
    normalized_missing = sorted(normalized_words - generated_targets)
    expected_count = int(delta['baseUnifiedTargetCount']) + int(delta['phaseANewMissingUnified'])
    if normalized_missing or len(generated_targets) != expected_count:
        raise RuntimeError(json.dumps({
            'normalizedHskMissingAfter': normalized_missing[:30],
            'generatedTargetCount': len(generated_targets),
            'expectedTargetCount': expected_count,
        }, ensure_ascii=False))

    alias_requirements = {}
    for target in new_record_targets:
        aliases = [surface for surface in aggregate[target]['surfaces'] if surface != target]
        if aliases:
            alias_requirements[target] = aliases
            if sorted(records[target].get('aliases') or []) != sorted(aliases):
                raise RuntimeError(f'Alias preservation failed: {target}')

    report = {
        'schemaVersion': 'phase-b2-unified-reconcile-report-v1',
        'status': 'PASS',
        'baseTargetCount': len(base_targets),
        'generatedTargetCount': len(generated_targets),
        'hskRawUnique': len(raw_words),
        'hskNormalizedUnique': len(normalized_words),
        'existingTargetUpdatesApplied': len(existing_updates),
        'existingPhaseAMembershipDeltaTargets': int(delta['phaseAExistingMembershipDeltaTargets']),
        'phaseANewAlreadyUnified': int(delta['phaseANewAlreadyUnified']),
        'newTargetsAdded': len(new_record_targets),
        'newSingleCharacterTargets': sum(1 for x in new_record_targets if len(x) == 1),
        'newMultiCharacterTargets': sum(1 for x in new_record_targets if len(x) > 1),
        'normalizedHskMissingAfter': len(normalized_missing),
        'protectedFieldChanges': protected_changes,
        'baseBucketMappingChanges': mapping_changes,
        'lostBaseTargets': lost_base_targets,
        'modifiedBucketCount': len(modified_buckets),
        'newAliasTargetCount': len(alias_requirements),
        'newAliasRequirements': alias_requirements,
    }
    write_json(output / 'phase-b2-unified-reconcile-report.json', report)
    return report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', type=Path, required=True)
    ap.add_argument('--runtime', type=Path, required=True)
    ap.add_argument('--delta', type=Path, required=True)
    ap.add_argument('--output', type=Path, required=True)
    args = ap.parse_args()
    report = reconcile(args.base.resolve(), args.runtime.resolve(), args.delta.resolve(), args.output.resolve())
    print(json.dumps(report, ensure_ascii=True, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

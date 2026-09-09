#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any

HAN = re.compile(r'[\u3400-\u9fff\U00020000-\U0002EBEF]')
RUNTIME_REL = Path('modules/hanzi-stroke/data/learning/hsk')
SOURCE_REL = Path('modules/hanzi-stroke/data/learning/hsk-source-v1')
UNIFIED_REL = Path('modules/hanzi-stroke/data/learning/unified-lookup/all-sources')
RUNTIME_FILES = [*(f'hsk_{i}.json' for i in range(1, 9)), 'hsk_flashcard_lookup.json', 'hsk_summary.json', 'source_summary.json']
EXPECTED = {'totalRecords': 20150, 'rawUniqueWords': 12500, 'normalizedUniqueWords': 12485, 'lookupCount': 11536}
EXPECTED_UNIFIED = {'baseTargets': 21303, 'generatedTargets': 21753, 'newTargets': 450, 'existingUpdates': 1494}


def hans(value: str) -> str:
    return ''.join(HAN.findall(str(value or '')))


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding='utf-8-sig'))


def sem_hash(obj: Any) -> str:
    raw = json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(raw).hexdigest()


def file_hash(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def dir_bytes(path: Path) -> int:
    return sum(p.stat().st_size for p in path.rglob('*') if p.is_file()) if path.exists() else 0


def load_record(base: Path, targets: dict[str, str], target: str, cache: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    bucket = str(targets.get(target) or '')
    if not bucket:
        return None
    if bucket not in cache:
        path = base / 'records' / f'{bucket}.json'
        cache[bucket] = (read_json(path).get('records') or {}) if path.is_file() else {}
    record = cache[bucket].get(target)
    return record if isinstance(record, dict) else None


def verify(repo: Path, unified: Path, artifact: Path | None, reconcile_report_path: Path) -> dict[str, Any]:
    issues: list[dict[str, Any]] = []
    blockers: list[dict[str, Any]] = []
    source = repo / SOURCE_REL
    runtime = repo / RUNTIME_REL

    manifest_path = source / 'manifest.json'
    manifest = read_json(manifest_path) if manifest_path.is_file() else {}
    if manifest.get('schemaVersion') != 'canonical-vocab-source-v1':
        blockers.append({'code': 'CANONICAL_SCHEMA_UNEXPECTED', 'actual': manifest.get('schemaVersion')})
    if not str(manifest.get('baselineCommit') or '').startswith('2acc4540'):
        blockers.append({'code': 'BASELINE_COMMIT_UNEXPECTED', 'actual': manifest.get('baselineCommit')})

    expected_hashes = manifest.get('runtimeSemanticHashes', {}) if isinstance(manifest, dict) else {}
    raw_words: set[str] = set()
    normalized_words: set[str] = set()
    total_records = 0
    runtime_hashes: dict[str, str] = {}
    for level in range(1, 9):
        name = f'hsk_{level}.json'
        path = runtime / name
        if not path.is_file():
            blockers.append({'code': 'RUNTIME_FILE_MISSING', 'file': name})
            continue
        doc = read_json(path)
        runtime_hashes[name] = sem_hash(doc)
        if expected_hashes.get(name) and runtime_hashes[name] != expected_hashes[name]:
            blockers.append({'code': 'RUNTIME_SEMANTIC_HASH_MISMATCH', 'file': name})
        items = doc.get('items', []) if isinstance(doc, dict) else []
        local_seen = set()
        for item in items:
            word = str((item or {}).get('word') or (item or {}).get('simplified') or '').strip()
            if not word:
                blockers.append({'code': 'EMPTY_WORD', 'file': name})
                continue
            if word in local_seen:
                blockers.append({'code': 'DUPLICATE_WORD_IN_LEVEL', 'file': name, 'word': word})
            local_seen.add(word)
            raw_words.add(word)
            target = hans(word)
            if target:
                normalized_words.add(target)
        total_records += len(items)

    for name in ('hsk_flashcard_lookup.json', 'hsk_summary.json', 'source_summary.json'):
        path = runtime / name
        if not path.is_file():
            blockers.append({'code': 'RUNTIME_FILE_MISSING', 'file': name})
            continue
        doc = read_json(path)
        runtime_hashes[name] = sem_hash(doc)
        if expected_hashes.get(name) and runtime_hashes[name] != expected_hashes[name]:
            blockers.append({'code': 'RUNTIME_SEMANTIC_HASH_MISMATCH', 'file': name})

    lookup_count = 0
    lookup_path = runtime / 'hsk_flashcard_lookup.json'
    if lookup_path.is_file():
        lookup = read_json(lookup_path)
        lookup_count = len(lookup.get('items', {})) if isinstance(lookup.get('items'), dict) else 0

    counts = {
        'totalRecords': total_records,
        'rawUniqueWords': len(raw_words),
        'normalizedUniqueWords': len(normalized_words),
        'lookupCount': lookup_count,
    }
    for key, expected in EXPECTED.items():
        if counts.get(key) != expected:
            blockers.append({'code': 'COUNT_MISMATCH', 'field': key, 'expected': expected, 'actual': counts.get(key)})

    if not reconcile_report_path.is_file():
        blockers.append({'code': 'UNIFIED_RECONCILE_REPORT_MISSING'})
        reconcile = {}
    else:
        reconcile = read_json(reconcile_report_path)
        required = {
            'status': 'PASS',
            'baseTargetCount': EXPECTED_UNIFIED['baseTargets'],
            'generatedTargetCount': EXPECTED_UNIFIED['generatedTargets'],
            'existingTargetUpdatesApplied': EXPECTED_UNIFIED['existingUpdates'],
            'newTargetsAdded': EXPECTED_UNIFIED['newTargets'],
            'newSingleCharacterTargets': 0,
            'newMultiCharacterTargets': EXPECTED_UNIFIED['newTargets'],
            'normalizedHskMissingAfter': 0,
            'newAliasTargetCount': 10,
        }
        for key, expected in required.items():
            if reconcile.get(key) != expected:
                blockers.append({'code': 'UNIFIED_RECONCILE_COUNT_MISMATCH', 'field': key, 'expected': expected, 'actual': reconcile.get(key)})
        for key in ('protectedFieldChanges', 'baseBucketMappingChanges', 'lostBaseTargets'):
            if reconcile.get(key):
                blockers.append({'code': 'UNIFIED_RECONCILE_INVARIANT_FAILED', 'field': key, 'preview': (reconcile.get(key) or [])[:20]})

    index_path = unified / 'unified-target-index.json'
    search_path = unified / 'search-index.json'
    catalog_path = unified / 'catalog-index.json'
    if not index_path.is_file():
        blockers.append({'code': 'GENERATED_UNIFIED_INDEX_MISSING'})
        targets = {}
    else:
        targets = read_json(index_path).get('targets') or {}
        if len(targets) != EXPECTED_UNIFIED['generatedTargets']:
            blockers.append({'code': 'GENERATED_UNIFIED_TARGET_COUNT', 'expected': EXPECTED_UNIFIED['generatedTargets'], 'actual': len(targets)})

    missing_normalized = sorted(normalized_words - set(targets))
    if missing_normalized:
        blockers.append({'code': 'GENERATED_UNIFIED_HSK_NORMALIZED_GAP', 'missingCount': len(missing_normalized), 'preview': missing_normalized[:50]})

    bucket_cache: dict[str, dict[str, Any]] = {}
    missing_records = []
    for target in sorted(normalized_words & set(targets)):
        if load_record(unified, targets, target, bucket_cache) is None:
            missing_records.append(target)
    if missing_records:
        blockers.append({'code': 'GENERATED_UNIFIED_RECORD_GAP', 'missingCount': len(missing_records), 'preview': missing_records[:50]})

    alias_mismatches = []
    for target, required_aliases in (reconcile.get('newAliasRequirements') or {}).items():
        record = load_record(unified, targets, target, bucket_cache)
        aliases = set((record or {}).get('aliases') or [])
        missing_aliases = sorted(set(required_aliases or []) - aliases)
        if record is None or missing_aliases:
            alias_mismatches.append({'target': target, 'missingAliases': missing_aliases})
    if alias_mismatches:
        blockers.append({'code': 'GENERATED_UNIFIED_ALIAS_GAP', 'count': len(alias_mismatches), 'preview': alias_mismatches[:20]})

    search_count = 0
    if not search_path.is_file():
        blockers.append({'code': 'GENERATED_SEARCH_INDEX_MISSING'})
    else:
        search = read_json(search_path)
        search_count = len(search.get('items') or [])
        if search_count != len(targets):
            blockers.append({'code': 'GENERATED_SEARCH_COUNT_MISMATCH', 'targets': len(targets), 'searchItems': search_count})

    catalog_total = 0
    if not catalog_path.is_file():
        blockers.append({'code': 'GENERATED_CATALOG_INDEX_MISSING'})
    else:
        catalog = read_json(catalog_path)
        catalog_total = int((catalog.get('summary') or {}).get('totalTargets') or 0)
        if catalog_total != len(targets):
            blockers.append({'code': 'GENERATED_CATALOG_COUNT_MISMATCH', 'targets': len(targets), 'catalogTargets': catalog_total})

    raw_not_exact = sorted(raw_words - set(targets))
    raw_not_exact_but_normalized = [word for word in raw_not_exact if hans(word) in targets]
    raw_not_covered = [word for word in raw_not_exact if hans(word) not in targets]
    if raw_not_covered:
        blockers.append({'code': 'RAW_HSK_NOT_COVERED_BY_NORMALIZATION', 'count': len(raw_not_covered), 'preview': raw_not_covered[:30]})

    artifact_report: dict[str, Any] = {'checked': False}
    if artifact is not None:
        artifact_report['checked'] = True
        artifact_report['rawBytes'] = dir_bytes(artifact)
        if not (artifact / 'index.html').is_file():
            blockers.append({'code': 'PAGES_INDEX_MISSING'})
        if (artifact / SOURCE_REL).exists():
            blockers.append({'code': 'CANONICAL_SOURCE_LEAKED_TO_PAGES'})
        if (artifact / '.git').exists() or (artifact / '.github').exists() or (artifact / '_generated').exists():
            blockers.append({'code': 'INTERNAL_METADATA_LEAKED_TO_PAGES'})

        artifact_unified = artifact / UNIFIED_REL
        for name in ('unified-target-index.json', 'search-index.json', 'catalog-index.json'):
            source_path = unified / name
            artifact_path = artifact_unified / name
            if not artifact_path.is_file():
                blockers.append({'code': 'PAGES_UNIFIED_FILE_MISSING', 'file': name})
            elif source_path.is_file() and file_hash(source_path) != file_hash(artifact_path):
                blockers.append({'code': 'PAGES_UNIFIED_FILE_HASH_MISMATCH', 'file': name})

        artifact_idx = read_json(artifact_unified / 'unified-target-index.json').get('targets') if (artifact_unified / 'unified-target-index.json').is_file() else {}
        artifact_cache: dict[str, dict[str, Any]] = {}
        record_mismatches = []
        for target in sorted(normalized_words & set(targets)):
            source_record = load_record(unified, targets, target, bucket_cache)
            artifact_record = load_record(artifact_unified, artifact_idx or {}, target, artifact_cache)
            if source_record is None or artifact_record is None or sem_hash(source_record) != sem_hash(artifact_record):
                record_mismatches.append(target)
                if len(record_mismatches) >= 50:
                    break
        if record_mismatches:
            blockers.append({'code': 'PAGES_UNIFIED_RECORD_MISMATCH', 'preview': record_mismatches})

        missing_artifact_runtime = []
        for name in RUNTIME_FILES:
            artifact_path = artifact / RUNTIME_REL / name
            if not artifact_path.is_file():
                missing_artifact_runtime.append(name)
            elif name in runtime_hashes and sem_hash(read_json(artifact_path)) != runtime_hashes[name]:
                blockers.append({'code': 'PAGES_RUNTIME_HASH_MISMATCH', 'file': name})
        if missing_artifact_runtime:
            blockers.append({'code': 'PAGES_RUNTIME_MISSING', 'files': missing_artifact_runtime})

    return {
        'schemaVersion': 'phase-b2-contract-v2-normalized-unified',
        'status': 'PASS' if not blockers else 'BLOCKED',
        'counts': counts,
        'canonicalSourceRawBytes': dir_bytes(source),
        'generatedRuntimeRawBytes': sum((runtime / name).stat().st_size for name in RUNTIME_FILES if (runtime / name).is_file()),
        'unifiedLookup': {
            'generatedTargetCount': len(targets),
            'normalizedHskTargets': len(normalized_words),
            'missingNormalizedHskTargets': len(missing_normalized),
            'missingHskRecordBuckets': len(missing_records),
            'searchItems': search_count,
            'catalogTargets': catalog_total,
            'rawSurfaceFormsNotExactTargets': len(raw_not_exact),
            'rawSurfaceFormsCoveredByNormalization': len(raw_not_exact_but_normalized),
            'rawSurfaceFormsNotCovered': len(raw_not_covered),
        },
        'reconcile': reconcile,
        'artifact': artifact_report,
        'issues': issues,
        'blockers': blockers,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo-root', type=Path, default=Path('.'))
    ap.add_argument('--unified-root', type=Path, required=True)
    ap.add_argument('--reconcile-report', type=Path, required=True)
    ap.add_argument('--artifact-root', type=Path)
    ap.add_argument('--report', type=Path, required=True)
    args = ap.parse_args()
    result = verify(
        args.repo_root.resolve(),
        args.unified_root.resolve(),
        args.artifact_root.resolve() if args.artifact_root else None,
        args.reconcile_report.resolve(),
    )
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result['status'] == 'PASS' else 2


if __name__ == '__main__':
    raise SystemExit(main())

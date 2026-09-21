from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

PUBLIC_RUNTIME_REL = Path('modules/GrammarV1/runtime/exercises')
CANONICAL_SOURCE_REL = Path('modules/GrammarV1/source')
EXPECTED_FILES = (
    'index.json',
    'hsk3.json',
    'hsk4.json',
    'hsk5.json',
    'hsk6.json',
    'new-hsk1.json',
    'new-hsk2.json',
    'new-hsk3.json',
)
EXPECTED_TOTALS = {
    'tracks': 7,
    'grammars': 399,
    'exercises': 7980,
    'types': {
        'mcq': 3990,
        'translate_vi_zh': 1995,
        'translate_zh_vi': 1995,
    },
}


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding='utf-8'))


def verify(generated_root: Path, artifact_root: Path) -> dict[str, Any]:
    generated_root = generated_root.resolve()
    artifact_root = artifact_root.resolve()
    public_root = artifact_root / PUBLIC_RUNTIME_REL
    blockers: list[dict[str, Any]] = []

    generated_files = {p.name for p in generated_root.iterdir() if p.is_file()} if generated_root.is_dir() else set()
    expected = set(EXPECTED_FILES)
    if generated_files != expected:
        blockers.append({
            'code': 'GENERATED_FILE_SET_MISMATCH',
            'actual': sorted(generated_files),
            'expected': sorted(expected),
        })

    index = read_json(generated_root / 'index.json') if (generated_root / 'index.json').is_file() else {}
    if index.get('schemaVersion') != 'grammarv1-runtime-index-v1':
        blockers.append({
            'code': 'GENERATED_INDEX_SCHEMA_MISMATCH',
            'actual': index.get('schemaVersion'),
        })
    if index.get('totals') != EXPECTED_TOTALS:
        blockers.append({
            'code': 'GENERATED_TOTALS_MISMATCH',
            'actual': index.get('totals'),
            'expected': EXPECTED_TOTALS,
        })

    public_files = {p.name for p in public_root.iterdir() if p.is_file()} if public_root.is_dir() else set()
    if public_files != expected:
        blockers.append({
            'code': 'PAGES_FILE_SET_MISMATCH',
            'actual': sorted(public_files),
            'expected': sorted(expected),
        })

    file_report: dict[str, Any] = {}
    for name in EXPECTED_FILES:
        source = generated_root / name
        published = public_root / name
        source_hash = sha256_file(source) if source.is_file() else None
        published_hash = sha256_file(published) if published.is_file() else None
        file_report[name] = {
            'generatedSha256': source_hash,
            'publishedSha256': published_hash,
            'bytes': source.stat().st_size if source.is_file() else None,
        }
        if source_hash is None or published_hash is None:
            continue
        if source_hash != published_hash:
            blockers.append({
                'code': 'PAGES_RUNTIME_HASH_MISMATCH',
                'file': name,
                'generatedSha256': source_hash,
                'publishedSha256': published_hash,
            })

    if (artifact_root / CANONICAL_SOURCE_REL).exists():
        blockers.append({'code': 'CANONICAL_GRAMMARV1_SOURCE_LEAKED_TO_PAGES'})
    if (artifact_root / '_generated').exists():
        blockers.append({'code': 'INTERNAL_GENERATED_WORKSPACE_LEAKED_TO_PAGES'})

    return {
        'schemaVersion': 'grammarv1-pages-runtime-contract-v1',
        'status': 'PASS' if not blockers else 'BLOCKED',
        'generatedRoot': str(generated_root),
        'publishedRoot': str(public_root),
        'publicRelativePath': PUBLIC_RUNTIME_REL.as_posix(),
        'totals': index.get('totals'),
        'files': file_report,
        'canonicalSourceExcluded': not (artifact_root / CANONICAL_SOURCE_REL).exists(),
        'internalGeneratedExcluded': not (artifact_root / '_generated').exists(),
        'blockers': blockers,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description='Verify GrammarV1 generated runtime is published to Pages without canonical source duplication.')
    ap.add_argument('--generated-root', type=Path, required=True)
    ap.add_argument('--artifact-root', type=Path, required=True)
    ap.add_argument('--report', type=Path, required=True)
    args = ap.parse_args()

    report = verify(args.generated_root, args.artifact_root)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report['status'] == 'PASS' else 2


if __name__ == '__main__':
    raise SystemExit(main())

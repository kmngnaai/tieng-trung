#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

SKIP_TOP = {'.git', '.github', '.venv', '_site', '_generated'}
SKIP_NAMES = {'__pycache__', '.pytest_cache'}
CANONICAL_REL = Path('modules/hanzi-stroke/data/learning/hsk-source-v1')
UNIFIED_REL = Path('modules/hanzi-stroke/data/learning/unified-lookup/all-sources')
GRAMMARV1_SOURCE_REL = Path('modules/GrammarV1/source')
GRAMMARV1_RUNTIME_REL = Path('modules/GrammarV1/runtime/exercises')
GRAMMARV1_RUNTIME_FILES = (
    'index.json',
    'hsk3.json',
    'hsk4.json',
    'hsk5.json',
    'hsk6.json',
    'new-hsk1.json',
    'new-hsk2.json',
    'new-hsk3.json',
)
INTERNAL_GENERATED_NAMES = {'phase-b2-unified-reconcile-report.json'}


def is_under(rel: Path, parent: Path) -> bool:
    try:
        rel.relative_to(parent)
        return True
    except ValueError:
        return False


def should_skip(rel: Path) -> bool:
    if not rel.parts:
        return False
    if rel.parts[0] in SKIP_TOP:
        return True
    if any(part in SKIP_NAMES for part in rel.parts):
        return True
    if is_under(rel, CANONICAL_REL):
        return True
    if is_under(rel, GRAMMARV1_SOURCE_REL):
        return True
    return False


def copy_tree_contents(source: Path, target: Path) -> None:
    for path in source.rglob('*'):
        rel = path.relative_to(source)
        if path.name in INTERNAL_GENERATED_NAMES:
            continue
        destination = target / rel
        if path.is_dir():
            destination.mkdir(parents=True, exist_ok=True)
        else:
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, destination)


def validate_grammarv1_generated(generated: Path) -> None:
    actual = {path.name for path in generated.iterdir() if path.is_file()} if generated.is_dir() else set()
    expected = set(GRAMMARV1_RUNTIME_FILES)
    if actual != expected:
        raise SystemExit(
            'Generated GrammarV1 runtime invalid file set: '
            f'actual={sorted(actual)} expected={sorted(expected)}'
        )
    index = json.loads((generated / 'index.json').read_text(encoding='utf-8'))
    expected_totals = {
        'tracks': 7,
        'grammars': 399,
        'exercises': 7980,
        'types': {
            'mcq': 3990,
            'translate_vi_zh': 1995,
            'translate_zh_vi': 1995,
        },
    }
    if index.get('schemaVersion') != 'grammarv1-runtime-index-v1':
        raise SystemExit(f"Generated GrammarV1 index schema invalid: {index.get('schemaVersion')!r}")
    if index.get('totals') != expected_totals:
        raise SystemExit(f"Generated GrammarV1 totals invalid: {index.get('totals')!r}")


def publish_grammarv1_runtime(generated: Path, output: Path) -> None:
    generated = generated.resolve()
    validate_grammarv1_generated(generated)
    target = output / GRAMMARV1_RUNTIME_REL
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True, exist_ok=True)
    for name in GRAMMARV1_RUNTIME_FILES:
        shutil.copy2(generated / name, target / name)


def build(
    repo_root: Path,
    output: Path,
    generated_unified: Path | None,
    generated_grammarv1: Path | None = None,
) -> None:
    repo_root = repo_root.resolve()
    output = output.resolve()
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)

    for path in repo_root.rglob('*'):
        rel = path.relative_to(repo_root)
        if should_skip(rel):
            continue
        if path.is_dir():
            (output / rel).mkdir(parents=True, exist_ok=True)
            continue
        target = output / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)

    if generated_unified is not None:
        generated_unified = generated_unified.resolve()
        if not (generated_unified / 'unified-target-index.json').is_file():
            raise SystemExit(f'Generated unified output invalid: {generated_unified}')
        target = output / UNIFIED_REL
        if target.exists():
            shutil.rmtree(target)
        target.mkdir(parents=True)
        copy_tree_contents(generated_unified, target)

    if generated_grammarv1 is not None:
        publish_grammarv1_runtime(generated_grammarv1, output)

    required = [
        output / 'index.html',
        *(output / 'modules/hanzi-stroke/data/learning/hsk' / f'hsk_{i}.json' for i in range(1, 9)),
        output / 'modules/hanzi-stroke/data/learning/hsk/hsk_flashcard_lookup.json',
        output / 'modules/hanzi-stroke/data/learning/hsk/hsk_summary.json',
        output / 'modules/hanzi-stroke/data/learning/hsk/source_summary.json',
        output / UNIFIED_REL / 'unified-target-index.json',
        output / UNIFIED_REL / 'search-index.json',
        output / UNIFIED_REL / 'catalog-index.json',
    ]
    if generated_grammarv1 is not None:
        required.extend(output / GRAMMARV1_RUNTIME_REL / name for name in GRAMMARV1_RUNTIME_FILES)
    missing = [str(p.relative_to(output)) for p in required if not p.is_file()]
    if missing:
        raise SystemExit('Pages artifact missing required files: ' + ', '.join(missing))
    if (output / CANONICAL_REL).exists():
        raise SystemExit('Canonical HSK source leaked into Pages artifact')
    if (output / GRAMMARV1_SOURCE_REL).exists():
        raise SystemExit('Canonical GrammarV1 source leaked into Pages artifact')
    if (output / '_generated').exists():
        raise SystemExit('Internal generated workspace leaked into Pages artifact')
    print(f'PASS Pages artifact: {output}')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo-root', type=Path, default=Path('.'))
    ap.add_argument('--output', type=Path, required=True)
    ap.add_argument('--generated-unified', type=Path)
    ap.add_argument('--generated-grammarv1', type=Path)
    args = ap.parse_args()
    build(args.repo_root, args.output, args.generated_unified, args.generated_grammarv1)


if __name__ == '__main__':
    main()

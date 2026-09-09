#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

SKIP_TOP = {'.git', '.github', '.venv', '_site', '_generated'}
SKIP_NAMES = {'__pycache__', '.pytest_cache'}
CANONICAL_REL = Path('modules/hanzi-stroke/data/learning/hsk-source-v1')
UNIFIED_REL = Path('modules/hanzi-stroke/data/learning/unified-lookup/all-sources')
INTERNAL_GENERATED_NAMES = {'phase-b2-unified-reconcile-report.json'}


def should_skip(rel: Path) -> bool:
    if not rel.parts:
        return False
    if rel.parts[0] in SKIP_TOP:
        return True
    if any(part in SKIP_NAMES for part in rel.parts):
        return True
    try:
        rel.relative_to(CANONICAL_REL)
        return True
    except ValueError:
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


def build(repo_root: Path, output: Path, generated_unified: Path | None) -> None:
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
    missing = [str(p.relative_to(output)) for p in required if not p.is_file()]
    if missing:
        raise SystemExit('Pages artifact missing required files: ' + ', '.join(missing))
    if (output / CANONICAL_REL).exists():
        raise SystemExit('Canonical source leaked into Pages artifact')
    if (output / '_generated').exists():
        raise SystemExit('Internal generated workspace leaked into Pages artifact')
    print(f'PASS Pages artifact: {output}')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo-root', type=Path, default=Path('.'))
    ap.add_argument('--output', type=Path, required=True)
    ap.add_argument('--generated-unified', type=Path)
    args = ap.parse_args()
    build(args.repo_root, args.output, args.generated_unified)


if __name__ == '__main__':
    main()

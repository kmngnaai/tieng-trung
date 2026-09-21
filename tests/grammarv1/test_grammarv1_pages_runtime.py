from __future__ import annotations

import importlib.util
import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PAGES_BUILDER = REPO_ROOT / 'scripts' / 'hsk' / 'build_pages_site.py'
VERIFIER = REPO_ROOT / 'modules' / 'GrammarV1' / 'scripts' / 'verify_pages_runtime.py'
WORKFLOW = REPO_ROOT / '.github' / 'workflows' / 'deploy-pages-canonical.yml'
PUBLIC_REL = Path('modules/GrammarV1/runtime/exercises')
SOURCE_REL = Path('modules/GrammarV1/source')
EXPECTED_FILES = {
    'index.json', 'hsk3.json', 'hsk4.json', 'hsk5.json', 'hsk6.json',
    'new-hsk1.json', 'new-hsk2.json', 'new-hsk3.json',
}
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


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n', encoding='utf-8')


def create_minimal_repo(root: Path) -> tuple[Path, Path]:
    (root / 'index.html').parent.mkdir(parents=True, exist_ok=True)
    (root / 'index.html').write_text('<!doctype html><title>fixture</title>\n', encoding='utf-8')
    (root / SOURCE_REL / 'exercises').mkdir(parents=True, exist_ok=True)
    (root / SOURCE_REL / 'exercises' / 'must-not-publish.json').write_text('{}\n', encoding='utf-8')

    hsk = root / 'modules/hanzi-stroke/data/learning/hsk'
    for level in range(1, 9):
        write_json(hsk / f'hsk_{level}.json', {'items': []})
    for name in ('hsk_flashcard_lookup.json', 'hsk_summary.json', 'source_summary.json'):
        write_json(hsk / name, {})

    unified = root / '_generated/unified'
    write_json(unified / 'unified-target-index.json', {'targets': {}})
    write_json(unified / 'search-index.json', {'items': []})
    write_json(unified / 'catalog-index.json', {'summary': {'totalTargets': 0}})

    grammar = root / '_generated/GrammarV1/exercises'
    for name in sorted(EXPECTED_FILES - {'index.json'}):
        write_json(grammar / name, {'schemaVersion': 'grammarv1-runtime-track-v1', 'grammars': []})
    write_json(grammar / 'index.json', {
        'schemaVersion': 'grammarv1-runtime-index-v1',
        'totals': EXPECTED_TOTALS,
        'tracks': [],
        'grammarToTrack': {},
    })
    return unified, grammar


def test_pages_build_publishes_exact_grammar_runtime_and_excludes_canonical_source(tmp_path: Path) -> None:
    builder = load_module('build_pages_site_g2_3', PAGES_BUILDER)
    verifier = load_module('verify_pages_runtime_g2_3', VERIFIER)
    repo = tmp_path / 'repo'
    unified, grammar = create_minimal_repo(repo)
    output = tmp_path / 'site'

    builder.build(repo, output, unified, grammar)
    public = output / PUBLIC_REL
    assert {p.name for p in public.iterdir() if p.is_file()} == EXPECTED_FILES
    for name in EXPECTED_FILES:
        assert (public / name).read_bytes() == (grammar / name).read_bytes()
    assert not (output / SOURCE_REL).exists()
    assert not (output / '_generated').exists()

    report = verifier.verify(grammar, output)
    assert report['status'] == 'PASS'
    assert report['publicRelativePath'] == PUBLIC_REL.as_posix()
    assert report['canonicalSourceExcluded'] is True
    assert report['internalGeneratedExcluded'] is True


def test_pages_verifier_rejects_runtime_hash_mismatch(tmp_path: Path) -> None:
    builder = load_module('build_pages_site_g2_3_red', PAGES_BUILDER)
    verifier = load_module('verify_pages_runtime_g2_3_red', VERIFIER)
    repo = tmp_path / 'repo'
    unified, grammar = create_minimal_repo(repo)
    output = tmp_path / 'site'
    builder.build(repo, output, unified, grammar)

    target = output / PUBLIC_REL / 'hsk3.json'
    target.write_bytes(target.read_bytes() + b' ')
    report = verifier.verify(grammar, output)
    assert report['status'] == 'BLOCKED'
    codes = {row['code'] for row in report['blockers']}
    assert 'PAGES_RUNTIME_HASH_MISMATCH' in codes


def test_workflow_wires_grammar_runtime_before_tests_and_pages() -> None:
    workflow = WORKFLOW.read_text(encoding='utf-8')
    generation = 'python -B modules/GrammarV1/scripts/build_runtime_projection.py'
    python_tests = 'python -B -m pytest -q'
    js_gate = 'python -B scripts/hsk/run_js_contract_gate.py'
    pages_build = 'python -B scripts/hsk/build_pages_site.py'
    verify_pages = 'python -B modules/GrammarV1/scripts/verify_pages_runtime.py'

    assert 'GRAMMARV1_RUNTIME_BASE: _generated/GrammarV1/exercises' in workflow
    assert generation in workflow
    assert '--output "$GRAMMARV1_RUNTIME_BASE"' in workflow
    assert workflow.index(generation) < workflow.index(python_tests)
    assert workflow.index(generation) < workflow.index(js_gate)
    assert pages_build in workflow
    assert '--generated-grammarv1 "$GRAMMARV1_RUNTIME_BASE"' in workflow
    assert verify_pages in workflow
    assert workflow.index(pages_build) < workflow.index(verify_pages)

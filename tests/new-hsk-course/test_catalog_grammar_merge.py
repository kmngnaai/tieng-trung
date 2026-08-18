import importlib.util
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILDER_PATH = ROOT / 'scripts' / 'new-hsk-course' / 'build_catalog_data.py'
CATALOG_DIR = ROOT / 'modules' / 'new-hsk-course' / 'data' / 'catalog'
APP_PATH = ROOT / 'modules' / 'new-hsk-course' / 'app.js'


def load_builder():
    spec = importlib.util.spec_from_file_location('build_catalog_data', BUILDER_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def normalize_example_text(value):
    value = unicodedata.normalize('NFKC', str(value or '')).lower()
    return re.sub(r'[^a-z0-9\u3400-\u9fff]+', '', value)


def catalog(level):
    return json.loads((CATALOG_DIR / f'hsk{level}.json').read_text(encoding='utf-8'))


def test_catalog_grammar_merges_real_lesson_examples_without_duplicates():
    hsk1 = catalog(1)
    item = next(row for row in hsk1['grammar'] if row['id'] == 'hsk1_new_3')

    # Existing NP+ examples stay first; lesson-source examples are appended.
    assert [row['chinese'] for row in item['examples'][:2]] == ['我的中文老师', '她的中文老师']
    assert '白家月的中文老师' in [row['chinese'] for row in item['examples']]
    assert '我老师' in [row['chinese'] for row in item['examples']]
    assert '老师，您好！' in [row['chinese'] for row in item['examples']]
    assert len(item['examples']) == 11

    keys = [normalize_example_text(row['chinese']) for row in item['examples']]
    assert len(keys) == len(set(keys))
    assert item['exampleMerge']['catalogCount'] == 2
    assert item['exampleMerge']['lessonAddedCount'] == 9
    assert item['exampleMerge']['sourceRefs'] == ['nhsk-1-03-content-04']


def test_all_hsk1_3_catalogs_are_builder_output_and_keep_merge_traceability():
    builder = load_builder()
    expected_totals = {
        1: {'items': 40, 'matched': 38, 'unmatched': 2, 'added': 131},
        2: {'items': 45, 'matched': 45, 'unmatched': 0, 'added': 49},
        3: {'items': 63, 'matched': 61, 'unmatched': 2, 'added': 84},
    }

    for level, expected in expected_totals.items():
        current = catalog(level)
        rebuilt = builder.build_grammar(level)
        assert current['grammar'] == rebuilt
        assert len(rebuilt) == expected['items']

        source = builder.read_json(builder.GRAMMAR_DIR / f'new_hsk_{level}.json')
        source_by_id = {str(row.get('id') or ''): builder.normalize_grammar(row) for row in source.get('items', [])}
        for row in rebuilt:
            original = source_by_id[row['id']]['examples']
            assert row['examples'][:len(original)] == original, row['id']
            assert row['exampleMerge']['catalogCount'] == len(original)

        matched = [row for row in rebuilt if row.get('exampleMerge', {}).get('sourceRefs')]
        unmatched = [row for row in rebuilt if not row.get('exampleMerge', {}).get('sourceRefs')]
        added = sum(row.get('exampleMerge', {}).get('lessonAddedCount', 0) for row in rebuilt)
        assert len(matched) == expected['matched']
        assert len(unmatched) == expected['unmatched']
        assert added == expected['added']

        for row in rebuilt:
            keys = [normalize_example_text(example['chinese']) for example in row.get('examples', [])]
            assert all(keys)
            assert len(keys) == len(set(keys)), row['id']


def test_flashcard_grammar_rows_use_merged_catalog_examples():
    app = APP_PATH.read_text(encoding='utf-8')
    assert 'function catalogGrammarRows()' in app
    assert "source: 'grammar'" in app
    assert "kind: 'grammar'" in app
    assert "examples: (item.examples || []).map" in app
    assert "hanzi: example.chinese" in app
    assert "meaning: example.vietnamese" in app
    assert "if (id === 'grammar') return grammarRows().length;" in app

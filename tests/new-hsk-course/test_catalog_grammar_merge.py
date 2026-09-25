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

def test_lesson_practice_identity_only_uses_unique_exact_example_overlap():
    expected_counts = {1: 21, 2: 44, 3: 57}
    denied = {
        'hsk1_new_2','hsk1_new_3','hsk1_new_4','hsk1_new_10','hsk1_new_15','hsk1_new_16','hsk1_new_19','hsk1_new_20','hsk1_new_21','hsk1_new_23','hsk1_new_24','hsk1_new_25','hsk1_new_28','hsk1_new_32','hsk1_new_34','hsk1_new_38','hsk1_new_39',
        'hsk2_new_2','hsk3_new_33','hsk3_new_36','hsk3_new_47','hsk3_new_56',
    }
    catalog_only = {'hsk1_new_6','hsk1_new_8','hsk3_new_23','hsk3_new_27'}
    seen_refs = set()
    total = 0

    builder = load_builder()
    for level, expected_count in expected_counts.items():
        rebuilt = builder.build_grammar(level)
        identified = [row for row in rebuilt if row.get('lessonPracticeIdentity')]
        assert len(identified) == expected_count
        for row in rebuilt:
            identity = row.get('lessonPracticeIdentity')
            if row['id'] in denied or row['id'] in catalog_only:
                assert identity is None, row['id']
                continue
            assert identity, row['id']
            assert identity['provenance'] == 'unique-exact-example-overlap'
            assert identity['overlapCount'] > 0
            assert identity['sourceRef'] not in seen_refs
            seen_refs.add(identity['sourceRef'])
            total += 1

    assert total == 122
    assert len(denied) == 22
    assert len(catalog_only) == 4

    hsk1 = builder.build_grammar(1)
    fallback = next(row for row in hsk1 if row['id'] == 'hsk1_new_3')
    ambiguous = next(row for row in hsk1 if row['id'] == 'hsk1_new_32')
    assert fallback['exampleMerge']['sourceRefs'] == ['nhsk-1-03-content-04']
    assert 'lessonPracticeIdentity' not in fallback
    assert ambiguous['exampleMerge']['sourceRefs'] == ['nhsk-1-12-content-05']
    assert 'lessonPracticeIdentity' not in ambiguous

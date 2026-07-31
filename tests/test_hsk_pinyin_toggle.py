from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_hsk_curriculum_pinyin_toggle_is_shared_and_persistent():
    js = read('modules/hanzi-stroke/app.js')
    assert "hanziStroke.hskShowPinyin.v1" in js
    assert "['hsk', 'new_hsk', 'yct', 'boya']" in js
    assert "data-hsk-toggle-pinyin" in js
    assert "applyHskPinyinVisibility();" in js
    assert "renderHskList();" not in js[js.index("const pinyinButton = event.target.closest('[data-hsk-toggle-pinyin]')"):js.index("const viewButton = event.target.closest('[data-hsk-vocab-view]')")]


def test_hsk_vocab_pinyin_nodes_remain_in_dom():
    js = read('modules/hanzi-stroke/app.js')
    assert 'class="hsk-pinyin" data-pinyin' in js
    css = read('modules/hanzi-stroke/style.css')
    assert '.hsk-list.is-pinyin-hidden [data-pinyin]' in css


def test_shared_css_toggle_component_is_used_by_hsk_and_ldsn():
    shared = read('modules/shared/ui-components.css')
    hsk = read('modules/hanzi-stroke/app.js')
    ldsn = read('modules/ldsn14/app.js')
    assert '.ui-pinyin-toggle__mark' in shared
    assert 'ui-pinyin-toggle__mark' in hsk
    assert 'ui-pinyin-toggle__mark' in ldsn


def test_hsk_toolbar_has_three_mobile_controls():
    css = read('modules/hanzi-stroke/style.css')
    assert 'grid-template-columns:repeat(3, 34px)' in css
    assert 'grid-template-columns:repeat(3, 32px)' in css
    assert 'grid-template-columns:repeat(3, 30px)' in css

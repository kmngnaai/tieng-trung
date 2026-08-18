#!/usr/bin/env python3
from pathlib import Path
import json
import shutil
from urllib.parse import unquote, urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
MIMES = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.csv': 'text/csv', '.txt': 'text/plain'
}
SESSION_KEY = 'hanziStroke.hskFlashcardActiveSession.v1'


def find_browser():
    return (
        shutil.which('chromium')
        or shutil.which('chromium-browser')
        or shutil.which('google-chrome')
        or shutil.which('chrome')
    )


def route_local(route):
    parsed = urlparse(route.request.url)
    if parsed.netloc != 'app.test':
        route.abort()
        return
    file_path = ROOT / unquote(parsed.path.lstrip('/'))
    if file_path.is_dir():
        file_path = file_path / 'index.html'
    if not file_path.is_file():
        route.fulfill(status=404, body=b'not found')
        return
    route.fulfill(
        status=200,
        body=file_path.read_bytes(),
        content_type=MIMES.get(file_path.suffix.lower(), 'application/octet-stream'),
    )


def make_session(word, pinyin, meaning='Kiểm thử'):
    card = {
        'id': f'test-{abs(hash((word, pinyin)))}',
        'word': word,
        'pinyin': pinyin,
        'meaningVi': meaning,
        'cardType': 'sentence' if len(word) > 4 else 'vocabulary',
        'title': '',
        'grammar': None,
        'structureUrl': '',
        'structurePracticeUrl': '',
        'tokens': [],
        'sourceWord': '',
        'characterData': [],
        'wordGlossary': [],
    }
    return {
        'version': 1,
        'phase': 'study',
        'title': 'Typing alignment regression',
        'cards': [card],
        'settings': {
            'mode': 'typing',
            'showPinyin': True,
            'tapHanziSpeak': False,
            'autoPlay': False,
            'shuffle': False,
            'showStroke': False,
            'typingPromptType': 'hanzi-to-pinyin',
            'typingAutoAdvanceEnabled': False,
            'typingAutoAdvanceMode': 'default',
            'typingAutoAdvanceSeconds': 3,
            'sentenceOrderingAutoAdvanceEnabled': True,
            'sentenceOrderingAutoAdvanceSeconds': 1.2,
            'sentenceOrderingDisplayCount': 1,
            'sentenceOrderingVocabularyList': False,
            'radicalSortDisplayMode': 'hanzi',
            'radicalSortMeaningList': False,
        },
        'index': 0,
        'flipped': False,
        'ratings': {},
        'mixedTypes': [],
        'origin': 'library',
        'contextKey': 'typing-alignment-regression',
        'contextLabel': 'Typing alignment regression',
        'returnUrl': '',
        'typingPromptTypes': ['hanzi-to-pinyin'],
        'typing': None,
        'matching': None,
        'sentenceOrdering': None,
        'radicalSort': None,
    }


def open_case(page, word, pinyin):
    payload = json.dumps(make_session(word, pinyin), ensure_ascii=False)
    storage = json.dumps({SESSION_KEY: payload}, ensure_ascii=False)
    boot = f"""<script>
      (() => {{
        const values = {storage};
        Object.defineProperty(window, 'localStorage', {{
          configurable: true,
          value: {{
            getItem(key) {{ return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; }},
            setItem(key, value) {{ values[key] = String(value); }},
            removeItem(key) {{ delete values[key]; }}
          }}
        }});
        const NativeURLSearchParams = window.URLSearchParams;
        window.URLSearchParams = class extends NativeURLSearchParams {{
          constructor(arg) {{
            super(arg === window.location.search ? 'study=flashcards&resume=flashcard' : arg);
          }}
        }};
      }})();
    </script>"""
    html = (ROOT / 'modules/hanzi-stroke/index.html').read_text('utf-8')
    html = html.replace('<head>', '<head><base href="https://app.test/modules/hanzi-stroke/">' + boot, 1)
    page.set_content(html, wait_until='domcontentloaded')
    page.wait_for_selector('#hskFlashcardOverlay:not([hidden])', timeout=15000)
    page.wait_for_selector('[data-hsk-flashcard-typing-input]', timeout=15000)


def current_prompt_text(page):
    current = page.locator('.hsk-flashcard-typing-prompt-char.is-current')
    return ''.join(current.all_text_contents())


def assert_alignment_case(browser, word, pinyin, expected):
    context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    page = context.new_page()
    page.set_default_timeout(15000)
    page.route('**/*', route_local)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    open_case(page, word, pinyin)
    input_box = page.locator('[data-hsk-flashcard-typing-input]')

    for display, answer in expected:
        actual = current_prompt_text(page)
        assert actual == display, f'{word}: expected current {display!r}, got {actual!r}'
        input_box.fill(answer)
        page.wait_for_timeout(30)

    assert page.locator('[data-hsk-flashcard-typing-complete]:not([hidden])').count() == 1, word
    assert not errors, errors
    context.close()


def assert_scroll_stable(browser):
    context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    page = context.new_page()
    page.set_default_timeout(15000)
    page.route('**/*', route_local)
    open_case(page, 'AI小语，你好！', 'AI Xiǎoyǔ, nǐ hǎo!')
    page.evaluate("""() => {
      const study = document.querySelector('.hsk-flashcard-study');
      const spacer = document.createElement('div');
      spacer.setAttribute('data-test-scroll-spacer', '');
      spacer.style.height = '500px';
      study.insertBefore(spacer, study.firstChild);
      study.scrollTop = 300;
    }""")
    before = page.evaluate("""() => ({
      windowY: window.scrollY,
      studyY: document.querySelector('.hsk-flashcard-study').scrollTop
    })""")
    page.locator('[data-hsk-flashcard-typing-input]').fill('a')
    page.wait_for_timeout(80)
    after_type = page.evaluate("""() => ({
      windowY: window.scrollY,
      studyY: document.querySelector('.hsk-flashcard-study').scrollTop
    })""")
    assert abs(after_type['windowY'] - before['windowY']) <= 1, (before, after_type)
    assert abs(after_type['studyY'] - before['studyY']) <= 1, (before, after_type)

    page.locator('[data-hsk-flashcard-typing-reveal]').click(force=True)
    page.wait_for_timeout(80)
    after_reveal = page.evaluate("""() => ({
      windowY: window.scrollY,
      studyY: document.querySelector('.hsk-flashcard-study').scrollTop
    })""")
    assert abs(after_reveal['windowY'] - before['windowY']) <= 1, (before, after_reveal)
    assert abs(after_reveal['studyY'] - before['studyY']) <= 1, (before, after_reveal)
    context.close()


def main():
    executable = find_browser()
    if not executable:
        raise SystemExit('Không tìm thấy Chromium/Chrome trong PATH.')

    cases = [
        ('AI小语，你好！', 'AI Xiǎoyǔ, nǐ hǎo!', [('AI', 'ai'), ('小', 'xiao'), ('语', 'yu'), ('你', 'ni'), ('好', 'hao')]),
        ('大家好！', 'Dàjiā hǎo!', [('大', 'da'), ('家', 'jia'), ('好', 'hao')]),
        ('西安', "Xī'ān", [('西', 'xi'), ('安', 'an')]),
        ('饥饿', "jī'è", [('饥', 'ji'), ('饿', 'e')]),
        ('哪儿', 'nǎr', [('哪儿', 'nar')]),
        ('有点儿', 'yǒu diǎnr', [('有', 'you'), ('点儿', 'dianr')]),
        ('卡拉OK', 'kǎ*lā*<OK>', [('卡', 'ka'), ('拉', 'la'), ('OK', 'ok')]),
        ('T恤', '<tì>xù', [('T', 'ti'), ('恤', 'xu')]),
        ('人均GDP', 'rénjūn GDP', [('人', 'ren'), ('均', 'jun'), ('GDP', 'gdp')]),
        ('用手机App就能买。', 'Yòng shǒujī App jiù néng mǎi.', [('用', 'yong'), ('手', 'shou'), ('机', 'ji'), ('App', 'app'), ('就', 'jiu'), ('能', 'neng'), ('买', 'mai')]),
        ('N95口罩', 'N95 kǒuzhào', [('N95', 'n95'), ('口', 'kou'), ('罩', 'zhao')]),
        ('2025年', '2 0 2 5 nián', [('2', '2'), ('0', '0'), ('2', '2'), ('5', '5'), ('年', 'nian')]),
        ('480', 'sìbǎi bāshí', [('480', 'sibaibashi')]),
    ]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=executable, args=['--no-sandbox', '--disable-gpu'])
        for word, pinyin, expected in cases:
            assert_alignment_case(browser, word, pinyin, expected)
        assert_scroll_stable(browser)
        browser.close()

    print('PASS: flashcard typing token alignment covers mixed Latin/Hanzi, codes/numbers, pinyin boundaries, erhua, and stable mobile scroll')


if __name__ == '__main__':
    main()

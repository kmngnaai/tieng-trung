#!/usr/bin/env python3
from pathlib import Path
from urllib.parse import unquote, urlparse

from playwright.sync_api import sync_playwright

from browser_runtime import click_centered, require_browser_executable, replace_location_search

ROOT = Path(__file__).resolve().parents[1]
MIMES = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg'
}
GRAMMAR_ID = 'hsk1_new_3'
LESSON = 3
EXAMPLE_COUNT = 11


def capture_flashcard_payload(source):
    marker = "sessionStorage.setItem(HSK_EXTERNAL_FLASHCARD_KEY, JSON.stringify(payload));"
    start = source.find(marker)
    if start < 0:
        raise AssertionError('Flashcard payload marker not found')
    target = "location.href = target.href;"
    href_index = source.find(target, start)
    if href_index < 0:
        raise AssertionError('Flashcard navigation marker not found')
    source = source[:start] + 'window.__nhskFlashcardPayload = payload;' + source[start + len(marker):]
    href_index = source.find(target, start)
    return source[:href_index] + 'void target.href;' + source[href_index + len(target):]


def local_route(query):
    def handler(route):
        parsed = urlparse(route.request.url)
        if parsed.netloc != 'app.test':
            route.abort()
            return
        file_path = ROOT / unquote(parsed.path.lstrip('/'))
        if not file_path.is_file():
            route.fulfill(status=404, body=b'not found')
            return
        body = file_path.read_bytes()
        if file_path.as_posix().endswith('/modules/new-hsk-course/app.js'):
            source = replace_location_search(body.decode('utf-8'), query)
            body = capture_flashcard_payload(source).encode('utf-8')
        route.fulfill(status=200, body=body, content_type=MIMES.get(file_path.suffix.lower(), 'application/octet-stream'))
    return handler


def load_page(page, query, selector):
    page.route('**/*', local_route(query))
    html = (ROOT / 'modules/new-hsk-course/index.html').read_text(encoding='utf-8')
    html = html.replace('<head>', '<head><base href="https://app.test/modules/new-hsk-course/">', 1)
    page.set_content(html, wait_until='networkidle')
    page.wait_for_selector(selector)


def assert_three_then_all(page):
    cards = page.locator('.hsk-grammar-example-card')
    assert cards.count() == EXAMPLE_COUNT, cards.count()
    assert cards.nth(0).locator('strong').inner_text() == '我的中文老师'
    assert cards.nth(1).locator('strong').inner_text() == '她的中文老师'
    all_text = '\n'.join(cards.all_inner_texts())
    assert '白家月的中文老师' in all_text
    assert '我老师' in all_text
    assert '老师，您好！' in all_text
    assert page.locator('.hsk-grammar-example-card:visible').count() == 3
    more = page.locator('[data-nhsk-grammar-examples-more]')
    assert more.count() == 1
    assert f'Xem thêm {EXAMPLE_COUNT - 3}' in more.inner_text()
    more.click()
    assert page.locator('.hsk-grammar-example-card:visible').count() == EXAMPLE_COUNT
    assert not more.is_visible()


def assert_flashcard_uses_merged_grammar(page):
    load_page(page, f'?level=1&lesson={LESSON}&view=practice&practice=flashcards', '.nhsk-practice-source-box')
    for source_id in ['vocabulary', 'properNouns', 'sentences', 'dialogues', 'passages']:
        button = page.locator(f'[data-nhsk-practice-source="{source_id}"]')
        if button.count() and 'is-active' in (button.get_attribute('class') or ''):
            click_centered(button)
    grammar_button = page.locator('[data-nhsk-practice-source="grammar"]')
    assert '3' in grammar_button.inner_text(), grammar_button.inner_text()
    start = page.locator('[data-nhsk-start-practice]')
    assert 'Bắt đầu · 3 mục' in start.inner_text(), start.inner_text()
    click_centered(start)
    page.wait_for_function('() => Boolean(window.__nhskFlashcardPayload)')
    payload = page.evaluate('window.__nhskFlashcardPayload')
    target = next(card for card in payload['cards'] if card.get('title') == 'Trợ từ kết cấu 的')
    examples = target['grammar']['examples']
    assert len(examples) == EXAMPLE_COUNT, len(examples)
    assert [row['hanzi'] for row in examples[:2]] == ['我的中文老师', '她的中文老师']
    assert '白家月的中文老师' in [row['hanzi'] for row in examples]
    assert '我老师' in [row['hanzi'] for row in examples]


def main():
    executable = require_browser_executable()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=executable, args=['--no-sandbox', '--disable-gpu'])
        context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)

        # Catalog grammar popup uses real merged catalog data; no synthetic fixture.
        page = context.new_page()
        page.set_default_timeout(12000)
        load_page(page, f'?level=1&lesson={LESSON}&catalog=grammar&grammar={GRAMMAR_ID}', '#nhskGrammarPopup:not([hidden])')
        assert_three_then_all(page)
        page.close()

        # NP+ uses the same real merged item and popup contract.
        page = context.new_page()
        page.set_default_timeout(12000)
        load_page(page, f'?level=1&lesson={LESSON}&view=grouped&filter=grammarPlus&grammarPlus={GRAMMAR_ID}', '#nhskGrammarPopup:not([hidden])')
        assert 'Quay về NP+' in page.locator('.hsk-popup-topbar').inner_text()
        assert_three_then_all(page)
        page.close()

        # The merged catalog grammar is also the grammar source sent to Flashcards.
        page = context.new_page()
        page.set_default_timeout(12000)
        assert_flashcard_uses_merged_grammar(page)
        page.close()

        context.close()
        browser.close()

    print('PASS: real HSK1 Bài 3 的 merges NP+/lesson examples, expands 3→all in Catalog/NP+, and sends all 11 examples to Flashcards')


if __name__ == '__main__':
    main()

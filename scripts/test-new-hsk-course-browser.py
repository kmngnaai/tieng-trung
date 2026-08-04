#!/usr/bin/env python3
from pathlib import Path
from urllib.parse import urlparse, unquote
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-output' / 'new-hsk-course-hsk1-lesson1'
OUT.mkdir(parents=True, exist_ok=True)
MIMES = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg',
}


def local_route(query):
    def handler(route):
        parsed = urlparse(route.request.url)
        if parsed.netloc != 'app.test':
            route.abort(); return
        file_path = ROOT / unquote(parsed.path.lstrip('/'))
        if not file_path.is_file():
            route.fulfill(status=404, body=b'not found'); return
        body = file_path.read_bytes()
        if file_path.as_posix().endswith('/modules/new-hsk-course/app.js'):
            source = body.decode('utf-8').replace(
                'const params = new URLSearchParams(window.location.search);',
                f'const params = new URLSearchParams({query!r});'
            )
            body = source.encode('utf-8')
        route.fulfill(status=200, body=body, content_type=MIMES.get(file_path.suffix.lower(), 'application/octet-stream'))
    return handler


def load(page, query='?level=1&lesson=1&view=book'):
    page.route('**/*', local_route(query))
    html = (ROOT / 'modules/new-hsk-course/index.html').read_text(encoding='utf-8')
    html = html.replace('<head>', '<head><base href="https://app.test/modules/new-hsk-course/">', 1)
    page.set_content(html, wait_until='networkidle')
    page.wait_for_selector('.nhsk-hero')


def assert_no_overflow(page):
    size = page.evaluate('''() => ({scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth})''')
    assert size['scrollWidth'] <= size['clientWidth'] + 1, size


def mobile_test(browser):
    context = browser.new_context(viewport={'width': 430, 'height': 932}, is_mobile=True, has_touch=True)
    page = context.new_page(); page.set_default_timeout(12000)
    load(page)
    assert page.locator('.nhsk-card').count() >= 6
    assert page.locator('.nhsk-dialogue').count() == 3
    assert page.locator('text=Lượt 1').count() == 0
    assert page.locator('.nhsk-vocab-item').count() == 13
    assert_no_overflow(page)
    page.screenshot(path=str(OUT / 'book-mobile.png'), full_page=True)

    page.locator('[data-nhsk-view="grouped"]').click()
    page.wait_for_selector('.nhsk-filters')
    assert page.locator('.nhsk-dialogue').count() == 3
    page.locator('[data-nhsk-filter="dialogues"]').click()
    assert page.locator('.nhsk-dialogue').count() == 3
    assert page.locator('.nhsk-vocab-item').count() == 0
    page.screenshot(path=str(OUT / 'grouped-dialogues-mobile.png'), full_page=True)

    pinyin_toggle = page.locator('[data-nhsk-layer-scope="dialogue"][data-nhsk-layer="pinyin"]').first
    pinyin_toggle.click()
    assert pinyin_toggle.get_attribute('aria-pressed') == 'false'
    assert page.locator('.nhsk-dialogue-line--pinyin').count() == 0
    context.close()


def desktop_test(browser):
    context = browser.new_context(viewport={'width': 1280, 'height': 900})
    page = context.new_page(); page.set_default_timeout(12000)
    load(page, '?level=1&lesson=1&view=grouped&filter=vocabulary')
    assert page.locator('.nhsk-vocab-item').count() == 12
    assert_no_overflow(page)
    width = page.locator('.nhsk-page').evaluate('el => el.getBoundingClientRect().width')
    assert width <= 762, width
    page.screenshot(path=str(OUT / 'grouped-vocabulary-desktop.png'), full_page=True)
    context.close()



def practice_mobile_test(browser):
    context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    page = context.new_page(); page.set_default_timeout(12000)
    page_errors = []
    page.on('pageerror', lambda error: page_errors.append(str(error)))
    load(page, '?level=1&lesson=1&view=practice')

    # Compact radical practice, including radical-first then character selection.
    page.locator('[data-nhsk-practice="characters"]').click(force=True)
    page.locator('[data-nhsk-character-mode="sort"]').click(force=True)
    page.locator('[data-nhsk-start-practice]').click(force=True)
    page.wait_for_selector('[data-radical-item]')
    assert page.locator('[data-radical-item]').count() == 6
    assert page.locator('[data-radical-group-select]').count() == 3
    person_group = page.locator('[data-radical-group-select="nhsk-1-01-radical-group-nhan"]')
    person_group.click(force=True)
    page.locator('[data-radical-item="nhsk-1-01-radical-item-001"]').click(force=True)
    page.wait_for_timeout(60)
    assert 'Đúng' in page.locator('.nhsk-radical-feedback').inner_text()
    assert page.locator('[data-radical-item]').count() == 5
    page.screenshot(path=str(OUT / 'practice-radical-sort-mobile.png'), full_page=True)

    # One compact sentence at a time, automatic checking and rating.
    page.locator('[data-nhsk-practice="ordering"]').click(force=True)
    page.locator('[data-nhsk-start-practice]').click(force=True)
    page.wait_for_selector('[data-nhsk-order-exercise]')
    assert page.locator('[data-nhsk-order-exercise]').count() == 1
    assert page.locator('[data-nhsk-check-order]').count() == 0
    for token in ('AI小语', '你好'):
        page.locator(f'[data-token-zone="bank"][data-token="{token}"]').click(force=True)
    page.wait_for_timeout(60)
    assert 'Đúng:' in page.locator('[data-nhsk-feedback]').inner_text()
    assert page.locator('[data-nhsk-order-next]').count() == 1
    page.screenshot(path=str(OUT / 'practice-ordering-correct-mobile.png'), full_page=True)

    # Listening typing starts with all hints hidden.
    page.locator('[data-nhsk-practice="typing"]').click(force=True)
    page.locator('[data-nhsk-typing-mode="listen"]').click(force=True)
    hint_toggles = page.locator('[data-nhsk-practice-layer-activity="typingListen"]')
    assert hint_toggles.count() == 3
    assert all(toggle.get_attribute('aria-pressed') == 'false' for toggle in hint_toggles.all())
    page.locator('[data-nhsk-start-practice]').click(force=True)
    page.wait_for_selector('[data-nhsk-typing-card]')
    first_typing = page.locator('[data-nhsk-typing-card]').first.inner_text()
    assert 'AI小语' not in first_typing and 'AI Xiǎoyǔ' not in first_typing and 'Xin chào' not in first_typing
    page.screenshot(path=str(OUT / 'practice-listen-type-hidden-mobile.png'), full_page=True)

    # Character cards use concise components and direct writing links.
    character_context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    character_page = character_context.new_page(); character_page.set_default_timeout(12000)
    character_errors = []
    character_page.on('pageerror', lambda error: character_errors.append(str(error)))
    load(character_page, '?level=1&lesson=1&view=practice')
    character_page.locator('[data-nhsk-practice="characters"]').click(force=True)
    character_page.locator('[data-nhsk-character-mode="learn"]').click(force=True)
    character_page.wait_for_selector('[data-nhsk-start-practice]')
    character_page.locator('[data-nhsk-start-practice]').click(force=True)
    character_page.wait_for_selector('[data-character-id="nhsk-char-4f60"]')
    ni_card = character_page.locator('[data-character-id="nhsk-char-4f60"]')
    ni_text = ni_card.inner_text()
    assert '亻 — Nhân' in ni_text and '尔 — Nhĩ' in ni_text
    assert 'thành phần cấu tạo' not in ni_text
    writing_href = ni_card.locator('a.nhsk-practice-link').get_attribute('href')
    assert 'study=lookup' in writing_href and 'chars=%E4%BD%A0' in writing_href
    character_page.screenshot(path=str(OUT / 'practice-character-learn-mobile.png'), full_page=True)

    assert_no_overflow(page)
    assert_no_overflow(character_page)
    assert not page_errors, page_errors
    assert not character_errors, character_errors
    character_context.close()
    context.close()

def main():
    executable = shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome')
    if not executable:
        raise SystemExit('Không tìm thấy Chromium/Chrome trong PATH.')
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, executable_path=executable, args=['--no-sandbox', '--disable-gpu'])
        mobile_test(browser)
        practice_mobile_test(browser)
        desktop_test(browser)
        browser.close()
    print('PASS: New HSK Course HSK 1 Bài 1 browser checks')


if __name__ == '__main__':
    main()

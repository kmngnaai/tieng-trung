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

    page.locator('[data-nhsk-pinyin]').click()
    hidden = page.locator('#newHskCourseApp').evaluate("el => el.classList.contains('is-pinyin-hidden')")
    assert hidden is True
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


def main():
    executable = shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome')
    if not executable:
        raise SystemExit('Không tìm thấy Chromium/Chrome trong PATH.')
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, executable_path=executable, args=['--no-sandbox', '--disable-gpu'])
        mobile_test(browser)
        desktop_test(browser)
        browser.close()
    print('PASS: New HSK Course HSK 1 Bài 1 browser checks')


if __name__ == '__main__':
    main()

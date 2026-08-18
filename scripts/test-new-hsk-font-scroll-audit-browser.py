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


def local_route(query):
    def handler(route):
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
        body = file_path.read_bytes()
        if file_path.as_posix().endswith('/modules/new-hsk-course/app.js'):
            body = replace_location_search(body.decode('utf-8'), query).encode('utf-8')
        route.fulfill(status=200, body=body, content_type=MIMES.get(file_path.suffix.lower(), 'application/octet-stream'))
    return handler


def load_new_hsk(page, query):
    page.route('**/*', local_route(query))
    html = (ROOT / 'modules/new-hsk-course/index.html').read_text(encoding='utf-8')
    html = html.replace('<head>', '<head><base href="https://app.test/modules/new-hsk-course/">', 1)
    page.set_content(html, wait_until='networkidle')
    page.wait_for_selector('.nhsk-hero')


def assert_scroll_stable(page, locator, action=None, tolerance=2):
    locator.scroll_into_view_if_needed()
    page.evaluate('window.scrollBy(0, 90)')
    before = page.evaluate('window.scrollY')
    if action:
        action(locator)
    else:
        locator.click()
    page.wait_for_timeout(100)
    after = page.evaluate('window.scrollY')
    assert abs(after - before) <= tolerance, f'scroll changed unexpectedly: {before} -> {after}'


def main():
    # All three learning surfaces explicitly load the same shared Han serif contract.
    for relative in ('modules/new-hsk-course/index.html', 'modules/ldsn14/index.html', 'modules/hanzi-stroke/index.html'):
        html = (ROOT / relative).read_text(encoding='utf-8')
        assert 'font-han-serif.css' in html, relative

    executable = require_browser_executable()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=executable, args=['--no-sandbox', '--disable-gpu'])
        context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)

        # Book: representative Han text uses the shared serif family and same-screen controls do not jump viewport.
        page = context.new_page()
        page.set_default_timeout(12000)
        load_new_hsk(page, '?level=1&lesson=1&view=book')
        root_font = page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--ui-font-han').trim()")
        assert 'Songti SC' in root_font and 'Noto Serif SC' in root_font, root_font
        vocab = page.locator('.nhsk-vocab-item__word').first
        vocab_font = vocab.evaluate("el => ({family:getComputedStyle(el).fontFamily, weight:getComputedStyle(el).fontWeight})")
        assert 'Songti SC' in vocab_font['family'] or 'Noto Serif SC' in vocab_font['family'], vocab_font
        assert vocab_font['weight'] == '400', vocab_font

        assert_scroll_stable(page, page.locator('[data-nhsk-vocab-pinyin]').first)
        assert_scroll_stable(page, page.locator('[data-nhsk-layer-scope="dialogue"][data-nhsk-layer="pinyin"]').first)
        page.close()

        # Grouped vocabulary List/Grid is also an in-place display choice.
        page = context.new_page()
        page.set_default_timeout(12000)
        load_new_hsk(page, '?level=1&lesson=1&view=grouped&filter=vocabulary')
        assert_scroll_stable(page, page.locator('[data-nhsk-vocab-view="grid"]').first)
        page.close()

        # Practice setup: selecting items/settings is an in-place interaction and should keep scroll position.
        page = context.new_page()
        page.set_default_timeout(12000)
        load_new_hsk(page, '?level=1&lesson=1&view=practice')
        click_centered(page.locator('[data-nhsk-practice="ordering"]'))
        source_chip = page.locator('[data-nhsk-practice-source]').nth(1)
        assert_scroll_stable(page, source_chip)
        display_count = page.locator('[data-nhsk-practice-setting="ordering-display-count"]')
        assert_scroll_stable(page, display_count, lambda node: node.select_option('3'))

        # Ordering token font is the same shared Han family; click/drag scroll have dedicated regressions too.
        click_centered(page.locator('[data-nhsk-start-practice]'))
        page.wait_for_selector('[data-nhsk-order-token]')
        order_font = page.locator('[data-nhsk-order-token]').first.evaluate("el => ({family:getComputedStyle(el).fontFamily, weight:getComputedStyle(el).fontWeight})")
        assert order_font['family'] == vocab_font['family'], (vocab_font, order_font)
        assert order_font['weight'] == '400', order_font
        page.close()

        # Radical sort uses a full rerender after a tap; it must still preserve the active viewport.
        page = context.new_page()
        page.set_default_timeout(12000)
        load_new_hsk(page, '?level=1&lesson=1&view=practice')
        click_centered(page.locator('[data-nhsk-practice="characters"]'))
        click_centered(page.locator('[data-nhsk-character-mode="sort"]'))
        click_centered(page.locator('[data-nhsk-start-practice]'))
        page.wait_for_selector('[data-radical-item]')
        assert_scroll_stable(page, page.locator('[data-radical-item]').first)
        page.close()

        context.close()
        browser.close()

    print('PASS: New 3.0 Han font matches the shared LDSN/HSK serif contract and audited in-place mobile interactions keep scroll position')


if __name__ == '__main__':
    main()

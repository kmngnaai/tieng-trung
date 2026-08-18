#!/usr/bin/env python3
from pathlib import Path
from urllib.parse import unquote, urlparse
import os

from playwright.sync_api import sync_playwright

from browser_runtime import require_browser_executable, replace_location_search

ROOT = Path(__file__).resolve().parents[1]
MIMES = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.woff2': 'font/woff2', '.mp3': 'audio/mpeg'
}
TOPIC_ID = 'new_hsk__1__topic__1__dat-cau-hoi-va-do-luong-tu-ngu'



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


def load(page, query):
    page.route('**/*', local_route(query))
    html = (ROOT / 'modules/new-hsk-course/index.html').read_text(encoding='utf-8')
    html = html.replace('<head>', '<head><base href="https://app.test/modules/new-hsk-course/">', 1)
    page.set_content(html, wait_until='networkidle')
    page.wait_for_selector('.nhsk-hero')


def post_parent_message(page, message_type, word=''):
    page.evaluate("""payload => {
      window.postMessage({ type: payload.type, word: payload.word || '' }, '*');
    }""", {'type': message_type, 'word': word})
    page.wait_for_timeout(120)


def assert_preview_stays_after_ready(page, word):
    post_parent_message(page, 'tiengtrung:hsk-popup-ready', word)
    preview = page.locator('#nhskSharedWordPreview')
    frame = page.locator('#nhskSharedWordDetailFrame')
    assert preview.is_visible(), 'Preview auto-hidden after deep-detail ready signal'
    assert not frame.is_visible(), 'Deep detail auto-opened without Chi tiết click'
    detail = page.locator('[data-word-popup-detail]')
    assert detail.count() == 1, 'Missing explicit Chi tiết button'
    assert not detail.is_disabled(), 'Chi tiết should be available for a ready lesson word'


def roundtrip_detail(page, word, source_scroll_y):
    preview = page.locator('#nhskSharedWordPreview')
    page.evaluate("""() => {
      const preview = document.querySelector('#nhskSharedWordPreview');
      const spacer = document.createElement('div');
      spacer.dataset.testScrollSpacer = '1';
      spacer.style.height = '900px';
      preview.appendChild(spacer);
      preview.scrollTop = 173;
    }""")
    preview_scroll = page.evaluate("document.querySelector('#nhskSharedWordPreview').scrollTop")
    assert preview_scroll > 100, preview_scroll

    page.locator('[data-word-popup-detail]').evaluate('el => el.click()')
    post_parent_message(page, 'tiengtrung:hsk-popup-ready', word)
    assert page.locator('#nhskSharedWordDetailFrame').is_visible(), 'Detail did not open after explicit request'
    assert not preview.is_visible(), 'Preview should be hidden while deep detail is active'

    post_parent_message(page, 'tiengtrung:hsk-popup-back')
    assert preview.is_visible(), 'Back from root detail did not restore Preview'
    assert not page.locator('#nhskSharedWordDetailFrame').is_visible(), 'Back should hide deep detail frame'
    assert page.locator('.nhsk-word-preview-hero h2').inner_text().strip() == word
    restored = page.evaluate("document.querySelector('#nhskSharedWordPreview').scrollTop")
    assert abs(restored - preview_scroll) <= 2, f'Preview scroll changed: {preview_scroll} -> {restored}'
    current_scroll = page.evaluate('window.scrollY')
    assert abs(current_scroll - source_scroll_y) <= 2, f'Page scroll changed during Preview/Detail roundtrip: {source_scroll_y} -> {current_scroll}'

    page.locator('[data-word-popup-detail]').evaluate('el => el.click()')
    post_parent_message(page, 'tiengtrung:hsk-popup-ready', word)
    post_parent_message(page, 'tiengtrung:hsk-popup-close')
    assert page.locator('#nhskSharedWordDetail').is_hidden(), 'Close should exit the whole overlay'
    after_close = page.evaluate('window.scrollY')
    assert abs(after_close - source_scroll_y) <= 3, f'Close changed source scroll: {source_scroll_y} -> {after_close}'


def run_lesson_vocab(page):
    load(page, '?level=1&lesson=1&view=grouped&filter=vocabulary')
    source = page.locator('[data-open-word-detail]').nth(5)
    source.scroll_into_view_if_needed()
    page.evaluate('window.scrollBy(0, 180)')
    source_scroll_y = page.evaluate('window.scrollY')
    word = source.locator('.nhsk-vocab-item__word').inner_text().strip()
    source.click(force=True)
    page.wait_for_selector('#nhskSharedWordDetail:not([hidden])')
    assert page.locator('.nhsk-word-preview-hero h2').inner_text().strip() == word
    assert_preview_stays_after_ready(page, word)
    roundtrip_detail(page, word, source_scroll_y)


def run_catalog_vocab(page):
    page.unroute('**/*')
    load(page, f'?level=1&lesson=3&catalog=topics&topic={TOPIC_ID}')
    source = page.locator('.nhsk-topic-word').first
    source.scroll_into_view_if_needed()
    source_scroll_y = page.evaluate('window.scrollY')
    word = source.locator('.hsk-word').inner_text().strip()
    source.evaluate('el => el.click()')
    page.wait_for_selector('#nhskSharedWordDetail:not([hidden])')
    # Catalog preview may load related lesson sentences asynchronously.
    page.wait_for_function("document.querySelector('.nhsk-word-preview-hero h2')?.textContent.trim().length > 0")
    page.wait_for_timeout(300)
    post_parent_message(page, 'tiengtrung:hsk-popup-ready', word)
    assert page.locator('#nhskSharedWordPreview').is_visible(), 'Catalog Preview auto-forwarded to deep detail'
    detail = page.locator('[data-word-popup-detail]')
    assert detail.count() == 1, 'Catalog Preview missing Chi tiết button'
    page.wait_for_function("document.querySelector('[data-word-popup-detail]') && !document.querySelector('[data-word-popup-detail]').disabled")
    roundtrip_detail(page, word, source_scroll_y)


def assert_embedded_back_contract():
    source = (ROOT / 'modules/hanzi-stroke/app.js').read_text(encoding='utf-8')
    assert "type: 'tiengtrung:hsk-popup-back'" in source, 'Embedded HSK root Back must notify parent Preview'
    assert "returnContext?.type === 'external'" in source, 'Back message must be limited to external embedded popup context'


def main():
    executable = require_browser_executable()
    if not executable:
        raise SystemExit('Không tìm thấy Chromium/Chrome.')
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=executable, args=['--no-sandbox', '--disable-gpu'])
        context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        page = context.new_page()
        page.set_default_timeout(18000)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        run_lesson_vocab(page)
        run_catalog_vocab(page)
        assert not errors, errors
        assert_embedded_back_contract()
        context.close()
        browser.close()
    print('PASS: New 3.0 word detail stays on Preview until requested; Back preserves Preview/context/scroll; Close exits overlay')


if __name__ == '__main__':
    main()

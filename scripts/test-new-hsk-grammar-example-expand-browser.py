#!/usr/bin/env python3
from pathlib import Path
from urllib.parse import unquote, urlparse
import json

from playwright.sync_api import sync_playwright

from browser_runtime import require_browser_executable, replace_location_search

ROOT = Path(__file__).resolve().parents[1]
MIMES = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg'
}
GRAMMAR_ID = 'hsk1_new_1'
EXAMPLE_COUNT = 7


def expanded_catalog_bytes(path):
    data = json.loads(path.read_text(encoding='utf-8'))
    item = next(row for row in data['grammar'] if row['id'] == GRAMMAR_ID)
    base = list(item.get('examples') or [])
    while len(base) < EXAMPLE_COUNT:
        number = len(base) + 1
        base.append({
            'chinese': f'测试例句{number}',
            'pinyin': f'cèshì lìjù {number}',
            'vietnamese': f'Câu ví dụ kiểm thử {number}'
        })
    item['examples'] = base[:EXAMPLE_COUNT]
    return json.dumps(data, ensure_ascii=False).encode('utf-8')


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
        if file_path.as_posix().endswith('/modules/new-hsk-course/data/catalog/hsk1.json'):
            body = expanded_catalog_bytes(file_path)
        else:
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
    page.wait_for_selector('#nhskGrammarPopup:not([hidden])')


def assert_three_then_all(page):
    cards = page.locator('.hsk-grammar-example-card')
    assert cards.count() == EXAMPLE_COUNT, cards.count()
    assert page.locator('.hsk-grammar-example-card:visible').count() == 3
    more = page.locator('[data-nhsk-grammar-examples-more]')
    assert more.count() == 1
    assert f'Xem thêm {EXAMPLE_COUNT - 3}' in more.inner_text()
    more.click()
    assert page.locator('.hsk-grammar-example-card:visible').count() == EXAMPLE_COUNT
    assert not more.is_visible()


def main():
    executable = require_browser_executable()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=executable, args=['--no-sandbox', '--disable-gpu'])
        context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)

        # Catalog grammar popup.
        page = context.new_page()
        page.set_default_timeout(12000)
        load(page, f'?level=1&lesson=2&catalog=grammar&grammar={GRAMMAR_ID}')
        assert_three_then_all(page)
        page.close()

        # NP+ uses the same popup contract and must not diverge.
        page = context.new_page()
        page.set_default_timeout(12000)
        load(page, f'?level=1&lesson=2&view=grouped&filter=grammarPlus&grammarPlus={GRAMMAR_ID}')
        assert 'Quay về NP+' in page.locator('.hsk-popup-topbar').inner_text()
        assert_three_then_all(page)
        page.close()

        context.close()
        browser.close()

    print('PASS: New 3.0 grammar popup shows 3 examples first and Xem thêm reveals every remaining example in Catalog and NP+')


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
from pathlib import Path
from urllib.parse import unquote, urlparse
import json
import shutil

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
LESSON = json.loads((ROOT / 'modules/new-hsk-course/data/hsk1/lesson-01.json').read_text(encoding='utf-8'))
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
        if not file_path.is_file():
            route.fulfill(status=404, body=b'not found')
            return
        body = file_path.read_bytes()
        if file_path.as_posix().endswith('/modules/new-hsk-course/app.js'):
            source = body.decode('utf-8').replace(
                'const params = new URLSearchParams(window.location.search);',
                f'const params = new URLSearchParams({query!r});'
            )
            body = source.encode('utf-8')
        route.fulfill(
            status=200,
            body=body,
            content_type=MIMES.get(file_path.suffix.lower(), 'application/octet-stream')
        )
    return handler


def load(page, query='?level=1&lesson=1&view=practice'):
    page.route('**/*', local_route(query))
    html = (ROOT / 'modules/new-hsk-course/index.html').read_text(encoding='utf-8')
    html = html.replace('<head>', '<head><base href="https://app.test/modules/new-hsk-course/">', 1)
    page.set_content(html, wait_until='networkidle')
    page.wait_for_selector('.nhsk-hero')


def ordering_rows():
    turns = []
    for dialogue in sorted(LESSON['entities']['dialogues'], key=lambda row: row.get('order', 0)):
        turns.extend(sorted(dialogue.get('turns', []), key=lambda row: row.get('order', 0)))
    rows = []
    for row in turns:
        tokens = row.get('orderingTokens') or row.get('answerTokens') or []
        if len(tokens) >= 2:
            rows.append((row, tokens))
    return rows


def main():
    executable = shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome') or shutil.which('chrome')
    if not executable:
        raise SystemExit('Không tìm thấy Chromium/Chrome trong PATH.')

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=executable, args=['--no-sandbox', '--disable-gpu'])
        context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        page = context.new_page()
        page.set_default_timeout(12000)
        load(page)

        page.locator('[data-nhsk-practice="ordering"]').click(force=True)
        page.locator('[data-nhsk-practice-setting="ordering-display-count"]').select_option('3')
        page.locator('[data-nhsk-start-practice]').evaluate('el => el.click()')
        page.wait_for_selector('[data-nhsk-order-item-id]')
        assert page.locator('[data-nhsk-order-item-id]').count() == 3

        third = page.locator('[data-nhsk-order-item-id]').nth(2)
        third.scroll_into_view_if_needed()
        page.evaluate('window.scrollBy(0, 180)')
        before = page.evaluate('window.scrollY')
        assert before > 400, before

        # Simulate the late focus/viewport correction observed on mobile browsers
        # after the tapped ordering button is removed during a full rerender.
        page.evaluate("""() => {
          document.addEventListener('click', event => {
            if (!event.target.closest?.('[data-nhsk-order-token]')) return;
            setTimeout(() => window.scrollTo({ top: 0, behavior: 'auto' }), 0);
          }, { capture: true, once: true });
        }""")

        third.locator('[data-token-zone="bank"]').first.click(force=True)
        page.wait_for_timeout(120)
        after = page.evaluate('window.scrollY')

        assert abs(after - before) <= 2, f'Ordering token click changed scrollY: {before} -> {after}'
        page.close()

        # Custom display count accepts a positive number beyond the 1/2/3 presets.
        page = context.new_page()
        page.set_default_timeout(12000)
        load(page)
        page.locator('[data-nhsk-practice="ordering"]').click(force=True)
        page.locator('[data-nhsk-practice-setting="ordering-display-count"]').select_option('custom')
        custom = page.locator('[data-nhsk-practice-setting="ordering-display-custom"]')
        assert custom.count() == 1
        custom.fill('4')
        custom.blur()
        page.locator('[data-nhsk-start-practice]').evaluate('el => el.click()')
        page.wait_for_selector('[data-nhsk-order-item-id]')
        assert page.locator('[data-nhsk-order-item-id]').count() == 4
        page.close()

        # "Tất cả" renders every orderable item in the current practice selection.
        page = context.new_page()
        page.set_default_timeout(12000)
        load(page)
        page.locator('[data-nhsk-practice="ordering"]').click(force=True)
        page.locator('[data-nhsk-practice-setting="ordering-display-count"]').select_option('all')
        page.locator('[data-nhsk-start-practice]').evaluate('el => el.click()')
        page.wait_for_selector('[data-nhsk-order-item-id]')
        visible = page.locator('[data-nhsk-order-item-id]').count()
        assert visible > 4, visible
        summary = page.locator('.nhsk-order-page-summary').inner_text()
        assert f'Hiển thị {visible} câu' in summary, summary
        page.close()

        # Existing 2-card + immediate auto-next behavior remains intact.
        page = context.new_page()
        page.set_default_timeout(12000)
        load(page)
        page.locator('[data-nhsk-practice="ordering"]').click(force=True)
        page.locator('[data-nhsk-practice-setting="ordering-display-count"]').select_option('2')
        page.locator('[data-nhsk-practice-setting="ordering-auto-next"]').select_option('on')
        page.locator('[data-nhsk-practice-setting="ordering-auto-next-delay"]').select_option('0')
        page.locator('[data-nhsk-start-practice]').evaluate('el => el.click()')
        rows = ordering_rows()
        for row, tokens in rows[:2]:
            card = page.locator(f'[data-nhsk-order-item-id="{row["id"]}"]')
            for token in tokens:
                card.locator(f'[data-token-zone="bank"][data-token="{token}"]').click(force=True)
        page.wait_for_timeout(150)
        labels = page.locator('.nhsk-order-card-head>span').all_inner_texts()
        assert labels and labels[0].startswith('Câu 3/'), labels

        context.close()
        browser.close()

    print('PASS: New HSK ordering keeps mobile scroll position and supports preset/custom/all counts')


if __name__ == '__main__':
    main()

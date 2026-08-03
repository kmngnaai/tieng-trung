#!/usr/bin/env python3
from pathlib import Path
from urllib.parse import urlparse, unquote
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
MIMES = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg',
}


def local_route(route):
    parsed = urlparse(route.request.url)
    if parsed.netloc != 'app.test':
        route.abort()
        return
    file_path = ROOT / unquote(parsed.path.lstrip('/'))
    if not file_path.is_file():
        route.fulfill(status=404, body=b'not found')
        return
    route.fulfill(status=200, body=file_path.read_bytes(), content_type=MIMES.get(file_path.suffix.lower(), 'application/octet-stream'))


def load_app(page):
    page.route('**/*', local_route)
    html = (ROOT / 'modules/listening/index.html').read_text(encoding='utf-8')
    html = html.replace('<head>', '<head><base href="https://app.test/modules/listening/">', 1)
    page.set_content(html, wait_until='domcontentloaded')
    page.wait_for_selector('[data-action="open-new-hsk"]')
    page.locator('[data-action="open-new-hsk"]').click()
    page.locator('[data-action="open-new-hsk-unit"][data-unit-id*="__lesson__2__"]').click()
    page.wait_for_selector('[data-activity="word-choice"][data-choice-count="4"]')


def set_order(page, mode):
    button = page.locator(f'.practice-order-card [data-action="set-practice-order"][data-order-mode="{mode}"]')
    button.scroll_into_view_if_needed()
    page_before = page.evaluate('window.scrollY')
    button.click()
    page_after = page.evaluate('window.scrollY')
    assert abs(page_after - page_before) <= 1, (page_before, page_after)
    assert button.get_attribute('aria-pressed') == 'true'


def current_word_order(page):
    return page.evaluate('''() => ({
      practice: ListeningAudioDebug.state.practiceItems.map(item => item.canonicalItemId || item.id),
      source: ListeningAudioDebug.state.dataset.words.map(item => item.id),
      seed: ListeningAudioDebug.state.practiceShuffleSeed
    })''')


def main():
    executable = shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome') or shutil.which('chrome')
    if not executable:
        raise SystemExit('Không tìm thấy Chromium/Chrome trong PATH.')

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, executable_path=executable, args=['--no-sandbox', '--disable-gpu'])
        context = browser.new_context(viewport={'width': 390, 'height': 700}, is_mobile=True, has_touch=True)
        page = context.new_page()
        page.set_default_timeout(10000)
        load_app(page)

        set_order(page, 'original')
        page.locator('[data-activity="word-choice"][data-choice-count="4"]').click()
        original = current_word_order(page)
        assert original['practice'] == original['source'], original
        assert original['seed'] == '', original

        page.locator('[data-action="go-back"]').click()
        page.wait_for_selector('[data-activity="word-choice"][data-choice-count="4"]')
        set_order(page, 'shuffle')
        page.locator('[data-activity="word-choice"][data-choice-count="4"]').click()
        shuffled = current_word_order(page)
        assert sorted(shuffled['practice']) == sorted(shuffled['source']), shuffled
        assert shuffled['practice'] != shuffled['source'], shuffled
        assert shuffled['seed'], shuffled

        context.close()
        browser.close()

    print('PASS: listening practice order setting preserves sheet position and controls session order')


if __name__ == '__main__':
    main()

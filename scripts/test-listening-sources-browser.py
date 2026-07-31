#!/usr/bin/env python3
"""Browser regression for common-schema sources: LDSN1-4 and expanded New HSK 1.

Uses Playwright request routing + set_content because network navigation can be blocked
in restricted test environments.
"""
from pathlib import Path
from urllib.parse import urlparse, unquote
import shutil

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-output' / 'listening-common-sources-v1'
OUT.mkdir(parents=True, exist_ok=True)
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
    route.fulfill(
        status=200,
        body=file_path.read_bytes(),
        content_type=MIMES.get(file_path.suffix.lower(), 'application/octet-stream'),
    )


def app_html():
    html = (ROOT / 'modules/listening/index.html').read_text(encoding='utf-8')
    storage_shim = r"""<script>
    (() => {
      let data = {};
      try { data = JSON.parse(window.name || '{}') || {}; } catch (error) { data = {}; }
      const persist = () => { window.name = JSON.stringify(data); };
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
          getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
          setItem(key, value) { data[key] = String(value); persist(); },
          removeItem(key) { delete data[key]; persist(); },
          clear() { data = {}; persist(); },
          key(index) { return Object.keys(data)[index] || null; },
          get length() { return Object.keys(data).length; }
        }
      });
    })();
    </script>"""
    return html.replace(
        '<head>',
        '<head><base href="https://app.test/modules/listening/">' + storage_shim,
        1,
    )


def install_and_load(page):
    page.route('**/*', local_route)
    reload_app(page)


def reload_app(page):
    page.set_content(app_html(), wait_until='domcontentloaded')
    page.wait_for_selector('[data-action="open-new-hsk"]')


def open_ldsn_unit(page, index=0):
    page.locator('[data-action="open-ldsn"]').click()
    page.wait_for_selector('[data-action="open-ldsn-unit"]')
    assert page.locator('[data-action="open-ldsn-unit"]').count() == 10
    page.locator('[data-action="open-ldsn-unit"]').nth(index).click()
    page.wait_for_selector('[data-activity="dialogue-full-dictation"]')


def test_mobile(browser):
    context = browser.new_context(viewport={'width': 430, 'height': 400}, is_mobile=True, has_touch=True)
    page = context.new_page()
    page.set_default_timeout(12000)
    install_and_load(page)

    open_ldsn_unit(page)
    body = page.locator('body').inner_text()
    for label in ['Dịch câu', 'Hội thoại', 'Đoạn văn', 'Ngữ pháp']:
        assert label in body, label
    assert page.locator('[data-activity="word-choice"][data-choice-count="4"]').count() == 1
    assert page.locator('[data-activity="passage-full-dictation"]').count() == 1
    page.screenshot(path=str(OUT / 'ldsn-unit-mobile.png'), full_page=True)

    page.locator('[data-activity="dialogue-full-dictation"]').click()
    page.wait_for_selector('#dictationInput')
    page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
    page.wait_for_function("() => { const el=document.querySelector('[data-floating-audio]'); return el && !el.hidden; }")
    assert page.locator('[data-floating-audio]').evaluate("el => el.classList.contains('is-collapsed')")
    page.screenshot(path=str(OUT / 'ldsn-full-dialogue-floating.png'), full_page=True)

    # Rebuild the document in the same page to exercise localStorage-backed resume.
    reload_app(page)
    page.wait_for_selector('[data-action="resume-last"]')
    page.locator('[data-action="resume-last"]').click()
    page.wait_for_selector('#dictationInput')
    assert 'Không mở được' not in page.locator('body').inner_text()
    resumed_source = page.evaluate("() => JSON.parse(localStorage.getItem('tieng-trung-listening-last-session-v1')).source")
    assert resumed_source == 'ldsn14'
    page.screenshot(path=str(OUT / 'ldsn-resumed-mobile.png'), full_page=True)

    # Reload home again, then verify all 15 New HSK 1 units and the last curated unit.
    reload_app(page)
    page.locator('[data-action="open-new-hsk"]').click()
    page.wait_for_selector('[data-action="open-new-hsk-unit"]')
    assert page.locator('[data-action="open-new-hsk-unit"]').count() == 15
    page.locator('[data-action="open-new-hsk-unit"]').last.click()
    page.wait_for_selector('[data-activity="dialogue-full-dictation"]')
    assert page.locator('[data-activity="passage-full-dictation"]').count() == 1
    assert 'Hẹn gặp ở sân bay Đại Hưng' in page.locator('body').inner_text()
    page.screenshot(path=str(OUT / 'new-hsk-lesson-15-mobile.png'), full_page=True)
    context.close()


def test_desktop(browser):
    context = browser.new_context(viewport={'width': 1280, 'height': 900})
    page = context.new_page()
    page.set_default_timeout(12000)
    install_and_load(page)
    open_ldsn_unit(page, 3)
    assert page.locator('body').evaluate('el => el.scrollWidth <= window.innerWidth + 1')
    page.screenshot(path=str(OUT / 'ldsn-unit-desktop.png'), full_page=True)
    context.close()


def main():
    executable = (
        shutil.which('chromium')
        or shutil.which('chromium-browser')
        or shutil.which('google-chrome')
        or shutil.which('chrome')
    )
    if not executable:
        raise SystemExit('Không tìm thấy Chromium/Chrome trong PATH.')
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            executable_path=executable,
            args=['--no-sandbox', '--disable-gpu'],
        )
        test_mobile(browser)
        test_desktop(browser)
        browser.close()
    print('PASS: LDSN common schema, resume, New HSK 15 units, mobile/desktop browser regression')


if __name__ == '__main__':
    main()

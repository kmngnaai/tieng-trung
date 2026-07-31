#!/usr/bin/env python3
from pathlib import Path
from urllib.parse import urlparse, unquote
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-output' / 'ldsn14-pastel-v1'
OUT.mkdir(parents=True, exist_ok=True)
MIMES = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg',
}


def local_route(query=''):
    def handler(route):
        parsed = urlparse(route.request.url)
        if parsed.netloc != 'app.test':
            route.abort(); return
        file_path = ROOT / unquote(parsed.path.lstrip('/'))
        if not file_path.is_file():
            route.fulfill(status=404, body=b'not found'); return
        body = file_path.read_bytes()
        if query and file_path.as_posix().endswith('/modules/ldsn14/app.js'):
            source = body.decode('utf-8').replace(
                'new URLSearchParams(location.search)',
                f'new URLSearchParams({query!r})'
            )
            body = source.encode('utf-8')
        route.fulfill(status=200, body=body, content_type=MIMES.get(file_path.suffix.lower(), 'application/octet-stream'))
    return handler


def load(page, query=''):
    page.route('**/*', local_route(query))
    html = (ROOT / 'modules/ldsn14/index.html').read_text(encoding='utf-8')
    html = html.replace('<head>', '<head><base href="https://app.test/modules/ldsn14/">', 1)
    page.set_content(html, wait_until='networkidle')
    page.wait_for_selector('.ldsn-app:not(:has(.ldsn-loading))')


def no_overflow(page):
    result = page.evaluate('''() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    })''')
    assert result['scrollWidth'] <= result['clientWidth'] + 1, result


def home_test(browser):
    context = browser.new_context(viewport={'width': 430, 'height': 932}, is_mobile=True, has_touch=True)
    page = context.new_page(); page.set_default_timeout(10000); load(page)
    backgrounds = page.locator('.ldsn-lesson-card').evaluate_all(
        "els => els.map(el => getComputedStyle(el).backgroundImage)"
    )
    assert len(set(backgrounds)) >= 5, backgrounds
    stat_backgrounds = page.locator('.ldsn-stat').evaluate_all(
        "els => els.map(el => getComputedStyle(el).backgroundColor)"
    )
    assert len(set(stat_backgrounds)) == 3, stat_backgrounds
    no_overflow(page)
    page.screenshot(path=str(OUT / 'home-mobile.png'), full_page=True)
    context.close()


def lesson_test(browser):
    context = browser.new_context(viewport={'width': 430, 'height': 932}, is_mobile=True, has_touch=True)
    page = context.new_page(); page.set_default_timeout(10000); load(page, '?lesson=1')

    learn_backgrounds = page.locator('.ldsn-section').evaluate_all(
        "els => els.map(el => getComputedStyle(el).backgroundImage)"
    )
    assert len(set(learn_backgrounds)) >= 3, learn_backgrounds
    primary = page.locator('.ldsn-primary-btn').first.evaluate("el => getComputedStyle(el).backgroundColor")

    active_colors = []
    for tab in ['learn', 'practice', 'dialogue', 'content', 'review']:
        page.locator(f'[data-tab="{tab}"]').click()
        page.wait_for_timeout(80)
        active_colors.append(page.locator('.ldsn-tab.is-active').evaluate("el => getComputedStyle(el).backgroundColor"))
    assert len(set(active_colors)) == 5, active_colors

    page.locator('[data-tab="practice"]').click(); page.wait_for_timeout(80)
    practice_backgrounds = page.locator('.ldsn-section').evaluate_all(
        "els => els.map(el => getComputedStyle(el).backgroundImage)"
    )
    assert len(set(practice_backgrounds)) >= 4, practice_backgrounds
    page.screenshot(path=str(OUT / 'practice-mobile.png'), full_page=True)

    page.locator('[data-tab="dialogue"]').click(); page.wait_for_timeout(80)
    speaker_colors = page.locator('.ldsn-dialogue-turn').evaluate_all(
        "els => [...new Set(els.map(el => getComputedStyle(el).backgroundImage))]"
    )
    assert len(speaker_colors) >= 2, speaker_colors
    page.screenshot(path=str(OUT / 'dialogue-mobile.png'), full_page=True)

    page.locator('[data-tab="review"]').click(); page.wait_for_timeout(80)
    review_bg = page.locator('.ldsn-section--review').evaluate("el => getComputedStyle(el).backgroundImage")
    assert review_bg and review_bg != 'none', review_bg
    no_overflow(page)

    # Green remains the primary action colour after all pastel theming.
    primary_after = page.locator('.ldsn-primary-btn').first.evaluate("el => getComputedStyle(el).backgroundColor") if page.locator('.ldsn-primary-btn').count() else primary
    assert primary_after == primary, (primary, primary_after)
    context.close()


def desktop_test(browser):
    context = browser.new_context(viewport={'width': 1280, 'height': 900})
    page = context.new_page(); page.set_default_timeout(10000); load(page, '?lesson=1&tab=practice')
    no_overflow(page)
    app_width = page.locator('.ldsn-app').evaluate("el => el.getBoundingClientRect().width")
    assert app_width <= 1184 + 2, app_width
    page.screenshot(path=str(OUT / 'practice-desktop.png'), full_page=True)
    context.close()


def main():
    executable = shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome')
    if not executable:
        raise SystemExit('Không tìm thấy Chromium/Chrome trong PATH.')
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, executable_path=executable, args=['--no-sandbox', '--disable-gpu'])
        home_test(browser)
        lesson_test(browser)
        desktop_test(browser)
        browser.close()
    print('PASS: LDSN1-4 pastel theme browser checks')


if __name__ == '__main__':
    main()

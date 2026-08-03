#!/usr/bin/env python3
from pathlib import Path
from urllib.parse import urlparse, unquote
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-output' / 'listening-floating-audio-context-v2'
OUT.mkdir(parents=True, exist_ok=True)
MIMES = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg',
}

def local_route(route):
    parsed = urlparse(route.request.url)
    if parsed.netloc != 'app.test':
        route.abort(); return
    file_path = ROOT / unquote(parsed.path.lstrip('/'))
    if not file_path.is_file():
        route.fulfill(status=404, body=b'not found'); return
    route.fulfill(status=200, body=file_path.read_bytes(), content_type=MIMES.get(file_path.suffix.lower(), 'application/octet-stream'))

def load_app(page):
    page.route('**/*', local_route)
    html = (ROOT / 'modules/listening/index.html').read_text(encoding='utf-8')
    html = html.replace('<head>', '<head><base href="https://app.test/modules/listening/">', 1)
    page.set_content(html, wait_until='domcontentloaded')
    page.wait_for_selector('[data-action="open-new-hsk"]')

def open_new_hsk_unit(page):
    page.locator('[data-action="open-new-hsk"]').click()
    page.locator('[data-action="open-new-hsk-unit"][data-unit-id*="__lesson__2__"]').click()
    page.wait_for_selector('[data-activity="word-choice"][data-choice-count="4"]')
    page.evaluate("ListeningAudioDebug.state.settings.voiceSource = 'device'")

def wait_floating(page, visible):
    page.wait_for_function(
        '''expected => {
          const el = document.querySelector('[data-floating-audio]');
          if (!el) return false;
          const shown = !el.hidden && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
          return shown === expected;
        }''', arg=visible,
    )

def assert_centered(page, selector, expected_count):
    result = page.evaluate('''(selector) => {
      const controls = document.querySelector(selector);
      const card = controls.closest('.audio-card');
      const cr = controls.getBoundingClientRect();
      const ar = card.getBoundingClientRect();
      const children = Array.from(controls.children).map((el) => {
        const r = el.getBoundingClientRect();
        return {left:r.left, right:r.right, width:r.width};
      });
      return {cardCenter: ar.left + ar.width/2, controlsCenter: cr.left + cr.width/2, children};
    }''', selector)
    assert len(result['children']) == expected_count, result
    assert abs(result['cardCenter'] - result['controlsCenter']) <= 1, result
    gaps = [result['children'][i+1]['left'] - result['children'][i]['right'] for i in range(expected_count - 1)]
    assert max(gaps) - min(gaps) <= 1, (result, gaps)
    return result

def mobile_word_choice_scenario(browser):
    context = browser.new_context(viewport={'width': 430, 'height': 320}, is_mobile=True, has_touch=True)
    page = context.new_page(); page.set_default_timeout(10000)
    load_app(page); open_new_hsk_unit(page)
    page.locator('[data-activity="word-choice"][data-choice-count="4"]').click()
    page.wait_for_selector('.audio-controls--5')
    centered = assert_centered(page, '.audio-controls--5', 5)
    wait_floating(page, False)

    page.evaluate("document.querySelector('[data-learning-target]').scrollIntoView({block:'start'})")
    wait_floating(page, True)
    collapsed = page.evaluate('''() => {
      const rail = document.querySelector('[data-floating-audio]');
      return {
        collapsed: rail.classList.contains('is-collapsed'),
        skips: Array.from(rail.querySelectorAll('.practice-audio-skip')).map(el => getComputedStyle(el).display),
        returnHidden: rail.querySelector('.practice-audio-return').hidden
      };
    }''')
    assert collapsed['collapsed']
    assert all(value == 'none' for value in collapsed['skips'])
    assert collapsed['returnHidden']
    page.screenshot(path=str(OUT / 'floating-collapsed-after-audio-leaves.png'), full_page=True)

    page.evaluate("document.querySelector('[data-action=\"toggle-floating-audio\"]').click()")
    page.wait_for_function("() => !document.querySelector('[data-floating-audio]').classList.contains('is-collapsed')")
    expanded = page.evaluate('''() => Array.from(document.querySelectorAll('.practice-audio-skip')).map(el => getComputedStyle(el).display)''')
    assert all(value != 'none' for value in expanded)
    page.screenshot(path=str(OUT / 'floating-expanded.png'), full_page=True)

    page.evaluate("document.querySelector('[data-primary-audio]').scrollIntoView({block:'center'})")
    wait_floating(page, False)
    context.close()
    return centered

def mobile_dictation_scenario(browser):
    context = browser.new_context(viewport={'width': 430, 'height': 400}, is_mobile=True, has_touch=True)
    page = context.new_page(); page.set_default_timeout(10000)
    load_app(page); open_new_hsk_unit(page)
    page.locator('[data-activity="dialogue-full-dictation"]').click()
    page.wait_for_selector('#dictationInput')

    # startPractice focus ô nhập trong chính cú chạm, tương đương bàn phím mobile mở.
    wait_floating(page, True)
    assert page.locator('[data-floating-audio]').evaluate("el => el.classList.contains('is-collapsed')")

    # Khi active slot rời viewport, nút quay về hiện; bấm xong nó ẩn và slot trở lại viewport.
    page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
    page.wait_for_function("() => !document.querySelector('.practice-audio-return').hidden")
    page.screenshot(path=str(OUT / 'floating-return-when-target-away.png'), full_page=True)
    page.evaluate("document.querySelector('.practice-audio-return').click()")
    page.wait_for_function("() => document.querySelector('.practice-audio-return').hidden")
    active_visible = page.evaluate('''() => {
      const slot = document.querySelector('.dictation-slot.is-active');
      const r = slot.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight;
    }''')
    assert active_visible
    page.screenshot(path=str(OUT / 'floating-returned-to-active-slot.png'), full_page=True)
    context.close()

def desktop_scenario(browser):
    context = browser.new_context(viewport={'width': 1280, 'height': 900})
    page = context.new_page(); page.set_default_timeout(10000)
    load_app(page); open_new_hsk_unit(page)
    page.locator('[data-activity="dialogue-full-dictation"]').click()
    page.wait_for_selector('.audio-controls--4')
    centered = assert_centered(page, '.audio-controls--4', 4)
    page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
    page.wait_for_timeout(250)
    assert page.locator('[data-floating-audio]').is_hidden()
    page.screenshot(path=str(OUT / 'desktop-no-floating-rail.png'), full_page=True)
    context.close()
    return centered

def main():
    executable = shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome') or shutil.which('chrome')
    if not executable:
        raise SystemExit('Không tìm thấy Chromium/Chrome trong PATH.')
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, executable_path=executable, args=['--no-sandbox', '--disable-gpu'])
        mobile_center = mobile_word_choice_scenario(browser)
        mobile_dictation_scenario(browser)
        desktop_center = desktop_scenario(browser)
        browser.close()
    print('PASS: contextual floating audio behavior and centered primary controls')
    print({'mobile': mobile_center, 'desktop': desktop_center})

if __name__ == '__main__':
    main()

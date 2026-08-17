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

TEST_ENV_SHIM = '''<head>
  <base href="https://app.test/modules/lookup/">
  <script>
    const __NativeURL = window.URL;
    function __SafeURL(input, base) {
      return new __NativeURL(input, (!base || base === 'about:blank') ? document.baseURI : base);
    }
    Object.setPrototypeOf(__SafeURL, __NativeURL);
    __SafeURL.prototype = __NativeURL.prototype;
    window.URL = __SafeURL;

    const __storage = new Map();
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: key => __storage.has(key) ? __storage.get(key) : null,
        setItem: (key, value) => __storage.set(key, String(value)),
        removeItem: key => __storage.delete(key),
        clear: () => __storage.clear()
      }
    });

    const __replaceState = history.replaceState.bind(history);
    const __pushState = history.pushState.bind(history);
    history.replaceState = (state, title) => __replaceState(state, title);
    history.pushState = (state, title) => __pushState(state, title);
  </script>
'''

# Chosen to exercise resolved/unresolved radicals, self/side radicals,
# component-rich characters, and several multi-character word shapes.
CASES = [
    ('我', '我', 'single-resolved-radical'),
    ('是', '是', 'single-unresolved-radical'),
    ('一', '一', 'single-self-radical'),
    ('青', '青', 'single-component-self-radical'),
    ('清', '清', 'single-component-side-radical'),
    ('亲人', '亲人', 'word-two-components'),
    ('不客气', '不客气', 'word-three-components'),
    ('谢谢', '谢谢', 'word-two-repeated-char'),
    ('xuexi', '学习', 'pinyin-exact-word'),
    ('zhongguo', '中国', 'pinyin-exact-word'),
]


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


def load_app(page):
    page.route('**/*', local_route)
    html = (ROOT / 'modules/lookup/index.html').read_text(encoding='utf-8')
    html = html.replace('<head>', TEST_ENV_SHIM, 1)
    page.set_content(html, wait_until='domcontentloaded')
    page.wait_for_function('() => window.__C2A24_READY__ === true')


def run_case(context, query, expected, label):
    page = context.new_page()
    page.set_default_timeout(5000)
    page_errors = []
    page.on('pageerror', lambda error: page_errors.append(str(error)))
    try:
        load_app(page)
        page.locator('#searchInput').fill(query)
        page.locator('#searchInput').press('Enter')
        page.wait_for_function(
            '''target => {
              const hero = document.querySelector('.main-char')?.textContent.trim();
              const result = Array.from(document.querySelectorAll('[data-search-char]'))
                .some(node => node.dataset.searchChar === target);
              const message = document.querySelector('#searchMessage');
              return hero === target || result || (message && !message.hidden && message.textContent.trim());
            }''',
            arg=expected,
        )
        hero = page.locator('.main-char').first.text_content().strip() if page.locator('.main-char').count() else ''
        message = page.locator('#searchMessage').text_content().strip() if page.locator('#searchMessage').count() else ''
        visible_message = page.locator('#searchMessage').is_visible() if page.locator('#searchMessage').count() else False
        result_targets = page.locator('[data-search-char]').evaluate_all(
            'nodes => nodes.map(node => node.dataset.searchChar)'
        )
        ok = (hero == expected or expected in result_targets) and not visible_message and not page_errors
        return {
            'query': query,
            'expected': expected,
            'label': label,
            'ok': ok,
            'hero': hero,
            'message': message if visible_message else '',
            'resultTargets': result_targets,
            'pageErrors': page_errors,
        }
    finally:
        page.close()


def main():
    executable = (
        shutil.which('chromium') or shutil.which('chromium-browser') or
        shutil.which('google-chrome') or shutil.which('chrome')
    )
    if not executable:
        raise SystemExit('Không tìm thấy Chromium/Chrome trong PATH.')

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            executable_path=executable,
            args=['--no-sandbox', '--disable-gpu'],
        )
        context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        results = [run_case(context, query, expected, label) for query, expected, label in CASES]
        context.close()
        browser.close()

    for item in results:
        status = 'PASS' if item['ok'] else 'FAIL'
        detail = item['hero'] or (item['expected'] if item['expected'] in item['resultTargets'] else '') or item['message'] or '; '.join(item['pageErrors']) or 'no rendered result'
        print(f"{status}: {item['query']} => {item['expected']} [{item['label']}] -> {detail}")

    failed = [item for item in results if not item['ok']]
    if failed:
        raise SystemExit(f"FAIL: {len(failed)}/{len(results)} lookup regression cases failed")
    print(f"PASS: {len(results)}/{len(results)} lookup regression cases rendered correctly")


if __name__ == '__main__':
    main()

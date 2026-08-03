#!/usr/bin/env python3
from pathlib import Path
from urllib.parse import urlparse, unquote
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-output' / 'lookup-mobile-navigation-v1'
OUT.mkdir(parents=True, exist_ok=True)
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


def search(page, target):
    page.locator('#searchInput').fill(target)
    page.locator('#searchInput').press('Enter')
    page.wait_for_function(
        'target => document.querySelector(".main-char")?.textContent.trim() === target',
        arg=target,
    )


def source_top(page, target, occurrence=0):
    locator = page.locator(f'[data-search-char="{target}"]').nth(occurrence)
    locator.scroll_into_view_if_needed()
    page.evaluate(
        '(args) => args.nodes[args.index].scrollIntoView({block: "center", behavior: "auto"})',
        {'nodes': page.locator(f'[data-search-char="{target}"]').element_handles(), 'index': occurrence},
    )
    return locator.evaluate('element => element.getBoundingClientRect().top')


def wait_source_top(page, target, expected_top, occurrence=0, tolerance=4):
    page.wait_for_function(
        '''args => {
          const nodes = Array.from(document.querySelectorAll(`[data-search-char="${args.target}"]`));
          const node = nodes[args.occurrence];
          return node && Math.abs(node.getBoundingClientRect().top - args.expectedTop) <= args.tolerance;
        }''',
        arg={
            'target': target,
            'occurrence': occurrence,
            'expectedTop': expected_top,
            'tolerance': tolerance,
        },
    )


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
        context = browser.new_context(viewport={'width': 360, 'height': 640}, is_mobile=True, has_touch=True)
        page = context.new_page()
        page.set_default_timeout(10000)
        load_app(page)

        search(page, '不客气')
        hero = page.locator('.main-char').evaluate('''element => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return {
            className: element.className,
            fontSize: style.fontSize,
            lineHeight: style.lineHeight,
            whiteSpace: style.whiteSpace,
            width: rect.width,
            height: rect.height,
            bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
          };
        }''')
        assert 'main-char--short-word' in hero['className'], hero
        assert hero['fontSize'] == '40px', hero
        assert hero['lineHeight'] == '40px', hero
        assert hero['whiteSpace'] == 'nowrap', hero
        assert hero['height'] <= 41, hero
        assert hero['bodyOverflow'] <= 1, hero
        page.screenshot(path=str(OUT / 'lookup-bukeqi-360px.png'), full_page=True)

        parent_top = source_top(page, '客', 0)
        page.locator('[data-search-char="客"]').first.click()
        page.wait_for_function('() => document.querySelector(".main-char")?.textContent.trim() === "客"')

        child_top = source_top(page, '做客', 0)
        page.locator('[data-search-char="做客"]').first.click()
        page.wait_for_function('() => document.querySelector(".main-char")?.textContent.trim() === "做客"')

        page.locator('.ui-header-breadcrumb a[href="#lookup-breadcrumb-1"]').click()
        page.wait_for_function('() => document.querySelector(".main-char")?.textContent.trim() === "客"')
        wait_source_top(page, '做客', child_top)
        page.screenshot(path=str(OUT / 'breadcrumb-restored-source.png'), full_page=True)

        page.locator('.lookup-context-back').first.click()
        page.wait_for_function('() => document.querySelector(".main-char")?.textContent.trim() === "不客气"')
        wait_source_top(page, '客', parent_top)
        page.screenshot(path=str(OUT / 'back-restored-source.png'), full_page=True)

        context.close()
        browser.close()

    print('PASS: lookup fixed word sizing and exact Back/breadcrumb source restoration at 360px')
    print({'hero': hero, 'parentTop': parent_top, 'childTop': child_top})


if __name__ == '__main__':
    main()

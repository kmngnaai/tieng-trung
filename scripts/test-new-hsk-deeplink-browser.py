#!/usr/bin/env python3
from pathlib import Path
from urllib.parse import urlparse, unquote
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
MIMES = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2',
}
WRITER_STUB = r'''
window.HanziWriter = {
  create: function () {
    return {
      setCharacter: function () {},
      animateCharacter: function (options) { if (options && options.onComplete) options.onComplete(); },
      quiz: function () {}, cancelQuiz: function () {},
      showCharacter: function () {}, hideCharacter: function () {},
      showOutline: function () {}, hideOutline: function () {}
    };
  }
};
'''


def handler_for(query):
    def handler(route):
        parsed = urlparse(route.request.url)
        if parsed.netloc == 'cdn.jsdelivr.net':
            route.fulfill(status=200, body=WRITER_STUB, content_type='application/javascript')
            return
        if parsed.netloc != 'app.test':
            route.abort(); return
        file_path = ROOT / unquote(parsed.path.lstrip('/'))
        if file_path.is_dir():
            file_path = file_path / 'index.html'
        if not file_path.is_file():
            route.fulfill(status=404, body=b'not found'); return
        body = file_path.read_bytes()
        if file_path.as_posix().endswith('/modules/hanzi-stroke/app.js'):
            source = body.decode('utf-8').replace(
                'new URLSearchParams(window.location.search)',
                f'new URLSearchParams({query!r})'
            )
            body = source.encode('utf-8')
        route.fulfill(status=200, body=body, content_type=MIMES.get(file_path.suffix.lower(), 'application/octet-stream'))
    return handler


def load(page, query):
    page.route('**/*', handler_for(query))
    html = (ROOT / 'modules/hanzi-stroke/index.html').read_text(encoding='utf-8')
    html = html.replace('<head>', '<head><base href="https://app.test/modules/hanzi-stroke/">', 1)
    page.set_content(html, wait_until='networkidle')


def main():
    executable = shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome')
    if not executable:
        raise SystemExit('Không tìm thấy Chromium/Chrome trong PATH.')
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, executable_path=executable, args=['--no-sandbox', '--disable-gpu'])

        desktop = browser.new_context(viewport={'width': 1280, 'height': 900})
        writing = desktop.new_page(); writing_errors = []
        writing.on('pageerror', lambda error: writing_errors.append(str(error)))
        load(writing, 'study=lookup&chars=%E4%BD%A0&return=%2Fmodules%2Fnew-hsk-course%2Findex.html%3FrestoreToken%3Dtest&returnLabel=Quay+l%E1%BA%A1i+ch%E1%BB%AF+%E4%BD%A0')
        writing.wait_for_selector('#lookupView:not([hidden])')
        assert writing.locator('#hanziInput').input_value() == '你'
        assert writing.locator('#studyTabLookup').get_attribute('aria-selected') == 'true'
        assert writing.locator('.new-hsk-external-return').inner_text() == '← Quay lại chữ 你'
        assert '你' in writing.locator('#writerList').inner_text()
        assert not writing_errors, writing_errors
        desktop.close()

        mobile = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        radical = mobile.new_page(); radical_errors = []
        radical.on('pageerror', lambda error: radical_errors.append(str(error)))
        load(radical, 'study=radicals&radicalId=nhan_009&return=%2Fmodules%2Fnew-hsk-course%2Findex.html%3FrestoreToken%3Dtest&returnLabel=Quay+l%E1%BA%A1i+ch%E1%BB%AF+%E4%BD%A0&returnChar=%E4%BD%A0')
        radical.wait_for_timeout(600)
        assert radical.get_by_text('Tất cả bộ thủ', exact=False).count() >= 1
        assert radical.get_by_text('Quay lại chữ 你', exact=False).count() == 1
        assert radical.locator('.new-hsk-external-return').count() == 0
        assert 'Bộ Nhân' in radical.locator('body').inner_text()
        assert not radical_errors, radical_errors
        mobile.close()

        browser.close()
    print('PASS: New 3.0 direct Bút thuận and exact radical return labels')


if __name__ == '__main__':
    main()

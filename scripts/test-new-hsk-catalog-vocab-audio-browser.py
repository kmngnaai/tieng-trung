#!/usr/bin/env python3
from pathlib import Path
from urllib.parse import urlparse, unquote
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts' / 'new-hsk-catalog-vocab-audio'
MIMES = {
    '.html':'text/html','.js':'application/javascript','.css':'text/css',
    '.json':'application/json','.svg':'image/svg+xml','.png':'image/png',
    '.jpg':'image/jpeg','.jpeg':'image/jpeg','.woff2':'font/woff2','.mp3':'audio/mpeg'
}
TOPIC_ID = 'new_hsk__1__topic__1__dat-cau-hoi-va-do-luong-tu-ngu'
GRAMMAR_ID = 'hsk1_new_1'
SPEECH_STUB = r'''<script>
window.__spoken = [];
window.SpeechSynthesisUtterance = function(text){ this.text = text; this.lang = ''; this.rate = 1; };
window.speechSynthesis = {
  cancel(){}, getVoices(){ return [{lang:'zh-CN', name:'Test Mandarin'}]; },
  speak(utterance){ window.__spoken.push(utterance.text); setTimeout(() => utterance.onend && utterance.onend(), 0); }
};
</script>'''


def route_local(query):
    def handler(route):
        parsed = urlparse(route.request.url)
        if parsed.netloc != 'app.test':
            route.abort(); return
        path = ROOT / unquote(parsed.path.lstrip('/'))
        if path.is_dir(): path = path / 'index.html'
        if not path.is_file():
            route.fulfill(status=404, body=b'not found'); return
        body = path.read_bytes()
        if path.as_posix().endswith('/modules/new-hsk-course/app.js'):
            body = body.decode('utf-8').replace(
                'const params = new URLSearchParams(window.location.search);',
                f'const params = new URLSearchParams({query!r});'
            ).encode('utf-8')
        route.fulfill(status=200, body=body, content_type=MIMES.get(path.suffix.lower(),'application/octet-stream'))
    return handler


def load(page, query):
    page.route('**/*', route_local(query))
    html = (ROOT/'modules/new-hsk-course/index.html').read_text('utf-8')
    html = html.replace('<head>', '<head><base href="https://app.test/modules/new-hsk-course/">'+SPEECH_STUB, 1)
    page.set_content(html, wait_until='networkidle')
    page.evaluate("""() => {
      window.__spoken = [];
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel = () => {};
        window.speechSynthesis.getVoices = () => [{lang:'zh-CN', name:'Test Mandarin'}];
        window.speechSynthesis.speak = utterance => {
          window.__spoken.push(utterance.text);
          setTimeout(() => utterance.onend && utterance.onend(), 0);
        };
      }
    }""")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    executable = shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome')
    if not executable: raise SystemExit('Không tìm thấy Chromium/Chrome trong PATH.')
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=executable, args=['--no-sandbox','--disable-gpu'])
        context = browser.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True)
        page = context.new_page(); page.set_default_timeout(20000)
        errors=[]; page.on('pageerror', lambda error: errors.append(str(error)))
        load(page, f'?level=1&lesson=3&catalog=topics&topic={TOPIC_ID}')
        page.wait_for_selector('.nhsk-topic-word')
        first = page.locator('.nhsk-topic-word').first
        assert first.locator('[data-nhsk-speak]').count() == 1
        meaning_style = first.locator('.nhsk-topic-word__copy p').evaluate("node => ({clamp:getComputedStyle(node).webkitLineClamp, whiteSpace:getComputedStyle(node).whiteSpace})")
        assert meaning_style['clamp'] == '2', meaning_style
        await_url = page.url
        first.scroll_into_view_if_needed()
        page.screenshot(path=str(OUT/'topic-word-list-390x844.png'), full_page=False)
        first.locator('[data-nhsk-speak]').click()
        page.wait_for_function("window.__spoken.includes('哪')")
        assert page.url == await_url
        assert page.locator('#nhskSharedWordDetail:not([hidden])').count() == 0
        first.locator('.nhsk-topic-word__copy p').click()
        page.wait_for_selector('#nhskSharedWordDetail:not([hidden])')
        assert page.locator('.nhsk-word-preview-hero h2').inner_text() == '哪'
        assert 'Quay lại Chủ đề 01' in page.locator('.nhsk-word-preview-topbar').inner_text()
        page.screenshot(path=str(OUT/'topic-word-detail-390x844.png'), full_page=False)
        page.locator('[data-word-popup-close]').click(force=True)

        page.unroute('**/*')
        load(page, f'?level=1&lesson=2&catalog=grammar&grammar={GRAMMAR_ID}')
        page.wait_for_selector('.nhsk-catalog-grammar-examples article')
        example = page.locator('.nhsk-catalog-grammar-examples article').first
        sentence = example.locator('strong').inner_text()
        example.scroll_into_view_if_needed()
        example.locator('[data-nhsk-speak]').click()
        page.wait_for_function("text => window.__spoken.includes(text)", arg=sentence)
        page.screenshot(path=str(OUT/'grammar-example-audio-390x844.png'), full_page=False)
        assert document_width(page) <= 391
        assert not errors, errors
        context.close(); browser.close()
    print('PASS: New 3.0 topic vocabulary cards, two-line meaning, detail and grammar audio')


def document_width(page):
    return page.evaluate('document.documentElement.scrollWidth')


if __name__ == '__main__': main()

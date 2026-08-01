#!/usr/bin/env python3
from pathlib import Path
from urllib.parse import urlparse, unquote
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-output' / 'matching-adaptive-v1'
OUT.mkdir(parents=True, exist_ok=True)
MIMES = {'.js':'application/javascript', '.css':'text/css'}

SHORT_PAIRS = [
    {'id': f'w{i}', 'leftText': word, 'pinyin': pinyin, 'rightText': meaning}
    for i, (word, pinyin, meaning) in enumerate([
        ('你好','nǐ hǎo','xin chào'), ('谢谢','xiè xie','cảm ơn'), ('同学','tóng xué','bạn học'),
        ('没关系','méi guān xi','không sao'), ('认识','rèn shi','quen, biết'), ('名字','míng zi','tên'),
        ('高兴','gāo xìng','vui'), ('学生','xué sheng','học sinh'), ('老师','lǎo shī','giáo viên'),
        ('家','jiā','gia đình'), ('朋友','péng you','bạn bè'), ('学习','xué xí','học tập')
    ], start=1)
]

LONG_TEXT = '今年七月份，我非常荣幸地获得了中国政府奖学金，可以来到中国北京大学留学。'
LONG_PINYIN = 'jīn nián qī yuè fèn, wǒ fēi cháng róng xìng de huò dé le zhōng guó zhèng fǔ jiǎng xué jīn, kě yǐ lái dào zhōng guó běi jīng dà xué liú xué.'
LONG_MEANING = 'Tháng bảy năm nay mình vô cùng vinh dự nhận được học bổng Chính phủ Trung Quốc và có thể đến Đại học Bắc Kinh du học.'
LONG_PAIRS = [
    {'id': f'l{i}', 'leftText': LONG_TEXT, 'pinyin': LONG_PINYIN, 'rightText': LONG_MEANING}
    for i in range(1, 11)
]


def route_local(route):
    parsed = urlparse(route.request.url)
    if parsed.netloc != 'app.test':
        route.abort(); return
    file_path = ROOT / unquote(parsed.path.lstrip('/'))
    if not file_path.is_file():
        route.fulfill(status=404, body=b'not found'); return
    route.fulfill(status=200, body=file_path.read_bytes(), content_type=MIMES.get(file_path.suffix.lower(), 'application/octet-stream'))


def html_shell():
    return '''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
    <base href="https://app.test/"><link rel="stylesheet" href="modules/shared/matching-engine.css">
    <style>
      :root{--accent:#167f72;--accent-soft:#dff4ed;--accent-strong:#0d665c;--border:#d9e8e1;--muted:#66736e;--ink:#18231f}
      *{box-sizing:border-box}body{margin:0;background:linear-gradient(#effaf7,#fff8ef);font-family:Arial,sans-serif;color:var(--ink)}
      .fake-head{height:68px;display:grid;place-items:center;background:rgba(255,255,255,.88);border-bottom:1px solid var(--border);font-weight:800}
      main{padding:10px 10px 82px}.fake-nav{position:fixed;left:0;right:0;bottom:0;height:64px;background:white;border-top:1px solid var(--border);display:grid;place-items:center;color:var(--muted);font-size:12px}
    </style></head><body><header class="fake-head">Nối chữ thích ứng</header><main id="app"></main><footer class="fake-nav">Trang chủ · Tra · Học · Menu</footer>
    <script src="modules/shared/matching-engine.js"></script></body></html>'''


def render_case(page, pairs, content_kind, title):
    page.evaluate('''({pairs, contentKind, title}) => {
      const session = window.TiengTrungMatching.createSession(pairs, {contentKind, title});
      window.__matchingSession = session;
      document.getElementById('app').innerHTML = window.TiengTrungMatching.render(session);
    }''', {'pairs': pairs, 'contentKind': content_kind, 'title': title})
    page.wait_for_selector('.tt-match')
    return page.evaluate('''() => ({
      visible: document.querySelectorAll('.tt-match-card--left').length,
      size: Number(document.querySelector('.tt-match').dataset.matchRoundSize),
      capacity: Number(document.querySelector('.tt-match').dataset.matchCapacity),
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bottom: document.querySelector('.tt-match').getBoundingClientRect().bottom,
      navTop: document.querySelector('.fake-nav').getBoundingClientRect().top
    })''')


def main():
    executable = shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome')
    if not executable:
        raise SystemExit('Chromium not found')
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=executable, args=['--no-sandbox','--disable-gpu'])
        for width, height in [(360,800),(390,844),(430,932)]:
            ctx = browser.new_context(viewport={'width':width,'height':height}, is_mobile=True, has_touch=True)
            page = ctx.new_page(); page.route('**/*', route_local)
            page.set_content(html_shell(), wait_until='domcontentloaded')

            short = render_case(page, SHORT_PAIRS, 'word', 'Nối từ với nghĩa')
            assert short['visible'] == short['size']
            assert 2 <= short['size'] <= 8
            assert short['size'] <= short['capacity'] <= 8
            assert short['scrollWidth'] <= short['width'] + 1
            assert short['bottom'] < short['navTop'], short
            page.screenshot(path=str(OUT / f'short-{width}x{height}.png'), full_page=True)

            long_case = render_case(page, LONG_PAIRS, 'sentence', 'Nối câu dài với nghĩa')
            assert 2 <= long_case['size'] <= 4, long_case
            assert long_case['size'] <= long_case['capacity'] <= 4
            assert long_case['scrollWidth'] <= long_case['width'] + 1
            assert long_case['bottom'] < long_case['navTop'], long_case
            page.screenshot(path=str(OUT / f'long-{width}x{height}.png'), full_page=True)
            ctx.close()
        browser.close()
    print('PASS: adaptive matching layout at 360x800, 390x844 and 430x932 for short and long content')

if __name__ == '__main__':
    main()

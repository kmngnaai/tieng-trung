from playwright.sync_api import sync_playwright
from pathlib import Path
from urllib.parse import urlparse, unquote
ROOT = Path(__file__).resolve().parents[1]
MIMES={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.csv':'text/csv','.txt':'text/plain','.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml'}
def route_local(route):
    u=urlparse(route.request.url)
    if u.netloc!='app.test': route.abort(); return
    f=ROOT/unquote(u.path.lstrip('/'))
    if f.is_dir(): f=f/'index.html'
    if not f.is_file(): route.fulfill(status=404, body=b'not found'); return
    route.fulfill(status=200, body=f.read_bytes(), content_type=MIMES.get(f.suffix.lower(),'application/octet-stream'))
with sync_playwright() as p:
    b=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium')
    ctx=b.new_context(viewport={'width':430,'height':850},is_mobile=True,has_touch=True)
    page=ctx.new_page(); page.route('**/*',route_local)
    page.goto('about:blank'); html=(ROOT/'modules/hanzi-stroke/index.html').read_text('utf-8').replace('<head>','<head><base href="https://app.test/modules/hanzi-stroke/">',1); page.set_content(html, wait_until='domcontentloaded'); page.wait_for_selector('#studyTabFlashcards'); page.evaluate("""() => { const Native = window.URLSearchParams; window.URLSearchParams = class extends Native { constructor(arg){ super(arg === window.location.search ? 'study=flashcards' : arg); } }; document.getElementById('studyTabFlashcards').click(); }""")
    page.wait_for_selector('[data-flashcard-curriculum-open]', timeout=15000)
    page.locator('[data-flashcard-curriculum-open]').click()
    page.wait_for_selector('.flashcard-curriculum-lesson-card', timeout=15000)
    assert page.locator('.flashcard-curriculum-source-tabs button').count()==5
    assert page.locator('.flashcard-curriculum-lesson-card').count()>=1
    page.locator('.flashcard-curriculum-lesson-card').first.click()
    page.wait_for_selector('[data-flashcard-curriculum-start]', timeout=15000)
    count_text=page.locator('[data-flashcard-curriculum-start]').inner_text()
    assert 'thẻ' in count_text
    # manual selection and search works
    page.locator('[data-flashcard-curriculum-count="manual"]').click()
    page.wait_for_selector('[data-flashcard-curriculum-card]')
    initial=page.locator('[data-flashcard-curriculum-card]:checked').count()
    first=page.locator('[data-flashcard-curriculum-card]').first
    first.click()
    assert page.locator('[data-flashcard-curriculum-card]:checked').count()==initial-1
    page.locator('[data-flashcard-curriculum-lesson-back]').click()
    page.wait_for_selector('.flashcard-curriculum-lesson-card')
    # switch 301 and open one lesson
    page.locator('[data-flashcard-curriculum-source="dialogue301"]').click()
    page.wait_for_selector('.flashcard-curriculum-lesson-card', timeout=15000)
    page.locator('.flashcard-curriculum-lesson-card').first.click()
    page.wait_for_selector('[data-flashcard-curriculum-start]', timeout=15000)
    assert page.locator('[data-flashcard-curriculum-start]').is_enabled()
    page.locator('[data-flashcard-curriculum-start]').click()
    page.wait_for_selector('#hskFlashcardOverlay:not([hidden])', timeout=10000)
    print('PASS curriculum browser')
    b.close()

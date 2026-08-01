#!/usr/bin/env python3
from pathlib import Path
from urllib.parse import urlparse, unquote
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-output' / 'patch2abc'
OUT.mkdir(parents=True, exist_ok=True)
MIMES = {
    '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json',
    '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.woff2':'font/woff2',
    '.mp3':'audio/mpeg', '.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

def route_local(route):
    parsed=urlparse(route.request.url)
    if parsed.netloc!='app.test':
        route.abort(); return
    f=ROOT/unquote(parsed.path.lstrip('/'))
    if f.is_dir(): f=f/'index.html'
    if not f.is_file():
        route.fulfill(status=404, body=b'not found'); return
    route.fulfill(status=200, body=f.read_bytes(), content_type=MIMES.get(f.suffix.lower(),'application/octet-stream'))

def html_with_base(relative, base):
    html=(ROOT/relative).read_text('utf-8')
    storage='''<script>(()=>{let d={};Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>Object.prototype.hasOwnProperty.call(d,k)?d[k]:null,setItem:(k,v)=>{d[k]=String(v)},removeItem:k=>{delete d[k]},clear:()=>{d={}}}})})();</script>'''
    return html.replace('<head>', f'<head><base href="https://app.test/{base}">'+storage, 1)

def test_flashcards(browser):
    ctx=browser.new_context(viewport={'width':430,'height':850},is_mobile=True,has_touch=True, permissions=['clipboard-read','clipboard-write'])
    page=ctx.new_page(); page.route('**/*',route_local)
    page.set_content(html_with_base('modules/hanzi-stroke/index.html','modules/hanzi-stroke/'), wait_until='domcontentloaded')
    page.wait_for_selector('#studyTabFlashcards')
    page.evaluate("""() => { const Native=window.URLSearchParams; window.URLSearchParams=class extends Native{constructor(arg){super(arg===window.location.search?'study=flashcards':arg)}}; document.getElementById('studyTabFlashcards').click(); }""")
    page.wait_for_selector('[data-flashcard-curriculum-open]', timeout=15000)
    page.locator('[data-flashcard-curriculum-open]').click()
    page.wait_for_selector('.flashcard-curriculum-lesson-card', timeout=15000)
    lessons=page.locator('.flashcard-curriculum-lesson-card')
    assert lessons.count() >= 2
    lessons.nth(1).click()
    page.wait_for_selector('[data-flashcard-curriculum-content="vocabulary"]', timeout=15000)
    assert page.locator('[data-flashcard-curriculum-content="sentence"]').count()==1
    assert page.locator('[data-flashcard-curriculum-content="grammar"]').count()==1
    page.locator('[data-flashcard-curriculum-content="sentence"]').click()
    assert 'Câu' in page.locator('.flashcard-curriculum-content-note').inner_text()
    page.locator('[data-flashcard-curriculum-content="grammar"]').click()
    page.locator('[data-flashcard-curriculum-start]').click()
    page.wait_for_selector('#hskFlashcardOverlay:not([hidden])')
    page.locator('[data-hsk-flashcard-start]').click()
    page.wait_for_selector('.hsk-flashcard-front--grammar')
    page.locator('.hsk-flashcard-card').click()
    page.wait_for_selector('.hsk-flashcard-answer--grammar')
    page.screenshot(path=str(OUT/'grammar-card-mobile.png'),full_page=True)
    page.locator('[data-hsk-flashcard-close]').click()
    page.locator('[data-flashcard-curriculum-lesson-back]').click()
    page.locator('[data-flashcard-curriculum-close]').click()
    page.wait_for_selector('[data-flashcard-ai-open]')
    page.locator('[data-flashcard-ai-open]').click()
    page.wait_for_selector('[data-flashcard-ai-type="sentence"]')
    assert page.locator('[data-flashcard-ai-type]').count()==5
    page.locator('[data-flashcard-ai-type="sentence"]').click()
    page.locator('[data-flashcard-ai-field="topic"]').fill('Giới thiệu bản thân')
    page.locator('[data-flashcard-ai-field="inputText"]').fill('认识\n名字\n高兴')
    output=page.locator('[data-flashcard-ai-output]').input_value()
    assert 'tokens' in output and 'Giới thiệu bản thân' in output and '认识' in output
    page.screenshot(path=str(OUT/'ai-prompt-builder-mobile.png'),full_page=True)
    ctx.close()

def test_listening(browser):
    ctx=browser.new_context(viewport={'width':430,'height':850},is_mobile=True,has_touch=True)
    page=ctx.new_page(); page.route('**/*',route_local)
    page.set_content(html_with_base('modules/listening/index.html','modules/listening/'), wait_until='domcontentloaded')
    page.wait_for_selector('[data-action="open-new-hsk"]')
    page.locator('[data-action="open-new-hsk"]').click()
    page.wait_for_selector('[data-action="open-new-hsk-unit"]')
    page.locator('[data-action="open-new-hsk-unit"]').nth(1).click()
    page.wait_for_selector('[data-action="open-batch-sentence-setup"]', timeout=15000)
    page.locator('[data-action="open-batch-sentence-setup"]').click()
    page.wait_for_selector('.batch-dictation-setup')
    page.locator('[data-action="set-batch-sentence-count"][data-count="custom"]').click()
    custom=page.locator('[data-action="batch-sentence-custom-count"]')
    custom.fill('7')
    assert '7 câu' in page.locator('.batch-dictation-summary').inner_text()
    page.screenshot(path=str(OUT/'batch-dictation-setup-mobile.png'), full_page=True)
    page.locator('[data-action="start-batch-sentence-dictation"]').click()
    page.wait_for_selector('#dictationInput')
    page.wait_for_selector('.dictation-card--batch')
    body=page.locator('body').inner_text()
    assert 'Chép nhiều câu · 7 câu' in body
    assert 'Chép toàn bộ 7 câu' in body
    assert page.locator('.dictation-card--batch .passage-line').count()==7
    assert page.locator('[data-action="next-item"]').count()==0
    assert page.locator('[data-action="complete-session"]').count()==1
    saved=page.evaluate("() => JSON.parse(localStorage.getItem('tieng-trung-listening-last-session-v1'))")
    assert saved['mode']=='passage'
    assert saved['activityDescriptor']['activity']=='sentence-batch-dictation'
    assert saved['activityDescriptor']['batchCount']==7
    page.screenshot(path=str(OUT/'batch-dictation-all-lines-mobile.png'), full_page=True)

    page.close()
    page=ctx.new_page(); page.route('**/*',route_local)
    page.set_content(html_with_base('modules/listening/index.html','modules/listening/'), wait_until='domcontentloaded')
    page.wait_for_selector('[data-action="open-custom"]')
    page.locator('[data-action="open-custom"]').click()
    page.wait_for_selector('[data-action="open-listening-ai-prompt"]', timeout=15000)
    page.locator('[data-action="open-listening-ai-prompt"]').click()
    page.wait_for_selector('[data-action="set-listening-ai-type"]')
    assert page.locator('[data-action="set-listening-ai-type"]').count()==5
    page.locator('[data-action="set-listening-ai-type"][data-type="dialogue"]').click()
    page.locator('[data-listening-ai-field="topic"]').fill('Làm quen bạn mới')
    page.locator('[data-listening-ai-field="inputText"]').fill('名字\n认识\n高兴')
    output=page.locator('[data-listening-ai-output]').input_value()
    assert 'kind="dialogue"' in output and 'Làm quen bạn mới' in output and '名字' in output
    page.screenshot(path=str(OUT/'listening-ai-prompt-mobile.png'), full_page=True)
    ctx.close()

def main():
    exe=shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome')
    if not exe: raise SystemExit('Chromium not found')
    with sync_playwright() as p:
        b=p.chromium.launch(headless=True,executable_path=exe,args=['--no-sandbox','--disable-gpu'])
        test_flashcards(b); test_listening(b); b.close()
    print('PASS Patch 2A/2B/2C browser tests')

if __name__=='__main__': main()

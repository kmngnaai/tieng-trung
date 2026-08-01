#!/usr/bin/env python3
from pathlib import Path
from urllib.parse import urlparse, unquote
import json
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-output' / 'ai-paste-import-v1'
OUT.mkdir(parents=True, exist_ok=True)
MIMES = {
    '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json',
    '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.woff2':'font/woff2',
    '.mp3':'audio/mpeg', '.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

def route_local(route):
    parsed = urlparse(route.request.url)
    if parsed.netloc != 'app.test':
        route.abort(); return
    rel = unquote(parsed.path.lstrip('/'))
    if rel == 'modules/listening/library-store.js':
        fake = """window.__testListening={groups:[],decks:[]};window.ListeningLibraryStore=Object.freeze({init:async()=>{},listGroups:async()=>window.__testListening.groups.slice(),listDecks:async()=>window.__testListening.decks.slice(),listTrash:async()=>[],getGroup:async id=>window.__testListening.groups.find(x=>x.id===id)||null,getDeck:async id=>window.__testListening.decks.find(x=>x.id===id)||null,saveDeck:async d=>{const i=window.__testListening.decks.findIndex(x=>x.id===d.id);if(i>=0)window.__testListening.decks[i]=d;else window.__testListening.decks.push(d);return d},saveGroup:async g=>{const i=window.__testListening.groups.findIndex(x=>x.id===g.id);if(i>=0)window.__testListening.groups[i]=g;else window.__testListening.groups.push(g);return g},importData:async()=>({}),exportAll:async()=>({}),exportGroup:async()=>({}),exportDeck:async()=>({}),downloadJson:()=>{},toggleCard:async()=>{},deleteDeck:async()=>{},deleteGroup:async()=>{},restoreTrash:async()=>{},deleteTrashPermanently:async()=>{},restoreAllTrash:async()=>{},emptyTrash:async()=>{},parseImportPayload:x=>x,normalizeCard:x=>x,normalizeDeck:x=>x,normalizeGroup:x=>x,constants:Object.freeze({DB_NAME:'test',DB_VERSION:2,TRASH_DAYS:7})});"""
        route.fulfill(status=200, body=fake.encode('utf-8'), content_type='application/javascript'); return
    file = ROOT / rel
    if file.is_dir(): file = file / 'index.html'
    if not file.is_file():
        route.fulfill(status=404, body=b'not found'); return
    route.fulfill(status=200, body=file.read_bytes(), content_type=MIMES.get(file.suffix.lower(), 'application/octet-stream'))

def html_with_base(relative, base):
    html = (ROOT / relative).read_text('utf-8')
    storage = """<script>(()=>{let d={};Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>Object.prototype.hasOwnProperty.call(d,k)?d[k]:null,setItem:(k,v)=>{d[k]=String(v)},removeItem:k=>{delete d[k]},clear:()=>{d={}}}})})();</script>"""
    return html.replace('<head>', f'<head><base href="https://app.test/{base}">'+storage, 1)

SAMPLE = '\n'.join([
    'Kết quả AI:',
    '```json',
    json.dumps({
        'format':'tieng-trung-ai-result-v1','type':'vocabulary','level':'HSK 1','topic':'Gia đình',
        'extra_words':[],'quality_notes':[],
        'items':[{'id':'w1','hanzi':'家','pinyin':'jiā','meaning':'gia đình','word_type':'Danh từ','tags':['HSK 1']}]
    }, ensure_ascii=False),
    '```',
    'Phần câu:',
    json.dumps({
        'format':'tieng-trung-ai-result-v1','type':'sentence','level':'HSK 1','topic':'Gia đình',
        'extra_words':[],'quality_notes':[],
        'items':[{'id':'s1','hanzi':'我家有三口人。','pinyin':'wǒ jiā yǒu sān kǒu rén.','meaning':'Nhà tôi có ba người.','tokens':['我家','有','三口人'],'source_word_ids':['w1'],'grammar_ids':[]}]
    }, ensure_ascii=False)
])

def test_flashcard(browser):
    ctx = browser.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True)
    page = ctx.new_page(); page.route('**/*', route_local)
    page.set_content(html_with_base('modules/hanzi-stroke/index.html','modules/hanzi-stroke/'), wait_until='domcontentloaded')
    page.wait_for_selector('#studyTabFlashcards')
    page.evaluate("""() => { const Native=window.URLSearchParams; window.URLSearchParams=class extends Native{constructor(arg){super(arg===window.location.search?'study=flashcards':arg)}}; document.getElementById('studyTabFlashcards').click(); }""")
    page.wait_for_selector('[data-flashcard-ai-open]', timeout=20000)
    page.locator('[data-flashcard-ai-open]').click()
    page.wait_for_selector('[data-flashcard-ai-paste-open]')
    page.locator('[data-flashcard-ai-paste-open]').click()
    page.wait_for_selector('[data-flashcard-ai-paste-text]')
    page.locator('[data-flashcard-ai-paste-mode="full"]').click()
    page.locator('[data-flashcard-ai-paste-text]').fill(SAMPLE)
    page.locator('[data-flashcard-ai-paste-analyze]').click()
    page.wait_for_selector('.flashcard-ai-paste-result')
    body = page.locator('body').inner_text()
    assert '1 từ' in body and '1 câu' in body
    assert 'Từ vựng' in body and 'Câu' in body
    assert 'Tạo nhóm và các bộ riêng' in body and 'Sẽ tạo 2 bộ' in body
    assert page.locator('[data-flashcard-ai-paste-block]:checked').count() == 2
    page.locator('[data-flashcard-ai-paste-title]').fill('Gia đình AI')
    listen_toggle = page.locator('[data-flashcard-ai-paste-to="listening"]')
    if not listen_toggle.is_checked(): listen_toggle.check()
    assert page.locator('[data-flashcard-ai-paste-import]').is_enabled()
    assert page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1')
    page.screenshot(path=str(OUT/'flashcard-ai-paste-preview-mobile.png'), full_page=True)
    ctx.close()

def test_listening(browser):
    ctx = browser.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True)
    page = ctx.new_page(); page.route('**/*', route_local)
    page.set_content(html_with_base('modules/listening/index.html','modules/listening/'), wait_until='domcontentloaded')
    page.wait_for_selector('[data-action="open-custom"]', timeout=20000)
    page.locator('[data-action="open-custom"]').click()
    page.wait_for_selector('[data-action="open-listening-ai-prompt"]', timeout=20000)
    page.locator('[data-action="open-listening-ai-prompt"]').click()
    page.wait_for_selector('[data-action="open-listening-ai-paste"]')
    page.locator('[data-action="open-listening-ai-paste"]').click()
    page.wait_for_selector('[data-ai-paste-text]')
    page.locator('[data-action="set-ai-paste-mode"][data-mode="full"]').click()
    page.locator('[data-ai-paste-text]').fill(SAMPLE)
    page.locator('[data-action="analyze-ai-paste"]').click()
    page.wait_for_selector('.ai-paste-result')
    body = page.locator('body').inner_text()
    assert '1 từ' in body and '1 câu' in body
    assert 'Tạo nhóm và các bộ Nghe riêng' in body and 'Sẽ tạo 2 bộ' in body
    assert page.locator('[data-ai-paste-block]:checked').count() == 2
    page.locator('[data-ai-paste-title]').fill('Gia đình AI Nghe')
    assert page.locator('[data-action="confirm-ai-paste-listening"]').is_enabled()
    assert page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1')
    page.screenshot(path=str(OUT/'listening-ai-paste-preview-mobile.png'), full_page=True)
    page.locator('[data-action="confirm-ai-paste-listening"]').click()
    page.wait_for_timeout(300)
    stored = page.evaluate('window.__testListening')
    assert len(stored['groups']) == 1
    assert len(stored['decks']) == 2
    assert sorted(deck['name'] for deck in stored['decks']) == ['Gia đình AI Nghe · Câu','Gia đình AI Nghe · Từ vựng']
    assert all(deck['groupId'] == stored['groups'][0]['id'] for deck in stored['decks'])
    ctx.close()

def main():
    exe = shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome')
    if not exe: raise SystemExit('Chromium not found')
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=exe, args=['--no-sandbox','--disable-gpu'])
        test_flashcard(browser)
        test_listening(browser)
        browser.close()
    print('PASS AI paste mobile preview browser tests')

if __name__ == '__main__': main()

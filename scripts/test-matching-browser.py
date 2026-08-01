#!/usr/bin/env python3
from pathlib import Path
from urllib.parse import urlparse, unquote
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-output' / 'matching-v1'
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
    file_path = ROOT / unquote(parsed.path.lstrip('/'))
    if file_path.is_dir(): file_path = file_path / 'index.html'
    if not file_path.is_file():
        route.fulfill(status=404, body=b'not found'); return
    route.fulfill(status=200, body=file_path.read_bytes(), content_type=MIMES.get(file_path.suffix.lower(), 'application/octet-stream'))

def html_with_base(relative, base):
    html = (ROOT / relative).read_text('utf-8')
    storage = '''<script>(()=>{let d={};Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>Object.prototype.hasOwnProperty.call(d,k)?d[k]:null,setItem:(k,v)=>{d[k]=String(v)},removeItem:k=>{delete d[k]},clear:()=>{d={}}}})})();</script>'''
    return html.replace('<head>', f'<head><base href="https://app.test/{base}">'+storage, 1)

def assert_no_horizontal_overflow(page):
    values = page.evaluate('''() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth })''')
    assert values['scroll'] <= values['client'] + 1, values

def test_listening(browser):
    ctx = browser.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True)
    page = ctx.new_page(); page.route('**/*', route_local)
    page.set_content(html_with_base('modules/listening/index.html','modules/listening/'), wait_until='domcontentloaded')
    page.wait_for_selector('[data-action="open-new-hsk"]')
    page.locator('[data-action="open-new-hsk"]').click()
    page.wait_for_selector('[data-action="open-new-hsk-unit"]')
    page.locator('[data-action="open-new-hsk-unit"]').nth(1).click()
    page.wait_for_selector('[data-action="start-matching-activity"][data-matching-type="word"]', timeout=15000)
    assert page.locator('[data-matching-type="sentence"]').count() == 1
    assert page.locator('[data-matching-type="dialogue"]').count() >= 1
    assert page.locator('[data-matching-type="passage"]').count() >= 1
    word_launch = page.locator('[data-matching-type="word"]')
    word_launch.click()
    page.wait_for_selector('.tt-match')
    left = page.locator('.tt-match-card--left')
    right = page.locator('.tt-match-card--right')
    assert 2 <= left.count() <= 8
    assert left.count() == right.count()
    round_size = int(page.locator('.tt-match').get_attribute('data-match-round-size'))
    capacity = int(page.locator('.tt-match').get_attribute('data-match-capacity'))
    assert round_size == left.count()
    assert round_size <= capacity <= 8
    page.locator('[data-match-action="toggle-settings"]').click()
    page.wait_for_selector('.tt-match-settings')
    custom_limit = page.locator('[data-match-custom-limit]')
    custom_limit.fill('12')
    page.locator('[data-match-action="apply-custom-limit"]').click()
    saved_settings = page.evaluate("() => JSON.parse(localStorage.getItem('tieng-trung-interaction-settings-v1'))")
    assert saved_settings['matchingPairLimitWord'] == 12
    page.screenshot(path=str(OUT/'listening-matching-settings-mobile.png'), full_page=True)
    page.locator('[data-match-action="set-auto-next-delay"][data-match-value="0"]').click()
    page.locator('[data-match-action="close-settings"]').click()
    assert page.locator('.tt-match-settings').count() == 0
    first_id = left.nth(0).get_attribute('data-match-id')
    right_ids = page.locator('.tt-match-card--right').evaluate_all("els => els.map(el => el.dataset.matchId)")
    wrong_id = next(item for item in right_ids if item != first_id)
    for attempt in range(1, 4):
        page.locator(f'.tt-match-card--left[data-match-id="{first_id}"]').click()
        page.locator(f'.tt-match-card--right[data-match-id="{wrong_id}"]').click()
        page.wait_for_timeout(100)
        assert page.locator('.tt-match-card.is-wrong').count() == 2, 'Only the two clicked cards should be red'
        if attempt < 3:
            assert page.locator('.tt-match-card.is-hint-source').count() == 0
            assert page.locator('.tt-match-card.is-hint-target').count() == 0
        else:
            assert page.locator('.tt-match-card.is-hint-source').count() == 1
            assert page.locator('.tt-match-card.is-hint-target').count() == 1
        page.wait_for_timeout(700)
        assert page.locator('.tt-match-card.is-wrong').count() == 0, 'Red feedback must clear automatically'
    assert page.locator('.tt-match-card.is-hint-source').count() == 1
    assert page.locator('.tt-match-card.is-hint-target').count() == 1
    page.locator(f'.tt-match-card--left[data-match-id="{first_id}"]').click()
    page.locator(f'.tt-match-card--right[data-match-id="{first_id}"]').click()
    page.wait_for_timeout(100)
    assert page.locator(f'.tt-match-card--left[data-match-id="{first_id}"]').count() == 0
    saved = page.evaluate("() => JSON.parse(localStorage.getItem('tieng-trung-listening-matching-session-v1'))")
    assert saved and first_id in saved['session']['completedIds']
    current_round_ids = page.locator('.tt-match-card--left').evaluate_all("els => els.map(el => el.dataset.matchId)")
    progress_before_next = int(page.locator('.tt-match__progress').inner_text().split('/')[0])
    for pair_id in current_round_ids:
        page.locator(f'.tt-match-card--left[data-match-id="{pair_id}"]').click()
        page.locator(f'.tt-match-card--right[data-match-id="{pair_id}"]').click()
    page.wait_for_function("previous => { const value=document.querySelector('.tt-match__progress')?.textContent||'0/0'; return Number(value.split('/')[0]) > previous && document.querySelectorAll('.tt-match-card--left').length > 0; }", arg=progress_before_next, timeout=5000)
    assert page.locator('[data-match-action="next-round"]').count() == 0
    page.screenshot(path=str(OUT/'listening-word-matching-mobile.png'), full_page=True)
    assert_no_horizontal_overflow(page)
    page.locator('[data-action="go-back"]').click()
    page.wait_for_selector('[data-matching-type="sentence"]')
    sentence_launch = page.locator('[data-matching-type="sentence"]')
    sentence_launch.scroll_into_view_if_needed()
    origin_scroll = page.evaluate('window.scrollY')
    assert origin_scroll > 0, origin_scroll
    sentence_launch.click()
    page.wait_for_selector('.tt-match')
    sentence_count = page.locator('.tt-match-card--left').count()
    assert 2 <= sentence_count <= 8
    page.screenshot(path=str(OUT/'listening-sentence-matching-mobile.png'), full_page=True)
    assert_no_horizontal_overflow(page)
    page.locator('[data-action="go-back"]').click()
    page.wait_for_selector('[data-matching-type="sentence"]')
    page.wait_for_function('target => Math.abs(window.scrollY - target) <= 4', arg=origin_scroll, timeout=3000)
    restored_scroll = page.evaluate('window.scrollY')
    assert abs(restored_scroll - origin_scroll) <= 4, (origin_scroll, restored_scroll)
    ctx.close()

def test_flashcard(browser):
    ctx = browser.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True)
    page = ctx.new_page(); page.route('**/*', route_local)
    page.set_content(html_with_base('modules/hanzi-stroke/index.html','modules/hanzi-stroke/'), wait_until='domcontentloaded')
    page.wait_for_selector('#studyTabFlashcards')
    page.evaluate("""() => { const Native=window.URLSearchParams; window.URLSearchParams=class extends Native{constructor(arg){super(arg===window.location.search?'study=flashcards':arg)}}; document.getElementById('studyTabFlashcards').click(); }""")
    page.wait_for_selector('[data-flashcard-curriculum-open]', timeout=15000)
    page.locator('[data-flashcard-curriculum-open]').click()
    page.wait_for_selector('.flashcard-curriculum-lesson-card', timeout=15000)
    page.locator('.flashcard-curriculum-lesson-card').nth(1).click()
    page.wait_for_selector('[data-flashcard-curriculum-content="vocabulary"]')
    page.locator('[data-flashcard-curriculum-start]').click()
    page.wait_for_selector('#hskFlashcardOverlay:not([hidden])')
    page.wait_for_selector('[data-hsk-flashcard-mode="matching"]')
    page.locator('[data-hsk-flashcard-mode="matching"]').click()
    page.locator('[data-hsk-flashcard-start]').click()
    page.wait_for_selector('.hsk-flashcard-study--matching .tt-match')
    page.locator('.hsk-flashcard-study--matching [data-match-action="toggle-settings"]').click()
    page.locator('.hsk-flashcard-study--matching [data-match-custom-limit]').fill('9')
    page.locator('.hsk-flashcard-study--matching [data-match-action="apply-custom-limit"]').click()
    shared_settings = page.evaluate("() => JSON.parse(localStorage.getItem('tieng-trung-interaction-settings-v1'))")
    assert shared_settings['matchingPairLimitWord'] == 9
    page.locator('.hsk-flashcard-study--matching [data-match-action="close-settings"]').click()
    left = page.locator('.hsk-flashcard-study--matching .tt-match-card--left')
    assert 2 <= left.count() <= 8
    first_id = left.nth(0).get_attribute('data-match-id')
    left.nth(0).click()
    page.locator(f'.hsk-flashcard-study--matching .tt-match-card--right[data-match-id="{first_id}"]').click()
    page.wait_for_timeout(100)
    assert page.locator(f'.hsk-flashcard-study--matching .tt-match-card--left[data-match-id="{first_id}"]').count() == 0
    settings = page.evaluate("() => JSON.parse(localStorage.getItem('hanziStroke.hskFlashcardSettings.v1'))")
    assert settings['mode'] == 'matching'
    page.screenshot(path=str(OUT/'flashcard-matching-mobile.png'), full_page=True)
    assert_no_horizontal_overflow(page)
    ctx.close()

def main():
    executable = shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome')
    if not executable: raise SystemExit('Chromium not found')
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=executable, args=['--no-sandbox','--disable-gpu'])
        test_listening(browser)
        test_flashcard(browser)
        browser.close()
    print('PASS: shared Matching browser flow on mobile for Listening and Flashcards')

if __name__ == '__main__': main()

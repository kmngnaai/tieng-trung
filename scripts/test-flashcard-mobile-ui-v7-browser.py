#!/usr/bin/env python3
from playwright.sync_api import sync_playwright
from pathlib import Path
from urllib.parse import urlparse, unquote
import shutil

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts' / 'flashcard-mobile-ui-v7'
MIMES = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.csv':'text/csv','.txt':'text/plain','.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg'}


def route_local(route):
    parsed = urlparse(route.request.url)
    if parsed.netloc != 'app.test':
        route.abort(); return
    file_path = ROOT / unquote(parsed.path.lstrip('/'))
    if file_path.is_dir(): file_path = file_path / 'index.html'
    if not file_path.is_file():
        route.fulfill(status=404, body=b'not found'); return
    route.fulfill(status=200, body=file_path.read_bytes(), content_type=MIMES.get(file_path.suffix.lower(), 'application/octet-stream'))


def open_flashcard_mode(page, mode):
    page.route('**/*', route_local)
    html = (ROOT / 'modules/hanzi-stroke/index.html').read_text('utf-8').replace('<head>', '<head><base href="https://app.test/modules/hanzi-stroke/">', 1)
    page.set_content(html, wait_until='domcontentloaded')
    page.wait_for_selector('#studyTabFlashcards', state='attached')
    page.evaluate("""() => {
      const Native = window.URLSearchParams;
      window.URLSearchParams = class extends Native {
        constructor(arg){ super(arg === window.location.search ? 'study=flashcards' : arg); }
      };
      document.getElementById('studyTabFlashcards').click();
    }""")
    page.wait_for_selector('[data-flashcard-curriculum-open]', timeout=15000)
    page.locator('[data-flashcard-curriculum-open]').click()
    page.wait_for_selector('[data-flashcard-curriculum-source="new_hsk_course"]', timeout=15000)
    page.locator('[data-flashcard-curriculum-source="new_hsk_course"]').click()
    page.wait_for_selector('.flashcard-curriculum-lesson-card', timeout=15000)
    page.locator('.flashcard-curriculum-lesson-card').first.click()
    page.wait_for_selector('[data-flashcard-curriculum-content]', timeout=15000)
    if mode == 'sentence-ordering':
        page.locator('[data-flashcard-curriculum-content="sentence"]').click()
    else:
        page.locator('[data-flashcard-curriculum-content="vocabulary"]').click()
    page.wait_for_selector('[data-flashcard-curriculum-start]', timeout=15000)
    page.locator('[data-flashcard-curriculum-start]').click()
    page.wait_for_selector('#hskFlashcardOverlay:not([hidden])', timeout=10000)
    page.locator(f'[data-hsk-flashcard-mode="{mode}"]').click()
    page.locator('[data-hsk-flashcard-start]').click()
    page.wait_for_selector(f'.hsk-flashcard-study--{"ordering" if mode == "sentence-ordering" else "radical-sort"}', timeout=10000)


def complete_radical(page):
    guard = 0
    while page.locator('[data-hsk-radical-item]').count() and guard < 100:
        guard += 1
        active_group = page.locator('[data-hsk-radical-group].active')
        if active_group.count(): active_group.first.click(force=True)
        item = page.locator('[data-hsk-radical-item]').first
        item_id = item.get_attribute('data-hsk-radical-item')
        matched = False
        for index in range(page.locator('[data-hsk-radical-group]').count()):
            current = page.locator(f'[data-hsk-radical-item="{item_id}"]')
            if not current.count():
                matched = True; break
            if 'active' not in (current.get_attribute('class') or '').split(): current.click(force=True)
            page.locator('[data-hsk-radical-group]').nth(index).click(force=True)
            page.wait_for_timeout(20)
            if not page.locator(f'[data-hsk-radical-item="{item_id}"]').count():
                matched = True; break
        assert matched, item_id
    assert page.locator('[data-hsk-radical-item]').count() == 0


def rect(page, selector):
    return page.locator(selector).bounding_box()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    executable = shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome')
    if not executable: raise SystemExit('Không tìm thấy Chromium/Chrome trong PATH.')
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=executable, args=['--no-sandbox','--disable-gpu'])
        for width, height in ((360,800),(390,844),(430,932)):
            # Sentence ordering uses sentence cards.
            order_context = browser.new_context(viewport={'width':width,'height':height}, is_mobile=True, has_touch=True)
            order_page = order_context.new_page(); order_page.set_default_timeout(20000)
            order_errors=[]; order_page.on('pageerror', lambda error: order_errors.append(str(error)))
            open_flashcard_mode(order_page, 'sentence-ordering')
            meta = rect(order_page, '.hsk-flashcard-study--ordering .hsk-flashcard-study-meta')
            item = rect(order_page, '.hsk-flashcard-order-item')
            study = rect(order_page, '.hsk-flashcard-study--ordering')
            assert meta and item and study
            assert item['y'] - (meta['y'] + meta['height']) <= 20, (width, meta, item)
            assert item['y'] - study['y'] <= 70, (width, study, item)
            assert order_page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            order_page.screenshot(path=str(OUT/f'ordering-{width}x{height}.png'), full_page=False)
            assert not order_errors, order_errors
            order_context.close()

            # Radical sort uses vocabulary cards.
            radical_context = browser.new_context(viewport={'width':width,'height':height}, is_mobile=True, has_touch=True)
            page = radical_context.new_page(); page.set_default_timeout(20000)
            errors=[]; page.on('pageerror', lambda error: errors.append(str(error)))
            open_flashcard_mode(page, 'radical-sort')
            panel = page.locator('.hsk-flashcard-study--radical-sort')
            css = panel.evaluate("""node => { const s=getComputedStyle(node); return {border:s.borderColor,bg:s.backgroundImage,align:s.alignContent}; }""")
            assert css['border'] == 'rgb(232, 201, 173)', css
            assert page.locator('[data-hsk-radical-display-mode]').count() == 3
            first = page.locator('[data-hsk-radical-item]').first
            first.click(force=True)
            page.wait_for_selector('.hsk-flashcard-radical-selected-help')
            helper_text = page.locator('.hsk-flashcard-radical-selected-help').inner_text()
            assert helper_text.strip(), helper_text
            page.locator('[data-hsk-radical-display-mode="pinyin"]').click()
            assert page.locator('.hsk-flashcard-radical-bank.display-pinyin').count() == 1
            assert page.locator('.hsk-flashcard-radical-token small').count() >= 1
            page.locator('[data-hsk-radical-display-mode="meaning"]').click()
            assert page.locator('.hsk-flashcard-radical-bank.display-meaning').count() == 1
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.screenshot(path=str(OUT/f'radical-help-{width}x{height}.png'), full_page=False)

            if width == 390:
                complete_radical(page)
                page.wait_for_selector('[data-hsk-radical-complete]')
                study_box=rect(page,'.hsk-flashcard-study--radical-sort')
                button_box=rect(page,'[data-hsk-radical-complete]')
                assert study_box and button_box
                block_top = rect(page,'.hsk-flashcard-radical-topbar')['y']
                block_bottom = button_box['y'] + button_box['height']
                block_center = (block_top + block_bottom) / 2
                study_center = study_box['y'] + study_box['height']/2
                assert abs(block_center-study_center) <= 36, (block_center,study_center,study_box)
                assert study_box['height'] <= 460, study_box
                assert button_box['width'] <= 190, button_box
                page.screenshot(path=str(OUT/'radical-complete-390x844.png'), full_page=False)
            assert not errors, errors
            radical_context.close()
        browser.close()
    print('PASS: Flashcard mobile UI v7 local browser checks')

if __name__ == '__main__': main()

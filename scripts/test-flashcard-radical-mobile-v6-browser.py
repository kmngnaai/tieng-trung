#!/usr/bin/env python3
from playwright.sync_api import sync_playwright
from pathlib import Path
from urllib.parse import urlparse, unquote
import shutil

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts' / 'flashcard-radical-mobile-v6'
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


def open_radical_sort(page):
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
    page.wait_for_selector('[data-flashcard-curriculum-start]', timeout=15000)
    page.locator('[data-flashcard-curriculum-start]').click()
    page.wait_for_selector('#hskFlashcardOverlay:not([hidden])', timeout=10000)
    page.locator('[data-hsk-flashcard-mode="radical-sort"]').click()
    page.locator('[data-hsk-flashcard-start]').click()
    page.wait_for_selector('.hsk-flashcard-study--radical-sort', timeout=10000)


def measure(page):
    return page.evaluate("""() => {
      const rect = selector => document.querySelector(selector)?.getBoundingClientRect();
      const style = selector => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const css = getComputedStyle(node);
        return {alignContent: css.alignContent, gridAutoRows: css.gridAutoRows, height: css.height};
      };
      return {
        study: rect('.hsk-flashcard-study--radical-sort'),
        meta: rect('.hsk-flashcard-study-meta'),
        bank: rect('.hsk-flashcard-radical-bank'),
        token: rect('.hsk-flashcard-radical-bank button'),
        groups: rect('.hsk-flashcard-radical-groups'),
        group: rect('.hsk-flashcard-radical-groups button'),
        feedback: rect('.hsk-flashcard-ordering-feedback'),
        studyStyle: style('.hsk-flashcard-study--radical-sort'),
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth
      };
    }""")


def complete_round(page):
    # Try each group for each remaining character. Correct matches remove the character.
    guard = 0
    while page.locator('[data-hsk-radical-item]').count() and guard < 100:
        guard += 1
        active_group = page.locator('[data-hsk-radical-group].active')
        if active_group.count(): active_group.first.click(force=True)
        item = page.locator('[data-hsk-radical-item]').first
        item_id = item.get_attribute('data-hsk-radical-item')
        groups = page.locator('[data-hsk-radical-group]')
        matched = False
        for index in range(groups.count()):
            current = page.locator(f'[data-hsk-radical-item="{item_id}"]')
            if not current.count():
                matched = True; break
            if 'active' not in (current.get_attribute('class') or '').split():
                current.click(force=True)
            page.locator('[data-hsk-radical-group]').nth(index).click(force=True)
            page.wait_for_timeout(20)
            if not page.locator(f'[data-hsk-radical-item="{item_id}"]').count():
                matched = True; break
        assert matched, f'Không xếp được chữ {item_id}'
    assert page.locator('[data-hsk-radical-item]').count() == 0


def assert_thumb_friendly(m, width, height):
    assert m['documentWidth'] <= m['viewportWidth'], m
    assert m['study']['height'] >= height * .78, m
    assert m['groups']['width'] >= m['study']['width'] - 24, m
    assert m['bank']['width'] >= m['study']['width'] - 24, m
    assert m['bank']['y'] >= m['groups']['y'] + m['groups']['height'] + 120, m
    assert m['token']['height'] <= 64, m
    assert m['group']['height'] <= 90, m
    assert m['groups']['height'] <= 205, m


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    executable = shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome')
    if not executable: raise SystemExit('Không tìm thấy Chromium/Chrome trong PATH.')
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=executable, args=['--no-sandbox','--disable-gpu'])
        for width, height in ((360,800),(390,844),(430,932)):
            context = browser.new_context(viewport={'width':width,'height':height}, is_mobile=True, has_touch=True)
            page = context.new_page(); page.set_default_timeout(20000)
            errors=[]; page.on('pageerror', lambda error: errors.append(str(error)))
            open_radical_sort(page)
            m = measure(page)
            assert_thumb_friendly(m, width, height)
            page.locator('.hsk-flashcard-study--radical-sort').evaluate("node => node.dataset.selectionPatchMarker = 'kept'")
            page.locator('[data-hsk-radical-item]').first.click(force=True)
            assert page.locator('.hsk-flashcard-study--radical-sort').get_attribute('data-selection-patch-marker') == 'kept'
            page.wait_for_selector('[data-hsk-radical-selected-help]:not([hidden])')
            help_style = page.locator('[data-hsk-radical-selected-help] span').last.evaluate("node => ({clamp:getComputedStyle(node).webkitLineClamp, whiteSpace:getComputedStyle(node).whiteSpace})")
            assert help_style['clamp'] == '2' and help_style['whiteSpace'] == 'normal', help_style
            page.locator('[data-hsk-radical-display-mode="meaning"]').click(force=True)
            token_style = page.locator('.hsk-flashcard-radical-token small').first.evaluate("node => ({clamp:getComputedStyle(node).webkitLineClamp, whiteSpace:getComputedStyle(node).whiteSpace})")
            assert token_style['clamp'] == '2' and token_style['whiteSpace'] == 'normal', token_style
            page.screenshot(path=str(OUT/f'radical-{width}x{height}.png'), full_page=False)
            if width == 390:
                complete_round(page)
                page.wait_for_selector('[data-hsk-radical-complete]')
                complete = page.locator('[data-hsk-radical-complete]').bounding_box()
                empty_bank = page.locator('.hsk-flashcard-radical-bank').bounding_box()
                assert complete and complete['height'] <= 48 and complete['width'] <= 200, complete
                assert empty_bank and empty_bank['height'] <= 64, empty_bank
                page.screenshot(path=str(OUT/'radical-complete-390x844.png'), full_page=False)
            assert not errors, errors
            context.close()
        browser.close()
    print('PASS: Flashcard radical sort thumb-friendly mobile UI, two-line meaning and patched selection')

if __name__ == '__main__': main()

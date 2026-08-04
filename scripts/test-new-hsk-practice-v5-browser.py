#!/usr/bin/env python3
from pathlib import Path
from urllib.parse import urlparse, unquote
import json
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts' / 'new-hsk-practice-v5'
MIMES = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.woff2':'font/woff2','.mp3':'audio/mpeg'}
LESSON = json.loads((ROOT/'modules/new-hsk-course/data/hsk1/lesson-01.json').read_text(encoding='utf-8'))


def local_route(query):
    def handler(route):
        parsed=urlparse(route.request.url)
        if parsed.netloc!='app.test': route.abort(); return
        file_path=ROOT/unquote(parsed.path.lstrip('/'))
        if not file_path.is_file(): route.fulfill(status=404,body=b'not found'); return
        body=file_path.read_bytes()
        if file_path.as_posix().endswith('/modules/new-hsk-course/app.js'):
            source=body.decode('utf-8').replace('const params = new URLSearchParams(window.location.search);',f'const params = new URLSearchParams({query!r});')
            body=source.encode('utf-8')
        route.fulfill(status=200,body=body,content_type=MIMES.get(file_path.suffix.lower(),'application/octet-stream'))
    return handler


def load(page, query='?level=1&lesson=1&view=practice'):
    page.route('**/*',local_route(query))
    html=(ROOT/'modules/new-hsk-course/index.html').read_text(encoding='utf-8')
    html=html.replace('<head>','<head><base href="https://app.test/modules/new-hsk-course/">',1)
    page.set_content(html,wait_until='networkidle')
    page.wait_for_selector('.nhsk-hero')


def ordering_rows():
    turns=[]
    for dialogue in sorted(LESSON['entities']['dialogues'],key=lambda row:row.get('order',0)):
        turns.extend(sorted(dialogue.get('turns',[]),key=lambda row:row.get('order',0)))
    return [row for row in turns if len(row.get('answerTokens') or [])>=2]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    executable=shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome')
    if not executable: raise SystemExit('Không tìm thấy Chromium/Chrome trong PATH.')
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=executable,args=['--no-sandbox','--disable-gpu'])
        context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
        page=context.new_page(); page.set_default_timeout(12000)
        errors=[]; page.on('pageerror',lambda error: errors.append(str(error)))
        load(page)

        # Radical-first remains selected for multiple correct characters.
        page.locator('[data-nhsk-practice="characters"]').click(force=True)
        page.locator('[data-nhsk-character-mode="sort"]').click(force=True)
        page.locator('[data-nhsk-start-practice]').click(force=True)
        group=page.locator('[data-radical-group-select="nhsk-1-01-radical-group-nhan"]')
        group.click(force=True)
        page.locator('[data-radical-item="nhsk-1-01-radical-item-001"]').click(force=True)
        page.wait_for_timeout(80)
        assert page.locator('[data-radical-drop="nhsk-1-01-radical-group-nhan"]').get_attribute('class').find('is-selected')>=0
        page.locator('[data-radical-item="nhsk-1-01-radical-item-002"]').click(force=True)
        page.wait_for_timeout(80)
        placed=page.locator('[data-radical-drop="nhsk-1-01-radical-group-nhan"] .nhsk-radical-placed').inner_text()
        assert '你' in placed and '们' in placed, placed
        page.screenshot(path=str(OUT/'radical-compact-mobile.png'), full_page=True)

        # Ordering supports two visible cards and immediate automatic page advance.
        page.locator('[data-nhsk-practice="ordering"]').click(force=True)
        page.locator('[data-nhsk-practice-setting="ordering-display-count"]').select_option('2')
        page.locator('[data-nhsk-practice-setting="ordering-auto-next"]').select_option('on')
        page.locator('[data-nhsk-practice-setting="ordering-auto-next-delay"]').select_option('0')
        page.locator('[data-nhsk-start-practice]').click(force=True)
        page.wait_for_selector('[data-nhsk-order-item-id]')
        assert page.locator('[data-nhsk-order-item-id]').count()==2
        page.screenshot(path=str(OUT/'ordering-two-cards-mobile.png'), full_page=True)
        rows=ordering_rows()
        for row in rows[:2]:
            card=page.locator(f'[data-nhsk-order-item-id="{row["id"]}"]')
            for token in row['answerTokens']:
                card.locator(f'[data-token-zone="bank"][data-token="{token}"]').click(force=True)
        page.wait_for_timeout(150)
        labels=page.locator('.nhsk-order-card-head>span').all_inner_texts()
        assert labels and labels[0].startswith('Câu 3/'), labels

        # Listen then type invokes the Chinese TTS path and keeps hints hidden.
        page.locator('[data-nhsk-practice="typing"]').click(force=True)
        page.locator('[data-nhsk-typing-mode="listen"]').click(force=True)
        page.evaluate("""() => {
          window.__spoken = [];
          window.speechSynthesis.cancel = () => {};
          window.speechSynthesis.getVoices = () => [];
          window.speechSynthesis.speak = utterance => {
            window.__spoken.push(utterance.text);
            if (utterance.onend) setTimeout(() => utterance.onend(), 0);
          };
        }""")
        page.locator('[data-nhsk-start-practice]').click(force=True)
        play=page.locator('.nhsk-practice-listen-big').first
        play.click(force=True)
        page.wait_for_timeout(50)
        spoken=page.evaluate('window.__spoken')
        assert spoken and spoken[0], spoken
        assert all(node.get_attribute('aria-pressed')=='false' for node in page.locator('[data-nhsk-practice-layer-activity="typingListen"]').all())
        page.screenshot(path=str(OUT/'listen-type-mobile.png'), full_page=True)
        assert not errors, errors
        context.close(); browser.close()
    print('PASS: New HSK practice UX v5 browser behavior')

if __name__=='__main__': main()

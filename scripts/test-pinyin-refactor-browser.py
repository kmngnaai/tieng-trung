#!/usr/bin/env python3
from pathlib import Path
from urllib.parse import urlparse, unquote
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-output' / 'pinyin-content-chart-v2'
OUT.mkdir(parents=True, exist_ok=True)
MIMES = {
    '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json',
    '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp',
    '.woff2':'font/woff2', '.mp3':'audio/mpeg',
}
requested_paths=[]


def route_local(route):
    parsed = urlparse(route.request.url)
    if parsed.netloc != 'app.test':
        route.abort(); return
    requested_paths.append(unquote(parsed.path))
    file_path = ROOT / unquote(parsed.path.lstrip('/'))
    if file_path.is_dir(): file_path = file_path / 'index.html'
    if not file_path.is_file():
        route.fulfill(status=404, body=b'not found'); return
    route.fulfill(status=200, body=file_path.read_bytes(), content_type=MIMES.get(file_path.suffix.lower(), 'application/octet-stream'))


def html_with_base():
    html = (ROOT / 'modules/pinyin/index.html').read_text('utf-8')
    html = '\n'.join(line for line in html.splitlines() if 'fonts.googleapis.com' not in line and 'fonts.gstatic.com' not in line)
    initial = '{"tab":"practice","selected":"ma","tone":3,"learned":{"ma":true},"wrong":{"shi":2},"customLegacyField":"keep-me","progress":{"syllables":{"ma":{"heard":true}},"hanzi":{"legacy":{"learned":true}},"shadowing":{}}}'
    storage = f"""<script>(()=>{{
      let d={{'tiengtrung_pinyin_v12_state':{initial!r}}};
      Object.defineProperty(window,'localStorage',{{configurable:true,value:{{getItem:k=>Object.prototype.hasOwnProperty.call(d,k)?d[k]:null,setItem:(k,v)=>{{d[k]=String(v)}},removeItem:k=>{{delete d[k]}},clear:()=>{{d={{}}}}}}}});
      window.__played=[]; window.__spoken=[];
      Object.defineProperty(HTMLMediaElement.prototype,'play',{{configurable:true,value:function(){{window.__played.push(this.getAttribute('src')||this.src||'');setTimeout(()=>this.dispatchEvent(new Event('ended')),5);return Promise.resolve();}}}});
      Object.defineProperty(HTMLMediaElement.prototype,'pause',{{configurable:true,value:function(){{}}}});
      class FakeUtterance{{constructor(text){{this.text=text;this.lang='';this.voice=null;this.rate=1;this.pitch=1;}}}}
      const zhVoice={{name:'Test Mandarin',lang:'zh-CN'}};
      const synth={{getVoices:()=>[zhVoice],cancel:()=>{{}},addEventListener:()=>{{}},removeEventListener:()=>{{}},speak:u=>{{window.__spoken.push({{text:u.text,lang:u.lang,voice:u.voice&&u.voice.name}});setTimeout(()=>{{if(u.onstart)u.onstart();if(u.onend)u.onend();}},0);}}}};
      Object.defineProperty(window,'SpeechSynthesisUtterance',{{configurable:true,value:FakeUtterance}});
      Object.defineProperty(window,'speechSynthesis',{{configurable:true,value:synth}});
    }})();</script>"""
    return html.replace('<head>', '<head><base href="https://app.test/modules/pinyin/">'+storage, 1)


def load(page):
    page.route('**/*', route_local)
    page.set_content(html_with_base(), wait_until='domcontentloaded')
    page.wait_for_selector('.pinyin-module')


def assert_no_global_overflow(page):
    value = page.evaluate('document.documentElement.scrollWidth-document.documentElement.clientWidth')
    assert value <= 1, value


with sync_playwright() as p:
    executable = shutil.which('chromium') or shutil.which('google-chrome')
    launch = {'headless': True}
    if executable:
        launch.update(executable_path=executable, args=['--no-sandbox'])
    browser = p.chromium.launch(**launch)
    ctx = browser.new_context(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    errors=[]
    page.on('console', lambda msg: errors.append(f'console:{msg.type}:{msg.text}') if msg.type == 'error' else None)
    page.on('pageerror', lambda exc: errors.append(f'pageerror:{exc}'))
    load(page)

    assert page.locator('.pinyin-tab').count()==5
    assert 'Quiz' in page.locator('.pinyin-tab.is-active').inner_text()
    saved=page.evaluate("JSON.parse(localStorage.getItem('tiengtrung_pinyin_v12_state'))")
    assert saved['customLegacyField']=='keep-me'
    assert saved['learned']['ma'] is True and saved['wrong']['shi']==2
    assert saved['progress']['hanzi']['legacy']['learned'] is True
    assert not any(path.endswith('/modules/pinyin/data/hanzi_1000.json') for path in requested_paths), requested_paths

    page.click('[data-action="set-tab"][data-tab="learn"]')
    page.wait_for_selector('.study-card')
    assert page.locator('.group-picker select').count()==1
    option_text=' '.join(page.locator('.group-picker option').all_inner_texts()).lower()
    assert '1.000' not in option_text and '1000' not in option_text and 'chữ hán' not in option_text
    page.screenshot(path=str(OUT/'01-learn-mobile.png'), full_page=True)

    page.click('[data-action="set-tab"][data-tab="listen"]')
    page.wait_for_selector('.selected-syllable')
    assert page.locator('.segment-button').count()==4
    report=page.evaluate('PinyinApp.audio.report()')
    assert report['total']==409 and report['mp3']==402 and report['device']==4 and report['missing']==3 and report['broken']==0, report

    page.click('[data-action="set-listen-mode"][data-mode="chart"]')
    page.wait_for_selector('.pinyin-matrix')
    assert page.locator('[data-matrix-row]').count() >= 20
    assert page.locator('[data-matrix-col]').count() >= 30
    matrix_sizes=page.locator('[data-pinyin-matrix-scroll]').evaluate('(el)=>({scroll:el.scrollWidth,client:el.clientWidth})')
    assert matrix_sizes['scroll'] > matrix_sizes['client'], matrix_sizes
    assert_no_global_overflow(page)

    page.click('.matrix-tone-toolbar [data-action="set-tone"][data-tone="4"]')
    page.wait_for_selector('[data-matrix-safe="den"] .is-device, [data-matrix-safe="den"].is-device')
    den_button=page.locator('[data-matrix-safe="den"] button').first
    den_button.click()
    page.wait_for_timeout(30)
    spoken=page.evaluate('window.__spoken')
    assert spoken and spoken[-1]['text']=='扽' and spoken[-1]['lang'].lower().startswith('zh'), spoken
    assert page.locator('[data-matrix-safe="den"].is-selected').count() >= 1

    before=len(spoken)
    page.locator('[data-matrix-safe="tei"] button').first.click()
    page.wait_for_timeout(30)
    assert len(page.evaluate('window.__spoken'))==before
    assert 'cần xác minh' in page.locator('[data-pinyin-toast]').inner_text().lower()

    page.click('.matrix-tone-toolbar [data-action="set-tone"][data-tone="1"]')
    page.locator('[data-matrix-safe="chua"] button').first.click()
    page.wait_for_timeout(30)
    spoken=page.evaluate('window.__spoken')
    assert spoken[-1]['text']=='欻的一声', spoken

    page.click('.matrix-tone-toolbar [data-action="set-tone"][data-tone="4"]')
    page.locator('[data-matrix-safe="ma"] button').first.click()
    page.wait_for_timeout(20)
    assert any(value.endswith('audio/ma4.mp3') for value in page.evaluate('window.__played'))
    page.screenshot(path=str(OUT/'02-chart-mobile.png'), full_page=True)

    page.click('[data-action="set-listen-mode"][data-mode="tables"]')
    page.wait_for_selector('.mini-table')
    first=page.locator('.mini-table').first
    first.locator('summary').click()
    assert first.get_attribute('open') is not None
    first.locator('.matrix-value.is-mp3 button').first.click()
    page.wait_for_timeout(20)
    assert first.get_attribute('open') is not None, 'Mini table closed after playing a cell'
    stored_open=page.evaluate("JSON.parse(localStorage.getItem('tiengtrung_pinyin_v12_state')).ui.openMiniTables['1']")
    assert stored_open is True
    page.click('.matrix-tone-toolbar [data-action="set-tone"][data-tone="2"]')
    page.wait_for_selector('.mini-table')
    assert page.locator('.mini-table').first.get_attribute('open') is not None, 'Open table state was lost after rerender'
    assert page.locator('.mini-table-notes').count()==18
    table5=page.evaluate("PinyinApp.screens.listen.tableSafes(PinyinApp.model.pinyin.miniTables.find(x=>Number(x.no)===5))")
    assert 'den' not in table5, table5
    page.screenshot(path=str(OUT/'03-tables-mobile.png'), full_page=True)

    page.click('[data-action="set-listen-mode"][data-mode="rules"]')
    page.wait_for_selector('.rule-category')
    assert page.locator('.rule-category').count()==5
    assert page.locator('.rule-detail').count()>=20
    page.screenshot(path=str(OUT/'04-rules-mobile.png'), full_page=True)

    missing=['den','tei','nou','nve','kei','chua','rua']
    pools=page.evaluate("PinyinApp.data.learningGroups().filter(g=>g.contentType==='syllable').flatMap(g=>PinyinApp.screens.quiz.quizPool(g.id).map(x=>x.safe))")
    assert all(safe not in pools for safe in missing), sorted(set(pools).intersection(missing))
    audits=page.evaluate("(PinyinApp.model.shadowing.sentences||[]).map(x=>PinyinApp.audio.inspectShadowing(x))")
    assert all('ready' in row and 'missing' in row for row in audits)
    assert any((not row['ready']) and row['missing'] for row in audits)

    page.click('[data-action="set-tab"][data-tab="quiz"]')
    if page.locator('[data-action="start-quiz"]').count(): page.locator('[data-action="start-quiz"]').first.click()
    page.wait_for_selector('.quiz-card')
    assert page.locator('.quiz-option').count()==4
    page.screenshot(path=str(OUT/'05-quiz-mobile.png'), full_page=True)

    page.click('[data-action="set-tab"][data-tab="review"]')
    page.wait_for_selector('.review-tabs')
    assert page.locator('.review-tab').count()==7
    page.screenshot(path=str(OUT/'06-review-mobile.png'), full_page=True)
    page.click('[data-action="set-tab"][data-tab="progress"]')
    page.wait_for_selector('.metric-grid')
    assert page.locator('.metric-card').count()==4
    assert '406/409' in page.locator('.audio-progress-summary').inner_text()
    page.screenshot(path=str(OUT/'07-progress-mobile.png'), full_page=True)
    assert_no_global_overflow(page)
    assert not errors, '\n'.join(errors)
    ctx.close()

    for width, height in [(360, 800), (430, 932)]:
        extra = browser.new_context(viewport={'width': width, 'height': height}, is_mobile=True, has_touch=True)
        mobile = extra.new_page(); load(mobile)
        mobile.click('[data-action="set-tab"][data-tab="listen"]')
        mobile.click('[data-action="set-listen-mode"][data-mode="chart"]')
        mobile.wait_for_selector('.pinyin-matrix')
        assert_no_global_overflow(mobile)
        sizes=mobile.locator('[data-pinyin-matrix-scroll]').evaluate('(el)=>({scroll:el.scrollWidth,client:el.clientWidth})')
        assert sizes['scroll'] > sizes['client']
        extra.close()

    desktop_ctx = browser.new_context(viewport={'width': 1280, 'height': 900})
    desktop = desktop_ctx.new_page(); load(desktop)
    desktop.click('[data-action="set-tab"][data-tab="listen"]')
    desktop.click('[data-action="set-listen-mode"][data-mode="chart"]')
    desktop.wait_for_selector('.pinyin-matrix')
    assert_no_global_overflow(desktop)
    desktop.screenshot(path=str(OUT/'08-chart-desktop.png'), full_page=True)
    desktop_ctx.close(); browser.close()
print('Pinyin Content & Chart V2 browser: PASS')

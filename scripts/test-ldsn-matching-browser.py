#!/usr/bin/env python3
from pathlib import Path
from urllib.parse import urlparse, unquote
import shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-output'/'matching-v1'; OUT.mkdir(parents=True,exist_ok=True)
MIMES={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'}

def route_local(route):
    parsed=urlparse(route.request.url)
    if parsed.netloc!='app.test': route.abort(); return
    f=ROOT/unquote(parsed.path.lstrip('/'))
    if not f.is_file(): route.fulfill(status=404,body=b'not found'); return
    body=f.read_bytes()
    if f.as_posix().endswith('/modules/ldsn14/app.js'):
        body=body.decode('utf-8').replace('new URLSearchParams(location.search)', "new URLSearchParams('?lesson=1&tab=practice')").encode('utf-8')
    route.fulfill(status=200,body=body,content_type=MIMES.get(f.suffix.lower(),'application/octet-stream'))

def main():
    exe=shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome')
    if not exe: raise SystemExit('Chromium not found')
    with sync_playwright() as p:
        b=p.chromium.launch(headless=True,executable_path=exe,args=['--no-sandbox','--disable-gpu'])
        c=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
        page=c.new_page(); page.route('**/*',route_local)
        html=(ROOT/'modules/ldsn14/index.html').read_text('utf-8').replace('<head>','<head><base href="https://app.test/modules/ldsn14/">',1)
        page.set_content(html,wait_until='networkidle')
        page.wait_for_selector('.ldsn-section--matching',timeout=15000)
        assert page.locator('[data-ldsn-matching-type]').count() >= 3
        assert 2 <= page.locator('.ldsn-section--matching .tt-match-card--left').count() <= 5
        page.locator('[data-ldsn-matching-type="dialogue"]').click()
        page.wait_for_timeout(100)
        assert page.locator('.ldsn-section--matching .tt-match-card--left').count() <= 3
        page.screenshot(path=str(OUT/'ldsn-matching-mobile.png'),full_page=True)
        dims=page.evaluate('() => ({s:document.documentElement.scrollWidth,c:document.documentElement.clientWidth})')
        assert dims['s'] <= dims['c']+1,dims
        c.close(); b.close()
    print('PASS: LDSN shared matching engine mobile flow')
if __name__=='__main__': main()

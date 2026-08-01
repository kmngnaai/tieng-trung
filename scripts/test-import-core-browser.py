from playwright.sync_api import sync_playwright
from pathlib import Path
from urllib.parse import urlparse, unquote
import json
ROOT = Path(__file__).resolve().parents[1]
MIMES={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.csv':'text/csv','.txt':'text/plain','.woff2':'font/woff2'}
def route_local(route):
    parsed=urlparse(route.request.url)
    if parsed.netloc!='app.test': route.abort(); return
    p=ROOT/unquote(parsed.path.lstrip('/'))
    if p.is_dir(): p=p/'index.html'
    if not p.is_file(): route.fulfill(status=404,body=b'not found'); return
    route.fulfill(status=200,body=p.read_bytes(),content_type=MIMES.get(p.suffix.lower(),'application/octet-stream'))
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium')
    page=browser.new_page()
    page.route('**/*', route_local)
    html=(ROOT/'modules/listening/index.html').read_text('utf-8').replace('<head>','<head><base href="https://app.test/modules/listening/">',1)
    page.set_content(html, wait_until='domcontentloaded')
    page.wait_for_function('window.TiengTrungImportCore && window.JSZip')
    result=page.evaluate('''async () => {
      const cases = [
        ['listening','xlsx','https://app.test/modules/listening/templates/nghe-mau-day-du.xlsx'],
        ['listening','csv','https://app.test/modules/listening/templates/nghe-mau-day-du.csv'],
        ['listening','txt','https://app.test/modules/listening/templates/nghe-mau-day-du.txt'],
        ['listening','json','https://app.test/modules/listening/templates/nghe-mau-day-du.json'],
        ['flashcard','xlsx','https://app.test/modules/hanzi-stroke/templates/flashcards/the-mau-day-du.xlsx'],
        ['flashcard','csv','https://app.test/modules/hanzi-stroke/templates/flashcards/the-mau-day-du.csv'],
        ['flashcard','txt','https://app.test/modules/hanzi-stroke/templates/flashcards/the-mau-day-du.txt'],
        ['flashcard','json','https://app.test/modules/hanzi-stroke/templates/flashcards/the-mau-day-du.json']
      ];
      const out=[];
      for (const [kind,ext,path] of cases){
        const response=await fetch(path);
        const blob=await response.blob();
        const file=new File([blob], path.split('/').pop(), {type: blob.type});
        const parsed=await window.TiengTrungImportCore.readFile(file);
        const built=kind==='listening' ? window.TiengTrungImportCore.buildListeningImport(parsed) : window.TiengTrungImportCore.buildFlashcardImport(parsed);
        const validation = kind==='listening' && built.decks?.[0] ? window.ListeningSourceAdapters.validateDataset(built.decks[0].dataset) : null; out.push({kind,ext,format:parsed.format,sheets:(parsed.sheets||[]).map(s=>s.name),stats:built.stats,errors:built.errors,warnings:built.warnings,validation});
      }
      return out;
    }''')
    print(json.dumps(result,ensure_ascii=False,indent=2))
    for row in result:
      assert not row['errors'], row
      if row['kind']=='listening':
        assert row['stats']['deckCount']>=1 and row['stats']['wordCount']>=1 and row['stats']['sentenceCount']>=1,row
        assert row['validation']['ok'], row
      else: assert row['stats']['deckCount']>=1 and row['stats']['cardCount']>=1,row
    browser.close()
print('PASS import formats')

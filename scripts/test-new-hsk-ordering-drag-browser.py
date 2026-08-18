#!/usr/bin/env python3
from pathlib import Path
from urllib.parse import unquote, urlparse
import json

from playwright.sync_api import sync_playwright

from browser_runtime import click_centered, require_browser_executable, replace_location_search

ROOT = Path(__file__).resolve().parents[1]
LESSON = json.loads((ROOT / 'modules/new-hsk-course/data/hsk1/lesson-01.json').read_text(encoding='utf-8'))
MIMES = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg'
}


def local_route(query):
    def handler(route):
        parsed = urlparse(route.request.url)
        if parsed.netloc != 'app.test':
            route.abort()
            return
        file_path = ROOT / unquote(parsed.path.lstrip('/'))
        if not file_path.is_file():
            route.fulfill(status=404, body=b'not found')
            return
        body = file_path.read_bytes()
        if file_path.as_posix().endswith('/modules/new-hsk-course/app.js'):
            body = replace_location_search(body.decode('utf-8'), query).encode('utf-8')
        route.fulfill(status=200, body=body, content_type=MIMES.get(file_path.suffix.lower(), 'application/octet-stream'))
    return handler


def load(page, query='?level=1&lesson=1&view=practice'):
    page.route('**/*', local_route(query))
    html = (ROOT / 'modules/new-hsk-course/index.html').read_text(encoding='utf-8')
    html = html.replace('<head>', '<head><base href="https://app.test/modules/new-hsk-course/">', 1)
    page.set_content(html, wait_until='networkidle')
    page.wait_for_selector('.nhsk-hero')
    click_centered(page.locator('[data-nhsk-practice="ordering"]'))
    page.locator('[data-nhsk-practice-setting="ordering-display-count"]').select_option('1')
    page.locator('[data-nhsk-practice-setting="ordering-auto-next"]').select_option('off')
    click_centered(page.locator('[data-nhsk-start-practice]'))
    page.wait_for_selector('[data-nhsk-order-item-id]')


def first_ordering_row():
    for dialogue in sorted(LESSON['entities']['dialogues'], key=lambda row: row.get('order', 0)):
        for turn in sorted(dialogue.get('turns', []), key=lambda row: row.get('order', 0)):
            tokens = turn.get('orderingTokens') or turn.get('answerTokens') or []
            if len(tokens) >= 3:
                return turn, tokens
    raise AssertionError('No orderable row with >= 3 tokens')


def token_texts(locator):
    return [text.strip() for text in locator.all_inner_texts()]


def main():
    executable = require_browser_executable()
    row, tokens = first_ordering_row()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=executable, args=['--no-sandbox', '--disable-gpu'])

        # Desktop HTML5 drag: bank -> answer, reorder in answer, answer -> bank.
        context = browser.new_context(viewport={'width': 980, 'height': 760})
        page = context.new_page()
        page.set_default_timeout(12000)
        load(page)
        card = page.locator(f'[data-nhsk-order-item-id="{row["id"]}"]')
        answer = card.locator('[data-nhsk-order-answer]')
        bank = card.locator('[data-nhsk-order-bank]')

        bank.locator(f'[data-token="{tokens[0]}"]').drag_to(answer)
        assert token_texts(answer.locator('[data-token-zone="answer"]')) == [tokens[0]]

        bank.locator(f'[data-token="{tokens[1]}"]').drag_to(answer)
        assert token_texts(answer.locator('[data-token-zone="answer"]')) == tokens[:2]

        answer.locator(f'[data-token="{tokens[1]}"]').drag_to(answer.locator(f'[data-token="{tokens[0]}"]'))
        assert token_texts(answer.locator('[data-token-zone="answer"]')) == [tokens[1], tokens[0]]

        answer.locator(f'[data-token="{tokens[1]}"]').drag_to(bank)
        assert token_texts(answer.locator('[data-token-zone="answer"]')) == [tokens[0]]
        assert tokens[1] in token_texts(bank.locator('[data-token-zone="bank"]'))
        context.close()

        # Mobile/pointer path: dragging must keep viewport stable and click fallback must remain usable.
        context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        page = context.new_page()
        page.set_default_timeout(12000)
        load(page)
        card = page.locator(f'[data-nhsk-order-item-id="{row["id"]}"]')
        card.scroll_into_view_if_needed()
        page.evaluate('window.scrollBy(0, 120)')
        before_scroll = page.evaluate('window.scrollY')
        source = card.locator(f'[data-token-zone="bank"][data-token="{tokens[0]}"]')
        target = card.locator('[data-nhsk-order-answer]')
        source_box = source.bounding_box()
        target_box = target.bounding_box()
        assert source_box and target_box
        sx, sy = source_box['x'] + source_box['width'] / 2, source_box['y'] + source_box['height'] / 2
        tx, ty = target_box['x'] + target_box['width'] / 2, target_box['y'] + target_box['height'] / 2
        page.mouse.move(sx, sy)
        page.mouse.down()
        page.mouse.move(tx, ty, steps=8)
        page.mouse.up()
        page.wait_for_timeout(120)
        assert token_texts(card.locator('[data-nhsk-order-answer] [data-token-zone="answer"]')) == [tokens[0]]
        assert abs(page.evaluate('window.scrollY') - before_scroll) <= 2

        # A normal tap after drag still follows the existing item.selected click behavior.
        click_centered(card.locator(f'[data-token-zone="bank"][data-token="{tokens[1]}"]'))
        assert token_texts(card.locator('[data-nhsk-order-answer] [data-token-zone="answer"]')) == tokens[:2]
        context.close()
        browser.close()

    print('PASS: New HSK ordering supports desktop/mobile drag, answer reorder/removal, stable scroll and click fallback')


if __name__ == '__main__':
    main()

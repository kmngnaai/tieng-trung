#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STYLE = (ROOT / 'modules/ldsn14/style.css').read_text(encoding='utf-8')
APP = (ROOT / 'modules/ldsn14/app.js').read_text(encoding='utf-8')
HTML = (ROOT / 'modules/ldsn14/index.html').read_text(encoding='utf-8')


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    for token in [
        '--ldsn-green:', '--ldsn-blue:', '--ldsn-lilac:', '--ldsn-peach:',
        '--ldsn-butter:', '--ldsn-rose:', '--ldsn-section-accent:', '--ldsn-section-soft:'
    ]:
        require(token in STYLE, f'Missing semantic pastel token: {token}')

    require(STYLE.count('.ldsn-section {') == 1, 'Section theme must be defined once, not patched repeatedly')
    require(STYLE.count('.ldsn-tab.is-active {') == 1, 'Active tab theme must be defined once')
    require(STYLE.count('.ldsn-dialogue-turn.speaker-a {') == 1, 'Speaker A theme must be defined once')
    require(STYLE.count('.ldsn-dialogue-turn.speaker-b {') == 1, 'Speaker B theme must be defined once')

    for selector in [
        '.ldsn-section--vocab', '.ldsn-section--warmup', '.ldsn-section--grammar',
        '.ldsn-section--fill', '.ldsn-section--sentence', '.ldsn-section--reverse',
        '.ldsn-section--dialogue', '.ldsn-section--passage', '.ldsn-section--challenge',
        '.ldsn-section--content', '.ldsn-section--review'
    ]:
        require(selector in STYLE, f'Missing semantic section theme: {selector}')

    for tab in ['practice', 'dialogue', 'content', 'review']:
        require(f'.ldsn-tab[data-tab="{tab}"]' in STYLE, f'Missing tab pastel theme: {tab}')

    for index in range(1, 6):
        pattern = f'.ldsn-lesson-card:nth-child(5n + {index})' if index < 5 else '.ldsn-lesson-card:nth-child(5n)'
        require(pattern in STYLE, f'Missing lesson-card pastel cycle: {pattern}')

    require('data-active-tab="${activeTab}"' in APP, 'Lesson panel must expose the active semantic tab')
    require('ldsn-section--review' in APP, 'Review panel must use the shared semantic section theme')
    require('style.css?v=20260731-ldsn6.3-pastel1' in HTML, 'Pastel CSS cache version missing')
    require('app.js?v=20260731-ldsn6.3-pastel1' in HTML, 'Pastel app cache version missing')
    print('PASS: LDSN1-4 semantic pastel theme contract')


if __name__ == '__main__':
    main()

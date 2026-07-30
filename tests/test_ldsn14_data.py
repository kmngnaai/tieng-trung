#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'modules' / 'ldsn14' / 'data' / 'lessons.json'


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    payload = json.loads(DATA.read_text(encoding='utf-8'))
    lessons = payload.get('lessons', [])
    require(len(lessons) == 10, f'Expected 10 lessons, got {len(lessons)}')

    for expected_number, lesson in enumerate(lessons, 1):
        require(lesson['lessonNumber'] == expected_number, f'Wrong order at lesson {expected_number}')
        require(all(lesson['title'].get(key) for key in ('vi', 'hanzi', 'pinyin')), f'Missing title layer in lesson {expected_number}')
        require(lesson['vocabulary'], f'No vocabulary in lesson {expected_number}')
        require(lesson['dialogue'], f'No dialogue in lesson {expected_number}')
        require(lesson['grammar'], f'No grammar in lesson {expected_number}')
        require(all(lesson['passage'].get(key) for key in ('hanzi', 'pinyin', 'vi')), f'Missing passage layer in lesson {expected_number}')

        for word in lesson['vocabulary']:
            require(all(word.get(key) for key in ('hanzi', 'pinyin', 'vi')), f'Incomplete vocabulary {word} in lesson {expected_number}')
        for direction in ('zhVi', 'viZh'):
            for group in ('questions', 'answers'):
                rows = lesson['translation'][direction][group]
                require(len(rows) == 3, f'{direction}/{group} must have 3 rows in lesson {expected_number}')
                require(all(all(row.get(key) for key in ('hanzi', 'pinyin', 'vi')) for row in rows), f'Incomplete sentence in lesson {expected_number}')
        require(all(all(turn.get(key) for key in ('speaker', 'hanzi', 'pinyin', 'vi')) for turn in lesson['dialogue']), f'Incomplete dialogue in lesson {expected_number}')

    index_html = (ROOT / 'index.html').read_text(encoding='utf-8')
    shell_js = (ROOT / 'modules' / 'shared' / 'app-shell.js').read_text(encoding='utf-8')
    module_html = (ROOT / 'modules' / 'ldsn14' / 'index.html').read_text(encoding='utf-8')
    module_js = (ROOT / 'modules' / 'ldsn14' / 'app.js').read_text(encoding='utf-8')

    require('modules/ldsn14/index.html' in index_html, 'Home page is missing LDSN1-4 link')
    require("ldsn14: new URL('modules/ldsn14/index.html'" in shell_js, 'App shell route is missing')
    require("drawerLink('译', 'LDSN1-4'" in shell_js, 'Drawer menu entry is missing')
    require('data-ui-shell-main' in module_html, 'Module does not use shared app shell')
    require("roleplayMode: 'typing'" in module_js and 'SETTINGS_KEY' in module_js, 'Persistent roleplay mode is missing')
    require('data-speak' in module_js and 'SpeechSynthesisUtterance' in module_js, 'Speech controls are missing')
    require(re.search(r"\['auto', 'Tự động'\].*\['custom', 'Tự chọn'\]", module_js, re.S), 'Vocabulary amount options are incomplete')

    print('PASS: LDSN1-4 data and integration checks')
    print('Lessons:', len(lessons))
    print('Vocabulary:', sum(len(item['vocabulary']) for item in lessons))
    print('Dialogue turns:', sum(len(item['dialogue']) for item in lessons))
    print('Grammar points:', sum(len(item['grammar']) for item in lessons))


if __name__ == '__main__':
    main()

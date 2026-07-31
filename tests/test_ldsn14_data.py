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


def normalize_hanzi(value: str) -> str:
    return re.sub(r'[\s，。！？；：、“”‘’…,.!?;:\'"()（）《》〈〉【】\[\]—-]+', '', value or '')


def sentence_rows(lesson: dict) -> list[dict]:
    rows: list[dict] = []
    for direction in ('zhVi', 'viZh'):
        for group in ('questions', 'answers'):
            rows.extend(lesson['translation'][direction][group])
    rows.extend(lesson['dialogue'])
    rows.extend(lesson['passage']['sentences'])
    return rows


def main() -> None:
    payload = json.loads(DATA.read_text(encoding='utf-8'))
    lessons = payload.get('lessons', [])
    require(payload.get('schemaVersion') == 'ldsn14.v6', 'LDSN V6 schema marker is missing')
    require(len(lessons) == 10, f'Expected 10 lessons, got {len(lessons)}')

    expected_flow = [
        'vocabulary', 'zhViQuestions', 'zhViAnswers', 'dialogue', 'dialogueGrammar',
        'viZhQuestions', 'viZhAnswers', 'passage', 'passageGrammar'
    ]
    for expected_number, lesson in enumerate(lessons, 1):
        require(lesson['lessonNumber'] == expected_number, f'Wrong order at lesson {expected_number}')
        require([row['type'] for row in lesson.get('contentFlow', [])] == expected_flow, f'Wrong contentFlow in lesson {expected_number}')
        require(lesson['vocabulary'], f'No vocabulary in lesson {expected_number}')
        require(lesson['dialogue'], f'No dialogue in lesson {expected_number}')
        require(lesson['grammar'], f'No grammar in lesson {expected_number}')
        for row in sentence_rows(lesson):
            if not row.get('hanzi'):
                continue
            tokens = row.get('answerTokens')
            require(isinstance(tokens, list) and tokens, f'Missing answerTokens for {row.get("id")} in lesson {expected_number}')
            require(''.join(tokens) == normalize_hanzi(row['hanzi']), f'Tokens do not rebuild sentence {row.get("id")}')
        for grammar in lesson['grammar']:
            groups = grammar.get('groups')
            require(isinstance(groups, list) and groups, f'Grammar groups missing: {grammar.get("id")}')
            for group in groups:
                require(group.get('title'), f'Grammar subgroup title missing: {grammar.get("id")}')
                require(isinstance(group.get('notes'), list), f'Grammar notes invalid: {grammar.get("id")}')
                require(isinstance(group.get('examples'), list), f'Grammar examples invalid: {grammar.get("id")}')
                require(not any(str(note).lstrip().lower().startswith('ví dụ:') for note in group.get('notes', [])), f'Grammar example was flattened into notes: {grammar.get("id")}')
                for example in group.get('examples', []):
                    require(example.get('hanzi') and example.get('pinyin') and example.get('vi'), f'Grammar example must keep Hanzi, pinyin and Vietnamese: {grammar.get("id")}')

    lesson1 = lessons[0]
    sample = lesson1['translation']['viZh']['questions'][0]
    require(sample['answerTokens'] == ['你好', '请问', '你', '认识', '王教授', '吗'], f'Unexpected sample tokens: {sample["answerTokens"]}')
    long_tokens = lesson1['passage']['sentences'][2]['answerTokens']
    require(not {'好请', '问你', '得了中'}.intersection(long_tokens), f'Invalid fabricated tokens remain: {long_tokens}')


    grammar_keyi = next(item for item in lesson1['grammar'] if item['id'] == 'ldsn-01-grammar-dialogue-01')
    require(len(grammar_keyi['groups']) == 4, '可以 must keep four separate usage groups')
    for index, group in enumerate(grammar_keyi['groups'], 1):
        require(len(group.get('examples', [])) == 1, f'可以 usage {index} must have its own example object')
        example = group['examples'][0]
        require(example.get('hanzi') and example.get('pinyin') and example.get('vi'), f'可以 usage {index} example must keep Hanzi, pinyin and Vietnamese')
        require(not any(str(note).startswith('Ví dụ:') for note in group.get('notes', [])), f'可以 usage {index} must not flatten the example into notes')

    grammar_41 = next(item for item in lesson1['grammar'] if item['id'] == 'ldsn-01-grammar-passage-01')
    require([g['title'] for g in grammar_41['groups']] == [
        '虽然..., 但/但是... - mặc dù..., nhưng...', '听上去 - tīng shangqu', '却 - què'
    ], 'Grammar 4.1 grouping does not follow Markdown')
    grammar_43 = next(item for item in lesson1['grammar'] if item['id'] == 'ldsn-01-grammar-passage-03')
    require([g['title'] for g in grammar_43['groups']] == ['Trợ từ kết cấu 地', 'Trợ từ động thái 了'], 'Grammar 4.3 must separate 地 and 了')

    module_js = (ROOT / 'modules' / 'ldsn14' / 'app.js').read_text(encoding='utf-8')
    hsk_js = (ROOT / 'modules' / 'hanzi-stroke' / 'app.js').read_text(encoding='utf-8')
    hsk_html = (ROOT / 'modules' / 'hanzi-stroke' / 'index.html').read_text(encoding='utf-8')
    ldsn_html = (ROOT / 'modules' / 'ldsn14' / 'index.html').read_text(encoding='utf-8')
    require('style.css?v=20260731-ldsn6' in ldsn_html and 'app.js?v=20260731-ldsn6' in ldsn_html, 'LDSN V6 assets are not cache-busted')
    require('answerTokens = []' in module_js, 'Ordering renderer does not consume precomputed answerTokens')
    require("HSK_EXTERNAL_FLASHCARD_KEY" in module_js and "externalFlashcards" in module_js, 'LDSN does not launch the HSK flashcard engine')
    require('launchExternalFlashcardsFromStorage' in hsk_js, 'HSK external flashcard bridge is missing')
    require('launchEmbeddedPopupFromStorage' in hsk_js, 'Shared HSK word-detail bridge is missing')
    require('ldsn-grammar-group' in module_js, 'Grammar group renderer is missing')
    require('currentLesson.contentFlow' in module_js, 'Content tab does not render contentFlow')
    require('style.css?v=20260718-deckmultiselect1&ldsn=20260731-5' in hsk_html and 'app.js?v=20260718-deckmultiselect1&ldsn=20260731-5' in hsk_html, 'HSK V5 assets are not cache-busted')

    print('PASS: LDSN1-4 V6 data, token, grammar and HSK bridge checks')
    print('Lessons:', len(lessons))
    print('Vocabulary:', sum(len(item['vocabulary']) for item in lessons))
    print('Dialogue turns:', sum(len(item['dialogue']) for item in lessons))
    print('Grammar points:', sum(len(item['grammar']) for item in lessons))


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / 'modules' / 'ldsn14' / 'data' / 'lessons.json'
LOOKUP_PATH = ROOT / 'modules' / 'hanzi-stroke' / 'data' / 'learning' / 'hsk' / 'hsk_flashcard_lookup.json'
MD_DIR = ROOT / 'modules' / 'ldsn14' / 'source'

HAN_RE = re.compile(r'[\u3400-\u9fff]')
PUNCT_RE = re.compile(r'[\s，。！？；：、“”‘’…,.!?;:\'"()（）《》〈〉【】\[\]—-]+')
HEADING_RE = re.compile(r'^(#{1,6})\s+(.*)$')


def clean_line(line: str) -> str:
    return line.strip()


def strip_number_prefix(title: str) -> str:
    return re.sub(r'^\s*\d+(?:\.\d+)*[.)]?\s*', '', title).strip()


def strip_inline_markup(text: str) -> str:
    value = str(text or '').strip()
    value = value.replace('`', '')
    value = re.sub(r'\*\*(.*?)\*\*', r'\1', value)
    return value.strip()


def parse_example_field(line: str) -> tuple[str, str] | None:
    text = line.strip()
    if text.startswith('- '):
        text = text[2:].strip()
    match = re.match(r'^\*\*(Chữ Hán|Pinyin|Nghĩa|Tiếng Việt|Ví dụ):\*\*\s*(.*)$', text, re.I)
    if not match:
        return None
    key = match.group(1).lower()
    value = match.group(2).strip()
    if key in {'chữ hán', 'ví dụ'}:
        return ('hanzi', value)
    if key == 'pinyin':
        return ('pinyin', value)
    return ('vi', value)


def parse_grammar_sections(md_path: Path) -> dict[str, list[dict[str, Any]]]:
    lines = md_path.read_text(encoding='utf-8').splitlines()
    source: str | None = None
    in_grammar = False
    result: dict[str, list[dict[str, Any]]] = {'dialogue': [], 'passage': []}
    current_item: dict[str, Any] | None = None
    current_group: dict[str, Any] | None = None
    pending_example: dict[str, str] | None = None

    def ensure_group(title: str | None = None) -> dict[str, Any]:
        nonlocal current_group
        if current_item is None:
            raise RuntimeError(f'Grammar group outside item in {md_path.name}')
        if current_group is None:
            current_group = {
                'title': (title or strip_number_prefix(current_item['title'])).strip(),
                'notes': [],
                'structure': '',
                'examples': [],
            }
            current_item['groups'].append(current_group)
        return current_group

    def flush_example() -> None:
        nonlocal pending_example
        if not pending_example:
            return
        if pending_example.get('hanzi'):
            group = ensure_group()
            group['examples'].append({
                'hanzi': pending_example.get('hanzi', ''),
                'pinyin': pending_example.get('pinyin', ''),
                'vi': pending_example.get('vi', ''),
            })
        pending_example = None

    def flush_item() -> None:
        nonlocal current_item, current_group
        flush_example()
        if current_item is not None and source:
            current_item['groups'] = [g for g in current_item['groups'] if g['notes'] or g['examples'] or g['structure']]
            if not current_item['groups']:
                current_item['groups'] = [{
                    'title': strip_number_prefix(current_item['title']),
                    'notes': [],
                    'structure': '',
                    'examples': [],
                }]
            result[source].append(current_item)
        current_item = None
        current_group = None

    for raw in lines:
        line = clean_line(raw)
        heading = HEADING_RE.match(line)
        if heading:
            level = len(heading.group(1))
            title = heading.group(2).strip()
            if level == 1 and title.lower().startswith('phần 2'):
                flush_item()
                source = 'dialogue'
                in_grammar = False
                continue
            if level == 1 and title.lower().startswith('phần 3'):
                flush_item()
                source = 'passage'
                in_grammar = False
                continue
            if level == 1:
                if in_grammar:
                    flush_item()
                in_grammar = False
                continue
            if level == 2:
                if re.match(r'4\.\s*ngữ pháp$', title, re.I):
                    flush_item()
                    in_grammar = True
                elif in_grammar:
                    flush_item()
                    in_grammar = False
                continue
            if not in_grammar or not source:
                continue
            if level == 3:
                flush_item()
                current_item = {'title': title, 'groups': []}
                current_group = None
                continue
            if level == 4 and current_item is not None:
                flush_example()
                current_group = {
                    'title': title,
                    'notes': [],
                    'structure': '',
                    'examples': [],
                }
                current_item['groups'].append(current_group)
                continue

        if not in_grammar or current_item is None or not line or line == '---':
            continue
        if line.lower().startswith('**ví dụ') or line.lower() == 'ví dụ:':
            flush_example()
            continue
        structure_match = re.match(r'^\*\*Cấu trúc:\*\*\s*`?(.*?)`?$', line, re.I)
        if structure_match:
            ensure_group()['structure'] = structure_match.group(1).strip()
            continue
        field = parse_example_field(line)
        if field:
            key, value = field
            if key == 'hanzi':
                flush_example()
                pending_example = {'hanzi': value, 'pinyin': '', 'vi': ''}
            else:
                if pending_example is None:
                    pending_example = {'hanzi': '', 'pinyin': '', 'vi': ''}
                pending_example[key] = value
                if key == 'vi':
                    flush_example()
            continue
        if line.startswith('- '):
            flush_example()
            note = strip_inline_markup(line[2:].strip())
            if note:
                ensure_group()['notes'].append(note)
            continue
        if line.startswith('`') and line.endswith('`'):
            ensure_group()['structure'] = line.strip('`').strip()
            continue
        # Preserve explanatory paragraphs from the Markdown instead of discarding them.
        if not line.startswith('>'):
            flush_example()
            ensure_group()['notes'].append(strip_inline_markup(line))

    flush_item()
    return result


def normalize_sentence(text: str) -> str:
    return PUNCT_RE.sub('', str(text or ''))


def build_dictionary(payload: dict[str, Any]) -> set[str]:
    words: set[str] = set()
    for lesson in payload['lessons']:
        for row in lesson.get('vocabulary', []):
            word = str(row.get('hanzi', '')).strip()
            if word:
                words.add(word)
        for turn in lesson.get('dialogue', []):
            speaker = ''.join(HAN_RE.findall(str(turn.get('speaker', ''))))
            if speaker:
                words.add(speaker)
                # Names and titles are useful answer units, but avoid whole long labels.
                if len(speaker) <= 4:
                    words.add(speaker)
    try:
        lookup = json.loads(LOOKUP_PATH.read_text(encoding='utf-8'))
        items = lookup.get('items', {})
        if isinstance(items, dict):
            words.update(key for key in items if 1 <= len(key) <= 7 and HAN_RE.search(key))
    except Exception:
        pass
    words.update({
        '你好', '您好', '请问', '大家好', '没关系', '不客气', '对不起', '谢谢',
        '王教授', '张教授', '李老师', '王老师', '中国政府', '北京大学',
        '国际教育学院', '汉语国际教育', '奖学金', '有时候', '越来越',
        '虽然', '但是', '特别是', '听上去', '原来是这样', '一会儿',
    })
    return {word for word in words if word and not PUNCT_RE.search(word)}


def segment_sentence(text: str, dictionary: set[str]) -> list[str]:
    clean = normalize_sentence(text)
    if not clean:
        return []
    max_len = min(7, max((len(word) for word in dictionary), default=1))
    tokens: list[str] = []
    i = 0
    while i < len(clean):
        char = clean[i]
        if char.isascii() and char.isalnum():
            j = i + 1
            while j < len(clean) and clean[j].isascii() and clean[j].isalnum():
                j += 1
            tokens.append(clean[i:j])
            i = j
            continue
        matched = ''
        for size in range(min(max_len, len(clean) - i), 1, -1):
            candidate = clean[i:i + size]
            if candidate in dictionary:
                matched = candidate
                break
        if matched:
            tokens.append(matched)
            i += len(matched)
        else:
            # A single Han character is always safer than inventing a meaningless pair.
            tokens.append(char)
            i += 1
    if ''.join(tokens) != clean:
        raise AssertionError(f'Token mismatch: {text} -> {tokens}')
    return tokens


def add_answer_tokens(lesson: dict[str, Any], dictionary: set[str]) -> None:
    rows: list[dict[str, Any]] = []
    for direction in ('zhVi', 'viZh'):
        for group in ('questions', 'answers'):
            rows.extend(lesson['translation'][direction][group])
    rows.extend(lesson.get('dialogue', []))
    rows.extend(lesson.get('passage', {}).get('sentences', []))
    for row in rows:
        if row.get('hanzi'):
            row['answerTokens'] = segment_sentence(row['hanzi'], dictionary)


def main() -> None:
    payload = json.loads(DATA_PATH.read_text(encoding='utf-8'))
    dictionary = build_dictionary(payload)
    md_files = sorted(MD_DIR.glob('bai-*.md'))
    if len(md_files) != len(payload['lessons']):
        raise SystemExit(f'Expected {len(payload["lessons"])} Markdown files, got {len(md_files)}')

    for lesson, md_path in zip(payload['lessons'], md_files):
        parsed = parse_grammar_sections(md_path)
        for source in ('dialogue', 'passage'):
            existing = [item for item in lesson.get('grammar', []) if item.get('source') == source]
            groups = parsed[source]
            if len(existing) != len(groups):
                raise AssertionError(
                    f'{md_path.name}: grammar count mismatch for {source}: JSON={len(existing)}, Markdown={len(groups)}'
                )
            for item, parsed_item in zip(existing, groups):
                if strip_number_prefix(item.get('title', '')) != strip_number_prefix(parsed_item.get('title', '')):
                    raise AssertionError(
                        f'{md_path.name}: grammar title mismatch: {item.get("title")} != {parsed_item.get("title")}'
                    )
                item['groups'] = parsed_item['groups']
        lesson['contentFlow'] = [
            {'type': 'vocabulary'},
            {'type': 'zhViQuestions'},
            {'type': 'zhViAnswers'},
            {'type': 'dialogue'},
            {'type': 'dialogueGrammar'},
            {'type': 'viZhQuestions'},
            {'type': 'viZhAnswers'},
            {'type': 'passage'},
            {'type': 'passageGrammar'},
        ]
        add_answer_tokens(lesson, dictionary)

    payload['schemaVersion'] = 'ldsn14.v6'
    payload['build'] = {
        'version': 'v6',
        'tokenPolicy': 'precomputed-longest-dictionary-match-single-character-fallback',
        'grammarSource': '10 Markdown files',
        'contentOrder': 'source-book-flow',
    }
    DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Wrote {DATA_PATH}')


if __name__ == '__main__':
    main()

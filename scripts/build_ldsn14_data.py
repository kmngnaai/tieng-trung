#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import shutil
import sys
import textwrap
from pathlib import Path
from typing import Any

FIELD_ALIASES = {
    'chữ hán': 'hanzi',
    'pinyin': 'pinyin',
    'nghĩa': 'vi',
    'tiếng việt': 'vi',
    'ví dụ': 'hanzi',
}


def clean_inline(value: str) -> str:
    value = re.sub(r'`([^`]*)`', r'\1', value)
    value = re.sub(r'\*\*([^*]*)\*\*', r'\1', value)
    value = re.sub(r'\*([^*]*)\*', r'\1', value)
    return value.strip()


def dedent_source(path: Path) -> str:
    text = path.read_text(encoding='utf-8-sig').replace('\r\n', '\n')
    text = textwrap.dedent(text)
    return re.sub(r'(?m)^ {4}', '', text)


def front_matter(text: str) -> dict[str, str]:
    match = re.match(r'^---\n(.*?)\n---\n', text, re.S)
    if not match:
        return {}
    result: dict[str, str] = {}
    for raw in match.group(1).splitlines():
        if ':' not in raw or raw.startswith(' '):
            continue
        key, value = raw.split(':', 1)
        result[key.strip()] = value.strip()
    return result


def section(text: str, start_pattern: str, end_pattern: str | None = None) -> str:
    start = re.search(start_pattern, text, re.M)
    if not start:
        return ''
    tail = text[start.end():]
    if end_pattern:
        end = re.search(end_pattern, tail, re.M)
        if end:
            return tail[:end.start()]
    return tail


def parse_table(block: str) -> list[dict[str, Any]]:
    lines = [line.strip() for line in block.splitlines()]
    table_lines = [line for line in lines if line.startswith('|') and line.endswith('|')]
    if len(table_lines) < 3:
        return []
    headers = [clean_inline(cell) for cell in table_lines[0].strip('|').split('|')]
    rows = []
    for line in table_lines[2:]:
        cells = [clean_inline(cell) for cell in line.strip('|').split('|')]
        if len(cells) != len(headers):
            continue
        row = dict(zip(headers, cells))
        try:
            order = int(row.get('STT', len(rows) + 1))
        except ValueError:
            order = len(rows) + 1
        rows.append({
            'id': f'vocab-{order:03d}',
            'order': order,
            'hanzi': row.get('Chữ Hán', ''),
            'pinyin': row.get('Pinyin', ''),
            'wordClass': row.get('Từ loại', ''),
            'hanViet': row.get('Âm Hán Việt', ''),
            'vi': row.get('Nghĩa tiếng Việt', ''),
        })
    return rows


def parse_field_blocks(block: str, heading_pattern: str = r'^###\s+(.+)$') -> list[dict[str, str]]:
    headings = list(re.finditer(heading_pattern, block, re.M))
    items: list[dict[str, str]] = []
    for index, match in enumerate(headings):
        title = clean_inline(match.group(1))
        body_end = headings[index + 1].start() if index + 1 < len(headings) else len(block)
        body = block[match.end():body_end]
        fields: dict[str, str] = {'label': title}
        for raw in body.splitlines():
            line = raw.strip()
            field_match = re.match(r'^-\s+\*\*([^*]+):\*\*\s*(.*)$', line)
            if not field_match:
                continue
            key_raw = clean_inline(field_match.group(1)).strip().lower()
            value = clean_inline(field_match.group(2))
            key = FIELD_ALIASES.get(key_raw)
            if key:
                fields[key] = value
            else:
                fields.setdefault('speaker', clean_inline(field_match.group(1)))
                fields.setdefault('hanzi', value)
        if any(fields.get(key) for key in ('hanzi', 'pinyin', 'vi')):
            items.append(fields)
    return items


def parse_named_section(part: str, number: int, next_number: int | None = None) -> str:
    start_pattern = rf'^##\s+{number}\.\s+.*$'
    end_pattern = rf'^##\s+{next_number}\.\s+.*$' if next_number is not None else r'^#\s+' 
    return section(part, start_pattern, end_pattern)


def extract_plain_notes(body: str) -> list[str]:
    notes: list[str] = []
    for raw in body.splitlines():
        line = raw.strip()
        if not line or line.startswith('**Ví dụ') or line.startswith('**Cấu trúc'):
            continue
        if line.startswith('####'):
            notes.append(clean_inline(line.lstrip('#').strip()))
            continue
        if re.match(r'^-\s+\*\*[^*]+:\*\*', line):
            continue
        line = re.sub(r'^[-*>\s]+', '', line)
        line = clean_inline(line)
        if line and not line.startswith('#'):
            notes.append(line)
    return notes


def parse_grammar(block: str, lesson_prefix: str, source: str) -> list[dict[str, Any]]:
    headings = list(re.finditer(r'^###\s+(.+)$', block, re.M))
    items: list[dict[str, Any]] = []
    for index, match in enumerate(headings):
        title = clean_inline(match.group(1))
        if title.lower().startswith(('học ', 'flashcard', 'bài tập', 'luyện ', 'thẻ ')):
            continue
        end = headings[index + 1].start() if index + 1 < len(headings) else len(block)
        body = block[match.end():end]
        examples: list[dict[str, str]] = []
        current: dict[str, str] = {}
        for raw in body.splitlines():
            line = raw.strip()
            m = re.match(r'^-\s+\*\*([^*]+):\*\*\s*(.*)$', line)
            if not m:
                continue
            key_raw = clean_inline(m.group(1)).strip().lower()
            value = clean_inline(m.group(2))
            key = FIELD_ALIASES.get(key_raw)
            if key:
                if key == 'hanzi' and current.get('hanzi'):
                    examples.append(current)
                    current = {}
                current[key] = value
        if current:
            examples.append(current)
        structure = ''
        structure_match = re.search(r'\*\*Cấu trúc:\*\*\s*`?([^\n`]+)', body)
        if structure_match:
            structure = clean_inline(structure_match.group(1))
        notes = extract_plain_notes(body)
        items.append({
            'id': f'{lesson_prefix}-grammar-{source}-{len(items)+1:02d}',
            'title': title,
            'source': source,
            'structure': structure,
            'notes': notes,
            'examples': examples,
        })
    return items


def split_keep(text: str, pattern: str) -> list[str]:
    text = text.strip()
    if not text:
        return []
    parts = [piece.strip() for piece in re.findall(pattern, text) if piece.strip()]
    return parts or [text]


def parse_passage(block: str) -> dict[str, Any]:
    title_block = section(block, r'^###\s+Tiêu đề\s*$', r'^###\s+Bản tiếng Việt\s*$')
    title_fields = parse_field_blocks('### title\n' + title_block)
    title = title_fields[0] if title_fields else {}
    vi = clean_inline(section(block, r'^###\s+Bản tiếng Việt\s*$', r'^###\s+Bản tiếng Trung\s*$').strip())
    zh = clean_inline(section(block, r'^###\s+Bản tiếng Trung\s*$', r'^###\s+Pinyin\s*$').strip())
    pinyin = clean_inline(section(block, r'^###\s+Pinyin\s*$', r'^##\s+4\.\s+Ngữ pháp').strip())
    zh_sentences = split_keep(zh, r'[^。！？；]+[。！？；]?')
    py_sentences = split_keep(pinyin, r'[^.!?;]+[.!?;]?')
    vi_sentences = split_keep(vi, r'[^.!?;]+[.!?;]?')
    count = max(len(zh_sentences), len(py_sentences), len(vi_sentences))
    sentences = []
    for i in range(count):
        sentences.append({
            'id': f'passage-sentence-{i+1:02d}',
            'hanzi': zh_sentences[i] if i < len(zh_sentences) else '',
            'pinyin': py_sentences[i] if i < len(py_sentences) else '',
            'vi': vi_sentences[i] if i < len(vi_sentences) else '',
        })
    return {
        'title': {
            'hanzi': title.get('hanzi', ''),
            'pinyin': title.get('pinyin', ''),
            'vi': title.get('vi', ''),
        },
        'hanzi': zh,
        'pinyin': pinyin,
        'vi': vi,
        'sentences': sentences,
    }


def parse_lesson(path: Path) -> dict[str, Any]:
    text = dedent_source(path)
    meta = front_matter(text)
    lesson_no = int(meta.get('lesson_number') or re.search(r'bai-(\d+)', path.name).group(1))
    lesson_id = f'ldsn-{lesson_no:02d}'
    vocab_block = section(text, r'^##\s+1\.\s+Danh sách từ vựng theo chủ đề\s*$', r'^##\s+2\.\s+Cách dùng phần từ vựng')
    vocabulary = parse_table(vocab_block)

    part2 = section(text, r'^#\s+Phần 2\s+-\s+Dịch Trung\s+-\s+Việt\s*$', r'^#\s+Phần 3\s+-\s+Dịch Việt\s+-\s+Trung\s*$')
    p2_questions = parse_field_blocks(parse_named_section(part2, 1, 2))
    p2_answers = parse_field_blocks(parse_named_section(part2, 2, 3))
    dialogue = parse_field_blocks(parse_named_section(part2, 3, 4))
    grammar2 = parse_grammar(parse_named_section(part2, 4, 5), lesson_id, 'dialogue')

    part3 = section(text, r'^#\s+Phần 3\s+-\s+Dịch Việt\s+-\s+Trung\s*$', r'^#\s+Quy tắc chấm điểm')
    p3_questions = parse_field_blocks(parse_named_section(part3, 1, 2))
    p3_answers = parse_field_blocks(parse_named_section(part3, 2, 3))
    passage_block = parse_named_section(part3, 3, 4)
    passage = parse_passage(passage_block)
    grammar3 = parse_grammar(parse_named_section(part3, 4, 5), lesson_id, 'passage')

    for group_name, group in [('zhViQuestions', p2_questions), ('zhViAnswers', p2_answers), ('viZhQuestions', p3_questions), ('viZhAnswers', p3_answers)]:
        for i, item in enumerate(group, 1):
            item['id'] = f'{lesson_id}-{group_name}-{i:02d}'
    for i, item in enumerate(dialogue, 1):
        item['id'] = f'{lesson_id}-dialogue-{i:02d}'
        item['turn'] = i

    title_vi = meta.get('title_vi', '')
    title_zh = meta.get('title_zh', '')
    title_pinyin = meta.get('pinyin', '')
    return {
        'id': lesson_id,
        'lessonNumber': lesson_no,
        'title': {'vi': title_vi, 'hanzi': title_zh, 'pinyin': title_pinyin},
        'sourcePages': meta.get('source_pdf_pages', ''),
        'sourceStatus': meta.get('status', ''),
        'vocabulary': vocabulary,
        'translation': {
            'zhVi': {'questions': p2_questions, 'answers': p2_answers},
            'viZh': {'questions': p3_questions, 'answers': p3_answers},
        },
        'dialogue': dialogue,
        'grammar': grammar2 + grammar3,
        'passage': passage,
        'counts': {
            'vocabulary': len(vocabulary),
            'sentences': len(p2_questions) + len(p2_answers) + len(p3_questions) + len(p3_answers),
            'dialogue': len(dialogue),
            'grammar': len(grammar2) + len(grammar3),
            'passageSentences': len(passage.get('sentences', [])),
        },
    }


def main() -> int:
    if len(sys.argv) != 3:
        print('Usage: build_ldsn14_data.py <source-md-dir> <output-module-dir>', file=sys.stderr)
        return 2
    source_dir = Path(sys.argv[1]).resolve()
    module_dir = Path(sys.argv[2]).resolve()
    data_dir = module_dir / 'data'
    source_out = data_dir / 'source'
    source_out.mkdir(parents=True, exist_ok=True)

    files = sorted(source_dir.glob('bai-*.md'))
    if len(files) != 10:
        raise SystemExit(f'Expected 10 markdown files, found {len(files)}')
    lessons = [parse_lesson(path) for path in files]
    for src in files:
        shutil.copy2(src, source_out / src.name)

    payload = {
        'schemaVersion': 1,
        'course': {
            'id': 'ldsn1-4',
            'title': 'LDSN1-4',
            'subtitle': 'Luyện dịch song ngữ HSK 1–4',
            'lessonCount': len(lessons),
        },
        'lessons': lessons,
    }
    out = data_dir / 'lessons.json'
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Wrote {out} with {len(lessons)} lessons')
    for lesson in lessons:
        c = lesson['counts']
        print(f"{lesson['id']}: vocab={c['vocabulary']} sentences={c['sentences']} dialogue={c['dialogue']} grammar={c['grammar']} passage={c['passageSentences']}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

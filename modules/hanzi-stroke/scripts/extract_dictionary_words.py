#!/usr/bin/env python3
"""
extract_dictionary_words.py

Tach modules/hanzi-stroke/data/dictionary.json thanh du lieu tu/cum cho Hanzi Stroke.

Dau ra chinh:
- data/words/index.json: tra tong hop, dung cho bao cao/kiem tra, KHONG nen load truc tiep tren app vi nang.
- data/words/by_length/len_XX.json: chia theo so chu Han, dung tham khao/bao cao.
- data/words/by_first_char/XXXX.json: chia theo chu dau Unicode hex, app nen load lazy theo file nay.
- data/words/summary.json: thong ke.

Cach chay trong repo:
python scripts/extract_dictionary_words.py ^
  --input modules/hanzi-stroke/data/dictionary.json ^
  --out modules/hanzi-stroke/data/words ^
  --min-len 2
"""
import argparse
import json
import re
from pathlib import Path
from collections import Counter

HANZI_RE = re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]')
PURE_HANZI_RE = re.compile(r'^[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+$')


def count_hanzi(s: str) -> int:
    return sum(1 for ch in str(s or '') if HANZI_RE.match(ch))


def is_pure_hanzi(s: str) -> bool:
    return bool(s) and bool(PURE_HANZI_RE.match(str(s)))


def en_to_text(en):
    if isinstance(en, list):
        return '; '.join(str(x) for x in en if x)
    return str(en or '')


def compact_entry(r, source_index=None):
    return {
        's': r.get('s', ''),
        't': r.get('t', ''),
        'p': r.get('p', ''),
        'pt': r.get('pt', ''),
        'sp': r.get('sp', ''),
        'vi': r.get('vi', ''),
        'sv': r.get('sv', ''),
        'en': en_to_text(r.get('en')),
        'hsk': r.get('hsk'),
        'b': r.get('b'),
        'mwr': r.get('mwr'),
        'bwr': r.get('bwr'),
        'tw': r.get('tw') or [],
        'source_index': source_index,
    }


def first_char_key(s: str) -> str:
    if not s:
        return ''
    return f'{ord(s[0]):04X}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--input', default='modules/hanzi-stroke/data/dictionary.json')
    ap.add_argument('--out', default='modules/hanzi-stroke/data/words')
    ap.add_argument('--min-len', type=int, default=2)
    ap.add_argument('--max-len', type=int, default=0, help='0 = khong gioi han')
    ap.add_argument('--include-non-hanzi', action='store_true', help='giu ca term co Latin/so nhu 3C, AA制')
    ap.add_argument('--pretty', action='store_true', help='JSON indent=2 de de doc, mac dinh compact de nhe git')
    args = ap.parse_args()

    src = Path(args.input)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    by_len = out / 'by_length'
    by_first = out / 'by_first_char'
    by_len.mkdir(exist_ok=True)
    by_first.mkdir(exist_ok=True)

    data = json.loads(src.read_text(encoding='utf-8'))
    buckets = {}
    first_buckets = {}
    index = {}
    counts = Counter()
    first_counts = Counter()
    skipped = Counter()

    for i, r in enumerate(data):
        s = str(r.get('s', '') or '')
        length = count_hanzi(s) if not args.include_non_hanzi else len(s)
        if length < args.min_len:
            skipped['below_min_len'] += 1
            continue
        if args.max_len and length > args.max_len:
            skipped['above_max_len'] += 1
            continue
        if not args.include_non_hanzi and not is_pure_hanzi(s):
            skipped['not_pure_hanzi'] += 1
            continue

        e = compact_entry(r, i)
        e['length'] = length
        key = first_char_key(s)

        buckets.setdefault(length, []).append(e)
        first_buckets.setdefault(key, {}).setdefault(s, []).append(e)
        index.setdefault(s, []).append(e)
        counts[length] += 1
        first_counts[key] += 1

    json_kwargs = {'ensure_ascii': False}
    if args.pretty:
        json_kwargs['indent'] = 2

    for length, rows in sorted(buckets.items()):
        (by_len / f'len_{length:02d}.json').write_text(json.dumps(rows, **json_kwargs), encoding='utf-8')

    for key, rows in sorted(first_buckets.items()):
        if key:
            (by_first / f'{key}.json').write_text(json.dumps(rows, **json_kwargs), encoding='utf-8')

    (out / 'index.json').write_text(json.dumps(index, **json_kwargs), encoding='utf-8')
    summary = {
        'source': str(src),
        'total_source_entries': len(data),
        'exported_entries': sum(counts.values()),
        'min_len': args.min_len,
        'max_len': args.max_len or None,
        'pure_hanzi_only': not args.include_non_hanzi,
        'counts_by_length': dict(sorted(counts.items())),
        'by_first_char_files': len(first_buckets),
        'top_first_char_counts': dict(first_counts.most_common(20)),
        'skipped': dict(skipped),
    }
    (out / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Add orderingTokens to New 3.0 dialogue turns without changing source answerTokens."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "modules" / "new-hsk-course" / "data"
MANIFEST_PATH = DATA_DIR / "manifest.json"
HSK_DIR = ROOT / "modules" / "hanzi-stroke" / "data" / "learning" / "hsk"
PUNCTUATION_RE = re.compile(r"[，。！？；：、,.!?;:'\"“”‘’（）()\[\]【】《》—\-\s]+", re.UNICODE)
LATIN_RE = re.compile(r"[A-Za-z0-9]+(?:[._/+&-][A-Za-z0-9]+)*")

CURATED_PHRASES = {
    "一会儿", "有一点儿", "一点儿", "为什么", "怎么样", "没关系", "对不起", "没问题", "不用谢",
    "图书馆", "校园卡", "中国人", "中文报纸", "电话号码", "电子邮件", "公共汽车", "出租车",
    "因为", "所以", "虽然", "但是", "如果", "就", "一边", "一边", "越来越", "除了", "以外",
}


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_sentence(text: str) -> str:
    return PUNCTUATION_RE.sub("", str(text or ""))


def build_lexicon(lesson_paths: list[Path]) -> set[str]:
    lexicon = set(CURATED_PHRASES)
    for path in lesson_paths:
        data = read_json(path)
        entities = data.get("entities", {})
        for key in ("vocabulary", "properNouns"):
            for item in entities.get(key, []):
                word = normalize_sentence(item.get("hanzi", ""))
                if 2 <= len(word) <= 12:
                    lexicon.add(word)
    for level in (1, 2, 3):
        source = read_json(HSK_DIR / f"hsk_{level}.json")
        for item in source.get("items", []):
            word = normalize_sentence(item.get("word") or item.get("simplified") or "")
            if 2 <= len(word) <= 12:
                lexicon.add(word)
    return lexicon


def tokenize(text: str, lexicon: set[str]) -> list[str]:
    source = normalize_sentence(text)
    if not source:
        return []
    lengths = sorted({len(word) for word in lexicon}, reverse=True)
    result: list[str] = []
    index = 0
    while index < len(source):
        latin = LATIN_RE.match(source, index)
        if latin:
            result.append(latin.group(0))
            index = latin.end()
            continue
        match = ""
        for size in lengths:
            if size <= 1 or index + size > len(source):
                continue
            candidate = source[index:index + size]
            if candidate in lexicon:
                match = candidate
                break
        if match:
            result.append(match)
            index += len(match)
        else:
            result.append(source[index])
            index += 1
    return result


def main() -> None:
    manifest = read_json(MANIFEST_PATH)
    lesson_paths = [DATA_DIR / item["path"] for item in manifest.get("lessons", []) if "ready" in str(item.get("status", ""))]
    lexicon = build_lexicon(lesson_paths)
    changed = 0
    turns = 0
    for path in lesson_paths:
        data = read_json(path)
        for dialogue in data.get("entities", {}).get("dialogues", []):
            for turn in dialogue.get("turns", []):
                tokens = tokenize(turn.get("hanzi", ""), lexicon)
                if len(tokens) < 2 or "".join(tokens) != normalize_sentence(turn.get("hanzi", "")):
                    continue
                turns += 1
                if turn.get("orderingTokens") != tokens:
                    turn["orderingTokens"] = tokens
                    changed += 1
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {changed} of {turns} dialogue turns with orderingTokens; lexicon={len(lexicon)}")


if __name__ == "__main__":
    main()

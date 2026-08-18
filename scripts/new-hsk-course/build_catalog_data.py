#!/usr/bin/env python3
"""Build compact New 3.0 topic and grammar catalogs from the shared HSK data.

Grammar examples preserve the existing NP+/catalog examples first, then append
structured examples from the matching lesson grammar source. Matching is kept
deterministic: exact example overlap wins; when a chapter has the same number
of catalog grammar items and lesson grammar units, chapter order is the fallback.
"""
from __future__ import annotations

import json
import re
import unicodedata
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HSK_DIR = ROOT / "modules" / "hanzi-stroke" / "data" / "learning" / "hsk"
GRAMMAR_DIR = ROOT / "modules" / "hanzi-stroke" / "data" / "learning" / "grammar"
COURSE_DATA_DIR = ROOT / "modules" / "new-hsk-course" / "data"
OUTPUT_DIR = COURSE_DATA_DIR / "catalog"


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def compact_word(item: dict, topic_route: dict, lesson_routes: list[dict]) -> dict:
    lessons = []
    seen = set()
    for route in sorted(lesson_routes, key=lambda row: (int(row.get("sectionOrder") or 0), int(row.get("orderInSection") or 0))):
        number = int(route.get("sectionOrder") or 0)
        if number <= 0 or number in seen:
            continue
        seen.add(number)
        lessons.append({
            "number": number,
            "title": str(route.get("sectionTitle") or "").strip(),
            "titleZh": str(route.get("sectionTitleZh") or "").strip(),
            "order": int(route.get("orderInSection") or 0),
        })
    return {
        "word": str(item.get("word") or item.get("simplified") or "").strip(),
        "pinyin": str(item.get("pinyin") or "").strip(),
        "meaningVi": str(item.get("meaningVi") or item.get("translationVi") or "").strip(),
        "wordType": str(item.get("wordTypeExplanation") or item.get("wordType") or "").strip(),
        "order": int(topic_route.get("orderInSection") or 0),
        "lessonNumbers": [row["number"] for row in lessons],
        "lessons": lessons,
    }


def build_topics(level: int) -> list[dict]:
    source = read_json(HSK_DIR / f"hsk_{level}.json")
    topics: OrderedDict[str, dict] = OrderedDict()
    for item in source.get("items", []):
        routes = [row for row in item.get("routes", []) if row.get("libraryId") == "new_hsk" and int(row.get("levelNo") or 0) == level]
        topic_routes = [row for row in routes if row.get("sectionType") == "topic"]
        lesson_routes = [row for row in routes if row.get("sectionType") == "lesson"]
        for topic_route in topic_routes:
            topic_id = str(topic_route.get("sectionId") or "").strip()
            if not topic_id:
                continue
            topic = topics.setdefault(topic_id, {
                "id": topic_id,
                "order": int(topic_route.get("sectionOrder") or 0),
                "title": str(topic_route.get("sectionTitle") or "Chủ đề").strip(),
                "slug": str(topic_route.get("sectionSlug") or "").strip(),
                "words": [],
            })
            word = compact_word(item, topic_route, lesson_routes)
            if word["word"]:
                topic["words"].append(word)

    result = []
    for topic in topics.values():
        deduped = OrderedDict()
        for word in sorted(topic["words"], key=lambda row: (row["order"], row["word"])):
            key = (word["word"], word["pinyin"])
            if key not in deduped:
                deduped[key] = word
            else:
                current = deduped[key]
                merged = sorted(set(current["lessonNumbers"] + word["lessonNumbers"]))
                current["lessonNumbers"] = merged
                lesson_map = {row["number"]: row for row in current["lessons"] + word["lessons"]}
                current["lessons"] = [lesson_map[number] for number in merged if number in lesson_map]
        topic["words"] = list(deduped.values())
        topic["wordCount"] = len(topic["words"])
        result.append(topic)
    return sorted(result, key=lambda row: (row["order"], row["title"]))


def normalize_example_key(value: object) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).lower()
    return re.sub(r"[^a-z0-9\u3400-\u9fff]+", "", text)


def compact_catalog_example(row: dict) -> dict:
    return {
        "chinese": str(row.get("chinese") or row.get("zh") or "").strip(),
        "pinyin": str(row.get("pinyin") or "").strip(),
        "vietnamese": str(row.get("vietnamese") or row.get("vi") or row.get("meaningVi") or "").strip(),
    }


def compact_lesson_example(row: dict) -> dict:
    return {
        "chinese": str(row.get("hanzi") or row.get("chinese") or "").strip(),
        "pinyin": str(row.get("pinyin") or "").strip(),
        "vietnamese": str(row.get("vi") or row.get("vietnamese") or row.get("meaningVi") or "").strip(),
    }


def lesson_section_tail(title: object) -> str:
    value = str(title or "").strip()
    return re.sub(r"^Lớp học của Tiểu Ngữ(?:\s*\d+)?\s*[-—]\s*", "", value, flags=re.IGNORECASE).strip()


def lesson_grammar_units(level: int, chapter: int) -> list[dict]:
    path = COURSE_DATA_DIR / f"hsk{level}" / f"lesson-{chapter:02d}.json"
    if not path.is_file():
        return []
    lesson = read_json(path)
    units = []
    sections = lesson.get("entities", {}).get("contentSections", [])
    for section in sections:
        display = section.get("grammarDisplay")
        if not isinstance(display, dict):
            continue
        groups = display.get("groups") if isinstance(display.get("groups"), list) else []
        tail = lesson_section_tail(section.get("title"))
        section_specific = bool(tail) and tail.casefold() != "ngữ pháp"
        section_id = str(section.get("id") or "").strip()

        # HSK1-style sections are one grammar concept with subgroups such as
        # "Đọc to", omission notes, and completion exercises. Keep all examples
        # together so a matched NP+ item receives the full lesson source.
        if section_specific:
            examples = [compact_lesson_example(example) for group in groups for example in (group.get("examples") or [])]
            units.append({
                "ref": section_id,
                "title": tail,
                "examples": [row for row in examples if row["chinese"]],
            })
            continue

        # HSK2/3 generic "Ngữ pháp" sections use each group as a distinct
        # grammar concept, so match at group granularity.
        for index, group in enumerate(groups, start=1):
            examples = [compact_lesson_example(example) for example in (group.get("examples") or [])]
            units.append({
                "ref": f"{section_id}#group-{index}",
                "title": str(group.get("title") or tail or "Ngữ pháp").strip(),
                "examples": [row for row in examples if row["chinese"]],
            })
    return units


def normalize_grammar(item: dict) -> dict:
    examples = item.get("examples") if isinstance(item.get("examples"), list) else item.get("example")
    if not isinstance(examples, list):
        examples = []
    normalized_examples = []
    seen = set()
    for row in examples:
        normalized = compact_catalog_example(row)
        key = normalize_example_key(normalized["chinese"])
        if not key or key in seen:
            continue
        seen.add(key)
        normalized_examples.append(normalized)
    return {
        "id": str(item.get("id") or "").strip(),
        "order": int(item.get("item_order") or item.get("order") or 0),
        "topic": str(item.get("topic") or "Ngữ pháp").strip(),
        "syntax": str(item.get("syntax") or item.get("grammar_syntax") or "").strip(),
        "explanation": str(item.get("explanation") or item.get("grammar_explanation") or "").strip(),
        "tips": str(item.get("tips") or item.get("grammar_tips") or "").strip(),
        "attentions": str(item.get("attentions") or item.get("grammar_attentions") or "").strip(),
        "chapter": int(item.get("chapter") or item.get("from_book_chapter") or 0),
        "examples": normalized_examples,
    }


def example_overlap_count(item: dict, unit: dict) -> int:
    catalog_keys = {normalize_example_key(row.get("chinese")) for row in item.get("examples", [])}
    lesson_keys = {normalize_example_key(row.get("chinese")) for row in unit.get("examples", [])}
    catalog_keys.discard("")
    lesson_keys.discard("")
    return len(catalog_keys & lesson_keys)


def match_lesson_units(items: list[dict], units: list[dict]) -> list[dict | None]:
    matches: list[dict | None] = []
    equal_count = len(items) == len(units)
    for index, item in enumerate(items):
        overlaps = [example_overlap_count(item, unit) for unit in units]
        best = max(overlaps, default=0)
        winners = [unit_index for unit_index, score in enumerate(overlaps) if score == best and score > 0]
        if len(winners) == 1:
            matches.append(units[winners[0]])
        elif equal_count and index < len(units):
            # Safe deterministic fallback for chapters where both source lists
            # have the same cardinality and preserve textbook order.
            matches.append(units[index])
        else:
            matches.append(None)
    return matches


def merge_grammar_examples(item: dict, unit: dict | None) -> dict:
    result = dict(item)
    base_examples = [dict(row) for row in item.get("examples", [])]
    seen = {normalize_example_key(row.get("chinese")) for row in base_examples}
    seen.discard("")
    merged = list(base_examples)
    added = 0
    refs = []
    if unit:
        ref = str(unit.get("ref") or "").strip()
        if ref:
            refs.append(ref)
        for row in unit.get("examples", []):
            key = normalize_example_key(row.get("chinese"))
            if not key or key in seen:
                continue
            seen.add(key)
            merged.append(dict(row))
            added += 1
    result["examples"] = merged
    result["exampleMerge"] = {
        "catalogCount": len(base_examples),
        "lessonAddedCount": added,
        "sourceRefs": refs,
    }
    return result


def build_grammar(level: int) -> list[dict]:
    source = read_json(GRAMMAR_DIR / f"new_hsk_{level}.json")
    items = [normalize_grammar(item) for item in source.get("items", [])]
    items = sorted(items, key=lambda row: (row["order"], row["chapter"], row["topic"]))

    by_chapter: OrderedDict[int, list[dict]] = OrderedDict()
    for item in items:
        by_chapter.setdefault(int(item.get("chapter") or 0), []).append(item)

    result = []
    for chapter, chapter_items in by_chapter.items():
        units = lesson_grammar_units(level, chapter)
        matches = match_lesson_units(chapter_items, units)
        result.extend(merge_grammar_examples(item, unit) for item, unit in zip(chapter_items, matches))
    return result


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for level in (1, 2, 3):
        payload = {
            "schemaVersion": "new-hsk-course-catalog.v1",
            "level": level,
            "title": f"New 3.0 · HSK {level}",
            "topics": build_topics(level),
            "grammar": build_grammar(level),
        }
        target = OUTPUT_DIR / f"hsk{level}.json"
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        added = sum(item.get("exampleMerge", {}).get("lessonAddedCount", 0) for item in payload["grammar"])
        print(f"Wrote {target.relative_to(ROOT)}: {len(payload['topics'])} topics, {len(payload['grammar'])} grammar items, +{added} lesson examples")


if __name__ == "__main__":
    main()

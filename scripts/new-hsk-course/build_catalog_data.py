#!/usr/bin/env python3
"""Build compact New 3.0 topic and grammar catalogs from the shared HSK data."""
from __future__ import annotations

import json
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HSK_DIR = ROOT / "modules" / "hanzi-stroke" / "data" / "learning" / "hsk"
GRAMMAR_DIR = ROOT / "modules" / "hanzi-stroke" / "data" / "learning" / "grammar"
OUTPUT_DIR = ROOT / "modules" / "new-hsk-course" / "data" / "catalog"


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


def normalize_grammar(item: dict) -> dict:
    examples = item.get("examples") if isinstance(item.get("examples"), list) else item.get("example")
    if not isinstance(examples, list):
        examples = []
    normalized_examples = []
    for row in examples:
        chinese = str(row.get("chinese") or row.get("zh") or "").strip()
        vietnamese = str(row.get("vietnamese") or row.get("vi") or row.get("meaningVi") or "").strip()
        if not chinese and not vietnamese:
            continue
        normalized_examples.append({
            "chinese": chinese,
            "pinyin": str(row.get("pinyin") or "").strip(),
            "vietnamese": vietnamese,
        })
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


def build_grammar(level: int) -> list[dict]:
    source = read_json(GRAMMAR_DIR / f"new_hsk_{level}.json")
    items = [normalize_grammar(item) for item in source.get("items", [])]
    return sorted(items, key=lambda row: (row["order"], row["chapter"], row["topic"]))


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
        print(f"Wrote {target.relative_to(ROOT)}: {len(payload['topics'])} topics, {len(payload['grammar'])} grammar items")


if __name__ == "__main__":
    main()

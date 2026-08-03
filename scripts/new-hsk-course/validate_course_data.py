#!/usr/bin/env python3
"""Validate a new-hsk-course.v1 lesson using only the Python stdlib."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


class ValidationError(RuntimeError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValidationError(message)


def entity_index(data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for group_name, items in data["entities"].items():
        if not isinstance(items, list):
            continue
        for item in items:
            item_id = item.get("id")
            if not item_id:
                continue
            require(item_id not in index, f"Duplicate entity id: {item_id}")
            index[item_id] = {"group": group_name, "item": item}
    return index


def validate(data: dict[str, Any]) -> dict[str, Any]:
    require(data.get("schemaVersion") == "new-hsk-course.v1", "Unsupported schemaVersion")
    for key in ("id", "courseId", "level", "lessonNumber", "title", "source", "entities", "views"):
        require(key in data, f"Missing top-level key: {key}")

    require(data["courseId"] == "new-hsk-course", "Unexpected courseId")
    require(isinstance(data["level"], int) and data["level"] > 0, "level must be a positive integer")
    require(isinstance(data["lessonNumber"], int) and data["lessonNumber"] > 0, "lessonNumber must be positive")
    for key in ("hanzi", "pinyin", "vi"):
        require(bool(data["title"].get(key)), f"Missing title.{key}")

    index = entity_index(data)
    entities = data["entities"]

    # Stable ordering checks.
    for group_name in ("objectives", "lessonTexts", "vocabulary", "properNouns", "dialogues", "languageNotes", "activities", "passages", "extensions"):
        items = entities.get(group_name, [])
        orders = [item.get("order") for item in items]
        require(orders == list(range(1, len(items) + 1)), f"Non-contiguous order in {group_name}: {orders}")

    # Dialogue checks.
    total_turns = 0
    for dialogue in entities.get("dialogues", []):
        turns = dialogue.get("turns", [])
        require(turns, f"Dialogue has no turns: {dialogue['id']}")
        orders = [turn.get("order") for turn in turns]
        require(orders == list(range(1, len(turns) + 1)), f"Bad turn order in {dialogue['id']}")
        for turn in turns:
            for key in ("hanzi", "pinyin", "vi"):
                require(bool(turn.get(key)), f"Missing {key} in {turn['id']}")
            for key in ("hanzi", "pinyin", "vi"):
                require(bool(turn.get("speaker", {}).get(key)), f"Missing speaker.{key} in {turn['id']}")
            require(isinstance(turn.get("answerTokens"), list) and turn["answerTokens"], f"Missing answerTokens in {turn['id']}")
        total_turns += len(turns)

    # Lesson text references.
    for lesson_text in entities.get("lessonTexts", []):
        for ref_key in ("dialogueId",):
            ref = lesson_text.get(ref_key)
            require(ref in index, f"Broken {ref_key} in {lesson_text['id']}: {ref}")
        for ref_key in ("vocabularyIds", "properNounIds", "languageNoteIds", "activityIds"):
            for ref in lesson_text.get(ref_key, []):
                require(ref in index, f"Broken {ref_key} in {lesson_text['id']}: {ref}")

    # bookFlow contains only section keys or entity references.
    book_flow = data["views"].get("bookFlow", [])
    require(book_flow and book_flow[0] == "objectives", "bookFlow must start with objectives")
    for ref in book_flow[1:]:
        require(ref in index, f"Broken bookFlow reference: {ref}")

    # Grouped view must only reference existing entities and must not contain payload copies.
    grouped = data["views"].get("groupedIndex", {})
    for group_name, refs in grouped.items():
        require(isinstance(refs, list), f"groupedIndex.{group_name} must be a list")
        require(all(isinstance(ref, str) for ref in refs), f"groupedIndex.{group_name} must contain IDs only")
        for ref in refs:
            require(ref in index, f"Broken groupedIndex reference in {group_name}: {ref}")

    stats = data.get("stats", {})
    expected_stats = {
        "objectives": len(entities.get("objectives", [])),
        "lessonTexts": len(entities.get("lessonTexts", [])),
        "vocabulary": len(entities.get("vocabulary", [])),
        "properNouns": len(entities.get("properNouns", [])),
        "dialogues": len(entities.get("dialogues", [])),
        "dialogueTurns": total_turns,
        "languageNotes": len(entities.get("languageNotes", [])),
        "activities": len(entities.get("activities", [])),
        "passages": len(entities.get("passages", [])),
        "extensions": len(entities.get("extensions", [])),
    }
    require(stats == expected_stats, f"stats mismatch: expected={expected_stats}, actual={stats}")

    return {
        "status": "passed",
        "id": data["id"],
        "entityCount": len(index),
        "stats": expected_stats,
        "bookFlowItems": len(book_flow),
        "groupedCategories": len(grouped),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("lesson", type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    data = json.loads(args.lesson.read_text(encoding="utf-8-sig"))
    report = validate(data)
    output = json.dumps(report, ensure_ascii=False, indent=2)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(output + "\n", encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValidationError, KeyError, TypeError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)

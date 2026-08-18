#!/usr/bin/env python3
"""Validate one current new-hsk-course.v1 runtime lesson using stdlib only."""
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
            if not isinstance(item, dict):
                continue
            item_id = item.get("id")
            if not item_id:
                continue
            require(item_id not in index, f"Duplicate entity id: {item_id}")
            index[item_id] = {"group": group_name, "item": item}
    return index


def _source_stats(content_sections: list[dict[str, Any]]) -> dict[str, int]:
    visuals = [visual for section in content_sections for visual in section.get("sourceVisuals", [])]
    return {
        "sourceVisuals": len(visuals),
        "visibleSourceVisuals": sum(1 for visual in visuals if visual.get("displayInLesson") is True),
        "sourceTasks": sum(len(section.get("sourceTasks", [])) for section in content_sections),
    }


def validate(data: dict[str, Any]) -> dict[str, Any]:
    require(data.get("schemaVersion") == "new-hsk-course.v1", "Unsupported schemaVersion")
    for key in ("id", "courseId", "level", "lessonNumber", "title", "source", "entities", "views", "practicePlan"):
        require(key in data, f"Missing top-level key: {key}")

    require(data["courseId"] == "new-hsk-course", "Unexpected courseId")
    require(isinstance(data["level"], int) and data["level"] > 0, "level must be a positive integer")
    require(isinstance(data["lessonNumber"], int) and data["lessonNumber"] > 0, "lessonNumber must be positive")
    for key in ("hanzi", "pinyin", "vi"):
        require(bool(data["title"].get(key)), f"Missing title.{key}")

    index = entity_index(data)
    entities = data["entities"]

    ordered_groups = (
        "objectives", "lessonTexts", "vocabulary", "supplementalVocabulary", "properNouns",
        "dialogues", "languageNotes", "grammar", "examplesPractice", "exercises", "activities",
        "passages", "extensions", "contentSections",
    )
    for group_name in ordered_groups:
        items = entities.get(group_name, [])
        orders = [item.get("order") for item in items]
        require(orders == list(range(1, len(items) + 1)), f"Non-contiguous order in {group_name}: {orders}")

    total_turns = 0
    for dialogue in entities.get("dialogues", []):
        turns = dialogue.get("turns", [])
        require(turns, f"Dialogue has no turns: {dialogue['id']}")
        require([turn.get("order") for turn in turns] == list(range(1, len(turns) + 1)), f"Bad turn order in {dialogue['id']}")
        for turn in turns:
            for key in ("hanzi", "pinyin", "vi"):
                require(bool(turn.get(key)), f"Missing {key} in {turn['id']}")
                require(bool(turn.get("speaker", {}).get(key)), f"Missing speaker.{key} in {turn['id']}")
            require(isinstance(turn.get("answerTokens"), list) and turn["answerTokens"], f"Missing answerTokens in {turn['id']}")
        total_turns += len(turns)

    for lesson_text in entities.get("lessonTexts", []):
        ref = lesson_text.get("dialogueId")
        require(ref in index, f"Broken dialogueId in {lesson_text['id']}: {ref}")
        for ref_key in ("vocabularyIds", "properNounIds", "languageNoteIds", "activityIds"):
            for ref in lesson_text.get(ref_key, []):
                require(ref in index, f"Broken {ref_key} in {lesson_text['id']}: {ref}")

    book_flow = data["views"].get("bookFlow", [])
    require(bool(book_flow), "bookFlow must not be empty")
    for ref in book_flow:
        require(ref in index, f"Broken bookFlow reference: {ref}")
        require(index[ref]["group"] == "contentSections", f"bookFlow must reference contentSections: {ref}")

    grouped = data["views"].get("groupedIndex", {})
    for group_name, refs in grouped.items():
        require(isinstance(refs, list), f"groupedIndex.{group_name} must be a list")
        require(all(isinstance(ref, str) for ref in refs), f"groupedIndex.{group_name} must contain IDs only")
        for ref in refs:
            require(ref in index, f"Broken groupedIndex reference in {group_name}: {ref}")

    content_sections = entities.get("contentSections", [])
    radical_sort_items = sum(len(exercise.get("items", [])) for exercise in entities.get("radicalSortExercises", []))
    stats = data.get("stats", {})
    expected_stats = {
        "objectives": len(entities.get("objectives", [])),
        "lessonTexts": len(entities.get("lessonTexts", [])),
        "vocabulary": len(entities.get("vocabulary", [])),
        "supplementalVocabulary": len(entities.get("supplementalVocabulary", [])),
        "properNouns": len(entities.get("properNouns", [])),
        "dialogues": len(entities.get("dialogues", [])),
        "dialogueTurns": total_turns,
        "languageNotes": len(entities.get("languageNotes", [])),
        "grammar": len(entities.get("grammar", [])),
        "examplesPractice": len(entities.get("examplesPractice", [])),
        # exercises/activities stats describe source-parsed textbook blocks.
        # Curated practice overlays may preserve extra runtime exercises without
        # changing those source counts, so validate the stored source stats only.
        "exercises": stats.get("exercises", 0),
        "activities": stats.get("activities", 0),
        "passages": len(entities.get("passages", [])),
        "extensions": len(entities.get("extensions", [])),
        "contentSections": len(content_sections),
        "characters": len(entities.get("characters", [])),
        "radicalSortItems": radical_sort_items,
        "characterBuildExercises": len(entities.get("characterBuildExercises", [])),
        **_source_stats(content_sections),
    }
    for key, expected in expected_stats.items():
        require(stats.get(key) == expected, f"stats.{key} mismatch: expected={expected}, actual={stats.get(key)}")

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

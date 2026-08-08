#!/usr/bin/env python3
"""Validate all New 3.0 HSK 1-3 lessons, references and textbook MP3 files."""
from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

EXPECTED_LESSONS = {1: 15, 2: 15, 3: 18}
EXPECTED_TURNS = {1: 211, 2: 297, 3: 379}


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, required=True)
    args = parser.parse_args()
    repo = args.repo.resolve()
    module = repo / "modules/new-hsk-course"
    manifest = load(module / "data/manifest.json")
    schema = load(module / "schema/new-hsk-course.v1.schema.json")
    validator = Draft202012Validator(schema)
    audio_audit = load(module / "data/audio-audit.json")

    errors: list[str] = []
    warnings: list[str] = []
    stats: dict[str, Any] = {
        "lessonCount": 0,
        "levels": defaultdict(lambda: {"lessons": 0, "vocabulary": 0, "dialogues": 0, "turns": 0, "passages": 0, "grammar": 0, "audioRefs": 0}),
    }

    lessons = manifest.get("lessons", [])
    if len(lessons) != 48:
        errors.append(f"Manifest lesson count {len(lessons)} != 48")
    actual_level_counts = Counter(int(row.get("level", 0)) for row in lessons)
    for level, expected in EXPECTED_LESSONS.items():
        if actual_level_counts[level] != expected:
            errors.append(f"HSK {level} lesson count {actual_level_counts[level]} != {expected}")

    for entry in lessons:
        level = int(entry["level"])
        lesson_number = int(entry["lessonNumber"])
        lesson_id = entry["id"]
        data_path = module / "data" / entry["path"]
        if not data_path.exists():
            errors.append(f"{lesson_id}: missing {entry['path']}")
            continue
        lesson = load(data_path)
        schema_errors = sorted(validator.iter_errors(lesson), key=lambda error: list(error.path))
        for error in schema_errors:
            errors.append(f"{lesson_id}: schema {'.'.join(map(str, error.path)) or '<root>'}: {error.message}")

        entities = lesson.get("entities", {})
        all_ids: list[str] = []
        for key, rows in entities.items():
            if not isinstance(rows, list):
                errors.append(f"{lesson_id}: entities.{key} is not an array")
                continue
            all_ids.extend(str(row.get("id", "")) for row in rows if isinstance(row, dict) and row.get("id"))
            if key == "dialogues":
                all_ids.extend(str(turn.get("id", "")) for row in rows for turn in row.get("turns", []) if turn.get("id"))
        duplicates = [value for value, count in Counter(all_ids).items() if count > 1]
        if duplicates:
            errors.append(f"{lesson_id}: duplicate IDs {duplicates[:8]}")
        id_set = set(all_ids)

        for ref in lesson.get("views", {}).get("bookFlow", []):
            if ref != "objectives" and ref not in id_set:
                errors.append(f"{lesson_id}: missing bookFlow ref {ref}")
        for group, refs in lesson.get("views", {}).get("groupedIndex", {}).items():
            for ref in refs:
                if ref not in id_set:
                    errors.append(f"{lesson_id}: groupedIndex.{group} missing ref {ref}")

        turns = [turn for dialogue in entities.get("dialogues", []) for turn in dialogue.get("turns", [])]
        turn_ids = {turn.get("id") for turn in turns}
        source_groups = lesson.get("practicePlan", {}).get("sourceGroups", {})
        entity_type_to_ids = {
            "vocabulary": {row.get("id") for row in entities.get("vocabulary", [])},
            "supplementalVocabulary": {row.get("id") for row in entities.get("supplementalVocabulary", [])},
            "properNouns": {row.get("id") for row in entities.get("properNouns", [])},
            "dialogueTurns": turn_ids,
            "dialogues": {row.get("id") for row in entities.get("dialogues", [])},
            "passages": {row.get("id") for row in entities.get("passages", [])},
            "grammarReview": {row.get("id") for row in entities.get("grammar", [])} | {row.get("id") for row in entities.get("languageNotes", [])} | {row.get("id") for row in entities.get("vocabulary", [])},
        }
        for source_id, group in source_groups.items():
            valid = entity_type_to_ids.get(group.get("entityType"), set())
            for ref in group.get("ids", []):
                if ref not in valid:
                    errors.append(f"{lesson_id}: practicePlan.{source_id} missing ref {ref}")

        audio_refs: set[str] = set()
        for text in entities.get("lessonTexts", []):
            if text.get("instruction", {}).get("audioRef"):
                audio_refs.add(text["instruction"]["audioRef"])
            if text.get("vocabularyAudioRef"):
                audio_refs.add(text["vocabularyAudioRef"])
        for passage in entities.get("passages", []):
            if passage.get("audioRef"):
                audio_refs.add(passage["audioRef"])
            if passage.get("vocabularyAudioRef"):
                audio_refs.add(passage["vocabularyAudioRef"])
        for ref in audio_refs:
            path = module / "assets/audio" / f"hsk{level}" / f"lesson-{lesson_number:02d}" / f"{ref}.mp3"
            if not path.exists() or path.stat().st_size <= 0:
                errors.append(f"{lesson_id}: missing audio {ref}")

        if not entities.get("contentSections"):
            errors.append(f"{lesson_id}: no contentSections")
        if not entities.get("vocabulary"):
            errors.append(f"{lesson_id}: no vocabulary")
        if not entities.get("dialogues") or not turns:
            errors.append(f"{lesson_id}: no dialogue turns")
        for turn in turns:
            for field in ("hanzi", "pinyin", "vi"):
                if not str(turn.get(field, "")).strip():
                    errors.append(f"{lesson_id}: turn {turn.get('id')} missing {field}")
            if not turn.get("answerTokens"):
                errors.append(f"{lesson_id}: turn {turn.get('id')} missing answerTokens")

        source_root = module / "source" / f"hsk{level}"
        expected_source_files = [
            source_root / f"HSK{level}_Bai_{lesson_number:02d}.md",
            source_root / "dialogues" / f"HSK{level}_Bai_{lesson_number:02d}_dialogues.json",
            source_root / "coverage" / f"HSK{level}_Bai_{lesson_number:02d}_Coverage.md",
        ]
        for path in expected_source_files:
            if not path.exists():
                warnings.append(f"{lesson_id}: missing review source {path.relative_to(repo)}")

        level_stats = stats["levels"][str(level)]
        level_stats["lessons"] += 1
        level_stats["vocabulary"] += len(entities.get("vocabulary", []))
        level_stats["dialogues"] += len(entities.get("dialogues", []))
        level_stats["turns"] += len(turns)
        level_stats["passages"] += len(entities.get("passages", []))
        level_stats["grammar"] += len(entities.get("grammar", []))
        level_stats["audioRefs"] += len(audio_refs)
        stats["lessonCount"] += 1

    for level, expected in EXPECTED_TURNS.items():
        actual = stats["levels"][str(level)]["turns"]
        if actual != expected:
            errors.append(f"HSK {level} dialogue turn total {actual} != {expected}")

    if audio_audit.get("missing"):
        errors.append(f"Audio audit missing {len(audio_audit['missing'])} tracks")
    if audio_audit.get("invalid"):
        errors.append(f"Audio audit invalid {len(audio_audit['invalid'])} tracks")
    if int(audio_audit.get("importedCount", 0)) != 357:
        errors.append(f"Audio imported count {audio_audit.get('importedCount')} != 357")

    report = {
        "schemaVersion": 1,
        "status": "pass" if not errors else "fail",
        "stats": {"lessonCount": stats["lessonCount"], "levels": dict(stats["levels"]), "audioTracks": audio_audit.get("importedCount", 0), "audioDurationSeconds": audio_audit.get("totalDurationSeconds", 0)},
        "errors": errors,
        "warnings": warnings,
    }
    report_path = module / "data/full-course-validation.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())

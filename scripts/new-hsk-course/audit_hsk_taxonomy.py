#!/usr/bin/env python3
"""Audit New HSK course placement against the committed official vocabulary reference.

This script is intentionally non-destructive. A difference between course placement and
official syllabus membership is reported as information, not automatically as an error:
lesson PPT/Markdown remains authoritative for lesson order and lesson-specific 生词.
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_FIRST_OCCURRENCE = ROOT / "modules/new-hsk-course/data/first-occurrence.json"
DEFAULT_OFFICIAL = ROOT / "modules/new-hsk-course/source/official-vocabulary.json"
DEFAULT_OUTPUT = ROOT / "modules/new-hsk-course/data/hsk-taxonomy-audit.json"


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def build_report(first_occurrence: dict[str, Any], official: dict[str, Any]) -> dict[str, Any]:
    reference_date = str(official.get("policy", {}).get("referenceDate") or "")
    official_entries_by_hanzi: dict[str, list[dict[str, int]]] = {}
    official_entry_count = 0
    for level_text, rows in official.get("levels", {}).items():
        level = int(level_text)
        for row in rows:
            hanzi = str(row.get("hanzi") or "").strip()
            if not hanzi:
                continue
            official_entry_count += 1
            official_entries_by_hanzi.setdefault(hanzi, []).append({
                "level": level,
                "order": int(row.get("order") or 0),
            })

    course_only = []
    official_not_lesson_new_word = []
    different_new_word_level = []
    earlier_exposure = []
    term_counts: Counter[str] = Counter()
    first_terms = {
        str(row.get("hanzi") or "").strip()
        for row in first_occurrence.get("terms", [])
        if str(row.get("hanzi") or "").strip()
    }

    for row in first_occurrence.get("terms", []):
        term = str(row.get("hanzi") or "").strip()
        official_levels = sorted({int(level) for level in row.get("officialLevels", [])})
        new_word_refs = row.get("lessonNewWordRefs", []) if isinstance(row.get("lessonNewWordRefs"), list) else []
        course_levels = sorted({int(ref.get("level")) for ref in new_word_refs if ref.get("level") is not None})
        first_seen_level = row.get("firstSeenLevel")

        if new_word_refs:
            term_counts["lessonNewWords"] += 1
        if official_levels:
            term_counts["officialReferenceHanziSeenInIndex"] += 1
        if official_levels and new_word_refs:
            term_counts["officialAndLessonNewWord"] += 1
        if new_word_refs and not official_levels:
            course_only.append({
                "hanzi": term,
                "courseNewWordLevels": course_levels,
                "lessonNewWordRefs": new_word_refs,
                "reason": "lesson-new-word-not-in-official-reference-1-3",
            })
        if official_levels and not new_word_refs:
            official_not_lesson_new_word.append({
                "hanzi": term,
                "officialSyllabusLevels": official_levels,
                "officialOrders": row.get("officialOrders", {}),
                "officialSyllabusEntries": row.get("officialSyllabusEntries", []),
                "courseFirstSeen": {
                    "level": row.get("firstSeenLevel"),
                    "lesson": row.get("firstSeenLesson"),
                    "sourceKind": row.get("firstSeenSourceKind", ""),
                    "sourceId": row.get("firstSeenSourceId", ""),
                } if row.get("firstSeenLevel") is not None else None,
                "reason": "official-reference-hanzi-not-marked-as-lesson-new-word",
            })
        if official_levels and course_levels and any(level not in official_levels for level in course_levels):
            different_new_word_level.append({
                "hanzi": term,
                "officialSyllabusLevels": official_levels,
                "courseNewWordLevels": course_levels,
                "lessonNewWordRefs": new_word_refs,
                "reason": "course-new-word-level-differs-from-official-syllabus-membership",
            })
        if official_levels and first_seen_level is not None and int(first_seen_level) < min(official_levels):
            earlier_exposure.append({
                "hanzi": term,
                "officialSyllabusLevels": official_levels,
                "courseFirstSeenLevel": int(first_seen_level),
                "courseFirstSeenLesson": row.get("firstSeenLesson"),
                "courseFirstSeenSourceKind": row.get("firstSeenSourceKind", ""),
                "reason": "learner-exposure-before-official-membership-level",
            })

    repeated_official = [
        {"hanzi": hanzi, "entries": entries}
        for hanzi, entries in sorted(official_entries_by_hanzi.items())
        if len(entries) > 1
    ]
    missing_official = [
        {"hanzi": hanzi, "entries": entries}
        for hanzi, entries in sorted(official_entries_by_hanzi.items())
        if hanzi not in first_terms
    ]
    repeated_beyond_first = sum(len(row["entries"]) - 1 for row in repeated_official)

    return {
        "schemaVersion": "new-hsk-taxonomy-audit.v1",
        "status": "informational-audit",
        "policy": {
            "officialReference": "modules/new-hsk-course/source/official-vocabulary.json",
            "officialReferenceDate": reference_date,
            "coursePlacementSource": "modules/new-hsk-course/data/hsk*/lesson-*.json",
            "lessonSourceRemainsAuthoritativeForCoursePlacement": True,
            "differencesAreNotAutomaticallyErrors": True,
            "officialRowsMayRepeatTheSameHanzi": True,
            "purpose": "prevent official syllabus membership and course/lesson placement from sharing an ambiguous level meaning",
        },
        "summary": {
            "officialReferenceEntries": official_entry_count,
            "officialReferenceUniqueHanzi": len(official_entries_by_hanzi),
            "officialRepeatedHanzi": len(repeated_official),
            "officialRepeatedEntriesBeyondFirst": repeated_beyond_first,
            "officialHanziPresentInFirstOccurrence": term_counts["officialReferenceHanziSeenInIndex"],
            "officialHanziMissingFromFirstOccurrence": len(missing_official),
            "knownTerms": len(first_occurrence.get("terms", [])),
            "lessonNewWordTerms": term_counts["lessonNewWords"],
            "officialAndLessonNewWordTerms": term_counts["officialAndLessonNewWord"],
            "courseOnlyLessonNewWords": len(course_only),
            "officialHanziNotLessonNewWords": len(official_not_lesson_new_word),
            "courseNewWordLevelDiffersFromOfficial": len(different_new_word_level),
            "earlierExposureThanOfficialLevel": len(earlier_exposure),
        },
        "findings": {
            "officialRepeatedHanziEntries": repeated_official,
            "officialHanziMissingFromFirstOccurrence": missing_official,
            "courseOnlyLessonNewWords": course_only,
            "officialHanziNotLessonNewWords": official_not_lesson_new_word,
            "courseNewWordLevelDiffersFromOfficial": different_new_word_level,
            "earlierExposureThanOfficialLevel": earlier_exposure,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--first-occurrence", type=Path, default=DEFAULT_FIRST_OCCURRENCE)
    parser.add_argument("--official", type=Path, default=DEFAULT_OFFICIAL)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    report = build_report(read_json(args.first_occurrence), read_json(args.official))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

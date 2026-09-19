#!/usr/bin/env python3
"""Verify committed generated projections without mutating the repository."""
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_UNIFIED_BASE = ROOT / "modules/hanzi-stroke/data/learning/unified-lookup/all-sources"


def resolve_unified_base() -> Path:
    configured = os.environ.get("TIENG_TRUNG_UNIFIED_BASE")
    if not configured:
        return DEFAULT_UNIFIED_BASE
    path = Path(configured)
    if not path.is_absolute():
        path = ROOT / path
    return path.resolve()


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def verify(unified_base: Path | None = None) -> list[str]:
    errors: list[str] = []

    search_mod = load_module("build_search_index", ROOT / "scripts/lookup/build_search_index.py")
    search_base = (unified_base or resolve_unified_base()).resolve()
    expected_search = search_mod.build_search_index(search_base)
    actual_search = load_json(search_base / "search-index.json")
    if expected_search != actual_search:
        errors.append("lookup search-index.json is stale")

    catalog_mod = load_module("build_catalog_data", ROOT / "scripts/new-hsk-course/build_catalog_data.py")
    reference_date = catalog_mod.load_official_reference_date()
    for level in (1, 2, 3):
        topics = catalog_mod.build_topics(level)
        expected_catalog = {
            "schemaVersion": "new-hsk-course-catalog.v1",
            "level": level,
            "levelSemantics": "course/library route level, not official syllabus membership",
            "officialVocabularyReference": {
                "path": "modules/new-hsk-course/source/official-vocabulary.json",
                "referenceDate": reference_date,
            },
            "title": f"New 3.0 · HSK {level}",
            "topics": topics,
            "grammar": catalog_mod.build_grammar(level),
        }
        actual_catalog = load_json(ROOT / f"modules/new-hsk-course/data/catalog/hsk{level}.json")
        if expected_catalog != actual_catalog:
            errors.append(f"New HSK catalog hsk{level}.json is stale")

    first_builder = load_module("build_all_course_data", ROOT / "scripts/new-hsk-course/build_all_course_data.py")
    lesson_paths = []
    for level, count in ((1, 15), (2, 15), (3, 18)):
        lesson_paths.extend(
            ROOT / "modules/new-hsk-course/data" / f"hsk{level}" / f"lesson-{number:02d}.json"
            for number in range(1, count + 1)
        )
    expected_first = first_builder.build_first_occurrence_index(ROOT, lesson_paths)
    first = load_json(ROOT / "modules/new-hsk-course/data/first-occurrence.json")
    if expected_first != first:
        errors.append("New HSK first-occurrence.json is stale or non-reproducible")

    official = load_json(ROOT / "modules/new-hsk-course/source/official-vocabulary.json")
    policy = first.get("policy", {})
    if not isinstance(policy.get("levelSemantics"), dict):
        errors.append("first-occurrence.json is missing explicit levelSemantics")
    if policy.get("officialVocabularyReferenceDate") != official.get("policy", {}).get("referenceDate"):
        errors.append("first-occurrence official reference date does not match source")

    audit_mod = load_module("audit_hsk_taxonomy", ROOT / "scripts/new-hsk-course/audit_hsk_taxonomy.py")
    expected_audit = audit_mod.build_report(first, official)
    actual_audit = load_json(ROOT / "modules/new-hsk-course/data/hsk-taxonomy-audit.json")
    if expected_audit != actual_audit:
        errors.append("hsk-taxonomy-audit.json is stale")

    return errors


def main() -> int:
    errors = verify()
    if errors:
        for error in errors:
            print(f"FAIL {error}")
        return 1
    print("PASS generated data: lookup search, New HSK catalogs, taxonomy semantics and audit are current")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

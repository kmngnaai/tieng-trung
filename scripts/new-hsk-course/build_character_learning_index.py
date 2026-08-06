#!/usr/bin/env python3
"""Build a compact, source-grounded character learning index for HSK 1-3.

Priority:
1. Curated character records embedded in New HSK lesson JSON.
2. Existing character-enrichment records as fallback only.

The script never invents roles, meanings, or explanations. Missing fields remain empty.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
COURSE_DATA = ROOT / "modules/new-hsk-course/data"
ENRICHMENT_ROOT = ROOT / "modules/hanzi-stroke/data/learning/character-enrichment/hsk1-3-single"
OUTPUT = ROOT / "modules/hanzi-stroke/data/learning/character-learning-index.json"
REPORT = ROOT / "modules/hanzi-stroke/data/learning/character-learning-index-report.json"


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def clean(value: Any) -> str:
    return str(value or "").strip()


def first_nonempty(*values: Any) -> str:
    for value in values:
        text = clean(value)
        if text:
            return text
    return ""


def list_text(value: Any, separator: str = " / ") -> str:
    if isinstance(value, list):
        return separator.join(clean(item) for item in value if clean(item))
    return clean(value)


def useful_explanation(value: Any) -> str:
    text = clean(value)
    lowered = text.casefold()
    rejected = (
        "chưa tìm thấy",
        "chưa xác định",
        "not available",
        "not-available",
        "ứng viên cho đến khi được duyệt",
    )
    return "" if not text or any(marker in lowered for marker in rejected) else text


def role_vi(component: dict[str, Any]) -> str:
    explicit = clean(component.get("roleVi"))
    if explicit:
        return explicit
    role = clean(component.get("role")).casefold()
    return {
        "semantic": "gợi nghĩa",
        "phonetic": "gợi âm",
        "radical": "bộ thủ",
    }.get(role, "")


def merge_component(existing: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    merged = dict(existing)
    for key in ("position", "positionVi", "role", "roleVi", "nameVi", "pinyin", "hanViet", "meaningVi"):
        if not clean(merged.get(key)) and clean(incoming.get(key)):
            merged[key] = clean(incoming.get(key))
    return merged


def normalize_lesson_component(component: dict[str, Any]) -> dict[str, Any] | None:
    glyph = first_nonempty(component.get("glyph"), component.get("char"))
    if not glyph:
        return None
    return {
        "glyph": glyph,
        "position": clean(component.get("position")),
        "positionVi": clean(component.get("positionVi")),
        "role": clean(component.get("role")),
        "roleVi": role_vi(component),
        "nameVi": clean(component.get("nameVi")),
        "pinyin": clean(component.get("pinyin")),
        "hanViet": clean(component.get("hanViet")),
        "meaningVi": clean(component.get("meaningVi")),
        "reviewStatus": clean(component.get("reviewStatus")),
    }


def normalize_enrichment_component(component: dict[str, Any]) -> dict[str, Any] | None:
    glyph = first_nonempty(component.get("char"), component.get("glyph"))
    if not glyph:
        return None
    return {
        "glyph": glyph,
        "position": clean(component.get("position")),
        "positionVi": clean(component.get("positionVi")),
        "role": clean(component.get("role")),
        "roleVi": role_vi(component),
        "nameVi": clean(component.get("nameVi")),
        "pinyin": clean(component.get("pinyin")),
        "hanViet": clean(component.get("hanViet")),
        "meaningVi": clean(component.get("meaningVi")),
        "reviewStatus": clean(component.get("reviewStatus")),
    }


def load_lesson_records() -> tuple[dict[str, dict[str, Any]], dict[str, set[int]]]:
    records: dict[str, dict[str, Any]] = {}
    levels: dict[str, set[int]] = {}
    for level in (1, 2, 3):
        for path in sorted((COURSE_DATA / f"hsk{level}").glob("lesson-*.json")):
            lesson = read_json(path)
            for item in lesson.get("entities", {}).get("characters", []):
                char = clean(item.get("hanzi"))
                if not char:
                    continue
                levels.setdefault(char, set()).add(level)
                current = records.get(char)
                current_score = 2 if clean(current and current.get("reviewStatus")) == "curated" else 1 if current else 0
                incoming_score = 2 if clean(item.get("reviewStatus")) == "curated" else 1
                if current is None or incoming_score > current_score:
                    records[char] = dict(item)
                else:
                    # Preserve richer component lists even when the primary record is retained.
                    by_glyph = {clean(row.get("glyph")): row for row in current.get("components", []) if clean(row.get("glyph"))}
                    for component in item.get("components", []):
                        glyph = clean(component.get("glyph"))
                        if glyph and glyph not in by_glyph:
                            current.setdefault("components", []).append(component)
    return records, levels


def load_enrichment() -> dict[str, dict[str, Any]]:
    index_path = ENRICHMENT_ROOT / "index.json"
    if not index_path.exists():
        return {}
    index = read_json(index_path)
    result: dict[str, dict[str, Any]] = {}
    for char, summary in index.items():
        rel_path = clean(summary.get("path"))
        if not rel_path:
            continue
        path = ENRICHMENT_ROOT / rel_path
        if path.exists():
            result[char] = read_json(path)
    return result


def build() -> dict[str, Any]:
    lessons, level_map = load_lesson_records()
    enrichment = load_enrichment()
    all_chars = sorted(set(lessons) | set(enrichment))

    # Component glosses can be grounded in other known character records.
    known_gloss: dict[str, dict[str, str]] = {}
    for char in all_chars:
        lesson = lessons.get(char, {})
        enrich = enrichment.get(char, {})
        senses = enrich.get("meaningSenses", []) if isinstance(enrich.get("meaningSenses"), list) else []
        meaning = list_text(lesson.get("meaningsVi"), "; ") or first_nonempty(*(sense.get("meaningVi") for sense in senses))
        known_gloss[char] = {
            "pinyin": list_text(lesson.get("pinyin")) or list_text(enrich.get("pronunciation", {}).get("pinyin")),
            "hanViet": first_nonempty(lesson.get("dictionaryRadical", {}).get("hanViet"), enrich.get("pronunciation", {}).get("hanViet")),
            "meaningVi": meaning,
        }

    items: dict[str, Any] = {}
    for char in all_chars:
        lesson = lessons.get(char, {})
        enrich = enrichment.get(char, {})
        char_info = enrich.get("characterInfo", {}) if isinstance(enrich.get("characterInfo"), dict) else {}
        enrich_radical = char_info.get("radical", {}) if isinstance(char_info.get("radical"), dict) else {}
        lesson_radical = lesson.get("dictionaryRadical", {}) if isinstance(lesson.get("dictionaryRadical"), dict) else {}
        senses = enrich.get("meaningSenses", []) if isinstance(enrich.get("meaningSenses"), list) else []

        component_map: dict[str, dict[str, Any]] = {}
        for raw in lesson.get("components", []) if isinstance(lesson.get("components"), list) else []:
            component = normalize_lesson_component(raw)
            if component:
                component_map[component["glyph"]] = component
        for raw in enrich.get("components", []) if isinstance(enrich.get("components"), list) else []:
            component = normalize_enrichment_component(raw)
            if not component:
                continue
            glyph = component["glyph"]
            component_map[glyph] = merge_component(component_map.get(glyph, {"glyph": glyph}), component)

        radical_glyph = first_nonempty(lesson_radical.get("glyph"), enrich_radical.get("variant"), enrich_radical.get("mainForm"))
        if radical_glyph and radical_glyph not in component_map:
            component_map[radical_glyph] = {
                "glyph": radical_glyph,
                "position": "",
                "positionVi": "",
                "role": "radical",
                "roleVi": "bộ thủ",
                "nameVi": first_nonempty(lesson_radical.get("nameVi"), enrich_radical.get("nameVi")),
                "pinyin": first_nonempty(lesson_radical.get("pinyin"), enrich_radical.get("pinyin")),
                "hanViet": first_nonempty(lesson_radical.get("hanViet"), enrich_radical.get("hanViet")),
                "meaningVi": clean(enrich_radical.get("meaningVi")),
                "reviewStatus": "",
            }

        components = []
        for glyph, component in component_map.items():
            gloss = known_gloss.get(glyph, {})
            normalized = dict(component)
            normalized["pinyin"] = first_nonempty(normalized.get("pinyin"), gloss.get("pinyin"))
            normalized["hanViet"] = first_nonempty(normalized.get("hanViet"), gloss.get("hanViet"))
            normalized["meaningVi"] = first_nonempty(normalized.get("meaningVi"), gloss.get("meaningVi"))
            components.append(normalized)

        structure = lesson.get("structure", {}) if isinstance(lesson.get("structure"), dict) else {}
        explanation = useful_explanation(enrich.get("etymology", {}).get("standardExplanationVi"))
        memory = useful_explanation(enrich.get("learningStory", {}).get("memoryStoryVi"))
        common_errors = lesson.get("pedagogy", {}).get("commonErrors", []) if isinstance(lesson.get("pedagogy"), dict) else []
        common_errors = [clean(value) for value in common_errors if clean(value)]

        items[char] = {
            "char": char,
            "pinyin": known_gloss[char]["pinyin"],
            "meaningVi": known_gloss[char]["meaningVi"],
            "levels": sorted(level_map.get(char, set()) or enrich.get("scope", {}).get("hskLevels", []) or []),
            "radical": {
                "glyph": radical_glyph,
                "id": clean(lesson_radical.get("radicalId")),
                "nameVi": first_nonempty(lesson_radical.get("nameVi"), enrich_radical.get("nameVi")),
                "pinyin": first_nonempty(lesson_radical.get("pinyin"), enrich_radical.get("pinyin")),
                "hanViet": first_nonempty(lesson_radical.get("hanViet"), enrich_radical.get("hanViet")),
                "meaningVi": clean(enrich_radical.get("meaningVi")),
            },
            "structure": {
                "type": first_nonempty(structure.get("type"), char_info.get("structureType")),
                "labelVi": first_nonempty(structure.get("labelVi"), char_info.get("formationTypeVi"), char_info.get("structureType")),
            },
            "components": components,
            "explanationVi": explanation,
            "memoryVi": memory,
            "commonErrors": common_errors,
            "qualityStatus": first_nonempty(lesson.get("reviewStatus"), enrich.get("review", {}).get("status"), "partial"),
            "sources": [source for source, present in (("new-hsk-lessons", bool(lesson)), ("character-enrichment", bool(enrich))) if present],
        }

    payload = {
        "schemaVersion": "character-learning-index-v1",
        "scope": "new-hsk-1-3",
        "sourcePolicy": "lesson-curated-first; enrichment-fallback; no inferred fields",
        "total": len(items),
        "courseCharacterTotal": len(lessons),
        "enrichmentOnlyTotal": len(set(enrichment) - set(lessons)),
        "items": items,
    }
    return payload


def main() -> None:
    payload = build()
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    items = payload["items"]
    course_chars = {char for char, row in items.items() if row.get("levels")}
    report = {
        "total": len(items),
        "courseCharacterTotal": len(course_chars),
        "courseCharacterIndexed": sum(char in items for char in course_chars),
        "enrichmentOnlyTotal": len(items) - len(course_chars),
        "withRadical": sum(bool(row.get("radical", {}).get("glyph")) for row in items.values()),
        "withComponents": sum(bool(row.get("components")) for row in items.values()),
        "withMultipleComponents": sum(len(row.get("components", [])) >= 2 for row in items.values()),
        "courseWithRadical": sum(bool(items[char].get("radical", {}).get("glyph")) for char in course_chars),
        "courseWithComponents": sum(bool(items[char].get("components")) for char in course_chars),
        "courseWithMultipleComponents": sum(len(items[char].get("components", [])) >= 2 for char in course_chars),
        "courseWithStructureLabel": sum(bool(items[char].get("structure", {}).get("labelVi")) for char in course_chars),
        "withVietnameseExplanation": sum(bool(row.get("explanationVi")) for row in items.values()),
        "withMemory": sum(bool(row.get("memoryVi")) for row in items.values()),
        "courseMissingComponents": [char for char in sorted(course_chars) if not items[char].get("components")],
        "missingComponents": [char for char, row in items.items() if not row.get("components")],
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

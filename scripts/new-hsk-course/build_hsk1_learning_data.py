#!/usr/bin/env python3
"""Build source-grounded HSK 1 learning indexes.

Scope is intentionally limited to vocabulary from New HSK 1:
- 292 unique vocabulary words/phrases from 15 lessons.
- 239 unique Han characters appearing in those vocabulary entries.

The builder only merges fields explicitly present in repository data. It never
infers semantic/phonetic roles or invents character components.
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[2]
COURSE_DIR = ROOT / "modules/new-hsk-course/data/hsk1"
GENERAL_CHARACTER_INDEX = ROOT / "modules/hanzi-stroke/data/learning/character-learning-index.json"
LOCAL_CHAR_DIR = ROOT / "modules/hanzi-stroke/data/chars"
RADICAL_CATALOG = ROOT / "modules/hanzi-stroke/data/learning/radicals/radical_catalog.json"
HSK1_LIBRARY = ROOT / "modules/hanzi-stroke/data/learning/hsk/hsk_1.json"
UNIFIED_LOOKUP_DIR = ROOT / "modules/hanzi-stroke/data/learning/unified-lookup/all-sources"
UNIFIED_TARGET_INDEX = UNIFIED_LOOKUP_DIR / "unified-target-index.json"
UNIFIED_RECORD_DIR = UNIFIED_LOOKUP_DIR / "records"
OUTPUT_CHARACTER = ROOT / "modules/hanzi-stroke/data/learning/character-learning-index-hsk1.json"
OUTPUT_SENTENCE = ROOT / "modules/hanzi-stroke/data/learning/hsk1-vocabulary-sentence-index.json"
OUTPUT_REPORT = ROOT / "modules/hanzi-stroke/data/learning/hsk1-learning-data-report.json"

HAN_RE = re.compile(r"[\u3400-\u9fff]")
LESSON_RE = re.compile(r"lesson-(\d{2})\.json$")


def read_json(path: Path, fallback: Any = None) -> Any:
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def clean(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def first_nonempty(*values: Any) -> str:
    for value in values:
        text = clean(value)
        if text:
            return text
    return ""


def unique_rows(rows: Iterable[dict[str, Any]], key) -> list[dict[str, Any]]:
    seen: set[str] = set()
    result: list[dict[str, Any]] = []
    for row in rows:
        marker = clean(key(row))
        if not marker or marker in seen:
            continue
        seen.add(marker)
        result.append(row)
    return result


def lesson_paths() -> list[Path]:
    return [path for path in sorted(COURSE_DIR.glob("lesson-*.json")) if LESSON_RE.search(path.name)]


def load_course() -> tuple[list[dict[str, Any]], dict[str, list[dict[str, Any]]], list[dict[str, Any]]]:
    lessons: list[dict[str, Any]] = []
    vocabulary_rows: dict[str, list[dict[str, Any]]] = defaultdict(list)
    sentence_candidates: list[dict[str, Any]] = []

    def visit(value: Any, lesson_number: int, path: str = "") -> None:
        if isinstance(value, list):
            for index, item in enumerate(value):
                visit(item, lesson_number, f"{path}[{index}]")
            return
        if not isinstance(value, dict):
            return

        chinese = first_nonempty(value.get("hanzi"), value.get("chinese"), value.get("zh"))
        pinyin = first_nonempty(value.get("pinyin"), value.get("py"))
        meaning = first_nonempty(value.get("vi"), value.get("meaningVi"), value.get("meaning_vi"), value.get("translationVi"))
        sentence_scope = path.startswith((
            "entities.dialogues",
            "entities.passages",
            "entities.examplesPractice",
        ))
        if sentence_scope and chinese and pinyin and meaning and HAN_RE.search(chinese):
            sentence_candidates.append({
                "chinese": chinese,
                "pinyin": pinyin,
                "meaningVi": meaning,
                "lessonNumber": lesson_number,
                "sourcePath": path,
                "sourceLabel": f"New 3.0 · HSK 1 · Bài {lesson_number}",
                "reviewStatus": "reviewed",
            })
        for key, item in value.items():
            visit(item, lesson_number, f"{path}.{key}" if path else key)

    for path in lesson_paths():
        lesson = read_json(path, {})
        lessons.append(lesson)
        lesson_number = int(lesson.get("lessonNumber") or LESSON_RE.search(path.name).group(1))
        title = clean((lesson.get("title") or {}).get("vi") if isinstance(lesson.get("title"), dict) else lesson.get("title"))
        for row in lesson.get("entities", {}).get("vocabulary", []):
            word = clean(row.get("hanzi"))
            if not word:
                continue
            vocabulary_rows[word].append({
                "word": word,
                "pinyin": clean(row.get("pinyin")),
                "meaningVi": first_nonempty(row.get("vi"), row.get("meaningVi")),
                "wordClass": clean(row.get("wordClass")),
                "lessonNumber": lesson_number,
                "lessonTitle": title,
                "sourceId": clean(row.get("id")),
            })
        visit(lesson.get("entities", {}), lesson_number, "entities")
    return lessons, vocabulary_rows, sentence_candidates


def radical_lookup() -> dict[str, dict[str, Any]]:
    payload = read_json(RADICAL_CATALOG, {}) or {}
    result: dict[str, dict[str, Any]] = {}
    for item in payload.get("items", []):
        forms = [item.get("key"), item.get("mainForm"), item.get("sideForm"), *(item.get("variants") or [])]
        for form in forms:
            if clean(form):
                result[clean(form)] = item
    return result


def hsk1_library_items() -> dict[str, dict[str, Any]]:
    payload = read_json(HSK1_LIBRARY, {}) or {}
    return {clean(item.get("word")): item for item in payload.get("items", []) if clean(item.get("word"))}


def local_character(char: str) -> dict[str, Any]:
    return read_json(LOCAL_CHAR_DIR / f"{ord(char):X}.json", {}) or {}


def unified_target_buckets() -> dict[str, str]:
    payload = read_json(UNIFIED_TARGET_INDEX, {}) or {}
    return {clean(char): clean(bucket) for char, bucket in (payload.get("targets") or {}).items() if clean(char) and clean(bucket)}


def load_unified_records(chars: Iterable[str]) -> dict[str, dict[str, Any]]:
    buckets = unified_target_buckets()
    grouped: dict[str, list[str]] = defaultdict(list)
    for char in chars:
        bucket = buckets.get(char)
        if bucket:
            grouped[bucket].append(char)

    result: dict[str, dict[str, Any]] = {}
    for bucket, targets in grouped.items():
        payload = read_json(UNIFIED_RECORD_DIR / f"{bucket}.json", {}) or {}
        records = payload.get("records") or {}
        for char in targets:
            row = records.get(char)
            if isinstance(row, dict):
                result[char] = row
    return result


def resolved_unified_radical(record: dict[str, Any]) -> dict[str, Any]:
    radical = record.get("radical") if isinstance(record.get("radical"), dict) else {}
    if clean(radical.get("status")) != "resolved":
        return {}
    glyph = first_nonempty(radical.get("inputForm"), radical.get("sideForm"), radical.get("mainForm"))
    if not glyph:
        return {}
    return {
        "glyph": glyph,
        "mainForm": clean(radical.get("mainForm")),
        "sideForm": clean(radical.get("sideForm")),
        "id": clean(radical.get("id")),
        "nameVi": clean(radical.get("displayNameVi")),
        "pinyin": clean(radical.get("pinyin")),
        "hanViet": clean(radical.get("hanViet")),
        "meaningVi": clean(radical.get("meaningVi")),
        "source": first_nonempty(radical.get("source"), "unified-lookup"),
    }


def unified_component_rows(char: str, record: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for raw in record.get("components") or []:
        if not isinstance(raw, dict):
            continue
        glyph = first_nonempty(raw.get("glyph"), raw.get("char"), raw.get("character"))
        # Some legacy unified rows repeat the target itself. They are not a
        # decomposition and must not be shown as a child component.
        if not glyph or glyph == char:
            continue
        rows.append({
            "glyph": glyph,
            "position": clean(raw.get("position")),
            "positionVi": clean(raw.get("positionVi")),
            "role": clean(raw.get("role")),
            "roleVi": clean(raw.get("roleVi")),
            "nameVi": clean(raw.get("nameVi")),
            "pinyin": clean(raw.get("pinyin")),
            "hanViet": clean(raw.get("hanViet")),
            "meaningVi": first_nonempty(raw.get("meaningVi"), raw.get("meaning")),
            "reviewStatus": first_nonempty(raw.get("reviewStatus"), "reviewed"),
        })
    return rows


def unified_explanation(record: dict[str, Any]) -> str:
    memory = record.get("memory") if isinstance(record.get("memory"), dict) else {}
    structure = memory.get("characterStructure") if isinstance(memory.get("characterStructure"), dict) else {}
    explanation = structure.get("explanation") or []
    if isinstance(explanation, str):
        explanation = [explanation]
    return " ".join(clean(item) for item in explanation if clean(item))


def normalize_component(row: dict[str, Any]) -> dict[str, Any] | None:
    glyph = first_nonempty(row.get("glyph"), row.get("char"), row.get("character"))
    if not glyph:
        return None
    role = clean(row.get("role"))
    role_vi = clean(row.get("roleVi"))
    if not role_vi:
        role_vi = {"semantic": "gợi nghĩa", "phonetic": "gợi âm", "radical": "bộ thủ"}.get(role, "")
    return {
        "glyph": glyph,
        "position": clean(row.get("position")),
        "positionVi": clean(row.get("positionVi")),
        "role": role,
        "roleVi": role_vi,
        "nameVi": clean(row.get("nameVi")),
        "pinyin": clean(row.get("pinyin")),
        "hanViet": clean(row.get("hanViet")),
        "meaningVi": clean(row.get("meaningVi")),
        "reviewStatus": first_nonempty(row.get("reviewStatus"), "reviewed"),
    }


def merge_components(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for raw in rows:
        row = normalize_component(raw)
        if not row:
            continue
        glyph = row["glyph"]
        current = result.setdefault(glyph, {"glyph": glyph})
        for key, value in row.items():
            if key == "glyph":
                continue
            if not clean(current.get(key)) and clean(value):
                current[key] = value
    return list(result.values())


def build_character_index(vocabulary_rows: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    general = (read_json(GENERAL_CHARACTER_INDEX, {}) or {}).get("items", {})
    radicals = radical_lookup()
    library = hsk1_library_items()

    chars = sorted({char for word in vocabulary_rows for char in HAN_RE.findall(word)})
    unified_records = load_unified_records(chars)
    items: dict[str, dict[str, Any]] = {}
    for char in chars:
        base = json.loads(json.dumps(general.get(char, {}), ensure_ascii=False)) if general.get(char) else {}
        local = local_character(char)
        library_row = library.get(char, {})
        unified = unified_records.get(char, {})
        word_refs = [
            {
                "word": word,
                "pinyin": first_nonempty(rows[0].get("pinyin")),
                "meaningVi": first_nonempty(rows[0].get("meaningVi")),
                "lessons": sorted({int(row["lessonNumber"]) for row in rows}),
            }
            for word, rows in vocabulary_rows.items() if char in word
        ]

        radical = dict(base.get("radical") or {})
        unified_radical = resolved_unified_radical(unified)
        conflicts: list[dict[str, Any]] = []
        base_radical_id = clean(radical.get("id"))
        unified_radical_id = clean(unified_radical.get("id"))
        if base_radical_id and unified_radical_id and base_radical_id != unified_radical_id:
            conflicts.append({
                "field": "radical",
                "existing": {"id": base_radical_id, "glyph": clean(radical.get("glyph")), "source": first_nonempty(radical.get("source"), "character-learning-index")},
                "fallback": {"id": unified_radical_id, "glyph": clean(unified_radical.get("glyph")), "source": first_nonempty(unified_radical.get("source"), "unified-lookup")},
                "resolution": "kept-existing-curated",
            })
        radical_glyph = first_nonempty(radical.get("glyph"), local.get("radical"), unified_radical.get("glyph"))
        radical_meta = radicals.get(radical_glyph, {})
        if radical_glyph:
            radical.update({
                "glyph": radical_glyph,
                "id": first_nonempty(radical.get("id"), radical_meta.get("id"), unified_radical.get("id")),
                "mainForm": first_nonempty(radical.get("mainForm"), unified_radical.get("mainForm")),
                "sideForm": first_nonempty(radical.get("sideForm"), unified_radical.get("sideForm")),
                "nameVi": first_nonempty(radical.get("nameVi"), radical_meta.get("displayNameVi"), unified_radical.get("nameVi")),
                "pinyin": first_nonempty(radical.get("pinyin"), radical_meta.get("pinyin"), unified_radical.get("pinyin")),
                "hanViet": first_nonempty(radical.get("hanViet"), radical_meta.get("hanViet"), unified_radical.get("hanViet")),
                "meaningVi": first_nonempty(radical.get("meaningVi"), (radical_meta.get("shortForCharLookup") or {}).get("meaningLine"), unified_radical.get("meaningVi")),
                "source": first_nonempty(radical.get("source"), unified_radical.get("source"), "local-char+radical-catalog"),
            })

        component_rows = list(base.get("components") or [])
        component_rows.extend(unified_component_rows(char, unified))
        for raw in library_row.get("components") or []:
            radical_raw = raw.get("radical") if isinstance(raw, dict) else None
            glyph = clean((radical_raw or {}).get("character"))
            if glyph and glyph != char:
                component_rows.append({
                    "glyph": glyph,
                    "role": "radical",
                    "roleVi": "bộ thủ",
                    "meaningVi": clean((radical_raw or {}).get("meaning")),
                    "reviewStatus": "reviewed",
                })
        components = merge_components(component_rows)

        memory_explanations = ((library_row.get("memoryTips") or {}).get("characterStructure") or {}).get("explanation") or []
        explanation = first_nonempty(base.get("explanationVi"), " ".join(clean(x) for x in memory_explanations if clean(x)), unified_explanation(unified))
        pinyin = first_nonempty(base.get("pinyin"), local.get("pinyin"), library_row.get("pinyin"), unified.get("pinyin"))
        meaning = first_nonempty(base.get("meaningVi"), local.get("meaningVi"), library_row.get("meaningVi"), library_row.get("translationVi"), unified.get("meaningShortVi"), unified.get("meaningFullVi"))
        han_viet = first_nonempty(base.get("hanViet"), local.get("hanViet"), unified.get("hanViet"))

        sources = list(base.get("sources") or [])
        for source in ("new-hsk1-vocabulary", "local-char", "hsk1-library", "unified-lookup"):
            if source not in sources:
                sources.append(source)

        items[char] = {
            "char": char,
            "pinyin": pinyin,
            "hanViet": han_viet,
            "meaningVi": meaning,
            "levels": [1],
            "radical": radical,
            "structure": base.get("structure") or {"type": "", "labelVi": ""},
            "components": components,
            "explanationVi": explanation,
            "memoryVi": clean(base.get("memoryVi")),
            "commonErrors": list(base.get("commonErrors") or []),
            "vocabularyRefs": sorted(word_refs, key=lambda row: (row["lessons"], row["word"])),
            "qualityStatus": first_nonempty(base.get("qualityStatus"), "partial"),
            "sources": sources,
            "conflicts": conflicts,
        }

    return {
        "schemaVersion": "character-learning-index-hsk1-v1",
        "scope": "new-hsk-1-vocabulary",
        "sourcePolicy": "existing-curated-first; local-char/radical-catalog/unified-lookup fallback; no inferred component roles",
        "vocabularyTotal": len(vocabulary_rows),
        "total": len(items),
        "items": items,
    }


def build_sentence_index(vocabulary_rows: dict[str, list[dict[str, Any]]], candidates: list[dict[str, Any]]) -> dict[str, Any]:
    library = hsk1_library_items()
    items: dict[str, Any] = {}
    for word, refs in sorted(vocabulary_rows.items()):
        rows = []
        for candidate in candidates:
            if word in candidate["chinese"]:
                rows.append({**candidate, "containsTarget": True, "target": word, "source": "new-hsk1-course"})
        for example in library.get(word, {}).get("examples") or []:
            chinese = clean(example.get("chinese"))
            pinyin = clean(example.get("pinyin"))
            meaning = first_nonempty(example.get("meaning_vi"), example.get("meaningVi"))
            if chinese and pinyin and meaning and word in chinese:
                rows.append({
                    "chinese": chinese,
                    "pinyin": pinyin,
                    "meaningVi": meaning,
                    "lessonNumber": None,
                    "sourcePath": "hsk_1.json.examples",
                    "sourceLabel": "HSK 9 cấp · HSK 1",
                    "source": "hsk1-library",
                    "target": word,
                    "containsTarget": True,
                    "reviewStatus": "reviewed",
                })
        rows = unique_rows(rows, lambda row: re.sub(r"\s+", "", row["chinese"]))
        items[word] = {
            "word": word,
            "pinyin": first_nonempty(*(row.get("pinyin") for row in refs)),
            "meaningVi": first_nonempty(*(row.get("meaningVi") for row in refs)),
            "lessons": sorted({int(row["lessonNumber"]) for row in refs}),
            "sentences": rows,
        }
    return {
        "schemaVersion": "hsk1-vocabulary-sentence-index-v1",
        "scope": "new-hsk-1-vocabulary",
        "total": len(items),
        "items": items,
    }


def main() -> None:
    _lessons, vocabulary_rows, candidates = load_course()
    character_payload = build_character_index(vocabulary_rows)
    sentence_payload = build_sentence_index(vocabulary_rows, candidates)

    OUTPUT_CHARACTER.write_text(json.dumps(character_payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    OUTPUT_SENTENCE.write_text(json.dumps(sentence_payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    chars = character_payload["items"]
    sentence_items = sentence_payload["items"]
    report = {
        "scope": "HSK 1 only",
        "lessonTotal": len(lesson_paths()),
        "vocabularyRowTotal": sum(len(rows) for rows in vocabulary_rows.values()),
        "uniqueVocabularyTotal": len(vocabulary_rows),
        "uniqueCharacterTotal": len(chars),
        "withPinyin": sum(bool(row.get("pinyin")) for row in chars.values()),
        "withHanViet": sum(bool(row.get("hanViet")) for row in chars.values()),
        "withMeaning": sum(bool(row.get("meaningVi")) for row in chars.values()),
        "withRadical": sum(bool(row.get("radical", {}).get("glyph")) for row in chars.values()),
        "withComponents": sum(bool(row.get("components")) for row in chars.values()),
        "withMultipleComponents": sum(len(row.get("components") or []) >= 2 for row in chars.values()),
        "withStructure": sum(bool(row.get("structure", {}).get("labelVi") or row.get("structure", {}).get("type")) for row in chars.values()),
        "withExplanation": sum(bool(row.get("explanationVi")) for row in chars.values()),
        "withVerifiedComponentRoles": sum(any(clean(component.get("role")) in {"semantic", "phonetic"} for component in row.get("components") or []) for row in chars.values()),
        "missingRadical": [char for char, row in chars.items() if not row.get("radical", {}).get("glyph")],
        "missingComponents": [char for char, row in chars.items() if not row.get("components")],
        "minimalOnly": [
            char for char, row in chars.items()
            if not row.get("components")
            and not (row.get("structure", {}).get("labelVi") or row.get("structure", {}).get("type"))
            and not row.get("explanationVi")
        ],
        "sourceConflicts": [
            {"char": char, "conflicts": row.get("conflicts")}
            for char, row in chars.items() if row.get("conflicts")
        ],
        "wordsWithSentences": sum(bool(row.get("sentences")) for row in sentence_items.values()),
        "wordsWithoutSentences": [word for word, row in sentence_items.items() if not row.get("sentences")],
        "sentenceTotal": sum(len(row.get("sentences") or []) for row in sentence_items.values()),
    }
    OUTPUT_REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

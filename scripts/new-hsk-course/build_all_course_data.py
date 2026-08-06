#!/usr/bin/env python3
"""Build every reviewed New 3.0 lesson (HSK 1-3) from app-ready Markdown.

The runtime keeps one structured JSON per lesson and two views:
- bookFlow: full textbook order via contentSections
- groupedIndex: vocabulary/dialogue/grammar/passage/exercise groups

Audio refs follow the textbook packages:
- HSK 1: dialogue/vocabulary pairs 1-6; lessons 1-3 also have track 7 rhyme.
- HSK 2-3: dialogue/vocabulary pairs 1-6 plus passage/vocabulary tracks 7-8.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from build_course_data import (  # noqa: E402
    BuildError,
    SCHEMA_VERSION,
    clean_markdown_inline,
    longest_match_tokens,
    parse_frontmatter,
    parse_markdown_dialogues,
    parse_markdown_table,
    parse_numbered_list,
    parse_trace,
    read_text,
    slug,
    split_sections,
    strip_numbered_title,
    sub_sections,
    table_dicts,
)

CJK_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
AUDIO_RE = re.compile(r"(?:Audio(?: từ mới)?|Mã audio|Audio gốc)\s*:\s*`([^`]+)`", re.I)

GENERIC_ACTIVITY_CONFIG = {
    "flashcards": {"label": "🎓 Flashcard", "supportedSources": ["vocabulary", "properNouns", "sentences", "dialogues", "passages", "grammar"], "defaultSources": ["vocabulary", "properNouns", "sentences", "dialogues", "passages", "grammar"]},
    "listening": {"label": "Nghe", "supportedSources": ["vocabulary", "properNouns", "sentences", "dialogues", "passages", "grammar"], "defaultSources": ["sentences", "dialogues", "passages"]},
    "fill": {"label": "Điền từ", "supportedSources": ["vocabulary", "properNouns", "sentences", "dialogues", "passages", "grammar"], "defaultSources": ["vocabulary", "sentences", "grammar"]},
    "matching": {"label": "Nối", "supportedSources": ["vocabulary", "properNouns", "sentences", "dialogues", "passages", "grammar"], "defaultSources": ["vocabulary", "sentences"]},
    "ordering": {"label": "Sắp xếp câu", "supportedSources": ["sentences", "dialogues", "passages", "grammar"], "defaultSources": ["sentences", "dialogues"]},
    "typing": {"label": "Gõ câu / đoạn", "supportedSources": ["sentences", "dialogues", "passages", "grammar"], "defaultSources": ["sentences", "dialogues", "passages"]},
    "translateZhVi": {"label": "Dịch Trung → Việt", "supportedSources": ["sentences", "dialogues", "passages", "grammar"], "defaultSources": ["sentences", "dialogues"]},
    "translateViZh": {"label": "Dịch Việt → Trung", "supportedSources": ["sentences", "dialogues", "passages", "grammar"], "defaultSources": ["sentences", "dialogues"]},
    "roleplay": {"label": "Hội thoại", "supportedSources": ["dialogues"], "defaultSources": ["dialogues"]},
    "characters": {"label": "Cấu tạo & Bộ thủ", "supportedSources": ["vocabulary", "properNouns", "passages"], "defaultSources": ["vocabulary", "passages"]},
}


def normalize_title(title: str) -> str:
    return strip_numbered_title(title).strip()


def section_kind(title: str) -> str:
    value = normalize_title(title).lower()
    if value == "mục tiêu": return "objectives"
    if "khởi động" in value: return "warmup"
    if re.search(r"bài khóa\s*\d+", value): return "lesson-text"
    if "ngữ pháp" in value or "lớp học của tiểu ngữ" in value: return "grammar"
    if "đoạn văn" in value or "bài đọc" in value or "bài vè" in value or "绕口令" in title: return "passage"
    if "bài tập" in value: return "exercise"
    if "hoạt động" in value: return "activity"
    if "món quà" in value or "彩蛋" in title or "mở rộng" in value: return "extension"
    if "báo cáo" in value: return "report"
    return "content"


def extract_audio_refs(markdown: str) -> list[str]:
    refs: list[str] = []
    for ref in AUDIO_RE.findall(markdown):
        ref = ref.strip()
        if ref and ref not in refs:
            refs.append(ref)
    return refs


def parse_vocab_rows(text: str, lesson_id: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, list[str]]]:
    vocabulary: list[dict[str, Any]] = []
    proper: list[dict[str, Any]] = []
    by_section: dict[str, list[str]] = defaultdict(list)
    seen_vocab: set[str] = set()
    seen_proper: set[str] = set()

    for parent in split_sections(text, 2):
        parent_title = normalize_title(parent.title)
        candidates = sub_sections(parent.text, 3)
        # HSK 3 passage blocks may put tables at H4.
        for child in list(candidates):
            candidates.extend(sub_sections(child.text, 4))
        for sec in candidates:
            title = normalize_title(sec.title)
            if title not in {"Từ mới", "Danh từ riêng"}:
                continue
            rows = table_dicts(sec.text)
            for row in rows:
                hanzi = str(row.get("Chữ Hán", "")).strip()
                if not hanzi:
                    continue
                order_raw = str(row.get("STT", "")).strip()
                try:
                    order = int(re.sub(r"\D+", "", order_raw) or 0)
                except ValueError:
                    order = 0
                if title == "Từ mới":
                    key = f"{parent_title}:{order}:{hanzi}"
                    if key in seen_vocab:
                        continue
                    seen_vocab.add(key)
                    source_order = order
                    order = len(vocabulary) + 1
                    item = {
                        "id": f"{lesson_id}-vocab-{order:03d}",
                        "order": order,
                        "sourceOrder": source_order,
                        "hanzi": hanzi,
                        "pinyin": str(row.get("Pinyin", "")).strip(),
                        "hanViet": str(row.get("Hán Việt", "")).strip(),
                        "wordClass": str(row.get("Từ loại", "")).strip(),
                        "vi": str(row.get("Nghĩa tiếng Việt", "")).strip(),
                        "note": str(row.get("Ghi chú", "")).strip(),
                        "sourceSection": parent_title,
                    }
                    vocabulary.append(item)
                    by_section[parent_title].append(item["id"])
                else:
                    key = f"{parent_title}:{order}:{hanzi}"
                    if key in seen_proper:
                        continue
                    seen_proper.add(key)
                    source_order = order
                    order = len(proper) + 1
                    item = {
                        "id": f"{lesson_id}-proper-noun-{order:03d}",
                        "order": order,
                        "sourceOrder": source_order,
                        "hanzi": hanzi,
                        "pinyin": str(row.get("Pinyin", "")).strip(),
                        "hanViet": str(row.get("Hán Việt", "")).strip(),
                        "kind": str(row.get("Loại", "")).strip(),
                        "vi": str(row.get("Nghĩa tiếng Việt", "")).strip(),
                        "sourceSection": parent_title,
                    }
                    proper.append(item)
                    by_section[parent_title].append(item["id"])
    vocabulary.sort(key=lambda row: (row["order"], row["hanzi"]))
    proper.sort(key=lambda row: (row["order"], row["hanzi"]))
    return vocabulary, proper, by_section


def dialogue_entities(dialogue_data: dict[str, Any], lesson_id: str, terms: Iterable[str]) -> tuple[list[dict[str, Any]], dict[str, str]]:
    """Normalize the three technical dialogue formats used by HSK 1, 2 and 3."""
    dialogues: list[dict[str, Any]] = []
    section_to_id: dict[str, str] = {}
    known_terms = [term for term in terms if term]
    groups = dialogue_data.get("dialogue_groups") or dialogue_data.get("dialogues") or []
    for order, group in enumerate(groups, 1):
        dialogue_id = f"{lesson_id}-dialogue-{order:02d}"
        section_title = normalize_title(str(
            group.get("section_level2")
            or group.get("section")
            or group.get("source_heading")
            or f"Bài khóa {order}"
        ))
        section_to_id[section_title] = dialogue_id
        turns: list[dict[str, Any]] = []
        speaker_terms = [str(turn.get("speaker_zh", "")).strip() for turn in group.get("turns", [])]
        turn_terms = known_terms + [value for value in speaker_terms if value]
        for raw in group.get("turns", []):
            turn_order = int(raw.get("order") or len(turns) + 1)
            hanzi = str(raw.get("hanzi", "")).strip()
            turns.append({
                "id": f"{dialogue_id}-turn-{turn_order:03d}",
                "order": turn_order,
                "speaker": {
                    "vi": str(raw.get("speaker_vi", "")).strip(),
                    "hanzi": str(raw.get("speaker_zh", "")).strip(),
                    "pinyin": str(raw.get("speaker_pinyin", "")).strip(),
                },
                "hanzi": hanzi,
                "pinyin": str(raw.get("pinyin", "")).strip(),
                "vi": str(raw.get("vietnamese", "")).strip(),
                "answerTokens": longest_match_tokens(hanzi, turn_terms),
            })
        dialogues.append({
            "id": dialogue_id,
            "order": order,
            "kind": str(group.get("kind", "main-dialogue")),
            "sourceHeading": str(group.get("source_heading") or group.get("section") or section_title),
            "sourceSection": section_title,
            "audioRef": str(group.get("audio", "")).strip() or None,
            "context": {
                "hanzi": str(group.get("context_zh", "")).strip(),
                "vi": str(group.get("context_vi", "")).strip(),
            },
            "turns": turns,
        })
    return dialogues, section_to_id


def first_bold(text: str) -> str:
    match = re.search(r"^\*\*(.+?)\*\*\s*$", text, re.M)
    return match.group(1).strip() if match else ""


def plain_lines(text: str) -> list[str]:
    rows: list[str] = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.startswith("|") or re.match(r"^[-:| ]+$", line):
            continue
        line = re.sub(r"\*\*(.+?)\*\*", r"\1", line)
        line = re.sub(r"`(.+?)`", r"\1", line)
        rows.append(line.strip())
    return rows


def context_for_section(section_text: str) -> dict[str, str]:
    section = next((s for s in sub_sections(section_text, 3) if normalize_title(s.title) == "Bối cảnh"), None)
    if not section:
        return {"hanzi": "", "vi": ""}
    hanzi = first_bold(section.text)
    rows = [row for row in plain_lines(section.text) if row != hanzi]
    return {"hanzi": hanzi, "vi": " ".join(rows)}


def parse_layered_from_parent(parent_text: str, child_level: int) -> dict[str, str] | None:
    children = sub_sections(parent_text, child_level)
    mapping = {"Chữ Hán": "hanzi", "Pinyin": "pinyin", "Tiếng Việt": "vi"}
    layers = {"hanzi": "", "pinyin": "", "vi": ""}
    for child in children:
        key = mapping.get(normalize_title(child.title))
        if key:
            lines = [clean_markdown_inline(row.strip()) for row in child.text.splitlines() if row.strip()]
            layers[key] = "\n".join(lines)
    return layers if layers["hanzi"] else None


def parse_passages(text: str, lesson_id: str, level: int, lesson: int, vocab_by_section: dict[str, list[str]]) -> list[dict[str, Any]]:
    passages: list[dict[str, Any]] = []
    seen: set[str] = set()
    for h2 in split_sections(text, 2):
        title2 = normalize_title(h2.title)
        # H2 with direct H3 layers (HSK 1 rhyme / HSK 2 Bài khóa 4)
        direct = parse_layered_from_parent(h2.text, 3)
        if direct and "hội thoại" not in title2.lower():
            key = direct["hanzi"]
            if key not in seen:
                seen.add(key)
                order = len(passages) + 1
                passages.append({
                    "id": f"{lesson_id}-passage-{order:02d}",
                    "order": order,
                    "kind": "rhyme" if ("bài vè" in title2.lower() or "绕口令" in h2.title) else "reading",
                    "title": title2,
                    "audioRef": f"{lesson}-7" if (level >= 2 or lesson <= 3) else None,
                    "vocabularyAudioRef": f"{lesson}-8" if level >= 2 else None,
                    "sourceSection": title2,
                    **direct,
                })
        # H3 parent with H4 layers (HSK 3 passage)
        for h3 in sub_sections(h2.text, 3):
            title3 = normalize_title(h3.title)
            if "hội thoại" in title3.lower():
                continue
            nested = parse_layered_from_parent(h3.text, 4)
            if nested:
                key = nested["hanzi"]
                if key in seen:
                    continue
                seen.add(key)
                order = len(passages) + 1
                passages.append({
                    "id": f"{lesson_id}-passage-{order:02d}",
                    "order": order,
                    "kind": "reading",
                    "title": title3,
                    "audioRef": f"{lesson}-7" if level >= 2 else None,
                    "vocabularyAudioRef": f"{lesson}-8" if level >= 2 else None,
                    "sourceSection": title2,
                    **nested,
                })
    return passages


def grammar_entities(text: str, lesson_id: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    grammar: list[dict[str, Any]] = []
    examples: list[dict[str, Any]] = []
    for h2 in split_sections(text, 2):
        title2 = normalize_title(h2.title)
        lower = title2.lower()
        if "ngữ pháp" not in lower and "lớp học của tiểu ngữ" not in lower:
            continue
        h3s = sub_sections(h2.text, 3)
        topic_sections = [s for s in h3s if normalize_title(s.title) not in {"Nội dung", "Đọc to", "Mẫu khái quát"}]
        if not topic_sections:
            topic_sections = [h2]
        for topic in topic_sections:
            title = title2 if topic is h2 else normalize_title(topic.title)
            markdown = h2.text if topic is h2 else topic.text
            order = len(grammar) + 1
            first = first_bold(markdown)
            rows = plain_lines(markdown)
            explanation = " ".join(row for row in rows if not row.lower().startswith("audio:"))
            entity = {
                "id": f"{lesson_id}-grammar-{order:02d}",
                "order": order,
                "title": title,
                "structure": first or title,
                "explanationVi": explanation,
                "markdown": markdown.strip(),
                "sourceSection": title2,
                "reviewStatus": "verified-against-source-pages",
            }
            grammar.append(entity)
            # Keep example/practice blocks addressable in grouped view.
            for child in sub_sections(markdown, 4 if topic is not h2 else 3):
                child_title = normalize_title(child.title)
                if "ví dụ" not in child_title.lower() and "bài luyện" not in child_title.lower() and "đọc to" not in child_title.lower():
                    continue
                ex_order = len(examples) + 1
                examples.append({
                    "id": f"{lesson_id}-example-practice-{ex_order:03d}",
                    "order": ex_order,
                    "grammarId": entity["id"],
                    "title": child_title,
                    "markdown": child.text.strip(),
                })
    return grammar, examples


def generic_exercises(text: str, lesson_id: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    exercises: list[dict[str, Any]] = []
    activities: list[dict[str, Any]] = []
    extensions: list[dict[str, Any]] = []
    for h2 in split_sections(text, 2):
        title = normalize_title(h2.title)
        kind = section_kind(title)
        if kind == "exercise" or kind == "warmup":
            order = len(exercises) + 1
            exercises.append({"id": f"{lesson_id}-exercise-{order:03d}", "order": order, "type": kind, "title": title, "markdown": h2.text.strip()})
        elif kind == "activity":
            order = len(activities) + 1
            activities.append({"id": f"{lesson_id}-activity-{order:03d}", "order": order, "type": "class-activity", "title": title, "markdown": h2.text.strip(), "hanzi": "", "vi": ""})
        elif kind == "extension":
            order = len(extensions) + 1
            extensions.append({"id": f"{lesson_id}-extension-{order:02d}", "order": order, "kind": "extension", "title": title, "markdown": h2.text.strip(), "audioRefs": extract_audio_refs(h2.text)})
    return exercises, activities, extensions


def content_sections(text: str, lesson_id: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for h2 in split_sections(text, 2):
        title = normalize_title(h2.title)
        kind = section_kind(title)
        if title == "Truy vết trang nguồn" or kind == "report":
            continue
        order = len(rows) + 1
        rows.append({
            "id": f"{lesson_id}-content-{order:02d}",
            "order": order,
            "title": title,
            "kind": kind,
            "markdown": h2.text.strip(),
            "audioRefs": extract_audio_refs(h2.text),
        })
    return rows


def apply_hsk1_source_manifests(repo: Path, lesson_id: str, sections: list[dict[str, Any]]) -> tuple[int, int, int]:
    """Merge source trace, activity keys and presentation metadata after Markdown parsing.

    Full-page PDF captures stay in JSON for auditability but are marked
    ``displayInLesson: false``. Only clean PPT assets or explicit ``pdf-crop``
    assets are eligible for the learner-facing lesson UI.
    """
    if not lesson_id.startswith("nhsk-1-"):
        return 0, 0, 0
    base = repo / "modules/new-hsk-course/source/hsk1"
    visual_path = base / "visual-manifest.json"
    task_path = base / "source-task-manifest.json"
    display_path = base / "display-manifest.json"
    visuals: dict[str, Any] = {}
    tasks: dict[str, Any] = {}
    display_sections: dict[str, Any] = {}
    if visual_path.exists():
        visuals = ((json.loads(visual_path.read_text(encoding="utf-8")).get("lessons", {}).get(lesson_id, {}) or {}).get("sections", {}))
    if task_path.exists():
        tasks = ((json.loads(task_path.read_text(encoding="utf-8")).get("lessons", {}).get(lesson_id, {}) or {}).get("sections", {}))
    if display_path.exists():
        display_sections = ((json.loads(display_path.read_text(encoding="utf-8")).get("lessons", {}).get(lesson_id, {}) or {}).get("sections", {}))
    visual_count = 0
    visible_visual_count = 0
    task_count = 0
    for section in sections:
        section_id = section.get("id")
        config = display_sections.get(section_id, {}) or {}
        section_visuals = config.get("sourceVisuals") or visuals.get(section_id) or []
        if section_visuals:
            section["sourceVisuals"] = section_visuals
            visual_count += len(section_visuals)
            visible_visual_count += sum(1 for item in section_visuals if item.get("displayInLesson") is True)
        if tasks.get(section_id):
            section["sourceTasks"] = tasks[section_id]
            task_count += len(tasks[section_id])
        for key in ("warmupDisplay", "grammarDisplay", "summaryDisplay"):
            if config.get(key):
                section[key] = config[key]
    return visual_count, task_count, visible_visual_count


def load_character_sources(repo: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    base = repo / "modules/hanzi-stroke/data/learning/character-enrichment/hsk1-3-single"
    index = json.loads((base / "index.json").read_text(encoding="utf-8"))
    radical_catalog = json.loads((repo / "modules/hanzi-stroke/data/learning/radicals/radical_catalog.json").read_text(encoding="utf-8"))
    radical_by_id = {str(item.get("id")): item for item in (radical_catalog.get("items") or radical_catalog if isinstance(radical_catalog, list) else [])}
    return index, {"base": base, "radicals": radical_by_id}


def position_vi(value: str) -> str:
    mapping = {"left": "bên trái", "right": "bên phải", "top": "phía trên", "bottom": "phía dưới", "inside": "bên trong", "outside": "bên ngoài"}
    return mapping.get(str(value or "").lower(), str(value or ""))


def role_vi(value: str) -> str:
    return {"semantic": "gợi nghĩa", "phonetic": "gợi âm", "semantic-phonetic": "gợi nghĩa và âm", "structural": "cấu tạo", "uncertain": "chưa xác định"}.get(value, "cấu tạo")


def build_character_data(repo: Path, lesson: dict[str, Any], index: dict[str, Any], char_sources: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    lesson_id = lesson["id"]
    entities = lesson["entities"]
    source_rows = [*entities.get("vocabulary", []), *entities.get("properNouns", [])]
    glyph_sources: dict[str, list[str]] = defaultdict(list)
    for row in source_rows:
        for glyph in CJK_RE.findall(str(row.get("hanzi", ""))):
            if row["id"] not in glyph_sources[glyph]:
                glyph_sources[glyph].append(row["id"])
    for dialogue in entities.get("dialogues", []):
        for turn in dialogue.get("turns", []):
            for glyph in CJK_RE.findall(turn.get("hanzi", "")):
                glyph_sources.setdefault(glyph, [])
    characters: list[dict[str, Any]] = []
    char_detail_by_glyph: dict[str, dict[str, Any]] = {}
    base: Path = char_sources["base"]
    for glyph in sorted(glyph_sources, key=lambda g: (min([row.get("order", 9999) for row in source_rows if g in row.get("hanzi", "")] or [9999]), g)):
        meta = index.get(glyph)
        if not meta or not meta.get("path"):
            continue
        path = base / str(meta["path"])
        if not path.exists():
            continue
        detail = json.loads(path.read_text(encoding="utf-8"))
        radical = detail.get("characterInfo", {}).get("radical", {}) or {}
        components = []
        for component in detail.get("components", []) or []:
            cg = str(component.get("character", "")).strip()
            if not cg:
                continue
            components.append({
                "glyph": cg,
                "position": str(component.get("position", "")),
                "positionVi": position_vi(component.get("position", "")),
                "role": str(component.get("role", "structural")),
                "roleVi": role_vi(str(component.get("role", "structural"))),
                "reviewStatus": "reviewed" if str(component.get("reviewStatus", "")).lower() in {"source-backed", "reviewed"} else "needs-review",
                "nameVi": str(component.get("hanViet", "") or cg).title(),
                "pinyin": str(component.get("pinyin", "")),
                "hanViet": str(component.get("hanViet", "")).lower(),
            })
        char_id = f"nhsk-char-{ord(glyph):04x}"
        item = {
            "id": char_id,
            "hanzi": glyph,
            "pinyin": [str(detail.get("pronunciation", {}).get("pinyin", meta.get("pinyin", "")))],
            "meaningsVi": [str(detail.get("meanings", {}).get("shortVi", meta.get("meaningVi", "")))],
            "studyPriority": "recognition",
            "sourceRefs": {"vocabularyIds": glyph_sources[glyph], "sentenceIds": []},
            "structure": {"type": "unknown", "labelVi": str(detail.get("characterInfo", {}).get("formationTypeVi", "chưa phân loại"))},
            "dictionaryRadical": {
                "glyph": str(radical.get("sideForm") or radical.get("inputForm") or radical.get("mainForm") or ""),
                "radicalId": str(radical.get("radicalId", "")),
                "nameVi": str(radical.get("displayNameVi", "")),
                "pinyin": str(radical.get("pinyin", "")),
                "hanViet": str(radical.get("hanViet", "")),
            },
            "components": components,
            "strokes": {"count": detail.get("characterInfo", {}).get("strokeCount"), "writerChar": glyph},
            "pedagogy": {"commonErrors": [], "confusableCharacterIds": []},
            "reviewStatus": "curated" if str(meta.get("qualityStatus", "")) == "PASS" else "partial",
        }
        characters.append(item)
        char_detail_by_glyph[glyph] = detail
    # Prioritize 3-5 source-backed characters with component data.
    core = [row for row in characters if row["components"] and row["dictionaryRadical"]["radicalId"]][:5]
    for row in core:
        row["studyPriority"] = "core"
    # Character-build exercises from core component data.
    build_exercises: list[dict[str, Any]] = []
    distractors = [component["glyph"] for row in core for component in row["components"]]
    for row in core:
        answers = [comp["glyph"] for comp in row["components"]]
        if len(answers) < 2:
            continue
        choices = []
        for glyph in [*answers, *distractors]:
            if glyph not in choices:
                choices.append(glyph)
            if len(choices) >= max(4, len(answers) + 2):
                break
        build_exercises.append({
            "id": f"{lesson_id}-char-build-{len(build_exercises)+1:03d}",
            "order": len(build_exercises) + 1,
            "type": "character-build",
            "characterId": row["id"],
            "componentChoices": choices,
            "answerComponents": answers,
            "verificationStatus": "source-backed-character-enrichment",
        })
    # Radical-sort groups from verified character radicals.
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in characters:
        radical_id = row["dictionaryRadical"].get("radicalId")
        if not radical_id or row["reviewStatus"] not in {"curated", "partial"}:
            continue
        grouped[radical_id].append(row)
    eligible = [(rid, rows) for rid, rows in grouped.items() if rows]
    # Prefer groups with >=2 items, then fill with singletons only when needed.
    eligible.sort(key=lambda pair: (-len(pair[1]), pair[0]))
    groups: list[dict[str, Any]] = []
    items: list[dict[str, Any]] = []
    rounds: list[dict[str, Any]] = []
    selected = eligible[:12]
    for rid, rows in selected:
        sample = rows[0]["dictionaryRadical"]
        gid = f"{lesson_id}-radical-group-{rid}"
        groups.append({
            "id": gid,
            "radicalId": rid,
            "glyph": sample.get("glyph", ""),
            "mainForm": sample.get("glyph", ""),
            "nameVi": sample.get("nameVi", ""),
            "pinyin": sample.get("pinyin", ""),
            "hanViet": sample.get("hanViet", ""),
        })
        for row in rows[:3]:
            items.append({
                "id": f"{lesson_id}-radical-item-{len(items)+1:03d}",
                "hanzi": row["hanzi"],
                "groupId": gid,
                "sourceIds": row["sourceRefs"]["vocabularyIds"],
            })
    for round_index in range(0, len(groups), 4):
        round_groups = groups[round_index:round_index+4]
        group_ids = {row["id"] for row in round_groups}
        round_items = [row for row in items if row["groupId"] in group_ids]
        if len(round_groups) < 2 or len(round_items) < 4:
            continue
        rounds.append({
            "id": f"{lesson_id}-radical-round-{len(rounds)+1:02d}",
            "order": len(rounds) + 1,
            "groupIds": [row["id"] for row in round_groups],
            "itemIds": [row["id"] for row in round_items],
        })
    radical_exercises = []
    if rounds:
        used_group_ids = {gid for rnd in rounds for gid in rnd["groupIds"]}
        used_item_ids = {iid for rnd in rounds for iid in rnd["itemIds"]}
        radical_exercises.append({
            "id": f"{lesson_id}-radical-sort-001",
            "order": 1,
            "type": "radical-sort",
            "scope": "lesson",
            "title": "Xếp chữ vào đúng bộ thủ",
            "instruction": "Chọn chữ rồi chọn bộ thủ, hoặc chọn bộ thủ rồi chọn nhiều chữ.",
            "verificationStatus": "derived-from-reviewed-character-enrichment",
            "groups": [row for row in groups if row["id"] in used_group_ids],
            "items": [row for row in items if row["id"] in used_item_ids],
            "rounds": rounds,
        })
    character_plan = {
        "coreCharacterIds": [row["id"] for row in core],
        "recognitionCharacterIds": [row["id"] for row in characters if row not in core],
    }
    return characters, radical_exercises, build_exercises, character_plan


def generate_practice_plan(lesson: dict[str, Any], character_plan: dict[str, Any]) -> dict[str, Any]:
    entities = lesson["entities"]
    sentence_ids = [turn["id"] for dialogue in entities.get("dialogues", []) for turn in dialogue.get("turns", [])]
    grammar_ids = [row["id"] for row in entities.get("grammar", [])] or [row["id"] for row in entities.get("languageNotes", [])]
    source_groups = {
        "vocabulary": {"label": "Từ vựng", "entityType": "vocabulary", "ids": [row["id"] for row in entities.get("vocabulary", [])]},
        "properNouns": {"label": "Danh từ riêng", "entityType": "properNouns", "ids": [row["id"] for row in entities.get("properNouns", [])]},
        "sentences": {"label": "Câu", "entityType": "dialogueTurns", "ids": sentence_ids},
        "dialogues": {"label": "Hội thoại", "entityType": "dialogues", "ids": [row["id"] for row in entities.get("dialogues", [])]},
        "passages": {"label": "Đoạn / bài vè", "entityType": "passages", "ids": [row["id"] for row in entities.get("passages", [])]},
        "grammar": {"label": "Ngữ pháp", "entityType": "grammarReview", "ids": grammar_ids},
    }
    radical_ids = [row["id"] for row in entities.get("radicalSortExercises", [])]
    build_ids = [row["id"] for row in entities.get("characterBuildExercises", [])]
    return {
        "version": 2,
        "defaultActivity": "flashcards",
        "sourceGroups": source_groups,
        "activities": GENERIC_ACTIVITY_CONFIG,
        "curatedExerciseIds": {"fillSentence": [], "fillGrammar": [], "oddOneOut": [], "radicalSort": radical_ids, "characterBuild": build_ids},
        "characters": character_plan,
    }


def parse_trace_flexible(body: str) -> list[dict[str, Any]]:
    """Keep the schema-compatible first page while preserving ranges in the content text."""
    section = next((sec for sec in split_sections(body, 2) if normalize_title(sec.title) == "Truy vết trang nguồn"), None)
    if not section:
        return []
    result: list[dict[str, Any]] = []
    for row in table_dicts(section.text):
        raw_page = str(row.get("Trang PDF", "")).strip()
        match = re.search(r"\d+", raw_page)
        if not match:
            continue
        content = str(row.get("Nội dung được đối chiếu", "")).strip()
        if raw_page != match.group(0):
            content = f"Trang PDF {raw_page}: {content}"
        result.append({
            "pdfPage": int(match.group(0)),
            "bookPage": str(row.get("Trang sách", "")).strip(),
            "content": content,
            "status": str(row.get("Trạng thái", "")).strip(),
        })
    return result


def build_lesson(repo: Path, markdown_path: Path, dialogue_path: Path, char_index: dict[str, Any], char_sources: dict[str, Any], preserve_practice: dict[str, Any] | None = None) -> dict[str, Any]:
    markdown_text = read_text(markdown_path)
    front, body = parse_frontmatter(markdown_text)
    level = int(front["level"])
    lesson_no = int(front["lesson"])
    lesson_id = slug(level, lesson_no)
    dialogue_data = json.loads(read_text(dialogue_path))

    # Validate the three-layer dialogue copy against technical JSON whenever possible.
    try:
        md_dialogues = parse_markdown_dialogues(body)
        if len(md_dialogues) == len(dialogue_data.get("dialogue_groups", [])):
            from build_course_data import assert_dialogues_match
            assert_dialogues_match(md_dialogues, dialogue_data)
    except Exception as exc:
        raise BuildError(f"{markdown_path.name}: dialogue validation failed: {exc}") from exc

    vocabulary, proper, vocab_by_section = parse_vocab_rows(body, lesson_id)
    terms = [row["hanzi"] for row in vocabulary] + [row["hanzi"] for row in proper]
    dialogues, section_to_dialogue = dialogue_entities(dialogue_data, lesson_id, terms)

    # Context and lesson-text audio mapping.
    h2_map = {normalize_title(sec.title): sec for sec in split_sections(body, 2)}
    lesson_texts: list[dict[str, Any]] = []
    for dialogue in dialogues:
        section_title = dialogue["sourceSection"]
        parent = h2_map.get(section_title)
        context = dialogue.get("context") or {"hanzi": "", "vi": ""}
        if not context.get("hanzi") and not context.get("vi"):
            context = context_for_section(parent.text if parent else "")
        dialogue["context"] = context
        order = dialogue["order"]
        lesson_texts.append({
            "id": f"{lesson_id}-lesson-text-{order:02d}",
            "order": order,
            "title": section_title,
            "kind": dialogue.get("kind", "main-dialogue"),
            "context": context,
            "instruction": {"hanzi": "", "vi": "", "audioRef": dialogue.get("audioRef") or (f"{lesson_no}-{order*2-1}" if order <= 3 else None)},
            "visualDescription": "",
            "vocabularyAudioRef": f"{lesson_no}-{order*2}" if (order <= 3 or (level >= 2 and order == 4 and dialogue.get("audioRef"))) else None,
            "dialogueId": dialogue["id"],
            "vocabularyIds": list(vocab_by_section.get(section_title, [])),
            "properNounIds": [row["id"] for row in proper if row.get("sourceSection") == section_title],
            "languageNoteIds": [],
            "activityIds": [],
        })

    lesson_text_by_section = {row["title"]: row["id"] for row in lesson_texts}
    for index, dialogue in enumerate(dialogues):
        dialogue["lessonTextId"] = lesson_text_by_section.get(dialogue.get("sourceSection", ""), lesson_texts[index]["id"] if index < len(lesson_texts) else "")
    for row in vocabulary:
        row["lessonTextId"] = lesson_text_by_section.get(row.get("sourceSection", ""), "")
    for row in proper:
        row["lessonTextId"] = lesson_text_by_section.get(row.get("sourceSection", ""), "")

    passages = parse_passages(body, lesson_id, level, lesson_no, vocab_by_section)
    grammar, examples = grammar_entities(body, lesson_id)
    exercises, activities, extensions = generic_exercises(body, lesson_id)
    contents = content_sections(body, lesson_id)
    source_visual_count, source_task_count, visible_source_visual_count = apply_hsk1_source_manifests(repo, lesson_id, contents)

    objective_section = next((sec for sec in split_sections(body, 2) if normalize_title(sec.title) == "Mục tiêu"), None)
    objectives = [
        {"id": f"{lesson_id}-objective-{idx:02d}", "order": idx, "vi": clean_markdown_inline(value)}
        for idx, value in enumerate(parse_numbered_list(objective_section.text if objective_section else ""), 1)
    ]

    language_notes: list[dict[str, Any]] = []
    for h2 in split_sections(body, 2):
        for h3 in sub_sections(h2.text, 3):
            title = normalize_title(h3.title)
            if "gợi ý" not in title.lower() and "lưu ý" not in title.lower():
                continue
            order = len(language_notes) + 1
            rows = plain_lines(h3.text)
            language_notes.append({"id": f"{lesson_id}-language-note-{order:02d}", "order": order, "title": title, "hanzi": first_bold(h3.text), "vi": " ".join(rows), "markdown": h3.text.strip()})

    entities = {
        "objectives": objectives,
        "lessonTexts": lesson_texts,
        "vocabulary": vocabulary,
        "properNouns": proper,
        "dialogues": dialogues,
        "languageNotes": language_notes,
        "grammar": grammar,
        "examplesPractice": examples,
        "exercises": exercises,
        "activities": activities,
        "passages": passages,
        "extensions": extensions,
        "contentSections": contents,
        "radicalSortExercises": [],
        "oddOneOutExercises": [],
        "characters": [],
        "characterBuildExercises": [],
    }
    lesson = {
        "schemaVersion": SCHEMA_VERSION,
        "id": lesson_id,
        "courseId": "new-hsk-course",
        "level": level,
        "lessonNumber": lesson_no,
        "title": {"hanzi": front.get("title_zh", ""), "pinyin": front.get("title_pinyin", ""), "vi": front.get("title_vi", "")},
        "source": {
            "book": front.get("book", ""),
            "pdfPages": front.get("source_pdf_pages", ""),
            "bookPages": front.get("source_book_pages", ""),
            "verificationStatus": front.get("verification_status", ""),
            "markdown": markdown_path.name,
            "dialogueData": dialogue_path.name,
            "pageTrace": parse_trace_flexible(body),
        },
        "stats": {
            "objectives": len(objectives), "lessonTexts": len(lesson_texts), "vocabulary": len(vocabulary), "properNouns": len(proper),
            "dialogues": len(dialogues), "dialogueTurns": sum(len(row["turns"]) for row in dialogues), "languageNotes": len(language_notes),
            "grammar": len(grammar), "examplesPractice": len(examples), "exercises": len(exercises), "activities": len(activities),
            "passages": len(passages), "extensions": len(extensions), "contentSections": len(contents),
            "sourceVisuals": source_visual_count, "visibleSourceVisuals": visible_source_visual_count, "sourceTasks": source_task_count,
        },
        "entities": entities,
        "views": {
            "bookFlow": [row["id"] for row in contents],
            "groupedIndex": {
                "vocabulary": [row["id"] for row in vocabulary],
                "properNouns": [row["id"] for row in proper],
                "dialogues": [row["id"] for row in dialogues],
                "languageNotes": [row["id"] for row in language_notes],
                "grammar": [row["id"] for row in grammar],
                "examplesPractice": [row["id"] for row in examples],
                "passages": [row["id"] for row in passages],
                "exercisesActivities": [row["id"] for row in exercises] + [row["id"] for row in activities],
                "extensions": [row["id"] for row in extensions],
            },
        },
    }
    characters, radical_exercises, build_exercises, character_plan = build_character_data(repo, lesson, char_index, char_sources)
    entities["characters"] = characters
    entities["radicalSortExercises"] = radical_exercises
    entities["characterBuildExercises"] = build_exercises
    lesson["stats"].update({"characters": len(characters), "radicalSortItems": sum(len(row.get("items", [])) for row in radical_exercises), "characterBuildExercises": len(build_exercises)})
    lesson["practicePlan"] = generate_practice_plan(lesson, character_plan)
    if preserve_practice:
        # Keep manually curated Bài 1 practice while retaining full content sections.
        for key in ["exercises", "radicalSortExercises", "oddOneOutExercises", "characters", "characterBuildExercises"]:
            if preserve_practice.get("entities", {}).get(key):
                lesson["entities"][key] = preserve_practice["entities"][key]
        if preserve_practice.get("practicePlan"):
            lesson["practicePlan"] = preserve_practice["practicePlan"]
        for key, value in preserve_practice.get("stats", {}).items():
            if key in {"practiceExercises", "radicalSortGroups", "radicalSortItems", "radicalSortRounds", "characters", "coreCharacters", "characterBuildExercises"}:
                lesson["stats"][key] = value
    return lesson


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, required=True)
    args = parser.parse_args()
    repo = args.repo.resolve()
    char_index, char_sources = load_character_sources(repo)
    existing_lesson1_path = repo / "modules/new-hsk-course/data/hsk1/lesson-01.json"
    existing_lesson1 = json.loads(existing_lesson1_path.read_text(encoding="utf-8")) if existing_lesson1_path.exists() else None

    lessons: list[dict[str, Any]] = []
    errors: list[str] = []
    for level, count in ((1, 15), (2, 15), (3, 18)):
        source_root = repo / f"modules/new-hsk-course/source/hsk{level}"
        out_root = repo / f"modules/new-hsk-course/data/hsk{level}"
        out_root.mkdir(parents=True, exist_ok=True)
        for lesson_no in range(1, count + 1):
            md = source_root / f"HSK{level}_Bai_{lesson_no:02d}.md"
            dialogue = source_root / "dialogues" / f"HSK{level}_Bai_{lesson_no:02d}_dialogues.json"
            try:
                data = build_lesson(repo, md, dialogue, char_index, char_sources, existing_lesson1 if (level, lesson_no) == (1, 1) else None)
                output = out_root / f"lesson-{lesson_no:02d}.json"
                output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                lessons.append({
                    "id": data["id"], "level": level, "lessonNumber": lesson_no, "title": data["title"],
                    "path": f"hsk{level}/lesson-{lesson_no:02d}.json", "status": "app-ready",
                })
                print(f"BUILT HSK {level} Bài {lesson_no:02d}: vocab={data['stats']['vocabulary']} turns={data['stats']['dialogueTurns']} grammar={data['stats']['grammar']} chars={data['stats']['characters']}")
            except Exception as exc:
                errors.append(f"HSK {level} Bài {lesson_no:02d}: {exc}")
                print(f"ERROR HSK {level} Bài {lesson_no:02d}: {exc}", file=sys.stderr)
    manifest = {
        "schemaVersion": "new-hsk-course.manifest.v1",
        "course": {
            "id": "new-hsk-course", "title": "New 3.0",
            "levels": [
                {"level": 1, "lessonCount": 15, "readyLessons": sum(1 for row in lessons if row["level"] == 1)},
                {"level": 2, "lessonCount": 15, "readyLessons": sum(1 for row in lessons if row["level"] == 2)},
                {"level": 3, "lessonCount": 18, "readyLessons": sum(1 for row in lessons if row["level"] == 3)},
            ],
        },
        "lessons": lessons,
    }
    manifest_path = repo / "modules/new-hsk-course/data/manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report = {"built": len(lessons), "errors": errors, "levels": manifest["course"]["levels"]}
    (repo / "modules/new-hsk-course/data/build-all-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if errors:
        print(json.dumps(report, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

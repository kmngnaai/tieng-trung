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
from improve_ordering_tokens import apply_ordering_tokens  # noqa: E402

REVIEWED_ORDERING_LEVELS = {1, 3}

CJK_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
AUDIO_RE = re.compile(r"(?:Audio(?: từ mới)?|Mã audio|Audio gốc)\s*:\s*`([^`]+)`", re.I)

LEARNER_EXPOSURE_KINDS = {"warmup", "lesson-text", "passage", "grammar", "exercise", "activity"}
OFFICIAL_VOCAB_PATH = Path("modules/new-hsk-course/source/official-vocabulary.json")
FIRST_OCCURRENCE_PATH = Path("modules/new-hsk-course/data/first-occurrence.json")
WORD_DICTIONARY_SHARDS = Path("modules/hanzi-stroke/data/words/by_first_char")

# Only used when the local word dictionary has no exact phrase entry. These are
# source-backed warm-up phrases, not 生词, and remain explicitly classified as
# supplemental vocabulary.
SUPPLEMENTAL_MEANING_OVERRIDES = {
    "七": "bảy",
    "零": "số không",
    "前边儿": "phía trước",
    "玩儿": "chơi / vui chơi",
    "画画": "vẽ tranh",
    "过生日": "đón / tổ chức sinh nhật",
    "很舒服": "rất thoải mái",
    "打开礼物": "mở quà",
    "发邮件": "gửi email",
    "包饺子": "gói bánh chẻo / sủi cảo",
    "给红包": "tặng / đưa lì xì",
    "吃年夜饭": "ăn cơm tất niên",
    "打扫房子": "dọn dẹp nhà cửa",
    "看春节联欢晚会": "xem chương trình Gala Tết",
}

WARMUP_TERM_RE = re.compile(
    r"\*\*(?:[A-Z]\.\s*)?"
    r"(?P<hanzi>[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff“”《》]+)"
    r"\s+(?P<pinyin>[A-Za-zÀ-žāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüÜ’'\-\s]+?)\*\*"
)

GENERIC_ACTIVITY_CONFIG = {
    "flashcards": {"label": "🎓 Flashcard", "supportedSources": ["vocabulary", "supplementalVocabulary", "properNouns", "sentences", "dialogues", "passages", "grammar"], "defaultSources": ["vocabulary", "supplementalVocabulary", "properNouns", "sentences", "dialogues", "passages", "grammar"]},
    "listening": {"label": "Nghe", "supportedSources": ["vocabulary", "supplementalVocabulary", "properNouns", "sentences", "dialogues", "passages", "grammar"], "defaultSources": ["sentences", "dialogues", "passages"]},
    "fill": {"label": "Điền từ", "supportedSources": ["vocabulary", "supplementalVocabulary", "properNouns", "sentences", "dialogues", "passages", "grammar"], "defaultSources": ["vocabulary", "supplementalVocabulary", "sentences", "grammar"]},
    "matching": {"label": "Nối", "supportedSources": ["vocabulary", "supplementalVocabulary", "properNouns", "sentences", "dialogues", "passages", "grammar"], "defaultSources": ["vocabulary", "supplementalVocabulary", "sentences"]},
    "ordering": {"label": "Sắp xếp câu", "supportedSources": ["sentences", "dialogues", "passages", "grammar"], "defaultSources": ["sentences", "dialogues"]},
    "typing": {"label": "Gõ câu / đoạn", "supportedSources": ["sentences", "dialogues", "passages", "grammar"], "defaultSources": ["sentences", "dialogues", "passages"]},
    "translateZhVi": {"label": "Dịch Trung → Việt", "supportedSources": ["sentences", "dialogues", "passages", "grammar"], "defaultSources": ["sentences", "dialogues"]},
    "translateViZh": {"label": "Dịch Việt → Trung", "supportedSources": ["sentences", "dialogues", "passages", "grammar"], "defaultSources": ["sentences", "dialogues"]},
    "roleplay": {"label": "Hội thoại", "supportedSources": ["dialogues"], "defaultSources": ["dialogues"]},
    "characters": {"label": "Cấu tạo & Bộ thủ", "supportedSources": ["vocabulary", "properNouns", "passages"], "defaultSources": ["vocabulary", "passages"]},
}


def normalize_title(title: str) -> str:
    return strip_numbered_title(title).strip()


def preserve_json_order(current: Any, previous: Any) -> Any:
    """Preserve stable key ordering from an existing generated JSON file.

    Values still come entirely from the fresh build. This only prevents
    no-op rebuilds from rewriting files because historical post-processors
    inserted equivalent keys in a different order.
    """
    if isinstance(current, dict) and isinstance(previous, dict):
        ordered: dict[str, Any] = {}
        for key in previous:
            if key in current:
                ordered[key] = preserve_json_order(current[key], previous[key])
        for key, value in current.items():
            if key not in ordered:
                ordered[key] = value
        return ordered
    if isinstance(current, list) and isinstance(previous, list):
        return [
            preserve_json_order(value, previous[index]) if index < len(previous) else value
            for index, value in enumerate(current)
        ]
    return current


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


def _dictionary_word(repo: Path, hanzi: str) -> dict[str, Any] | None:
    if not hanzi:
        return None
    shard = repo / WORD_DICTIONARY_SHARDS / f"{ord(hanzi[0]):04X}.json"
    if not shard.exists():
        return None
    try:
        payload = json.loads(shard.read_text(encoding="utf-8"))
    except Exception:
        return None
    rows = payload.get(hanzi, []) if isinstance(payload, dict) else []
    if not isinstance(rows, list) or not rows:
        return None
    return rows[0] if isinstance(rows[0], dict) else None


def _official_level_terms(repo: Path, level: int) -> set[str]:
    try:
        payload = json.loads((repo / OFFICIAL_VOCAB_PATH).read_text(encoding="utf-8"))
    except Exception:
        return set()
    return {str(row.get("hanzi", "")).strip() for row in payload.get("levels", {}).get(str(level), []) if str(row.get("hanzi", "")).strip()}


def extract_supplemental_vocabulary(
    repo: Path, lesson_id: str, level: int, contents: list[dict[str, Any]],
    vocabulary: list[dict[str, Any]], proper: list[dict[str, Any]],
    prior_learned_terms: set[str] | None = None,
) -> list[dict[str, Any]]:
    """Extract explicit first-exposure words/phrases without changing 生词.

    We intentionally do not segment arbitrary Chinese prose. A candidate must be
    explicitly source-labelled as bold Hanzi + pinyin in a learner-facing section.
    The course is processed HSK1 -> HSK2 -> HSK3, so terms already learned in an
    earlier lesson are not re-labelled as "từ bổ sung" in later lessons.

    Grammar *patterns* remain in the grammar source group. A lexical item that is
    explicitly introduced inside a grammar explanation (for example 零 líng) may
    still be a supplemental flashcard because it is a real first-exposure term.
    """
    blocked = {row.get("hanzi", "") for row in [*vocabulary, *proper]}
    blocked.update(prior_learned_terms or set())
    official_terms = _official_level_terms(repo, level)
    seen: set[str] = set()
    result: list[dict[str, Any]] = []
    for section in sorted(contents, key=lambda row: (row.get("order", 0), row.get("id", ""))):
        source_kind = str(section.get("kind", ""))
        if source_kind not in LEARNER_EXPOSURE_KINDS:
            continue
        markdown = str(section.get("markdown", ""))
        for match in WARMUP_TERM_RE.finditer(markdown):
            hanzi = match.group("hanzi").strip().strip("“”")
            pinyin = re.sub(r"\s+", " ", match.group("pinyin").strip())
            if not hanzi or hanzi in blocked or hanzi in seen:
                continue
            seen.add(hanzi)
            dictionary = _dictionary_word(repo, hanzi) or {}
            dictionary_vi = str(dictionary.get("vi", "")).strip()
            vi = SUPPLEMENTAL_MEANING_OVERRIDES.get(hanzi, "") or (dictionary_vi.split(" / ")[0].strip() if dictionary_vi else "")
            order = len(result) + 1
            result.append({
                "id": f"{lesson_id}-supplemental-{order:03d}",
                "order": order,
                "hanzi": hanzi,
                "pinyin": pinyin or str(dictionary.get("p", "")).replace("\u200b", " ").strip(),
                "hanViet": str(dictionary.get("sv", "")).strip(),
                "wordClass": "từ/cụm bổ sung",
                "vi": vi,
                "classification": "supplemental-vocabulary",
                "sourceKind": source_kind,
                "sourceSection": section.get("title", "Nội dung bài"),
                "sourceContentSectionId": section.get("id", ""),
                "officialLevelVocabulary": hanzi in official_terms,
                "isLessonNewWord": False,
                "flashcardEligible": True,
                "note": "Xuất hiện lần đầu trong nội dung học; không thuộc 生词 chính thức của bài.",
            })
    return result


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
                        "vi": str(row.get("Nghĩa tiếng Việt", row.get("Nghĩa", row.get("Tiếng Việt", "")))).strip(),
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
                        "vi": str(row.get("Nghĩa tiếng Việt", row.get("Nghĩa", row.get("Tiếng Việt", "")))).strip(),
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


def apply_source_manifests(repo: Path, lesson_id: str, sections: list[dict[str, Any]]) -> tuple[int, int, int, bool]:
    """Merge source trace, activity keys and presentation metadata after Markdown parsing.

    Full-page PDF captures stay in JSON for auditability but are marked
    ``displayInLesson: false``. Only clean PPT assets or explicit ``pdf-crop``
    assets are eligible for the learner-facing lesson UI.
    """
    match = re.match(r"^nhsk-(\d+)-", lesson_id)
    if not match:
        return 0, 0, 0, False
    level = int(match.group(1))
    base = repo / f"modules/new-hsk-course/source/hsk{level}"
    visual_path = base / "visual-manifest.json"
    task_path = base / "source-task-manifest.json"
    display_path = base / "display-manifest.json"
    has_source_manifests = visual_path.exists() or task_path.exists() or display_path.exists()
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
    return visual_count, task_count, visible_visual_count, has_source_manifests


def load_character_sources(repo: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    source_path = repo / "modules/hanzi-stroke/data/learning/character-learning-source.json"
    payload = json.loads(source_path.read_text(encoding="utf-8"))
    index = payload.get("items", {}) if isinstance(payload, dict) else {}
    if not isinstance(index, dict):
        raise ValueError("character-learning-source.json has invalid items map")
    radical_catalog = json.loads((repo / "modules/hanzi-stroke/data/learning/radicals/radical_catalog.json").read_text(encoding="utf-8"))
    radical_by_id = {str(item.get("id")): item for item in (radical_catalog.get("items") or radical_catalog if isinstance(radical_catalog, list) else [])}
    return index, {
        "radicals": radical_by_id,
        "sourcePath": source_path,
        "fallbackCharsDir": repo / "modules/hanzi-stroke/data/chars",
    }


def load_fallback_character(char_sources: dict[str, Any], glyph: str) -> dict[str, Any]:
    """Load the compact per-character record when enriched learning data is absent.

    This fallback is intentionally conservative: it provides pronunciation, meaning and
    stroke count when available, but does not promote unverified radical/component data.
    """
    chars_dir = char_sources.get("fallbackCharsDir")
    if not isinstance(chars_dir, Path):
        return {}
    path = chars_dir / f"{ord(glyph):04X}.json"
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}

def position_vi(value: str) -> str:
    mapping = {"left": "bên trái", "right": "bên phải", "top": "phía trên", "bottom": "phía dưới", "inside": "bên trong", "outside": "bên ngoài"}
    return mapping.get(str(value or "").lower(), str(value or ""))


def role_vi(value: str) -> str:
    return {"semantic": "gợi nghĩa", "phonetic": "gợi âm", "semantic-phonetic": "gợi nghĩa và âm", "structural": "cấu tạo", "uncertain": "chưa xác định"}.get(value, "cấu tạo")


def build_character_data(repo: Path, lesson: dict[str, Any], index: dict[str, Any], char_sources: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    lesson_id = lesson["id"]
    entities = lesson["entities"]
    vocabulary_rows = list(entities.get("vocabulary", []))
    proper_rows = list(entities.get("properNouns", []))
    source_rows = [*vocabulary_rows, *proper_rows]

    # Keep source categories separate. A character can be a lesson vocabulary character,
    # a proper-name character, and/or a character merely encountered elsewhere.
    glyph_refs: dict[str, dict[str, list[str]]] = defaultdict(lambda: {
        "vocabularyIds": [], "properNounIds": [], "sentenceIds": [], "contentSectionIds": []
    })
    for row in vocabulary_rows:
        for glyph in CJK_RE.findall(str(row.get("hanzi", ""))):
            if row["id"] not in glyph_refs[glyph]["vocabularyIds"]:
                glyph_refs[glyph]["vocabularyIds"].append(row["id"])
    for row in proper_rows:
        for glyph in CJK_RE.findall(str(row.get("hanzi", ""))):
            if row["id"] not in glyph_refs[glyph]["properNounIds"]:
                glyph_refs[glyph]["properNounIds"].append(row["id"])
    for dialogue in entities.get("dialogues", []):
        for turn in dialogue.get("turns", []):
            for glyph in CJK_RE.findall(str(turn.get("hanzi", ""))):
                if turn.get("id") and turn["id"] not in glyph_refs[glyph]["sentenceIds"]:
                    glyph_refs[glyph]["sentenceIds"].append(turn["id"])
    for section in entities.get("contentSections", []):
        if section.get("kind") not in LEARNER_EXPOSURE_KINDS:
            continue
        for glyph in CJK_RE.findall(str(section.get("markdown", ""))):
            if section.get("id") and section["id"] not in glyph_refs[glyph]["contentSectionIds"]:
                glyph_refs[glyph]["contentSectionIds"].append(section["id"])

    vocab_order: dict[str, int] = {}
    for row in vocabulary_rows:
        for glyph in CJK_RE.findall(str(row.get("hanzi", ""))):
            vocab_order.setdefault(glyph, int(row.get("order", 9999)))
    proper_order: dict[str, int] = {}
    for row in proper_rows:
        for glyph in CJK_RE.findall(str(row.get("hanzi", ""))):
            proper_order.setdefault(glyph, int(row.get("order", 9999)))

    characters: list[dict[str, Any]] = []
    for glyph in sorted(glyph_refs, key=lambda g: (0 if glyph_refs[g]["vocabularyIds"] else 1, vocab_order.get(g, 9999), proper_order.get(g, 9999), g)):
        detail = index.get(glyph)
        fallback = load_fallback_character(char_sources, glyph)
        enriched = isinstance(detail, dict)
        if not enriched:
            detail = {}
        if not detail and not fallback:
            # Still keep a minimal entity so encountered text never silently disappears.
            fallback = {"char": glyph}

        pronunciation = detail.get("pronunciation", {}) if isinstance(detail, dict) else {}
        meanings = detail.get("meanings", {}) if isinstance(detail, dict) else {}
        char_info = detail.get("characterInfo", {}) if isinstance(detail, dict) else {}
        quality_status = detail.get("qualityStatus") or (detail.get("quality") or {}).get("status", "") if isinstance(detail, dict) else ""
        pinyin = str(pronunciation.get("pinyin") or fallback.get("pinyin") or "").strip()
        meaning_vi = str(meanings.get("shortVi") or fallback.get("meaningVi") or "").strip()
        radical = char_info.get("radical", {}) or {}
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
            "pinyin": [pinyin] if pinyin else [],
            "meaningsVi": [meaning_vi] if meaning_vi else [],
            "studyPriority": "recognition",
            "sourceRefs": {
                "vocabularyIds": glyph_refs[glyph]["vocabularyIds"],
                "properNounIds": glyph_refs[glyph]["properNounIds"],
                "sentenceIds": glyph_refs[glyph]["sentenceIds"],
                "contentSectionIds": glyph_refs[glyph]["contentSectionIds"],
            },
            "structure": {"type": "unknown", "labelVi": str(char_info.get("formationTypeVi", "chưa phân loại")) if enriched else "chưa có dữ liệu cấu tạo đã duyệt"},
            "dictionaryRadical": {
                "glyph": str(radical.get("sideForm") or radical.get("inputForm") or radical.get("mainForm") or "") if enriched else "",
                "radicalId": str(radical.get("radicalId", "")) if enriched else "",
                "nameVi": str(radical.get("displayNameVi", "")) if enriched else "",
                "pinyin": str(radical.get("pinyin", "")) if enriched else "",
                "hanViet": str(radical.get("hanViet", "")) if enriched else "",
            },
            "components": components,
            "strokes": {"count": char_info.get("strokeCount") if enriched else fallback.get("strokeCount"), "writerChar": glyph},
            "pedagogy": {"commonErrors": [], "confusableCharacterIds": []},
            "reviewStatus": ("curated" if str(quality_status) == "PASS" else "partial") if enriched else "reference-only",
        }
        characters.append(item)

    # The deep-learning/core scope must stay inside lesson 生词. Exposure-only
    # characters are available through the separate "seen" scope and must not leak
    # into core/build/radical practice by default.
    core = [
        row for row in characters
        if row["sourceRefs"].get("vocabularyIds")
        and row["components"]
        and row["dictionaryRadical"]["radicalId"]
    ][:5]
    for row in core:
        row["studyPriority"] = "core"

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

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in characters:
        if not row["sourceRefs"].get("vocabularyIds"):
            continue
        radical_id = row["dictionaryRadical"].get("radicalId")
        if not radical_id or row["reviewStatus"] not in {"curated", "partial"}:
            continue
        grouped[radical_id].append(row)
    eligible = [(rid, rows) for rid, rows in grouped.items() if rows]
    eligible.sort(key=lambda pair: (-len(pair[1]), pair[0]))
    groups: list[dict[str, Any]] = []
    items: list[dict[str, Any]] = []
    rounds: list[dict[str, Any]] = []
    selected = eligible[:12]
    for rid, rows in selected:
        sample = rows[0]["dictionaryRadical"]
        gid = f"{lesson_id}-radical-group-{rid}"
        groups.append({
            "id": gid, "radicalId": rid, "glyph": sample.get("glyph", ""), "mainForm": sample.get("glyph", ""),
            "nameVi": sample.get("nameVi", ""), "pinyin": sample.get("pinyin", ""), "hanViet": sample.get("hanViet", ""),
        })
        for row in rows[:3]:
            items.append({
                "id": f"{lesson_id}-radical-item-{len(items)+1:03d}", "hanzi": row["hanzi"], "groupId": gid,
                "sourceIds": row["sourceRefs"]["vocabularyIds"],
            })
    for round_index in range(0, len(groups), 4):
        round_groups = groups[round_index:round_index+4]
        group_ids = {row["id"] for row in round_groups}
        round_items = [row for row in items if row["groupId"] in group_ids]
        if len(round_groups) < 2 or len(round_items) < 4:
            continue
        rounds.append({
            "id": f"{lesson_id}-radical-round-{len(rounds)+1:02d}", "order": len(rounds) + 1,
            "groupIds": [row["id"] for row in round_groups], "itemIds": [row["id"] for row in round_items],
        })
    radical_exercises = []
    if rounds:
        used_group_ids = {gid for rnd in rounds for gid in rnd["groupIds"]}
        used_item_ids = {iid for rnd in rounds for iid in rnd["itemIds"]}
        radical_exercises.append({
            "id": f"{lesson_id}-radical-sort-001", "order": 1, "type": "radical-sort", "scope": "lesson",
            "title": "Xếp chữ vào đúng bộ thủ", "instruction": "Chọn chữ rồi chọn bộ thủ, hoặc chọn bộ thủ rồi chọn nhiều chữ.",
            "verificationStatus": "derived-from-reviewed-character-enrichment",
            "groups": [row for row in groups if row["id"] in used_group_ids],
            "items": [row for row in items if row["id"] in used_item_ids], "rounds": rounds,
        })

    char_by_glyph = {row["hanzi"]: row["id"] for row in characters}
    official_glyphs: list[str] = []
    for row in vocabulary_rows:
        for glyph in CJK_RE.findall(str(row.get("hanzi", ""))):
            if glyph not in official_glyphs:
                official_glyphs.append(glyph)
    exposure_glyphs: list[str] = []
    for row in characters:
        if row["hanzi"] in official_glyphs:
            continue
        if row["sourceRefs"].get("contentSectionIds") or row["sourceRefs"].get("sentenceIds") or row["sourceRefs"].get("properNounIds"):
            exposure_glyphs.append(row["hanzi"])

    lesson_new_word_ids = [char_by_glyph[g] for g in official_glyphs if g in char_by_glyph]
    character_plan = {
        "coreCharacterIds": [row["id"] for row in core],
        # officialCharacterIds is retained as the runtime/UI compatibility name.
        # Semantically these are characters in this lesson's source-backed 生词 list.
        "officialCharacterIds": lesson_new_word_ids,
        "lessonNewWordCharacterIds": lesson_new_word_ids,
        "exposureCharacterIds": [char_by_glyph[g] for g in exposure_glyphs if g in char_by_glyph],
        "recognitionCharacterIds": [row["id"] for row in characters if row not in core],
    }
    return characters, radical_exercises, build_exercises, character_plan

def generate_practice_plan(lesson: dict[str, Any], character_plan: dict[str, Any]) -> dict[str, Any]:
    entities = lesson["entities"]
    sentence_ids = [turn["id"] for dialogue in entities.get("dialogues", []) for turn in dialogue.get("turns", [])]
    grammar_ids = [row["id"] for row in entities.get("grammar", [])] or [row["id"] for row in entities.get("languageNotes", [])]
    source_groups = {
        "vocabulary": {"label": "Từ mới chính thức", "entityType": "vocabulary", "ids": [row["id"] for row in entities.get("vocabulary", [])]},
        "supplementalVocabulary": {"label": "Từ bổ sung đã gặp", "entityType": "supplementalVocabulary", "ids": [row["id"] for row in entities.get("supplementalVocabulary", [])]},
        "properNouns": {"label": "Tên riêng", "entityType": "properNouns", "ids": [row["id"] for row in entities.get("properNouns", [])]},
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


def build_lesson(
    repo: Path, markdown_path: Path, dialogue_path: Path,
    char_index: dict[str, Any], char_sources: dict[str, Any],
    preserve_practice: dict[str, Any] | None = None,
    prior_learned_terms: set[str] | None = None,
) -> dict[str, Any]:
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
    supplemental_vocabulary = extract_supplemental_vocabulary(
        repo, lesson_id, level, contents, vocabulary, proper, prior_learned_terms
    )
    source_visual_count, source_task_count, visible_source_visual_count, has_source_manifests = apply_source_manifests(repo, lesson_id, contents)

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
        "supplementalVocabulary": supplemental_vocabulary,
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
            "objectives": len(objectives), "lessonTexts": len(lesson_texts), "vocabulary": len(vocabulary), "supplementalVocabulary": len(supplemental_vocabulary), "properNouns": len(proper),
            "dialogues": len(dialogues), "dialogueTurns": sum(len(row["turns"]) for row in dialogues), "languageNotes": len(language_notes),
            "grammar": len(grammar), "examplesPractice": len(examples), "exercises": len(exercises), "activities": len(activities),
            "passages": len(passages), "extensions": len(extensions), "contentSections": len(contents),
        },
        "entities": entities,
        "views": {
            "bookFlow": [row["id"] for row in contents],
            "groupedIndex": {
                "vocabulary": [row["id"] for row in vocabulary],
                "supplementalVocabulary": [row["id"] for row in supplemental_vocabulary],
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
    if has_source_manifests:
        lesson["stats"].update({
            "sourceVisuals": source_visual_count,
            "visibleSourceVisuals": visible_source_visual_count,
            "sourceTasks": source_task_count,
        })
    characters, radical_exercises, build_exercises, character_plan = build_character_data(repo, lesson, char_index, char_sources)
    entities["characters"] = characters
    entities["radicalSortExercises"] = radical_exercises
    entities["characterBuildExercises"] = build_exercises
    lesson["stats"].update({"characters": len(characters), "radicalSortItems": sum(len(row.get("items", [])) for row in radical_exercises), "characterBuildExercises": len(build_exercises)})
    lesson["practicePlan"] = generate_practice_plan(lesson, character_plan)
    if preserve_practice:
        # Preserve HSK1 Bài 1's hand-curated exercise rounds to avoid changing an
        # already-reviewed learning activity. The shared character inventory and the
        # all/core/seen scope plan above remain freshly generated; preserving these
        # exercises never changes vocabulary[] or the official-character scope.
        for key in ["exercises", "radicalSortExercises", "oddOneOutExercises", "characterBuildExercises"]:
            if preserve_practice.get("entities", {}).get(key):
                lesson["entities"][key] = preserve_practice["entities"][key]
        previous_plan = preserve_practice.get("practicePlan") or {}
        if previous_plan.get("curatedExerciseIds"):
            lesson["practicePlan"]["curatedExerciseIds"] = previous_plan["curatedExerciseIds"]
        for key, value in preserve_practice.get("stats", {}).items():
            if key in {"practiceExercises", "radicalSortGroups", "radicalSortItems", "radicalSortRounds", "characterBuildExercises"}:
                lesson["stats"][key] = value
    return lesson


def load_official_vocabulary(repo: Path) -> dict[str, Any]:
    path = repo / OFFICIAL_VOCAB_PATH
    if not path.exists():
        raise BuildError(f"Missing official vocabulary cross-check source: {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    levels = payload.get("levels", {}) if isinstance(payload, dict) else {}
    expected = {"1": 300, "2": 200, "3": 500}
    for level, count in expected.items():
        rows = levels.get(level, [])
        if len(rows) != count:
            raise BuildError(f"Official vocabulary level {level} expected {count} rows, got {len(rows)}")
    return payload


def source_kind_for_term(lesson: dict[str, Any], term: str) -> tuple[str, str]:
    """Return the earliest learner-facing occurrence, independent of later 生词 status."""
    for section in sorted(lesson.get("entities", {}).get("contentSections", []), key=lambda x: (x.get("order", 0), x.get("id", ""))):
        if section.get("kind") not in LEARNER_EXPOSURE_KINDS:
            continue
        if term and term in str(section.get("markdown", "")):
            return str(section.get("kind", "content")), str(section.get("id", ""))
    # Fallback for a source item that is represented as an entity but not repeated in
    # learner-facing markdown (for example a sparse lexical source export).
    for row in lesson.get("entities", {}).get("vocabulary", []):
        if row.get("hanzi") == term:
            return "vocabulary", row.get("id", "")
    for row in lesson.get("entities", {}).get("supplementalVocabulary", []):
        if row.get("hanzi") == term:
            return str(row.get("sourceKind", "supplemental-vocabulary")), row.get("sourceContentSectionId", row.get("id", ""))
    for row in lesson.get("entities", {}).get("properNouns", []):
        if row.get("hanzi") == term:
            return "proper-noun", row.get("id", "")
    return "", ""


def grammar_target_terms(lesson: dict[str, Any]) -> set[str]:
    terms: set[str] = set()
    for row in lesson.get("entities", {}).get("grammar", []):
        title = str(row.get("title", ""))
        structure = str(row.get("structure", ""))
        for value in (title, structure):
            for token in re.findall(r"[\u3400-\u9fff]+(?:[……A-Z0-9＋+／/、，,\-]*[\u3400-\u9fff]+)*", value):
                if token:
                    terms.add(token)
        for quoted in re.findall(r"[“\"`']([^”\"`']*[\u3400-\u9fff][^”\"`']*)[”\"`']", title):
            value = re.sub(r"\s+", "", quoted)
            if value:
                terms.add(value)
    return terms


def build_first_occurrence_index(repo: Path, lesson_paths: list[Path]) -> dict[str, Any]:
    official = load_official_vocabulary(repo)
    lessons = [json.loads(path.read_text(encoding="utf-8")) for path in lesson_paths]
    lessons.sort(key=lambda d: (int(d.get("level", 0)), int(d.get("lessonNumber", 0))))

    official_levels_by_term: dict[str, list[int]] = defaultdict(list)
    official_order_by_term: dict[str, dict[str, int]] = defaultdict(dict)
    for level_text, rows in official["levels"].items():
        level = int(level_text)
        for row in rows:
            term = str(row.get("hanzi", "")).strip()
            if not term:
                continue
            official_levels_by_term[term].append(level)
            official_order_by_term[term][level_text] = int(row.get("order", 0) or 0)

    lesson_newword_refs: dict[str, list[dict[str, Any]]] = defaultdict(list)
    supplemental_refs: dict[str, list[dict[str, Any]]] = defaultdict(list)
    proper_refs: dict[str, list[dict[str, Any]]] = defaultdict(list)
    grammar_refs: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for lesson in lessons:
        base = {"level": int(lesson["level"]), "lesson": int(lesson["lessonNumber"])}
        for row in lesson.get("entities", {}).get("vocabulary", []):
            term = str(row.get("hanzi", "")).strip()
            if term:
                lesson_newword_refs[term].append({**base, "entityId": row.get("id", "")})
        for row in lesson.get("entities", {}).get("supplementalVocabulary", []):
            term = str(row.get("hanzi", "")).strip()
            if term:
                supplemental_refs[term].append({**base, "entityId": row.get("id", ""), "sourceKind": row.get("sourceKind", "")})
        for row in lesson.get("entities", {}).get("properNouns", []):
            term = str(row.get("hanzi", "")).strip()
            if term:
                proper_refs[term].append({**base, "entityId": row.get("id", "")})
        for term in grammar_target_terms(lesson):
            grammar_refs[term].append(base)

    known_terms = set(official_levels_by_term) | set(lesson_newword_refs) | set(supplemental_refs) | set(proper_refs) | set(grammar_refs)
    term_rows: list[dict[str, Any]] = []
    for term in sorted(known_terms):
        first_seen = None
        for lesson in lessons:
            kind, source_id = source_kind_for_term(lesson, term)
            if kind:
                first_seen = {
                    "level": int(lesson["level"]), "lesson": int(lesson["lessonNumber"]),
                    "sourceKind": kind, "sourceId": source_id,
                }
                break
        newword = lesson_newword_refs.get(term, [])
        supplemental = supplemental_refs.get(term, [])
        proper = proper_refs.get(term, [])
        grammar = grammar_refs.get(term, [])
        levels = sorted(set(official_levels_by_term.get(term, [])))
        term_rows.append({
            "hanzi": term,
            "firstSeenLevel": first_seen.get("level") if first_seen else None,
            "firstSeenLesson": first_seen.get("lesson") if first_seen else None,
            "firstSeenSourceKind": first_seen.get("sourceKind", "") if first_seen else "",
            "firstSeenSourceId": first_seen.get("sourceId", "") if first_seen else "",
            "isOfficialLevelVocabulary": bool(levels),
            "officialLevels": levels,
            "officialOrders": official_order_by_term.get(term, {}),
            "isLessonNewWord": bool(newword),
            "lessonNewWordRefs": newword,
            "isSupplementalVocabulary": bool(supplemental),
            "supplementalRefs": supplemental,
            "isGrammarTarget": bool(grammar),
            "grammarRefs": grammar,
            "isProperNoun": bool(proper),
            "properNounRefs": proper,
            "isExposureOnly": bool(first_seen) and not bool(newword) and not bool(proper) and not bool(grammar),
        })

    official_chars: dict[str, set[int]] = defaultdict(set)
    for term, levels in official_levels_by_term.items():
        for glyph in CJK_RE.findall(term):
            official_chars[glyph].update(levels)
    lesson_vocab_chars: set[str] = set()
    for term in lesson_newword_refs:
        lesson_vocab_chars.update(CJK_RE.findall(term))
    proper_chars: set[str] = set()
    proper_char_refs: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for term, refs in proper_refs.items():
        for glyph in CJK_RE.findall(term):
            proper_chars.add(glyph)
            proper_char_refs[glyph].extend(refs)
    grammar_chars: set[str] = set()
    grammar_char_refs: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for term, refs in grammar_refs.items():
        for glyph in CJK_RE.findall(term):
            grammar_chars.add(glyph)
            grammar_char_refs[glyph].extend(refs)

    first_char_seen: dict[str, dict[str, Any]] = {}
    for lesson in lessons:
        ordered_sources: list[tuple[str, str, str]] = []
        title_hanzi = str((lesson.get("title") or {}).get("hanzi", ""))
        if title_hanzi:
            ordered_sources.append(("title", lesson.get("id", ""), title_hanzi))
        for section in sorted(lesson.get("entities", {}).get("contentSections", []), key=lambda x: (x.get("order", 0), x.get("id", ""))):
            if section.get("kind") in LEARNER_EXPOSURE_KINDS:
                ordered_sources.append((str(section.get("kind")), str(section.get("id", "")), str(section.get("markdown", ""))))
        for kind, source_id, text in ordered_sources:
            for glyph in CJK_RE.findall(text):
                if glyph not in first_char_seen:
                    first_char_seen[glyph] = {
                        "level": int(lesson["level"]), "lesson": int(lesson["lessonNumber"]),
                        "sourceKind": kind, "sourceId": source_id,
                    }

    char_rows = []
    for glyph, seen in sorted(first_char_seen.items(), key=lambda pair: (pair[1]["level"], pair[1]["lesson"], pair[0])):
        char_rows.append({
            "hanzi": glyph,
            "firstSeenLevel": seen["level"], "firstSeenLesson": seen["lesson"],
            "firstSeenSourceKind": seen["sourceKind"], "firstSeenSourceId": seen["sourceId"],
            "isInReferenceOfficialVocabulary": glyph in official_chars,
            "officialLevels": sorted(official_chars.get(glyph, set())),
            "isInLessonNewWords": glyph in lesson_vocab_chars,
            "isInGrammarTarget": glyph in grammar_chars,
            "grammarRefs": grammar_char_refs.get(glyph, []),
            "isInProperNoun": glyph in proper_chars,
            "properNounRefs": proper_char_refs.get(glyph, []),
            "isExposureOnly": glyph not in lesson_vocab_chars and glyph not in grammar_chars and glyph not in proper_chars,
        })

    payload = {
        "version": 1,
        "course": "new-hsk-course",
        "policy": {
            "lessonOrder": "HSK1 1-15 -> HSK2 1-15 -> HSK3 1-18",
            "officialVocabularyReference": str(OFFICIAL_VOCAB_PATH).replace("\\", "/"),
            "lessonPptMarkdownRemainsAuthoritativeForLessonOrder": True,
            "exposureOnlyDoesNotChangeShengci": True,
        },
        "stats": {
            "officialReferenceTerms": sum(len(rows) for rows in official["levels"].values()),
            "knownTerms": len(term_rows),
            "charactersSeen": len(char_rows),
            "lessonNewWordCharacters": len(lesson_vocab_chars),
            "referenceOfficialCharacters": len(official_chars),
        },
        "terms": term_rows,
        "characters": char_rows,
    }
    out = repo / FIRST_OCCURRENCE_PATH
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return payload

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
    # Exact lexical terms already taught/encountered in prior lessons.  This is
    # deliberately term-level (not substring-level): a new phrase such as
    # 打扫房子 can still be learned even if 打扫 was taught earlier.
    prior_learned_terms: set[str] = set()
    for level, count in ((1, 15), (2, 15), (3, 18)):
        source_root = repo / f"modules/new-hsk-course/source/hsk{level}"
        out_root = repo / f"modules/new-hsk-course/data/hsk{level}"
        out_root.mkdir(parents=True, exist_ok=True)
        for lesson_no in range(1, count + 1):
            md = source_root / f"HSK{level}_Bai_{lesson_no:02d}.md"
            dialogue = source_root / "dialogues" / f"HSK{level}_Bai_{lesson_no:02d}_dialogues.json"
            try:
                data = build_lesson(
                    repo, md, dialogue, char_index, char_sources,
                    existing_lesson1 if (level, lesson_no) == (1, 1) else None,
                    prior_learned_terms,
                )
                output = out_root / f"lesson-{lesson_no:02d}.json"
                previous_output = json.loads(output.read_text(encoding="utf-8")) if output.exists() else None
                if isinstance(previous_output, dict):
                    data = preserve_json_order(data, previous_output)
                output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                prior_learned_terms.update(
                    str(row.get("hanzi", "")).strip()
                    for entity_key in ("vocabulary", "properNouns", "supplementalVocabulary")
                    for row in data.get("entities", {}).get(entity_key, [])
                    if str(row.get("hanzi", "")).strip()
                )
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
    lesson_paths = [repo / "modules/new-hsk-course/data" / row["path"] for row in lessons]
    token_changes, token_turns, token_lexicon_size = apply_ordering_tokens(
        repo, lesson_paths, reviewed_levels=REVIEWED_ORDERING_LEVELS
    )
    print(
        f"ORDERING TOKENS: updated={token_changes} reviewedTurns={token_turns} "
        f"levels={sorted(REVIEWED_ORDERING_LEVELS)} lexicon={token_lexicon_size}"
    )
    first_occurrence = build_first_occurrence_index(repo, lesson_paths) if not errors else {}
    if first_occurrence:
        print(
            "FIRST OCCURRENCE: "
            f"terms={first_occurrence['stats']['knownTerms']} "
            f"chars={first_occurrence['stats']['charactersSeen']} "
            f"lessonNewWordChars={first_occurrence['stats']['lessonNewWordCharacters']}"
        )
    report = {"built": len(lessons), "errors": errors, "levels": manifest["course"]["levels"], "firstOccurrence": first_occurrence.get("stats", {})}
    (repo / "modules/new-hsk-course/data/build-all-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if errors:
        print(json.dumps(report, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Build one New HSK lesson from reviewed Markdown + turn-level dialogue JSON.

The converter deliberately uses only the Python standard library. It keeps one
runtime source of truth and emits two reference-only views:
- bookFlow: original textbook order
- groupedIndex: vocabulary/dialogue/grammar/practice/etc.

Prototype scope: reviewed New HSK 1 lesson files that follow the app-ready
Markdown conventions established in this project.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

SCHEMA_VERSION = "new-hsk-course.v1"


class BuildError(RuntimeError):
    pass


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


def parse_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    if not text.startswith("---\n"):
        raise BuildError("Markdown is missing YAML frontmatter")
    end = text.find("\n---\n", 4)
    if end < 0:
        raise BuildError("Markdown frontmatter is not closed")
    raw = text[4:end]
    body = text[end + 5 :]
    data: dict[str, Any] = {}
    for line in raw.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            raise BuildError(f"Unsupported frontmatter line: {line!r}")
        key, value = line.split(":", 1)
        value = value.strip().strip('"').strip("'")
        if value.isdigit():
            data[key.strip()] = int(value)
        else:
            data[key.strip()] = value
    return data, body


@dataclass(frozen=True)
class Section:
    level: int
    title: str
    start: int
    end: int
    text: str


def split_sections(text: str, level: int = 2) -> list[Section]:
    pattern = re.compile(rf"^{'#' * level}\s+(.+?)\s*$", re.M)
    matches = list(pattern.finditer(text))
    sections: list[Section] = []
    for idx, match in enumerate(matches):
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        sections.append(Section(level, match.group(1).strip(), start, end, text[start:end].strip()))
    return sections


def find_section(sections: Iterable[Section], predicate) -> Section | None:
    return next((section for section in sections if predicate(section.title)), None)


def strip_numbered_title(title: str) -> str:
    return re.sub(r"^\d+(?:\.\d+)*\.\s*", "", title).strip()


def parse_markdown_table(section_text: str) -> tuple[list[str], list[list[str]]]:
    lines = [line.strip() for line in section_text.splitlines() if line.strip().startswith("|")]
    if len(lines) < 2:
        return [], []

    def cells(line: str) -> list[str]:
        return [cell.strip() for cell in line.strip("|").split("|")]

    headers = cells(lines[0])
    rows: list[list[str]] = []
    for line in lines[2:]:
        row = cells(line)
        if len(row) == len(headers):
            rows.append(row)
    return headers, rows


def table_dicts(section_text: str) -> list[dict[str, str]]:
    headers, rows = parse_markdown_table(section_text)
    return [dict(zip(headers, row)) for row in rows]


def parse_numbered_list(text: str) -> list[str]:
    values: list[str] = []
    for line in text.splitlines():
        match = re.match(r"^\s*\d+\.\s+(.+?)\s*$", line)
        if match:
            values.append(match.group(1).strip())
    return values


def clean_markdown_inline(value: str) -> str:
    value = re.sub(r"\*\*(.+?)\*\*", r"\1", value)
    value = re.sub(r"`(.+?)`", r"\1", value)
    return value.strip()


def parse_bilingual_activity(value: str) -> tuple[str, str]:
    match = re.match(r"^\*\*(.+?)\*\*\s*(.*)$", value)
    if match:
        return match.group(1).strip(), match.group(2).strip()
    return "", clean_markdown_inline(value)


def extract_audio_ref(text: str) -> str | None:
    match = re.search(r"Audio:\s*`([^`]+)`", text)
    return match.group(1).strip() if match else None


def extract_video_ref(text: str) -> str | None:
    match = re.search(r"Video:\s*`([^`]+)`", text)
    return match.group(1).strip() if match else None


def extract_vocab_audio_ref(text: str) -> str | None:
    match = re.search(r"Audio từ mới:\s*`([^`]+)`", text)
    return match.group(1).strip() if match else None


def plain_section_text(section: Section | None) -> str:
    if not section:
        return ""
    lines = [clean_markdown_inline(line.strip()) for line in section.text.splitlines() if line.strip()]
    return " ".join(lines)


def sub_sections(section_text: str, level: int = 3) -> list[Section]:
    return split_sections(section_text, level)


def first_bold_line(text: str) -> str:
    match = re.search(r"^\*\*(.+?)\*\*\s*$", text, re.M)
    return match.group(1).strip() if match else ""


def first_bold_inline(text: str) -> tuple[str, str]:
    match = re.search(r"^\*\*(.+?)\*\*\s*(.*?)\s*$", text, re.M)
    if not match:
        return "", ""
    return match.group(1).strip(), clean_markdown_inline(match.group(2))


def lines_after_first_bold(text: str) -> list[str]:
    found = False
    result: list[str] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not found and re.fullmatch(r"\*\*.+?\*\*", line):
            found = True
            continue
        if found and line:
            result.append(clean_markdown_inline(line))
    return result


def parse_layered_text(section_text: str) -> dict[str, str]:
    layers = {"hanzi": "", "pinyin": "", "vi": ""}
    sections = sub_sections(section_text, 3)
    mapping = {"Chữ Hán": "hanzi", "Pinyin": "pinyin", "Tiếng Việt": "vi"}
    for section in sections:
        key = mapping.get(strip_numbered_title(section.title))
        if not key:
            continue
        lines = [clean_markdown_inline(line.strip()) for line in section.text.splitlines() if line.strip()]
        layers[key] = "\n".join(lines)
    return layers


def parse_markdown_dialogues(body: str) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    lesson_sections = [s for s in split_sections(body, 2) if re.search(r"Bài khóa\s+\d+", s.title)]
    line_pattern = re.compile(r"^\*\*(.+?)[：:]\*\*\s*(.+?)\s*$")
    for lesson_section in lesson_sections:
        dialogue_section = find_section(sub_sections(lesson_section.text, 3), lambda t: strip_numbered_title(t) == "Hội thoại")
        if not dialogue_section:
            continue
        layers: dict[str, list[tuple[str, str]]] = {"hanzi": [], "pinyin": [], "vi": []}
        layer_sections = sub_sections(dialogue_section.text, 4)
        name_map = {"Chữ Hán": "hanzi", "Pinyin": "pinyin", "Tiếng Việt": "vi"}
        for layer in layer_sections:
            key = name_map.get(strip_numbered_title(layer.title))
            if not key:
                continue
            for raw in layer.text.splitlines():
                match = line_pattern.match(raw.strip())
                if match:
                    layers[key].append((match.group(1).strip(), match.group(2).strip()))
        result.append({"section": strip_numbered_title(lesson_section.title), "layers": layers})
    return result


def assert_dialogues_match(markdown_dialogues: list[dict[str, Any]], dialogue_json: dict[str, Any]) -> None:
    groups = dialogue_json.get("dialogue_groups", [])
    if len(markdown_dialogues) != len(groups):
        raise BuildError(f"Dialogue group mismatch: markdown={len(markdown_dialogues)}, json={len(groups)}")
    for group_index, (md_group, json_group) in enumerate(zip(markdown_dialogues, groups), 1):
        turns = json_group.get("turns", [])
        for key, speaker_key, text_key in (
            ("hanzi", "speaker_zh", "hanzi"),
            ("pinyin", "speaker_pinyin", "pinyin"),
            ("vi", "speaker_vi", "vietnamese"),
        ):
            md_rows = md_group["layers"][key]
            if len(md_rows) != len(turns):
                raise BuildError(
                    f"Dialogue {group_index} {key} count mismatch: markdown={len(md_rows)}, json={len(turns)}"
                )
            for turn_index, ((md_speaker, md_text), turn) in enumerate(zip(md_rows, turns), 1):
                expected = (str(turn[speaker_key]).strip(), str(turn[text_key]).strip())
                actual = (md_speaker, md_text)
                if actual != expected:
                    raise BuildError(
                        f"Dialogue {group_index} turn {turn_index} {key} mismatch:\n"
                        f"  markdown={actual!r}\n  json={expected!r}"
                    )


def longest_match_tokens(text: str, terms: Iterable[str]) -> list[str]:
    cleaned = re.sub(r"[\s，。！？、；：,.!?;:（）()“”‘’\-]+", "", text)
    if not cleaned:
        return []
    term_list = sorted({term for term in terms if term}, key=len, reverse=True)
    tokens: list[str] = []
    index = 0
    while index < len(cleaned):
        match = next((term for term in term_list if cleaned.startswith(term, index)), None)
        if match:
            tokens.append(match)
            index += len(match)
        else:
            tokens.append(cleaned[index])
            index += 1
    return tokens


def slug(level: int, lesson: int) -> str:
    return f"nhsk-{level}-{lesson:02d}"


def parse_trace(body: str) -> list[dict[str, Any]]:
    section = find_section(split_sections(body, 2), lambda t: strip_numbered_title(t) == "Truy vết trang nguồn")
    if not section:
        return []
    rows = table_dicts(section.text)
    result = []
    for row in rows:
        result.append(
            {
                "pdfPage": int(row.get("Trang PDF", "0") or 0),
                "bookPage": row.get("Trang sách", ""),
                "content": row.get("Nội dung được đối chiếu", ""),
                "status": row.get("Trạng thái", ""),
            }
        )
    return result


def parse_vocab_table(section_text: str, lesson_id: str, start_order: int) -> list[dict[str, Any]]:
    rows = table_dicts(section_text)
    result = []
    for row in rows:
        order = int(row["STT"])
        result.append(
            {
                "id": f"{lesson_id}-vocab-{order:03d}",
                "order": order,
                "hanzi": row.get("Chữ Hán", ""),
                "pinyin": row.get("Pinyin", ""),
                "hanViet": row.get("Hán Việt", ""),
                "wordClass": row.get("Từ loại", ""),
                "vi": row.get("Nghĩa tiếng Việt", ""),
                "note": row.get("Ghi chú", ""),
            }
        )
    return result


def parse_proper_nouns(section_text: str, lesson_id: str, start_order: int) -> list[dict[str, Any]]:
    rows = table_dicts(section_text)
    result = []
    for offset, row in enumerate(rows, start_order):
        result.append(
            {
                "id": f"{lesson_id}-proper-noun-{offset:03d}",
                "order": offset,
                "hanzi": row.get("Chữ Hán", ""),
                "pinyin": row.get("Pinyin", ""),
                "hanViet": row.get("Hán Việt", ""),
                "kind": row.get("Loại", ""),
                "vi": row.get("Nghĩa tiếng Việt", ""),
            }
        )
    return result


def parse_lesson_texts(body: str, level: int, lesson: int, dialogue_json: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, list[dict[str, Any]]]]:
    lesson_id = slug(level, lesson)
    dialogue_groups = dialogue_json.get("dialogue_groups", [])
    dialogue_by_section = {group.get("section_level2"): group for group in dialogue_groups}
    entities: dict[str, list[dict[str, Any]]] = {
        "vocabulary": [],
        "supplementalVocabulary": [],
        "properNouns": [],
        "languageNotes": [],
        "activities": [],
        "dialogues": [],
    }
    lesson_texts: list[dict[str, Any]] = []
    activity_order = 1
    proper_noun_order = 1

    for text_order, section in enumerate(
        [s for s in split_sections(body, 2) if re.search(r"Bài khóa\s+\d+", s.title)], 1
    ):
        title = strip_numbered_title(section.title)
        sub = sub_sections(section.text, 3)
        context_section = find_section(sub, lambda t: strip_numbered_title(t) == "Bối cảnh")
        instruction_section = find_section(sub, lambda t: strip_numbered_title(t) == "Yêu cầu")
        note_section = find_section(sub, lambda t: "Gợi ý" in strip_numbered_title(t))
        visual_section = find_section(sub, lambda t: strip_numbered_title(t) == "Nội dung hình")
        vocab_section = find_section(sub, lambda t: strip_numbered_title(t) == "Từ mới")
        proper_section = find_section(sub, lambda t: strip_numbered_title(t) == "Danh từ riêng")
        activities_section = find_section(sub, lambda t: strip_numbered_title(t) == "Hoạt động")

        context = {"hanzi": "", "vi": ""}
        if context_section:
            context["hanzi"] = first_bold_line(context_section.text)
            tail = lines_after_first_bold(context_section.text)
            context["vi"] = " ".join(tail)

        instruction = {"hanzi": "", "vi": "", "audioRef": None}
        if instruction_section:
            instruction_hanzi, instruction_tail = first_bold_inline(instruction_section.text)
            instruction["hanzi"] = instruction_hanzi
            instruction["vi"] = re.sub(r"\s*Audio:\s*`?[^`.]+`?\.?", "", instruction_tail).strip()
            instruction["audioRef"] = extract_audio_ref(instruction_section.text)

        note_ids: list[str] = []
        if note_section:
            note_id = f"{lesson_id}-language-note-{len(entities['languageNotes']) + 1:02d}"
            entities["languageNotes"].append(
                {
                    "id": note_id,
                    "order": len(entities["languageNotes"]) + 1,
                    "title": strip_numbered_title(note_section.title),
                    "hanzi": first_bold_line(note_section.text),
                    "vi": " ".join(lines_after_first_bold(note_section.text)),
                    "lessonTextId": f"{lesson_id}-lesson-text-{text_order:02d}",
                }
            )
            note_ids.append(note_id)

        vocab_ids: list[str] = []
        if vocab_section:
            parsed = parse_vocab_table(vocab_section.text, lesson_id, len(entities["vocabulary"]) + 1)
            for item in parsed:
                item["lessonTextId"] = f"{lesson_id}-lesson-text-{text_order:02d}"
            entities["vocabulary"].extend(parsed)
            vocab_ids = [item["id"] for item in parsed]

        proper_ids: list[str] = []
        if proper_section:
            parsed = parse_proper_nouns(proper_section.text, lesson_id, proper_noun_order)
            proper_noun_order += len(parsed)
            for item in parsed:
                item["lessonTextId"] = f"{lesson_id}-lesson-text-{text_order:02d}"
            entities["properNouns"].extend(parsed)
            proper_ids = [item["id"] for item in parsed]

        activity_ids: list[str] = []
        if activities_section:
            for value in parse_numbered_list(activities_section.text):
                zh, vi = parse_bilingual_activity(value)
                activity_id = f"{lesson_id}-activity-{activity_order:02d}"
                entities["activities"].append(
                    {
                        "id": activity_id,
                        "order": activity_order,
                        "type": "class-activity",
                        "hanzi": zh,
                        "vi": vi,
                        "lessonTextId": f"{lesson_id}-lesson-text-{text_order:02d}",
                    }
                )
                activity_ids.append(activity_id)
                activity_order += 1

        dialogue_group = dialogue_by_section.get(title)
        if not dialogue_group:
            raise BuildError(f"No dialogue JSON group found for section {title!r}")
        dialogue_order = len(entities["dialogues"]) + 1
        dialogue_id = f"{lesson_id}-dialogue-{dialogue_order:02d}"
        turns = []
        terms = [item["hanzi"] for item in entities["vocabulary"]]
        terms.extend(item["hanzi"] for item in entities["properNouns"])
        speaker_terms = [turn.get("speaker_zh", "") for turn in dialogue_group.get("turns", [])]
        terms.extend(speaker_terms)
        for speaker_term in speaker_terms:
            chinese_suffix = re.sub(r"^[A-Za-z0-9 _-]+", "", speaker_term)
            if chinese_suffix and chinese_suffix != speaker_term:
                terms.append(chinese_suffix)
        for raw_turn in dialogue_group.get("turns", []):
            turn_order = int(raw_turn["order"])
            turns.append(
                {
                    "id": f"{dialogue_id}-turn-{turn_order:03d}",
                    "order": turn_order,
                    "speaker": {
                        "vi": raw_turn["speaker_vi"],
                        "hanzi": raw_turn["speaker_zh"],
                        "pinyin": raw_turn["speaker_pinyin"],
                    },
                    "hanzi": raw_turn["hanzi"],
                    "pinyin": raw_turn["pinyin"],
                    "vi": raw_turn["vietnamese"],
                    "answerTokens": longest_match_tokens(raw_turn["hanzi"], terms),
                }
            )
        entities["dialogues"].append(
            {
                "id": dialogue_id,
                "order": dialogue_order,
                "kind": dialogue_group.get("kind", "main-dialogue"),
                "lessonTextId": f"{lesson_id}-lesson-text-{text_order:02d}",
                "sourceHeading": dialogue_group.get("source_heading", ""),
                "context": context,
                "turns": turns,
            }
        )

        lesson_texts.append(
            {
                "id": f"{lesson_id}-lesson-text-{text_order:02d}",
                "order": text_order,
                "title": title,
                "context": context,
                "instruction": instruction,
                "visualDescription": plain_section_text(visual_section),
                "vocabularyAudioRef": extract_vocab_audio_ref(vocab_section.text if vocab_section else ""),
                "dialogueId": dialogue_id,
                "vocabularyIds": vocab_ids,
                "properNounIds": proper_ids,
                "languageNoteIds": note_ids,
                "activityIds": activity_ids,
            }
        )

    return lesson_texts, entities


def resolve_practice_path(markdown_path: Path, practice_path: Path | None = None) -> Path | None:
    if practice_path is not None:
        return practice_path if practice_path.exists() else None
    candidate = markdown_path.parent / "practice" / f"{markdown_path.stem}_practice.json"
    return candidate if candidate.exists() else None


def merge_practice_data(lesson: dict[str, Any], practice_data: dict[str, Any], practice_path: Path) -> None:
    lesson_id = lesson["id"]
    if practice_data.get("lessonId") != lesson_id:
        raise BuildError(
            f"Practice lesson mismatch: expected={lesson_id}, actual={practice_data.get('lessonId')}"
        )

    entities = lesson["entities"]
    entities["exercises"] = practice_data.get("exercises", [])
    entities["radicalSortExercises"] = practice_data.get("radicalSortExercises", [])
    entities["oddOneOutExercises"] = practice_data.get("oddOneOutExercises", [])
    entities["characters"] = practice_data.get("characters", [])
    entities["characterBuildExercises"] = practice_data.get("characterBuildExercises", [])
    lesson["practicePlan"] = practice_data.get("practicePlan", {})
    lesson["stats"].update(practice_data.get("stats", {}))


def build_lesson(
    markdown_path: Path,
    dialogue_path: Path,
    practice_path: Path | None = None,
) -> dict[str, Any]:
    markdown_text = read_text(markdown_path)
    frontmatter, body = parse_frontmatter(markdown_text)
    dialogue_json = json.loads(read_text(dialogue_path))
    markdown_dialogues = parse_markdown_dialogues(body)
    assert_dialogues_match(markdown_dialogues, dialogue_json)

    level = int(frontmatter["level"])
    lesson = int(frontmatter["lesson"])
    lesson_id = slug(level, lesson)
    sections = split_sections(body, 2)

    objective_section = find_section(sections, lambda t: strip_numbered_title(t) == "Mục tiêu")
    objective_values = parse_numbered_list(objective_section.text if objective_section else "")
    objectives = [
        {"id": f"{lesson_id}-objective-{idx:02d}", "order": idx, "vi": clean_markdown_inline(value)}
        for idx, value in enumerate(objective_values, 1)
    ]

    lesson_texts, entities = parse_lesson_texts(body, level, lesson, dialogue_json)

    passages: list[dict[str, Any]] = []
    passage_section = find_section(sections, lambda t: "Cùng đọc bài vè" in t or "跟读绕口令" in t)
    if passage_section:
        passage_id = f"{lesson_id}-passage-01"
        passages.append(
            {
                "id": passage_id,
                "order": 1,
                "kind": "rhyme",
                "title": strip_numbered_title(passage_section.title),
                "audioRef": extract_audio_ref(passage_section.text),
                **parse_layered_text(passage_section.text),
            }
        )

    extensions: list[dict[str, Any]] = []
    extension_section = find_section(sections, lambda t: "Món quà của Tiểu Ngữ" in t or "小语的彩蛋" in t)
    if extension_section:
        bullet_data: dict[str, str] = {}
        for raw in extension_section.text.splitlines():
            match = re.match(r"^-\s+\*\*(.+?):\*\*\s*(.+?)\s*$", raw.strip())
            if match:
                bullet_data[match.group(1).strip()] = clean_markdown_inline(match.group(2))
        extension_id = f"{lesson_id}-extension-01"
        extensions.append(
            {
                "id": extension_id,
                "order": 1,
                "kind": "xiaoyu-easter-egg",
                "title": strip_numbered_title(extension_section.title),
                "videoRef": extract_video_ref(extension_section.text),
                "prompt": bullet_data.get("Gợi ý", ""),
                "topic": bullet_data.get("Chủ đề", ""),
                "vi": bullet_data.get("Tiếng Việt", ""),
                "visualDescription": bullet_data.get("Mô tả hình", ""),
            }
        )
        if bullet_data.get("Gợi ý"):
            note_order = len(entities["languageNotes"]) + 1
            entities["languageNotes"].append(
                {
                    "id": f"{lesson_id}-language-note-{note_order:02d}",
                    "order": note_order,
                    "title": "Gợi ý học Pinyin",
                    "hanzi": "",
                    "vi": bullet_data["Gợi ý"],
                    "extensionId": extension_id,
                }
            )

    entities["objectives"] = objectives
    entities["lessonTexts"] = lesson_texts
    entities["passages"] = passages
    entities["extensions"] = extensions
    entities["grammar"] = []
    entities["examplesPractice"] = []
    entities["exercises"] = []

    book_flow = ["objectives"]
    for item in lesson_texts:
        book_flow.append(item["id"])
    book_flow.extend(item["id"] for item in passages)
    book_flow.extend(item["id"] for item in extensions)

    grouped = {
        "vocabulary": [item["id"] for item in entities["vocabulary"]],
        "supplementalVocabulary": [item["id"] for item in entities["supplementalVocabulary"]],
        "properNouns": [item["id"] for item in entities["properNouns"]],
        "dialogues": [item["id"] for item in entities["dialogues"]],
        "languageNotes": [item["id"] for item in entities["languageNotes"]],
        "grammar": [],
        "examplesPractice": [],
        "passages": [item["id"] for item in passages],
        "exercisesActivities": [item["id"] for item in entities["activities"]],
        "extensions": [item["id"] for item in extensions],
    }

    total_turns = sum(len(item["turns"]) for item in entities["dialogues"])
    lesson_data = {
        "schemaVersion": SCHEMA_VERSION,
        "id": lesson_id,
        "courseId": "new-hsk-course",
        "level": level,
        "lessonNumber": lesson,
        "title": {
            "hanzi": frontmatter.get("title_zh", ""),
            "pinyin": frontmatter.get("title_pinyin", ""),
            "vi": frontmatter.get("title_vi", ""),
        },
        "source": {
            "book": frontmatter.get("book", ""),
            "pdfPages": frontmatter.get("source_pdf_pages", ""),
            "bookPages": frontmatter.get("source_book_pages", ""),
            "verificationStatus": frontmatter.get("verification_status", ""),
            "markdown": markdown_path.name,
            "dialogueData": dialogue_path.name,
            "pageTrace": parse_trace(body),
        },
        "stats": {
            "objectives": len(objectives),
            "lessonTexts": len(lesson_texts),
            "vocabulary": len(entities["vocabulary"]),
            "supplementalVocabulary": len(entities["supplementalVocabulary"]),
            "properNouns": len(entities["properNouns"]),
            "dialogues": len(entities["dialogues"]),
            "dialogueTurns": total_turns,
            "languageNotes": len(entities["languageNotes"]),
            "activities": len(entities["activities"]),
            "passages": len(passages),
            "extensions": len(extensions),
        },
        "entities": entities,
        "views": {"bookFlow": book_flow, "groupedIndex": grouped},
    }

    resolved_practice_path = resolve_practice_path(markdown_path, practice_path)
    if resolved_practice_path:
        practice_data = json.loads(read_text(resolved_practice_path))
        merge_practice_data(lesson_data, practice_data, resolved_practice_path)
    return lesson_data


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--markdown", type=Path, required=True)
    parser.add_argument("--dialogues", type=Path, required=True)
    parser.add_argument("--practice", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    lesson = build_lesson(args.markdown, args.dialogues, args.practice)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(lesson, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "id": lesson["id"], "stats": lesson["stats"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (BuildError, KeyError, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)

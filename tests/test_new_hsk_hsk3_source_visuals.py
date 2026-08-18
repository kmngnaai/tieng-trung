#!/usr/bin/env python3
"""Validate HSK3 source-backed visuals, tasks, grammar, vocabulary and audio."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "modules" / "new-hsk-course"
DATA = MODULE / "data" / "hsk3"
SOURCE = MODULE / "source" / "hsk3"
AUDIO = MODULE / "assets" / "audio" / "hsk3"


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    visuals = load(SOURCE / "visual-manifest.json")
    tasks = load(SOURCE / "source-task-manifest.json")
    display = load(SOURCE / "display-manifest.json")
    assert visuals["level"] == tasks["level"] == display["level"] == 3
    assert len(visuals["lessons"]) == len(tasks["lessons"]) == len(display["lessons"]) == 18

    total_visuals = visible_visuals = total_tasks = grammar_examples = summary_rows = 0
    visible_assets: set[Path] = set()
    audio_refs: set[str] = set()

    for lesson_no in range(1, 19):
        lesson_id = f"nhsk-3-{lesson_no:02d}"
        lesson = load(DATA / f"lesson-{lesson_no:02d}.json")
        assert lesson["id"] == lesson_id
        sections = lesson["entities"]["contentSections"]
        assert lesson["views"]["bookFlow"] == [section["id"] for section in sections]
        assert lesson_id in visuals["lessons"] and lesson_id in tasks["lessons"] and lesson_id in display["lessons"]

        # Learner vocabulary/proper names must never lose the Vietnamese layer.
        assert lesson["entities"]["vocabulary"], lesson_id
        assert all(str(row.get("vi", "")).strip() for row in lesson["entities"]["vocabulary"]), lesson_id
        assert all(str(row.get("vi", "")).strip() for row in lesson["entities"].get("properNouns", [])), lesson_id

        lesson_visuals = lesson_visible = lesson_tasks = 0
        listening_tasks = []
        image_match_tasks = []
        found_warmup = found_grammar = False

        for section in sections:
            kind = section.get("kind", "")
            visible_in_section = []
            for visual in section.get("sourceVisuals", []):
                lesson_visuals += 1
                source_type = visual.get("sourceType")
                assert source_type in {"ppt", "pdf", "pdf-crop"}
                assert visual.get("sourceRef"), f"{lesson_id}: missing visual source trace"
                src = str(visual.get("src", ""))
                shown = visual.get("displayInLesson") is True
                if source_type == "pdf":
                    assert not shown and not src, f"{lesson_id}: full PDF page leaked into learner UI"
                if shown:
                    lesson_visible += 1
                    visible_in_section.append(visual)
                    assert source_type in {"ppt", "pdf-crop"}
                    assert kind in {"warmup", "lesson-text", "passage", "activity"}
                    assert visual.get("assetPolicy") == "learner-visual"
                    assert src and not Path(src).is_absolute() and ".." not in Path(src).parts
                    asset = MODULE / src
                    assert asset.exists() and asset.stat().st_size > 1024, asset
                    visible_assets.add(asset)
                elif source_type == "pdf":
                    assert visual.get("assetPolicy") == "trace-only"

            if kind in {"objectives", "exercise", "extension"} or section.get("summaryDisplay"):
                assert not visible_in_section, f"{lesson_id}: source image shown in {kind or 'summary'}"

            source_tasks = section.get("sourceTasks", [])
            lesson_tasks += len(source_tasks)
            for task in source_tasks:
                task_type = task.get("type")
                assert task_type in {"image-match", "listening-mcq"}
                answers = task.get("answers", [])
                assert answers and task.get("sourceRef")
                if task_type == "image-match":
                    image_match_tasks.append(task)
                    assert all(answer in "ABCDEF" for answer in answers)
                else:
                    listening_tasks.append(task)
                    assert all(answer in "ABC" for answer in answers)
                    assert task.get("audioRef")
                    audio_refs.add(task["audioRef"])

            if kind == "warmup":
                found_warmup = True
                warmup = section.get("warmupDisplay", {})
                assert warmup.get("instructionVi"), f"{lesson_id}: warmup instruction missing"
                assert visible_in_section, f"{lesson_id}: warmup visual missing"

            grammar = section.get("grammarDisplay")
            if grammar:
                found_grammar = True
                for group in grammar.get("groups", []):
                    examples = group.get("examples", [])
                    assert examples, f"{lesson_id}: empty grammar group {group.get('title')}"
                    for example in examples:
                        grammar_examples += 1
                        assert example.get("hanzi") and example.get("pinyin") and example.get("vi")
                        assert example.get("pinyinStatus") == "source"
                        assert example.get("viStatus") == "source"
                        assert "________" not in example.get("hanzi", ""), f"{lesson_id}: exercise prompt parsed as example"

            summary = section.get("summaryDisplay")
            if summary:
                items = summary.get("items", [])
                assert lesson_no in {3, 6, 9, 12, 15, 18} and items
                summary_rows += len(items)

        assert found_warmup and found_grammar
        assert len(listening_tasks) == 4, (lesson_id, len(listening_tasks))
        assert {task["audioRef"] for task in listening_tasks} == {f"{lesson_no}-{track}" for track in (1, 3, 5, 7)}
        expected_task_count = 4 if lesson_no in {2, 7} else 5
        assert lesson_tasks == expected_task_count, (lesson_id, lesson_tasks)
        assert len(image_match_tasks) == (0 if lesson_no in {2, 7} else 1)
        assert lesson["stats"]["sourceVisuals"] == lesson_visuals
        assert lesson["stats"]["visibleSourceVisuals"] == lesson_visible
        assert lesson["stats"]["sourceTasks"] == lesson_tasks
        total_visuals += lesson_visuals
        visible_visuals += lesson_visible
        total_tasks += lesson_tasks

    assert len(visible_assets) == 93
    assert total_visuals == 312 and visible_visuals == 93 and total_tasks == 88
    assert grammar_examples == 186 and summary_rows == 61

    # Canonical HSK3 audio: 18 lessons x 8 textbook tracks.
    audio_files = sorted(AUDIO.rglob("*.mp3"))
    assert len(audio_files) == 144
    for lesson_no in range(1, 19):
        for track_no in range(1, 9):
            path = AUDIO / f"lesson-{lesson_no:02d}" / f"{lesson_no}-{track_no}.mp3"
            assert path.exists() and path.stat().st_size > 1024
    assert len(audio_refs) == 72
    assert all(re.fullmatch(r"\d{1,2}-[1357]", ref) for ref in audio_refs)

    # Non-standard warmups keep the exact source instruction without inventing an image-match answer key.
    lesson2 = load(DATA / "lesson-02.json")
    lesson7 = load(DATA / "lesson-07.json")
    warmup2 = next(section for section in lesson2["entities"]["contentSections"] if section.get("kind") == "warmup")
    warmup7 = next(section for section in lesson7["entities"]["contentSections"] if section.get("kind") == "warmup")
    assert warmup2["warmupDisplay"]["instructionVi"] == "Điền từ/cụm từ vào nhóm phù hợp"
    assert warmup7["warmupDisplay"]["instructionVi"] == "Viết lượng từ thích hợp theo tranh"

    # Explicit PPT-backed source corrections.
    l4 = (SOURCE / "HSK3_Bai_04.md").read_text(encoding="utf-8")
    l10 = (SOURCE / "HSK3_Bai_10.md").read_text(encoding="utf-8")
    l16 = (SOURCE / "HSK3_Bai_16.md").read_text(encoding="utf-8")
    l17 = (SOURCE / "HSK3_Bai_17.md").read_text(encoding="utf-8")
    assert "| 晚点 |" in l4 and "| động |" in next(line for line in l4.splitlines() if "| 晚点 |" in line)
    assert "| 页 |" in l10 and "| danh |" in next(line for line in l10.splitlines() if "| 页 |" in line)
    assert "| 句 |" in l10 and "| danh |" in next(line for line in l10.splitlines() if "| 句 |" in line)
    assert "| 张 |" in l16 and "| động |" in next(line for line in l16.splitlines() if "| 张 |" in line)
    assert "mở; há" in next(line for line in l16.splitlines() if "| 张 |" in line)
    assert "| 半天 |" in l16 and "| số-lượng |" in next(line for line in l16.splitlines() if "| 半天 |" in line)
    assert "| 比如 |" in l17 and "| động |" in next(line for line in l17.splitlines() if "| 比如 |" in line)

    print(
        "PASS HSK3 full course: 18 lessons, "
        f"{visible_visuals}/{total_visuals} visible/source visuals, "
        f"{total_tasks} source tasks, {grammar_examples} source grammar examples, "
        f"{summary_rows} summary rows, {len(audio_files)} audio files"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

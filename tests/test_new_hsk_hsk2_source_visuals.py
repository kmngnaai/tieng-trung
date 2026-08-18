#!/usr/bin/env python3
"""Validate HSK2 source visuals, activities, grammar and audio integration."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "modules" / "new-hsk-course"
DATA = MODULE / "data" / "hsk2"
SOURCE = MODULE / "source" / "hsk2"
AUDIO = MODULE / "assets" / "audio" / "hsk2"


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    visuals = load(SOURCE / "visual-manifest.json")
    tasks = load(SOURCE / "source-task-manifest.json")
    display = load(SOURCE / "display-manifest.json")
    assert visuals["level"] == tasks["level"] == display["level"] == 2
    assert len(visuals["lessons"]) == len(tasks["lessons"]) == len(display["lessons"]) == 15

    total_visuals = visible_visuals = total_tasks = grammar_examples = summary_rows = 0
    visible_assets: set[Path] = set()
    audio_refs: set[str] = set()

    for lesson_no in range(1, 16):
        lesson_id = f"nhsk-2-{lesson_no:02d}"
        lesson = load(DATA / f"lesson-{lesson_no:02d}.json")
        assert lesson["id"] == lesson_id
        sections = lesson["entities"]["contentSections"]
        assert lesson["views"]["bookFlow"] == [section["id"] for section in sections]

        lesson_visuals = lesson_visible = lesson_tasks = 0
        found_warmup = found_grammar = found_tf = False
        for section in sections:
            kind = section.get("kind", "")
            visible_in_section = []
            for visual in section.get("sourceVisuals", []):
                lesson_visuals += 1
                assert visual.get("sourceRef")
                source_type = visual.get("sourceType")
                assert source_type in {"ppt", "pdf", "pdf-crop"}
                src = str(visual.get("src", ""))
                shown = visual.get("displayInLesson") is True
                if source_type == "pdf":
                    assert not shown and not src, f"{lesson_id}: full PDF page leaked into UI"
                if shown:
                    lesson_visible += 1
                    visible_in_section.append(visual)
                    assert source_type in {"ppt", "pdf-crop"}
                    assert visual.get("assetPolicy") == "learner-visual"
                    assert src and not Path(src).is_absolute() and ".." not in Path(src).parts
                    asset = MODULE / src
                    assert asset.exists() and asset.stat().st_size > 1024, asset
                    visible_assets.add(asset)
                else:
                    if source_type == "pdf":
                        assert visual.get("assetPolicy") == "trace-only"
                        assert not src
                    else:
                        assert kind == "activity" or visual.get("assetPolicy") == "trace-only"

            if kind in {"objectives", "exercise", "extension"} or section.get("summaryDisplay"):
                assert not visible_in_section, f"{lesson_id}: source image shown in {kind or 'summary'}"

            source_tasks = section.get("sourceTasks", [])
            lesson_tasks += len(source_tasks)
            for task in source_tasks:
                task_type = task.get("type")
                assert task_type in {"image-match", "listening-mcq", "listening-tf"}
                answers = task.get("answers", [])
                assert answers
                if task_type == "image-match":
                    assert all(answer in "ABCDEF" for answer in answers)
                elif task_type == "listening-mcq":
                    assert all(answer in "ABC" for answer in answers)
                else:
                    found_tf = True
                    assert all(answer in {"√", "×"} for answer in answers)
                if task.get("audioRef"):
                    audio_refs.add(task["audioRef"])

            if kind == "warmup":
                found_warmup = True
                warmup = section.get("warmupDisplay", {})
                choices = warmup.get("choices", [])
                expected = 6 if lesson_no in {5, 10, 13} else 4
                assert len(choices) == expected, (lesson_id, len(choices), expected)
                assert all(row.get("key") and row.get("hanzi") and row.get("pinyin") for row in choices)
                assert visible_in_section
                assert any(task.get("type") == "image-match" for task in source_tasks)

            grammar = section.get("grammarDisplay")
            if grammar:
                found_grammar = True
                for group in grammar.get("groups", []):
                    examples = group.get("examples", [])
                    assert examples, f"{lesson_id}: empty grammar examples for {group.get('title')}"
                    for example in examples:
                        grammar_examples += 1
                        assert example.get("hanzi") and example.get("pinyin") and example.get("vi")
                        assert example.get("pinyinStatus") == "source"
                        assert example.get("viStatus") == "source"

            summary = section.get("summaryDisplay")
            if summary:
                items = summary.get("items", [])
                assert lesson_no in {3, 6, 9, 12, 15} and items
                summary_rows += len(items)

        assert found_warmup and found_grammar and found_tf
        assert lesson_tasks == 5, (lesson_id, lesson_tasks)
        assert lesson_visible == 5, (lesson_id, lesson_visible)
        assert lesson["stats"]["sourceVisuals"] == lesson_visuals
        assert lesson["stats"]["visibleSourceVisuals"] == lesson_visible
        assert lesson["stats"]["sourceTasks"] == lesson_tasks
        total_visuals += lesson_visuals
        visible_visuals += lesson_visible
        total_tasks += lesson_tasks

    assert len(visible_assets) == 75
    assert visible_visuals == 75 and total_tasks == 75
    assert total_visuals == 230
    assert grammar_examples == 156
    assert summary_rows == 44

    # Every lesson has all eight canonical textbook audio tracks.
    audio_files = sorted(AUDIO.rglob("*.mp3"))
    assert len(audio_files) == 120
    for lesson_no in range(1, 16):
        for track_no in range(1, 9):
            path = AUDIO / f"lesson-{lesson_no:02d}" / f"{lesson_no}-{track_no}.mp3"
            assert path.exists() and path.stat().st_size > 1024
    assert len(audio_refs) == 60
    assert all(re.fullmatch(r"\d{1,2}-[1357]", ref) for ref in audio_refs)

    # Two source corrections confirmed against the supplied PDF/PPT.
    lesson5 = (SOURCE / "HSK2_Bai_05.md").read_text(encoding="utf-8")
    lesson9 = (SOURCE / "HSK2_Bai_09.md").read_text(encoding="utf-8")
    assert "F. 下去 xiàqù" in lesson5
    assert "A. 个子 gèzi" in lesson9 and "A. 杯子 bēizi" not in lesson9

    print(
        "PASS HSK2 full course: 15 lessons, "
        f"{visible_visuals}/{total_visuals} visible/source visuals, "
        f"{total_tasks} interactive tasks, {grammar_examples} grammar examples, "
        f"{summary_rows} summary rows, {len(audio_files)} audio files"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

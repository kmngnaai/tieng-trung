#!/usr/bin/env python3
"""Validate the refined HSK1 learner-facing presentation and source trace."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "modules" / "new-hsk-course"
DATA = MODULE / "data" / "hsk1"
SOURCE = MODULE / "source" / "hsk1"


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def webp_size(path: Path) -> tuple[int, int]:
    raw = path.read_bytes()
    assert raw[:4] == b"RIFF" and raw[8:12] == b"WEBP", f"{path.relative_to(ROOT)} is not WebP"
    width = height = 0
    offset = 12
    while offset + 8 <= len(raw):
        chunk = raw[offset : offset + 4]
        chunk_size = int.from_bytes(raw[offset + 4 : offset + 8], "little")
        data = raw[offset + 8 : offset + 8 + chunk_size]
        if chunk == b"VP8X" and len(data) >= 10:
            width = 1 + int.from_bytes(data[4:7], "little")
            height = 1 + int.from_bytes(data[7:10], "little")
            break
        if chunk == b"VP8L" and len(data) >= 5 and data[0] == 0x2F:
            b1, b2, b3, b4 = data[1:5]
            width = 1 + (((b2 & 0x3F) << 8) | b1)
            height = 1 + (((b4 & 0x0F) << 10) | (b3 << 2) | ((b2 & 0xC0) >> 6))
            break
        if chunk == b"VP8 " and len(data) >= 10 and data[3:6] == bytes((0x9D, 0x01, 0x2A)):
            width = int.from_bytes(data[6:8], "little") & 0x3FFF
            height = int.from_bytes(data[8:10], "little") & 0x3FFF
            break
        offset += 8 + chunk_size + (chunk_size & 1)
    return width, height


def main() -> int:
    visual_manifest = load(SOURCE / "visual-manifest.json")
    task_manifest = load(SOURCE / "source-task-manifest.json")
    display_manifest = load(SOURCE / "display-manifest.json")
    assert visual_manifest.get("level") == 1
    assert task_manifest.get("level") == 1
    assert display_manifest.get("level") == 1

    total_visuals = 0
    visible_visuals = 0
    total_tasks = 0
    warmups = 0
    grammar_sections = 0
    grammar_examples = 0
    summaries = 0
    summary_items = 0
    vi_statuses: dict[str, int] = {}
    checked_assets: set[Path] = set()

    for lesson_no in range(1, 16):
        lesson = load(DATA / f"lesson-{lesson_no:02d}.json")
        lesson_id = f"nhsk-1-{lesson_no:02d}"
        assert lesson["id"] == lesson_id
        sections = lesson["entities"]["contentSections"]
        assert lesson["views"]["bookFlow"] == [row["id"] for row in sections], f"{lesson_id}: wrong textbook order"
        assert lesson_id in visual_manifest["lessons"]
        assert lesson_id in task_manifest["lessons"]
        assert lesson_id in display_manifest["lessons"]

        lesson_visuals = 0
        lesson_visible = 0
        lesson_tasks = 0
        for section in sections:
            kind = section.get("kind", "")
            visible_in_section = []
            for visual in section.get("sourceVisuals", []):
                lesson_visuals += 1
                source_type = visual.get("sourceType")
                assert source_type in {"pdf", "ppt", "pdf-crop"}, f"{lesson_id}: bad source type"
                assert visual.get("sourceRef"), f"{lesson_id}: source trace missing"
                src = str(visual.get("src", ""))
                if src:
                    assert ".." not in Path(src).parts and not Path(src).is_absolute(), f"{lesson_id}: unsafe asset path"
                    asset = MODULE / src
                    assert asset.exists() and asset.stat().st_size > 1024, f"{lesson_id}: missing {src}"
                display = visual.get("displayInLesson") is True
                if source_type == "pdf":
                    assert not display, f"{lesson_id}: full PDF page must be hidden"
                if display:
                    lesson_visible += 1
                    visible_in_section.append(visual)
                    assert visual.get("assetPolicy") == "learner-visual"
                    assert src, f"{lesson_id}: visible image path missing"
                    checked_assets.add(asset)
                    assert source_type in {"ppt", "pdf-crop"}, f"{lesson_id}: unsupported visible source"
                    if source_type == "ppt":
                        assert kind in {"warmup", "lesson-text", "activity"}, f"{lesson_id}: PPT shown in {kind}"
                else:
                    assert visual.get("assetPolicy") == "trace-only"
                    assert not src, f"{lesson_id}: hidden source must not retain a learner asset path"

            if kind in {"objectives", "exercise", "extension"} or section.get("summaryDisplay"):
                assert not visible_in_section, f"{lesson_id}: {kind or 'summary'} must not show source images"

            tasks = section.get("sourceTasks", [])
            lesson_tasks += len(tasks)
            for task in tasks:
                assert task.get("type") in {"image-match", "listening-mcq"}
                assert task.get("answers") and all(answer in "ABCDEF" for answer in task["answers"])
                assert task.get("sourceRef"), f"{lesson_id}: task source trace missing"

            if kind == "warmup":
                warmups += 1
                display = section.get("warmupDisplay", {})
                assert display.get("instructionHanzi") and display.get("instructionVi"), f"{lesson_id}: warmup instruction missing"
                if any(task.get("type") == "image-match" for task in tasks):
                    choices = display.get("choices", [])
                    assert len(choices) >= 4, f"{lesson_id}: warmup choices missing"
                    assert all(item.get("key") and item.get("hanzi") for item in choices)
                    assert visible_in_section, f"{lesson_id}: warmup image missing"

            grammar = section.get("grammarDisplay")
            if grammar is not None:
                grammar_sections += 1
                assert grammar.get("introMarkdown") or grammar.get("groups"), f"{lesson_id}: empty grammar display"
                for group in grammar.get("groups", []):
                    for example in group.get("examples", []):
                        grammar_examples += 1
                        assert example.get("hanzi"), f"{lesson_id}: grammar Hanzi missing"
                        assert example.get("pinyin"), f"{lesson_id}: grammar pinyin missing"
                        assert example.get("vi"), f"{lesson_id}: grammar Vietnamese missing"
                        status = str(example.get("viStatus", ""))
                        assert status in {"source", "repo-source", "editorial-completion"}
                        vi_statuses[status] = vi_statuses.get(status, 0) + 1

            summary = section.get("summaryDisplay")
            if summary is not None:
                summaries += 1
                items = summary.get("items", [])
                assert items, f"{lesson_id}: summary table missing"
                summary_items += len(items)
                assert all(item.get("id") and item.get("content") for item in items)

        assert lesson["stats"].get("sourceVisuals") == lesson_visuals
        assert lesson["stats"].get("visibleSourceVisuals") == lesson_visible
        assert lesson["stats"].get("sourceTasks") == lesson_tasks
        total_visuals += lesson_visuals
        visible_visuals += lesson_visible
        total_tasks += lesson_tasks

    for asset in checked_assets:
        width, height = webp_size(asset)
        assert width >= 120 and height >= 100, f"{asset.relative_to(ROOT)} has invalid size {width}x{height}"

    assert warmups == 12
    assert grammar_sections == 38
    assert grammar_examples == 157
    assert summaries == 5 and summary_items == 50
    assert vi_statuses == {"source": 100, "editorial-completion": 46, "repo-source": 11}
    assert total_visuals == 139 and visible_visuals == 70 and total_tasks == 40
    assert (ROOT / "scripts/new-hsk-course/build_hsk1_display_manifests.py").exists()

    print(
        "PASS refined HSK1 learner flow: "
        f"15 lessons, {visible_visuals}/{total_visuals} visible/source visuals, "
        f"{total_tasks} tasks, {grammar_examples} grammar examples, {summary_items} summary rows"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

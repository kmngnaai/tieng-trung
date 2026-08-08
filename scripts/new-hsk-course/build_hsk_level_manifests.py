#!/usr/bin/env python3
"""Build source visual/task manifests quickly from PPTX XML and existing assets."""
from __future__ import annotations

import argparse
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

from course_config import lesson_numbers

NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
}
EMU_PER_INCH = 914400


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def lesson_number_from_name(name: str) -> int | None:
    match = re.search(r"第\s*(\d+)\s*课", name)
    return int(match.group(1)) if match else None


def slide_records(pptx: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    with zipfile.ZipFile(pptx) as archive:
        names = [name for name in archive.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", name)]
        names.sort(key=lambda value: int(re.search(r"slide(\d+)\.xml", value).group(1)))
        for name in names:
            root = ET.fromstring(archive.read(name))
            texts = [node.text or "" for node in root.findall(".//a:t", NS)]
            shapes: list[dict[str, Any]] = []
            for shape in root.findall(".//p:sp", NS):
                value = "".join(node.text or "" for node in shape.findall(".//a:t", NS)).strip()
                off = shape.find("./p:spPr/a:xfrm/a:off", NS)
                ext = shape.find("./p:spPr/a:xfrm/a:ext", NS)
                if off is None or ext is None:
                    continue
                shapes.append({
                    "text": " ".join(value.split()),
                    "x": int(off.get("x", "0")) / EMU_PER_INCH,
                    "y": int(off.get("y", "0")) / EMU_PER_INCH,
                    "w": int(ext.get("cx", "0")) / EMU_PER_INCH,
                    "h": int(ext.get("cy", "0")) / EMU_PER_INCH,
                })
            records.append({"text": " | ".join(" ".join(text.split()) for text in texts), "shapes": shapes})
    return records


def find_targets(records: list[dict[str, Any]]) -> dict[str, int]:
    targets: dict[str, int] = {}
    for index, record in enumerate(records, 1):
        compact = re.sub(r"[\s|]+", "", record["text"])
        if "warmup" not in targets and index <= 8:
            lower_text = record["text"].lower()
            has_warmup_marker = "warm-up" in lower_text or "warmup" in lower_text or "热身" in compact
            has_first_task = any(token in compact for token in ("1.", "1。", "1．"))
            if has_warmup_marker and has_first_task:
                targets["warmup"] = index
        for number in (1, 2, 3, 4):
            key = f"text{number}"
            if key not in targets and f"课文{number}" in compact and ("课文内容请见" in compact or "Pleaserefertopage" in compact):
                targets[key] = index
        if "activity" not in targets and "课堂活动" in compact:
            targets["activity"] = index
        if "summary" not in targets and "学习小结" in compact:
            targets["summary"] = index
        if "extension" not in targets and "小语的彩蛋" in compact:
            targets["extension"] = index
    return targets


def is_image_match_warmup(text: str) -> bool:
    compact = re.sub(r"[\s|]+", "", text).lower()
    return (
        ("选择对应的图片" in compact or "选择相应的图片" in compact)
        or ("matchthewords" in compact and "pictures" in compact)
    )


def standalone_tokens(record: dict[str, Any], pattern: str) -> list[str]:
    regex = re.compile(pattern)
    rows = [shape for shape in record["shapes"] if regex.fullmatch(shape["text"])]
    rows.sort(key=lambda row: (round(row["y"], 1), row["x"]))
    return [row["text"] for row in rows]


def section_map(lesson: dict[str, Any]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for section in lesson.get("entities", {}).get("contentSections", []):
        title = section.get("title", "")
        kind = section.get("kind", "")
        if kind == "warmup":
            result["warmup"] = section
        elif kind == "activity":
            result["activity"] = section
        elif kind == "passage":
            # HSK 2-3 use the fourth textbook track (x-7) as the passage/text 4.
            result["text4"] = section
        elif title.lower().startswith("tổng kết"):
            result["summary"] = section
        elif kind == "extension":
            result["extension"] = section
        else:
            match = re.search(r"Bài khóa\s*(\d+)", title, re.I)
            if match:
                result[f"text{match.group(1)}"] = section
    return result


def page_for_section(lesson: dict[str, Any], section: dict[str, Any]) -> int | None:
    traces = lesson.get("source", {}).get("pageTrace", []) or []
    title = section.get("title", "")
    kind = section.get("kind", "")
    needles: list[str] = []
    match = re.search(r"Bài khóa\s*(\d+)", title, re.I)
    if match:
        needles = [f"Bài khóa {match.group(1)}"]
    elif kind in {"warmup", "objectives"}:
        needles = ["khởi động", "Tên bài"]
    elif kind == "exercise":
        needles = ["Bài tập tổng hợp", "Bài tập"]
    elif kind == "activity":
        needles = ["Hoạt động"]
    elif kind == "extension":
        needles = ["Món quà", "mở rộng"]
    elif title.lower().startswith("tổng kết"):
        needles = ["Tổng kết", "tự đánh giá"]
    for needle in needles:
        for trace in traces:
            if needle.lower() in str(trace.get("content", "")).lower():
                return int(trace.get("pdfPage"))
    if traces:
        return int(traces[0 if kind in {"warmup", "objectives"} else -1].get("pdfPage"))
    return None


def pdf_trace(lesson: dict[str, Any], section: dict[str, Any], level: int) -> dict[str, Any] | None:
    page = page_for_section(lesson, section)
    if page is None:
        return None
    return {
        "id": f"{lesson['id']}-visual-pdf-{page}",
        "alt": f"Trang nguồn Bài {lesson['lessonNumber']}",
        "caption": f"Trang nguồn PDF {page}",
        "sourceType": "pdf",
        "sourceRef": f"新HSK{level} 教材 - trang PDF {page}",
        "assetPolicy": "trace-only",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--level", type=int, required=True)
    parser.add_argument("--ppt-dir", type=Path, required=True)
    args = parser.parse_args()

    repo = args.repo.resolve()
    level = args.level
    data_dir = repo / f"modules/new-hsk-course/data/hsk{level}"
    source_dir = repo / f"modules/new-hsk-course/source/hsk{level}"
    asset_root = repo / f"modules/new-hsk-course/assets/visuals/hsk{level}"
    ppt_by_lesson: dict[int, Path] = {}
    for path in args.ppt_dir.glob("*.pptx"):
        number = lesson_number_from_name(path.name)
        if number is not None:
            ppt_by_lesson[number] = path

    visual_manifest: dict[str, Any] = {"version": 1, "course": "new-hsk-course", "level": level, "lessons": {}}
    task_manifest: dict[str, Any] = {"version": 1, "course": "new-hsk-course", "level": level, "lessons": {}}

    for number in lesson_numbers(level):
        lesson = read_json(data_dir / f"lesson-{number:02d}.json")
        sections = section_map(lesson)
        records = slide_records(ppt_by_lesson[number])
        targets = find_targets(records)
        visual_sections: dict[str, list[dict[str, Any]]] = {}
        task_sections: dict[str, list[dict[str, Any]]] = {}

        for section in lesson.get("entities", {}).get("contentSections", []):
            trace = pdf_trace(lesson, section, level)
            if trace:
                visual_sections[section["id"]] = [trace]

        warmup = sections.get("warmup")
        warmup_slide = targets.get("warmup")
        warmup_asset = asset_root / f"lesson-{number:02d}/ppt-warmup.webp"
        if warmup and warmup_slide and warmup_asset.exists():
            rel = f"assets/visuals/hsk{level}/lesson-{number:02d}/ppt-warmup.webp"
            visual_sections.setdefault(warmup["id"], []).insert(0, {
                "id": f"{lesson['id']}-visual-ppt-warmup",
                "src": rel,
                "alt": f"Hình khởi động Bài {number}",
                "caption": "Hình khởi động",
                "sourceType": "ppt",
                "sourceRef": f"PPT Bài {number} - slide {warmup_slide}",
                "assetPolicy": "learner-visual",
            })
            warmup_record = records[warmup_slide - 1]
            answers = standalone_tokens(warmup_record, r"[A-F]")
            if answers and is_image_match_warmup(warmup_record["text"]):
                task_sections[warmup["id"]] = [{
                    "id": f"{lesson['id']}-task-warmup",
                    "type": "image-match",
                    "answers": answers,
                    "sourceRef": f"PPT Bài {number} - Khởi động slide {warmup_slide}",
                }]

        for text_number in (1, 2, 3, 4):
            section = sections.get(f"text{text_number}")
            slide_number = targets.get(f"text{text_number}")
            asset = asset_root / f"lesson-{number:02d}/ppt-text-{text_number}.webp"
            if not section or not slide_number or not asset.exists():
                continue
            rel = f"assets/visuals/hsk{level}/lesson-{number:02d}/ppt-text-{text_number}.webp"
            visual_sections.setdefault(section["id"], []).insert(0, {
                "id": f"{lesson['id']}-visual-ppt-text-{text_number}",
                "src": rel,
                "alt": f"Hình tình huống Bài khóa {text_number} - Bài {number}",
                "caption": f"Hình tình huống Bài khóa {text_number}",
                "sourceType": "ppt",
                "sourceRef": f"PPT Bài {number} - slide {slide_number}",
                "assetPolicy": "learner-visual",
            })

        activity = sections.get("activity")
        activity_slide = targets.get("activity")
        activity_asset = asset_root / f"lesson-{number:02d}/ppt-activity.webp"
        if activity and activity_slide and activity_asset.exists():
            rel = f"assets/visuals/hsk{level}/lesson-{number:02d}/ppt-activity.webp"
            visual_sections.setdefault(activity["id"], []).insert(0, {
                "id": f"{lesson['id']}-visual-ppt-activity",
                "src": rel,
                "alt": f"Hình hoạt động trên lớp - Bài {number}",
                "caption": "Hình hoạt động trên lớp",
                "sourceType": "ppt",
                "sourceRef": f"PPT Bài {number} - slide {activity_slide}",
                "assetPolicy": "learner-visual",
            })

        for text_number in (1, 2, 3, 4):
            section = sections.get(f"text{text_number}")
            intro_slide = targets.get(f"text{text_number}")
            if not section or not intro_slide or intro_slide >= len(records):
                continue
            question_slide = intro_slide + 1
            answers = standalone_tokens(records[question_slide - 1], r"[ABC√×]")
            if not answers:
                continue
            task_type = "listening-tf" if all(answer in {"√", "×"} for answer in answers) else "listening-mcq"
            task_sections.setdefault(section["id"], []).append({
                "id": f"{lesson['id']}-task-listen-{text_number:02d}",
                "type": task_type,
                "answers": answers,
                "audioRef": f"{number}-{text_number * 2 - 1}",
                "sourceRef": f"PPT Bài {number} - đáp án nghe slide {question_slide}",
            })

        visual_manifest["lessons"][lesson["id"]] = {"sections": visual_sections}
        task_manifest["lessons"][lesson["id"]] = {"sections": task_sections}
        print(f"lesson {number:02d}: {sum(map(len, visual_sections.values()))} visual refs, {sum(map(len, task_sections.values()))} tasks")

    source_dir.mkdir(parents=True, exist_ok=True)
    (source_dir / "visual-manifest.json").write_text(json.dumps(visual_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (source_dir / "source-task-manifest.json").write_text(json.dumps(task_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("wrote manifests")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

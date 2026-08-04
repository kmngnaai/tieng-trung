#!/usr/bin/env python3
"""Import and normalize New 3.0 textbook MP3 files into the static app tree."""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
from pathlib import Path
from zipfile import ZipFile

TRACK_RE = re.compile(r"(?<!\d)(\d+)-(\d+)(?:\s|@|\.mp3)", re.I)
EXPECTED = {
    1: {lesson: list(range(1, 8 if lesson <= 3 else 7)) for lesson in range(1, 16)},
    2: {lesson: list(range(1, 9)) for lesson in range(1, 16)},
    3: {lesson: list(range(1, 9)) for lesson in range(1, 19)},
}


def probe_duration(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        text=True,
        capture_output=True,
        check=True,
    )
    return float(result.stdout.strip())


def import_zip(zip_path: Path, level: int, destination: Path, repo: Path) -> list[dict]:
    imported: list[dict] = []
    seen: set[tuple[int, int]] = set()
    with ZipFile(zip_path) as archive:
        for member in archive.infolist():
            if member.is_dir() or not member.filename.lower().endswith(".mp3"):
                continue
            match = TRACK_RE.search(Path(member.filename).name)
            if not match:
                continue
            lesson, track = int(match.group(1)), int(match.group(2))
            key = (lesson, track)
            if key in seen:
                raise RuntimeError(f"Duplicate HSK {level} audio {lesson}-{track}: {member.filename}")
            seen.add(key)
            target_dir = destination / f"hsk{level}" / f"lesson-{lesson:02d}"
            target_dir.mkdir(parents=True, exist_ok=True)
            target = target_dir / f"{lesson}-{track}.mp3"
            with archive.open(member) as source, target.open("wb") as output:
                shutil.copyfileobj(source, output)
            imported.append({"level": level, "lesson": lesson, "track": track, "source": member.filename, "path": target.relative_to(repo).as_posix()})
    return imported


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--hsk1", type=Path, required=True)
    parser.add_argument("--hsk2", type=Path, required=True)
    parser.add_argument("--hsk3", type=Path, required=True)
    args = parser.parse_args()
    repo = args.repo.resolve()
    destination = repo / "modules/new-hsk-course/assets/audio"
    destination.mkdir(parents=True, exist_ok=True)

    imported: list[dict] = []
    for level, archive in ((1, args.hsk1), (2, args.hsk2), (3, args.hsk3)):
        imported.extend(import_zip(archive.resolve(), level, destination, repo))

    indexed = {(row["level"], row["lesson"], row["track"]): row for row in imported}
    missing: list[dict] = []
    unexpected: list[dict] = []
    for level, lessons in EXPECTED.items():
        for lesson, tracks in lessons.items():
            for track in tracks:
                if (level, lesson, track) not in indexed:
                    missing.append({"level": level, "lesson": lesson, "track": track})
    for key, row in indexed.items():
        level, lesson, track = key
        if lesson not in EXPECTED.get(level, {}) or track not in EXPECTED[level][lesson]:
            unexpected.append(row)

    invalid: list[dict] = []
    total_seconds = 0.0
    for row in imported:
        path = repo / row["path"]
        try:
            duration = probe_duration(path)
            row["durationSeconds"] = round(duration, 3)
            total_seconds += duration
            if duration <= 0:
                invalid.append({**row, "reason": "non-positive duration"})
        except Exception as exc:
            invalid.append({**row, "reason": str(exc)})

    report = {
        "schemaVersion": 1,
        "audioRoot": "modules/new-hsk-course/assets/audio",
        "importedCount": len(imported),
        "levels": {
            str(level): {
                "lessonCount": len(EXPECTED[level]),
                "trackCount": sum(len(tracks) for tracks in EXPECTED[level].values()),
            }
            for level in EXPECTED
        },
        "totalDurationSeconds": round(total_seconds, 3),
        "missing": missing,
        "unexpected": unexpected,
        "invalid": invalid,
        "files": imported,
    }
    report_path = repo / "modules/new-hsk-course/data/audio-audit.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: report[k] for k in ["importedCount", "levels", "totalDurationSeconds", "missing", "unexpected", "invalid"]}, ensure_ascii=False, indent=2))
    return 1 if missing or invalid else 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Export the committed lookup lexicon for offline study or Anki import.

No external data is fetched. The export is derived only from search-index.json so it
stays aligned with the app's current local lookup inventory.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SEARCH = ROOT / "modules/hanzi-stroke/data/learning/unified-lookup/all-sources/search-index.json"


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def stable_id(target: str) -> str:
    digest = hashlib.sha1(target.encode("utf-8")).hexdigest()[:16]
    return f"tt-{digest}"


def export_rows(payload: dict[str, Any]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for item in payload.get("items", []):
        target = str(item.get("target") or "").strip()
        if not target:
            continue
        aliases = [str(value).strip() for value in item.get("aliases", []) if str(value).strip()]
        levels = [str(value) for value in item.get("levels", [])]
        libraries = [str(value) for value in item.get("libraries", [])]
        rows.append({
            "id": stable_id(target),
            "hanzi": target,
            "traditional": str(item.get("traditional") or "").strip(),
            "pinyin": str(item.get("pinyin") or "").strip(),
            "meaningVi": str(item.get("meaningVi") or "").strip(),
            "aliases": " | ".join(aliases),
            "levels": " | ".join(levels),
            "libraries": " | ".join(libraries),
            "tags": " ".join([*(f"library::{value}" for value in libraries), *(f"level::{value}" for value in levels)]),
        })
    return rows


def write_delimited(path: Path, rows: Iterable[dict[str, str]], delimiter: str, fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, delimiter=delimiter, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def write_jsonl(path: Path, rows: Iterable[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--search-index", type=Path, default=DEFAULT_SEARCH)
    parser.add_argument("--format", choices=("csv", "jsonl", "anki-tsv"), default="anki-tsv")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    rows = export_rows(read_json(args.search_index))
    suffix = {"csv": ".csv", "jsonl": ".jsonl", "anki-tsv": ".tsv"}[args.format]
    output = args.output or (ROOT / "exports" / f"lookup-lexicon{suffix}")

    if args.format == "jsonl":
        write_jsonl(output, rows)
    elif args.format == "anki-tsv":
        write_delimited(output, rows, "\t", ["id", "hanzi", "traditional", "pinyin", "meaningVi", "tags"])
    else:
        write_delimited(output, rows, ",", ["id", "hanzi", "traditional", "pinyin", "meaningVi", "aliases", "levels", "libraries", "tags"])

    print(f"Wrote {output}: {len(rows)} rows ({args.format})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

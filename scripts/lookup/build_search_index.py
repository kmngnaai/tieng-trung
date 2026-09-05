#!/usr/bin/env python3
"""Rebuild the lightweight lookup search projection from committed unified records.

The full historical unified-record builder depends on source workspaces that are not all
committed. This projection deliberately does not rebuild records; it derives searchable
fields from the committed unified target index + record buckets, making search-index.json
reproducible inside this repository.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_BASE = ROOT / "modules/hanzi-stroke/data/learning/unified-lookup/all-sources"


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def compact_aliases(target: str, record: dict[str, Any]) -> list[str]:
    aliases: list[str] = []
    for value in record.get("aliases", []) if isinstance(record.get("aliases"), list) else []:
        alias = str(value or "").strip()
        if alias and alias != target and alias not in aliases:
            aliases.append(alias)
    return aliases


def build_search_index(base: Path) -> dict[str, Any]:
    target_index = read_json(base / "unified-target-index.json").get("targets", {})
    # JSON object order in unified-target-index.json is the committed canonical order.
    # Do not read search-index.json to determine its own output order.
    ordered_targets = list(target_index)

    buckets: dict[str, dict[str, Any]] = {}
    items: list[dict[str, Any]] = []
    missing: list[str] = []
    for target in ordered_targets:
        bucket = str(target_index[target])
        if bucket not in buckets:
            buckets[bucket] = read_json(base / "records" / f"{bucket}.json").get("records", {})
        record = buckets[bucket].get(target)
        if not isinstance(record, dict):
            missing.append(target)
            continue
        traditional = str(record.get("traditional") or "").strip()
        row = {
            "target": target,
            "bucket": bucket,
            "type": str(record.get("targetType") or ""),
            "pinyin": str(record.get("pinyin") or ""),
            "meaningVi": str(record.get("meaningShortVi") or record.get("meaningFullVi") or ""),
            "levels": record.get("levels", []) if isinstance(record.get("levels"), list) else [],
            "libraries": record.get("libraries", []) if isinstance(record.get("libraries"), list) else [],
            "dataTier": str(record.get("dataTier") or ""),
        }
        if traditional and traditional != target:
            row["traditional"] = traditional
        aliases = compact_aliases(target, record)
        if aliases:
            row["aliases"] = aliases
        items.append(row)

    if missing:
        preview = ", ".join(missing[:10])
        raise RuntimeError(f"{len(missing)} targets missing from record buckets: {preview}")

    return {
        "schemaVersion": "unified-search-v2",
        "source": {
            "targetIndex": "unified-target-index.json",
            "recordBuckets": "records/*.json",
            "rule": "projection-only; does not mutate unified records",
        },
        "items": items,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", type=Path, default=DEFAULT_BASE)
    parser.add_argument("--check", action="store_true", help="fail if generated output differs from committed search-index.json")
    args = parser.parse_args()
    output = args.base / "search-index.json"
    payload = build_search_index(args.base)
    rendered = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if args.check:
        current = output.read_text(encoding="utf-8") if output.exists() else ""
        expected = rendered
        if current != expected:
            print("search-index.json is stale; run scripts/lookup/build_search_index.py")
            return 1
        print(f"PASS search-index projection: {len(payload['items'])} items")
        return 0
    output.write_text(rendered, encoding="utf-8")
    print(f"Wrote {output.relative_to(ROOT)}: {len(payload['items'])} items")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

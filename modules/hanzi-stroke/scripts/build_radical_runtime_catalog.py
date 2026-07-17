from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "learning" / "radicals"
SOURCE = DATA_DIR / "radical_learning_notes.json"
CATALOG = DATA_DIR / "radical_catalog.json"
DETAIL_DIR = DATA_DIR / "details"



def make_catalog_item(note: dict) -> dict:
    short = note.get("shortForCharLookup") or {}
    examples = note.get("examples") or {}
    chars_short = examples.get("charsShort") or []
    variants = note.get("variants") or []
    return {
        "id": note.get("id", ""),
        "key": note.get("key", ""),
        "mainForm": note.get("mainForm", ""),
        "sideForm": note.get("sideForm", ""),
        "variants": variants,
        "displayNameVi": note.get("displayNameVi", ""),
        "pinyin": note.get("pinyin", ""),
        "hanViet": note.get("hanViet", ""),
        "kangxiNo": note.get("kangxiNo"),
        "strokeCount": note.get("strokeCount"),
        "shortForCharLookup": short,
        "examples": {"charsShort": chars_short[:5]},
    }


def main() -> None:
    notes = json.loads(SOURCE.read_text(encoding="utf-8-sig"))
    if not isinstance(notes, dict):
        raise TypeError("radical_learning_notes.json must contain an object")

    DETAIL_DIR.mkdir(parents=True, exist_ok=True)
    expected_files: set[str] = set()
    items: list[dict] = []

    for radical_id, raw_note in notes.items():
        if not isinstance(raw_note, dict):
            continue
        note = dict(raw_note)
        note.setdefault("id", radical_id)
        item = make_catalog_item(note)
        if not item["id"]:
            continue
        items.append(item)
        filename = f"{item['id']}.json"
        expected_files.add(filename)
        (DETAIL_DIR / filename).write_text(
            json.dumps(note, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    items.sort(key=lambda row: (row.get("kangxiNo") or 9999, row.get("displayNameVi") or ""))
    payload = {
        "schemaVersion": "radical-runtime-catalog-v1",
        "count": len(items),
        "generatedFrom": SOURCE.name,
        "items": items,
    }
    CATALOG.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )

    for path in DETAIL_DIR.glob("*.json"):
        if path.name not in expected_files:
            path.unlink()

    print(f"Wrote {CATALOG.relative_to(ROOT)} with {len(items)} radicals")
    print(f"Wrote {len(expected_files)} detail files to {DETAIL_DIR.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

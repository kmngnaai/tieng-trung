import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "dictionary.json"
OUT_DIR = ROOT / "data" / "chars"
INDEX_FILE = ROOT / "data" / "char-index.json"

WRITE_OVERRIDE = {
    "char": "写",
    "traditional": "寫",
    "pinyin": "xiě",
    "hanViet": "Tả",
    "meaningVi": "viết, chép; dốc hết ra, tháo ra; đúc tượng",
    "meaningEn": "write; draw, sketch; compose",
    "radical": "冖",
    "strokeCount": 5,
    "hsk": 1,
    "relatedWords": [
        {
            "word": "写作",
            "traditional": "寫作",
            "pinyin": "xiězuò",
            "meaningVi": "viết, sáng tác",
            "meaningEn": "writing; to write",
        },
        {
            "word": "写信",
            "traditional": "寫信",
            "pinyin": "xiě xìn",
            "meaningVi": "viết thư",
            "meaningEn": "to write a letter",
        },
        {
            "word": "填写",
            "traditional": "填寫",
            "pinyin": "tiánxiě",
            "meaningVi": "điền vào, khai vào",
            "meaningEn": "to fill in",
        },
        {
            "word": "描写",
            "traditional": "描寫",
            "pinyin": "miáoxiě",
            "meaningVi": "miêu tả, mô tả",
            "meaningEn": "to describe",
        },
    ],
}


def is_han_char(value):
    if not isinstance(value, str) or len(value) != 1:
        return False

    code = ord(value)
    return (
        0x3400 <= code <= 0x4DBF
        or 0x4E00 <= code <= 0x9FFF
        or 0x20000 <= code <= 0x2A6DF
        or 0x2A700 <= code <= 0x2B73F
        or 0x2B740 <= code <= 0x2B81F
        or 0x2B820 <= code <= 0x2CEAF
    )


def compact_text(value):
    if isinstance(value, list):
        return "; ".join(str(item).strip() for item in value if str(item).strip())
    if value is None:
        return ""
    return str(value).strip()


def normalize_pinyin(value):
    return compact_text(value).replace("\u200b", " ").replace("  ", " ").strip()


def title_han_viet(value):
    text = compact_text(value)
    if not text:
        return ""
    return " ".join(part[:1].upper() + part[1:] for part in text.split())


def extract_radical(entry):
    etym = entry.get("etym") if isinstance(entry, dict) else None
    components = etym.get("components") if isinstance(etym, dict) else None
    if not isinstance(components, list):
        return ""

    for component in components:
        if component.get("type") == "meaning" and component.get("char"):
            return component["char"]

    for component in components:
        if component.get("char"):
            return component["char"]

    return ""


def lookup_entry(index, word, traditional=""):
    return index.get(word) or (index.get(traditional) if traditional else None) or {}


def build_related_words(entry, index):
    related = []
    tw = entry.get("tw") if isinstance(entry, dict) else None
    if not isinstance(tw, list):
        return related

    for item in tw[:6]:
        word = compact_text(item.get("word"))
        if not word:
            continue

        traditional = compact_text(item.get("trad"))
        supplement = lookup_entry(index, word, traditional)
        meaning_en = compact_text(supplement.get("en")) or compact_text(item.get("gloss"))

        related.append(
            {
                "word": word,
                "traditional": compact_text(supplement.get("t")) or traditional,
                "pinyin": normalize_pinyin(supplement.get("p")),
                "meaningVi": compact_text(supplement.get("vi")),
                "meaningEn": meaning_en,
            }
        )

    return related


def build_char_payload(entry, index):
    char = entry["s"]
    if char == "写":
        return WRITE_OVERRIDE

    return {
        "char": char,
        "traditional": compact_text(entry.get("t")),
        "pinyin": normalize_pinyin(entry.get("p")),
        "hanViet": title_han_viet(entry.get("sv")),
        "meaningVi": compact_text(entry.get("vi")),
        "meaningEn": compact_text(entry.get("en")),
        "radical": extract_radical(entry),
        "strokeCount": entry.get("strokeCount"),
        "hsk": entry.get("hsk"),
        "relatedWords": build_related_words(entry, index),
    }


def entry_score(entry):
    score = 0
    if entry.get("etym"):
        score += 8
    if isinstance(entry.get("tw"), list):
        score += min(6, len(entry["tw"]))
    if entry.get("hsk"):
        score += 4
    if entry.get("vi"):
        score += 2
    if entry.get("en"):
        score += 2
    return score


def main():
    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old_file in OUT_DIR.glob("*.json"):
        old_file.unlink()

    index = {}
    for entry in data:
        if not isinstance(entry, dict):
            continue
        for key in ("s", "t"):
            value = entry.get(key)
            if value and value not in index:
                index[value] = entry

    best_entries = {}
    for entry in data:
        if not isinstance(entry, dict) or not is_han_char(entry.get("s")):
            continue
        char = entry["s"]
        if char not in best_entries or entry_score(entry) > entry_score(best_entries[char]):
            best_entries[char] = entry

    chars = []
    for entry in best_entries.values():
        payload = build_char_payload(entry, index)
        code = f"{ord(payload['char']):X}"
        (OUT_DIR / f"{code}.json").write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        chars.append({"char": payload["char"], "path": f"chars/{code}.json"})

    INDEX_FILE.write_text(
        json.dumps(chars, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Wrote {len(chars)} character files to {OUT_DIR}")


if __name__ == "__main__":
    main()

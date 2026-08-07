from pathlib import Path
import json, collections

ROOT = Path(__file__).resolve().parents[1]
LEARNING = ROOT / "data/learning"
SOURCE = LEARNING / "character-learning-source.json"
OUTPUT = LEARNING / "radicals/radical-character-index.json"

payload = json.loads(SOURCE.read_text(encoding="utf-8"))
items = payload.get("items", {})
out = collections.defaultdict(list)
for char, row in items.items():
    info = row.get("characterInfo", {}) or {}
    radical = info.get("radical", {}) or {}
    if radical.get("status") not in {"verified", "verified-local", "reviewed"} or not radical.get("radicalId"):
        continue
    out[radical["radicalId"]].append({
        "word": char,
        "pinyin": (row.get("pronunciation") or {}).get("pinyin", ""),
        "meaningVi": (row.get("meanings") or {}).get("shortVi", ""),
        "radicalStatus": "verified-local" if radical.get("status") == "verified" else radical.get("status"),
        "qualityStatus": row.get("qualityStatus") or (row.get("quality") or {}).get("status", ""),
    })
for key in out:
    out[key].sort(key=lambda x: (x["qualityStatus"] != "PASS", x["word"]))
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Wrote {len(out)} radical groups to {OUTPUT}")

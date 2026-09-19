import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/lookup/export_lexicon.py"


def load_module():
    spec = importlib.util.spec_from_file_location("export_lexicon", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_lookup_export_is_deterministic_and_preserves_traditional():
    module = load_module()
    payload = json.loads(module.DEFAULT_SEARCH.read_text(encoding="utf-8"))
    rows = module.export_rows(payload)
    assert len(rows) == len(payload["items"])
    china = next(row for row in rows if row["hanzi"] == "中国")
    assert china["traditional"] == "中國"
    assert module.stable_id("中国") == "tt-101806f57c322fb4"
    assert module.stable_id("中国") != module.stable_id("中國")
    assert china["tags"]

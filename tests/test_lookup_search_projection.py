import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/lookup/build_search_index.py"
BASE = ROOT / "modules/hanzi-stroke/data/learning/unified-lookup/all-sources"


def load_module():
    spec = importlib.util.spec_from_file_location("build_search_index", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_search_projection_contains_traditional_aliases_and_is_complete():
    module = load_module()
    payload = module.build_search_index(BASE)
    target_index = json.loads((BASE / "unified-target-index.json").read_text(encoding="utf-8"))["targets"]
    assert payload["schemaVersion"] == "unified-search-v2"
    assert len(payload["items"]) == len(target_index)
    assert [row["target"] for row in payload["items"]] == list(target_index)
    assert any(row.get("traditional") and row["traditional"] != row["target"] for row in payload["items"])
    assert all(isinstance(row.get("aliases", []), list) for row in payload["items"])
    assert all("dataTier" in row for row in payload["items"])

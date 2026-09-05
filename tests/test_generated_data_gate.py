import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/verify_generated_data.py"


def load_module():
    spec = importlib.util.spec_from_file_location("verify_generated_data", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_generated_data_gate_is_clean():
    module = load_module()
    assert module.verify() == []

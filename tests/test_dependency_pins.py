from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = [ROOT / "app.js", ROOT / "modules/lookup/app.js", ROOT / "modules/hanzi-stroke/app.js"]
PIN = "hanzi-writer-data@2.0.1/"


def test_hanzi_writer_data_is_pinned():
    for path in FILES:
        text = path.read_text(encoding="utf-8")
        assert "hanzi-writer-data@latest/" not in text, path
        assert PIN in text, path

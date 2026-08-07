import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "modules/new-hsk-course/data"
SCRIPT = ROOT / "scripts/new-hsk-course/improve_ordering_tokens.py"


def load_module():
    spec = importlib.util.spec_from_file_location("improve_ordering_tokens", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class NewHskBuilderIdempotencyContractTests(unittest.TestCase):
    def test_reviewed_tokens_and_source_stats_match_committed_contract(self):
        mod = load_module()
        lesson_paths = []
        for level, count in ((1, 15), (2, 15), (3, 18)):
            lesson_paths.extend(DATA / f"hsk{level}" / f"lesson-{number:02d}.json" for number in range(1, count + 1))
        lexicon = mod.build_lexicon(ROOT, lesson_paths)

        reviewed_count = 0
        hsk2_reviewed_count = 0
        for level, count in ((1, 15), (2, 15), (3, 18)):
            has_source_manifests = any(
                (ROOT / f"modules/new-hsk-course/source/hsk{level}" / name).exists()
                for name in ("visual-manifest.json", "source-task-manifest.json", "display-manifest.json")
            )
            for number in range(1, count + 1):
                data = json.loads((DATA / f"hsk{level}" / f"lesson-{number:02d}.json").read_text(encoding="utf-8"))
                stats = data.get("stats", {})
                source_keys = {"sourceVisuals", "visibleSourceVisuals", "sourceTasks"}
                self.assertEqual(source_keys.issubset(stats), has_source_manifests)
                for dialogue in data.get("entities", {}).get("dialogues", []):
                    for turn in dialogue.get("turns", []):
                        reviewed = turn.get("orderingTokens")
                        if reviewed is None:
                            continue
                        tokens = mod.tokenize(turn.get("hanzi", ""), lexicon)
                        self.assertEqual(reviewed, tokens)
                        self.assertEqual("".join(reviewed), mod.normalize_sentence(turn.get("hanzi", "")))
                        reviewed_count += 1
                        if level == 2:
                            hsk2_reviewed_count += 1

        self.assertEqual(reviewed_count, 583)
        self.assertEqual(hsk2_reviewed_count, 0)


if __name__ == "__main__":
    unittest.main()

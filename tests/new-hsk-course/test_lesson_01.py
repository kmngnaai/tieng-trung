from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


validator = load_module("new_hsk_validator", ROOT / "scripts/new-hsk-course/validate_course_data.py")


class NewHskLesson01Test(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runtime = ROOT / "modules/new-hsk-course/data/hsk1/lesson-01.json"
        cls.saved = json.loads(cls.runtime.read_text(encoding="utf-8"))

    def test_current_runtime_contract_and_source_counts(self):
        stats = self.saved["stats"]
        expected = {
            "objectives": 2,
            "lessonTexts": 3,
            "vocabulary": 12,
            "properNouns": 1,
            "dialogues": 3,
            "dialogueTurns": 10,
            "passages": 1,
            "extensions": 1,
            "contentSections": 6,
            "radicalSortItems": 11,
            "characterBuildExercises": 5,
            "sourceVisuals": 5,
            "visibleSourceVisuals": 3,
        }
        for key, value in expected.items():
            self.assertEqual(stats[key], value, key)

    def test_book_flow_references_content_sections_and_grouped_view_uses_ids(self):
        entities = self.saved["entities"]
        section_ids = {row["id"] for row in entities["contentSections"]}
        self.assertEqual(self.saved["views"]["bookFlow"], [row["id"] for row in entities["contentSections"]])
        self.assertTrue(set(self.saved["views"]["bookFlow"]).issubset(section_ids))
        grouped = self.saved["views"]["groupedIndex"]
        self.assertTrue(all(isinstance(ref, str) for refs in grouped.values() for ref in refs))
        self.assertNotIn("hanzi", grouped)

    def test_dialogue_turns_keep_three_speaker_names_and_three_text_layers(self):
        for dialogue in self.saved["entities"]["dialogues"]:
            for turn in dialogue["turns"]:
                for key in ("hanzi", "pinyin", "vi"):
                    self.assertTrue(turn["speaker"][key])
                    self.assertTrue(turn[key])
                self.assertTrue(turn["answerTokens"])

    def test_audio_refs_and_source_visuals_are_preserved(self):
        lesson_texts = self.saved["entities"]["lessonTexts"]
        self.assertEqual([item["instruction"]["audioRef"] for item in lesson_texts], ["1-1", "1-3", "1-5"])
        self.assertEqual([item["vocabularyAudioRef"] for item in lesson_texts], ["1-2", "1-4", "1-6"])
        visuals = [visual for section in self.saved["entities"]["contentSections"] for visual in section.get("sourceVisuals", [])]
        self.assertEqual(len(visuals), 5)
        self.assertEqual(sum(visual.get("displayInLesson") is True for visual in visuals), 3)
        self.assertTrue(all(visual.get("sourceRef") for visual in visuals))

    def test_vocab_notes_follow_current_markdown_source(self):
        by_word = {item["hanzi"]: item for item in self.saved["entities"]["vocabulary"]}
        self.assertIn("danh từ chỉ người", by_word["学生"]["note"])
        self.assertIn("đại từ", by_word["们"]["note"])

    def test_validator_passes_current_runtime_contract(self):
        report = validator.validate(self.saved)
        self.assertEqual(report["status"], "passed")
        self.assertEqual(report["stats"]["dialogueTurns"], 10)
        self.assertEqual(report["stats"]["contentSections"], 6)


if __name__ == "__main__":
    unittest.main()

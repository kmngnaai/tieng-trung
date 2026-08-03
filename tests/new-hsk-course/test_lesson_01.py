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


builder = load_module("new_hsk_builder", ROOT / "scripts/new-hsk-course/build_course_data.py")
validator = load_module("new_hsk_validator", ROOT / "scripts/new-hsk-course/validate_course_data.py")


class NewHskLesson01Test(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.markdown = ROOT / "modules/new-hsk-course/source/hsk1/HSK1_Bai_01.md"
        cls.dialogues = ROOT / "modules/new-hsk-course/source/hsk1/dialogues/HSK1_Bai_01_dialogues.json"
        cls.runtime = ROOT / "modules/new-hsk-course/data/hsk1/lesson-01.json"
        cls.built = builder.build_lesson(cls.markdown, cls.dialogues)
        cls.saved = json.loads(cls.runtime.read_text(encoding="utf-8"))

    def test_rebuild_is_reproducible(self):
        self.assertEqual(self.built, self.saved)

    def test_expected_source_counts(self):
        self.assertEqual(
            self.saved["stats"],
            {
                "objectives": 2,
                "lessonTexts": 3,
                "vocabulary": 12,
                "properNouns": 1,
                "dialogues": 3,
                "dialogueTurns": 10,
                "languageNotes": 2,
                "activities": 4,
                "passages": 1,
                "extensions": 1,
            },
        )

    def test_two_views_reference_one_entity_store(self):
        grouped = self.saved["views"]["groupedIndex"]
        self.assertTrue(all(isinstance(ref, str) for refs in grouped.values() for ref in refs))
        self.assertNotIn("hanzi", grouped)
        self.assertEqual(self.saved["views"]["bookFlow"][0], "objectives")

    def test_dialogue_turns_keep_three_speaker_names_and_three_text_layers(self):
        for dialogue in self.saved["entities"]["dialogues"]:
            for turn in dialogue["turns"]:
                self.assertTrue(turn["speaker"]["hanzi"])
                self.assertTrue(turn["speaker"]["pinyin"])
                self.assertTrue(turn["speaker"]["vi"])
                self.assertTrue(turn["hanzi"])
                self.assertTrue(turn["pinyin"])
                self.assertTrue(turn["vi"])
                self.assertTrue(turn["answerTokens"])

    def test_media_and_visual_content_are_preserved(self):
        lesson_texts = self.saved["entities"]["lessonTexts"]
        self.assertEqual([item["instruction"]["audioRef"] for item in lesson_texts], ["1-1", "1-3", "1-5"])
        self.assertEqual([item["vocabularyAudioRef"] for item in lesson_texts], ["1-2", "1-4", "1-6"])
        self.assertTrue(all(item["visualDescription"] for item in lesson_texts))
        extension = self.saved["entities"]["extensions"][0]
        self.assertEqual(extension["videoRef"], "1-1")
        self.assertTrue(extension["prompt"])
        self.assertTrue(extension["visualDescription"])

    def test_vocab_note_is_attached_to_men_not_student(self):
        by_word = {item["hanzi"]: item for item in self.saved["entities"]["vocabulary"]}
        self.assertEqual(by_word["学生"]["note"], "")
        self.assertIn("số nhiều", by_word["们"]["note"])

    def test_validator_passes(self):
        report = validator.validate(self.saved)
        self.assertEqual(report["status"], "passed")
        self.assertEqual(report["stats"]["dialogueTurns"], 10)


if __name__ == "__main__":
    unittest.main()

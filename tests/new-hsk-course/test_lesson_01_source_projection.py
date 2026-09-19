from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / "modules/new-hsk-course/data/hsk1/lesson-01.json"
SOURCE = ROOT / "modules/new-hsk-course/source/hsk1/practice/HSK1_Bai_01_practice.json"
BUILDER = ROOT / "scripts/new-hsk-course/build_all_course_data.py"


class Lesson01SourceProjectionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runtime = json.loads(RUNTIME.read_text(encoding="utf-8"))
        cls.source = json.loads(SOURCE.read_text(encoding="utf-8"))

    def test_curated_entities_project_exactly_from_source(self):
        for key in (
            "exercises",
            "radicalSortExercises",
            "oddOneOutExercises",
            "characterBuildExercises",
        ):
            self.assertEqual(self.runtime["entities"][key], self.source[key], key)

    def test_curated_ids_project_exactly_from_source(self):
        self.assertEqual(
            self.runtime["practicePlan"]["curatedExerciseIds"],
            self.source["practicePlan"]["curatedExerciseIds"],
        )

    def test_curated_contract_counts(self):
        radical = self.runtime["entities"]["radicalSortExercises"]
        self.assertEqual(sum(len(row.get("groups", [])) for row in radical), 6)
        self.assertEqual(sum(len(row.get("items", [])) for row in radical), 11)
        self.assertEqual(sum(len(row.get("rounds", [])) for row in radical), 2)
        self.assertEqual(len(self.runtime["entities"]["characterBuildExercises"]), 5)

    def test_builder_has_no_runtime_self_dependency(self):
        text = BUILDER.read_text(encoding="utf-8")
        self.assertIn("HSK1_Bai_01_practice.json", text)
        self.assertNotIn("existing_lesson1_path", text)
        self.assertNotIn("existing_lesson1 =", text)


if __name__ == "__main__":
    unittest.main()

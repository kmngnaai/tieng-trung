from pathlib import Path
import json
import re
import importlib.util
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
MODULE = ROOT / 'modules' / 'new-hsk-course'
DATA_PATH = MODULE / 'data' / 'hsk1' / 'lesson-01.json'
PRACTICE_PATH = MODULE / 'source' / 'hsk1' / 'practice' / 'HSK1_Bai_01_practice.json'
CATALOG_PATH = ROOT / 'modules' / 'hanzi-stroke' / 'data' / 'learning' / 'radicals' / 'radical_catalog.json'


class NewHskPracticeDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lesson = json.loads(DATA_PATH.read_text(encoding='utf-8'))
        cls.catalog = json.loads(CATALOG_PATH.read_text(encoding='utf-8'))

    def test_current_builder_preserves_curated_practice_overlay_contract(self):
        script_dir = ROOT / 'scripts' / 'new-hsk-course'
        sys.path.insert(0, str(script_dir))
        try:
            spec = importlib.util.spec_from_file_location('new_hsk_build_all', script_dir / 'build_all_course_data.py')
            self.assertIsNotNone(spec)
            self.assertIsNotNone(spec.loader)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            char_index, char_sources = module.load_character_sources(ROOT)
            rebuilt = module.build_lesson(
                ROOT,
                MODULE / 'source' / 'hsk1' / 'HSK1_Bai_01.md',
                MODULE / 'source' / 'hsk1' / 'dialogues' / 'HSK1_Bai_01_dialogues.json',
                char_index,
                char_sources,
                self.lesson,
                set(),
            )
        finally:
            if str(script_dir) in sys.path:
                sys.path.remove(str(script_dir))

        self.assertEqual(rebuilt['entities']['radicalSortExercises'], self.lesson['entities']['radicalSortExercises'])
        self.assertEqual(rebuilt['entities']['characterBuildExercises'], self.lesson['entities']['characterBuildExercises'])
        self.assertEqual(rebuilt['practicePlan']['curatedExerciseIds'], self.lesson['practicePlan']['curatedExerciseIds'])
        self.assertEqual(set(rebuilt['practicePlan']['sourceGroups']), set(self.lesson['practicePlan']['sourceGroups']))

    def test_radical_ids_and_display_forms_exist_in_repo_catalog(self):
        catalog = {item['id']: item for item in self.catalog['items']}
        exercise = self.lesson['entities']['radicalSortExercises'][0]
        for group in exercise['groups']:
            self.assertIn(group['radicalId'], catalog)
            source = catalog[group['radicalId']]
            self.assertEqual(group['mainForm'], source['mainForm'])
            self.assertIn(group['glyph'], {source['mainForm'], source.get('sideForm', '')})
            self.assertEqual(group['nameVi'], source['displayNameVi'])

    def test_each_radical_character_has_one_answer_and_rounds_cover_all(self):
        exercise = self.lesson['entities']['radicalSortExercises'][0]
        groups = {row['id'] for row in exercise['groups']}
        items = {row['id']: row for row in exercise['items']}
        self.assertEqual(len({row['hanzi'] for row in items.values()}), len(items))
        covered = []
        for round_row in exercise['rounds']:
            self.assertTrue(set(round_row['groupIds']).issubset(groups))
            for item_id in round_row['itemIds']:
                self.assertIn(item_id, items)
                self.assertIn(items[item_id]['groupId'], round_row['groupIds'])
                covered.append(item_id)
        self.assertEqual(set(covered), set(items))
        self.assertEqual(len(covered), len(set(covered)))

    def test_practice_plan_reviews_all_required_content_types(self):
        plan = self.lesson['practicePlan']
        self.assertEqual(plan['version'], 2)
        groups = plan['sourceGroups']
        self.assertEqual(set(groups), {'vocabulary', 'supplementalVocabulary', 'properNouns', 'sentences', 'dialogues', 'passages', 'grammar'})
        self.assertEqual(len(groups['vocabulary']['ids']), 12)
        self.assertEqual(groups['supplementalVocabulary']['ids'], [])
        self.assertEqual(len(groups['sentences']['ids']), 10)
        self.assertEqual(len(groups['dialogues']['ids']), 3)
        self.assertEqual(len(groups['passages']['ids']), 1)
        self.assertTrue(groups['grammar']['ids'])
        self.assertEqual(len(plan['activities']), 10)
        self.assertTrue(plan['curatedExerciseIds']['radicalSort'])
        self.assertEqual(len(plan['characters']['coreCharacterIds']), 5)

    def test_character_data_separates_radical_components_and_writing(self):
        chars = self.lesson['entities']['characters']
        by_id = {row['id']: row for row in chars}
        plan = self.lesson['practicePlan']['characters']

        expected_official = []
        for vocab in self.lesson['entities']['vocabulary']:
            for glyph in re.findall(r'[\u3400-\u9fff]', vocab['hanzi']):
                if glyph not in expected_official:
                    expected_official.append(glyph)
        actual_official = [by_id[row_id]['hanzi'] for row_id in plan['officialCharacterIds']]
        self.assertEqual(actual_official, expected_official)
        self.assertEqual(plan['lessonNewWordCharacterIds'], plan['officialCharacterIds'])
        self.assertTrue(set(plan['coreCharacterIds']).issubset(set(plan['officialCharacterIds'])))
        self.assertTrue(set(plan['officialCharacterIds']).isdisjoint(set(plan['exposureCharacterIds'])))
        self.assertEqual(set(by_id), set(plan['officialCharacterIds']) | set(plan['exposureCharacterIds']))

        # Deep component/radical exercises stay on source-backed lesson new-word chars.
        for row_id in plan['coreCharacterIds']:
            char = by_id[row_id]
            self.assertTrue(char['sourceRefs']['vocabularyIds'])
            self.assertTrue(char['dictionaryRadical']['radicalId'])
            self.assertTrue(char['components'])
        builds = self.lesson['entities']['characterBuildExercises']
        self.assertEqual(len(builds), 5)
        for exercise in builds:
            self.assertTrue(set(exercise['answerComponents']).issubset(set(exercise['componentChoices'])))


if __name__ == '__main__':
    unittest.main()

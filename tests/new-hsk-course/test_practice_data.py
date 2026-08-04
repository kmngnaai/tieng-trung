from pathlib import Path
import json
import subprocess
import tempfile
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

    def test_practice_overlay_rebuilds_runtime_json_exactly(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'lesson.json'
            subprocess.run([
                'python', str(ROOT / 'scripts' / 'new-hsk-course' / 'build_course_data.py'),
                '--markdown', str(MODULE / 'source' / 'hsk1' / 'HSK1_Bai_01.md'),
                '--dialogues', str(MODULE / 'source' / 'hsk1' / 'dialogues' / 'HSK1_Bai_01_dialogues.json'),
                '--practice', str(PRACTICE_PATH),
                '--output', str(output),
            ], check=True, capture_output=True, text=True)
            self.assertEqual(json.loads(output.read_text(encoding='utf-8')), self.lesson)

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
        self.assertEqual(set(groups), {'vocabulary', 'properNouns', 'sentences', 'dialogues', 'passages', 'grammar'})
        self.assertEqual(len(groups['vocabulary']['ids']), 12)
        self.assertEqual(len(groups['sentences']['ids']), 10)
        self.assertEqual(len(groups['dialogues']['ids']), 3)
        self.assertEqual(len(groups['passages']['ids']), 1)
        self.assertTrue(groups['grammar']['ids'])
        self.assertEqual(len(plan['activities']), 10)
        self.assertTrue(plan['curatedExerciseIds']['radicalSort'])
        self.assertEqual(len(plan['characters']['coreCharacterIds']), 5)

    def test_character_data_separates_radical_components_and_writing(self):
        chars = self.lesson['entities']['characters']
        self.assertEqual(len(chars), 11)
        for char in chars:
            self.assertTrue(char['dictionaryRadical']['radicalId'])
            self.assertTrue(char['components'])
            self.assertGreater(char['strokes']['count'], 0)
        builds = self.lesson['entities']['characterBuildExercises']
        self.assertEqual(len(builds), 5)
        for exercise in builds:
            self.assertTrue(set(exercise['answerComponents']).issubset(set(exercise['componentChoices'])))


if __name__ == '__main__':
    unittest.main()

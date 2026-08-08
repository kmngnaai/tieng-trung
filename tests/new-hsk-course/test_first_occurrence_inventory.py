from pathlib import Path
import json
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
MODULE = ROOT / 'modules' / 'new-hsk-course'
DATA = MODULE / 'data'


class NewHskFirstOccurrenceInventoryTests(unittest.TestCase):
    def load_lesson(self, level, lesson):
        return json.loads((DATA / f'hsk{level}' / f'lesson-{lesson:02d}.json').read_text(encoding='utf-8'))

    def test_source_lexical_omissions_are_present_and_names_stay_separate(self):
        expected = {
            (1, 5): {'vocabulary': {'做'}},
            (1, 6): {'properNouns': {'西安饭店'}},
            (1, 8): {'properNouns': {'胡医生'}},
            (1, 9): {'vocabulary': {'和'}},
            (1, 14): {'vocabulary': {'写'}},
            (2, 5): {'vocabulary': {'面'}},
            (2, 15): {'properNouns': {'颐和园'}},
            (3, 9): {'vocabulary': {'回'}},
            (3, 11): {'properNouns': {'老张'}},
            (3, 14): {'vocabulary': {'最后', '留学生'}},
            (3, 18): {'vocabulary': {'出生', '过去', '懂得', '坚持', '完成', '目标', '发展'}},
        }
        for (level, lesson), groups in expected.items():
            data = self.load_lesson(level, lesson)
            for group, terms in groups.items():
                actual = {row['hanzi'] for row in data['entities'][group]}
                self.assertTrue(terms.issubset(actual), (level, lesson, group, terms - actual))

    def test_every_lesson_has_distinct_official_core_and_seen_character_scopes(self):
        for level, count in ((1, 15), (2, 15), (3, 18)):
            for lesson in range(1, count + 1):
                data = self.load_lesson(level, lesson)
                chars = {row['id']: row for row in data['entities']['characters']}
                plan = data['practicePlan']['characters']
                expected_glyphs = []
                for vocab in data['entities']['vocabulary']:
                    for glyph in re.findall(r'[\u3400-\u9fff]', vocab['hanzi']):
                        if glyph not in expected_glyphs:
                            expected_glyphs.append(glyph)
                actual_glyphs = [chars[row_id]['hanzi'] for row_id in plan['officialCharacterIds']]
                self.assertEqual(actual_glyphs, expected_glyphs, (level, lesson))
                self.assertEqual(plan['lessonNewWordCharacterIds'], plan['officialCharacterIds'])
                self.assertTrue(set(plan['coreCharacterIds']).issubset(set(plan['officialCharacterIds'])), (level, lesson))
                self.assertTrue(set(plan['officialCharacterIds']).isdisjoint(set(plan['exposureCharacterIds'])), (level, lesson))
                self.assertEqual(set(chars), set(plan['officialCharacterIds']) | set(plan['exposureCharacterIds']), (level, lesson))

    def test_hsk3_summary_examples_are_source_backed(self):
        resolved = []
        blanks = []
        for lesson in range(1, 19):
            data = self.load_lesson(3, lesson)
            for section in data['entities']['contentSections']:
                for item in (section.get('summaryDisplay') or {}).get('items', []):
                    if not str(item.get('example', '')).strip():
                        blanks.append((lesson, item.get('content')))
                    if item.get('exampleSource') == 'grammar-source':
                        resolved.append(item)
        self.assertEqual(blanks, [])
        self.assertEqual(len(resolved), 41)
        self.assertTrue(all(row.get('sourceGrammarLesson') for row in resolved))
        self.assertTrue(all(row.get('sourceGrammarTitle') for row in resolved))

    def test_first_occurrence_distinguishes_reference_newword_grammar_name_and_exposure(self):
        payload = json.loads((DATA / 'first-occurrence.json').read_text(encoding='utf-8'))
        self.assertEqual(payload['stats']['officialReferenceTerms'], 1000)
        terms = {row['hanzi']: row for row in payload['terms']}
        self.assertTrue(terms['留学生']['isOfficialLevelVocabulary'])
        self.assertTrue(terms['留学生']['isLessonNewWord'])
        self.assertFalse(terms['目标']['isOfficialLevelVocabulary'])
        self.assertTrue(terms['目标']['isLessonNewWord'])
        self.assertTrue(terms['关于']['isGrammarTarget'])
        self.assertTrue(terms['老张']['isProperNoun'])
        self.assertFalse(terms['老张']['isLessonNewWord'])
        self.assertEqual((terms['和']['firstSeenLevel'], terms['和']['firstSeenLesson']), (1, 1))
        self.assertTrue(terms['和']['isLessonNewWord'])

        chars = {row['hanzi']: row for row in payload['characters']}
        self.assertIn('关', chars)
        self.assertTrue(chars['关']['isInGrammarTarget'])
        self.assertIn('张', chars)
        self.assertTrue(chars['张']['isInProperNoun'])


if __name__ == '__main__':
    unittest.main()

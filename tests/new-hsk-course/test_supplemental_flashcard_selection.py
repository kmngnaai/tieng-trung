from pathlib import Path
import json
import unittest

ROOT = Path(__file__).resolve().parents[2]
MODULE = ROOT / 'modules' / 'new-hsk-course'
DATA = MODULE / 'data'
APP = MODULE / 'app.js'
CSS = MODULE / 'style.css'


class SupplementalFlashcardSelectionTests(unittest.TestCase):
    def lesson(self, level, lesson):
        return json.loads((DATA / f'hsk{level}' / f'lesson-{lesson:02d}.json').read_text(encoding='utf-8'))

    def test_explicit_first_exposure_terms_are_supplemental_not_shengci(self):
        cases = {
            (1, 6): {'七'},
            (1, 7): {'零'},
            (1, 9): {'前边儿', '玩儿'},
            (2, 6): {'画画', '过生日', '很舒服', '打开礼物'},
            (3, 1): {'行李箱', '接人'},
            (3, 11): {'会议室', '笔记本电脑', '发邮件'},
            (3, 12): {'雨伞'},
            (3, 17): {'批评'},
            (3, 18): {'包饺子', '给红包', '吃年夜饭', '打扫房子', '看春节联欢晚会'},
        }
        for (level, lesson_no), expected in cases.items():
            lesson = self.lesson(level, lesson_no)
            vocab = {row['hanzi'] for row in lesson['entities']['vocabulary']}
            supplemental = {row['hanzi']: row for row in lesson['entities']['supplementalVocabulary']}
            self.assertTrue(expected.issubset(set(supplemental)), (level, lesson_no, expected - set(supplemental)))
            self.assertTrue(expected.isdisjoint(vocab), (level, lesson_no, expected & vocab))
            for term in expected:
                row = supplemental[term]
                self.assertEqual(row['classification'], 'supplemental-vocabulary')
                self.assertIn(row['sourceKind'], {'warmup', 'lesson-text', 'grammar', 'passage', 'exercise', 'activity'})
                self.assertFalse(row['isLessonNewWord'])
                self.assertTrue(row['flashcardEligible'])
                self.assertTrue(row['pinyin'])
                self.assertTrue(row['vi'])

    def test_terms_already_learned_are_not_relabelled_as_supplemental(self):
        # These appear again in later warm-ups, but were already taught earlier
        # in the textbook sequence and therefore are not "từ xuất hiện mới".
        lesson = self.lesson(3, 17)
        supplemental = {row['hanzi'] for row in lesson['entities']['supplementalVocabulary']}
        self.assertNotIn('紧张', supplemental)
        self.assertNotIn('选择', supplemental)

        lesson = self.lesson(3, 10)
        supplemental = {row['hanzi'] for row in lesson['entities']['supplementalVocabulary']}
        self.assertNotIn('考试', supplemental)
        self.assertNotIn('成绩', supplemental)

    def test_practice_plan_exposes_supplemental_source_without_merging_vocab(self):
        for level, count in ((1, 15), (2, 15), (3, 18)):
            for lesson_no in range(1, count + 1):
                lesson = self.lesson(level, lesson_no)
                group = lesson['practicePlan']['sourceGroups']['supplementalVocabulary']
                self.assertEqual(group['entityType'], 'supplementalVocabulary')
                self.assertEqual(group['ids'], [row['id'] for row in lesson['entities']['supplementalVocabulary']])
                flash = lesson['practicePlan']['activities']['flashcards']
                self.assertIn('supplementalVocabulary', flash['supportedSources'])
                self.assertIn('supplementalVocabulary', flash['defaultSources'])

    def test_first_occurrence_marks_supplemental_terms_separately(self):
        payload = json.loads((DATA / 'first-occurrence.json').read_text(encoding='utf-8'))
        terms = {row['hanzi']: row for row in payload['terms']}
        self.assertTrue(terms['行李箱']['isSupplementalVocabulary'])
        self.assertFalse(terms['行李箱']['isLessonNewWord'])
        self.assertEqual(terms['行李箱']['firstSeenSourceKind'], 'warmup')
        self.assertTrue(terms['七']['isSupplementalVocabulary'])
        self.assertTrue(any(ref['sourceKind'] == 'lesson-text' for ref in terms['七']['supplementalRefs']))
        self.assertTrue(terms['零']['isSupplementalVocabulary'])
        self.assertEqual(terms['零']['firstSeenSourceKind'], 'grammar')
        self.assertTrue(terms['红茶']['isSupplementalVocabulary'])
        self.assertFalse(terms['红茶']['isLessonNewWord'])

    def test_runtime_has_source_labels_preview_selection_and_character_scopes(self):
        app = APP.read_text(encoding='utf-8')
        css = CSS.read_text(encoding='utf-8')
        for text in ['Từ mới chính thức', 'Từ bổ sung đã gặp', 'Tên riêng', 'Mẫu / cụm ngữ pháp']:
            self.assertIn(text, app)
        for text in ['Chữ trọng tâm', 'Tất cả chữ chính thức', 'Chữ đã gặp']:
            self.assertIn(text, app)
        for token in [
            'renderPracticeItemSelector',
            'data-nhsk-practice-item-toggle',
            'data-nhsk-practice-items-all',
            'data-nhsk-practice-items-none',
            'data-nhsk-practice-preview-toggle',
            'selectedCharacterPracticeEntities',
        ]:
            self.assertIn(token, app)
        self.assertIn('Xem / chỉnh ${items.length} thẻ', app)
        self.assertIn("expanded ? items : []", app)
        self.assertIn('.nhsk-practice-preview-grid', css)
        self.assertIn('.nhsk-practice-preview-item', css)


if __name__ == '__main__':
    unittest.main()

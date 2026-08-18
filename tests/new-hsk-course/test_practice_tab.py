from pathlib import Path
import json
import unittest

ROOT = Path(__file__).resolve().parents[2]
APP = (ROOT / 'modules' / 'new-hsk-course' / 'app.js').read_text(encoding='utf-8')
HTML = (ROOT / 'modules' / 'new-hsk-course' / 'index.html').read_text(encoding='utf-8')
CSS = (ROOT / 'modules' / 'new-hsk-course' / 'style.css').read_text(encoding='utf-8')
DATA = json.loads((ROOT / 'modules' / 'new-hsk-course' / 'data' / 'hsk1' / 'lesson-01.json').read_text(encoding='utf-8'))
SHELL = (ROOT / 'modules' / 'shared' / 'app-shell.js').read_text(encoding='utf-8')
NAV = (ROOT / 'modules' / 'shared' / 'navigation.js').read_text(encoding='utf-8')
HOME = (ROOT / 'index.html').read_text(encoding='utf-8')
LEARN = (ROOT / 'modules' / 'hanzi-stroke' / 'index.html').read_text(encoding='utf-8')


class NewHskPracticeTabTests(unittest.TestCase):
    def test_practice_is_grouped_by_content_to_review(self):
        self.assertIn('data-nhsk-view="practice"', APP)
        for label in ['🎓 Flashcard', 'Nghe', 'Điền từ', 'Nối', 'Sắp xếp câu', 'Gõ câu / đoạn', 'Dịch Trung → Việt', 'Dịch Việt → Trung', 'Hội thoại', 'Cấu tạo & Bộ thủ']:
            self.assertIn(label, APP)
        self.assertEqual(set(DATA['practicePlan']['sourceGroups']), {'vocabulary', 'supplementalVocabulary', 'properNouns', 'sentences', 'dialogues', 'passages', 'grammar'})
        self.assertEqual(len(DATA['practicePlan']['activities']), 10)
        self.assertIn('practiceSourceSelector', APP)
        self.assertIn('data-nhsk-practice-source="all"', APP)

    def test_practice_reuses_shared_engines(self):
        self.assertIn('matching-engine.css', HTML)
        self.assertIn('matching-engine.js', HTML)
        self.assertIn('window.TiengTrungMatching', APP)
        self.assertIn('externalFlashcards', APP)
        self.assertIn("target.searchParams.set('study', 'radicals')", APP)

    def test_radical_sort_has_curated_data_and_drag_touch_controls(self):
        plan = DATA['practicePlan']
        self.assertEqual(plan['defaultActivity'], 'flashcards')
        self.assertEqual(set(plan['sourceGroups']), {'vocabulary', 'supplementalVocabulary', 'properNouns', 'sentences', 'dialogues', 'passages', 'grammar'})
        exercise = DATA['entities']['radicalSortExercises'][0]
        self.assertEqual(exercise['type'], 'radical-sort')
        self.assertEqual(len(exercise['groups']), 6)
        self.assertEqual(len(exercise['items']), 11)
        self.assertEqual(len(exercise['rounds']), 2)
        self.assertIn('draggable="true"', APP)
        self.assertIn('data-radical-item', APP)
        self.assertIn('data-radical-drop', APP)
        self.assertIn("root.addEventListener('drop'", APP)
        self.assertIn("root.addEventListener('pointerdown'", APP)
        self.assertIn('touch-action:none', CSS)

    def test_external_learning_modules_and_sticky_content_filter_are_supported(self):
        listening = (ROOT / 'modules' / 'listening' / 'app.js').read_text(encoding='utf-8')
        hanzi = (ROOT / 'modules' / 'hanzi-stroke' / 'app.js').read_text(encoding='utf-8')
        self.assertIn('tiengTrung.listening.externalPractice.v1', APP)
        self.assertIn('launchExternalPracticeFromStorage', listening)
        self.assertIn("radicalId", hanzi)
        self.assertIn('Quay lại New 3.0', hanzi)
        self.assertIn('position:sticky', CSS)
        self.assertIn('data-nhsk-content', APP)
        self.assertIn('rerenderCurrentContent', APP)

    def test_flashcard_links_to_character_learning_and_preserves_urls(self):
        hanzi = (ROOT / 'modules' / 'hanzi-stroke' / 'app.js').read_text(encoding='utf-8')
        hanzi_css = (ROOT / 'modules' / 'hanzi-stroke' / 'style.css').read_text(encoding='utf-8')
        self.assertIn('structurePracticeUrl', APP)
        self.assertIn('构 Luyện cấu tạo các chữ trong bộ thẻ', hanzi)
        self.assertIn("structureUrl: String(card.structureUrl || '')", hanzi)
        self.assertIn("structurePracticeUrl: String(card.structurePracticeUrl || '')", hanzi)
        self.assertIn('hsk-flashcard-structure-practice', hanzi_css)

    def test_character_scope_from_selected_flashcards_is_supported(self):
        self.assertIn("params.get('chars')", APP)
        self.assertIn('selectedCharacterEntities', APP)
        self.assertIn("target.searchParams.set('characterMode', 'learn')", APP)

    def test_default_dialogue_and_passage_show_all_three_layers(self):
        self.assertIn('dialogueLayers: { hanzi: true, pinyin: true, vi: true }', APP)
        self.assertIn('passageLayers: { hanzi: true, pinyin: true, vi: true }', APP)
        self.assertIn('nhsk-passage-turn', APP)

    def test_flashcard_uses_graduation_cap(self):
        self.assertIn('🎓 Flashcard', APP)
        self.assertIn('nhsk-flashcard-button', CSS)

    def test_display_name_is_new_3_0_everywhere(self):
        for text in [APP, HTML, SHELL, NAV, HOME, LEARN]:
            self.assertIn('New 3.0', text)
        for text in [APP, HTML, SHELL, NAV, HOME, LEARN]:
            self.assertNotIn('New HSK 3.0', text)


if __name__ == '__main__':
    unittest.main()

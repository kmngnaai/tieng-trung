from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
APP = (ROOT / 'modules' / 'new-hsk-course' / 'app.js').read_text(encoding='utf-8')
CSS = (ROOT / 'modules' / 'new-hsk-course' / 'style.css').read_text(encoding='utf-8')


class NewHskContentControlsTests(unittest.TestCase):
    def test_dialogue_languages_are_independent_and_default_to_all(self):
        self.assertIn("dialogueLayers: { hanzi: true, pinyin: true, vi: true }", APP)
        self.assertIn("data-nhsk-layer-scope", APP)
        self.assertIn("['hanzi', '汉', 'Hán ngữ']", APP)
        self.assertIn("['pinyin', '拼', 'Pinyin']", APP)
        self.assertIn("['vi', 'Vi', 'Tiếng Việt']", APP)
        self.assertIn('data-nhsk-layer="${key}"', APP)
        self.assertIn("nhsk-dialogue-turn", APP)
        self.assertNotIn("nhsk-dialogue-layer--hanzi", APP)

    def test_vocabulary_has_separate_controls(self):
        self.assertIn("vocabShowPinyin", APP)
        self.assertIn("vocabViewMode", APP)
        self.assertIn("data-nhsk-vocab-view=\"list\"", APP)
        self.assertIn("data-nhsk-vocab-view=\"grid\"", APP)
        self.assertIn("data-nhsk-open-flashcards", APP)
        self.assertIn("🎓 Flashcard", APP)
        self.assertIn("nhsk-vocab-list--grid", CSS)

    def test_vocabulary_uses_shared_popup_and_source_restore(self):
        self.assertIn("tiengtrung:hsk-popup-open", APP)
        self.assertIn("sourceViewportTop", APP)
        self.assertIn("sourceOccurrence", APP)
        self.assertIn("restoreWordSourcePosition", APP)
        self.assertIn("embedPopup=1", APP)

    def test_selected_language_button_has_raised_border(self):
        self.assertIn(".nhsk-layer-toggle button.is-active", CSS)
        self.assertIn("box-shadow", CSS)


if __name__ == '__main__':
    unittest.main()

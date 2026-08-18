from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
MODULE = ROOT / "modules" / "new-hsk-course"


class NewHskMobileLanguageAudioNavigationTests(unittest.TestCase):
    def test_dialogue_and_passage_default_to_all_three_languages(self):
        js = (MODULE / "app.js").read_text(encoding="utf-8")
        self.assertIn("dialogueLayers: { hanzi: true, pinyin: true, vi: true }", js)
        self.assertIn("passageLayers: { hanzi: true, pinyin: true, vi: true }", js)
        self.assertIn("data-nhsk-layer-scope", js)
        self.assertIn("activeCount === 1", js)
        for key in ("hanzi", "pinyin", "vi"):
            self.assertIn(f"['{key}'", js)

    def test_source_audio_files_and_player_contract(self):
        audio_dir = MODULE / "assets" / "audio" / "hsk1" / "lesson-01"
        expected = [f"1-{number}.mp3" for number in range(1, 8)]
        for name in expected:
            path = audio_dir / name
            self.assertTrue(path.is_file(), name)
            self.assertGreater(path.stat().st_size, 100_000, name)
        js = (MODULE / "app.js").read_text(encoding="utf-8")
        self.assertIn("data-nhsk-audio-ref", js)
        self.assertIn("assets/audio/hsk${state.level}/lesson-${lesson}", js)
        self.assertIn("playTrack", js)

    def test_proper_nouns_have_speaker_button(self):
        js = (MODULE / "app.js").read_text(encoding="utf-8")
        start = js.index("function renderProperNouns")
        end = js.index("function renderNotes", start)
        block = js[start:end]
        self.assertIn("data-nhsk-speak", block)
        self.assertIn("item.hanzi", block)

    def test_new_hsk_is_a_peer_entry_on_home_hub_tabs_and_menu(self):
        home = (ROOT / "index.html").read_text(encoding="utf-8")
        hub = (ROOT / "modules" / "hanzi-stroke" / "index.html").read_text(encoding="utf-8")
        shell = (ROOT / "modules" / "shared" / "app-shell.js").read_text(encoding="utf-8")
        self.assertIn("home-explore-card--new-hsk", home)
        self.assertIn('data-study-tab="new-hsk-course"', hub)
        self.assertIn("ui-module-card--new-hsk", hub)
        self.assertIn("newHskCourse: new URL('modules/new-hsk-course/index.html'", shell)
        self.assertIn("title: lessonNumber ? `New 3.0 · HSK ${level} · Bài ${lessonNumber}` : 'New 3.0'", shell)

    def test_new_hsk_breadcrumb_is_not_nested_under_curriculum(self):
        shell = (ROOT / "modules" / "shared" / "app-shell.js").read_text(encoding="utf-8")
        breadcrumb_start = shell.index("function createDefaultBreadcrumbItems")
        start = shell.index("if (path.includes('/modules/new-hsk-course/'))", breadcrumb_start)
        end = shell.index("if (path.includes('/modules/ldsn14/'))", start)
        block = shell[start:end]
        self.assertIn("New 3.0", block)
        self.assertNotIn("breadcrumbItem('Giáo trình'", block)


if __name__ == "__main__":
    unittest.main()

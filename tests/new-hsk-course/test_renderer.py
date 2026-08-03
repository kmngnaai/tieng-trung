from pathlib import Path
import json
import unittest

ROOT = Path(__file__).resolve().parents[2]
MODULE = ROOT / "modules" / "new-hsk-course"


class RendererPrototypeTests(unittest.TestCase):
    def test_required_web_files_exist(self):
        for name in ("index.html", "app.js", "style.css"):
            self.assertTrue((MODULE / name).is_file(), name)

    def test_html_uses_shared_app_shell(self):
        html = (MODULE / "index.html").read_text(encoding="utf-8")
        self.assertIn('data-ui-shell-context="learn"', html)
        self.assertIn('../shared/app-shell.js', html)
        self.assertIn('../shared/ui-tokens.css', html)

    def test_renderer_uses_manifest_and_one_runtime_json(self):
        js = (MODULE / "app.js").read_text(encoding="utf-8")
        self.assertIn("data/manifest.json", js)
        self.assertIn("views.bookFlow", js)
        self.assertIn("views.groupedIndex", js)
        self.assertNotIn("Lượt 1", js)
        self.assertIn("URLSearchParams", js)

    def test_json_supports_both_renderers(self):
        lesson = json.loads((MODULE / "data" / "hsk1" / "lesson-01.json").read_text(encoding="utf-8"))
        self.assertTrue(lesson["views"]["bookFlow"])
        self.assertTrue(lesson["views"]["groupedIndex"]["dialogues"])
        self.assertEqual(lesson["stats"]["dialogueTurns"], 10)

    def test_app_shell_knows_new_hsk_course(self):
        shell = (ROOT / "modules" / "shared" / "app-shell.js").read_text(encoding="utf-8")
        self.assertIn("newHskCourse", shell)
        self.assertIn("/modules/new-hsk-course/", shell)
        self.assertIn("New HSK 3.0", shell)

    def test_existing_new_hsk_lesson_has_full_course_entry(self):
        app = (ROOT / "modules" / "hanzi-stroke" / "app.js").read_text(encoding="utf-8")
        self.assertIn("renderNewHskCourseLessonEntry", app)
        self.assertIn("Học toàn bộ bài theo sách", app)
        self.assertIn("../new-hsk-course/index.html", app)


if __name__ == "__main__":
    unittest.main()

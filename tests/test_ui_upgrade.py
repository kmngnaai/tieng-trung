from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8-sig")


class UiUpgradeTests(unittest.TestCase):
    def test_main_pages_use_shared_app_shell(self) -> None:
        pages = [
            "index.html",
            "modules/hanzi-stroke/index.html",
            "modules/pinyin/index.html",
            "modules/bo-thu-50/index.html",
            "modules/lookup/index.html",
        ]
        for page in pages:
            with self.subTest(page=page):
                text = read(page)
                self.assertIn("app-shell.css", text)
                self.assertIn("app-shell.js", text)

    def test_mobile_bottom_nav_has_exact_four_items(self) -> None:
        shell = read("modules/shared/app-shell.js")
        block = re.search(r"function createBottomNavigation\(context\).*?return bottom;", shell, re.S)
        self.assertIsNotNone(block)
        labels = re.findall(r"<small>([^<]+)</small>", block.group(0))
        self.assertEqual(labels, ["Trang chủ", "Tra", "Học", "Menu"])

    def test_desktop_hides_bottom_nav(self) -> None:
        css = read("modules/shared/app-shell.css")
        desktop = re.search(r"@media \(min-width: 900px\) \{(.*?)\n\}", css, re.S)
        self.assertIsNotNone(desktop)
        self.assertIn(".ui-bottom-nav { display: none; }", desktop.group(0))
        self.assertIn(".ui-app-header.is-context-home .ui-desktop-nav { display: flex", desktop.group(0))
        self.assertIn(".ui-app-header.is-context-child .ui-mobile-menu-button { display: grid; }", desktop.group(0))

    def test_learning_home_card_order(self) -> None:
        html = read("modules/hanzi-stroke/index.html")
        hub = re.search(r'<div class="ui-module-grid ui-module-grid--learning-home">(.*?)</div>\s*</section>', html, re.S)
        self.assertIsNotNone(hub)
        names = re.findall(r"<strong>(Giáo trình|Bộ thủ|Thẻ|Bút thuận|Pinyin)</strong>", hub.group(1))
        self.assertEqual(names, ["Giáo trình", "Bộ thủ", "Thẻ", "Bút thuận", "Pinyin"])

    def test_curriculum_order_default_and_memory(self) -> None:
        js = read("modules/hanzi-stroke/app.js")
        self.assertIn("['dialogue301', 'hsk', 'new_hsk', 'yct', 'boya']", js)
        self.assertIn("dialogue301: '301'", js)
        self.assertIn("hsk: 'HSK 6 cấp'", js)
        self.assertIn("new_hsk: 'HSK 9 cấp'", js)
        self.assertIn("return window.localStorage.getItem(HSK_CURRICULUM_STORAGE_KEY) || 'dialogue301';", js)
        self.assertIn("saveLastCurriculum(nextSource);", js)

    def test_mascot_is_replaceable_asset(self) -> None:
        asset = ROOT / "assets/brand/mascot.png"
        self.assertTrue(asset.is_file())
        self.assertGreater(asset.stat().st_size, 10_000)
        pinyin = read("modules/pinyin/app.js")
        self.assertGreaterEqual(pinyin.count('../../assets/brand/mascot.png'), 2)
        self.assertNotIn("<span>拼</span>", pinyin)
        self.assertNotIn("data:image", pinyin)
        self.assertIn("replace this file", read("assets/brand/README.md"))

    def test_legacy_radicals_are_reference_only(self) -> None:
        shell = read("modules/shared/app-shell.js")
        self.assertIn("<h3 id=\"uiReferenceTitle\">Tham khảo</h3>", shell)
        self.assertIn("'Bộ thủ 50'", shell)
        legacy = read("modules/bo-thu-50/index.html")
        self.assertIn("Bộ thủ 50 · Tham khảo", legacy)

    def test_301_has_no_slide_or_ppt_source_data(self) -> None:
        forbidden_keys = {"ppt", "slide_count", "slide_source"}
        lesson_dirs = sorted((ROOT / "lessons-301-v2").glob("lesson-*"))
        self.assertEqual(len(lesson_dirs), 40)
        for lesson_dir in lesson_dirs:
            with self.subTest(lesson=lesson_dir.name):
                data = json.loads((lesson_dir / "data.json").read_text(encoding="utf-8-sig"))
                self.assertTrue(forbidden_keys.isdisjoint(data.keys()))
                self.assertNotIn("slides", data.get("media", {}))
                self.assertNotIn("pptx", data.get("sources", {}))
        self.assertFalse((ROOT / "lessons-301-v2/ppt_metadata.json").exists())
        self.assertFalse((ROOT / "scripts/export_301_ppt_slides.ps1").exists())

    def test_301_ui_code_has_no_slide_or_ppt_feature(self) -> None:
        targets = [
            "app.js",
            "style.css",
            "scripts/build_301_structured_data.py",
            "modules/hanzi-stroke/app.js",
        ]
        pattern = re.compile(r"\b(?:slide|slides|ppt|pptx)\b", re.I)
        for target in targets:
            with self.subTest(target=target):
                self.assertIsNone(pattern.search(read(target)))

    def test_301_curriculum_uses_real_lesson_index(self) -> None:
        lessons = json.loads(read("lessons-301-v2/lessons.json"))
        self.assertEqual(len(lessons), 40)
        self.assertEqual(lessons[0]["title"], "1第一课_你好")
        self.assertEqual(lessons[1]["title_zh"], "你身体好吗")
        js = read("modules/hanzi-stroke/app.js")
        self.assertIn("../../lessons-301-v2/lessons.json", js)
        self.assertIn("?lesson=${encodeURIComponent(lesson.lesson_id || '')}#dialogue301", js)

    def test_hsk_labels_are_grounded_in_current_summary(self) -> None:
        summary = json.loads(read("modules/hanzi-stroke/data/learning/hsk/hsk_summary.json"))
        levels = {row["level"]: row for row in summary["levels"]}
        self.assertEqual(levels[1]["statusBySource"]["hsk"]["loadedLessonCount"], 15)
        self.assertEqual(levels[1]["statusBySource"]["hsk"]["grammarTotal"], 46)
        self.assertEqual(levels[5]["statusBySource"]["hsk"]["missingNote"], "35/36 bài")
        self.assertEqual(levels[6]["statusBySource"]["hsk"]["missingNote"], "28/40 bài")
        self.assertEqual(levels[7]["statusBySource"]["new_hsk"]["missingNote"], "129/132 chủ đề")

    def test_pinyin_keeps_five_real_tabs(self) -> None:
        js = read("modules/pinyin/app.js")
        for label in ["Học", "Nghe", "Quiz", "Ôn", "Tiến độ"]:
            self.assertIn(f"'{label}'", js)


    def test_legacy_palettes_map_to_shared_tokens(self) -> None:
        tokens = read("modules/shared/ui-tokens.css")
        self.assertIn("--app-bg: var(--ui-bg);", tokens)
        self.assertIn("--app-accent: var(--ui-accent);", tokens)
        for stylesheet in [
            "modules/hanzi-stroke/style.css",
            "modules/pinyin/style.css",
            "modules/bo-thu-50/style.css",
        ]:
            with self.subTest(stylesheet=stylesheet):
                css = read(stylesheet)
                self.assertIn("var(--ui-bg)", css)
                self.assertIn("var(--ui-accent)", css)

    def test_main_pages_do_not_load_legacy_navigation(self) -> None:
        pages = [
            "index.html",
            "modules/hanzi-stroke/index.html",
            "modules/pinyin/index.html",
            "modules/bo-thu-50/index.html",
        ]
        for page in pages:
            text = read(page)
            self.assertNotIn("navigation.js", text)
            self.assertNotIn("navigation.css", text)

    def test_lookup_c12_is_the_only_global_lookup_route(self) -> None:
        shell = read("modules/shared/app-shell.js")
        self.assertIn("modules/lookup/index.html", shell)
        self.assertNotIn("modules/hanzi-stroke/index.html?study=lookup", shell)
        self.assertIn("modules/hanzi-stroke/index.html?study=writing", shell)

    def test_lookup_module_uses_full_unified_data_and_shared_shell(self) -> None:
        html = read("modules/lookup/index.html")
        js = read("modules/lookup/app.js")
        self.assertIn("app-shell.css", html)
        self.assertIn("app-shell.js", html)
        self.assertIn('data-ui-shell-context="lookup"', html)
        self.assertIn("unified-lookup/all-sources", js)
        self.assertIn("unified-target-index.json", js)
        self.assertIn("search-index.json", js)
        self.assertIn("new URLSearchParams(window.location.search).get('q')", js)
        self.assertLess(js.index("const initialQuery = clean(new URLSearchParams(window.location.search).get('q')"), js.index('initTraHistoryBoundary();'))

    def test_home_lookup_submits_query_to_c12(self) -> None:
        html = read("index.html")
        js = read("app.js")
        self.assertIn('id="homeLookupForm"', html)
        self.assertIn('id="homeLookupInput"', html)
        self.assertIn("modules/lookup/index.html", html)
        self.assertIn("homeLookupForm", js)
        self.assertIn("searchParams.set('q', query)", js)
        self.assertNotIn('data-go="hanziStroke" href="modules/hanzi-stroke/index.html" aria-label="Tra chữ Hán hoặc luyện viết"', html)

    def test_lookup_has_clickable_breadcrumb_and_history_back(self) -> None:
        html = read("modules/lookup/index.html")
        js = read("modules/lookup/app.js")
        self.assertIn('id="lookupBreadcrumb"', html)
        self.assertIn("renderLookupBreadcrumb", js)
        self.assertIn("data-lookup-breadcrumb-target", js)
        self.assertIn("history.back()", js)
        self.assertIn("popstate", js)

    def test_lookup_data_and_compact_pinyin_search_are_grounded(self) -> None:
        target_index = json.loads(read("modules/hanzi-stroke/data/learning/unified-lookup/all-sources/unified-target-index.json"))["targets"]
        search_items = json.loads(read("modules/hanzi-stroke/data/learning/unified-lookup/all-sources/search-index.json"))["items"]
        self.assertGreaterEqual(len(target_index), 21_000)
        self.assertEqual(target_index["你好"], "60")
        hello = next(item for item in search_items if item["target"] == "你好")
        self.assertEqual(hello["pinyin"], "nǐ hǎo")
        js = read("modules/lookup/app.js")
        self.assertIn("normalizePinyinSearch", js)
        self.assertIn("pCompact === qPinyin", js)

    def test_study_route_no_longer_treats_lookup_as_global_tra(self) -> None:
        shell = read("modules/shared/app-shell.js")
        hanzi = read("modules/hanzi-stroke/app.js")
        self.assertNotIn("study === 'lookup') return 'lookup'", shell)
        self.assertNotIn("isGlobalLookup", hanzi)
        self.assertNotIn("Giữ nguyên công cụ tra và nội dung học chữ hiện tại.", hanzi)
        self.assertIn("const word = params.get('word');", hanzi)
        self.assertIn("url.searchParams.set('q', target);", hanzi)



    def test_learning_pages_remove_large_intro_heroes(self) -> None:
        html = read("modules/hanzi-stroke/index.html")
        js = read("modules/hanzi-stroke/app.js")
        self.assertNotIn('class="study-hero', html)
        self.assertNotIn('study-hero-mark', html)
        for removed in [
            "Học theo lộ trình",
            "Nền tảng chữ Hán",
            "Ôn tập chủ động",
        ]:
            self.assertNotIn(removed, html)
            self.assertNotIn(removed, js)
        self.assertNotIn('function updateStudyHero', js)
        self.assertNotIn('radical-card radical-card--intro', html)
        self.assertNotIn('Bộ thủ trong Tra chữ Hán', html)

    def test_learning_hub_keeps_only_compact_choose_content_heading(self) -> None:
        html = read("modules/hanzi-stroke/index.html")
        self.assertIn('<h1 class="ui-learn-hub-title">Chọn nội dung</h1>', html)
        self.assertNotIn('Học theo cách phù hợp', html)

    def test_writing_uses_pen_icon_not_lookup_icon(self) -> None:
        html = read("modules/hanzi-stroke/index.html")
        shell = read("modules/shared/app-shell.js")
        self.assertIn('data-study-tab="lookup"', html)
        writing_tab = re.search(r'<button id="studyTabLookup".*?</button>', html, re.S)
        self.assertIsNotNone(writing_tab)
        self.assertIn('✍', writing_tab.group(0))
        self.assertNotIn('🔎', writing_tab.group(0))
        writing_card = re.search(r'ui-module-card--writing.*?</button>', html, re.S)
        self.assertIsNotNone(writing_card)
        self.assertIn('✍', writing_card.group(0))
        self.assertIn("drawerLink('✍', 'Bút thuận'", shell)

    def test_home_matches_planned_dashboard_and_uses_c12(self) -> None:
        html = read("index.html")
        self.assertIn('class="home-dashboard"', html)
        for label in ["Tra nhanh", "Học tiếp", "Khám phá", "Giáo trình", "Bộ thủ", "Thẻ", "Bút thuận", "Pinyin"]:
            self.assertIn(label, html)
        self.assertIn('action="modules/lookup/index.html"', html)
        self.assertIn('href="modules/lookup/index.html"', html)
        self.assertIn('href="modules/hanzi-stroke/index.html?study=writing"', html)
        self.assertNotIn('<section class="welcome-card">', html)
        self.assertNotIn('<h2>Công cụ học</h2>', html)
        self.assertNotIn('Bộ thủ 50</h3>', html)
        self.assertNotIn('301 Đàm thoại</h3>', html)

    def test_301_program_chip_shows_only_single_301_label(self) -> None:
        js = read("modules/hanzi-stroke/app.js")
        self.assertIn("const detail = key === 'dialogue301' ? ''", js)
        self.assertIn("${detail ? `<small>${escapeHtml(detail)}</small>` : ''}", js)
        self.assertNotIn("? '40 bài'", js)
        css = read("modules/hanzi-stroke/style.css")
        self.assertNotIn('hsk-source-btn[data-hsk-source="dialogue301"] strong::before', css)

    def test_study_subnav_does_not_repeat_learning_overview(self) -> None:
        html = read("modules/hanzi-stroke/index.html")
        tabs = re.search(r'<nav class="study-tabs ui-study-tabs".*?</nav>', html, re.S)
        self.assertIsNotNone(tabs)
        self.assertNotIn('studyTabHub', tabs.group(0))
        self.assertNotIn('Tổng quan', tabs.group(0))
        self.assertNotIn('>学<', tabs.group(0))
        for label in ["Bút thuận", "Giáo trình", "Bộ thủ"]:
            self.assertIn(label, tabs.group(0))

    def test_301_list_starts_directly_with_lessons(self) -> None:
        js = read("modules/hanzi-stroke/app.js")
        css = read("modules/hanzi-stroke/style.css")
        removed = "Chọn một bài để xem từ vựng, câu mẫu, hội thoại, chú thích và nội dung liên quan."
        self.assertNotIn(removed, js)
        self.assertNotIn('hsk-dialogue301-note', js)
        self.assertNotIn('hsk-dialogue301-note', css)
        self.assertIn('${lessons.map(lesson => `', js)

    def test_learning_breadcrumb_is_the_return_path(self) -> None:
        shell = read("modules/shared/app-shell.js")
        html = read("modules/hanzi-stroke/index.html")
        self.assertIn("items.push(breadcrumbItem('Học', ROUTES.learn", shell)
        self.assertIn("items.push(breadcrumbItem('Giáo trình', ROUTES.curriculum", shell)
        self.assertIn("radicals: 'Bộ thủ'", shell)
        self.assertIn("flashcards: 'Thẻ'", shell)
        self.assertIn("writing: 'Bút thuận'", shell)
        self.assertNotIn('id="studyTabHub"', html)

    def test_301_detail_breadcrumb_keeps_full_hierarchy(self) -> None:
        shell = read("modules/shared/app-shell.js")
        self.assertIn("const isDialogue301 = window.location.hash === '#dialogue301';", shell)
        self.assertIn("items.push(breadcrumbItem('Học', ROUTES.learn));", shell)
        self.assertIn("items.push(breadcrumbItem('Giáo trình', ROUTES.curriculum));", shell)
        self.assertIn("items.push(breadcrumbItem('301', ROUTES.dialogue301Curriculum, !lessonNumber));", shell)
        self.assertIn("items.push(breadcrumbItem(`Bài ${lessonNumber}`, '', true));", shell)
        self.assertIn("getDialogue301LessonNumber", shell)
        self.assertIn("?study=hsk&curriculum=dialogue301", shell)
        hanzi = read("modules/hanzi-stroke/app.js")
        self.assertIn("get('curriculum')", hanzi)
        self.assertIn("syncHskRoute({ sectionKey: 'all' });", hanzi)
        self.assertIn("publishHskBreadcrumb", hanzi)

    def test_301_lesson_click_updates_url_and_back_history(self) -> None:
        js = read("app.js")
        shell = read("modules/shared/app-shell.js")
        self.assertIn("function updateDialogue301LessonRoute", js)
        self.assertIn("url.searchParams.set('lesson', lessonId);", js)
        self.assertIn("url.hash = 'dialogue301';", js)
        self.assertIn("options.replaceRoute ? 'replaceState' : 'pushState'", js)
        self.assertIn("openDialogue301Lesson(initialLesson, { replaceRoute: true })", js)
        self.assertIn("openDialogue301Lesson(lesson, { skipRoute: true })", js)
        self.assertIn("window.addEventListener('popstate'", js)
        self.assertIn("tiengtrung:navigationchange", js)
        self.assertIn("window.addEventListener('tiengtrung:navigationchange', refreshHierarchyBreadcrumb);", shell)

    def test_header_breadcrumb_keeps_home_mark_and_fixed_actions(self) -> None:
        shell = read("modules/shared/app-shell.js")
        css = read("modules/shared/app-shell.css")
        header = re.search(r"function createHeader\(context\).*?return header;", shell, re.S)
        self.assertIsNotNone(header)
        block = header.group(0)
        self.assertLess(block.index("ui-app-brand"), block.index("data-ui-header-breadcrumb"))
        self.assertLess(block.index("data-ui-header-breadcrumb"), block.index("ui-app-header__actions"))
        self.assertIn('<span class="ui-app-brand__mark" aria-hidden="true">中</span>', block)
        self.assertIn("grid-template-columns: auto minmax(0, 1fr) auto;", css)
        self.assertIn(".ui-app-header.is-context-child .ui-app-brand__copy { display: none; }", css)
        self.assertIn("overflow-x: auto;", css)
        self.assertIn("touch-action: pan-x;", css)
        self.assertIn("nav.scrollLeft = nav.scrollWidth;", shell)

    def test_old_breadcrumb_row_is_removed_from_main_content(self) -> None:
        shell = read("modules/shared/app-shell.js")
        css = read("modules/shared/app-shell.css")
        self.assertNotIn("target.prepend(breadcrumb)", shell)
        self.assertNotIn("function createHierarchyBreadcrumb", shell)
        self.assertNotIn(".ui-hierarchy-breadcrumb {", css)
        self.assertIn("target.querySelectorAll(':scope > .ui-hierarchy-breadcrumb').forEach(node => node.remove());", shell)

    def test_hsk_breadcrumb_contains_only_real_navigation_levels(self) -> None:
        js = read("modules/hanzi-stroke/app.js")
        publish = re.search(r"function publishHskBreadcrumb\(\).*?window\.dispatchEvent", js, re.S)
        self.assertIsNotNone(publish)
        block = publish.group(0)
        for label in ["Học", "Giáo trình", "getHskSourceLabel", "getHskLevelLabel", "getHskSectionBreadcrumbLabel"]:
            self.assertIn(label, block)
        for small_tab in ["Từ vựng", "Câu mẫu", "Hội thoại", "Chú thích"]:
            self.assertNotIn(small_tab, block)
        self.assertIn("url.searchParams.set('level'", js)
        self.assertIn("url.searchParams.set('section'", js)
        self.assertIn("sectionMode", js)
        self.assertIn("window.addEventListener('popstate', restoreHskRouteFromLocation);", js)

    def test_hsk_section_breadcrumb_uses_short_lesson_or_topic_number(self) -> None:
        js = read("modules/hanzi-stroke/app.js")
        self.assertIn("return sectionType === 'topic' ? `Chủ đề ${index + 1}` : `Bài ${index + 1}`;", js)
        self.assertIn("syncHskRoute();", js)
        self.assertIn("applyPendingHskSection();", js)

    def test_lookup_notifies_header_when_query_history_changes(self) -> None:
        js = read("modules/lookup/app.js")
        self.assertIn("function notifyShellNavigation()", js)
        self.assertGreaterEqual(js.count("notifyShellNavigation();"), 2)
        shell = read("modules/shared/app-shell.js")
        self.assertIn("items.push(breadcrumbItem('Tra', ROUTES.lookup, !query));", shell)
        self.assertIn("if (query) items.push(breadcrumbItem(query, '', true));", shell)

    def test_301_cache_version_is_refreshed(self) -> None:
        html = read("index.html")
        self.assertIn("app.js?v=20260717-breadcrumb1", html)
        self.assertIn("modules/shared/app-shell.js?v=20260717-headercrumb1", html)


    def test_lookup_stroke_links_are_optional_after_shared_shell_replaces_legacy_nav(self) -> None:
        js = read("modules/lookup/app.js")
        self.assertIn("if (el.strokeNavLink) el.strokeNavLink.href = href;", js)
        self.assertIn("if (el.menuStrokeLink) el.menuStrokeLink.href = href;", js)
        self.assertNotIn("  el.strokeNavLink.href = href;", js)
        self.assertNotIn("  el.menuStrokeLink.href = href;", js)

    def test_lookup_uses_shared_header_breadcrumb_and_hides_legacy_row(self) -> None:
        html = read("modules/lookup/index.html")
        js = read("modules/lookup/app.js")
        self.assertIn('class="lookup-breadcrumb ui-hierarchy-breadcrumb"', html)
        self.assertIn("tiengtrung:breadcrumbchange", js)
        self.assertIn("const shellItems = [{ label: 'Tra'", js)


if __name__ == "__main__":
    unittest.main(verbosity=2)

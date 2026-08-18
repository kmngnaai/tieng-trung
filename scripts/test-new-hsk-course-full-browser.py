#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from urllib.parse import unquote, urlparse

from playwright.sync_api import sync_playwright

from browser_runtime import require_browser_executable, replace_location_search

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "test-output" / "new-hsk-course-full"
OUT.mkdir(parents=True, exist_ok=True)
MIMES = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".woff2": "font/woff2",
    ".mp3": "audio/mpeg",
}
CASES = [
    (1, 2, "Tôi tên là Lý Văn"),
    (2, 1, "Cô ấy mời chúng tôi ăn vịt quay Bắc Kinh"),
    (3, 18, "Tôi đã học được cách gói sủi cảo"),
]


def local_route(query):
    def handler(route):
        parsed = urlparse(route.request.url)
        if parsed.netloc != "app.test":
            route.abort()
            return
        path = ROOT / unquote(parsed.path.lstrip("/"))
        if not path.is_file():
            route.fulfill(status=404, body=b"not found")
            return
        body = path.read_bytes()
        if path.as_posix().endswith('/modules/new-hsk-course/app.js'):
            body = replace_location_search(body.decode('utf-8'), query).encode('utf-8')
        route.fulfill(
            status=200,
            body=body,
            content_type=MIMES.get(path.suffix.lower(), "application/octet-stream"),
        )

    return handler


def load(page, query: str):
    page.route("**/*", local_route(query))
    html = (ROOT / 'modules/new-hsk-course/index.html').read_text(encoding='utf-8')
    html = html.replace('<head>', '<head><base href="https://app.test/modules/new-hsk-course/">', 1)
    page.set_content(html, wait_until='networkidle')
    page.wait_for_selector(".nhsk-hero")


def assert_no_overflow(page):
    size = page.evaluate(
        "() => ({scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth})"
    )
    assert size["scrollWidth"] <= size["clientWidth"] + 1, size


def assert_base_case(page, level: int, lesson: int, title: str):
    if page.locator('[data-nhsk-view="book"]').count():
        page.locator('[data-nhsk-view="book"]').click(force=True)
        page.wait_for_selector(".nhsk-card")
    assert page.locator(".nhsk-hero__vi").inner_text().strip() == title
    assert page.locator("[data-nhsk-level-select]").input_value() == str(level)
    assert page.locator("[data-nhsk-lesson-select]").input_value() == str(lesson)
    assert page.locator(".nhsk-course-nav").count() == 1
    assert page.locator("[data-nhsk-view]").count() == 3
    assert page.locator(".nhsk-card").count() >= 4
    assert page.locator("[data-nhsk-audio-ref]").count() >= 6
    assert_no_overflow(page)


def run_full_mobile(browser):
    context = browser.new_context(
        viewport={"width": 390, "height": 844},
        is_mobile=True,
        has_touch=True,
    )
    page = context.new_page()
    page.set_default_timeout(18000)
    errors: list[str] = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    load(page, "?level=1&lesson=2&view=book")
    assert_base_case(page, *CASES[0])

    # Audio contract: local MP3 request resolves; browser playback itself can be
    # restricted in headless environments, so source files are audited separately.
    audio_ref = page.locator("[data-nhsk-audio-ref]").first.get_attribute("data-nhsk-audio-ref")
    assert audio_ref, "Audio button must carry a source reference"

    page.locator('[data-nhsk-view="grouped"]').click(force=True)
    page.wait_for_selector(".nhsk-filters")
    assert page.locator(".nhsk-filters button").count() >= 4
    assert_no_overflow(page)

    page.locator('[data-nhsk-view="practice"]').click(force=True)
    page.wait_for_selector(".nhsk-practice-menu")
    assert page.locator("[data-nhsk-practice]").count() == 10
    assert_no_overflow(page)

    # Internal selector navigation must switch level/lesson without reloading shell.
    page.select_option("[data-nhsk-level-select]", "2")
    page.wait_for_function("document.querySelector('.nhsk-hero__vi')?.textContent.includes('vịt quay')")
    assert_base_case(page, *CASES[1])
    page.select_option("[data-nhsk-level-select]", "3")
    page.wait_for_function("document.querySelector('[data-nhsk-level-select]')?.value === '3'")
    page.select_option("[data-nhsk-lesson-select]", "18")
    page.wait_for_function("document.querySelector('.nhsk-hero__vi')?.textContent.includes('sủi cảo')")
    assert_base_case(page, *CASES[2])

    page.screenshot(path=str(OUT / "full-course-mobile-390.png"), full_page=True)
    assert not errors, "\n".join(errors)
    context.close()


def run_layout_case(browser, width: int, height: int, level: int, lesson: int, title: str, screenshot: str | None = None):
    mobile = width < 700
    context = browser.new_context(
        viewport={"width": width, "height": height},
        is_mobile=mobile,
        has_touch=mobile,
    )
    page = context.new_page()
    page.set_default_timeout(18000)
    errors: list[str] = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    load(page, f"?level={level}&lesson={lesson}&view=book")
    assert_base_case(page, level, lesson, title)
    if screenshot:
        page.screenshot(path=str(OUT / screenshot), full_page=True)
    assert not errors, "\n".join(errors)
    context.close()


def main():
    executable = require_browser_executable()
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            executable_path=executable,
            args=["--no-sandbox", "--disable-gpu"],
        )
        run_layout_case(browser, 360, 800, *CASES[0])
        run_full_mobile(browser)
        run_layout_case(browser, 430, 932, *CASES[1])
        run_layout_case(browser, 1280, 900, *CASES[2], screenshot="full-course-desktop.png")
        browser.close()
    print(
        "PASS: New 3.0 full course browser, internal level/lesson navigation, "
        "audio refs, mobile/desktop overflow"
    )


if __name__ == "__main__":
    main()

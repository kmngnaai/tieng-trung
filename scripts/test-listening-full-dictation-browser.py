#!/usr/bin/env python3
"""Optional Chromium smoke test for the Listening full-dictation and caret UX.

Requires:
  pip install playwright
  A Chromium/Chrome executable available in PATH.
"""
from pathlib import Path
from urllib.parse import urlparse, unquote
import shutil

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "test-output" / "listening-full-dictation-caret"
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


def local_route(route):
    parsed = urlparse(route.request.url)
    if parsed.netloc != "app.test":
        route.abort()
        return
    file_path = ROOT / unquote(parsed.path.lstrip("/"))
    if not file_path.is_file():
        route.fulfill(status=404, body=b"not found")
        return
    route.fulfill(
        status=200,
        body=file_path.read_bytes(),
        content_type=MIMES.get(file_path.suffix.lower(), "application/octet-stream"),
    )


def load_app(page):
    page.route("**/*", local_route)
    html = (ROOT / "modules/listening/index.html").read_text(encoding="utf-8")
    html = html.replace(
        "<head>",
        '<head><base href="https://app.test/modules/listening/">',
        1,
    )
    page.set_content(html, wait_until="domcontentloaded")
    page.wait_for_selector('[data-action="open-new-hsk"]')


def main():
    executable = (
        shutil.which("chromium")
        or shutil.which("chromium-browser")
        or shutil.which("google-chrome")
        or shutil.which("chrome")
    )
    if not executable:
        raise SystemExit("Không tìm thấy Chromium/Chrome trong PATH.")

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            executable_path=executable,
            args=["--no-sandbox", "--disable-gpu"],
        )
        page = browser.new_page(viewport={"width": 430, "height": 932})
        page.set_default_timeout(10000)
        load_app(page)

        page.locator('[data-action="open-new-hsk"]').click()
        page.wait_for_selector('[data-action="open-new-hsk-unit"]')
        page.locator('[data-action="open-new-hsk-unit"][data-unit-id*="__lesson__2__"]').click()
        page.wait_for_selector('[data-activity="dialogue-full-dictation"]')

        body_text = page.locator("body").inner_text()
        assert "60 câu = 53 ví dụ từ vựng gốc + 2 ngữ pháp riêng + 5 câu biên soạn." in body_text

        for selector, expected in (
            ('[data-filter="vocabulary"]', "53/60"),
            ('[data-filter="grammar"]', "3/60"),
            ('[data-filter="authored"]', "5/60"),
            ('[data-filter="all"]', "60/60"),
        ):
            page.locator(selector).click()
            assert expected in page.locator(".sentence-filter-note").inner_text()

        page.locator('[data-activity="dialogue-full-dictation"]').click()
        page.wait_for_selector("#dictationInput")
        assert page.locator(".passage-line").count() == 8
        assert page.locator(".passage-speaker").count() == 8

        page.evaluate(
            """
            const input = dictationInput;
            input.value = '你好你呢';
            input.setSelectionRange(4, 4);
            input.dispatchEvent(new InputEvent('input', {
              bubbles: true,
              inputType: 'insertText',
              data: '呢'
            }));
            """
        )
        page.wait_for_timeout(220)
        page.evaluate("document.querySelector('[data-slot-index=\"1\"]').click()")
        page.wait_for_timeout(100)
        assert page.evaluate("[dictationInput.selectionStart, dictationInput.selectionEnd]") == [1, 2]

        page.evaluate(
            """
            const input = dictationInput;
            input.setRangeText('号', input.selectionStart, input.selectionEnd, 'end');
            input.dispatchEvent(new InputEvent('input', {
              bubbles: true,
              inputType: 'insertReplacementText',
              data: '号'
            }));
            """
        )
        page.wait_for_timeout(250)
        assert page.locator("#dictationInput").input_value() == "你号你呢"
        assert page.evaluate("[dictationInput.selectionStart, dictationInput.selectionEnd]") == [4, 4]
        page.screenshot(path=str(OUT / "full-dialogue-caret-mobile.png"))

        page.evaluate("document.querySelector('[data-action=\"go-back\"]').click()")
        page.wait_for_selector('[data-activity="passage-full-dictation"]')
        page.evaluate("document.querySelector('[data-activity=\"passage-full-dictation\"]').click()")
        page.wait_for_selector("#dictationInput")
        assert page.locator(".passage-line").count() == 4
        page.screenshot(path=str(OUT / "full-passage-mobile.png"))

        page.set_viewport_size({"width": 1280, "height": 900})
        page.screenshot(path=str(OUT / "full-passage-desktop.png"))
        browser.close()

    print("PASS: browser smoke filters, full dialogue/passage, tap-to-correct and resume caret")


if __name__ == "__main__":
    main()

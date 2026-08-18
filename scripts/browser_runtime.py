#!/usr/bin/env python3
"""Shared browser executable resolver for local Playwright regression scripts."""
from __future__ import annotations

import os
import shutil
from pathlib import Path

_BROWSER_NAMES = ("chromium", "chromium-browser", "google-chrome", "chrome")


def find_browser_executable() -> str | None:
    for name in _BROWSER_NAMES:
        executable = shutil.which(name)
        if executable:
            return executable

    candidates = (
        Path(os.environ.get("PROGRAMFILES", "")) / "Google/Chrome/Application/chrome.exe",
        Path(os.environ.get("PROGRAMFILES(X86)", "")) / "Google/Chrome/Application/chrome.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Google/Chrome/Application/chrome.exe",
    )
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    return None


def require_browser_executable() -> str:
    executable = find_browser_executable()
    if not executable:
        raise SystemExit("Không tìm thấy Chromium/Chrome trên máy.")
    return executable


def replace_location_search(source: str, query: str) -> str:
    """Inject the requested query into the two New HSK location reads used by set_content tests."""
    replacements = (
        ("const params = new URLSearchParams(window.location.search);", f"const params = new URLSearchParams({query!r});"),
        ("const currentParams = new URLSearchParams(window.location.search);", f"const currentParams = new URLSearchParams({query!r});"),
    )
    result = source
    for marker, replacement in replacements:
        if marker not in result:
            raise RuntimeError(f"New HSK query marker not found: {marker}")
        result = result.replace(marker, replacement, 1)
    return result


def click_centered(locator) -> None:
    """Click a mobile control after centering it away from sticky navigation."""
    locator.evaluate("el => el.scrollIntoView({block: 'center', inline: 'nearest'})")
    locator.click()

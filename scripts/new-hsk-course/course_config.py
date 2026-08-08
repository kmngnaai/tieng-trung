"""Shared course configuration for New HSK 3.0 build tools."""
from __future__ import annotations

LESSON_COUNTS = {1: 15, 2: 15, 3: 18}


def lesson_count(level: int) -> int:
    try:
        return LESSON_COUNTS[int(level)]
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError(f"Unsupported New HSK level: {level}") from exc


def lesson_numbers(level: int) -> range:
    return range(1, lesson_count(level) + 1)

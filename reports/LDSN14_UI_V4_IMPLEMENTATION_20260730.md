# LDSN1-4 UI V4 — Implementation report

Date: 2026-07-30

## Scope

This patch reuses the interaction patterns already present in HSK, 301, Bộ thủ and Thẻ while keeping the LDSN1-4 data and lesson flow unchanged.

## Implemented

- Vocabulary details now open in an in-place modal instead of navigating to the standalone Tra page.
- Closing or using “Quay lại bài” preserves the current LDSN lesson, tab and scroll position.
- Words missing from the global Tra data still show a local LDSN fallback detail.
- The detail modal shows Hanzi, pinyin, Vietnamese meaning, word class, Hán Việt, character breakdown, lesson sentences, related lesson words and audio controls.
- LDSN vocabulary now includes a flashcard flow aligned with the existing HSK experience:
  - Flashcard
  - Reverse
  - Listening
  - Pinyin typing
  - Mixed
  - Show pinyin, autoplay and shuffle settings
  - Easy / Review / Hard ratings
- Grammar usages are paired directly with their matching examples. Redundant “Ví dụ 1, Ví dụ 2…” labels are removed.
- Vocabulary list Hanzi uses a non-wrapping max-content column so multi-character words remain horizontal on mobile.
- LDSN1-4 is added to the Học overview and the shared horizontal navigation together with Bút thuận, Giáo trình, Bộ thủ and Thẻ.
- The five Học tabs use equal-width mobile columns and cache-busted assets.

## Files changed

- modules/ldsn14/app.js
- modules/ldsn14/style.css
- modules/ldsn14/index.html
- modules/hanzi-stroke/index.html
- modules/hanzi-stroke/app.js
- modules/hanzi-stroke/style.css
- tests/test_ldsn14_runtime.js
- tests/test_ldsn14_data.py

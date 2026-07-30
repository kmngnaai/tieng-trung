# Font Han Serif V1 - Local Test Report

## Scope

- Chinese characters, vocabulary, example sentences, radicals and flashcard prompts use the same serif stack as the Listening module.
- Vietnamese UI, pinyin, numbers and controls remain sans-serif.
- Existing feature and layout CSS files are not rewritten. A new late-loaded shared override file applies the font.
- Radical 50 wraps only CJK runs inside mixed Markdown content.

## Changed files

- `index.html`
- `modules/pinyin/index.html`
- `modules/lookup/index.html`
- `modules/hanzi-stroke/index.html`
- `modules/hanzi-stroke/embed.html`
- `modules/bo-thu-50/index.html`
- `modules/bo-thu-50/app.js`
- `modules/shared/font-han-serif.css`

## Automated checks completed

1. JavaScript syntax check:
   - `node --check` passed for root and current module JavaScript files.
2. Existing repository UI test suite:
   - 67/67 tests passed in `tests/test_ui_upgrade.py`.
3. Lookup navigation runtime:
   - `好 -> 姐` passed.
4. CSS parsing:
   - `modules/shared/font-han-serif.css` parsed without syntax errors using `tinycss2`.
5. HTML dependency validation:
   - All six current entry pages load exactly one local font override stylesheet.
   - All local stylesheet paths exist.
   - All six pages include the Noto Serif SC web-font link.
6. Mixed-content Radical 50 check:
   - Chinese runs are wrapped in `.hanzi-text`.
   - Vietnamese and pinyin text are not wrapped or changed to serif.

## Known pre-existing test issue

`tests/test_header_breadcrumb_runtime.js` fails on both the original ZIP and the modified copy under the current Node runtime with:

`TypeError: window.setTimeout is not a function`

The font patch does not change the shared header JavaScript or this test harness.

## Visual acceptance still required before commit

The execution environment blocks Chromium navigation to local and file URLs with an administrator policy, so a real browser screenshot comparison could not be completed here.

Before committing, test the copied patch locally in Chrome and on iPhone Safari, focusing on:

- Home and 301 vocabulary/dialogue wrapping.
- Pinyin Latin text remaining sans-serif.
- Lookup words and sentences.
- Radical 50 mixed Vietnamese/pinyin/Chinese content.
- HSK and Flashcard typing prompts, especially long sentences and the active-character highlight.
- Hanzi Writer embed labels.

No Git commit has been created.

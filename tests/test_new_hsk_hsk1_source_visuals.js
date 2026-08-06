'use strict';

const assert = require('assert');
const fs = require('fs');

const app = fs.readFileSync('modules/new-hsk-course/app.js', 'utf8');
const css = fs.readFileSync('modules/new-hsk-course/style.css', 'utf8');
const html = fs.readFileSync('modules/new-hsk-course/index.html', 'utf8');

// Learner UI: source trace stays in JSON and is not rendered.
assert.match(app, /function visibleSourceVisuals/);
assert.match(app, /item\.displayInLesson !== true/);
assert.match(app, /item\.sourceType === 'pdf'/);
assert.doesNotMatch(app, /function renderSourceAudit/);
assert.doesNotMatch(app, /Hình theo giáo trình|PDF gốc|Hình PPT|Chạm để phóng to/);

// Warmup order and hidden answer disclosure.
assert.match(app, /function renderWarmupSection/);
assert.match(app, /renderSourceVisuals\(section\.sourceVisuals/);
assert.match(app, /renderLayerToggle\('warmup', 'Từ khởi động'\)/);
assert.match(app, /warmupLayers: \{ hanzi: true, pinyin: true, vi: false \}/);
assert.match(app, /renderWarmupChoiceBank\(display\)/);
assert.match(app, /renderSourceTaskChecks\(section\.sourceTasks/);
assert.match(app, /<details class="nhsk-source-task__answers"><summary>Xem đáp án<\/summary>/);
assert.match(app, /data-nhsk-source-task-check/);
assert.match(app, /data-nhsk-source-task-reset/);

// Grammar has three independent layers and sentence audio.
assert.match(app, /function renderGrammarSection/);
assert.match(app, /renderLayerToggle\('grammar', 'Câu mẫu'\)/);
assert.match(app, /nhsk-grammar-example__hanzi/);
assert.match(app, /nhsk-grammar-example__pinyin/);
assert.match(app, /nhsk-grammar-example__vi/);
assert.match(app, /data-nhsk-speak="\$\{attr\(example\.hanzi\)\}"/);

// Learning summary is interactive and persisted.
assert.match(app, /SUMMARY_PROGRESS_KEY/);
assert.match(app, /function renderLearningSummary/);
assert.match(app, /data-nhsk-summary-check/);
assert.match(app, /data-nhsk-summary-note/);
assert.match(app, /window\.localStorage\.setItem\(SUMMARY_PROGRESS_KEY/);

// Responsive presentation contracts.
assert.match(css, /HSK1 refined lesson presentation v2/);
assert.match(css, /\.nhsk-warmup-instruction/);
assert.match(css, /\.nhsk-grammar-example__pinyin/);
assert.match(css, /\.nhsk-summary-table/);
assert.doesNotMatch(app, /nhsk-source-visual__zoom/);
assert.doesNotMatch(css, /\.nhsk-source-visual__zoom/);
assert.match(css, /grid-template-columns:34px repeat\(2,minmax\(0,1fr\)\)/);
assert.match(html, /20260806-hsk1-unified-pinyin-v1/);

// Refined v3 card color and global Hanzi typography.
assert.match(css, /Refined v3: blue Vietnamese meanings/);
assert.match(css, /--nhsk-meaning-blue:#1687d9/);
assert.match(css, /\.nhsk-vocab-item__meaning/);
assert.match(css, /\.nhsk-vocab-list--list>\.nhsk-vocab-item/);
assert.match(css, /border-left:5px solid var\(--nhsk-card-accent\)/);
assert.match(css, /\.nhsk-topic-word-list--grid \.nhsk-topic-word/);
assert.match(css, /font-weight:500/);
assert.match(css, /font-weight:600/);
assert.match(html, /Noto\+Serif\+SC:wght@400;500;600;700/);

// Refined v4 sentence/paragraph weight and synchronized order badge colors.
assert.match(css, /Refined v4: semibold Chinese sentence\/paragraph text/);
assert.match(css, /\.nhsk-vocab-item__order\{[\s\S]*background:var\(--nhsk-order-bg/);
assert.match(css, /nth-child\(8n\+6\)\{--nhsk-order-bg:#fcebf3;--nhsk-order-ink:#b9507d\}/);
assert.match(css, /\.nhsk-dialogue-line--hanzi,[\s\S]*font-weight:600!important/);
assert.match(css, /\.nhsk-passage-line--hanzi/);
assert.match(css, /\.nhsk-context \.nhsk-hanzi/);

// Refined v5: direct Vietnamese translations are blue, neutral explanatory text is untouched.
assert.match(css, /Refined v5: direct Vietnamese translations use a calm blue/);
assert.match(css, /--nhsk-translation-blue:#2f75b5/);
assert.match(app, /class=\"nhsk-dialogue-line nhsk-dialogue-line--vi nhsk-translation\"/);
assert.match(app, /class=\"nhsk-grammar-example__vi nhsk-translation\"/);
assert.match(app, /class=\"nhsk-translation\">\$\{escapeHtml\(row\.vietnamese\)/);
assert.match(app, /renderMarkdown\(taskMarkdown, \{ highlightDirectTranslations: true \}\)/);
assert.match(app, /inlineMarkdownWithDirectTranslation/);
assert.match(app, /looksLikeVietnameseTranslation/);
assert.match(app, /item\.exampleVi/);

// Exercise the real Markdown renderer: only direct translations become blue markers.
const markdownStart = app.indexOf('  function inlineMarkdown(value = \'\')');
const markdownEnd = app.indexOf('  function visibleSourceVisuals', markdownStart);
assert.ok(markdownStart >= 0 && markdownEnd > markdownStart, 'Markdown renderer source block must be extractable');
const markdownSource = app.slice(markdownStart, markdownEnd);
const makeRenderer = new Function(`
  function escapeHtml(value = '') {
    return String(value).replace(/[&<>\"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#039;' }[char]));
  }
  ${markdownSource}
  return renderMarkdown;
`);
const renderMarkdownForTest = makeRenderer();
const taskHtml = renderMarkdownForTest([
  '1. **李文问大家（　　）吃哪个菜。**',
  '*Lǐ Wén wèn dàjiā chī nǎge cài.*',
  'A. 好 *hǎo* — được/tốt',
  '',
  '1. **白家月爱吃哪个菜？**',
  'Bạch Gia Nguyệt thích ăn món nào?',
  '',
  'Audio: `15-1`.'
].join('\n'), { highlightDirectTranslations: true });
assert.match(taskHtml, /<span class="nhsk-translation">được\/tốt<\/span>/);
assert.match(taskHtml, /<span class="nhsk-translation">Bạch Gia Nguyệt thích ăn món nào\?<\/span>/);
assert.doesNotMatch(taskHtml, /<span class="nhsk-translation">Audio:/);

// Refined v6: dialogue, passage/rhyme, grammar and role-play share one Pinyin class.
assert.match(css, /Refined v6: one shared Pinyin treatment/);
assert.match(css, /\.nhsk-app \.nhsk-pinyin-text\{[\s\S]*color:#4f6f91!important;[\s\S]*font-size:13px!important;[\s\S]*font-weight:700!important;[\s\S]*line-height:1\.45!important/);
assert.match(app, /nhsk-dialogue-line--pinyin nhsk-pinyin-text/);
assert.match(app, /nhsk-grammar-example__pinyin nhsk-pinyin-text/);
assert.match(app, /<span class=\"nhsk-pinyin-text\">\$\{escapeHtml\(turn\.pinyin\)\}<\/span>/);
assert.match(app, /<small class=\"nhsk-pinyin-text\">\$\{escapeHtml\(turn\.pinyin\)\}<\/small>/);

console.log('PASS refined New HSK1 v6 unified Pinyin typography');

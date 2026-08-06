'use strict';

const assert = require('assert');
const fs = require('fs');

const app = fs.readFileSync('modules/new-hsk-course/app.js', 'utf8');
const css = fs.readFileSync('modules/new-hsk-course/style.css', 'utf8');
const html = fs.readFileSync('modules/new-hsk-course/index.html', 'utf8');
const builder = fs.readFileSync('scripts/new-hsk-course/build_hsk1_display_manifests.py', 'utf8');
const courseBuilder = fs.readFileSync('scripts/new-hsk-course/build_all_course_data.py', 'utf8');

assert.match(app, /task\.type === 'listening-tf'/);
assert.match(app, /data-task-type="listening-tf"/);
assert.match(app, /data-value="√"/);
assert.match(app, /data-value="×"/);
assert.match(app, /Nghe và chọn đúng\/sai/);
assert.match(css, /\.nhsk-source-task__tf \.nhsk-source-task__question button/);
assert.match(html, /20260806-hsk12-learner-cleanup-v1/);

// Shared display builders must be level-aware rather than hard-coded to HSK1.
assert.match(builder, /parser\.add_argument\('--level'/);
assert.match(builder, /DATA = MODULE \/ f'data\/hsk\{level\}'/);
assert.match(builder, /SOURCE = MODULE \/ f'source\/hsk\{level\}'/);
assert.match(builder, /extract_structured_examples/);
assert.match(builder, /remove_structured_example_block/);
assert.match(courseBuilder, /def apply_source_manifests/);
assert.match(courseBuilder, /base = repo \/ f"modules\/new-hsk-course\/source\/hsk\{level\}"/);

// Existing shared learner presentation remains active for HSK2.
assert.match(app, /warmupLayers: \{ hanzi: true, pinyin: true, vi: false \}/);
assert.match(app, /renderLayerToggle\('warmup', 'Từ khởi động'\)/);
assert.match(app, /renderLayerToggle\('grammar', 'Câu mẫu'\)/);
assert.match(app, /nhsk-grammar-example__pinyin nhsk-pinyin-text/);
assert.match(app, /nhsk-grammar-example__vi nhsk-translation/);
assert.match(app, /function renderLearningSummary/);
assert.match(app, /function visibleSourceVisuals/);
assert.doesNotMatch(app, /Hình theo giáo trình|PDF gốc|Hình PPT|Chạm để phóng to/);

assert.match(app, /Xem đáp án theo sách/);
assert.match(app, /function renderStructuredMarkdownRow/);
assert.match(app, /item\.examplePinyin/);
assert.match(css, /HSK1\/2 learner-first cleanup/);

console.log('PASS HSK2 shared renderer and learner-first cleanup contract');

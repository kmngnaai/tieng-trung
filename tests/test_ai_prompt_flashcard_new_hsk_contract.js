'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const prompt = fs.readFileSync(path.join(ROOT, 'modules/shared/ai-prompt-templates.js'), 'utf8');
const flash = fs.readFileSync(path.join(ROOT, 'modules/hanzi-stroke/app.js'), 'utf8');
const listening = fs.readFileSync(path.join(ROOT, 'modules/listening/app.js'), 'utf8');
const nhsk = fs.readFileSync(path.join(ROOT, 'modules/new-hsk-course/app.js'), 'utf8');
const nhskCss = fs.readFileSync(path.join(ROOT, 'modules/new-hsk-course/style.css'), 'utf8');

assert.match(prompt, /package:[\s\S]*label:\s*'Bộ hoàn chỉnh'/, 'Prompt Builder must offer a full dataset profile');
assert.match(prompt, /character:[\s\S]*label:\s*'Cấu tạo chữ'/, 'Prompt Builder must offer character enrichment');
assert.match(prompt, /practice:[\s\S]*label:\s*'Bài tập'/, 'Prompt Builder must offer practice generation');
assert.match(prompt, /review:[\s\S]*label:\s*'Kiểm tra dữ liệu'/, 'Prompt Builder must offer reviewer mode');
assert.match(prompt, /dictionaryRadical/);
assert.match(prompt, /reviewStatus/);
assert.match(prompt, /validation/);
assert.match(prompt, /sourceRefs/);
assert.match(prompt, /maxOutOfScopeWords/);
assert.match(prompt, /Không mặc định tạo hội thoại/);

assert.match(flash, /key:\s*'new_hsk_course'/, 'Flashcard curriculum must keep a separate New 3.0 source');
assert.match(flash, /sentence-ordering/);
assert.match(flash, /radical-sort/);
assert.match(flash, /radical-character-index\.json/);
assert.match(flash, /Intl\.Segmenter/);
assert.match(flash, /renderFlashcardSentenceOrderingStudy/);
assert.match(flash, /renderFlashcardRadicalSortStudy/);
assert.match(flash, /buildNewHskCourseCurriculum/);

assert.match(listening, /new-hsk-course/);
assert.match(listening, /New 3\.0/);

assert.doesNotMatch(nhsk, /container\.style\.minHeight\s*=\s*`\$\{Math\.ceil\(requiredHeight\)\}px`/);
assert.match(nhskCss, /align-content:start/);
assert.match(nhsk, /study', 'lookup'/);
assert.match(nhsk, /Quay lại chữ/);
assert.doesNotMatch(nhsk, /Đáp án tạo thành chữ/);
assert.match(nhsk, /data-nhsk-character-detail/);
assert.match(nhsk, /data-nhsk-word-ref/);
console.log('PASS AI Prompt Builder, New 3.0 source, Flashcard modes and navigation contracts');

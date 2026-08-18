'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const course = read('modules/new-hsk-course/app.js');
const courseCss = read('modules/new-hsk-course/style.css');
const hsk = read('modules/hanzi-stroke/app.js');
const pinyin = read('modules/pinyin/core/audio.js');
const pinyinApp = read('modules/pinyin/app.js');

assert(course.includes('Matching.scheduleNextRound'), 'New 3.0 matching must schedule the next round');
assert.match(course, /result\.roundComplete\s*&&\s*!result\.complete/, 'New 3.0 matching must detect a completed non-final round');

assert(course.includes("catalog: ['topics', 'grammar']"), 'New 3.0 must accept topic and grammar catalog routes');
assert(course.includes('renderTopicCatalog'), 'New 3.0 must render topic lists and topic word lists');
assert(course.includes('renderGrammarCatalog'), 'New 3.0 must render the shared grammar catalog');
assert(course.includes('data-nhsk-topic-id'), 'Topic cards must be directly addressable');
assert(course.includes('data-nhsk-catalog-word'), 'Topic words must expose source lesson navigation');
assert(course.includes('focusWord'), 'Lesson deep links must preserve the selected word');
assert((course.match(/syncUrl\(false\)/g) || []).length >= 3, 'Catalog, topic and grammar clicks must create browser history entries');
assert(courseCss.includes('.nhsk-catalog-switch'), 'Catalog navigation must have mobile styling');
assert(courseCss.includes('.nhsk-topic-word-list'), 'Topic word lists must have dedicated styling');

assert(hsk.includes('function renderNewHskCourseLessonEntry'), 'HSK lesson detail must expose the current New 3.0 lesson entry');
assert(hsk.includes("new URL('../new-hsk-course/index.html', window.location.href)"), 'HSK lesson entry must target New 3.0');
assert(hsk.includes("url.searchParams.set('level', String(level))"), 'HSK lesson entry must preserve level');
assert(hsk.includes("url.searchParams.set('lesson', String(lesson))"), 'HSK lesson entry must preserve lesson');
assert(hsk.includes("url.searchParams.set('view', 'book')"), 'HSK lesson entry must open the book view');
assert(hsk.includes('hsk-full-course-entry'), 'HSK lesson detail must render the New 3.0 entry control');

for (const level of [1, 2, 3]) {
  const catalogPath = path.join(ROOT, `modules/new-hsk-course/data/catalog/hsk${level}.json`);
  assert(fs.existsSync(catalogPath), `Missing HSK ${level} catalog`);
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  assert.strictEqual(catalog.level, level);
  assert(catalog.topics.length > 0, `HSK ${level} topics must not be empty`);
  assert(catalog.grammar.length > 0, `HSK ${level} grammar must not be empty`);
  const word = catalog.topics.flatMap(topic => topic.words).find(item => item.lessonNumbers && item.lessonNumbers.length);
  assert(word, `HSK ${level} must include a topic word linked to at least one lesson`);
}

assert(pinyin.includes("player.preload = 'auto'"), 'Pinyin player must preload audio');
assert(pinyin.includes('function prepareSource'), 'Pinyin audio must support source warming');
assert(pinyin.includes('function prepareSyllable'), 'Pinyin audio must expose syllable warming');
assert(pinyinApp.includes('App.audio.prepareSyllable'), 'Pointer interaction must warm the selected syllable audio');
assert(pinyinApp.includes('function prepareVisibleAudio'), 'Visible Pinyin controls must be warmed before the first click');
assert(!/async function playSource[\s\S]{0,240}stop\(\);/.test(pinyin), 'playSource must not always discard the current source before playback');

assert(course.includes('orderingTokensForRow'), 'Ordering practice must prefer reviewed ordering tokens');
const lesson = JSON.parse(read('modules/new-hsk-course/data/hsk1/lesson-01.json'));
const firstTurn = lesson.entities.dialogues.flatMap(item => item.turns || []).find(item => item.orderingTokens);
assert(firstTurn && firstTurn.orderingTokens.length >= 2, 'Lesson data must include orderingTokens');
assert.strictEqual(firstTurn.orderingTokens.join(''), firstTurn.hanzi.replace(/[，。！？；：、,.!?;:'"“”‘’（）()\[\]【】—\-\s]/gu, ''), 'Ordering tokens must reconstruct the normalized sentence');

console.log('PASS New 3.0 catalog integration, matching, Pinyin preload and ordering token contracts');

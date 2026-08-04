'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const json = rel => JSON.parse(read(rel));

const course = read('modules/new-hsk-course/app.js');
const courseCss = read('modules/new-hsk-course/style.css');
const hanzi = read('modules/hanzi-stroke/app.js');
const hanziCss = read('modules/hanzi-stroke/style.css');
const lesson = json('modules/new-hsk-course/data/hsk1/lesson-01.json');
const practice = json('modules/new-hsk-course/source/hsk1/practice/HSK1_Bai_01_practice.json');

assert.match(course, /function evaluatePracticeOrderingItem/);
assert.doesNotMatch(course, /data-nhsk-check-order/);
assert.match(course, /typingListen/);
assert.match(course, /hanzi:\s*false,\s*pinyin:\s*false,\s*vi:\s*false/);
assert.match(course, /selectedGroupId/);
assert.match(course, /chữ → bộ thủ hoặc bộ thủ → chữ/);
assert.match(course, /characterId/);
assert.match(course, /practiceActivityStarted:\s*true/);
assert.match(course, /returnLabel.*Quay lại chữ/);
assert.doesNotMatch(course, /roleMap\s*=\s*\{/);
assert.match(courseCss, /nhsk-radical-item\{width:39px;height:42px/);
assert.match(courseCss, /nhsk-auto-rating/);

assert.match(hanzi, /function evaluateFlashcardSentenceOrdering/);
assert.doesNotMatch(hanzi, /data-hsk-order-check/);
assert.match(hanzi, /function attemptFlashcardRadicalMatch/);
assert.match(hanzi, /selectedGroupId/);
assert.match(hanzi, /loadFlashcardCharacterRadical/);
assert.match(hanzi, /sourceItemDictionaryRadical/);
assert.match(hanzi, /isDictionaryRadical===true/);
assert.match(hanzi, /applyInitialStudyRoute/);
assert.match(hanzi, /route==='writing' \|\| route==='lookup'/);
assert.match(hanzi, /returnLabel = params\.get\('returnLabel'\)/);
assert.match(hanziCss, /hsk-flashcard-order-rating/);
assert.match(hanziCss, /hsk-flashcard-study--radical-sort\.is-compact/);

const runtimeNi = lesson.entities.characters.find(row => row.hanzi === '你');
const sourceNi = practice.characters.find(row => row.hanzi === '你');
assert.equal(runtimeNi.pedagogy.mnemonic.type, 'pedagogical');
assert.equal(runtimeNi.pedagogy.mnemonic.reviewStatus, 'needs-review');
assert.deepEqual(runtimeNi.pedagogy.mnemonic, sourceNi.pedagogy.mnemonic);

for (const exercise of lesson.entities.radicalSortExercises || []) {
  const groups = new Map(exercise.groups.map(group => [group.id, group]));
  const items = new Map(exercise.items.map(item => [item.id, item]));
  const seen = new Set();
  for (const round of exercise.rounds) {
    const roundGroups = new Set(round.groupIds);
    round.groupIds.forEach(id => assert.ok(groups.has(id), `Missing radical group ${id}`));
    round.itemIds.forEach(id => {
      assert.ok(items.has(id), `Missing radical item ${id}`);
      assert.ok(!seen.has(id), `Duplicate item ${id}`);
      seen.add(id);
      assert.ok(roundGroups.has(items.get(id).groupId), `Round lacks answer group for ${items.get(id).hanzi}`);
    });
  }
  assert.equal(seen.size, exercise.items.length);
}

console.log('PASS New 3.0 practice UX v4 contracts and curated data');

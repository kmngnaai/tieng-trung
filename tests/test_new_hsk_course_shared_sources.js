'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const Adapters = require(path.join(ROOT, 'modules/listening/source-adapters.js'));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'modules/new-hsk-course/data/manifest.json'), 'utf8'));
const allUnits = Adapters.listNewHskCourseUnits(manifest);
assert.strictEqual(allUnits.length, 48, 'New 3.0 manifest must expose all 48 app-ready lessons');
assert.deepStrictEqual(
  [1, 2, 3].map(level => Adapters.listNewHskCourseUnits(manifest, { level }).length),
  [15, 15, 18],
  'New 3.0 level lesson counts must be 15/15/18'
);
assert.strictEqual(allUnits[0].unitId, 'nhsk-1-01');
assert.strictEqual(allUnits.at(-1).unitId, 'nhsk-3-18');

for (const entry of manifest.lessons) {
  const file = path.join(ROOT, 'modules/new-hsk-course/data', entry.path);
  const lesson = JSON.parse(fs.readFileSync(file, 'utf8'));
  const dataset = Adapters.adaptNewHskCourseLesson(lesson, { sourceFile: entry.path });
  const validation = Adapters.validateDataset(dataset);
  assert.strictEqual(validation.ok, true, `${entry.id}: ${validation.errors.join(' | ')}`);
  assert.strictEqual(dataset.source.id, 'new-hsk-course');
  assert.ok(dataset.words.length > 0, `${entry.id} missing words`);
  assert.ok(dataset.sentences.some(row => row.tags.includes('dialogue')), `${entry.id} missing dialogue sentences`);
  assert.ok(dataset.sentences.filter(row => row.tokens.length >= 2).length >= 1, `${entry.id} missing ordering tokens`);
}

const lesson1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'modules/new-hsk-course/data/hsk1/lesson-01.json'), 'utf8'));
const charNi = lesson1.entities.characters.find(row => row.hanzi === '你');
assert.ok(charNi);
assert.strictEqual(charNi.dictionaryRadical?.glyph, '亻');
assert.strictEqual(charNi.dictionaryRadical?.nameVi, 'Bộ Nhân');
assert.deepStrictEqual(charNi.components.map(row => row.glyph), ['亻', '尔']);
assert.ok(charNi.components.every(row => row.roleVi && row.reviewStatus === 'reviewed'));
assert.strictEqual(charNi.reviewStatus, 'curated');
console.log('PASS New 3.0 all 48 shared Flashcard/Listening lessons and curated character labels');

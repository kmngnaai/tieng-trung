'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..');
const adapters = require(path.join(repo, 'modules/listening/source-adapters.js'));
const level = JSON.parse(fs.readFileSync(path.join(repo, 'modules/hanzi-stroke/data/learning/hsk/hsk_1.json'), 'utf8'));
const grammar = JSON.parse(fs.readFileSync(path.join(repo, 'modules/hanzi-stroke/data/learning/grammar/new_hsk_1.json'), 'utf8'));
const manifestPath = path.join(repo, 'modules/listening/data/structures/new-hsk/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const listed = adapters.listNewHskUnits(level, { levelId: 'new-hsk-1', sectionType: 'lesson' });

assert.strictEqual(listed.length, 15, 'Dữ liệu nguồn New HSK 1 có 15 bài');
assert.strictEqual(manifest.units.length, 15, 'Manifest Nghe phải mở đủ 15 bài New HSK 1');
assert.deepStrictEqual(new Set(manifest.units.map(unit => unit.unitId)), new Set(listed.map(unit => unit.unitId)));

for (const entry of manifest.units) {
  const structurePath = path.join(repo, 'modules/listening/data/structures/new-hsk', entry.structureFile);
  assert(fs.existsSync(structurePath), `Thiếu structure ${entry.structureFile}`);
  const structure = JSON.parse(fs.readFileSync(structurePath, 'utf8'));
  const dataset = adapters.adaptNewHskUnit(level, grammar, structure, entry.unitId, {
    structureFile: `modules/listening/data/structures/new-hsk/${entry.structureFile}`,
    sourceFile: 'modules/hanzi-stroke/data/learning/hsk/hsk_1.json',
    grammarFile: 'modules/hanzi-stroke/data/learning/grammar/new_hsk_1.json'
  });
  const validation = adapters.validateDataset(dataset);
  assert(validation.ok, `${entry.unitId}: ${validation.errors.join(' | ')}`);
  assert(dataset.words.length > 0);
  assert(dataset.sentences.length > 0);
  assert(dataset.groups.some(group => group.kind === 'dialogue'), `${entry.unitId} thiếu hội thoại biên tập`);
  assert(dataset.groups.some(group => group.kind === 'passage'), `${entry.unitId} thiếu đoạn biên tập`);
  assert(dataset.groups.every(group => group.originType === 'curated'));
}

console.log('New HSK 1 expansion tests passed.');

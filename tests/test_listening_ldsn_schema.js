'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..');
const adapters = require(path.join(repo, 'modules/listening/source-adapters.js'));
const builders = require(path.join(repo, 'modules/listening/activity-builders.js'));
const payload = JSON.parse(fs.readFileSync(path.join(repo, 'modules/ldsn14/data/lessons.json'), 'utf8'));

const units = adapters.listLdsnUnits(payload);
assert.strictEqual(units.length, 10, 'LDSN1-4 phải có 10 bài trong danh sách Nghe');
assert.strictEqual(units[0].unitId, 'ldsn-01');
assert.strictEqual(units[9].unitId, 'ldsn-10');

let sampleDataset = null;
for (const unit of units) {
  const dataset = adapters.adaptLdsnUnit(payload, unit.unitId, {
    sourceFile: 'modules/ldsn14/data/lessons.json'
  });
  if (!sampleDataset) sampleDataset = dataset;
  const validation = adapters.validateDataset(dataset);
  assert.deepStrictEqual(validation.errors, [], `${unit.unitId}: ${validation.errors.join(' | ')}`);
  assert(validation.ok, `${unit.unitId} phải hợp lệ`);
  assert.strictEqual(dataset.schemaVersion, 1);
  assert.strictEqual(dataset.source.id, 'ldsn14');
  assert(dataset.words.length > 0, `${unit.unitId} phải có từ`);
  assert(dataset.sentences.length > 0, `${unit.unitId} phải có câu`);
  assert(dataset.groups.some(group => group.kind === 'dialogue'), `${unit.unitId} phải có hội thoại`);
  assert(dataset.groups.some(group => group.kind === 'passage'), `${unit.unitId} phải có đoạn văn`);
  assert(dataset.sentenceFilters.some(filter => filter.id === 'translation'));
  assert(dataset.sentenceFilters.some(filter => filter.id === 'dialogue'));
  assert(dataset.sentenceFilters.some(filter => filter.id === 'passage'));
  assert(dataset.sentenceFilters.some(filter => filter.id === 'grammar'));

  const wordChoices = builders.buildWordChoiceItems(dataset, { choiceCount: 4 });
  assert(wordChoices.length > 0, `${unit.unitId} phải tạo được bài chọn từ`);
  assert(wordChoices.every(item => item.canonicalItemId), 'Word activity phải giữ canonicalItemId');

  const sentenceOrdering = builders.buildSentenceOrderingItems(dataset);
  assert(sentenceOrdering.length > 0, `${unit.unitId} phải tạo được bài xếp câu`);
  assert(sentenceOrdering.every(item => item.tokens.length >= 3));

  for (const group of dataset.groups) {
    assert(builders.buildGroupSequenceItem(group).canonicalItemId === group.id);
    assert(builders.buildGroupDictationItems(group).every(item => item.groupContext));
    assert(builders.buildGroupFullDictationItem(group).segments.length === group.items.length);
  }
}


const invalidFilters = JSON.parse(JSON.stringify(sampleDataset));
invalidFilters.sentenceFilters.push({ id: 'dialogue', label: 'Trùng', tag: 'dialogue' });
const invalidFilterValidation = adapters.validateDataset(invalidFilters);
assert(!invalidFilterValidation.ok, 'Validator phải từ chối sentenceFilters trùng id');
assert(invalidFilterValidation.errors.some(error => error.includes('sentenceFilters')));

console.log('LDSN common schema tests passed.');

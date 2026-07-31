const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const Core = require(path.join(root, 'modules/listening/core.js'));
const Adapters = require(path.join(root, 'modules/listening/source-adapters.js'));
const Builders = require(path.join(root, 'modules/listening/activity-builders.js'));

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
}

const level = readJson('modules/hanzi-stroke/data/learning/hsk/hsk_1.json');
const grammar = readJson('modules/hanzi-stroke/data/learning/grammar/new_hsk_1.json');
const manifest = readJson('modules/listening/data/structures/new-hsk/manifest.json');
const sample = manifest.units[0];
const structure = readJson(`modules/listening/data/structures/new-hsk/${sample.structureFile}`);

const units = Adapters.listNewHskUnits(level, { levelId: 'new-hsk-1', sectionType: 'lesson' });
assert.strictEqual(units.length, 15, 'New HSK 1 phải có 15 bài nguồn');
assert(units.some((unit) => unit.unitId === sample.unitId), 'Không tìm thấy bài mẫu trong dữ liệu nguồn');

const dataset = Adapters.adaptNewHskUnit(level, grammar, structure, sample.unitId, {
  structureFile: `modules/listening/data/structures/new-hsk/${sample.structureFile}`,
  sourceFile: 'modules/hanzi-stroke/data/learning/hsk/hsk_1.json',
  grammarFile: 'modules/hanzi-stroke/data/learning/grammar/new_hsk_1.json'
});
const validation = Adapters.validateDataset(dataset);
assert.deepStrictEqual(validation.errors, [], `Schema lỗi: ${validation.errors.join(' | ')}`);
assert.strictEqual(validation.ok, true);
assert(dataset.words.length >= 15, 'Bài mẫu phải có đủ từ nguồn');
assert(dataset.words.every((word) => !word.pinyin.includes('*')), 'Pinyin hiển thị không được còn dấu * nội bộ');
assert(dataset.words.every((word) => !('audio' in word) && !('audioUrl' in word) && !('sound' in word)), 'Adapter không được đưa URL audio nguồn vào tab Nghe');
assert.strictEqual(dataset.sentences.length, 60, 'Bài mẫu phải có đúng 60 câu phân biệt');
assert.strictEqual(dataset.stats.vocabularyExampleCount, 53, 'Phải có 53 ví dụ từ vựng gốc');
assert.strictEqual(dataset.stats.grammarOnlyCount, 2, 'Phải có 2 câu ngữ pháp riêng không trùng ví dụ từ vựng');
assert.strictEqual(dataset.stats.grammarExampleCount, 3, 'Bộ lọc ngữ pháp phải có 3 câu, gồm 1 câu giao với ví dụ từ vựng');
assert.strictEqual(dataset.stats.authoredSentenceCount, 5, 'Phải có 5 câu biên soạn cho hoạt động');
assert.strictEqual(dataset.stats.sourceSentenceCount, 55, 'Tổng nội dung nguồn phân biệt phải là 55 câu');
const dialogues = dataset.groups.filter((group) => group.kind === 'dialogue');
const passages = dataset.groups.filter((group) => group.kind === 'passage');
assert.strictEqual(dialogues.length, 1, 'Bài mẫu cần 1 hội thoại');
assert.strictEqual(passages.length, 1, 'Bài mẫu cần 1 đoạn văn');
assert.strictEqual(dataset.dialogues, undefined, 'Schema chuẩn không lưu mảng dialogues dẫn xuất');
assert.strictEqual(dataset.passages, undefined, 'Schema chuẩn không lưu mảng passages dẫn xuất');
assert(dataset.sentences.some((item) => item.sentenceType === 'grammar-example' || item.alsoGrammarExample), 'Thiếu câu ngữ pháp');

const dialogue = dialogues[0];
const passage = passages[0];
assert.strictEqual(dialogue.items.length, 8, 'Hội thoại mẫu phải có 8 lượt');
assert.strictEqual(passage.items.length, 4, 'Đoạn mẫu phải có 4 câu');
assert(dialogue.items.every((item) => item.speaker), 'Mọi lượt hội thoại phải có speaker');
assert(dialogue.items.every((item) => item.tokens.length >= 2), 'Dữ liệu hội thoại phải có token để làm ngữ cảnh');
assert(passage.items.every((item) => item.tokens.length >= 2), 'Dữ liệu đoạn văn phải có token để làm ngữ cảnh');

const wordChoices = Builders.buildWordChoiceItems(dataset, { choiceCount: 4 });
assert.strictEqual(wordChoices.length, dataset.words.length);
assert(wordChoices.every((item) => item.choices.length === 4), 'Mặc định phải có 4 lựa chọn');
assert(wordChoices.every((item) => item.choices.some((choice) => choice.id === item.answerId)), 'Mỗi câu hỏi phải chứa đáp án đúng');
assert.deepStrictEqual(
  Builders.buildWordChoiceItems(dataset, { choiceCount: 4 })[0].choices,
  wordChoices[0].choices,
  'Xáo lựa chọn phải ổn định để reload không đổi'
);

const hardChoices = Builders.buildWordChoiceItems(dataset, { choiceCount: 5 });
assert(hardChoices.every((item) => item.choices.length === 5), 'Mức khó phải có 5 lựa chọn');

const sentenceOrdering = Builders.buildSentenceOrderingItems(dataset);
assert(sentenceOrdering.length > 0, 'Phải tạo được bài xếp câu');
assert(sentenceOrdering.every((item) => item.tokens.length >= 3), 'Không được tạo bài xếp câu dưới 3 token');
assert(sentenceOrdering.every((item) => item.tokens.map((token) => token.text).join('') === Core.answerUnits(item.text).join('')), 'Token phải ghép đúng câu gốc');

const dialogueSequence = Builders.buildGroupSequenceItem(dialogue);
assert.strictEqual(dialogueSequence.cards.length, 8);
assert.strictEqual(dialogueSequence.shuffledCards.length, 8);
const dialogueTokens = Builders.buildGroupTokenItems(dialogue);
const dialogueDictation = Builders.buildGroupDictationItems(dialogue);
const dialogueFullDictation = Builders.buildGroupFullDictationItem(dialogue);
assert.strictEqual(dialogueTokens.length, 5, 'Ba lượt hội thoại dưới 3 token phải bị loại khỏi hoạt động xếp từ');
assert.strictEqual(dialogueDictation.length, 8, 'Chép hội thoại vẫn phải giữ đủ 8 lượt');
assert(dialogueTokens.every((item) => item.tokens.length >= 3), 'Mọi lượt xếp từ phải có ít nhất 3 token');
assert(dialogueTokens.every((item) => item.groupContext.kind === 'dialogue'));
assert(dialogueTokens.every((item) => item.groupContext.items.length === 8), 'Xếp từng câu vẫn phải giữ toàn bộ hội thoại làm ngữ cảnh');
assert(dialogueDictation.every((item) => item.groupContext.items.length === 8), 'Chép từng câu phải có toàn bộ hội thoại làm ngữ cảnh');
assert(dialogueTokens[0].groupContext.practiceItemIds.length === 5, 'Ngữ cảnh phải biết câu nào thực sự được dùng để xếp từ');
assert.strictEqual(dialogueFullDictation.fullGroupDictation, true, 'Thiếu chế độ chép nguyên hội thoại');
assert.strictEqual(dialogueFullDictation.groupKind, 'dialogue');
assert.strictEqual(dialogueFullDictation.segments.length, 8, 'Chép nguyên hội thoại phải giữ đủ 8 lượt');
assert(dialogueFullDictation.segments.every((segment) => segment.speaker), 'Chép nguyên hội thoại phải giữ tên người nói');
assert.strictEqual(Core.answerUnits(dialogueFullDictation.text).length, dialogue.items.reduce((sum, item) => sum + Core.answerUnits(item.text).length, 0));

const passageSequence = Builders.buildGroupSequenceItem(passage);
assert.strictEqual(passageSequence.cards.length, 4);
assert.strictEqual(Builders.buildGroupTokenItems(passage).length, 4);
assert(Builders.buildGroupTokenItems(passage).every((item) => item.tokens.length >= 3));
assert.strictEqual(Builders.buildGroupDictationItems(passage).length, 4);
assert(Builders.buildGroupDictationItems(passage).every((item) => item.groupContext.items.length === 4), 'Chép đoạn phải có toàn bộ đoạn làm ngữ cảnh');
const passageFullDictation = Builders.buildGroupFullDictationItem(passage);
assert.strictEqual(passageFullDictation.fullGroupDictation, true, 'Thiếu chế độ chép nguyên đoạn');
assert.strictEqual(passageFullDictation.groupKind, 'passage');
assert.strictEqual(passageFullDictation.segments.length, 4, 'Chép nguyên đoạn phải giữ đủ 4 câu');
assert.strictEqual(dataset.capabilities.dialogueFullDictation, true);
assert.strictEqual(dataset.capabilities.passageFullDictation, true);

assert.strictEqual(dataset.rules.audio, 'user-mp3-or-device-tts');
assert.strictEqual(dataset.rules.defaultChoiceCount, 4);
assert.strictEqual(dataset.rules.hardChoiceCount, 5);
assert.strictEqual(dataset.rules.grammarIncludedInAllSentences, true);

console.log('PASS: New HSK 1 listening sample schema, activities and deterministic reload state');

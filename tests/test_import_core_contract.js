const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const ImportCore = require(path.join(root, 'modules/shared/import-core.js'));

function parsedRows(fileName, rows) {
  return {
    format: 'json',
    fileName,
    data: { format: ImportCore.LISTENING_FORMAT, rows }
  };
}

const sharedRows = [
  { row_type: 'group', library_group_id: 'g1', library_group_name: 'Nhóm mẫu', deck_id: 'd1', deck_name: 'Bộ tổng hợp' },
  { row_type: 'word', library_group_id: 'g1', deck_id: 'd1', deck_name: 'Bộ tổng hợp', hanzi: '你好', pinyin: 'nǐ hǎo', meaning: 'xin chào' },
  { row_type: 'sentence', library_group_id: 'g1', deck_id: 'd1', hanzi: '你好！', pinyin: 'nǐ hǎo', meaning: 'Xin chào!' },
  { row_type: 'dialogue_turn', library_group_id: 'g1', deck_id: 'd1', content_group_id: 'dlg1', content_group_title: 'Chào hỏi', order: 1, speaker: 'A', hanzi: '你好！', pinyin: 'nǐ hǎo', meaning: 'Xin chào!' },
  { row_type: 'dialogue_turn', library_group_id: 'g1', deck_id: 'd1', content_group_id: 'dlg1', content_group_title: 'Chào hỏi', order: 2, speaker: 'B', hanzi: '你好！很高兴认识你。', pinyin: 'nǐ hǎo, hěn gāoxìng rènshi nǐ', meaning: 'Xin chào, rất vui được gặp bạn.' },
  { row_type: 'passage_sentence', library_group_id: 'g1', deck_id: 'd1', content_group_id: 'p1', content_group_title: 'Giới thiệu', order: 1, hanzi: '我叫李文。', pinyin: 'wǒ jiào Lǐ Wén', meaning: 'Tôi tên là Lý Văn.' },
  { row_type: 'passage_sentence', library_group_id: 'g1', deck_id: 'd1', content_group_id: 'p1', content_group_title: 'Giới thiệu', order: 2, hanzi: '我学习汉语。', pinyin: 'wǒ xuéxí Hànyǔ', meaning: 'Tôi học tiếng Trung.' },
  { row_type: 'word', deck_id: 'd2', deck_name: 'Bộ riêng', hanzi: '谢谢', pinyin: 'xièxie', meaning: 'cảm ơn' }
];

const listening = ImportCore.buildListeningImport(parsedRows('listening.json', sharedRows));
assert.deepStrictEqual(listening.errors, []);
assert.strictEqual(listening.groups.length, 1, 'one library group');
assert.strictEqual(listening.decks.length, 2, 'different deck_id creates separate decks');
const combined = listening.decks.find(deck => deck.id === 'd1');
assert(combined, 'same deck_id must create one combined deck');
assert.strictEqual(combined.dataset.schemaVersion, 1);
assert.strictEqual(combined.dataset.words.length, 1);
assert(combined.dataset.sentences.length >= 4);
assert.strictEqual(combined.dataset.groups.filter(group => group.kind === 'dialogue').length, 1);
assert.strictEqual(combined.dataset.groups.filter(group => group.kind === 'passage').length, 1);
assert.strictEqual(combined.dataset.grammar.length, 0, 'no grammar sheet in first release');

const legacy = ImportCore.normalizeExistingListeningDeck({
  id: 'legacy', name: 'Legacy', cards: [
    { word: '我学习中文。', pinyin: 'wǒ xuéxí Zhōngwén', meaningVi: 'Tôi học tiếng Trung.' }
  ]
});
assert.strictEqual(legacy.dataset.words.length, 0, 'legacy cards must not be guessed as words');
assert.strictEqual(legacy.dataset.sentences.length, 1, 'legacy cards migrate to sentences');

const merged = ImportCore.mergeListeningDatasets(listening.decks, { id: 'g1', title: 'Học toàn nhóm' });
assert.strictEqual(merged.schemaVersion, 1);
assert(merged.words.length >= 2);
assert(merged.sentences.length >= combined.dataset.sentences.length);
assert.strictEqual(merged.rules.mergedLibraryGroup, true);

const flashcard = ImportCore.buildFlashcardImport({
  format: 'json',
  fileName: 'flashcards.json',
  data: {
    format: ImportCore.FLASHCARD_FORMAT,
    rows: [
      { row_type: 'group', library_group_id: 'fg1', library_group_name: 'Nhóm thẻ', deck_id: 'fd1', deck_name: 'Bộ 1' },
      { row_type: 'card', library_group_id: 'fg1', deck_id: 'fd1', deck_name: 'Bộ 1', hanzi: '你好', pinyin: 'nǐ hǎo', meaning: 'xin chào' },
      { row_type: 'card', library_group_id: 'fg1', deck_id: 'fd1', deck_name: 'Bộ 1', hanzi: '谢谢', pinyin: 'xièxie', meaning: 'cảm ơn' },
      { row_type: 'card', deck_id: 'fd2', deck_name: 'Bộ 2', hanzi: '再见', pinyin: 'zàijiàn', meaning: 'tạm biệt' }
    ]
  }
});
assert.deepStrictEqual(flashcard.errors, []);
assert.strictEqual(flashcard.groups.length, 1);
assert.strictEqual(flashcard.decks.length, 2);
assert.strictEqual(flashcard.stats.cardCount, 3);

const listeningStore = fs.readFileSync(path.join(root, 'modules/listening/library-store.js'), 'utf8');
const flashcardApp = fs.readFileSync(path.join(root, 'modules/hanzi-stroke/app.js'), 'utf8');
assert(listeningStore.includes('const DB_VERSION = 2'), 'listening DB must be versioned for migration');
assert(listeningStore.includes('nextAvailableId(originalId, usedDeckIds)'), 'normal listening import must remap IDs');
assert(flashcardApp.includes('nextFlashcardImportId(originalId, usedDeckIds)'), 'normal flashcard import must remap IDs');
assert(flashcardApp.includes('data-flashcard-curriculum-open'), 'curriculum browser must stay inside Flashcards');
assert(flashcardApp.includes('data-flashcard-curriculum-custom-count'));
assert(flashcardApp.includes('data-flashcard-curriculum-card'));

console.log('PASS import core contracts');

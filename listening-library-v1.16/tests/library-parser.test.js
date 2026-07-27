const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

global.window = global;
vm.runInThisContext(fs.readFileSync(require('path').join(__dirname, '../modules/listening/library-store.js'), 'utf8'));

const data = {
  version: 2,
  groups: [{ id: 'group-301', name: '301 · Bài 1–5' }],
  decks: [
    { id: 'deck-1', name: 'Đoạn 1', groupId: 'group-301', cards: [{ id: 'c1', speaker: '玛丽', word: '玛丽：老师，您早！', pinyin: 'Mǎlì: Lǎoshī, nín zǎo!' }] },
    { id: 'deck-2', name: 'Đoạn 2', groupId: 'group-301', cards: [{ id: 'c2', word: '你好！' }] },
    { id: 'deck-3', name: 'Đoạn 3', groupId: 'group-301', cards: [{ id: 'c3', word: '你去哪儿？' }] }
  ]
};
const parsed = window.ListeningLibraryStore.parseImportPayload(data, 'sample.json');
assert.equal(parsed.groups.length, 1);
assert.equal(parsed.decks.length, 3);
assert.equal(parsed.decks[0].groupId, 'group-301');
assert.equal(parsed.decks[0].cards[0].word, '老师，您早！');
assert.equal(parsed.decks[0].cards[0].speaker, '玛丽');
assert.equal(parsed.decks.reduce((sum, d) => sum + d.cards.length, 0), 3);

const old = window.ListeningLibraryStore.parseImportPayload({ title: 'Cũ', items: [{ text: '你好！', pinyin: 'Nǐ hǎo!' }] }, 'old.json');
assert.equal(old.groups.length, 0);
assert.equal(old.decks.length, 1);
assert.equal(old.decks[0].groupId, null);
assert.equal(old.decks[0].cards[0].word, '你好！');
console.log('library-parser.test.js: PASS');

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Matching = require(path.join(path.resolve(__dirname, '..', '..'), 'modules', 'shared', 'matching-engine.js'));

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE = path.join(ROOT, 'modules', 'new-hsk-course');
const appSource = fs.readFileSync(path.join(MODULE, 'app.js'), 'utf8');
let clickHandler = null;
const storage = new Map();
const sessionStorageMap = new Map();
const root = {
  innerHTML: '',
  addEventListener(type, handler) { if (type === 'click') clickHandler = handler; }
};
const documentStub = {
  title: '',
  body: { classList: { add() {}, remove() {} }, appendChild() {} },
  documentElement: { scrollTop: 0 },
  getElementById(id) { return id === 'newHskCourseApp' ? root : null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() { return { classList: { add() {}, remove() {} }, dataset: {}, addEventListener() {}, querySelector() { return null; } }; }
};
const locationStub = {
  href: 'http://example.test/modules/new-hsk-course/index.html?level=1&lesson=1&view=book',
  origin: 'http://example.test',
  pathname: '/modules/new-hsk-course/index.html',
  search: '?level=1&lesson=1&view=book',
  hash: ''
};
const windowStub = {
  location: locationStub,
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); }
  },
  sessionStorage: {
    getItem(key) { return sessionStorageMap.has(key) ? sessionStorageMap.get(key) : null; },
    setItem(key, value) { sessionStorageMap.set(key, String(value)); },
    removeItem(key) { sessionStorageMap.delete(key); }
  },
  history: { state: null, replaceState() {}, pushState() {} },
  addEventListener() {},
  setTimeout,
  scrollY: 0,
  scrollBy() {},
  scrollTo() {},
  TiengTrungLearningHistory: { recordCurrent() {} },
  TiengTrungMatching: Matching
};

async function fetchStub(url) {
  const clean = String(url).split('?')[0];
  const relative = clean === 'data/manifest.json' ? clean : clean.replace(/^data\//, 'data/');
  const file = path.join(MODULE, relative);
  return {
    ok: fs.existsSync(file),
    status: fs.existsSync(file) ? 200 : 404,
    async json() { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  };
}

const context = {
  window: windowStub,
  document: documentStub,
  location: locationStub,
  history: windowStub.history,
  localStorage: windowStub.localStorage,
  sessionStorage: windowStub.sessionStorage,
  fetch: fetchStub,
  URL,
  URLSearchParams,
  Audio: function Audio() {},
  SpeechSynthesisUtterance: function SpeechSynthesisUtterance() {},
  requestAnimationFrame(callback) { callback(); },
  setTimeout,
  clearTimeout,
  console
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(appSource, context, { filename: 'new-hsk-course/app.js' });

const wait = () => new Promise(resolve => setTimeout(resolve, 20));
const targetFor = (selector, dataset) => ({
  closest(query) { return query === selector ? { dataset, closest() { return null; } } : null; }
});

(async () => {
  await wait();
  assert(clickHandler, 'renderer click handler not bound');
  assert(root.innerHTML.includes('nhsk-dialogue-line--hanzi'), 'Hanzi dialogue must be visible by default');
  assert(root.innerHTML.includes('nhsk-dialogue-line--pinyin'), 'Pinyin dialogue must be visible by default');
  assert(root.innerHTML.includes('nhsk-dialogue-line--vi'), 'Vietnamese dialogue must be visible by default');
  assert(!root.innerHTML.includes('data-nhsk-vocab-view="grid"'), 'Book view must not expose grid control');

  clickHandler({ target: targetFor('[data-nhsk-layer-scope][data-nhsk-layer]', { nhskLayerScope: 'dialogue', nhskLayer: 'pinyin' }) });
  assert(root.innerHTML.includes('nhsk-dialogue-line--hanzi'), 'Hanzi must stay visible when Pinyin is disabled');
  assert(windowStub.NewHskCourse.getState().dialogueLayers.pinyin === false, 'Pinyin must toggle independently');
  assert(root.innerHTML.includes('nhsk-dialogue-line--vi'), 'Vietnamese must stay visible');

  clickHandler({ target: targetFor('[data-nhsk-view]', { nhskView: 'practice' }) });
  assert(root.innerHTML.includes('data-nhsk-practice="flashcards"'), 'Practice tab must expose aggregate Flashcard');
  assert(root.innerHTML.includes('data-nhsk-practice-source="all"'), 'Practice setup must allow all or individual sources');
  assert(root.innerHTML.includes('🎓 Flashcard'), 'Practice tab must expose Flashcard');
  assert(root.innerHTML.includes('Dịch Trung → Việt'), 'Practice tab must expose translation');
  assert(root.innerHTML.includes('Cấu tạo &amp; Bộ thủ') || root.innerHTML.includes('Cấu tạo & Bộ thủ'), 'Practice tab must expose character review');

  clickHandler({ target: targetFor('[data-nhsk-start-practice]', {}) });
  const flashcardPayload = JSON.parse(sessionStorageMap.get('tiengTrung.hsk.externalFlashcard.v1') || 'null');
  assert(flashcardPayload?.cards?.length > 12, 'Aggregate Flashcard must include more than vocabulary cards');
  assert(flashcardPayload.cards.some(card => card.cardType === 'grammar'), 'Aggregate Flashcard must include grammar cards');
  assert(flashcardPayload.cards.some(card => card.cardType === 'sentence'), 'Aggregate Flashcard must include sentence/dialogue cards');
  assert(flashcardPayload.cards.some(card => card.structureUrl), 'Flashcards with Hanzi must link to character details');
  assert(flashcardPayload.cards.every(card => card.structurePracticeUrl), 'Every aggregate card must link back to selected-card character practice');
  locationStub.href = 'http://example.test/modules/new-hsk-course/index.html?level=1&lesson=1&view=practice';

  const practiceChecks = [
    ['fill', 'data-nhsk-fill-card'],
    ['ordering', 'data-nhsk-order-exercise'],
    ['roleplay', 'data-nhsk-role-speaker']
  ];
  for (const [practice, marker] of practiceChecks) {
    clickHandler({ target: targetFor('[data-nhsk-practice]', { nhskPractice: practice }) });
    clickHandler({ target: targetFor('[data-nhsk-start-practice]', {}) });
    assert(root.innerHTML.includes(marker), `Practice activity ${practice} must render ${marker}`);
  }

  clickHandler({ target: targetFor('[data-nhsk-practice]', { nhskPractice: 'characters' }) });
  clickHandler({ target: targetFor('[data-nhsk-character-mode]', { nhskCharacterMode: 'sort' }) });
  clickHandler({ target: targetFor('[data-nhsk-start-practice]', {}) });
  assert(root.innerHTML.includes('data-radical-item'), 'Character review must render curated radical items');
  assert(root.innerHTML.includes('data-radical-drop'), 'Radical review must render drop targets');
  clickHandler({ target: targetFor('[data-radical-item]', { radicalItem: 'nhsk-1-01-radical-item-001' }) });
  clickHandler({ target: targetFor('[data-radical-drop]', { radicalDrop: 'nhsk-1-01-radical-group-nhan' }) });
  assert(root.innerHTML.includes('Điểm 1 / 11'), 'Correct radical assignment must increase the score');
  assert(root.innerHTML.includes('Đúng: 你 thuộc Bộ Nhân.'), 'Correct radical assignment must show feedback');

  clickHandler({ target: targetFor('[data-nhsk-view]', { nhskView: 'grouped' }) });
  assert(root.innerHTML.includes('data-nhsk-vocab-view="grid"'), 'Grouped content must expose grid control');
  assert(root.innerHTML.includes('data-nhsk-open-flashcards'), 'Grouped content must expose Flashcard action');

  clickHandler({ target: targetFor('[data-nhsk-vocab-view]', { nhskVocabView: 'grid' }) });
  assert(root.innerHTML.includes('nhsk-vocab-list--grid'), 'Grid mode must render the vocabulary grid');

  console.log('new HSK renderer runtime: full dialogue layers, practice tab, book list, grouped grid and flashcard passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

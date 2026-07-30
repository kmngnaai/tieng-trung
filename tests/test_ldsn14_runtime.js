'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(ROOT, 'modules/ldsn14/app.js'), 'utf8');
const payload = JSON.parse(fs.readFileSync(path.join(ROOT, 'modules/ldsn14/data/lessons.json'), 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createRuntime(search) {
  const storage = new Map();
  const listeners = {};
  const root = { innerHTML: '', addEventListener(type, handler) { listeners[type] = handler; } };
  const panel = { innerHTML: '' };
  const location = new URL(`https://example.test/modules/ldsn14/index.html${search}`);
  const document = {
    title: '',
    getElementById(id) { return id === 'ldsnApp' ? root : id === 'ldsnPanel' ? panel : null; },
    querySelectorAll() { return []; }
  };
  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  };
  const context = {
    console,
    document,
    localStorage,
    location,
    history: { replaceState(_a, _b, url) { if (url) context.location = new URL(String(url), location.href); } },
    fetch: async () => ({ ok: true, json: async () => payload }),
    setTimeout,
    clearTimeout,
    requestAnimationFrame: callback => callback(),
    URL,
    URLSearchParams,
    SpeechSynthesisUtterance: function SpeechSynthesisUtterance(text) { this.text = text; }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: 'modules/ldsn14/app.js' });
  return { context, root, panel, listeners, storage };
}

function clickTarget(selector, object) {
  return { closest(query) { return query === selector ? object : null; } };
}

(async () => {
  const course = createRuntime('');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert((course.root.innerHTML.match(/class="ldsn-lesson-card"/g) || []).length === 10, 'Course landing must render 10 lesson cards');

  const lesson = createRuntime('?lesson=1');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert(lesson.root.innerHTML.includes('Học'), 'Lesson must render Học tab');
  assert(lesson.root.innerHTML.includes('Luyện'), 'Lesson must render Luyện tab');
  assert(lesson.root.innerHTML.includes('Hội thoại'), 'Lesson must render Hội thoại tab');
  assert(lesson.root.innerHTML.includes('Nội dung'), 'Lesson must render Nội dung tab');
  assert(lesson.root.innerHTML.includes('Ôn'), 'Lesson must render Ôn tab');
  assert((lesson.root.innerHTML.match(/ldsn-vocab-card/g) || []).length === 10, 'Auto vocabulary session must render 10 words');
  assert((lesson.root.innerHTML.match(/data-speak=/g) || []).length >= 10, 'Lesson must render audio controls');
  assert(lesson.root.innerHTML.includes('data-vocab-view="cards"'), 'Vocabulary must offer card view');
  assert(lesson.root.innerHTML.includes('data-vocab-view="list"'), 'Vocabulary must offer list view');
  assert(lesson.root.innerHTML.includes('data-open-word-detail='), 'Vocabulary must open the in-place word detail popup');
  assert(!lesson.root.innerHTML.includes('/modules/lookup/index.html?q='), 'Vocabulary detail must not navigate away from the lesson');
  assert(lesson.root.innerHTML.includes('data-open-flashcards'), 'Vocabulary must launch the shared-style flashcard flow');
  assert(lesson.root.innerHTML.includes('ldsn-grammar-use'), 'Grammar usages must render with their matching examples');
  assert(!lesson.root.innerHTML.includes('Ví dụ 1'), 'Grammar must not add redundant example numbering');
  assert(!lesson.root.innerHTML.includes('Chạm vào từ để mở Tra'), 'Vocabulary hint must describe the in-place detail view');

  const vocabMode = { value: '5', closest(query) { return query === '[data-vocab-mode]' ? this : null; } };
  lesson.listeners.change({ target: vocabMode });
  const savedVocab = JSON.parse(lesson.storage.get('tiengTrung.ldsn14.settings.v1'));
  assert(savedVocab.vocabModeByLesson['ldsn-01'] === '5', 'Vocabulary amount must persist per lesson');

  const customCountButton = {
    closest(query) {
      if (query === '[data-apply-vocab-count]') return this;
      if (query === '.ldsn-number-control') return { querySelector() { return { value: '12' }; } };
      return null;
    }
  };
  lesson.listeners.click({ target: customCountButton });
  const savedCustomCount = JSON.parse(lesson.storage.get('tiengTrung.ldsn14.settings.v1'));
  assert(savedCustomCount.vocabModeByLesson['ldsn-01'] === '12', 'Custom vocabulary count must persist per lesson');
  assert((lesson.panel.innerHTML.match(/ldsn-vocab-card/g) || []).length === 12, 'Custom vocabulary count must control the flashcard session');

  const listModeButton = { dataset: { vocabView: 'list' } };
  lesson.listeners.click({ target: clickTarget('[data-vocab-view]', listModeButton) });
  const savedListMode = JSON.parse(lesson.storage.get('tiengTrung.ldsn14.settings.v1'));
  assert(savedListMode.vocabViewMode === 'list', 'Vocabulary card/list view must persist');
  assert(lesson.panel.innerHTML.includes('ldsn-vocab-list-item'), 'List view must render vocabulary rows');
  assert(!lesson.panel.innerHTML.includes('Từ 1'), 'Vocabulary items must not display redundant numbering');

  const dialogue = createRuntime('?lesson=1&tab=dialogue');
  await new Promise(resolve => setTimeout(resolve, 20));
  const modeButton = { dataset: { roleMode: 'ordering' } };
  dialogue.listeners.click({ target: clickTarget('[data-role-mode]', modeButton) });
  const saved = JSON.parse(dialogue.storage.get('tiengTrung.ldsn14.settings.v1'));
  assert(saved.roleplayMode === 'ordering', 'Roleplay mode must persist after one selection');
  assert(dialogue.panel.innerHTML.includes('data-token-bank'), 'Ordering mode must render word tokens');
  assert(dialogue.panel.innerHTML.includes('speaker-a') && dialogue.panel.innerHTML.includes('speaker-b'), 'Dialogue speakers must use two stable color classes');

  const practice = createRuntime('?lesson=1&tab=practice');
  await new Promise(resolve => setTimeout(resolve, 20));
  const practiceModeButton = { dataset: { roleMode: 'ordering' } };
  practice.listeners.click({ target: clickTarget('[data-role-mode]', practiceModeButton) });
  assert(practice.panel.innerHTML.includes('ldsn-order-workspace'), 'Ordering mode must also render for reverse-translation sentences and passage sentences');
  assert(practice.panel.innerHTML.includes('ldsn-passage-sentence'), 'Passage must be split into collapsible sentence exercises');
  assert(!practice.panel.innerHTML.includes('Trung → Việt · 1'), 'Translation cards must not repeat direction and item number');
  const pinyinModeButton = { dataset: { vocabPracticeMode: 'pinyin' } };
  practice.listeners.click({ target: clickTarget('[data-vocab-practice-mode]', pinyinModeButton) });
  const savedPracticeMode = JSON.parse(practice.storage.get('tiengTrung.ldsn14.settings.v1'));
  assert(savedPracticeMode.vocabPracticeMode === 'pinyin', 'Vocabulary practice target must persist');
  assert((practice.panel.innerHTML.match(/Điền Pinyin/g) || []).length === 6, 'Pinyin-only practice must apply to every vocabulary exercise');

  const content = createRuntime('?lesson=1&tab=content');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert(content.root.innerHTML.includes('ldsn-content-accordion'), 'Content groups must be collapsible on mobile');
  assert(content.root.innerHTML.includes('ldsn-content-vocab-row'), 'Full vocabulary must use a mobile-friendly list instead of a wide table');
  assert(content.root.innerHTML.includes('ldsn-content-vocab-link'), 'Full vocabulary list must keep clickable word rows');
  assert(content.root.innerHTML.includes('data-open-word-detail='), 'Full vocabulary must open the same in-place detail popup');
  assert(!content.root.innerHTML.includes('ldsn-sentence-number'), 'Full sentence list must not show redundant item numbers');

  const ldsnCode = fs.readFileSync(path.join(ROOT, 'modules/ldsn14/app.js'), 'utf8');
  assert(ldsnCode.includes('getFallbackItem') || ldsnCode.includes('renderWordDetailPopup'), 'LDSN must support local fallback details for words missing from Tra');
  assert(ldsnCode.includes("['flashcard', 'reverse', 'listening', 'typing', 'mixed']"), 'LDSN flashcards must reuse the HSK learning modes');
  assert(ldsnCode.includes('pairUses'), 'Grammar must pair each usage with its matching example when counts align');
  const learnHtml = fs.readFileSync(path.join(ROOT, 'modules/hanzi-stroke/index.html'), 'utf8');
  assert(learnHtml.includes('data-study-tab="ldsn14"'), 'Học horizontal tabs must include LDSN1-4');
  assert(learnHtml.includes('ui-module-card--ldsn'), 'Học overview must include the LDSN1-4 card');
  assert(learnHtml.includes('id="studyTabFlashcards"'), 'Học horizontal tabs must keep the existing Thẻ tab');
  const studyNav = learnHtml.match(/<nav class="study-tabs[\s\S]*?<\/nav>/)?.[0] || '';
  assert((studyNav.match(/data-study-tab=/g) || []).length === 5, 'Học horizontal navigation must render all five tabs');
  assert(learnHtml.includes('style.css?v=20260718-deckmultiselect1&ldsn=20260730-4') && learnHtml.includes('app.js?v=20260718-deckmultiselect1&ldsn=20260730-4'), 'Học assets must be cache-busted for the LDSN integration');

  const tabs = ['learn', 'practice', 'dialogue', 'content', 'review'];
  for (let lessonNo = 1; lessonNo <= 10; lessonNo += 1) {
    for (const tab of tabs) {
      const runtime = createRuntime(`?lesson=${lessonNo}&tab=${tab}`);
      await new Promise(resolve => setTimeout(resolve, 8));
      assert(runtime.root.innerHTML.includes(`Bài ${lessonNo}`), `Lesson ${lessonNo}/${tab} did not render`);
      assert(!runtime.root.innerHTML.includes('Không mở được LDSN1-4'), `Lesson ${lessonNo}/${tab} rendered error state`);
    }
  }

  console.log('PASS: LDSN1-4 runtime render and persistence checks');
})();

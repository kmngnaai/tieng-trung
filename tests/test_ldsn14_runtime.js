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

  const dialogue = createRuntime('?lesson=1&tab=dialogue');
  await new Promise(resolve => setTimeout(resolve, 20));
  const modeButton = { dataset: { roleMode: 'ordering' } };
  dialogue.listeners.click({ target: clickTarget('[data-role-mode]', modeButton) });
  const saved = JSON.parse(dialogue.storage.get('tiengTrung.ldsn14.settings.v1'));
  assert(saved.roleplayMode === 'ordering', 'Roleplay mode must persist after one selection');
  assert(dialogue.panel.innerHTML.includes('data-token-bank'), 'Ordering mode must render word tokens');

  const practice = createRuntime('?lesson=1&tab=practice');
  await new Promise(resolve => setTimeout(resolve, 20));
  const practiceModeButton = { dataset: { roleMode: 'ordering' } };
  practice.listeners.click({ target: clickTarget('[data-role-mode]', practiceModeButton) });
  assert(practice.panel.innerHTML.includes('ldsn-order-workspace'), 'Ordering mode must also render for reverse-translation sentences and passage sentences');
  assert(practice.panel.innerHTML.includes('ldsn-passage-sentence'), 'Passage must be split into collapsible sentence exercises');

  const content = createRuntime('?lesson=1&tab=content');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert(content.root.innerHTML.includes('ldsn-content-accordion'), 'Content groups must be collapsible on mobile');
  assert(content.root.innerHTML.includes('ldsn-content-vocab-row'), 'Full vocabulary must use a mobile-friendly list instead of a wide table');


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

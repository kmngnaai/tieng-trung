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

function createRuntime(search, initialStorage = {}) {
  const storage = new Map(Object.entries(initialStorage));
  const listeners = {};
  const rootClasses = new Set();
  const root = {
    innerHTML: '',
    classList: {
      add(name) { rootClasses.add(name); },
      remove(name) { rootClasses.delete(name); },
      toggle(name, force) {
        if (force === true) rootClasses.add(name);
        else if (force === false) rootClasses.delete(name);
        else if (rootClasses.has(name)) rootClasses.delete(name);
        else rootClasses.add(name);
        return rootClasses.has(name);
      },
      contains(name) { return rootClasses.has(name); }
    },
    querySelectorAll() { return []; },
    addEventListener(type, handler) { listeners[type] = handler; }
  };
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
  const sessionStorage = {
    getItem(key) { return storage.has('session:' + key) ? storage.get('session:' + key) : null; },
    setItem(key, value) { storage.set('session:' + key, String(value)); },
    removeItem(key) { storage.delete('session:' + key); }
  };
  const context = {
    console,
    document,
    localStorage,
    sessionStorage,
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
  return { context, root, panel, listeners, storage, rootClasses };
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
  assert(lesson.root.innerHTML.includes('data-open-word-detail='), 'Vocabulary must open the shared HSK word detail popup');
  assert(!lesson.root.innerHTML.includes('/modules/lookup/index.html?q='), 'Vocabulary detail must not use the old lookup navigation');
  assert(lesson.root.innerHTML.includes('data-open-flashcards'), 'Vocabulary must launch the shared-style flashcard flow');
  lesson.listeners.click({ target: clickTarget('[data-open-flashcards]', {}) });
  const externalDeck = JSON.parse(lesson.storage.get('session:tiengTrung.hsk.externalFlashcard.v1'));
  assert(externalDeck.cards.length === 10 && externalDeck.cards[0].source === 'ldsn14', 'LDSN must adapt the selected vocabulary into an external HSK deck');
  assert(String(lesson.context.location.href).includes('/modules/hanzi-stroke/index.html?externalFlashcards=1'), 'LDSN must navigate into the real HSK flashcard engine');
  assert(lesson.root.innerHTML.includes('ldsn-grammar-group'), 'Grammar semantic groups must render with their matching examples');
  assert(!lesson.root.innerHTML.includes('Ví dụ 1'), 'Grammar must not add redundant example numbering');
  assert(!lesson.root.innerHTML.includes('Chạm vào từ để mở Tra'), 'Vocabulary hint must describe the in-place detail view');
  assert(lesson.root.innerHTML.includes('data-toggle-pinyin'), 'LDSN must expose one shared pinyin visibility control');
  assert(lesson.root.innerHTML.includes('data-vocab-settings'), 'Vocabulary controls must be grouped into a compact settings panel');
  assert(!lesson.root.innerHTML.includes('Hoạt động phù hợp tiếp theo'), 'Lesson header must use the compact next-step presentation');
  assert((lesson.root.innerHTML.match(/data-speak="很多时候，别人可以做的事情，你不一定能做。"/g) || []).length === 1, 'Each grammar example must have its own audio button');
  assert(lesson.root.innerHTML.includes('Hěn duō shíhou') && lesson.root.innerHTML.includes('Nhiều khi người khác làm được'), 'Grammar usage examples must keep pinyin and Vietnamese');

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

  const eyeButton = { dataset: {}, closest(query) { return query === '[data-toggle-pinyin]' ? this : null; } };
  const htmlBeforePinyinToggle = lesson.root.innerHTML;
  lesson.listeners.click({ target: eyeButton });
  const savedPinyin = JSON.parse(lesson.storage.get('tiengTrung.ldsn14.settings.v1'));
  assert(savedPinyin.displayPinyin === false, 'Shared pinyin visibility must persist for all LDSN tabs');
  assert(lesson.root.innerHTML === htmlBeforePinyinToggle, 'Pinyin toggle must not rerender the lesson DOM');
  assert(lesson.root.classList.contains('is-pinyin-hidden'), 'Pinyin toggle must hide existing pinyin through one root class');
  assert(lesson.root.innerHTML.includes('dàjiā hǎo'), 'Pinyin nodes must remain in the DOM so they can be shown again without rerendering');
  lesson.listeners.click({ target: eyeButton });
  assert(!lesson.root.classList.contains('is-pinyin-hidden'), 'Second pinyin toggle must reveal the same existing DOM nodes');
  assert(lesson.root.innerHTML === htmlBeforePinyinToggle, 'Showing pinyin again must not rerender the lesson DOM');

  const hiddenOnReload = createRuntime('?lesson=1', {
    'tiengTrung.ldsn14.settings.v1': JSON.stringify({ displayPinyin: false })
  });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert(hiddenOnReload.root.classList.contains('is-pinyin-hidden'), 'Saved hidden-pinyin state must apply after reload');
  assert(hiddenOnReload.root.innerHTML.includes('dàjiā hǎo'), 'Reloaded hidden state must keep pinyin nodes available in the DOM');

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
  assert(practice.root.innerHTML.includes('Nǐ kěyǐ zuò yíxià zìwǒ jièshào ma?'), 'Zh-Vi translation prompts must render their full pinyin when pinyin is enabled');
  const practiceModeButton = { dataset: { roleMode: 'ordering' } };
  practice.listeners.click({ target: clickTarget('[data-role-mode]', practiceModeButton) });
  assert(practice.panel.innerHTML.includes('ldsn-order-workspace'), 'Ordering mode must also render for reverse-translation sentences and passage sentences');
  assert(practice.panel.innerHTML.includes('data-token="你好"') && practice.panel.innerHTML.includes('data-token="请问"') && practice.panel.innerHTML.includes('data-token="王教授"'), 'Ordering must use precomputed semantic tokens');
  const tokenValues = [...practice.panel.innerHTML.matchAll(/data-token="([^"]+)"/g)].map(match => match[1]);
  assert(!tokenValues.includes('好请') && !tokenValues.includes('问你') && !tokenValues.includes('得了中'), 'Ordering must not invent meaningless token pairs');
  assert(practice.panel.innerHTML.includes('ldsn-passage-sentence'), 'Passage must be split into collapsible sentence exercises');
  assert(practice.panel.innerHTML.includes('data-practice-settings'), 'Practice options must be grouped into one compact settings panel');
  assert(!practice.panel.innerHTML.includes('Trung → Việt · 1'), 'Translation cards must not repeat direction and item number');
  const pinyinModeButton = { dataset: { vocabPracticeMode: 'pinyin' } };
  practice.listeners.click({ target: clickTarget('[data-vocab-practice-mode]', pinyinModeButton) });
  const savedPracticeMode = JSON.parse(practice.storage.get('tiengTrung.ldsn14.settings.v1'));
  assert(savedPracticeMode.vocabPracticeMode === 'pinyin', 'Vocabulary practice target must persist');
  assert((practice.panel.innerHTML.match(/Điền Pinyin/g) || []).length === 6, 'Pinyin-only practice must apply to every vocabulary exercise');

  const content = createRuntime('?lesson=1&tab=content');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert(content.root.innerHTML.includes('ldsn-content-accordion'), 'Content groups must be collapsible on mobile');
  assert(content.root.innerHTML.includes('data-toggle-pinyin'), 'Content tab must reuse the shared pinyin eye control');
  assert(content.root.innerHTML.includes('ldsn-content-vocab-row'), 'Full vocabulary must use a mobile-friendly list instead of a wide table');
  const contentHtml = content.root.innerHTML;
  assert(contentHtml.indexOf('Phần 1 · Toàn bộ') < contentHtml.indexOf('Phần 2 · Dịch Trung → Việt · Câu hỏi'), 'Content must start with vocabulary then Zh-Vi questions');
  assert(contentHtml.indexOf('Phân tích ngữ pháp · Câu và hội thoại') < contentHtml.indexOf('Phần 3 · Dịch Việt → Trung · Câu hỏi'), 'Dialogue grammar must stay before the Vi-Zh section');
  assert(contentHtml.indexOf('Phần 3 · Đoạn văn') < contentHtml.indexOf('Phân tích ngữ pháp · Đoạn văn'), 'Passage grammar must follow the passage');
  assert(content.root.innerHTML.includes('ldsn-content-vocab-link'), 'Full vocabulary list must keep clickable word rows');
  assert(content.root.innerHTML.includes('data-open-word-detail='), 'Full vocabulary must open the same in-place detail popup');
  assert(!content.root.innerHTML.includes('ldsn-sentence-number'), 'Full sentence list must not show redundant item numbers');

  const ldsnCode = fs.readFileSync(path.join(ROOT, 'modules/ldsn14/app.js'), 'utf8');
  assert(ldsnCode.includes('buildWordDetailSeed') && ldsnCode.includes('embedPopup=1'), 'LDSN must pass local fallback data into the shared HSK popup');
  assert(ldsnCode.includes('renderSharedWordPreview') && ldsnCode.includes('Đang mở tra cứu và cách viết'), 'Word detail must render immediate LDSN content while advanced detail loads');
  assert(ldsnCode.indexOf('overlay.hidden = false') < ldsnCode.indexOf("frame.src = '../hanzi-stroke/index.html?embedPopup=1&popupHost=1'"), 'Word detail overlay must become visible before the shared HSK frame starts loading');
  assert(ldsnCode.includes("type: 'tiengtrung:hsk-popup-open'") && ldsnCode.includes("type === 'tiengtrung:hsk-popup-ready'"), 'LDSN must reuse one persistent HSK popup host through postMessage');
  assert(!ldsnCode.includes("frame.src = 'about:blank'"), 'Closing word detail must keep the shared engine cached instead of reloading it');
  assert(!ldsnCode.includes('👁') && ldsnCode.includes('ldsn-pinyin-toggle-mark'), 'Pinyin toggle must use a CSS-drawn circle instead of a device-dependent eye glyph');
  assert(ldsnCode.includes('tiengTrung.hsk.externalFlashcard.v1'), 'LDSN flashcards must launch the real HSK engine');
  assert(ldsnCode.includes('grammar.groups'), 'Grammar must render structured semantic groups');
  const hskCode = fs.readFileSync(path.join(ROOT, 'modules/hanzi-stroke/app.js'), 'utf8');
  assert(hskCode.includes("type !== 'tiengtrung:hsk-popup-open'") && hskCode.includes("type: 'tiengtrung:hsk-popup-ready'"), 'Shared HSK popup must accept repeated in-place word opens without reloading the iframe');
  const ldsnCss = fs.readFileSync(path.join(ROOT, 'modules/ldsn14/style.css'), 'utf8');
  assert(ldsnCss.includes('.ldsn-pinyin-toggle-mark::after') && !ldsnCss.includes('.ldsn-eye-btn'), 'Pinyin state indicator must be drawn consistently with CSS');
  const learnHtml = fs.readFileSync(path.join(ROOT, 'modules/hanzi-stroke/index.html'), 'utf8');
  assert(learnHtml.includes('data-study-tab="ldsn14"'), 'Học horizontal tabs must include LDSN1-4');
  assert(learnHtml.includes('ui-module-card--ldsn'), 'Học overview must include the LDSN1-4 card');
  assert(learnHtml.includes('id="studyTabFlashcards"'), 'Học horizontal tabs must keep the existing Thẻ tab');
  const studyNav = learnHtml.match(/<nav class="study-tabs[\s\S]*?<\/nav>/)?.[0] || '';
  assert((studyNav.match(/data-study-tab=/g) || []).length === 5, 'Học horizontal navigation must render all five tabs');
  assert(learnHtml.includes('style.css?v=20260718-deckmultiselect1&ldsn=20260731-6.2') && learnHtml.includes('app.js?v=20260718-deckmultiselect1&ldsn=20260731-6.2'), 'Học assets must be cache-busted for the shared popup host');

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

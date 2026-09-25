const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = process.cwd();
const runtimeBase = path.resolve(
  process.env.GRAMMARV1_RUNTIME_BASE || path.join(ROOT, '_generated/GrammarV1/exercises')
);
const adapterPath = path.join(ROOT, 'modules/shared/grammar-practice.js');
const uiPath = path.join(ROOT, 'modules/shared/grammar-practice-ui.js');
const viewPath = path.join(ROOT, 'modules/shared/grammar-practice-view.js');
const cssPath = path.join(ROOT, 'modules/shared/grammar-practice-ui.css');
const appPath = path.join(ROOT, 'modules/hanzi-stroke/app.js');
const htmlPath = path.join(ROOT, 'modules/hanzi-stroke/index.html');

const Adapter = require(adapterPath);
const Ui = require(uiPath);
const View = require(viewPath);
const uiSource = fs.readFileSync(uiPath, 'utf8');
const viewSource = fs.readFileSync(viewPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const app = fs.readFileSync(appPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');

assert.strictEqual(Ui.VERSION, 'grammar-practice-ui-v1');
assert.deepStrictEqual(Ui.SKILLS, ['mcq', 'translate_zh_vi', 'translate_vi_zh']);
assert(Object.isFrozen(Ui));
assert.strictEqual(View.VERSION, 'grammar-practice-view-v1');
assert(Object.isFrozen(View));
assert(Object.isFrozen(View.SKILL_META));

[
  'fetch(',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'document.',
  'window.location',
  'location.href',
  'buildExternalFlashcardPayload',
  'toGrammarFlashcard',
  'toTranslationFlashcards'
].forEach(token => {
  assert(!uiSource.includes(token), `UI controller side-effect token: ${token}`);
});

[
  'fetch(',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'document.',
  'window.location',
  'location.href'
].forEach(token => {
  assert(!viewSource.includes(token), `Shared Practice presenter side-effect token: ${token}`);
});

const index = JSON.parse(fs.readFileSync(path.join(runtimeBase, 'index.json'), 'utf8'));
assert.strictEqual(index.tracks.length, 7);

let tracksChecked = 0;
let mcqAutoChecks = 0;
let translationSelfReviewChecks = 0;

for(const trackRow of index.tracks){
  const track = JSON.parse(fs.readFileSync(path.join(runtimeBase, trackRow.file), 'utf8'));
  const grammar = Adapter.findGrammar(track, track.grammars[0].grammarId);
  assert(grammar, `${trackRow.file}: missing sample grammar`);

  const session = Ui.createSession(Adapter, grammar, { skill: 'mcq' });
  let view = Ui.getView(session);
  assert.strictEqual(view.total, 10);
  assert.strictEqual(view.exercise.type, 'mcq');

  const good = Ui.submit(session, view.exercise.answer);
  assert.strictEqual(good.mode, 'auto');
  assert.strictEqual(good.correct, true);
  mcqAutoChecks += 1;

  Ui.resetAnswer(session);
  view = Ui.getView(session);
  const wrongOption = view.exercise.options.find(option => option.id !== view.exercise.answer);
  const bad = Ui.submit(session, wrongOption.id);
  assert.strictEqual(bad.mode, 'auto');
  assert.strictEqual(bad.correct, false);
  mcqAutoChecks += 1;

  view = Ui.selectSkill(session, 'translate_zh_vi');
  assert.strictEqual(view.total, 5);
  const zhViExact = Ui.submit(session, view.exercise.referenceAnswer);
  assert.strictEqual(zhViExact.mode, 'self-review');
  assert.strictEqual(zhViExact.correct, null);
  translationSelfReviewChecks += 1;

  Ui.resetAnswer(session);
  const zhViAlternate = Ui.submit(session, 'Một cách diễn đạt khác để tự đối chiếu.');
  assert.strictEqual(zhViAlternate.mode, 'self-review');
  assert.strictEqual(zhViAlternate.correct, null);
  translationSelfReviewChecks += 1;

  view = Ui.selectSkill(session, 'translate_vi_zh');
  assert.strictEqual(view.total, 5);
  const viZh = Ui.submit(session, view.exercise.referenceAnswer);
  assert.strictEqual(viZh.mode, 'self-review');
  assert.strictEqual(viZh.correct, null);
  translationSelfReviewChecks += 1;

  const beforeId = Ui.getView(session).exercise.questionId;
  const after = Ui.next(session);
  assert(after.exercise.questionId !== beforeId || after.total === 1);
  assert.strictEqual(after.result, null);

  tracksChecked += 1;
}

assert.strictEqual(tracksChecked, 7);

const begin = app.indexOf('/* G3.2 PRACTICE UI BEGIN */');
const end = app.indexOf('/* G3.2 PRACTICE UI END */');
assert(begin >= 0 && end > begin, 'G3.2 app block missing');
const block = app.slice(begin, end);

assert(block.includes('GrammarPracticeUi.createSession'));
assert(block.includes('GrammarPracticeView.render'));
assert(block.includes('data-grammar-practice'));
assert(block.includes('onStudyCards: launchGrammarPracticeCards'));
assert(!block.includes('GrammarPracticeUi.submit'), 'Hanzi app must delegate submit interaction to shared presenter');
assert(!block.includes('GrammarPracticeUi.selectSkill'), 'Hanzi app must delegate skill interaction to shared presenter');
assert(!block.includes('GrammarPracticeUi.next'), 'Hanzi app must delegate next interaction to shared presenter');
assert(!block.includes('GrammarPracticeUi.shuffleCurrent'), 'Hanzi app must delegate shuffle interaction to shared presenter');
assert(!block.includes('Tự đối chiếu'), 'presentation text must live in shared presenter');
assert(!/flashcard/i.test(block), 'G3.2 block must not add Flashcard engine UI');
assert(!block.includes('localStorage'));
assert(!block.includes('sessionStorage'));
assert(!block.includes('indexedDB'));

[
  'ui.submit',
  'ui.selectSkill',
  'ui.next',
  'ui.shuffleCurrent',
  'data-grammar-practice-study-cards',
  'data-grammar-practice-option',
  'data-grammar-practice-reveal',
  'data-grammar-practice-next',
  'Tự đối chiếu — không chấm đúng/sai',
  'Bài của bạn',
  'Đáp án tham khảo'
].forEach(token => assert(viewSource.includes(token), `Shared presenter missing ${token}`));
assert(!/flashcard/i.test(viewSource), 'Shared presenter must not own the Flashcard engine');

assert(app.includes('void mountGrammarPracticeUi(grammar, body);'));
assert(app.includes('body.dataset.grammarDetailId = grammar.id;'));

const adapterScript = html.indexOf('../shared/grammar-practice.js');
const runtimeScript = html.indexOf('../shared/grammar-practice-runtime.js');
const uiScript = html.indexOf('../shared/grammar-practice-ui.js');
const viewScript = html.indexOf('../shared/grammar-practice-view.js');
const appScript = html.indexOf('app.js?');
assert(
  adapterScript >= 0 &&
  runtimeScript > adapterScript &&
  uiScript > runtimeScript &&
  viewScript > uiScript &&
  appScript > viewScript,
  'GrammarPractice shared presenter script order mismatch'
);
assert(html.includes('../shared/grammar-practice-ui.css'));

[
  '.hsk-grammar-practice',
  '.hsk-grammar-practice__skills',
  '.hsk-grammar-practice__option',
  '.hsk-grammar-practice__translation',
  '.hsk-grammar-practice__self-review'
].forEach(selector => assert(css.includes(selector), `Missing CSS selector ${selector}`));

console.log(
  `PASS GrammarPractice UI: tracks=${tracksChecked} mcqAuto=${mcqAutoChecks} ` +
  `translationSelfReview=${translationSelfReviewChecks} sharedPresenter=PASS noPersistence=PASS noFlashcard=PASS`
);

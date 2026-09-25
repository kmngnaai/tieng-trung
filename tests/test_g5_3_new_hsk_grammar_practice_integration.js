'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = process.cwd();
const appPath = path.join(ROOT, 'modules/new-hsk-course/app.js');
const htmlPath = path.join(ROOT, 'modules/new-hsk-course/index.html');
const cssPath = path.join(ROOT, 'modules/new-hsk-course/style.css');
const viewPath = path.join(ROOT, 'modules/shared/grammar-practice-view.js');
const bridgePath = path.join(ROOT, 'modules/shared/grammar-practice-flashcard.js');
const catalogDir = path.join(ROOT, 'modules/new-hsk-course/data/catalog');
const runtimeBase = path.resolve(process.env.GRAMMARV1_RUNTIME_BASE || path.join(ROOT, '_generated/GrammarV1/exercises'));

const app = fs.readFileSync(appPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const viewSource = fs.readFileSync(viewPath, 'utf8');
const Bridge = require(bridgePath);

function pass(id, detail = '') { console.log(`${id} PASS ${detail}`.trim()); }
function sliceBetween(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `missing block: ${start} -> ${end}`);
  return source.slice(a, b);
}

// C01 — shared Practice stack remains the single implementation.
const adapterAt = html.indexOf('../shared/grammar-practice.js');
const runtimeAt = html.indexOf('../shared/grammar-practice-runtime.js');
const uiAt = html.indexOf('../shared/grammar-practice-ui.js');
const viewAt = html.indexOf('../shared/grammar-practice-view.js');
const bridgeAt = html.indexOf('../shared/grammar-practice-flashcard.js');
const appAt = html.indexOf('app.js?');
assert(adapterAt >= 0 && runtimeAt > adapterAt && uiAt > runtimeAt && viewAt > uiAt && bridgeAt > viewAt && appAt > bridgeAt);
assert(html.includes('../shared/grammar-practice-ui.css'));
pass('C01', 'shared Practice dependencies unchanged');

// C02 — runtime lookup remains grammarId-only.
assert(app.includes("const GRAMMAR_PRACTICE_RUNTIME_BASE = '../GrammarV1/runtime/exercises/';"));
assert(app.includes('GrammarPracticeRuntime.createLoader({'));
assert(app.includes('async function loadGrammarPracticeById(grammarId)'));
const loadBlock = sliceBetween(app, 'async function loadGrammarPracticeById(grammarId)', 'function formatGrammarPracticeText(value)');
assert(!/topic|title|fuzzy|normalize.*grammar/i.test(loadBlock));
pass('C02', 'runtime lookup remains exact grammarId');

// C03 — A + C share the existing popup and Practice is at the bottom for both routes.
const popupBlock = sliceBetween(app, 'function renderGrammarPopupContent(item, options = {})', 'function ensureGrammarPopup()');
const examplesAt = popupBlock.indexOf('hsk-grammar-examples');
const popupHostAt = popupBlock.indexOf('data-nhsk-grammar-practice-host="popup"');
assert(examplesAt >= 0 && popupHostAt > examplesAt);
assert(!popupBlock.includes('options.plus === true ? `<section class="hsk-popup-section nhsk-grammar-practice-host'));
assert(!popupBlock.includes('grammar-practice-overlay'));
const syncPopupBlock = sliceBetween(app, 'function syncGrammarPopup()', 'function buildGrammarPracticeReturnSnapshot');
assert(syncPopupBlock.includes("const mode = plusMode ? 'plus' : 'catalog';"));
assert(syncPopupBlock.includes('mountNewHskGrammarPractice(item.id, host, { mode, grammarId: item.id })'));
pass('C03', 'NP+ and Catalog both mount Practice at popup bottom');

// C04 — Catalog card has no external inline Practice anymore.
const cardBlock = sliceBetween(app, 'function renderGrammarCard(item, index = 0, options = {})', 'function renderGrammarCatalog()');
assert(!cardBlock.includes('data-nhsk-grammar-practice-toggle'));
assert(!cardBlock.includes('data-nhsk-grammar-practice-host="inline"'));
assert(!cardBlock.includes('nhsk-grammar-card-shell'));
pass('C04', 'Catalog card opens popup only');

// C05 — B uses explicit lessonPracticeIdentity.sourceRef only.
const lessonIdentityBlock = sliceBetween(app, 'function lessonGrammarPracticeItemBySourceRef(sourceRef)', 'function renderLessonGrammarPractice(sourceRef)');
assert(lessonIdentityBlock.includes('item?.lessonPracticeIdentity?.sourceRef'));
assert(!lessonIdentityBlock.includes('exampleMerge'));
assert(!/\.topic|\.title|fuzzy|order/i.test(lessonIdentityBlock));
const lessonRenderBlock = sliceBetween(app, 'function renderLessonGrammarPractice(sourceRef)', 'function renderGrammarDisplayBody(display = {}, includeToolbar = true, section = null)');
assert(lessonRenderBlock.includes('data-nhsk-lesson-grammar-practice'));
assert(lessonRenderBlock.includes('data-nhsk-lesson-grammar-practice-toggle'));
assert(lessonRenderBlock.includes('data-nhsk-grammar-practice-host="inline"'));
assert(lessonRenderBlock.includes('aria-expanded="${practiceOpen}"'));
pass('C05', 'lesson-native Practice requires explicit sourceRef identity');

// C06 — section-level and group-level sourceRef shapes are deterministic, not inferred by titles.
const grammarDisplayBlock = sliceBetween(app, 'function renderGrammarDisplayBody(display = {}, includeToolbar = true, section = null)', 'function renderGrammarSection(section)');
assert(grammarDisplayBlock.includes('const sectionRef = String(section?.id || \'\').trim();'));
assert(grammarDisplayBlock.includes('`${sectionRef}#group-${groupIndex + 1}`'));
assert(grammarDisplayBlock.includes('lessonGrammarPracticeItemBySourceRef(sectionRef)'));
assert(!/fuzzy|exampleMerge/i.test(grammarDisplayBlock));
pass('C06', 'section/group sourceRefs are structural only');

// C07 — lesson inline is single-open and event-safe.
const toggleBlock = sliceBetween(app, 'function toggleLessonGrammarPractice(grammarId, sourceElement)', 'function syncLessonGrammarPractice()');
assert(toggleBlock.includes("lessonPracticeGrammarId = opening ? target : '';"));
assert(toggleBlock.includes('item?.lessonPracticeIdentity?.sourceRef'));
const clickBlock = sliceBetween(app, "root.addEventListener('click', event => {", "root.addEventListener('keydown', event => {");
const lessonToggleAt = clickBlock.indexOf("event.target.closest('[data-nhsk-lesson-grammar-practice-toggle]')");
const grammarCardAt = clickBlock.indexOf("event.target.closest('[data-nhsk-grammar-id]')");
assert(lessonToggleAt >= 0 && grammarCardAt > lessonToggleAt);
assert(clickBlock.slice(lessonToggleAt, grammarCardAt).includes('event.stopPropagation()'));
pass('C07', 'lesson Practice single-open and click-safe');

// C08 — one shared presenter/controller, no fork.
const mountBlock = sliceBetween(app, 'async function mountNewHskGrammarPractice(grammarId, host, context = {})', 'function toggleLessonGrammarPractice(grammarId, sourceElement)');
assert(mountBlock.includes('GrammarPracticeUi.createSession('));
assert(mountBlock.includes('GrammarPracticeView.render('));
assert(mountBlock.includes('onStudyCards:'));
['GrammarPracticeUi.submit(', 'GrammarPracticeUi.selectSkill(', 'GrammarPracticeUi.next(', 'GrammarPracticeUi.shuffleCurrent(']
  .forEach(token => assert(!app.includes(token), `controller fork: ${token}`));
assert(viewSource.includes('ui.submit'));
assert(viewSource.includes('ui.selectSkill'));
pass('C08', 'shared presenter reused');

// C09 — loading/fail-soft/stale async guard preserved.
assert(mountBlock.includes('Đang tải bài luyện...'));
assert(mountBlock.includes('Ngữ pháp này chưa có bài luyện GrammarV1.'));
assert(mountBlock.includes('Không tải được GrammarV1 lúc này.'));
assert(mountBlock.includes('requestId !== grammarPracticeLoadId'));
assert(mountBlock.includes('!host.isConnected'));
assert(mountBlock.includes('grammarPracticeContextIsActive(target, context)'));
pass('C09', 'loading/fail-soft/stale-result guard');

// C10 — scoped mobile CSS now belongs to lesson inline + popup; old Catalog-inline shell is removed.
['.nhsk-lesson-grammar-practice', '.nhsk-grammar-practice-toggle', '.nhsk-grammar-practice-inline', '.nhsk-grammar-practice-host']
  .forEach(selector => assert(css.includes(selector), `missing scoped CSS ${selector}`));
assert(!css.includes('.nhsk-grammar-card-shell'));
assert(!css.includes('.nhsk-grammar-card-actions'));
assert(css.includes('max-width:100%'));
assert(css.includes('@media(max-width:640px)'));
pass('C10', 'mobile-safe lesson/popup placement CSS');

// C11 — no new persistence family and no use of merge trace as Practice identity.
['G5_3_STORAGE_KEY', 'G5_3_DB_NAME', 'grammarPracticeStore', 'newHskGrammarPracticeStore']
  .forEach(token => assert(!app.includes(token), `unexpected storage token ${token}`));
assert(!app.includes('exampleMerge.sourceRefs'));
assert.strictEqual((app.match(/GrammarPracticeView\.render\(/g) || []).length, 1);
pass('C11', 'no storage/fuzzy/merge-trace identity');

// C12 — GrammarV1 Flashcard stays exactly 11 and bypasses progress filtering only for grammar launch.
assert.strictEqual(Bridge.DEFAULT_TRANSLATION_CARD_COUNT, 10);
const flashLaunchBlock = sliceBetween(app, 'function launchNewHskGrammarPracticeCards(runtimeGrammar, host, context = {})', 'async function mountNewHskGrammarPractice');
assert(flashLaunchBlock.includes('GrammarPracticeFlashcard.buildPayload(GrammarPracticeAdapter, runtimeGrammar)'));
assert(flashLaunchBlock.includes('payload.cards.length !== 11'));
assert(flashLaunchBlock.includes('filterByProgress: false'));
const openFlashBlock = sliceBetween(app, 'function openFlashcards(sourceElement, cardsOverride, options = {})', 'function render()');
assert(openFlashBlock.includes('if (options.filterByProgress !== false) cards = filterFlashcardsByProgress(cards);'));
assert.strictEqual((openFlashBlock.match(/filterFlashcardsByProgress\(cards\)/g) || []).length, 1);
pass('C12', 'GrammarV1 exact 11 cards preserved');

// C13 — return context supports popup NP+, popup Catalog, and lesson inline.
const returnBlock = sliceBetween(app, 'function restoreReturnSnapshotFromUrl()', 'function lessonCacheKey');
assert(returnBlock.includes("grammarPractice.mode === 'plus'"));
assert(returnBlock.includes("grammarPractice.mode === 'catalog'"));
assert(returnBlock.includes("grammarPractice.mode === 'lesson'"));
assert(returnBlock.includes('lessonPracticeGrammarId = grammarId;'));
assert(returnBlock.includes('state.grammarId = grammarId;'));
const restoreBlock = sliceBetween(app, 'function restoreGrammarPracticeAfterMount(host, context, grammarId)', 'function launchNewHskGrammarPracticeCards');
assert(restoreBlock.includes("context.mode === 'plus' || context.mode === 'catalog'"));
assert(restoreBlock.includes('[data-nhsk-lesson-grammar-practice]'));
assert(restoreBlock.includes('focus({ preventScroll: true })'));
pass('C13', 'return context aligned with A/B/C reality');

// C14 — all 148 catalog grammarIds still resolve in GrammarV1 runtime.
const runtimeIndex = JSON.parse(fs.readFileSync(path.join(runtimeBase, 'index.json'), 'utf8'));
const runtimeIds = new Set(Object.keys(runtimeIndex.grammarToTrack || {}));
const expectedCatalogCounts = { 1: 40, 2: 45, 3: 63 };
let catalogTotal = 0;
for (const level of [1, 2, 3]) {
  const file = path.join(ROOT, `modules/hanzi-stroke/data/learning/grammar/new_hsk_${level}.json`);
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ids = (doc.items || []).map(item => String(item.id || '').trim()).filter(Boolean);
  assert.strictEqual(ids.length, expectedCatalogCounts[level]);
  ids.forEach(id => assert(runtimeIds.has(id), `runtime missing ${id}`));
  catalogTotal += ids.length;
}
assert.strictEqual(catalogTotal, 148);
pass('C14', 'catalog grammarId runtime identity 148/148');

// C15 — only 122 unique-exact lesson identities are emitted; 22 fallbacks fail-soft; 4 catalog-only stay catalog-only.
const expectedPracticeCounts = { 1: 21, 2: 44, 3: 57 };
const denied = new Set([
  'hsk1_new_2','hsk1_new_3','hsk1_new_4','hsk1_new_10','hsk1_new_15','hsk1_new_16','hsk1_new_19','hsk1_new_20','hsk1_new_21','hsk1_new_23','hsk1_new_24','hsk1_new_25','hsk1_new_28','hsk1_new_32','hsk1_new_34','hsk1_new_38','hsk1_new_39',
  'hsk2_new_2',
  'hsk3_new_33','hsk3_new_36','hsk3_new_47','hsk3_new_56'
]);
const catalogOnly = new Set(['hsk1_new_6','hsk1_new_8','hsk3_new_23','hsk3_new_27']);
const sourceRefs = new Set();
let practiceTotal = 0;
for (const level of [1, 2, 3]) {
  const doc = JSON.parse(fs.readFileSync(path.join(catalogDir, `hsk${level}.json`), 'utf8'));
  const rows = doc.grammar || [];
  const identified = rows.filter(row => row.lessonPracticeIdentity);
  assert.strictEqual(identified.length, expectedPracticeCounts[level], `HSK${level} exact lesson identity count`);
  for (const row of rows) {
    const identity = row.lessonPracticeIdentity;
    if (denied.has(row.id) || catalogOnly.has(row.id)) {
      assert.strictEqual(identity, undefined, `${row.id} must fail-soft/no lesson identity`);
      continue;
    }
    assert(identity, `${row.id} missing exact lesson identity`);
    assert.strictEqual(identity.provenance, 'unique-exact-example-overlap');
    assert(Number(identity.overlapCount) > 0);
    assert(identity.sourceRef);
    assert(!sourceRefs.has(identity.sourceRef), `duplicate exact sourceRef ${identity.sourceRef}`);
    sourceRefs.add(identity.sourceRef);
    practiceTotal += 1;
  }
}
assert.strictEqual(practiceTotal, 122);
assert.strictEqual(denied.size, 22);
assert.strictEqual(catalogOnly.size, 4);
pass('C15', '122 exact lesson identities; 22 fail-soft; 4 catalog-only');

console.log('PASS_G5_3_R2B_EXACT_IDENTITY_INTEGRATION');

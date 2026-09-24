const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const appPath = path.join(root, 'modules', 'hanzi-stroke', 'app.js');
const bridgePath = path.join(root, 'modules', 'shared', 'grammar-practice-flashcard.js');
const app = fs.readFileSync(appPath, 'utf8');
const Bridge = require(bridgePath);

function pass(id, detail){
  console.log(`${id} PASS ${detail || ''}`.trim());
}

assert.strictEqual(Bridge.DEFAULT_TRANSLATION_CARD_COUNT, 10, 'C01 G5.1 translation count must stay 10');
pass('C01', 'G5.1 translation count = 10');

assert.ok(app.includes("const grammarId = ['hsk', 'new_hsk'].includes(sourceKey) ? String(item?.id || '').trim() : '';"), 'C02 exact grammarId provenance is missing');
assert.ok(app.includes("entityRef: grammarId ? { source: 'grammarv1', kind: 'grammar', grammarId } : null"), 'C02 GrammarV1 entityRef is missing');
pass('C02', 'HSK/New HSK grammar cards carry exact GrammarV1 entityRef');

assert.ok(app.includes('async function buildGrammarV1CurriculumSessionCards(cards)'), 'C03 grammar rehydrate helper is missing');
assert.ok(app.includes('loadGrammarPracticeById(grammarId)'), 'C03 helper must load exact GrammarV1 runtime by grammarId');
pass('C03', 'runtime rehydrate uses exact grammarId');

assert.ok(app.includes('GrammarPracticeFlashcard.buildPayload(GrammarPracticeAdapter, runtimeGrammar)'), 'C04 must reuse G5.1 bridge buildPayload');
pass('C04', 'G5.1 bridge reused');

assert.ok(app.includes('expectedCardsPerGrammar !== 11'), 'C05 exact 11-card contract guard is missing');
assert.ok(app.includes('payload.cards.length !== expectedCardsPerGrammar'), 'C05 payload length guard is missing');
pass('C05', '1 grammar = exactly 11 cards');

assert.ok(app.includes("const grammarV1Source = ['hsk', 'new_hsk'].includes(flashcardLibraryState.curriculumSource);"), 'C06 source guard is missing');
assert.ok(app.includes("if(contentType?.id === 'grammar' && grammarV1Source)"), 'C06 grammar-specific branch is missing');
pass('C06', 'grammar-specific branch only for HSK/New HSK');

assert.ok(app.includes('let sessionCards = cards;'), 'C07 direct-path preservation seed is missing');
assert.ok(app.includes('createFlashcardSessionFromCards(sessionCards,'), 'C07 session must use rehydrated cards only for grammar path');
pass('C07', 'vocabulary/sentence direct path preserved');

assert.ok(app.includes("Nguyen phap chua co lien ket GrammarV1 chinh xac."), 'C08 missing exact-ref fail-soft message');
assert.ok(app.includes("Khong tai duoc GrammarV1 ${grammarId}."), 'C08 missing runtime fail-soft message');
pass('C08', 'missing/invalid exact ref fails soft without guessing');

const helperStart = app.indexOf('async function buildGrammarV1CurriculumSessionCards(cards)');
const helperEnd = app.indexOf('async function startFlashcardCurriculumSession()', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'C09 helper bounds not found');
const helper = app.slice(helperStart, helperEnd);
assert.ok(!helper.includes('new_hsk_course'), 'C09 G5.2 must not add New 3.0 mapping');
assert.ok(!helper.includes('topic') && !helper.includes('title'), 'C09 helper must not guess by title/topic');
pass('C09', 'no New 3.0 mapping or title/topic guessing');

const storageTokens = [
  'G5_2_STORAGE_KEY',
  'G5_2_DB_NAME',
  'grammarv1DeckStore',
  'grammarv1FlashcardStore'
];
storageTokens.forEach(token => assert.ok(!app.includes(token), `C10 unexpected new storage token: ${token}`));
pass('C10', 'no new G5.2 DB/store/key family');

console.log('PASS_G5_2_CURRICULUM_GRAMMAR_CONTRACT');

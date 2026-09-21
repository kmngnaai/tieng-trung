const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const ROOT = process.cwd();
const runtimeBase = path.resolve(process.env.GRAMMARV1_RUNTIME_BASE || path.join(ROOT, '_generated/GrammarV1/exercises'));
const adapterPath = path.join(ROOT, 'modules/shared/grammar-practice.js');
const flashAppPath = path.join(ROOT, 'modules/hanzi-stroke/app.js');

assert(fs.existsSync(adapterPath), `Missing adapter: ${adapterPath}`);
assert(fs.existsSync(runtimeBase), `Missing GrammarV1 runtime: ${runtimeBase}`);

const source = fs.readFileSync(adapterPath, 'utf8');
const Adapter = require(adapterPath);

assert.strictEqual(Adapter.VERSION, 'grammar-practice-adapter-v1');
assert.deepStrictEqual(Adapter.EXERCISE_TYPES, ['mcq', 'translate_zh_vi', 'translate_vi_zh']);

// Browser-global contract, without DOM/storage/network globals.
const browserContext = { globalThis: {} };
browserContext.globalThis = browserContext;
vm.createContext(browserContext);
vm.runInContext(source, browserContext, { filename: 'grammar-practice.js' });
assert(browserContext.TiengTrungGrammarPractice, 'Browser global TiengTrungGrammarPractice missing');
assert.strictEqual(browserContext.TiengTrungGrammarPractice.VERSION, Adapter.VERSION);

// Pure adapter boundary: no IO/UI/storage side effects inside the shared module.
['fetch(', 'localStorage', 'sessionStorage', 'document.', 'window.location', 'location.href'].forEach(token => {
  assert(!source.includes(token), `Shared GrammarPractice adapter must not contain side-effect token: ${token}`);
});

// Existing Flashcard bridge contract remains the target; G2.2 does not modify/fork it.
const flashApp = fs.readFileSync(flashAppPath, 'utf8');
assert(flashApp.includes("tiengTrung.hsk.externalFlashcard.v1"), 'Existing external Flashcard storage contract missing');
assert(flashApp.includes("params.get('externalFlashcards') !== '1'"), 'Existing externalFlashcards route contract missing');
assert(flashApp.includes('createFlashcardSessionFromCards(payload.cards'), 'Existing Flashcard bridge must consume payload.cards');
assert(flashApp.includes("['vocabulary', 'sentence', 'grammar'].includes(explicit)"), 'Flashcard engine must keep sentence/grammar card types');

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const index = readJson(path.join(runtimeBase, 'index.json'));
assert.deepStrictEqual(index.totals, {
  exercises: 7980,
  grammars: 399,
  tracks: 7,
  types: { mcq: 3990, translate_vi_zh: 1995, translate_zh_vi: 1995 }
});

let grammarCount = 0;
let exerciseCount = 0;
let translationCardCount = 0;
let grammarCardCount = 0;
let sampleGrammar = null;

for(const trackRow of index.tracks){
  const track = readJson(path.join(runtimeBase, trackRow.file));
  for(const rawGrammar of track.grammars){
    const before = JSON.stringify(rawGrammar);
    const grammar = Adapter.findGrammar(track, rawGrammar.grammarId);
    assert(grammar, `findGrammar failed: ${rawGrammar.grammarId}`);
    assert.strictEqual(grammar.grammarId, rawGrammar.grammarId);

    const all = Adapter.getExercises(grammar, { skill: 'all' });
    const mcq = Adapter.getExercises(grammar, { skill: 'mcq' });
    const zhvi = Adapter.getExercises(grammar, { skill: 'translate_zh_vi' });
    const vizh = Adapter.getExercises(grammar, { skill: 'translate_vi_zh' });
    const translation = Adapter.getExercises(grammar, { skill: 'translation' });
    const firstFive = Adapter.getExercises(grammar, { skill: 'all', count: 5 });

    assert.strictEqual(all.length, 20, `${grammar.grammarId}: all`);
    assert.deepStrictEqual(all.map(row => row.seq), Array.from({ length: 20 }, (_, i) => i + 1));
    assert.strictEqual(mcq.length, 10, `${grammar.grammarId}: mcq`);
    assert.strictEqual(zhvi.length, 5, `${grammar.grammarId}: zhvi`);
    assert.strictEqual(vizh.length, 5, `${grammar.grammarId}: vizh`);
    assert.strictEqual(translation.length, 10, `${grammar.grammarId}: translation`);
    assert.deepStrictEqual(firstFive.map(row => row.seq), [1, 2, 3, 4, 5]);
    assert.strictEqual(new Set(all.map(row => row.questionId)).size, 20);

    const cards = Adapter.toTranslationFlashcards(grammar);
    assert.strictEqual(cards.length, 10, `${grammar.grammarId}: translation cards`);
    cards.forEach(card => {
      assert(card.id && card.word, `${grammar.grammarId}: Flashcard bridge requires id+word`);
      assert.strictEqual(card.cardType, 'sentence');
      assert(card.meaningVi, `${card.id}: meaningVi required`);
      assert(card.grammar && card.grammar.grammarId === grammar.grammarId);
    });
    translationCardCount += cards.length;

    const grammarCard = Adapter.toGrammarFlashcard(grammar);
    assert(grammarCard.id && grammarCard.word);
    assert.strictEqual(grammarCard.cardType, 'grammar');
    assert.strictEqual(grammarCard.grammar.topic, grammar.topic || 'Ngữ pháp');
    assert.strictEqual(grammarCard.grammar.pattern, grammar.syntax || '');
    grammarCardCount += 1;

    assert.strictEqual(JSON.stringify(rawGrammar), before, `${grammar.grammarId}: adapter mutated runtime input`);
    grammarCount += 1;
    exerciseCount += all.length;
    if(!sampleGrammar) sampleGrammar = grammar;
  }
}

assert.strictEqual(grammarCount, 399);
assert.strictEqual(exerciseCount, 7980);
assert.strictEqual(translationCardCount, 3990);
assert.strictEqual(grammarCardCount, 399);

assert(sampleGrammar, 'Missing sample grammar');
const orderedBefore = Adapter.getExercises(sampleGrammar, { count: 5, order: 'ordered' }).map(row => row.questionId);
const randomA = Adapter.getExercises(sampleGrammar, { count: 5, order: 'random', seed: 'g2.2-seed' }).map(row => row.questionId);
const randomB = Adapter.getExercises(sampleGrammar, { count: 5, order: 'random', seed: 'g2.2-seed' }).map(row => row.questionId);
assert.deepStrictEqual(randomA, randomB, 'Seeded random selection must be deterministic');
assert.strictEqual(new Set(randomA).size, 5, 'Seeded random selection must not duplicate questions');
assert.strictEqual(orderedBefore.length, 5);

const sampleMcq = Adapter.getExercises(sampleGrammar, { skill: 'mcq', count: 1 })[0];
const goodMcq = Adapter.evaluateExercise(sampleMcq, sampleMcq.answer.toLowerCase());
const badMcq = Adapter.evaluateExercise(sampleMcq, sampleMcq.answer === 'A' ? 'B' : 'A');
assert.strictEqual(goodMcq.mode, 'auto');
assert.strictEqual(goodMcq.correct, true);
assert.strictEqual(badMcq.correct, false);

const sampleTranslation = Adapter.getExercises(sampleGrammar, { skill: 'translate_zh_vi', count: 1 })[0];
const exactTranslation = Adapter.evaluateExercise(sampleTranslation, sampleTranslation.referenceAnswer);
const differentTranslation = Adapter.evaluateExercise(sampleTranslation, 'Một cách dịch khác vẫn có thể đúng.');
assert.strictEqual(exactTranslation.mode, 'self-review');
assert.strictEqual(exactTranslation.correct, null, 'Translation must not be exact-string auto-graded');
assert.strictEqual(differentTranslation.correct, null, 'Translation must remain self-review for alternate wording');
assert.strictEqual(exactTranslation.referenceAnswer, sampleTranslation.referenceAnswer);

const translationPayload = Adapter.buildExternalFlashcardPayload(sampleGrammar, {
  mode: 'translations',
  returnUrl: '/modules/example?grammar=test'
});
assert.strictEqual(translationPayload.version, 1);
assert.strictEqual(translationPayload.origin, 'external');
assert.strictEqual(translationPayload.cards.length, 10);
assert(translationPayload.contextKey.startsWith('grammarv1:'));
assert.strictEqual(translationPayload.returnUrl, '/modules/example?grammar=test');

const mixedPayload = Adapter.buildExternalFlashcardPayload(sampleGrammar, { mode: 'mixed', count: 5 });
assert.strictEqual(mixedPayload.cards.length, 6, 'Mixed payload = 1 grammar card + requested translation cards');
assert.strictEqual(mixedPayload.cards[0].cardType, 'grammar');
assert(mixedPayload.cards.slice(1).every(card => card.cardType === 'sentence'));

assert.throws(() => Adapter.getExercises(sampleGrammar, { skill: 'unknown-skill' }), /unsupported grammar practice skill/);
assert.throws(() => Adapter.getExercises(sampleGrammar, { count: 0 }), /count must be a positive integer/);
assert.throws(() => Adapter.getExercises(sampleGrammar, { order: 'chaos' }), /unsupported exercise order/);
assert.throws(() => Adapter.translationExerciseToFlashcard(sampleMcq), /requires translation exercise/);

console.log(`PASS GrammarPractice adapter: grammars=${grammarCount} exercises=${exerciseCount} translationCards=${translationCardCount} grammarCards=${grammarCardCount}`);

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = process.cwd();
const runtimeBase = path.resolve(
  process.env.GRAMMARV1_RUNTIME_BASE || path.join(ROOT, '_generated/GrammarV1/exercises')
);
const adapterPath = path.join(ROOT, 'modules/shared/grammar-practice.js');
const bridgePath = path.join(ROOT, 'modules/shared/grammar-practice-flashcard.js');
const appPath = path.join(ROOT, 'modules/hanzi-stroke/app.js');
const htmlPath = path.join(ROOT, 'modules/hanzi-stroke/index.html');

const Adapter = require(adapterPath);
const Bridge = require(bridgePath);
const source = fs.readFileSync(bridgePath, 'utf8');
const app = fs.readFileSync(appPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');

assert.strictEqual(Bridge.VERSION, 'grammar-practice-flashcard-bridge-v1');
assert.strictEqual(Bridge.DEFAULT_TRANSLATION_CARD_COUNT, 5);
assert(Object.isFrozen(Bridge));

[
  'fetch(',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'document.',
  'window.location',
  'location.href'
].forEach(token => {
  assert(!source.includes(token), `Flashcard bridge must stay pure: ${token}`);
});

const index = JSON.parse(fs.readFileSync(path.join(runtimeBase, 'index.json'), 'utf8'));
assert.strictEqual(index.tracks.length, 7);

let tracksChecked = 0;
let launchChecks = 0;

for(const trackRow of index.tracks){
  const track = JSON.parse(fs.readFileSync(path.join(runtimeBase, trackRow.file), 'utf8'));
  const rawGrammar = track.grammars[0];
  const grammar = Adapter.findGrammar(track, rawGrammar.grammarId);
  assert(grammar, `${trackRow.file}: sample grammar missing`);
  const before = JSON.stringify(grammar);

  const payload = Bridge.buildPayload(Adapter, grammar);
  assert.strictEqual(payload.version, 1);
  assert.strictEqual(payload.origin, 'external');
  assert.strictEqual(payload.contextKey, `grammarv1:${grammar.grammarId}`);
  assert.strictEqual(payload.contextLabel, grammar.topic || grammar.grammarId);
  assert.strictEqual(payload.returnUrl, '');
  assert.strictEqual(payload.cards.length, 6);
  assert.strictEqual(payload.cards[0].cardType, 'grammar');
  assert(payload.cards.slice(1).every(card => card.cardType === 'sentence'));
  assert(payload.cards.slice(1).every(card => card.grammar?.grammarId === grammar.grammarId));

  let called = 0;
  let captured = null;
  const result = Bridge.launch(Adapter, grammar, (cards, title, options) => {
    called += 1;
    captured = { cards, title, options };
    return true;
  });
  assert.strictEqual(called, 1);
  assert.strictEqual(result.launched, true);
  assert.deepStrictEqual(captured.cards, payload.cards);
  assert.strictEqual(captured.title, payload.title);
  assert.deepStrictEqual(captured.options, {
    origin: 'external',
    contextKey: payload.contextKey,
    contextLabel: payload.contextLabel,
    returnUrl: ''
  });

  const refused = Bridge.launch(Adapter, grammar, () => false);
  assert.strictEqual(refused.launched, false);
  assert.strictEqual(JSON.stringify(grammar), before, `${grammar.grammarId}: bridge mutated grammar`);

  tracksChecked += 1;
  launchChecks += 2;
}

assert.strictEqual(tracksChecked, 7);

const begin = app.indexOf('/* G3.3 FLASHCARD BRIDGE BEGIN */');
const end = app.indexOf('/* G3.3 FLASHCARD BRIDGE END */');
assert(begin >= 0 && end > begin, 'G3.3 app bridge markers missing');
const block = app.slice(begin, end);

assert(block.includes('GrammarPracticeFlashcard.launch'));
assert(block.includes('createFlashcardSessionFromCards'));
assert(!block.includes('function createFlashcardSessionFromCards'), 'G3.3 must not fork the Flashcard engine');
assert(!block.includes('localStorage'));
assert(!block.includes('sessionStorage'));
assert(!block.includes('indexedDB'));
assert(!block.includes('window.location'));
assert(!block.includes('location.href'));

const g32Begin = app.indexOf('/* G3.2 PRACTICE UI BEGIN */');
const g32End = app.indexOf('/* G3.2 PRACTICE UI END */');
assert(g32Begin >= 0 && g32End > g32Begin);
const g32Block = app.slice(g32Begin, g32End);
assert(!/flashcard/i.test(g32Block), 'G3.2 block must retain its no-Flashcard contract');
assert(g32Block.includes('data-grammar-practice-study-cards'));
assert(g32Block.includes('launchGrammarPracticeCards(session.grammar)'));

assert(app.includes('function createFlashcardSessionFromCards(cards, title, options = {})'));
assert(app.includes("origin: options.origin || FLASHCARD_SESSION_DEFAULTS.origin"));
assert(app.includes("contextKey: String(options.contextKey"));
assert(app.includes("contextLabel: String(options.contextLabel"));
assert(app.includes("returnUrl: String(options.returnUrl"));

const adapterScript = html.indexOf('../shared/grammar-practice.js');
const runtimeScript = html.indexOf('../shared/grammar-practice-runtime.js');
const uiScript = html.indexOf('../shared/grammar-practice-ui.js');
const flashScript = html.indexOf('../shared/grammar-practice-flashcard.js');
const appScript = html.indexOf('app.js?');
assert(
  adapterScript >= 0 &&
  runtimeScript > adapterScript &&
  uiScript > runtimeScript &&
  flashScript > uiScript &&
  appScript > flashScript,
  'GrammarPractice Flashcard script order mismatch'
);

console.log(
  `PASS GrammarPractice Flashcard bridge: tracks=${tracksChecked} launches=${launchChecks} ` +
  `mixedCards=6 existingEngineReuse=PASS noEngineFork=PASS noNewStorage=PASS`
);

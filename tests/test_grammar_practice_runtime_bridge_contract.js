const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = process.cwd();
const runtimeBase = path.resolve(process.env.GRAMMARV1_RUNTIME_BASE || path.join(ROOT, '_generated/GrammarV1/exercises'));
const adapterPath = path.join(ROOT, 'modules/shared/grammar-practice.js');
const loaderPath = path.join(ROOT, 'modules/shared/grammar-practice-runtime.js');
const appPath = path.join(ROOT, 'modules/hanzi-stroke/app.js');
const htmlPath = path.join(ROOT, 'modules/hanzi-stroke/index.html');

assert(fs.existsSync(runtimeBase), `Missing GrammarV1 runtime: ${runtimeBase}`);
assert(fs.existsSync(adapterPath), `Missing adapter: ${adapterPath}`);
assert(fs.existsSync(loaderPath), `Missing runtime loader: ${loaderPath}`);

const Adapter = require(adapterPath);
const Runtime = require(loaderPath);
assert.strictEqual(Runtime.VERSION, 'grammar-practice-runtime-v1');

const requests = [];
const prefix = '../GrammarV1/runtime/exercises/';
const fetchJson = async url => {
  requests.push(url);
  assert(url.startsWith(prefix), `Unexpected runtime URL: ${url}`);
  const file = url.slice(prefix.length);
  return JSON.parse(fs.readFileSync(path.join(runtimeBase, file), 'utf8'));
};

const loader = Runtime.createLoader({ adapter: Adapter, baseUrl: prefix, fetchJson });
assert.strictEqual(loader.baseUrl, prefix);

(async () => {
  const first = await loader.loadGrammar('hsk3_1');
  assert(first && first.grammarId === 'hsk3_1');
  assert.strictEqual(first.exerciseCount, 20);
  assert.strictEqual(requests.filter(url => url.endsWith('/index.json')).length, 1, 'index must be lazy-loaded once');
  assert.strictEqual(requests.filter(url => url.endsWith('/hsk3.json')).length, 1, 'first track must be lazy-loaded once');

  const second = await loader.loadGrammar('hsk3_2');
  assert(second && second.grammarId === 'hsk3_2');
  assert.strictEqual(requests.filter(url => url.endsWith('/index.json')).length, 1, 'index cache regressed');
  assert.strictEqual(requests.filter(url => url.endsWith('/hsk3.json')).length, 1, 'track cache regressed');

  const unsupportedLegacyHsk1 = await loader.loadGrammar('hsk1_1');
  assert.strictEqual(unsupportedLegacyHsk1, null, 'legacy HSK1 must fail soft when no runtime mapping exists');

  const unsupportedLegacyHsk2 = await loader.loadGrammar('hsk2_1');
  assert.strictEqual(unsupportedLegacyHsk2, null, 'legacy HSK2 must fail soft when no runtime mapping exists');

  assert.strictEqual(
    requests.filter(url => !url.endsWith('/index.json') && !url.endsWith('/hsk3.json')).length,
    0,
    'unsupported HSK1/HSK2 grammar IDs must not fetch a guessed track'
  );

  const caseMismatch = await loader.loadGrammar('HSK3_1');
  assert.strictEqual(caseMismatch, null, 'grammar bridge must not fuzzy/case-normalize IDs');

  const guessedNewId = await loader.loadGrammar('new-hsk1_1');
  assert.strictEqual(guessedNewId, null, 'bridge must not derive grammarId from the runtime filename');

  const trackFile = await loader.resolveTrackFile('hsk1_new_1');
  assert.strictEqual(trackFile, 'new-hsk1.json');
  assert.strictEqual(requests.filter(url => url.endsWith('/new-hsk1.json')).length, 0, 'resolveTrackFile must not eagerly fetch the track');

  const newGrammar = await loader.loadGrammar('hsk1_new_1');
  assert(newGrammar && newGrammar.grammarId === 'hsk1_new_1');
  assert.strictEqual(requests.filter(url => url.endsWith('/new-hsk1.json')).length, 1);

  const app = fs.readFileSync(appPath, 'utf8');
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert(app.includes("const GRAMMAR_PRACTICE_RUNTIME_BASE = '../GrammarV1/runtime/exercises/';"));
  assert(app.includes('GrammarPracticeRuntime.createLoader({'));
  assert(app.includes('async function loadGrammarPracticeById(grammarId)'));
  assert(app.includes('return await grammarPracticeLoader.loadGrammar(target);'));
  assert(app.includes("console.warn(`Cannot load GrammarV1 runtime for ${target}:`, err);"));

  const detailStart = app.indexOf('function renderGrammarPopup(item)');
  const detailEnd = app.indexOf('function readFlashcardResults()', detailStart);
  assert(detailStart >= 0 && detailEnd > detailStart, 'Cannot isolate grammar detail popup');
  const detailSource = app.slice(detailStart, detailEnd);
  assert(!detailSource.includes('loadGrammarPracticeById('), 'G3.1 must not start Practice UI/data loading from the popup yet');
  assert(!detailSource.includes('hsk-grammar-practice'), 'G3.1 must not add Practice UI markup');

  const adapterScript = html.indexOf('../shared/grammar-practice.js');
  const runtimeScript = html.indexOf('../shared/grammar-practice-runtime.js');
  const appScript = html.indexOf('app.js?');
  assert(adapterScript >= 0 && runtimeScript > adapterScript && appScript > runtimeScript, 'Grammar scripts must load adapter -> runtime bridge -> app');

  console.log(`PASS GrammarPractice runtime bridge: requests=${requests.length} exactIds=PASS lazyTrack=PASS legacyFallback=PASS noPracticeUi=PASS`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

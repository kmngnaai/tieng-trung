const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const app = fs.readFileSync(
  path.join(ROOT, 'modules', 'new-hsk-course', 'app.js'),
  'utf8'
);

const engine = fs.readFileSync(
  path.join(ROOT, 'modules', 'shared', 'matching-engine.js'),
  'utf8'
);

[
  'function matchingLearningRowForPairId(pairId)',
  'function syncVocabularyMatchingLearningState(pairId, correct)',
  "source: 'practice:matching'",
  'LearningState.recordAttempt(word, {',
  "if (result.status === 'correct')",
  "result.pairId || ''",
  "else if (result.status === 'wrong')",
  "result.leftId || ''"
].forEach(marker => {
  assert(
    app.includes(marker),
    `Missing LS2C2 marker: ${marker}`
  );
});

const resolverStart =
  app.indexOf('function matchingLearningRowForPairId(pairId)');

const resolverEnd =
  app.indexOf(
    'function syncVocabularyMatchingLearningState(',
    resolverStart
  );

assert(resolverStart >= 0);
assert(resolverEnd > resolverStart);

const resolver = app.slice(
  resolverStart,
  resolverEnd
);

assert(
  resolver.includes("row.kind !== 'word'"),
  'LS2C2 must reject non-word rows'
);

assert(
  resolver.includes("'vocabulary'") &&
  resolver.includes("'supplementalVocabulary'"),
  'LS2C2 must restrict supported word sources'
);

assert(
  resolver.includes("'hanzi-vi'") &&
  resolver.includes("'hanzi-pinyin'") &&
  resolver.includes("'pinyin-vi'"),
  'Only normal vocabulary matching modes are eligible'
);

assert(
  !resolver.includes('contentKind'),
  'LS2C2 must not rely on heuristic contentKind'
);

assert(
  engine.includes(
    "const id = clean(input.pairId || input.id ||"
  ),
  'Matching engine must preserve input id'
);

assert(
  engine.includes(
    "return { status:'correct', pairId:leftId"
  ),
  'Correct result must expose pairId'
);

assert(
  engine.includes(
    "return { status:'wrong', leftId, rightId"
  ),
  'Wrong result must expose target leftId'
);

const calls =
  app.match(/syncVocabularyMatchingLearningState\(/g) || [];

assert.strictEqual(
  calls.length,
  3,
  'Expected one definition plus correct/wrong calls'
);

console.log(
  'PASS LS2C2 graded vocabulary Matching -> Learning State Lite'
);
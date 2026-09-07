const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const app = fs.readFileSync(
  path.join(
    ROOT,
    'modules',
    'new-hsk-course',
    'app.js'
  ),
  'utf8'
);

assert(
  app.includes(
    'function syncVocabularyFillLearningState(hanzi, correct)'
  ),
  'LS2C1 helper must exist'
);

assert(
  app.includes(
    "source: 'practice:fill'"
  ),
  'Fill attempts must have a stable Learning State source'
);

assert(
  app.includes(
    'LearningState.recordAttempt(word, {'
  ),
  'Fill must record an actual attempt'
);

assert(
  app.includes(
    'learningWord: row.hanzi'
  ),
  'Vocabulary Fill must carry the canonical Hanzi'
);

assert(
  app.includes(
    'data-learning-word="${attr(item.learningWord || \'\')}"'
  ),
  'Fill card must expose its vocabulary identity'
);

const fillHandlerStart =
  app.indexOf(
    "const checkFill = event.target.closest('[data-nhsk-check-fill]');"
  );

const typingHandlerStart =
  app.indexOf(
    "const checkTyping = event.target.closest('[data-nhsk-check-typing]');",
    fillHandlerStart
  );

assert(fillHandlerStart >= 0);
assert(typingHandlerStart > fillHandlerStart);

const fillHandler = app.slice(
  fillHandlerStart,
  typingHandlerStart
);

assert(
  fillHandler.includes(
    "const learningWord = card?.dataset.learningWord || '';"
  ),
  'Fill handler must read the explicit vocabulary identity'
);

assert(
  fillHandler.includes(
    'syncVocabularyFillLearningState(learningWord, correct);'
  ),
  'Fill handler must sync the graded result'
);

assert(
  fillHandler.includes(
    "const correct = acceptedAnswerMatches("
  ),
  'Learning State must use the real graded Fill result'
);

const typingRenderStart =
  app.indexOf(
    'function renderTypingCard(row, direction = \'typing\')'
  );

const typingRenderEnd =
  app.indexOf(
    'function renderTypingSession(',
    typingRenderStart
  );

assert(
  typingRenderStart >= 0 &&
  typingRenderEnd > typingRenderStart
);

const typingRender = app.slice(
  typingRenderStart,
  typingRenderEnd
);

assert(
  !typingRender.includes('data-learning-word'),
  'Sentence/paragraph Typing must not participate in Lite V1'
);

const helperOccurrences =
  app.match(/syncVocabularyFillLearningState\(/g) || [];

assert.strictEqual(
  helperOccurrences.length,
  2,
  'LS2C1 helper must have exactly one definition and one call'
);

const typingSessionStart =
  app.indexOf('function renderTypingSession(');

const typingSessionEnd =
  app.indexOf(
    'function practiceSpeakers(',
    typingSessionStart
  );

assert(
  typingSessionStart >= 0 &&
  typingSessionEnd > typingSessionStart,
  'Typing session renderer must exist'
);

const typingSession = app.slice(
  typingSessionStart,
  typingSessionEnd
);

assert(
  /row\.kind\s*!==\s*'word'/.test(typingSession),
  'Typing must still exclude vocabulary'
);

console.log(
  'PASS LS2C1 graded vocabulary Fill -> Learning State Lite'
);
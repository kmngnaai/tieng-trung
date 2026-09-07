const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const html = fs.readFileSync(
  path.join(ROOT, 'modules', 'hanzi-stroke', 'index.html'),
  'utf8'
);

const app = fs.readFileSync(
  path.join(ROOT, 'modules', 'hanzi-stroke', 'app.js'),
  'utf8'
);

const learningScript =
  '../shared/learning-state.js?v=20260907-ls-lite-v1';

const learningIndex =
  html.indexOf(learningScript);

const appIndex =
  html.indexOf('src="app.js?');

assert(
  learningIndex >= 0,
  'Hanzi module must load Learning State'
);

assert(
  appIndex > learningIndex,
  'Learning State must load before app.js'
);

assert(
  html.includes(
    'learning=20260907-ls-lite-v1'
  ),
  'app.js cache key must include LS-Lite version'
);

assert(
  app.includes(
    'const LearningState = window.TiengTrungLearningState;'
  )
);

assert(
  app.includes(
    'function getFlashcardLearningCardType(card)'
  )
);

assert(
  app.includes(
    "if(id.includes(':sentence:'))"
  )
);

assert(
  app.includes(
    "if(id.includes(':grammar:'))"
  )
);

assert(
  app.includes(
    "getFlashcardLearningCardType(card) !== 'vocabulary'"
  ),
  'Lite V1 must only track vocabulary'
);

assert(
  app.includes(
    'LearningState.markLearned(card.word'
  ),
  'Easy must mark vocabulary learned'
);

assert(
  app.includes(
    'LearningState.markLearning(card.word'
  ),
  'Review/Hard must mark vocabulary learning'
);

assert(
  app.includes(
    'syncFlashcardLearningState(card, rating);'
  )
);

assert(
  app.includes(
    'cardType: getFlashcardLearningCardType(entry),'
  )
);

assert(
  app.includes(
    'cardType: getFlashcardLearningCardType(card),'
  )
);

console.log(
  'PASS LS2A Flashcard -> Learning State Lite adapter contract'
);
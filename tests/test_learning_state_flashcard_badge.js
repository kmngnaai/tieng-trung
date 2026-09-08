const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT =
  path.resolve(__dirname, '..');

const app =
  fs.readFileSync(
    path.join(
      ROOT,
      'modules',
      'hanzi-stroke',
      'app.js'
    ),
    'utf8'
  );

const css =
  fs.readFileSync(
    path.join(
      ROOT,
      'modules',
      'hanzi-stroke',
      'style.css'
    ),
    'utf8'
  );

const html =
  fs.readFileSync(
    path.join(
      ROOT,
      'modules',
      'hanzi-stroke',
      'index.html'
    ),
    'utf8'
  );


/*
 * Existing LS2A semantics must remain unchanged.
 */

[
  'const LearningState = window.TiengTrungLearningState;',
  'function getFlashcardLearningCardType(card)',
  "getFlashcardLearningCardType(card) !== 'vocabulary'",
  'LearningState.markLearned(card.word',
  'LearningState.markLearning(card.word',
  'syncFlashcardLearningState(card, rating);'
].forEach(marker => {
  assert(
    app.includes(marker),
    `LS2A regression: missing ${marker}`
  );
});


/*
 * LS3D display architecture.
 */

[
  'function flashcardLearningStateView(record)',
  'function flashcardLearningTarget(card)',
  'function renderFlashcardLearningState(card)',
  'function patchFlashcardLearningState(targetLike)',
  "'â— ÄÃ£ há»c'",
  "'â— Äang há»c'",
  "'â—‹ ChÆ°a há»c'",
  'data-flashcard-learning-state-word=',
  'data-learning-state=',
  'LearningState.subscribe(detail => {'
].forEach(marker => {
  assert(
    app.includes(marker),
    `Missing LS3D marker: ${marker}`
  );
});


/*
 * Reuse the LS2A card classifier.
 * Do not introduce a second type system.
 */

const targetStart =
  app.indexOf(
    'function flashcardLearningTarget(card)'
  );

const targetEnd =
  app.indexOf(
    'function renderFlashcardLearningState(card)',
    targetStart
  );

assert(targetStart >= 0);
assert(targetEnd > targetStart);

const targetBody =
  app.slice(
    targetStart,
    targetEnd
  );

assert(
  targetBody.includes(
    "getFlashcardLearningCardType(card) !== 'vocabulary'"
  ),
  'LS3D must reuse LS2A vocabulary classifier'
);

assert(
  targetBody.includes(
    'card?.word'
  ),
  'Flashcard canonical Learning State target must be card.word'
);


/*
 * Badge belongs only to standard card-study renderer.
 * Activity-specific renderers return before this point.
 */

const studyStart =
  app.indexOf(
    'function renderFlashcardStudy(session)'
  );

const studyEnd =
  app.indexOf(
    'function renderFlashcardComplete(session)',
    studyStart
  );

assert(studyStart >= 0);
assert(studyEnd > studyStart);

const studyBody =
  app.slice(
    studyStart,
    studyEnd
  );

[
  "if(type === 'typing') return",
  "if(type === 'matching') return",
  "if(type === 'sentence-ordering') return",
  "if(type === 'radical-sort') return",
  'renderFlashcardLearningState(card)'
].forEach(marker => {
  assert(
    studyBody.includes(marker),
    `Study renderer contract missing: ${marker}`
  );
});

assert(
  studyBody.indexOf(
    'renderFlashcardLearningState(card)'
  ) >
    studyBody.indexOf(
      "if(type === 'radical-sort') return"
    ),
  'Badge must be after activity-specific early returns'
);


/*
 * Live Learning State changes patch only the compact badge.
 */

const patchStart =
  app.indexOf(
    'function patchFlashcardLearningState(targetLike)'
  );

const patchEnd =
  app.indexOf(
    'if(LearningState?.subscribe)',
    patchStart
  );

assert(patchStart >= 0);
assert(patchEnd > patchStart);

const patchBody =
  app.slice(
    patchStart,
    patchEnd
  );

assert(
  patchBody.includes(
    "'[data-flashcard-learning-state-word]'"
  ),
  'Live patch must target existing Flashcard badge'
);

[
  'renderFlashcardOverlay(',
  'saveFlashcardRatingResult(',
  'markLearned(',
  'markLearning(',
  'recordAttempt('
].forEach(forbidden => {
  assert(
    !patchBody.includes(forbidden),
    `Live badge patch must not trigger ${forbidden}`
  );
});


/*
 * Display helper is read-only.
 */

const displayStart =
  app.indexOf(
    'function renderFlashcardLearningState(card)'
  );

const displayEnd =
  app.indexOf(
    'function patchFlashcardLearningState(targetLike)',
    displayStart
  );

assert(displayStart >= 0);
assert(displayEnd > displayStart);

const displayBody =
  app.slice(
    displayStart,
    displayEnd
  );

assert(
  displayBody.includes(
    'LearningState.get(target)'
  ),
  'Display helper must read current Learning State'
);

[
  'markLearned(',
  'markLearning(',
  'recordAttempt('
].forEach(forbidden => {
  assert(
    !displayBody.includes(forbidden),
    `Display helper must not mutate Learning State: ${forbidden}`
  );
});


/*
 * Rating path remains LS2A -> legacy result save -> rerender.
 */

const ratingStart =
  app.indexOf(
    'function saveFlashcardRatingResult('
  );

const ratingEnd =
  app.indexOf(
    'function serializeFlashcardSession(',
    ratingStart
  );

assert(ratingStart >= 0);
assert(ratingEnd > ratingStart);

const ratingBody =
  app.slice(
    ratingStart,
    ratingEnd
  );

assert(
  ratingBody.includes(
    'syncFlashcardLearningState(card, rating);'
  ),
  'Existing LS2A rating sync must remain'
);

assert(
  ratingBody.includes(
    'lastRating: rating'
  ),
  'Existing Flashcard rating storage must remain'
);


/*
 * Compact mobile CSS must remain visible.
 */

assert(
  css.includes(
    '.flashcard-learning-state{'
  ),
  'LS3D compact CSS must exist'
);

assert(
  css.includes(
    'white-space:nowrap'
  ),
  'LS3D badge must remain on one line'
);

assert(
  css.includes(
    '@media(max-width:620px){.flashcard-learning-state{display:inline-flex'
  ),
  'LS3D badge must remain visible on mobile'
);

assert(
  !css.includes(
    '.flashcard-learning-state{display:none'
  ),
  'LS3D badge must never be hidden'
);


/*
 * Cache keys.
 * Preserve LS2A version and add LS3D bust for changed assets.
 */

assert(
  html.includes(
    '../shared/learning-state.js?v=20260907-ls-lite-v1'
  ),
  'Shared Learning State load must remain'
);

assert(
  html.includes(
    'learning=20260907-ls-lite-v1'
  ),
  'Existing LS2A app cache key must remain'
);

const ls3dKeys =
  html.match(
    /ls3d=20260908-v1/g
  ) || [];

assert(
  ls3dKeys.length >= 2,
  'Both app.js and style.css must receive LS3D cache keys'
);


console.log(
  'PASS LS3D Flashcard compact vocabulary Learning State badge'
);
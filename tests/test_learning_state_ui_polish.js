const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(...parts) {
  return fs.readFileSync(
    path.join(ROOT, ...parts),
    'utf8'
  );
}

const newHskApp =
  read('modules', 'new-hsk-course', 'app.js');

const newHskCss =
  read('modules', 'new-hsk-course', 'style.css');

const newHskHtml =
  read('modules', 'new-hsk-course', 'index.html');

const lookupApp =
  read('modules', 'lookup', 'app.js');

const lookupCss =
  read('modules', 'lookup', 'style.css');

const lookupHtml =
  read('modules', 'lookup', 'index.html');

const flashApp =
  read('modules', 'hanzi-stroke', 'app.js');

const flashCss =
  read('modules', 'hanzi-stroke', 'style.css');

const flashHtml =
  read('modules', 'hanzi-stroke', 'index.html');

/*
 * New HSK: preserve the existing pastel number badge.
 * Only learning / learned add a thin ring.
 */
[
  "label: '\\u0110\\u00E3 h\\u1ECDc'",
  "label: '\\u0110ang h\\u1ECDc'",
  "label: 'Ch\\u01B0a h\\u1ECDc'",
  'data-learning-state-word="${attr(word)}"',
  'data-learning-state="${attr(view.state)}"',
  'title="${attr(view.label)}"',
  'aria-label="${attr(view.label)}"'
].forEach(marker => {
  assert(
    newHskApp.includes(marker),
    `New HSK missing ${marker}`
  );
});

assert(
  newHskApp.includes(
    '<span class="nhsk-vocab-item__order" ${renderVocabularyLearningState(item.hanzi, learningRecords[index])}>${item.order}</span>'
  ),
  'New HSK state must be attached to the existing order badge'
);

const newHskViewStart =
  newHskApp.indexOf(
    'function learningStateView(record)'
  );

const newHskViewEnd =
  newHskApp.indexOf(
    'function renderVocabularyLearningState(hanzi, record)',
    newHskViewStart
  );

const newHskViewBody =
  newHskApp.slice(
    newHskViewStart,
    newHskViewEnd
  );

assert(
  !newHskViewBody.includes("icon: '\\u25CF'") &&
  !newHskViewBody.includes("icon: '\\u25D0'") &&
  !newHskViewBody.includes("icon: '\\u25CB'"),
  'New HSK items must not render state glyphs'
);

assert(
  newHskCss.includes(
    '.nhsk-vocab-item__order[data-learning-state="learning"]{outline:1.5px solid rgba(217,119,6,.72);outline-offset:1px}'
  )
);

assert(
  newHskCss.includes(
    '.nhsk-vocab-item__order[data-learning-state="learned"]{outline:1.5px solid rgba(22,131,92,.72);outline-offset:1px}'
  )
);

assert(
  !newHskCss.includes(
    '.nhsk-vocab-item__order[data-learning-state="unseen"]{'
  ),
  'Unseen badge must retain the original palette without an added ring'
);

/*
 * Lookup and Flashcard retain the approved icon-only UI.
 */
for (const [name, app] of [
  ['Lookup', lookupApp],
  ['Flashcard', flashApp]
]) {
  [
    "icon: '\\u25CF'",
    "icon: '\\u25D0'",
    "icon: '\\u25CB'",
    "label: '\\u0110\\u00E3 h\\u1ECDc'",
    "label: '\\u0110ang h\\u1ECDc'",
    "label: 'Ch\\u01B0a h\\u1ECDc'",
    'role="img"',
    'aria-label="${'
  ].forEach(marker => {
    assert(
      app.includes(marker),
      `${name}: missing ${marker}`
    );
  });
}

assert(
  lookupApp.includes('view.icon;'),
  'Lookup live patch must still update icon only'
);

assert(
  flashApp.includes('view.icon;'),
  'Flashcard live patch must still update icon only'
);

assert(
  lookupCss.includes(
    '.lookup-learning-state[data-learning-state="learning"]{color:#d97706}'
  )
);

assert(
  flashCss.includes(
    '.flashcard-learning-state[data-learning-state="learned"]{color:#16835c'
  )
);

/*
 * Official progress remains compact and dynamically denominated.
 */
const progressStart =
  newHskApp.indexOf(
    'function officialLearningProgressText(view)'
  );

const progressEnd =
  newHskApp.indexOf(
    'function renderOfficialLearningProgress(level)',
    progressStart
  );

assert(progressStart >= 0 && progressEnd > progressStart);

const progressBody =
  newHskApp.slice(
    progressStart,
    progressEnd
  );

assert(
  progressBody.includes(
    '\\u25CF ${view.learned}/${view.total}'
  )
);

assert(
  progressBody.includes(
    '\\u25D0 ${view.learning}'
  )
);

assert(!progressBody.includes('/500'));
assert(!progressBody.includes('/1000'));

/*
 * Cache contracts.
 */
assert(
  (newHskHtml.match(/lsv4=20260908-v1/g) || []).length >= 2,
  'New HSK app.js and style.css need V4 cache bust'
);

for (const html of [lookupHtml, flashHtml]) {
  assert(
    (html.match(/lsui=20260908-v1/g) || []).length >= 2,
    'Lookup and Flashcard must retain V3 cache bust'
  );
}

/*
 * Flashcard mojibake repair remains protected.
 */
const flashViewStart =
  flashApp.indexOf(
    'function flashcardLearningStateView(record)'
  );

const flashViewEnd =
  flashApp.indexOf(
    'function flashcardLearningTarget(card)',
    flashViewStart
  );

assert(
  flashViewStart >= 0 &&
  flashViewEnd > flashViewStart
);

const flashViewBody =
  flashApp.slice(
    flashViewStart,
    flashViewEnd
  );

assert(
  !flashViewBody.includes('\u00E2\u2014')
);

assert(
  !flashViewBody.includes('Ch\u00C6\u00B0a')
);

console.log(
  'PASS Learning State Lite V1 UI: New HSK order-badge ring + Lookup/Flashcard icon-only'
);

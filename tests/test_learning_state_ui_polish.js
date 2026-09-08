const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(...parts) {
  return fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
}

const newHskApp = read('modules', 'new-hsk-course', 'app.js');
const newHskCss = read('modules', 'new-hsk-course', 'style.css');
const newHskHtml = read('modules', 'new-hsk-course', 'index.html');

const lookupApp = read('modules', 'lookup', 'app.js');
const lookupCss = read('modules', 'lookup', 'style.css');
const lookupHtml = read('modules', 'lookup', 'index.html');

const flashApp = read('modules', 'hanzi-stroke', 'app.js');
const flashCss = read('modules', 'hanzi-stroke', 'style.css');
const flashHtml = read('modules', 'hanzi-stroke', 'index.html');

for (const [name, app] of [
  ['New HSK', newHskApp],
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
    assert(app.includes(marker), `${name}: missing ${marker}`);
  });
}

assert(
  newHskApp.includes('node.textContent = view.icon;'),
  'New HSK live patch must update icon only'
);
assert(
  lookupApp.includes('view.icon;'),
  'Lookup live patch must update icon only'
);
assert(
  flashApp.includes('view.icon;'),
  'Flashcard live patch must update icon only'
);

assert(
  !lookupApp.includes('class="word-badge lookup-learning-state"'),
  'Lookup Learning State must not use the old pill class'
);

assert(
  newHskCss.includes(
    '.nhsk-vocab-item__learning[data-learning-state="learning"]{color:#d97706}'
  )
);
assert(
  newHskCss.includes(
    '.nhsk-vocab-item__learning[data-learning-state="learned"]{color:#16835c}'
  )
);
assert(
  lookupCss.includes(
    '.lookup-learning-state[data-learning-state="learning"]{color:#d97706}'
  )
);
assert(
  lookupCss.includes(
    '.lookup-learning-state[data-learning-state="learned"]{color:#16835c}'
  )
);
assert(
  flashCss.includes(
    '.flashcard-learning-state[data-learning-state="learning"]{color:#d97706'
  )
);
assert(
  flashCss.includes(
    '.flashcard-learning-state[data-learning-state="learned"]{color:#16835c'
  )
);

const progressStart =
  newHskApp.indexOf('function officialLearningProgressText(view)');
const progressEnd =
  newHskApp.indexOf(
    'function renderOfficialLearningProgress(level)',
    progressStart
  );

assert(progressStart >= 0 && progressEnd > progressStart);
const progressBody = newHskApp.slice(progressStart, progressEnd);

assert(
  progressBody.includes('\\u25CF ${view.learned}/${view.total}'),
  'Official progress must retain dynamic learned/total'
);
assert(
  progressBody.includes('\\u25D0 ${view.learning}'),
  'Official progress must retain learning count'
);
assert(!progressBody.includes('/500'));
assert(!progressBody.includes('/1000'));

for (const html of [newHskHtml, lookupHtml, flashHtml]) {
  const count = (html.match(/lsui=20260908-v1/g) || []).length;
  assert(count >= 2, 'Both app.js and style.css need UI-polish cache bust');
}

const flashViewStart =
  flashApp.indexOf('function flashcardLearningStateView(record)');
const flashViewEnd =
  flashApp.indexOf(
    'function flashcardLearningTarget(card)',
    flashViewStart
  );
assert(flashViewStart >= 0 && flashViewEnd > flashViewStart);

const flashViewBody =
  flashApp.slice(flashViewStart, flashViewEnd);

assert(
  !flashViewBody.includes('\u00E2\u2014'),
  'Flashcard state view still contains mojibake symbol prefix'
);
assert(
  !flashViewBody.includes('Ch\u00C6\u00B0a'),
  'Flashcard state view still contains mojibake Vietnamese'
);

assert(
  flashApp.includes(
    "getFlashcardLearningCardType(card) !== 'vocabulary'"
  ),
  'Flashcard vocabulary-only classifier must remain'
);
assert(
  lookupApp.includes("item?.kind !== 'word'"),
  'Lookup vocabulary-only classifier must remain'
);

console.log(
  'PASS Learning State Lite V1 icon-only UI polish and encoding contract'
);

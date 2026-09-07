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

const css = fs.readFileSync(
  path.join(
    ROOT,
    'modules',
    'new-hsk-course',
    'style.css'
  ),
  'utf8'
);

[
  'function learningStateView(record)',
  'function renderVocabularyLearningState(hanzi, record)',
  'function patchVocabularyLearningState(targetLike)',

  "'● Đã học'",
  "'◐ Đang học'",
  "'○ Chưa học'",

  'const sortedItems = sortByOrder(items);',
  'LearningState.getMany(',
  'sortedItems.map(item => item.hanzi)',
  'sortedItems.map((item, index) =>',

  '${renderVocabularyLearningState(item.hanzi, learningRecords[index])}',

  'data-learning-state-word="${attr(word)}"',
  'data-learning-state="${attr(view.state)}"',

  'LearningState.subscribe(detail => {'
].forEach(marker => {
  assert(
    app.includes(marker),
    `Missing LS3A marker: ${marker}`
  );
});


const renderStart =
  app.indexOf(
    'function renderVocabulary(items, options = {})'
  );

assert(
  renderStart >= 0,
  'renderVocabulary must exist'
);

const renderEnd =
  app.indexOf(
    '\n  function ',
    renderStart + 20
  );

assert(
  renderEnd > renderStart,
  'renderVocabulary boundary must exist'
);

const renderBody =
  app.slice(
    renderStart,
    renderEnd
  );


assert(
  renderBody.includes(
    'const sortedItems = sortByOrder(items);'
  ),
  'Vocabulary must sort once'
);

assert(
  renderBody.includes(
    'LearningState.getMany('
  ),
  'Vocabulary must batch Learning State reads'
);

assert(
  renderBody.includes(
    'sortedItems.map(item => item.hanzi)'
  ),
  'Batch read must use visible vocabulary Hanzi'
);

assert(
  renderBody.includes(
    'sortedItems.map((item, index) =>'
  ),
  'Vocabulary renderer must reuse sortedItems'
);

assert(
  !renderBody.includes(
    'sortByOrder(items).map((item, index) =>'
  ),
  'Vocabulary must not sort again during map'
);

assert(
  renderBody.includes(
    '${renderVocabularyLearningState(item.hanzi, learningRecords[index])}'
  ),
  'Each vocabulary item must render Learning State'
);


const patchStart =
  app.indexOf(
    'function patchVocabularyLearningState(targetLike)'
  );

const patchEnd =
  app.indexOf(
    'function renderVocabulary(items, options = {})',
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
    "querySelectorAll?.('[data-learning-state-word]')"
  ),
  'Live update must patch existing badges'
);

assert(
  !patchBody.includes(
    'rerenderCurrentContent('
  ),
  'State update must not rerender current content'
);

assert(
  !patchBody.includes(
    'render()'
  ),
  'State update must not rerender whole app'
);


assert(
  css.includes(
    '.nhsk-vocab-item__learning{'
  ),
  'Compact badge CSS must exist'
);

assert(
  css.includes(
    'display:inline-flex'
  ),
  'Badge must remain inline'
);

assert(
  css.includes(
    'white-space:nowrap'
  ),
  'Badge must remain one line'
);

console.log(
  'PASS LS3A New HSK compact Learning State badge'
);
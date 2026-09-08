const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const app = fs.readFileSync(
  path.join(ROOT, 'modules', 'new-hsk-course', 'app.js'),
  'utf8'
);

const css = fs.readFileSync(
  path.join(ROOT, 'modules', 'new-hsk-course', 'style.css'),
  'utf8'
);

[
  'function learningStateView(record)',
  'function renderVocabularyLearningState(hanzi, record)',
  'function patchVocabularyLearningState(targetLike)',
  'const sortedItems = sortByOrder(items);',
  'LearningState.getMany(',
  'sortedItems.map(item => item.hanzi)',
  'sortedItems.map((item, index) =>',
  '${renderVocabularyLearningState(item.hanzi, learningRecords[index])}',
  'data-learning-state-word="${attr(word)}"',
  'data-learning-state="${attr(view.state)}"',
  'title="${attr(view.label)}"',
  'aria-label="${attr(view.label)}"',
  'LearningState.subscribe(detail => {'
].forEach(marker => {
  assert(
    app.includes(marker),
    `Missing New HSK Learning State marker: ${marker}`
  );
});

assert(
  app.includes(
    '<span class="nhsk-vocab-item__order" ${renderVocabularyLearningState(item.hanzi, learningRecords[index])}>${item.order}</span>'
  ),
  'Learning State metadata must live on the existing order badge'
);

const properStart =
  app.indexOf(
    'function renderProperNouns(items, options = {})'
  );

const properEnd =
  app.indexOf(
    'function renderNotes(items)',
    properStart
  );

assert(
  properStart >= 0 &&
  properEnd > properStart,
  'Proper-noun renderer must exist'
);

const properBody =
  app.slice(
    properStart,
    properEnd
  );

assert(
  properBody.includes(
    '<span class="nhsk-vocab-item__order">${item.order}</span>'
  ),
  'Proper nouns must preserve their existing order badge'
);

assert(
  !properBody.includes(
    'data-learning-state-word'
  ),
  'Learning State Lite V1 must not attach vocabulary state to proper nouns'
);

assert(
  !app.includes(
    'class="nhsk-vocab-item__learning" data-learning-state-word='
  ),
  'New HSK must not render a separate visible state icon'
);

const viewStart =
  app.indexOf(
    'function learningStateView(record)'
  );

const viewEnd =
  app.indexOf(
    'function renderVocabularyLearningState(hanzi, record)',
    viewStart
  );

assert(viewStart >= 0 && viewEnd > viewStart);

const viewBody =
  app.slice(viewStart, viewEnd);

assert(
  !viewBody.includes("icon: '\\u25CF'") &&
  !viewBody.includes("icon: '\\u25D0'") &&
  !viewBody.includes("icon: '\\u25CB'"),
  'New HSK item state view must no longer expose visible icon glyphs'
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

assert(patchStart >= 0 && patchEnd > patchStart);

const patchBody =
  app.slice(patchStart, patchEnd);

assert(
  patchBody.includes(
    "querySelectorAll?.('[data-learning-state-word]')"
  ),
  'Live state update must target existing order badges'
);

assert(
  !patchBody.includes(
    'node.textContent'
  ),
  'Live state patch must never replace the visible order number'
);

assert(
  !patchBody.includes(
    'rerenderCurrentContent('
  ) &&
  !patchBody.includes(
    'render()'
  ),
  'Learning State change must patch in place'
);

assert(
  css.includes(
    '.nhsk-vocab-item__order[data-learning-state="learning"]{outline:1.5px solid rgba(217,119,6,.72);outline-offset:1px}'
  ),
  'Learning state needs a subtle orange ring'
);

assert(
  css.includes(
    '.nhsk-vocab-item__order[data-learning-state="learned"]{outline:1.5px solid rgba(22,131,92,.72);outline-offset:1px}'
  ),
  'Learned state needs a subtle green ring'
);

assert(
  !css.includes(
    '.nhsk-vocab-item__order[data-learning-state="unseen"]{'
  ),
  'Unseen state must preserve the original badge appearance'
);

console.log(
  'PASS New HSK Learning State uses the existing pastel order badge without visible state icons'
);

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

const taxonomy = JSON.parse(
  fs.readFileSync(
    path.join(
      ROOT,
      'modules',
      'new-hsk-course',
      'data',
      'first-occurrence.json'
    ),
    'utf8'
  )
);


/*
 * Architecture markers.
 */

[
  'function officialLearningLevelLabel(level)',
  'function officialLearningProgressView(level)',
  'function officialLearningProgressText(view)',
  'function renderOfficialLearningProgress(level)',
  'function patchOfficialLearningProgress()',

  '${renderOfficialLearningProgress(lesson.level)}',
  '${renderOfficialLearningProgress(state.level)}',

  'data-learning-progress-level=',
  'data-learning-progress-ready=',

  'patchOfficialLearningProgress();',
  'loadLearningTaxonomy()',

  '● ${view.learned}/${view.total} đã học',
  '◐ ${view.learning} đang học'
].forEach(marker => {
  assert(
    app.includes(marker),
    `Missing LS3B marker: ${marker}`
  );
});


/*
 * Official progress uses cumulative UNIQUE vocabulary identities.
 */

const rows =
  Array.isArray(taxonomy.terms)
    ? taxonomy.terms
    : [];

function officialLevels(row){
  return [
    ...new Set(
      (
        Array.isArray(row.officialLevels)
          ? row.officialLevels
          : []
      )
        .map(Number)
        .filter(
          value =>
            Number.isInteger(value) &&
            value >= 1 &&
            value <= 3
        )
    )
  ];
}

function cumulativeUnique(level){
  return new Set(
    rows
      .filter(row =>
        officialLevels(row)
          .some(value => value <= level)
      )
      .map(row =>
        String(row.hanzi || '').trim()
      )
      .filter(Boolean)
  );
}

assert.strictEqual(
  cumulativeUnique(1).size,
  300,
  'HSK1 denominator must be 300 unique words'
);

assert.strictEqual(
  cumulativeUnique(2).size,
  497,
  'HSK1-2 denominator must be 497 unique words'
);

assert.strictEqual(
  cumulativeUnique(3).size,
  988,
  'HSK1-3 denominator must be 988 unique words'
);


/*
 * UI must consume progress.total dynamically.
 * Raw syllabus-row totals 500 / 1000 are not Learning State totals.
 */

const textStart =
  app.indexOf(
    'function officialLearningProgressText(view)'
  );

const textEnd =
  app.indexOf(
    'function renderOfficialLearningProgress(level)',
    textStart
  );

assert(textStart >= 0);
assert(textEnd > textStart);

const textBody =
  app.slice(
    textStart,
    textEnd
  );

assert(
  textBody.includes(
    '${view.learned}/${view.total}'
  ),
  'Progress UI must use calculated unique total'
);

assert(
  !textBody.includes('/500'),
  'Progress UI must not hard-code raw HSK1-2 row count'
);

assert(
  !textBody.includes('/1000'),
  'Progress UI must not hard-code raw HSK1-3 row count'
);


/*
 * Official progress calculation remains delegated
 * to the LS2B official taxonomy adapter.
 */

const progressViewStart =
  app.indexOf(
    'function officialLearningProgressView(level)'
  );

const progressViewEnd =
  app.indexOf(
    'function officialLearningProgressText(view)',
    progressViewStart
  );

assert(progressViewStart >= 0);
assert(progressViewEnd > progressViewStart);

const progressViewBody =
  app.slice(
    progressViewStart,
    progressViewEnd
  );

assert(
  progressViewBody.includes(
    'officialLearningProgress('
  ),
  'UI must consume LS2B officialLearningProgress'
);


/*
 * State changes patch only the progress nodes.
 */

const patchStart =
  app.indexOf(
    'function patchOfficialLearningProgress()'
  );

const patchEnd =
  app.indexOf(
    'function renderHero(lesson)',
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
    "'[data-learning-progress-level]'"
  ),
  'Progress patch must target existing progress nodes'
);

assert(
  !patchBody.includes(
    'rerenderCurrentContent('
  ),
  'Progress state changes must not rerender content'
);

assert(
  !patchBody.includes(
    'render()'
  ),
  'Progress state changes must not rerender whole app'
);


/*
 * Existing LS3A subscriber must patch both:
 * - vocabulary badge
 * - official progress
 */

const subscriberStart =
  app.lastIndexOf(
    'if(LearningState?.subscribe)'
  );

const exportStart =
  app.indexOf(
    'window.NewHskCourse = Object.freeze({',
    subscriberStart
  );

assert(subscriberStart >= 0);
assert(exportStart > subscriberStart);

const subscriberBody =
  app.slice(
    subscriberStart,
    exportStart
  );

assert(
  subscriberBody.includes(
    'patchVocabularyLearningState('
  ),
  'LS3A vocabulary patch must remain'
);

assert(
  subscriberBody.includes(
    'patchOfficialLearningProgress();'
  ),
  'LS3B progress patch must run on Learning State change'
);


/*
 * Initial taxonomy load must be non-blocking.
 */

const loadStart =
  app.indexOf(
    'async function load()'
  );

const popstateStart =
  app.indexOf(
    "window.addEventListener('popstate'",
    loadStart
  );

assert(loadStart >= 0);
assert(popstateStart > loadStart);

const loadBody =
  app.slice(
    loadStart,
    popstateStart
  );

assert(
  loadBody.includes(
    'loadLearningTaxonomy()'
  ),
  'Initial load must start taxonomy loading'
);

assert(
  loadBody.includes(
    'patchOfficialLearningProgress();'
  ),
  'Taxonomy completion must patch progress'
);


/*
 * Mobile presentation remains compact.
 */

assert(
  css.includes(
    '.nhsk-learning-progress{'
  ),
  'Progress CSS must exist'
);

assert(
  css.includes(
    'white-space:nowrap'
  ),
  'Progress must remain one line'
);

assert(
  css.includes(
    'overflow-x:auto'
  ),
  'Small screens may horizontally scroll the compact progress row'
);

assert(
  css.includes(
    '[data-learning-progress-ready="false"]'
  ),
  'Loading state styling must exist'
);

console.log(
  'PASS LS3B cumulative official HSK Learning State progress'
);
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
      'lookup',
      'app.js'
    ),
    'utf8'
  );

const html =
  fs.readFileSync(
    path.join(
      ROOT,
      'modules',
      'lookup',
      'index.html'
    ),
    'utf8'
  );


/*
 * Load order:
 * shared Learning State must exist before Lookup app.
 */

const learningScript =
  '../shared/learning-state.js?v=20260907-ls-lite-v1';

assert(
  html.includes(learningScript),
  'Lookup must load shared Learning State'
);

assert(
  html.indexOf(learningScript) <
    html.indexOf('src="app.js?'),
  'Learning State must load before Lookup app.js'
);

assert(
  html.includes(
    'learning=20260908-ls3c-v1'
  ),
  'Lookup app cache key must include LS3C'
);


/*
 * Architecture markers.
 */

[
  'const LearningState = window.TiengTrungLearningState || null;',
  'function lookupLearningStateView(record)',
  'function lookupLearningTarget(item)',
  'function renderLookupLearningState(',
  'function patchLookupLearningState(',

  "icon: '\\u25CF'",
  "icon: '\\u25D0'",
  "icon: '\\u25CB'",
  "label: '\\u0110\\u00E3 h\\u1ECDc'",
  "label: '\\u0110ang h\\u1ECDc'",
  "label: 'Ch\\u01B0a h\\u1ECDc'",
  'role="img"',
  'title="${escapeHtml(view.label)}"',
  'aria-label="${escapeHtml(view.label)}"',

  'const learningTargets =',
  'LearningState.getMany(',

  'results.map((item, index) => {',

  'renderLookupLearningState(lookupLearningTarget(item), learningRecords[index])',

  'data-learning-state-word=',
  'data-learning-state=',

  'LearningState.subscribe(detail => {'
].forEach(marker => {
  assert(
    app.includes(marker),
    `Missing LS3C marker: ${marker}`
  );
});


/*
 * Canonical identity:
 * Learning State MUST use search result item.target.
 *
 * traditional / aliases may match the query,
 * but must not become Learning State identities.
 */

const targetStart =
  app.indexOf(
    'function lookupLearningTarget(item)'
  );

const targetEnd =
  app.indexOf(
    'function renderLookupLearningState(',
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
    "item?.kind !== 'word'"
  ),
  'Lookup Learning State must be vocabulary-only'
);

assert(
  targetBody.includes(
    'item?.target'
  ),
  'Lookup Learning State must use canonical item.target'
);

assert(
  !targetBody.includes(
    'traditional'
  ),
  'Traditional form must not become a Learning State identity'
);

assert(
  !targetBody.includes(
    'aliases'
  ),
  'Search aliases must not become Learning State identities'
);


/*
 * Search renderer:
 * batch reads once for visible rows.
 */

const renderStart =
  app.indexOf(
    'function renderSearchResults(payload)'
  );

const renderEnd =
  app.indexOf(
    'async function resolveQuery(rawQuery)',
    renderStart
  );

assert(renderStart >= 0);
assert(renderEnd > renderStart);

const renderBody =
  app.slice(
    renderStart,
    renderEnd
  );

assert(
  renderBody.includes(
    'LearningState.getMany('
  ),
  'Search result state must use batched getMany'
);

assert(
  renderBody.includes(
    'results.map('
  ),
  'Visible search results must define the batch'
);

assert(
  renderBody.includes(
    'lookupLearningTarget(item)'
  ),
  'Batch targets must pass through vocabulary/canonical gate'
);


/*
 * Existing navigation identity stays canonical.
 */

assert(
  renderBody.includes(
    'data-search-char="${escapeHtml(item.target)}"'
  ),
  'Lookup navigation must continue using canonical item.target'
);


/*
 * Live state change patches existing badge only.
 * It must not rerun search/navigation.
 */

const patchStart =
  app.indexOf(
    'function patchLookupLearningState('
  );

const patchEnd =
  app.indexOf(
    'function renderSearchResults(payload)',
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
    "'[data-learning-state-word]'"
  ),
  'Live patch must target existing Learning State badges'
);

assert(
  !patchBody.includes(
    'runSearch('
  ),
  'Learning State update must not rerun Lookup search'
);

assert(
  !patchBody.includes(
    'renderSearchResults('
  ),
  'Learning State update must not rerender search results'
);

assert(
  !patchBody.includes(
    'innerHTML'
  ),
  'Learning State patch must update badge only'
);


/*
 * Existing result click target remains untouched.
 */

assert(
  app.includes(
    'openTargetWithContext(button.dataset.searchChar, button)'
  ),
  'Lookup navigation context contract must remain intact'
);


/*
 * No automatic seen tracking:
 * Lookup only reads Learning State.
 */

const lookupLearningSection =
  app.slice(
    app.indexOf(
      'function lookupLearningStateView(record)'
    ),
    app.indexOf(
      'async function resolveQuery(rawQuery)'
    )
  );

[
  'recordAttempt(',
  'markLearning(',
  'markLearned('
].forEach(forbidden => {
  assert(
    !lookupLearningSection.includes(
      forbidden
    ),
    `Lookup must not auto-track viewing: ${forbidden}`
  );
});


console.log(
  'PASS LS3C Lookup canonical vocabulary Learning State badge'
);
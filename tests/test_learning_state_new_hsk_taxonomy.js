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

const html = fs.readFileSync(
  path.join(
    ROOT,
    'modules',
    'new-hsk-course',
    'index.html'
  ),
  'utf8'
);

const first = JSON.parse(
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

assert(
  html.includes(
    '../shared/learning-state.js?v=20260907-ls-lite-v1'
  ),
  'New HSK must load Learning State'
);

assert(
  html.indexOf(
    '../shared/learning-state.js?v=20260907-ls-lite-v1'
  ) < html.indexOf('src="app.js?'),
  'Learning State must load before New HSK app.js'
);

assert(
  html.includes(
    'learning=20260907-ls-lite-v1'
  ),
  'New HSK app cache key must include LS-Lite'
);

[
  'const LearningState = window.TiengTrungLearningState;',
  "const FIRST_OCCURRENCE_URL = 'data/first-occurrence.json';",
  'function buildLearningTaxonomy(payload = {})',
  'function loadLearningTaxonomy()',
  'function learningInfoForWord(hanzi)',
  'function officialLearningTargets(level)',
  'function officialLearningProgress(level)',
  'getOfficialLearningProgress(level)',
  'getOfficialLearningTargets(level)'
].forEach(marker => {
  assert(
    app.includes(marker),
    `Missing LS2B marker: ${marker}`
  );
});

const rows = Array.isArray(first.terms)
  ? first.terms
  : [];

function officialLevels(row){
  return [
    ...new Set(
      (Array.isArray(row.officialLevels)
        ? row.officialLevels
        : []
      )
        .map(Number)
        .filter(
          level =>
            Number.isInteger(level) &&
            level >= 1 &&
            level <= 3
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
      .map(row => String(row.hanzi || '').trim())
      .filter(Boolean)
  );
}

assert.strictEqual(
  cumulativeUnique(1).size,
  300,
  'HSK1 cumulative unique vocabulary must be 300'
);

assert.strictEqual(
  cumulativeUnique(2).size,
  497,
  'HSK2 cumulative unique vocabulary must be 497'
);

assert.strictEqual(
  cumulativeUnique(3).size,
  988,
  'HSK3 cumulative unique vocabulary must be 988'
);

const xuexi = rows.find(
  row => row.hanzi === '\u5b66\u4e60'
);

assert(xuexi);

assert.deepStrictEqual(
  xuexi.officialLevels,
  [1]
);

assert.strictEqual(
  xuexi.firstSeenLevel,
  1
);

assert.strictEqual(
  xuexi.firstSeenLesson,
  1
);

assert(
  xuexi.lessonNewWordRefs.some(
    ref =>
      Number(ref.level) === 1 &&
      Number(ref.lesson) === 9
  ),
  '学习 must preserve formal course-new-word placement'
);

const china = rows.find(
  row => row.hanzi === '\u4e2d\u56fd'
);

assert(china);

assert.deepStrictEqual(
  china.officialLevels,
  [1]
);

assert.strictEqual(
  china.firstSeenLevel,
  1
);

assert.strictEqual(
  china.firstSeenLesson,
  2
);

assert.strictEqual(
  china.lessonNewWordRefs.length,
  0,
  '中国 is course exposure, not formal lesson new word'
);

assert(
  !app.includes('300 / 500 / 1000'),
  'Runtime must not hard-code misleading progress denominators'
);

console.log(
  'PASS LS2B New HSK taxonomy + unique official progress adapter'
);
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

const SCRIPT = path.join(
  ROOT,
  'modules',
  'shared',
  'learning-state.js'
);

function createLocalStorage() {
  const data = new Map();

  return {
    getItem(key) {
      return data.has(key)
        ? data.get(key)
        : null;
    },

    setItem(key, value) {
      data.set(
        String(key),
        String(value)
      );
    },

    removeItem(key) {
      data.delete(String(key));
    },

    clear() {
      data.clear();
    }
  };
}

function loadLearningState() {
  const localStorage =
    createLocalStorage();

  const browserEvents = [];

  const window = {
    localStorage,
    console,

    CustomEvent:
      function CustomEvent(type, init) {
        this.type = type;
        this.detail =
          init && init.detail;
      },

    dispatchEvent(event) {
      browserEvents.push(event);
      return true;
    }
  };

  const context = vm.createContext({
    window,
    console,
    Date,
    Set,
    Map,
    Object,
    JSON,
    Number,
    String,
    Math
  });

  vm.runInContext(
    fs.readFileSync(
      SCRIPT,
      'utf8'
    ),
    context,
    { filename: SCRIPT }
  );

  return {
    api:
      context.window
        .TiengTrungLearningState,

    localStorage,
    browserEvents
  };
}

(function run() {
  const {
    api,
    localStorage,
    browserEvents
  } = loadLearningState();

  assert(
    api,
    'Learning State API must exist'
  );

  assert.strictEqual(
    api.STORAGE_KEY,
    'tiengTrung.learning.words.v1'
  );

  assert.strictEqual(
    api.get('学习').state,
    'unseen'
  );

  assert.strictEqual(
    api.get(' 学习 ').target,
    '学习'
  );

  const learning =
    api.markLearning(
      '学习',
      {
        source: 'flashcard:review',
        at:
          '2026-09-07T01:00:00.000Z'
      }
    );

  assert.strictEqual(
    learning.state,
    'learning'
  );

  assert.strictEqual(
    learning.attempts,
    1
  );

  assert.strictEqual(
    learning.successes,
    0
  );

  const learned =
    api.markLearned(
      '学习',
      {
        source: 'flashcard:easy',
        at:
          '2026-09-07T02:00:00.000Z'
      }
    );

  assert.strictEqual(
    learned.state,
    'learned'
  );

  assert.strictEqual(
    learned.attempts,
    2
  );

  assert.strictEqual(
    learned.successes,
    1
  );

  const laterWrong =
    api.markLearning(
      '学习',
      {
        source: 'practice',
        at:
          '2026-09-07T03:00:00.000Z'
      }
    );

  assert.strictEqual(
    laterWrong.state,
    'learned',
    'A later miss must not erase learned evidence'
  );

  api.markLearning(
    '老师',
    {
      source: 'flashcard:hard'
    }
  );

  const progress =
    api.getProgress([
      '学习',
      '老师',
      '中国',
      '学习'
    ]);

  assert.deepStrictEqual(
    JSON.parse(
      JSON.stringify(progress)
    ),
    {
      total: 3,
      learned: 1,
      learning: 1,
      unseen: 1
    }
  );

  const stored =
    JSON.parse(
      localStorage.getItem(
        api.STORAGE_KEY
      )
    );

  assert.strictEqual(
    stored.schemaVersion,
    1
  );

  assert(
    stored.words['学习']
  );

  assert(
    !Array.isArray(
      stored.words['学习']
    ),
    'Storage must be aggregate data'
  );

  assert(
    !Object.prototype.hasOwnProperty.call(
      stored,
      'events'
    ),
    'Lite V1 must not store event history'
  );

  assert(
    browserEvents.length >= 3
  );

  assert.strictEqual(
    browserEvents[0].type,
    'tiengTrung:learning-state-change'
  );

  localStorage.setItem(
    api.STORAGE_KEY,
    '{broken json'
  );

  assert.strictEqual(
    api.get('中国').state,
    'unseen',
    'Corrupt storage must fail safe'
  );

  assert.strictEqual(
    api.normalizeTarget({
      hanzi: ' 中国 '
    }),
    '中国'
  );

  assert.strictEqual(
    api.normalizeTarget({
      target: '学习'
    }),
    '学习'
  );

  assert.strictEqual(
    api.normalizeTarget(null),
    ''
  );

  console.log(
    'PASS Learning State Lite V1 core'
  );
})();
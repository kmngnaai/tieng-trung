const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

const source = fs.readFileSync(
  path.join(
    ROOT,
    'modules',
    'shared',
    'learning-state.js'
  ),
  'utf8'
);

let reads = 0;

const storage = {
  getItem() {
    reads += 1;

    return JSON.stringify({
      schemaVersion: 1,
      words: {
        学习: {
          attempts: 1,
          successes: 1,
          lastActivityAt: '',
          lastSource: 'test'
        },
        中国: {
          attempts: 1,
          successes: 0,
          lastActivityAt: '',
          lastSource: 'test'
        }
      }
    });
  },

  setItem() {},
  removeItem() {}
};

class FakeCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

const fakeWindow = {
  localStorage: storage,
  console,
  CustomEvent: FakeCustomEvent,

  addEventListener() {},

  dispatchEvent() {
    return true;
  }
};

vm.runInNewContext(
  source,
  {
    window: fakeWindow,
    globalThis: fakeWindow,
    console,
    CustomEvent: FakeCustomEvent
  },
  {
    filename: 'learning-state.js'
  }
);

const LearningState =
  fakeWindow.TiengTrungLearningState;

assert(
  LearningState,
  'Learning State API must load'
);

reads = 0;

const records = LearningState.getMany([
  '学习',
  '中国',
  '学习',
  '',
  null
]);

assert.strictEqual(
  reads,
  1,
  'getMany must read localStorage exactly once'
);

assert.strictEqual(
  records.length,
  5,
  'getMany must preserve input length'
);

assert.strictEqual(
  records[0].state,
  'learned',
  '学习 should be learned'
);

assert.strictEqual(
  records[1].state,
  'learning',
  '中国 should be learning'
);

assert.strictEqual(
  records[2].state,
  'learned',
  'duplicate targets must preserve state'
);

assert.strictEqual(
  records[3].state,
  'unseen',
  'empty target should remain safe'
);

assert.strictEqual(
  records[4].state,
  'unseen',
  'null target should remain safe'
);

console.log(
  'PASS Learning State getMany single-read performance contract'
);
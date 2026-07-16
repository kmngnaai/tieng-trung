'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const machine = require(path.resolve(__dirname, '..', 'pinyin-typing-state-machine.js'));

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

function createXuexi() {
  return machine.createTypingState({ cardId: '学习', answers: ['xuéxí'] });
}

function submit(state, token, now) {
  return machine.submitTypingToken(state, token, now);
}

test('creates five empty slots for xuexi', () => {
  const state = createXuexi();
  const view = machine.getTypingViewModel(state);
  assert.equal(view.slotCount, 5);
  assert.deepEqual(view.slots.map((slot) => slot.display), ['_', '_', '_', '_', '_']);
  assert.equal(view.slots[0].status, 'active');
});

test('accepts one correct token and advances exactly one position', () => {
  const result = submit(createXuexi(), 'x');
  assert.equal(result.event.type, 'correct');
  assert.equal(result.state.currentIndex, 1);
  assert.deepEqual(result.state.committedTokens, ['x']);
  assert.deepEqual(machine.getTypingViewModel(result.state).slots.map((slot) => slot.display), ['x', '_', '_', '_', '_']);
});

test('wrong first token stays locked at position zero and is red in view model', () => {
  const result = submit(createXuexi(), 's');
  const view = machine.getTypingViewModel(result.state);
  assert.equal(result.event.type, 'wrong');
  assert.equal(result.event.locked, true);
  assert.equal(result.state.currentIndex, 0);
  assert.equal(view.slots[0].status, 'wrong');
  assert.equal(view.slots[0].display, 's');
  assert.equal(view.slots[1].display, '_');
});

test('a wrong token must be replaced by the correct token before advancing', () => {
  let result = submit(createXuexi(), 's');
  result = submit(result.state, 'x');
  assert.equal(result.event.type, 'correct');
  assert.equal(result.state.currentIndex, 1);
  assert.deepEqual(result.state.committedTokens, ['x']);
  assert.equal(result.state.currentWrongToken, '');
});

test('wrong token at second position locks only the second position', () => {
  let result = submit(createXuexi(), 'x');
  result = submit(result.state, 'a');
  const view = machine.getTypingViewModel(result.state);
  assert.equal(result.state.currentIndex, 1);
  assert.deepEqual(result.state.committedTokens, ['x']);
  assert.equal(view.slots[0].status, 'correct');
  assert.equal(view.slots[1].status, 'wrong');
  assert.equal(view.slots[1].display, 'a');
});

test('fifth wrong attempt at one position unlocks only that position hint', () => {
  let state = createXuexi();
  const wrongTokens = ['s', 'q', 'k', 'c', 'z'];
  let lastEvent = null;

  wrongTokens.forEach((token) => {
    const result = submit(state, token);
    state = result.state;
    lastEvent = result.event;
  });

  assert.equal(state.currentIndex, 0);
  assert.equal(state.mistakesByIndex[0], 5);
  assert.equal(state.hintShownByIndex[0], true);
  assert.equal(lastEvent.hintUnlocked, true);
  assert.equal(lastEvent.hint.token, 'x');
  assert.equal(machine.getTypingViewModel(state).hint.token, 'x');
  assert.equal(state.hintShownByIndex.slice(1).some(Boolean), false);
});

test('hint remains at current position until correct token is supplied', () => {
  let state = createXuexi();
  ['s', 'q', 'k', 'c', 'z'].forEach((token) => {
    state = submit(state, token).state;
  });
  state = submit(state, 'b').state;
  assert.equal(state.currentIndex, 0);
  assert.equal(state.hintShownByIndex[0], true);
  state = submit(state, 'x').state;
  assert.equal(state.currentIndex, 1);
  assert.equal(state.committedTokens[0], 'x');
});

test('completes immediately on the final correct token and ignores later input', () => {
  let result = machine.submitTypingSequence(createXuexi(), 'xuexi', 12345);
  assert.equal(result.state.status, 'completed');
  assert.equal(result.state.completedAt, 12345);
  assert.equal(result.events.at(-1).type, 'completed');

  const after = submit(result.state, 'i');
  assert.equal(after.event.type, 'ignored');
  assert.equal(after.event.reason, 'already-completed');
  assert.deepEqual(after.state.committedTokens, ['x', 'u', 'e', 'x', 'i']);
});

test('spaces and separators are ignored by sequence input', () => {
  const result = machine.submitTypingSequence(createXuexi(), 'xue xi');
  assert.equal(result.state.status, 'completed');
  assert.deepEqual(result.state.committedTokens, ['x', 'u', 'e', 'x', 'i']);
});

test('sequence input stops at the first wrong token', () => {
  const result = machine.submitTypingSequence(createXuexi(), 'suexi');
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].type, 'wrong');
  assert.equal(result.state.currentIndex, 0);
  assert.equal(result.state.currentWrongToken, 's');
});

test('delete clears current wrong token before deleting prior correct tokens', () => {
  let state = submit(createXuexi(), 's').state;
  let result = machine.deleteTypingToken(state);
  assert.equal(result.event.type, 'cleared-wrong');
  assert.equal(result.state.currentIndex, 0);
  assert.equal(result.state.currentWrongToken, '');

  state = submit(result.state, 'x').state;
  result = machine.deleteTypingToken(state);
  assert.equal(result.event.type, 'deleted-correct');
  assert.equal(result.state.currentIndex, 0);
  assert.deepEqual(result.state.committedTokens, []);
});

test('accepts u, v, ü and u: for an expected ü token', () => {
  ['u', 'v', 'ü', 'u:'].forEach((variant) => {
    let state = machine.createTypingState({ answers: ['nǚ'] });
    state = submit(state, 'n').state;
    const result = submit(state, variant);
    assert.equal(result.event.type, 'completed', variant);
  });
});

test('plain u answer does not accept v', () => {
  let state = machine.createTypingState({ answers: ['shū'] });
  state = submit(state, 's').state;
  state = submit(state, 'h').state;
  const result = submit(state, 'v');
  assert.equal(result.event.type, 'wrong');
  assert.equal(result.state.currentIndex, 2);
});

test('supports multiple source-backed pronunciations without inventing another answer', () => {
  let state = machine.createTypingState({ answers: ['xíng', 'háng'] });
  let result = machine.submitTypingSequence(state, 'hang');
  assert.equal(result.state.status, 'completed');
  assert.equal(result.event, undefined);
  assert.deepEqual(result.events.at(-1).completedAnswers.map((item) => item.compact), ['hang']);

  state = machine.createTypingState({ answers: ['xíng', 'háng'] });
  result = machine.submitTypingSequence(state, 'qing');
  assert.equal(result.state.status, 'wrong-current-token');
  assert.equal(result.state.currentIndex, 0);
});

test('does not reveal an ambiguous hint when candidate answers differ at current position', () => {
  let state = machine.createTypingState({ answers: ['xíng', 'háng'] });
  ['q', 'b', 'c', 'd', 'e'].forEach((token) => {
    state = submit(state, token).state;
  });
  const view = machine.getTypingViewModel(state);
  assert.equal(state.hintShownByIndex[0], false);
  assert.equal(view.hint, null);
  assert.equal(state.usedHint, false);
});

test('restores committed position, mistakes and hint state from a serializable snapshot', () => {
  let state = createXuexi();
  state = submit(state, 'x').state;
  ['a', 'b', 'c', 'd', 'f'].forEach((token) => {
    state = submit(state, token).state;
  });

  const restored = machine.restoreTypingState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.currentIndex, 1);
  assert.deepEqual(restored.committedTokens, ['x']);
  assert.equal(restored.mistakesByIndex[1], 5);
  assert.equal(restored.hintShownByIndex[1], true);
  assert.equal(machine.getTypingViewModel(restored).hint.token, 'u');
});

let passed = 0;
const failures = [];
for (const item of tests) {
  try {
    item.fn();
    passed += 1;
    console.log(`PASS ${item.name}`);
  } catch (error) {
    failures.push({ name: item.name, error });
    console.error(`FAIL ${item.name}`);
    console.error(error.stack || error.message || error);
  }
}

console.log(`\n${passed}/${tests.length} tests passed.`);
if (failures.length > 0) process.exitCode = 1;

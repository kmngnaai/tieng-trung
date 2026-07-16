'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const engine = require(path.resolve(__dirname, '..', 'pinyin-typing-engine.js'));

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

function tokens(value) {
  return engine.tokenizePinyinForTyping(value).tokens;
}

test('exports engine version', () => {
  assert.equal(engine.ENGINE_VERSION, '1.0.0');
});

test('removes tones but preserves ü', () => {
  assert.equal(engine.stripPinyinToneMarks('xuéxí'), 'xuexi');
  assert.equal(engine.stripPinyinToneMarks('nǚ’ér'), 'nü’er');
  assert.equal(engine.stripPinyinToneMarks('lǜsè'), 'lüse');
});

test('tokenizes spaces and separators without consuming positions', () => {
  assert.deepEqual(tokens("xué xí"), ['x', 'u', 'e', 'x', 'i']);
  assert.deepEqual(tokens("nǚ'ér"), ['n', 'ü', 'e', 'r']);
  assert.deepEqual(tokens('xue-xi'), ['x', 'u', 'e', 'x', 'i']);
});

test('tokenizes u: as one token', () => {
  assert.deepEqual(tokens('nu:er'), ['n', 'u:', 'e', 'r']);
});

test('removes tone numbers', () => {
  assert.deepEqual(tokens('xue2 xi2'), ['x', 'u', 'e', 'x', 'i']);
});

test('accepts requested ü variants only when expected token is ü', () => {
  ['ü', 'u', 'v', 'u:'].forEach((actual) => {
    assert.equal(engine.isTypingTokenAccepted('ü', actual), true, actual);
  });
  assert.equal(engine.isTypingTokenAccepted('u', 'u'), true);
  assert.equal(engine.isTypingTokenAccepted('u', 'v'), false);
  assert.equal(engine.isTypingTokenAccepted('u', 'u:'), false);
});

test('accepts xuexi variants', () => {
  const answer = tokens('xuéxí');
  ['xuexi', 'xue xi', 'XUE XI', 'xuéxí'].forEach((actual) => {
    assert.equal(engine.comparePinyinTyping(answer, tokens(actual)).complete, true, actual);
  });
});

test('accepts all requested nüer variants', () => {
  const answer = tokens("nǚ'ér");
  ['nüer', 'nuer', 'nver', 'nu:er', 'nü er', 'nv er', 'nu er'].forEach((actual) => {
    assert.equal(engine.comparePinyinTyping(answer, tokens(actual)).complete, true, actual);
  });
});

test('accepts all requested lüse variants', () => {
  const answer = tokens('lǜsè');
  ['lüse', 'luse', 'lvse', 'lu:se'].forEach((actual) => {
    assert.equal(engine.comparePinyinTyping(answer, tokens(actual)).complete, true, actual);
  });
});

test('marks exact wrong position', () => {
  const result = engine.comparePinyinTyping('xuéxí', 'suexi');
  assert.deepEqual(result.wrongPositions, [0]);
  assert.equal(result.positions[1].status, 'correct');
});

test('marks missing tokens without treating them as wrong', () => {
  const result = engine.comparePinyinTyping('xuéxí', 'xue');
  assert.deepEqual(result.wrongPositions, []);
  assert.deepEqual(result.missingPositions, [3, 4]);
  assert.equal(result.prefixValid, true);
  assert.equal(result.complete, false);
});

test('marks extra token when an earlier error prevents completion', () => {
  const result = engine.comparePinyinTyping('xuéxí', 'suexii');
  assert.deepEqual(result.wrongPositions, [0]);
  assert.deepEqual(result.extraPositions, [5]);
  assert.equal(result.complete, false);
});

test('builds source-backed alternative answers and removes duplicates', () => {
  const answers = engine.buildAcceptedPinyinAnswers(['xíng', 'háng', 'xíng']);
  assert.equal(answers.length, 2);
  assert.deepEqual(answers.map((answer) => answer.compact), ['xing', 'hang']);
});

test('matches a valid prefix across multiple pronunciations', () => {
  const answers = engine.buildAcceptedPinyinAnswers(['xíng', 'háng']);
  const result = engine.matchPinyinTypingPrefix(answers, 'xi');
  assert.equal(result.prefixValid, true);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].compact, 'xing');
});

test('rejects an unsupported prefix', () => {
  const answers = engine.buildAcceptedPinyinAnswers(['xíng', 'háng']);
  const result = engine.matchPinyinTypingPrefix(answers, 'qi');
  assert.equal(result.prefixValid, false);
  assert.equal(result.complete, false);
});

test('reports unsupported non-pinyin characters', () => {
  const result = engine.tokenizePinyinForTyping('xue习');
  assert.equal(result.valid, false);
  assert.equal(result.invalidCharacters.length, 1);
  assert.equal(result.invalidCharacters[0].character, '习');
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

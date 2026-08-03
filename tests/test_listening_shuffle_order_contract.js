'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'modules', 'listening', 'app.js'), 'utf8');
const builders = require(path.join(root, 'modules', 'listening', 'activity-builders.js'));
const matching = require(path.join(root, 'modules', 'shared', 'matching-engine.js'));

assert.match(app, /shuffleItems:\s*true/, 'shuffle should be enabled by default for new listening sessions');
assert.match(app, /Thứ tự luyện tập/, 'settings must expose practice order');
assert.match(app, /\['shuffle', 'Xáo trộn'\], \['original', 'Theo thứ tự'\]/, 'settings must offer shuffle and original order');
assert.match(app, /function practiceOrderCard\(/, 'the order choice must be visible before starting an activity');
assert.match(app, /data-action="set-practice-order"/, 'practice order must have a settings action');
assert.match(app, /function resolvePracticeShuffleSeed\(/, 'session shuffle seed resolver is required');
assert.match(app, /function arrangePracticeItems\(/, 'practice items need one shared ordering helper');
assert.match(app, /shuffleSeed:\s*state\.practiceShuffleSeed/, 'last session must persist the shuffle seed');
assert.match(app, /shuffleSeed:\s*descriptor\.shuffleSeed/, 'dataset session restore must reuse its shuffle seed');
assert.match(app, /arrangePracticeItems\(sentencePool, shuffleSeed\)\.slice\(0, batchCount\)/, 'batch dictation must shuffle before taking the requested count');
assert.match(app, /startItemId: item && item\.id/, 'opening one preview item must keep that item selected after shuffling');
assert.match(app, /state\.practiceItems = arrangePracticeItems\(retryItems, shuffleSeed\)/, 'retrying wrong items should honor the selected order mode');

const orderHandler = app.match(/function setPracticeOrder\(mode\) \{([\s\S]*?)\n  \}\n\n  function setFloatingAudioMode/);
assert(orderHandler, 'practice order handler exists');
assert(!orderHandler[1].includes('render();'), 'changing practice order must not rebuild or scroll the settings sheet');
assert(orderHandler[1].includes('syncPracticeOrderControls();'), 'changing practice order updates buttons in place');

const source = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
assert.deepStrictEqual(
  builders.deterministicShuffle(source, 'same-seed').map(item => item.id),
  builders.deterministicShuffle(source, 'same-seed').map(item => item.id),
  'the same session seed must keep the same question order'
);

const pairs = source.map(item => ({ id: item.id, leftText: item.id, rightText: item.id.toUpperCase() }));
const originalSession = matching.createSession(pairs, { shuffleItems: false, roundLimit: 2 });
assert.deepStrictEqual(originalSession.order, ['a', 'b', 'c', 'd'], 'matching should preserve source round order when shuffle is disabled');

console.log('listening shuffle order contract passed');

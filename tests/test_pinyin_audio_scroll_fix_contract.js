'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const index = read('modules/pinyin/index.html');
const app = read('modules/pinyin/app.js');
const audio = read('modules/pinyin/core/audio.js');
const state = read('modules/pinyin/core/state.js');
const ui = read('modules/pinyin/core/ui.js');
const listen = read('modules/pinyin/screens/listen.js');
const css = read('modules/pinyin/style.css');

const pinyinIndex = index.replace(/<script[^>]+app-shell\.js[^>]*><\/script>/g, '');
const versions = [...pinyinIndex.matchAll(/\?v=([^"']+)/g)].map(match => match[1]);
assert(versions.length >= 10, 'All Pinyin assets must be versioned');
assert.strictEqual(new Set(versions).size, 1, 'All Pinyin assets must share one cache version');
assert.strictEqual(versions[0], '20260803-pinyin-audio-scroll-fix-v1', 'Cache token must be bumped for the runtime fix');

assert(audio.includes("name === 'AbortError'") && audio.includes("name === 'NotAllowedError'"), 'Temporary playback failures must be classified explicitly');
assert(audio.includes('code === 3') && audio.includes('code === 4'), 'Only decode or unsupported media errors may become verified broken');
assert(audio.includes('const runtimeBroken = new Map()'), 'Verified broken files must use a dedicated map');
assert(audio.includes('const transientFailures = new Map()'), 'Temporary failures must remain separate from broken files');
assert(!audio.includes('runtimeBroken.add('), 'No generic playback rejection may blindly mark a file broken');
assert(audio.includes('runtimeBroken.delete(src)') && audio.includes('transientFailures.delete(src)'), 'A successful playback must clear stale runtime failure state');
assert(audio.includes('temporary: transientFailures.size'), 'Audio report must expose temporary failures separately');

assert(state.includes('viewPositions: {}'), 'Per-view scroll state must be persisted');
assert(state.includes('openRuleCategories: {}'), 'Open rule categories must be persisted');
assert(state.includes("selectedAudioKey: ''"), 'Selected audio interaction must be persisted');
assert(app.includes('function captureViewState') && app.includes('function restoreViewState'), 'Navigation context must capture and restore view state');
assert(app.includes('matrixScrollLeft') && app.includes('miniTableScrollLeft'), 'Horizontal scroll positions must be preserved');
assert(!app.includes('scrollIntoView'), 'Page restoration must not use scrollIntoView');
assert(app.includes('centerActiveTabWithoutPageScroll'), 'Tab centering must only change the tab strip scrollLeft');
assert(app.includes('data-mini-table-scroll') || listen.includes('data-mini-table-scroll'), 'Mini-table scroll containers must be addressable');
assert(app.includes('openRuleCategories') && listen.includes('data-rule-category-id'), 'Rule accordion state must survive rerenders');

assert(ui.includes('audioSelectionClass') && ui.includes('syllableSelectionClass'), 'Shared selected-state helpers must exist');
assert(listen.includes('data-audio-key') && listen.includes('data-select-safe'), 'Audio and lookup chips must expose stable selection keys');
assert(css.includes('button.is-selected') && css.includes('button.is-playing'), 'Selected and playing states must be visible');
assert(css.includes('button.is-temporary-error') && css.includes('button.is-verified-broken'), 'Temporary and verified errors must look different');

console.log('Pinyin audio + scroll fix contract: PASS');

'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const index = read('modules/pinyin/index.html');
const app = read('modules/pinyin/app.js');
const audio = read('modules/pinyin/core/audio.js');
const data = read('modules/pinyin/core/data.js');
const state = read('modules/pinyin/core/state.js');
const css = read('modules/pinyin/style.css');
const versionMatches = [...index.matchAll(/\?v=([^"']+)/g)].map(m => m[1]);
assert(versionMatches.length >= 10, 'Pinyin index must version all resources');
assert.strictEqual(new Set(versionMatches).size, 1, 'All Pinyin resources must share one cache token');
assert(index.includes('screens/learn.js') && index.includes('screens/listen.js') && index.includes('screens/quiz.js') && index.includes('screens/review.js') && index.includes('screens/progress.js'), 'Five screen files must be loaded');
assert(state.includes("const LS_KEY = 'tiengtrung_pinyin_v12_state'"), 'Existing localStorage key must remain unchanged');
assert(!app.includes('PATCH_PINYIN_') && !css.includes('PATCH_PINYIN_'), 'Live app and CSS must not contain stacked patch blocks');
assert(audio.includes('new root.SpeechSynthesisUtterance(entry.ttsText || entry.hanzi)'), 'Verified Hanzi or its verified disambiguating context may be spoken with a zh-CN device voice');
assert(!audio.includes('SpeechSynthesisUtterance(item.pinyin)') && !audio.includes('SpeechSynthesisUtterance(safe)'), 'Latin Pinyin must never be sent to browser TTS');
assert(audio.includes('const src = exactSource(item, value)'), 'Syllable playback must request exact tone audio first');
assert(!audio.includes('tones[0]') && !audio.includes('Object.keys(audioMap)[0]'), 'Audio must not silently fall back to a different tone');
assert(audio.includes('if (missing.length || !queue.length)'), 'Composed shadowing must fail when any segment is missing');
assert(!data.includes('hanzi_1000.json'), 'Pinyin runtime must stop loading the 1,000 Hanzi placeholder file');
assert(fs.existsSync(path.join(root, 'modules/pinyin/data/hanzi_1000.json')), 'The 1,000 Hanzi source file must remain in the repository');
assert(css.length < 50000, 'Pinyin CSS should remain consolidated');
assert(app.length < 18000, 'Bootstrap app should remain small after screen split');

const pinyin = JSON.parse(read('modules/pinyin/data/pinyin.json'));
let missingPaths = [];
for (const item of pinyin.items) {
  for (const [tone, rel] of Object.entries(item.audio || {})) {
    if (!fs.existsSync(path.join(root, 'modules/pinyin', rel))) missingPaths.push(`${item.safe}:${tone}:${rel}`);
  }
}
assert.deepStrictEqual(missingPaths, [], `Audio manifest points to missing files: ${missingPaths.slice(0,5).join(', ')}`);
console.log('Pinyin refactor contract: PASS');

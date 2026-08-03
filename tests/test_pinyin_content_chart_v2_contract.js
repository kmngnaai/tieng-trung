'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const json = rel => JSON.parse(read(rel));

const dataCore = read('modules/pinyin/core/data.js');
const audioCore = read('modules/pinyin/core/audio.js');
const listen = read('modules/pinyin/screens/listen.js');
const review = read('modules/pinyin/core/review.js');
const css = read('modules/pinyin/style.css');
const rules = json('modules/pinyin/data/pinyin_rules.json');
const fallbacks = json('modules/pinyin/data/pinyin_hanzi_fallbacks.json');
const audit = json('modules/pinyin/data/audio_audit.json');
const pinyin = json('modules/pinyin/data/pinyin.json');

assert.strictEqual(rules.categories.length, 5, 'Rules must contain five structured top-level categories');
assert(rules.categories.every(row => row.summary && row.sections && row.sections.length), 'Every rule category needs summary and details');
assert.strictEqual(pinyin.miniTables.length, 18, 'All 18 mini tables must remain');
assert(pinyin.miniTables.every(row => Array.isArray(row.notes) && row.notes.length), 'Every mini table needs its own notes');
assert(listen.includes('class="pinyin-matrix"') && listen.includes('data-matrix-row') && listen.includes('data-matrix-col'), 'Summary chart must be a row-column matrix');
assert(listen.includes("data-action=\"play-chart-syllable\"") || listen.includes("'play-chart-syllable'"), 'Chart cells must play in place');
assert(listen.includes('data-mini-table-id') && listen.includes('openMiniTables'), '18-table open state must be persisted');
assert(listen.includes('play-mini-table') && audioCore.includes('playExactSequence'), 'Sequential playback must use an exact MP3 queue');
assert(audioCore.includes('onPartStart: function (part)') && !audioCore.includes('queue.forEach(part => App.store.markHeard'), 'Sequential progress must be recorded only when each MP3 actually starts');
assert(audioCore.includes('verifiedFallback') && audioCore.includes("status: 'device'"), 'Verified Hanzi fallback must be represented as a distinct source');
assert(audioCore.includes("status: 'verify'"), 'Unverified syllables must keep a visible verification state');
assert(audioCore.includes('strictSegments') && audioCore.includes('thiếu MP3'), 'Shadowing must require every exact MP3 segment');
assert(review.includes('syllableCanQuiz') && review.includes('exactSource'), 'Quiz eligibility must be exact-MP3 only');
assert(!dataCore.includes('hanzi_1000.json'), 'The 1,000 Hanzi placeholder must not be fetched by Pinyin');
assert(css.includes('.pinyin-matrix-scroll') && css.includes('overflow: auto'), 'Only the matrix container may scroll horizontally');
assert(css.includes('position: sticky') && css.includes('.matrix-corner'), 'Matrix headers must remain distinguishable while scrolling');

const expectedMissing = ['den','tei','nou','nve','kei','chua','rua'];
assert.deepStrictEqual(audit.missingSyllableReview.map(row => row.safe), expectedMissing, 'The seven missing syllables must be audited explicitly');
assert.strictEqual(audit.exactMp3Syllables, 402);
assert.strictEqual(audit.verifiedDeviceFallbackSyllables, 4);
assert.strictEqual(audit.needsVerificationSyllables, 3);
assert.strictEqual(audit.brokenCount, 0);
for (const safe of ['den','nou','nve','chua']) {
  assert.strictEqual(fallbacks.items[safe].status, 'verified', `${safe} must have a verified Hanzi fallback`);
  assert(Object.values(fallbacks.items[safe].tones).every(row => row.hanzi && row.verified), `${safe} fallback must include verified Hanzi and exact tone`);
}
for (const safe of ['tei','kei','rua']) {
  assert.strictEqual(fallbacks.items[safe].status, 'needs_verification', `${safe} must remain unverified`);
  assert(!fallbacks.items[safe].tones, `${safe} must not invent a fallback`);
}
console.log('Pinyin Content & Chart V2 contract: PASS');

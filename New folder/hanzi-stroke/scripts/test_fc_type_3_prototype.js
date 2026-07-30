'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..', 'prototypes', 'fc-type-3-mobile');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'prototype.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'prototype.js'), 'utf8');

const checks = [
  ['loads shared engine before state machine', html.indexOf('pinyin-typing-engine.js') < html.indexOf('pinyin-typing-state-machine.js')],
  ['loads prototype after state machine', html.indexOf('pinyin-typing-state-machine.js') < html.indexOf('./prototype.js')],
  ['has mobile viewport-fit cover', /viewport-fit=cover/.test(html)],
  ['input disables autocorrect', /autocorrect="off"/.test(html)],
  ['input font prevents iPhone zoom', /\.typing-native-input[\s\S]*font-size:\s*16px/.test(css)],
  ['has safe-area padding', /env\(safe-area-inset-bottom\)/.test(css)],
  ['has wrong slot styling', /\.typing-slot\.is-wrong/.test(css)],
  ['has correct slot styling', /\.typing-slot\.is-correct/.test(css)],
  ['has 44px tap targets', /min-height:\s*44px/.test(css)],
  ['uses sequential state submit', /submitTypingToken\(runtime\.state/.test(js)],
  ['uses state machine delete', /deleteTypingToken\(runtime\.state\)/.test(js)],
  ['unlocks hint at configured threshold', /hintThreshold:\s*5/.test(js)],
  ['automatically advances after completion', /setTimeout\(\(\) => moveNextCard\(true\),\s*760\)/.test(js)],
  ['keeps prompt modes', /data-prompt-mode="hanzi"/.test(html) && /data-prompt-mode="meaning"/.test(html)],
  ['supports u colon UI handling', /lastAcceptedWasUmlautU/.test(js)],
  ['does not show public typing help chips', !/Không cần dấu thanh|Khoảng trắng được bỏ qua|ü có thể gõ u, v hoặc u:/.test(html)],
  ['does not show per-character progress text', !/Đúng \${runtime\.state\.currentIndex}\/\${runtime\.state\.slotCount} ký tự/.test(js)],
  ['keeps status visually hidden for accessibility', /typing-status sr-only/.test(html) && /\.sr-only/.test(css)],
];

let passed = 0;
for (const [name, result] of checks) {
  try {
    assert.equal(result, true);
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/${checks.length} tests passed.`);

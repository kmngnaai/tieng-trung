const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

const tests = [
  ['correct result container exists', app.includes('hsk-flashcard-typing-result')],
  ['correct result shows Hanzi', app.includes('hsk-flashcard-typing-result-word') && app.includes('escapeHtml(card.word)')],
  ['correct result shows canonical pinyin', app.includes('hsk-flashcard-typing-result-pinyin') && app.includes('escapeHtml(card.pinyin)')],
  ['correct result shows Vietnamese meaning when available', app.includes('hsk-flashcard-typing-result-meaning') && app.includes('card.meaningVi')],
  ['answer result only appears after completion', app.includes('state.isCompleting ? `')],
  ['hint button stays available before completion', app.includes('data-hsk-flashcard-typing-reveal')],
  ['completion delay allows answer review', app.includes('}, 1150);')],
  ['green success styling exists', css.includes('.hsk-flashcard-typing-result{') && css.includes('#edf9f3')],
  ['green word styling exists', css.includes('.hsk-flashcard-typing-result-word{')],
  ['green pinyin styling exists', css.includes('.hsk-flashcard-typing-result-pinyin{')],
];

let passed = 0;
for (const [name, ok] of tests) {
  if (ok) {
    passed += 1;
    console.log(`PASS: ${name}`);
  } else {
    console.error(`FAIL: ${name}`);
  }
}
console.log(`\n${passed}/${tests.length} tests passed.`);
if (passed !== tests.length) process.exit(1);

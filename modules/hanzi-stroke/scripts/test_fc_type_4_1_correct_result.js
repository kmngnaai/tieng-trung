const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

const tests = [
  ['correct result container exists', app.includes('hsk-flashcard-typing-result')],
  ['correct result shows Hanzi', app.includes('hsk-flashcard-typing-result-word') && app.includes('card.word')],
  ['correct result shows canonical pinyin', app.includes('hsk-flashcard-typing-result-pinyin') && app.includes('card.pinyin')],
  ['correct result shows Vietnamese meaning when available', app.includes('hsk-flashcard-typing-result-meaning') && app.includes('card.meaningVi')],
  ['answer result is hidden until completion', app.includes("state.isCompleting ? '' : 'hidden'")],
  ['hint button stays available before completion', app.includes('data-hsk-flashcard-typing-reveal')],
  ['completion delay allows answer review', app.includes('HSK_FLASHCARD_TYPING_COMPLETION_DELAY_MS = 2500')],
  ['tap can skip the remaining delay', app.includes('completeFlashcardTypingTransitionNow')],
  ['green success styling exists', css.includes('.hsk-flashcard-typing-result{') && css.includes('#edf9f3')],
  ['green word and pinyin styling exist', css.includes('.hsk-flashcard-typing-result-word{') && css.includes('.hsk-flashcard-typing-result-pinyin{')],
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

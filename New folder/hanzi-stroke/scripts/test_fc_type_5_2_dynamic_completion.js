const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

function extractFunction(name) {
  const start = app.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing ${name}`);
  let brace = app.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < app.length; i += 1) {
    if (app[i] === '{') depth += 1;
    else if (app[i] === '}') {
      depth -= 1;
      if (depth === 0) return app.slice(start, i + 1);
    }
  }
  throw new Error(`Unclosed ${name}`);
}

const sandbox = {
  HSK_FLASHCARD_TYPING_SHORT_COMPLETION_DELAY_MS: 30000,
  HSK_FLASHCARD_TYPING_LONG_COMPLETION_DELAY_MS: 120000,
};
vm.createContext(sandbox);
vm.runInContext(`${extractFunction('countFlashcardHanCharacters')}\n${extractFunction('getFlashcardTypingCompletionDelayMs')}`, sandbox);

const tests = [
  ['one Han character uses 30 seconds', sandbox.getFlashcardTypingCompletionDelayMs({ word: '我' }) === 30000],
  ['five Han characters use 30 seconds', sandbox.getFlashcardTypingCompletionDelayMs({ word: '中华人民共和国'.slice(0, 5) }) === 30000],
  ['six Han characters use 120 seconds', sandbox.getFlashcardTypingCompletionDelayMs({ word: '中华人民共和国'.slice(0, 6) }) === 120000],
  ['seven Han characters use 120 seconds', sandbox.getFlashcardTypingCompletionDelayMs({ word: '中华人民共和国' }) === 120000],
  ['punctuation is not counted', sandbox.countFlashcardHanCharacters('你好！') === 2],
  ['spaces are not counted', sandbox.countFlashcardHanCharacters('我 爱 你') === 3],
  ['Latin text is not counted', sandbox.countFlashcardHanCharacters('ABC学习') === 2],
  ['empty or non-Han cards use safe 30-second default', sandbox.getFlashcardTypingCompletionDelayMs({ word: 'ABC' }) === 30000],
  ['completion result has a dedicated tap target', app.includes('data-hsk-flashcard-typing-complete')],
  ['first completion tap can dismiss keyboard without advancing', app.includes('armFlashcardTypingCompletionAfterKeyboardDismiss') && app.includes('input.blur()')],
  ['first tap arms completion only after keyboard dismissal', app.includes('completionTapArmed = true') && app.includes('keyboardDismissedAfterComplete = true')],
  ['timer restarts after keyboard dismissal', app.includes('resetFlashcardTypingCompletionTimer(session, state)')],
  ['completion timer checks current card and pending state', app.includes("state?.cardId !== cardId || !state?.completionPending")],
  ['explicit continue button exists', app.includes('data-hsk-flashcard-typing-continue')],
  ['tap hint appears only after arming', app.includes('data-hsk-flashcard-typing-continue-hint') && app.includes('!state.completionTapArmed')],
  ['completion tap CSS is mobile friendly', css.includes('[data-hsk-flashcard-typing-complete]') && css.includes('touch-action:manipulation')],
  ['continue button has at least 44px tap height', css.includes('.hsk-flashcard-typing-continue{min-height:44px')],
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

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

const tests = [
  ['library session is marked', /origin:\s*'library'/.test(app)],
  ['lesson and topic sessions remain separately marked', /groupMode === 'topics' \? 'topic' : 'lesson'/.test(app)],
  ['typing mode remains available in the shared engine', /\['typing', 'Gõ Pinyin'/.test(app)],
  ['typing mode is persisted', /'typing'.*?'mixed'/.test(app) && /typingPromptType/.test(app)],
  ['eligible cards require pinyin', /getTypingEligibleCards/.test(app) && /card\?\.pinyin/.test(app)],
  ['meaning prompt requires Vietnamese meaning', /promptType === 'meaning-to-pinyin'/.test(app)],
  ['typing study renderer exists', /function renderFlashcardTypingStudy/.test(app)],
  ['sequential current index exists', /currentIndex:\s*0/.test(app)],
  ['wrong token is retained and shown', /currentWrongToken/.test(app) && /is-wrong/.test(app)],
  ['five mistakes reveal one-position hint', />=\s*5/.test(app) && /hintShownByIndex\[state\.currentIndex\]/.test(app)],
  ['answer reveal is tracked', /answerRevealUsed/.test(app) && /data-hsk-flashcard-typing-reveal/.test(app)],
  ['completion auto rates easy review hard', /state\.answerRevealUsed \? 'hard'/.test(app) && /state\.totalMistakes > 0 \? 'review' : 'easy'/.test(app)],
  ['completion auto advances after delay', /setTimeout\(\(\) => \{[\s\S]*?moveFlashcard\(1\)/.test(app)],
  ['typing state is serialized', /typing:\s*session\.typing/.test(app)],
  ['typing state is restored', /typing:\s*saved\.typing/.test(app)],
  ['mobile input disables autocorrect', /autocapitalize="none"/.test(app) && /autocorrect="off"/.test(app)],
  ['statistics show time accuracy mistakes', /Thời gian/.test(app) && /Chính xác/.test(app) && /Lỗi/.test(app)],
  ['no CPM in typing integration', !/CPM/.test(app)],
  ['typing input receives focus after render', /typingInput\.focus/.test(app)],
  ['typing CSS has 16px input font', /hsk-flashcard-typing-input[\s\S]*?font-size:16px/.test(css)],
  ['mobile prompt options collapse to one column', /max-width:430px[\s\S]*?typing-prompt-grid\{grid-template-columns:1fr/.test(css)]
];

let passed = 0;
for (const [name, ok] of tests) {
  if (ok) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    console.error(`FAIL ${name}`);
  }
}
console.log(`${passed}/${tests.length} tests passed.`);
if (passed !== tests.length) process.exit(1);

const fs = require('fs');
const assert = require('assert');

const read = (file) => fs.readFileSync(file, 'utf8');
const flashApp = read('modules/hanzi-stroke/app.js');
const flashCss = read('modules/hanzi-stroke/style.css');
const flashHtml = read('modules/hanzi-stroke/index.html');
const listeningApp = read('modules/listening/app.js');
const listeningCss = read('modules/listening/style.css');
const listeningHtml = read('modules/listening/index.html');
const matching = read('modules/shared/matching-engine.js');

assert(flashApp.includes('function setFlashcardHostMode'), 'Flashcard must have one host-mode switch');
assert(flashApp.includes("session.phase === 'study' || session.phase === 'complete'"), 'Study and complete phases must use activity host');
assert(flashCss.includes('.hsk-flashcard-overlay--activity'), 'Missing full-screen Flashcard activity CSS');
assert(flashCss.includes('height: 100dvh'), 'Flashcard activity must use dynamic viewport height');
assert(flashCss.includes('.hsk-flashcard-overlay--dialog'), 'Flashcard setup/dialog host must remain separate');
assert(flashHtml.includes('viewport-fit=cover'), 'Flashcard page must opt into iPhone safe areas');

assert(flashApp.includes('hsk-flashcard-study hsk-flashcard-study--cards'), 'Regular Flashcard study must use the flexible card layout');
assert(flashApp.includes('hsk-flashcard-card-area'), 'Flashcard card needs a dedicated flexible area');
assert(flashApp.includes('hsk-flashcard-study-footer'), 'Flashcard controls must live in the activity footer');
assert(flashCss.includes('grid-template-rows: auto minmax(0, 1fr) auto'), 'Flashcard study must reserve remaining height for the card');
assert(flashCss.includes('margin-block: auto'), 'Short Flashcard faces must center without a fixed card height');
assert(flashCss.includes('overflow-y: auto'), 'Long Flashcard answers must scroll inside the card');
assert(!flashCss.includes('min-height: 330px'), 'Mobile Flashcard card must not keep the old fixed minimum height');

assert(!listeningCss.includes('.listen-main--matching{padding:12px 10px 88px}'), 'Matching must not overwrite header top padding with shorthand');
assert(listeningCss.includes('.listen-main--matching{\n  padding-inline:14px;'), 'Listening matching must only override inline/bottom spacing');
assert(listeningApp.includes('data-action="toggle-word-choice-pinyin"'), 'Word choice must expose a direct pinyin toggle');
assert(listeningCss.includes('min-height: 72px'), 'Four-choice cards must use compact mobile height');

assert(matching.includes('data-match-limit-mode="${limitMode}"'), 'Matching must expose active limit mode');
assert(matching.includes('Tối đa ${activeLimit} · lượt này ${session.roundIds.length}'), 'Manual matching limit must be visible');
assert(matching.includes('absoluteMaxPairs: 30'), 'Manual matching limit must support values above eight');

const listeningRelease = '20260804-ai-flashcard-new3-v1';
const flashRelease = '20260804-practice-ui-v7';
const listeningVersions = Array.from(listeningHtml.matchAll(/\?v=([^"']+)/g), match => match[1]);
assert(listeningVersions.length >= 8, 'Listening page is missing versioned assets');
assert.strictEqual(new Set(listeningVersions).size, 1, 'Listening assets must share one cache version');
assert.strictEqual(listeningVersions[0], listeningRelease, 'Listening cache token is stale');

const flashReleaseMatches = Array.from(flashHtml.matchAll(/(?:style\.css|app\.js|matching-engine\.(?:js|css))[^"']*release=([^&"']+)/g), match => match[1]);
assert(flashReleaseMatches.length >= 4, 'Flashcard release token missing from affected assets');
assert(flashReleaseMatches.every(value => value === flashRelease), 'Flashcard affected assets must share the same release token');

console.log('PASS: mobile practice shell, matching controls, compact word choice and cache contract');

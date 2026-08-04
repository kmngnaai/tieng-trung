'use strict';
const assert = require('assert');
const fs = require('fs');

const course = fs.readFileSync('modules/new-hsk-course/app.js', 'utf8');
const courseCss = fs.readFileSync('modules/new-hsk-course/style.css', 'utf8');
const flash = fs.readFileSync('modules/hanzi-stroke/app.js', 'utf8');
const flashCss = fs.readFileSync('modules/hanzi-stroke/style.css', 'utf8');

// New 3.0 sentence ordering: compact batches, auto check/next and persisted settings.
assert.match(course, /practiceOrderingAutoNext/);
assert.match(course, /practiceOrderingAutoNextDelay/);
assert.match(course, /practiceOrderingDisplayCount/);
assert.match(course, /scheduleOrderingAutoNext/);
assert.match(course, /data-nhsk-order-item-id/);
assert.match(course, /ordering-display-count/);
assert.match(course, /ordering-auto-next-delay/);

// Listen then type must use a resilient Chinese TTS path and pass the clicked button.
assert.match(course, /function preferredChineseVoice/);
assert.match(course, /function speak\(text, button/);
assert.match(course, /speak\(speakButton\.dataset\.nhskSpeak \|\| '', speakButton\)/);

// Radical sorting keeps a selected radical active so multiple characters can be placed.
assert.match(course, /selectionLead/);
assert.match(course, /keepSelectedGroup/);
assert.match(courseCss, /nhsk-radical-item\{width:34px;height:38px/);
assert.match(courseCss, /nhsk-radical-group\{position:relative;min-height:66px/);

// Shared Flashcard source gets the same compact/persistent interactions.
assert.match(flash, /sentenceOrderingAutoAdvanceEnabled/);
assert.match(flash, /sentenceOrderingAutoAdvanceSeconds/);
assert.match(flash, /sentenceOrderingDisplayCount/);
assert.match(flash, /scheduleFlashcardOrderingAdvance/);
assert.match(flash, /data-hsk-order-item-id/);
assert.match(flash, /selectionLead/);
assert.match(flashCss, /hsk-flashcard-study--radical-sort\.is-compact \.hsk-flashcard-radical-bank button\{min-width:32px;min-height:35px/);
assert.match(flashCss, /hsk-flashcard-study--radical-sort\.is-compact \.hsk-flashcard-radical-groups button\{min-height:68px/);

console.log('PASS New 3.0 practice UX v5 contracts');

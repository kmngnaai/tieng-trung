const fs = require('fs');
const assert = require('assert');

const app = fs.readFileSync('modules/hanzi-stroke/app.js', 'utf8');
const css = fs.readFileSync('modules/hanzi-stroke/style.css', 'utf8');

assert(app.includes('radicalSortDisplayMode'), 'Radical sort needs a persisted compact display mode.');
assert(app.includes('data-hsk-radical-display-mode'), 'Radical sort needs 汉 / 汉+拼 / 汉+义 controls.');
assert(app.includes('hsk-flashcard-radical-selected-help'), 'Selected character needs a full Hanzi / pinyin / meaning helper.');
assert(app.includes('item.pinyin') && app.includes('item.meaningVi'), 'Radical items need pinyin and Vietnamese meaning metadata.');
assert(css.includes('.hsk-flashcard-radical-display'), 'Compact radical display control styles are missing.');
assert(css.includes('.hsk-flashcard-radical-selected-help'), 'Selected character helper styles are missing.');
assert(css.includes('.hsk-flashcard-study--radical-sort.is-compact.is-complete'), 'Completion state needs explicit mobile centering.');
assert(css.includes('border-color:#e8c9ad') || css.includes('border:1px solid #e8c9ad'), 'Radical activity outer shell needs a light orange border.');
assert(css.includes('.hsk-flashcard-study--ordering.is-compact') && css.includes('align-content:start'), 'Sentence ordering must stay top-aligned on mobile.');

console.log('PASS Flashcard mobile UI v7 contracts');

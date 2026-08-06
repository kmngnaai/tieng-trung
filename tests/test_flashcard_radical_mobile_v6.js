const fs = require('fs');
const assert = require('assert');

const app = fs.readFileSync('modules/hanzi-stroke/app.js', 'utf8');
const css = fs.readFileSync('modules/hanzi-stroke/style.css', 'utf8');

assert(app.includes("hsk-flashcard-study--radical-sort is-compact ${complete ? 'is-complete' : ''}"), 'Radical sort study needs an explicit completion class.');
assert(app.includes('hsk-flashcard-radical-group-head'), 'Radical cards need the compact New 3.0-style header.');
assert(app.includes("hsk-flashcard-radical-bank display-${displayMode} ${complete ? 'is-complete' : ''}"), 'Completed radical bank needs a compact state and display class.');
assert(app.includes('Promise.all(Array.from(candidates.values())'), 'Radical character data should load in parallel.');
assert(app.includes("session.phase = preparingRadicalSort ? 'preparing' : 'study'"), 'Radical sort should show a preparing state immediately.');
assert(app.includes('prepareFlashcardRadicalSortState(session.cards)'), 'Selecting radical sort should warm its data cache.');
assert(app.includes('patchFlashcardRadicalSelection(session)'), 'Simple selections should not rebuild the whole overlay.');

assert(css.includes('grid-auto-rows:max-content'), 'Radical sort grid rows must not stretch to fill mobile height.');
assert(css.includes('align-content:start'), 'Radical sort content must stay pinned to the top on mobile.');
assert(css.includes('.hsk-flashcard-radical-group-head'), 'Compact radical card header styles are missing.');
assert(css.includes('[data-hsk-radical-complete]'), 'Compact completion button styles are missing.');
assert(css.includes('width:32px') && css.includes('height:36px'), 'Mobile radical character chips should stay compact.');
assert(css.includes('margin-top:auto'), 'The character bank should sit in the lower thumb-friendly area.');
assert(css.includes('-webkit-line-clamp:2'), 'Long meanings should be visible on two lines.');
assert(css.includes('.hsk-flashcard-preparing-spinner'), 'Preparing state needs visible feedback.');

console.log('PASS Flashcard radical sort loading, performance and mobile interaction contracts');

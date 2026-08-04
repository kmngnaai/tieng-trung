'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'modules', 'listening', 'app.js'), 'utf8');

assert.match(app, /function practiceInputFocusSnapshot\(\)/, 'missing focus snapshot helper');
assert.match(app, /function restorePracticeInputFocus\(/, 'missing focus restore helper');
assert.match(app, /const practiceFocus = practiceInputFocusSnapshot\(\);[\s\S]*restorePracticeInputFocus\(practiceFocus\);/, 'render must restore the dictation input after rebuilding audio UI');
assert.match(app, /function preservePracticeAudioPointerFocus\(event\)/, 'missing audio pointer focus guard');
assert.match(app, /element\.onpointerdown = preservePracticeAudioPointerFocus/, 'play controls must keep input focus on pointerdown');
assert.match(app, /element\.onmousedown = preservePracticeAudioPointerFocus/, 'play controls must keep input focus on mousedown');

console.log('listening keyboard/audio focus contract passed');

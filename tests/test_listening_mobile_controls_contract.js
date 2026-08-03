'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'modules', 'listening', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'modules', 'listening', 'style.css'), 'utf8');
const builders = require(path.join(root, 'modules', 'listening', 'activity-builders.js'));

assert.match(app, /floatingAudioMode:\s*'auto'/, 'floating rail defaults to auto');
assert.match(app, /\['auto', 'Tự động'\], \['always', 'Luôn hiện'\], \['off', 'Tắt'\]/, 'settings expose three rail modes');
assert.match(app, /data-action="set-floating-audio-mode"/, 'rail mode has a settings action');
assert.match(app, /state\.keyboardVisible\) state\.floatingAudioCollapsed = true/, 'keyboard forces compact floating audio');
assert.match(app, /floatingMode === 'always'/, 'always mode is handled');
assert.match(app, /floatingMode === 'off'/, 'off mode is handled');
const floatingModeHandler = app.match(/function setFloatingAudioMode\(mode\) \{([\s\S]*?)\n  \}\n\n  function setAutomationSetting/);
assert(floatingModeHandler, 'floating rail mode handler exists');
assert(!floatingModeHandler[1].includes('render();'), 'changing floating rail mode must not rebuild the settings sheet');
assert(floatingModeHandler[1].includes('syncFloatingAudioModeControls();'), 'changing floating rail mode updates the selected button in place');

assert.match(app, /audio-mobile-meta/, 'mobile audio metadata row exists');
assert.match(app, /data-action="toggle-speed-menu"/, 'current speed opens the speed choices');
assert.match(app, /audio-speed-popover/, 'speed choices render on demand');
assert.match(css, /\[data-action="restart-speech"\][^{]*\{[^}]*display:\s*none/s, 'mobile hides restart control');

assert.match(app, /ordering-toolbar/, 'ordering uses a shared compact toolbar');
assert.match(app, /data-action="toggle-ordering-pinyin"/, 'ordering toolbar has pinyin');
assert.match(app, /data-action="toggle-ordering-speak"/, 'ordering toolbar has tap-to-speak');
assert.match(app, /data-action="open-settings"[^>]*>⚙/, 'ordering toolbar has settings');

assert.match(app, /sourceAction:/, 'activity return context records its source control');
assert.match(app, /sourceViewportTop:/, 'activity return context records source viewport offset');
assert.match(app, /restoreActivitySourcePosition/, 'activity return restores the source card position');
assert.match(app, /startPractice\(element\.dataset\.mode, 0, \{ sourceElement: element \}\)/, 'legacy mode cards preserve their source position');
assert.match(app, /startPractice\('transcript', Number\(element\.dataset\.index\) \|\| 0, \{ sourceElement: element \}\)/, 'preview items preserve their source position');

assert.match(css, /data-choice-count="5"[^}]*last-child[^}]*grid-column:\s*1\s*\/\s*-1/s, 'fifth choice spans full width');
assert.match(css, /data-pinyin-visible="false"[^}]*min-height/s, 'choice cards shrink when pinyin is hidden');

const dataset = {
  sentences: [{
    id: 's1',
    text: '我不客气',
    pinyin: 'wǒ bù kè qi',
    tokens: [{ text: '我' }, { text: '不' }, { text: '客气' }],
  }],
};
const [ordering] = builders.buildSentenceOrderingItems(dataset);
assert.deepStrictEqual(ordering.tokens.map(token => token.pinyin), ['wǒ', 'bù', 'kè qi']);

console.log('listening mobile controls contract: compact audio, rail modes, toolbar, and source restore passed');

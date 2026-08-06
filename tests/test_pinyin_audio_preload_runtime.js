'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'modules', 'pinyin', 'core', 'audio.js'), 'utf8');
const instances = [];

class FakeAudio {
  constructor() {
    this.attributes = {};
    this.currentTime = 0;
    this.ended = false;
    this.error = null;
    this.removeCount = 0;
    this.loadCount = 0;
    this.playCount = 0;
    instances.push(this);
  }
  set src(value) { this.attributes.src = String(value); }
  get src() { return this.attributes.src || ''; }
  getAttribute(name) { return this.attributes[name] || null; }
  removeAttribute(name) { delete this.attributes[name]; this.removeCount += 1; }
  load() { this.loadCount += 1; }
  pause() {}
  play() { this.playCount += 1; return Promise.resolve(); }
  addEventListener() {}
}

const button = {
  classList: { add() {}, remove() {} },
  setAttribute() {}
};
const root = {
  PinyinApp: {
    data: {
      syllable(safe) {
        return safe === 'ni' ? { safe: 'ni', pinyin: 'ni', audio: { '3': 'audio/ni3.mp3' } } : null;
      },
      fallback() { return null; }
    },
    ui: { toast() {} },
    store: { markHeard() {} },
    model: { syllables: [], audioAudit: {} }
  },
  setTimeout,
  speechSynthesis: null
};
const context = {
  window: root,
  Audio: FakeAudio,
  document: { hidden: false, addEventListener() {} },
  setTimeout,
  console
};
vm.createContext(context);
vm.runInContext(source, context, { filename: 'pinyin/core/audio.js' });

(async () => {
  const audio = root.PinyinApp.audio;
  const warmed = audio.prepareSyllable('ni', 3);
  assert(warmed, 'prepareSyllable must create a warm audio source');
  assert.strictEqual(warmed.src, 'audio/ni3.mp3');
  assert(warmed.loadCount >= 1, 'warm audio source must begin loading');

  const player = instances[0];
  assert(await audio.playSyllable('ni', 3, button), 'first playback must succeed');
  const removeAfterFirstPlay = player.removeCount;
  assert(await audio.playSyllable('ni', 3, button), 'repeated playback must succeed');
  assert.strictEqual(player.removeCount, removeAfterFirstPlay, 'repeated playback must preserve the current source and buffer');
  assert.strictEqual(player.playCount, 2);

  console.log('Pinyin audio preload runtime: warm source and same-source reuse PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

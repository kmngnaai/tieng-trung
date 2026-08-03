'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'modules', 'lookup', 'app.js'), 'utf8');

function extractFunction(name) {
  const needles = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const needle of needles) {
    start = source.indexOf(needle);
    if (start >= 0) break;
  }
  assert.ok(start >= 0, `Function ${name} not found`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = brace; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Cannot extract ${name}`);
}

const emitted = [];
const state = {
  current: { char: '好' },
  navigationStack: [],
  pendingRestore: null,
};
const el = {
  breadcrumb: { innerHTML: '' },
  breadcrumbTail: { innerHTML: '' },
  view: {
    querySelectorAll(query) {
      assert.strictEqual(query, '[data-search-char]');
      return context.allSources || [];
    },
  },
};
const windowMock = {
  location: { href: 'http://example.test/modules/lookup/index.html?q=%E5%A5%BD' },
  scrollY: 144,
  innerHeight: 700,
  dispatchEvent(event) { emitted.push(event); },
};
const documentMock = {
  documentElement: { scrollTop: 0 },
};
const context = {
  assert,
  URL,
  state,
  el,
  window: windowMock,
  document: documentMock,
  CustomEvent: class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  },
  clean: value => String(value || '').replace(/\s+/g, ' ').trim(),
  targetOf: data => String(data?.char || data?.word || data?.target || '').trim(),
  escapeHtml: value => String(value || ''),
  pushTraHistory: view => { context.lastHistoryView = view; },
  runSearch: async target => { state.current = { char: target }; },
  allSources: [],
  console,
};

vm.createContext(context);
for (const name of [
  'lookupTargetLengthClass',
  'navigationSourceDescriptor',
  'pushNavigationContext',
  'openTargetWithContext',
  'renderLookupBreadcrumb',
  'openLookupBreadcrumbTarget',
]) {
  vm.runInContext(`${extractFunction(name)}\nthis.${name} = ${name};`, context);
}

(async () => {
  assert.strictEqual(context.lookupTargetLengthClass('不'), 'main-char--single');
  assert.strictEqual(context.lookupTargetLengthClass('不客气'), 'main-char--short-word');
  assert.strictEqual(context.lookupTargetLengthClass('中华人民共和国'), 'main-char--long-word');

  const sibling = { dataset: { searchChar: '名' } };
  const otherSource = { dataset: { searchChar: '介绍' } };
  const sourceButton = {
    dataset: { searchChar: '姐' },
    getBoundingClientRect() { return { top: 318 }; },
    closest(selector) {
      if (selector !== 'section') return null;
      return {
        id: 'related-words-section',
        querySelectorAll(query) {
          assert.strictEqual(query, '[data-search-char]');
          return [sibling, sourceButton];
        },
      };
    },
  };
  context.allSources = [otherSource, sibling, sourceButton];

  await context.openTargetWithContext('姐', sourceButton);
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(state.navigationStack.map(item => item.target))),
    ['好'],
  );
  assert.strictEqual(state.navigationStack[0].sourceTarget, '姐');
  assert.strictEqual(state.navigationStack[0].sourceIndex, 1);
  assert.strictEqual(state.navigationStack[0].sourceGlobalIndex, 2);
  assert.strictEqual(state.navigationStack[0].sourceTargetIndex, 0);
  assert.strictEqual(state.navigationStack[0].sourceViewportTop, 318);
  assert.strictEqual(state.current.char, '姐');
  assert.strictEqual(context.lastHistoryView, 'detail');

  state.navigationStack.push({
    target: '姐',
    scrollY: 688,
    sectionId: 'sentence-section',
    sourceTarget: '介绍',
    sourceIndex: 0,
    sourceViewportTop: 240,
  });
  state.current = { char: '介绍' };
  await context.openLookupBreadcrumbTarget(1);
  assert.strictEqual(state.current.char, '姐');
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(state.navigationStack.map(item => item.target))),
    ['好'],
  );
  assert.strictEqual(state.pendingRestore.target, '姐');
  assert.strictEqual(state.pendingRestore.scrollY, 688);

  context.renderLookupBreadcrumb();
  const latest = emitted.at(-1);
  assert.ok(latest, 'breadcrumb event was not emitted');
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(latest.detail.items.map(item => item.label))),
    ['Tra', '好', '姐'],
  );
  assert.strictEqual(latest.detail.items[1].href, '#lookup-breadcrumb-0');
  assert.match(el.breadcrumbTail.innerHTML, /好/);
  assert.match(el.breadcrumbTail.innerHTML, /姐/);
  console.log('lookup navigation context runtime: size classes and exact parent restore passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

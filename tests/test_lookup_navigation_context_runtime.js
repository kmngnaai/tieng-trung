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
};
const el = {
  breadcrumb: { innerHTML: '' },
  breadcrumbTail: { innerHTML: '' },
};
const windowMock = {
  location: { href: 'http://example.test/modules/lookup/index.html?q=%E5%A5%BD' },
  scrollY: 144,
  dispatchEvent(event) { emitted.push(event); },
};
const documentMock = { documentElement: { scrollTop: 0 } };
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
  currentSectionId: () => 'radical-section',
  pushTraHistory: view => { context.lastHistoryView = view; },
  runSearch: async target => { state.current = { char: target }; },
  console,
};

vm.createContext(context);
for (const name of ['pushNavigationContext', 'openTargetWithContext', 'renderLookupBreadcrumb']) {
  vm.runInContext(`${extractFunction(name)}\nthis.${name} = ${name};`, context);
}

(async () => {
  await context.openTargetWithContext('姐', { closest() { return null; } });
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(state.navigationStack.map(item => item.target))),
    ['好'],
  );
  assert.strictEqual(state.current.char, '姐');
  assert.strictEqual(context.lastHistoryView, 'detail');

  context.renderLookupBreadcrumb();
  const latest = emitted.at(-1);
  assert.ok(latest, 'breadcrumb event was not emitted');
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(latest.detail.items.map(item => item.label))),
    ['Tra', '好', '姐'],
  );
  assert.match(el.breadcrumbTail.innerHTML, /好/);
  assert.match(el.breadcrumbTail.innerHTML, /姐/);
  console.log('lookup navigation context runtime: 好 → 姐 passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

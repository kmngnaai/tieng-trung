'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const shellSource = fs.readFileSync(path.join(__dirname, '..', 'modules', 'shared', 'app-shell.js'), 'utf8');

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach(name => this.values.add(name)); }
  remove(...names) { names.forEach(name => this.values.delete(name)); }
  toggle(name, force) {
    if (force === true) this.values.add(name);
    else if (force === false) this.values.delete(name);
    else if (this.values.has(name)) this.values.delete(name);
    else this.values.add(name);
  }
}

class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.dataset = {};
    this.className = '';
    this.classList = new FakeClassList();
    this.children = [];
    this.hidden = false;
    this.innerHTML = '';
    this.attributes = new Map();
    this.scrollLeft = 0;
    this.scrollWidth = 640;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  hasAttribute(name) { return this.attributes.has(name); }
  append(...nodes) { this.children.push(...nodes); }
  prepend(...nodes) { this.children.unshift(...nodes); }
  addEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  matches() { return false; }
  closest() { return null; }
  focus() {}
}

function runScenario(relativeUrl, bodyContext = '') {
  const absolute = new URL(relativeUrl, 'http://example.test/');
  const main = new FakeElement('main');
  main.dataset.uiShellMain = '';
  const breadcrumb = new FakeElement('nav');
  const body = new FakeElement('body');
  body.dataset.uiShellContext = bodyContext;
  const documentElement = new FakeElement('html');
  documentElement.style = { setProperty() {} };
  const events = new Map();
  let shellNode = null;

  const document = {
    currentScript: { src: 'http://example.test/modules/shared/app-shell.js' },
    readyState: 'complete',
    body,
    documentElement,
    activeElement: null,
    createElement(tag) { return new FakeElement(tag); },
    addEventListener(type, handler) { events.set(`document:${type}`, handler); },
    querySelector(selector) {
      if (selector === '[data-ui-app-shell]') return shellNode;
      if (selector === '[data-ui-shell-main]' || selector === 'main') return main;
      if (selector === '[data-ui-header-breadcrumb]') return breadcrumb;
      return null;
    },
    querySelectorAll() { return []; },
    getElementById() { return null; },
  };
  body.prepend = node => { shellNode = node; body.children.unshift(node); };

  const localStore = new Map([['hanziStroke.lastCurriculum.v1', 'dialogue301']]);
  const window = {
    location: {
      href: absolute.href,
      pathname: absolute.pathname,
      search: absolute.search,
      hash: absolute.hash,
    },
    localStorage: {
      getItem(key) { return localStore.has(key) ? localStore.get(key) : null; },
      setItem(key, value) { localStore.set(key, String(value)); },
    },
    matchMedia() { return { matches: false }; },
    addEventListener(type, handler) { events.set(`window:${type}`, handler); },
    requestAnimationFrame(handler) { handler(); },
    setInterval() { return 1; },
    clearInterval() {},
  };

  const context = {
    window,
    document,
    URL,
    URLSearchParams,
    CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    console,
  };
  window.window = window;
  window.document = document;
  vm.createContext(context);
  vm.runInContext(shellSource, context);
  return { window, body, breadcrumb, shellNode };
}

{
  const result = runScenario('/index.html?lesson=lesson-001#dialogue301', 'learn');
  assert.match(result.breadcrumb.innerHTML, /Học/);
  assert.match(result.breadcrumb.innerHTML, /Giáo trình/);
  assert.match(result.breadcrumb.innerHTML, /301/);
  assert.match(result.breadcrumb.innerHTML, /Bài 1/);
  assert.doesNotMatch(result.breadcrumb.innerHTML, /Trang chủ/);
  assert.strictEqual(result.breadcrumb.scrollLeft, result.breadcrumb.scrollWidth);
}

{
  const result = runScenario('/modules/hanzi-stroke/index.html?study=hsk&curriculum=hsk&level=2', 'learn');
  assert.match(result.breadcrumb.innerHTML, /Học/);
  assert.match(result.breadcrumb.innerHTML, /Giáo trình/);
  assert.match(result.breadcrumb.innerHTML, /HSK 6 cấp/);
  assert.match(result.breadcrumb.innerHTML, /HSK 2/);
  assert.doesNotMatch(result.breadcrumb.innerHTML, /Từ vựng|Câu mẫu|Hội thoại|Chú thích/);
}

{
  const result = runScenario('/modules/lookup/index.html?q=%E4%BD%A0%E5%A5%BD', 'lookup');
  assert.match(result.breadcrumb.innerHTML, /Tra/);
  assert.match(result.breadcrumb.innerHTML, /你好/);
}

{
  const result = runScenario('/modules/hanzi-stroke/index.html?study=flashcards', 'learn');
  assert.match(result.breadcrumb.innerHTML, /Học/);
  assert.match(result.breadcrumb.innerHTML, /Thẻ/);
  assert.match(result.shellNode.children[0].innerHTML, />中</);
}

{
  const result = runScenario('/modules/hanzi-stroke/index.html?study=hsk&curriculum=hsk&level=1', 'learn');
  result.window.TiengTrungAppShell.setBreadcrumb([
    { label: 'Học', href: '/modules/hanzi-stroke/index.html?study=hub' },
    { label: 'Giáo trình', href: '/modules/hanzi-stroke/index.html?study=hsk' },
    { label: 'HSK 6 cấp', href: '/modules/hanzi-stroke/index.html?study=hsk&curriculum=hsk' },
    { label: 'HSK 1', href: '/modules/hanzi-stroke/index.html?study=hsk&curriculum=hsk&level=1' },
    { label: 'Bài 3', current: true },
  ]);
  assert.match(result.breadcrumb.innerHTML, /HSK 6 cấp/);
  assert.match(result.breadcrumb.innerHTML, /HSK 1/);
  assert.match(result.breadcrumb.innerHTML, /Bài 3/);
  assert.strictEqual(result.breadcrumb.scrollLeft, result.breadcrumb.scrollWidth);
}

console.log('header breadcrumb runtime tests: 5/5 passed');

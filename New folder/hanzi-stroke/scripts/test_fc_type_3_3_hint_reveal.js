'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..', 'prototypes', 'fc-type-3-mobile');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'prototype.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'prototype.js'), 'utf8');

const showAnswerBody = (js.match(/function showAnswerReveal\(\) \{([\s\S]*?)\n  \}/) || [null, ''])[1];
const resetBody = (js.match(/function resetCurrentCard\(\) \{([\s\S]*?)\n  \}/) || [null, ''])[1];

const checks = [
  ['has knowledge bulb button', /id="knowledgeButton"/.test(html) && /💡/.test(html)],
  ['knowledge button controls answer panel', /aria-controls="answerReveal"/.test(html)],
  ['answer panel hidden by default', /id="answerReveal" hidden/.test(html)],
  ['answer panel has accessible close button', /id="closeAnswerButton"[\s\S]*aria-label="Ẩn đáp án"/.test(html)],
  ['reveals exact card pinyin from data', /revealedPinyin\.textContent = card\.pinyin/.test(js)],
  ['reveals word and Vietnamese meaning as context', /revealedContext\.textContent = `\$\{card\.word\} · \$\{card\.meaningVi\}`/.test(js)],
  ['marks reveal assistance in runtime state', /answerRevealUsed:\s*false/.test(js) && /runtime\.answerRevealUsed = true/.test(js)],
  ['counts answer reveal actions', /answerRevealCount:\s*0/.test(js) && /runtime\.answerRevealCount \+= 1/.test(js)],
  ['records reveal timestamp', /answerRevealedAt:\s*0/.test(js) && /runtime\.answerRevealedAt = Date\.now\(\)/.test(js)],
  ['does not auto-fill or complete when revealing answer', !/submitTypingToken|submitToken|moveNextCard|showComplete/.test(showAnswerBody)],
  ['keeps input focus after reveal', /showAnswerReveal[\s\S]*setTimeout\(focusInput/.test(js)],
  ['can hide answer without changing typing state', /function hideAnswerReveal/.test(js) && /answerReveal\.hidden = true/.test(js)],
  ['resets reveal state for every card', /answerRevealUsed = false/.test(resetBody) && /answerRevealCount = 0/.test(resetBody)],
  ['completion result notes answer assistance', /Đã xem đáp án/.test(js)],
  ['knowledge button has mobile tap target', /\.knowledge-button[\s\S]*min-height:\s*44px/.test(css)],
  ['hidden answer panel cannot occupy layout', /\.answer-reveal\[hidden\]\s*\{\s*display:\s*none !important/.test(css)],
  ['answer panel stays compact on mobile', /@media \(max-width: 360px\)[\s\S]*\.knowledge-button/.test(css)],
  ['knowledge button uses expanded state', /aria-expanded="false"/.test(html) && /setAttribute\('aria-expanded', 'true'\)/.test(js)],
];

let passed = 0;
for (const [name, result] of checks) {
  try {
    assert.equal(result, true);
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/${checks.length} tests passed.`);

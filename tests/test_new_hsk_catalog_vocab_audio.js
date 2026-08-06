const fs = require('fs');
const assert = require('assert');
const app = fs.readFileSync('modules/new-hsk-course/app.js', 'utf8');
const css = fs.readFileSync('modules/new-hsk-course/style.css', 'utf8');

assert(app.includes('data-nhsk-catalog-word'), 'Topic vocabulary cards must be interactive.');
assert(app.includes('openCatalogWordDetail'), 'Topic vocabulary detail must open inside New 3.0.');
assert(app.includes('nhsk-catalog-grammar-example-speak'), 'Grammar examples need an audio button.');
assert(css.includes('-webkit-line-clamp:2'), 'Long topic meanings must allow two lines.');
assert(css.includes('--nhsk-topic-accent'), 'Topic cards need HSK-style accent treatment.');

console.log('PASS New HSK catalog vocabulary and grammar audio contracts');

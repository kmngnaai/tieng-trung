const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const Matching = require(path.join(ROOT, 'modules/shared/matching-engine.js'));

const pairs = [
  { id:'w1', leftText:'你好', pinyin:'nǐ hǎo', rightText:'xin chào' },
  { id:'w2', leftText:'认识', pinyin:'rèn shi', rightText:'quen, biết' },
  { id:'w3', leftText:'名字', pinyin:'míng zi', rightText:'tên' },
  { id:'w4', leftText:'高兴', pinyin:'gāo xìng', rightText:'vui' },
  { id:'w5', leftText:'家', pinyin:'jiā', rightText:'gia đình' },
  { id:'w6', leftText:'学生', pinyin:'xué sheng', rightText:'học sinh' }
];

const session = Matching.createSession(pairs, { title:'Nối từ', roundSize:5, tapToSpeak:true });
assert.strictEqual(session.pairs.length, 6);
assert.strictEqual(session.roundIds.length, 5, 'Mobile word round must cap at five pairs');
assert.strictEqual(new Set(session.leftOrder).size, session.leftOrder.length);
assert.strictEqual(new Set(session.rightOrder).size, session.rightOrder.length);

const firstId = session.roundIds[0];
const secondId = session.roundIds[1];
const firstPair = session.pairs.find(pair => pair.id === firstId);
let result = Matching.select(session, 'left', firstId);
assert.strictEqual(result.status, 'selected');
assert.strictEqual(result.speechText, firstPair.leftText);
result = Matching.select(session, 'right', secondId);
assert.strictEqual(result.status, 'wrong');
assert.strictEqual(session.mistakesById[firstId], 1);
assert.strictEqual(session.mistakesById[secondId] || 0, 0);
assert.strictEqual(Matching.ratingFor(session, firstId), 'review');
let wrongHtml = Matching.render(session);
assert.strictEqual((wrongHtml.match(/tt-match-card[^>]*is-wrong/g) || []).length, 2, 'Only the two clicked cards may turn red');
assert(new RegExp(`tt-match-card--left[^"]*is-wrong[^>]*data-match-id="${firstId}"`).test(wrongHtml));
assert(new RegExp(`tt-match-card--right[^"]*is-wrong[^>]*data-match-id="${secondId}"`).test(wrongHtml));
assert.strictEqual(session.hintPairId, '', 'No hint after the first wrong attempt');
Matching.clearTransientFeedback(session);
assert.strictEqual(session.feedback, null);

Matching.select(session, 'left', firstId);
Matching.select(session, 'right', secondId);
assert.strictEqual(session.mistakesById[firstId], 2);
assert.strictEqual(session.hintPairId, '', 'No hint after the second wrong attempt');
Matching.clearTransientFeedback(session);

Matching.select(session, 'left', firstId);
result = Matching.select(session, 'right', secondId);
assert.strictEqual(result.status, 'wrong');
assert.strictEqual(result.mistakeCount, 3);
assert.strictEqual(session.hintPairId, firstId, 'Reveal the correct pair only after three misses on the same Hanzi');
const hintHtml = Matching.render(session);
assert.strictEqual((hintHtml.match(/is-hint-source/g) || []).length, 1);
assert.strictEqual((hintHtml.match(/is-hint-target/g) || []).length, 1);
assert(hintHtml.includes('Cặp đúng đã được gợi ý'));
Matching.clearTransientFeedback(session);

Matching.select(session, 'left', firstId);
result = Matching.select(session, 'right', firstId);
assert.strictEqual(result.status, 'correct');
assert(session.completedIds.includes(firstId));
assert.strictEqual(session.hintPairId, '', 'Hint must disappear after the pair is completed');
assert.strictEqual(Matching.ratingFor(session, firstId), 'hard');

const html = Matching.render(session);
assert(html.includes('data-match-side="left"'));
assert(html.includes('data-match-action="toggle-pinyin"'));
assert(!html.includes('tt-match-card--left is-complete'), 'Completed pair should leave the active board to save mobile space');

const listening = fs.readFileSync(path.join(ROOT, 'modules/listening/app.js'), 'utf8');
assert(listening.includes("data-matching-type=\"word\""));
assert(listening.includes("data-matching-type=\"sentence\""));
assert(listening.includes("data-matching-type=\"dialogue\""));
assert(listening.includes("data-matching-type=\"passage\""));
assert(listening.includes("toggle-tap-hanzi-speak"));
assert(listening.includes('speakInteractionText(entry.text'));

const flashcard = fs.readFileSync(path.join(ROOT, 'modules/hanzi-stroke/app.js'), 'utf8');
assert(flashcard.includes("['matching', 'Nối thẻ'"));
assert(flashcard.includes('data-hsk-flashcard-open-matching'));
assert(flashcard.includes('renderFlashcardMatchingStudy'));
assert(flashcard.includes("Matching.setSetting('tapHanziSpeak'"));

console.log('PASS: shared matching engine, listening activities, flashcard mode and tap-to-speak contracts');

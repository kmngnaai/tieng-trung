'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(process.argv[2] || process.cwd());
const adapterPath = path.join(ROOT, 'modules/shared/grammar-practice.js');
const bridgePath = path.join(ROOT, 'modules/shared/grammar-practice-flashcard.js');
const appPath = path.join(ROOT, 'modules/hanzi-stroke/app.js');

const Adapter = require(adapterPath);
const Bridge = require(bridgePath);
const bridgeSource = fs.readFileSync(bridgePath, 'utf8');
const app = fs.readFileSync(appPath, 'utf8');

function fnBlock(source, name){
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if(start < 0) return '';
  const next = source.indexOf('\n  function ', start + marker.length);
  return source.slice(start, next < 0 ? source.length : next);
}

function sliceBetween(source, startToken, endToken){
  const start = source.indexOf(startToken);
  if(start < 0) return '';
  const end = source.indexOf(endToken, start + startToken.length);
  return source.slice(start, end > start ? end : Math.min(source.length, start + 12000));
}

function makeGrammar(){
  const grammarId = 'g5-1-contract';
  const exercises = [];
  for(let seq = 1; seq <= 10; seq += 1){
    exercises.push({
      questionId:`${grammarId}-q${String(seq).padStart(2,'0')}`,
      grammarId,
      type:'mcq',
      seq,
      prompt:`MCQ ${seq}`,
      options:[{id:'A',text:'A'},{id:'B',text:'B'}],
      answer:'A',
      explanation:`Explanation ${seq}`
    });
  }
  for(let seq = 11; seq <= 15; seq += 1){
    exercises.push({
      questionId:`${grammarId}-q${String(seq).padStart(2,'0')}`,
      grammarId,
      type:'translate_zh_vi',
      seq,
      prompt:`中文句子${seq}`,
      pinyin:`zhong wen ${seq}`,
      referenceAnswer:`Câu tiếng Việt ${seq}`
    });
  }
  for(let seq = 16; seq <= 20; seq += 1){
    exercises.push({
      questionId:`${grammarId}-q${String(seq).padStart(2,'0')}`,
      grammarId,
      type:'translate_vi_zh',
      seq,
      prompt:`Câu tiếng Việt ${seq}`,
      pinyin:`han yu ${seq}`,
      referenceAnswer:`汉语句子${seq}`
    });
  }
  return {
    grammarId,
    topic:'Trật tự từ cơ bản trong câu',
    syntax:'Chủ ngữ + Vị ngữ + Tân ngữ',
    explanation:'G5.1 contract grammar.',
    tips:'Mẹo',
    attentions:'Lưu ý',
    examples:[
      {chinese:'我们聊天中。',pinyin:'wǒ men liáo tiān zhōng',vietnamese:'Chúng tôi đang trò chuyện.'},
      {chinese:'我叫白家月。',pinyin:'wǒ jiào Bái Jiāyuè',vietnamese:'Tôi tên là Bạch Gia Nguyệt.'},
      {chinese:'我是学生。',pinyin:'wǒ shì xuéshēng',vietnamese:'Tôi là học sinh.'},
      {chinese:'他是老师。',pinyin:'tā shì lǎoshī',vietnamese:'Anh ấy là giáo viên.'}
    ],
    exerciseCount:20,
    exerciseTypeCounts:{mcq:10,translate_zh_vi:5,translate_vi_zh:5},
    exercises
  };
}

const grammar = makeGrammar();
const before = JSON.stringify(grammar);
const payload = Bridge.buildPayload(Adapter, grammar);
const grammarCards = payload.cards.filter(card => card.cardType === 'grammar');
const translationCards = payload.cards.filter(card => card.cardType === 'sentence');
const counts = translationCards.reduce((acc, card) => {
  const type = card?.grammar?.exerciseType || '';
  acc[type] = (acc[type] || 0) + 1;
  return acc;
}, {});
const sourceById = new Map(grammar.exercises.map(row => [row.questionId,row]));

assert.strictEqual(Bridge.DEFAULT_TRANSLATION_CARD_COUNT, 10, 'G5.1 count must be 10');
assert.strictEqual(payload.cards.length, 11, 'G5.1 payload must be 11 cards');
assert.strictEqual(grammarCards.length, 1, 'G5.1 payload must contain one Grammar card');
assert.strictEqual(translationCards.length, 10, 'G5.1 payload must contain ten Translation cards');
assert.strictEqual(counts.translate_zh_vi, 5, 'G5.1 payload must contain five ZH→VI cards');
assert.strictEqual(counts.translate_vi_zh, 5, 'G5.1 payload must contain five VI→ZH cards');
assert.strictEqual(new Set(translationCards.map(card => card.id)).size, 10, 'Translation questionId values must be unique');
translationCards.forEach(card => {
  const source = sourceById.get(card.id);
  assert(source, `missing source exercise for ${card.id}`);
  assert.strictEqual(card.pinyin, source.pinyin, `${card.id}: pinyin drift`);
  assert.strictEqual(card.grammar?.grammarId, grammar.grammarId, `${card.id}: grammarId drift`);
  assert.strictEqual(card.grammar?.questionId, source.questionId, `${card.id}: questionId drift`);
  assert.strictEqual(card.grammar?.exerciseType, source.type, `${card.id}: exerciseType drift`);
});
assert.strictEqual(JSON.stringify(grammar), before, 'G5.1 bridge must not mutate canonical grammar input');

const normalizer = fnBlock(app, 'normalizeFlashcardGrammarExamples');
const face = fnBlock(app, 'renderFlashcardFace');
assert(normalizer.includes('row?.chinese'), 'Grammar example normalizer must accept canonical chinese');
assert(normalizer.includes('row?.vietnamese'), 'Grammar example normalizer must accept canonical vietnamese');
assert(normalizer.includes('row?.pinyin'), 'Grammar example normalizer must preserve pinyin');
assert(face.includes('normalizeFlashcardGrammarExamples(grammar)'), 'Grammar Flashcard must use normalized examples');
assert(face.includes('examples.slice(0,3)'), 'Grammar Flashcard must render at most first 3 canonical examples');
assert(face.includes('grammar-card-title--compact'), 'Grammar Flashcard title must use compact contract');
assert(face.includes('clamp(20px,5vw,26px)'), 'Grammar Flashcard pattern must use compact contract');

const scrollResolver = fnBlock(app, 'getFlashcardScrollHost');
assert(scrollResolver.includes(".hsk-flashcard-ordering-controls"), 'scroll resolver must target ordering controls for Sentence Ordering');
assert(scrollResolver.includes(".hsk-flashcard-body"), 'scroll resolver must retain shared Flashcard fallback');

const scrollHelper = fnBlock(app, 'rerenderFlashcardOverlayPreservingScroll');
assert(scrollHelper.includes('getFlashcardScrollHost(overlay)'), 'preserve helper must use central scroll-host resolver');
assert(scrollHelper.includes('getFlashcardScrollHost(nextOverlay)'), 'preserve helper must resolve host again after rerender');
assert(scrollHelper.includes('scrollTop'), 'preserve helper must capture/restore scrollTop');
assert(scrollHelper.includes('scrollLeft'), 'preserve helper must capture/restore scrollLeft');
assert(scrollHelper.includes('renderFlashcardOverlay();'), 'preserve helper must delegate to existing renderer');
assert(scrollHelper.includes('requestAnimationFrame'), 'preserve helper must restore after DOM rerender');

const dragMove = fnBlock(app, 'moveFlashcardPointerDrag');
assert(dragMove.includes('getFlashcardScrollHost(overlay)'), 'drag auto-scroll must use central scroll-host resolver');

const orderingDrop = fnBlock(app, 'applyFlashcardOrderingDrop');
const matchingSelection = fnBlock(app, 'handleFlashcardMatchingSelection');
const radicalDrop = fnBlock(app, 'applyFlashcardRadicalDrop');
assert(orderingDrop.includes('rerenderFlashcardOverlayPreservingScroll();'), 'ordering drag/drop must preserve scroll');
assert(matchingSelection.includes('rerenderFlashcardOverlayPreservingScroll();'), 'matching same-view selection must preserve scroll');
assert(radicalDrop.includes('rerenderFlashcardOverlayPreservingScroll();'), 'radical same-round drag/drop must preserve scroll');

const vocabToggle = sliceBetween(app, "const orderVocabToggle=event.target.closest('[data-hsk-order-vocab-toggle]')", "const orderVocabSpeak=event.target.closest('[data-hsk-order-vocab-speak]')");
const pinyinToggle = sliceBetween(app, "const orderPinyinButton=event.target.closest('[data-hsk-order-pinyin]')", "const orderSpeakButton=event.target.closest('[data-hsk-order-speak]')");
const tokenClick = sliceBetween(app, "const orderTokenButton = event.target.closest('[data-hsk-order-token]')", "if(event.target.closest('[data-hsk-order-reset]')");
const resetClick = sliceBetween(app, "if(event.target.closest('[data-hsk-order-reset]')", "const orderRatingButton=event.target.closest('[data-hsk-order-rating]')");
const ratingClick = sliceBetween(app, "const orderRatingButton=event.target.closest('[data-hsk-order-rating]')", "if(event.target.closest('[data-hsk-order-next]')");
[vocabToggle,pinyinToggle,tokenClick,resetClick,ratingClick].forEach((block,index) => {
  assert(block.includes('rerenderFlashcardOverlayPreservingScroll'), `ordering same-view block ${index+1} must preserve scroll`);
});

const radicalDisplay = sliceBetween(app, "const radicalDisplayButton=event.target.closest('[data-hsk-radical-display-mode]')", "const radicalMeaningToggle=event.target.closest('[data-hsk-radical-meaning-toggle]')");
const radicalMeaning = sliceBetween(app, "const radicalMeaningToggle=event.target.closest('[data-hsk-radical-meaning-toggle]')", "const radicalItemButton=event.target.closest('[data-hsk-radical-item]')");
assert(radicalDisplay.includes('rerenderFlashcardOverlayPreservingScroll'), 'radical display toggle must preserve scroll');
assert(radicalMeaning.includes('rerenderFlashcardOverlayPreservingScroll'), 'radical meaning toggle must preserve scroll');

const strokeExpand = sliceBetween(app, "if(event.target.closest('[data-hsk-flashcard-stroke-expand]'))", "if(event.target.closest('[data-hsk-flashcard-stroke-collapse]'))");
const strokeCollapse = sliceBetween(app, "if(event.target.closest('[data-hsk-flashcard-stroke-collapse]'))", "if(event.target.closest('[data-hsk-flashcard-stroke-area]'))");
const flipClick = sliceBetween(app, "if(event.target.closest('[data-hsk-flashcard-flip]'))", "const rate = event.target.closest('[data-hsk-flashcard-rate]')");
const rateClick = sliceBetween(app, "const rate = event.target.closest('[data-hsk-flashcard-rate]')", "if(event.target.closest('[data-hsk-flashcard-prev]'))");
[strokeExpand,strokeCollapse,flipClick,rateClick].forEach((block,index) => {
  assert(block.includes('rerenderFlashcardOverlayPreservingScroll'), `normal Flashcard same-card block ${index+1} must preserve scroll`);
});

const orderingNext = sliceBetween(app, "if(event.target.closest('[data-hsk-order-next]')", "const radicalDisplayButton");
const radicalNext = sliceBetween(app, "if(event.target.closest('[data-hsk-radical-next-round]')", "if(event.target.closest('[data-hsk-radical-complete]')");
const prevNext = sliceBetween(app, "if(event.target.closest('[data-hsk-flashcard-prev]')", "if(event.target.closest('[data-hsk-flashcard-restart]')");
assert(!orderingNext.includes('rerenderFlashcardOverlayPreservingScroll'), 'ordering page transition must remain normal render');
assert(!radicalNext.includes('rerenderFlashcardOverlayPreservingScroll'), 'radical round transition must remain normal render');
assert(!prevNext.includes('rerenderFlashcardOverlayPreservingScroll'), 'Prev/Next card transitions must remain normal render');

assert(bridgeSource.includes('function launch('), 'existing bridge launch must remain');
assert(app.includes('function createFlashcardSessionFromCards(cards, title, options = {})'), 'existing Flashcard engine must be reused');
assert(!bridgeSource.includes('localStorage'), 'G5.1 bridge must not add localStorage');
assert(!bridgeSource.includes('sessionStorage'), 'G5.1 bridge must not add sessionStorage');
assert(!bridgeSource.includes('indexedDB'), 'G5.1 bridge must not add IndexedDB');

console.log('PASS_G5_1_FLASHCARD_PAYLOAD_SCROLL_CONTRACT');
console.log('payload=11 grammar=1 translation=10 zhVi=5 viZh=5 examples=3 scrollPreserve=PASS engineReuse=PASS noNewStorage=PASS');

'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const appPath = path.join(root, 'app.js');
const source = fs.readFileSync(appPath, 'utf8');

const tests = [];
function test(name, fn){ tests.push({ name, fn }); }
function includes(text){ return source.includes(text); }

// Data path used by lesson/topic Flashcard.
test('selected lesson/topic cards preserve word', () => includes("word: String(item?.word || item?.simplified || '').trim()"));
test('selected lesson/topic cards preserve pinyin', () => includes('pinyin: formatPinyin(item?.pinyin)'));
test('selected lesson/topic cards preserve Vietnamese meaning', () => includes("meaningVi: String(item?.meaningVi || '').trim()"));
test('selected cards are limited to lessons/topics', () => includes("!['lessons', 'topics'].includes(hskState.groupMode)"));

// Session context.
test('lesson/topic origin is derived from groupMode', () => includes("origin: hskState.groupMode === 'topics' ? 'topic' : 'lesson'"));
test('lesson/topic context key is deterministic', () => includes('contextKey: `${hskState.sourceKey}:${hskState.currentLevel}:${hskState.groupMode}:${hskState.topicKey}`'));
test('lesson/topic label is stored', () => includes("contextLabel: getSelectedLearningLabel() || ''"));
test('context key is serialized', () => includes("contextKey: String(session.contextKey || '')"));
test('context label is serialized', () => includes("contextLabel: String(session.contextLabel || '')"));
test('context key is restored', () => includes("contextKey: String(saved.contextKey || '')"));
test('context label is restored', () => includes("contextLabel: String(saved.contextLabel || '')"));

// Setup UI.
test('typing mode is available without library-only restriction', () => includes("['typing', 'Gõ Pinyin', 'Nhập tuần tự từng ký tự pinyin']") && !includes("session.origin === 'library' ? [['typing'"));
test('topic back label is present', () => includes("'← Quay lại chủ đề'"));
test('lesson back label is present', () => includes("'← Quay lại bài'"));
test('library back label is preserved', () => includes("'← Quay lại Thẻ'"));
test('setup count uses contextual noun', () => includes('thẻ trong ${contextNoun}'));
test('typing start count uses eligible cards', () => includes("settings.mode === 'typing' ? getTypingEligibleCards(session.cards, settings.typingPromptType).length"));

// Runtime behavior reused from FC-TYPE.4.
test('typing cards are filtered before study', () => includes('session.cards = getTypingEligibleCards(session.cards, session.settings.typingPromptType)'));
test('typing prompt type is generated per card', () => includes('session.typingPromptTypes = session.cards.map'));
test('typing state is created for first lesson/topic card', () => includes("session.typing = session.settings.mode === 'typing' ? createFlashcardTypingState(session, session.cards[0]) : null"));
test('correct answer result still shows Hanzi', () => includes('hsk-flashcard-typing-result-word'));
test('correct answer result still shows pinyin', () => includes('hsk-flashcard-typing-result-pinyin'));
test('correct answer result still shows Vietnamese meaning when available', () => includes('hsk-flashcard-typing-result-meaning'));

let passed = 0;
for(const item of tests){
  try{
    if(!item.fn()) throw new Error('condition returned false');
    console.log(`PASS ${item.name}`);
    passed += 1;
  }catch(err){
    console.error(`FAIL ${item.name}: ${err.message}`);
  }
}
console.log(`\n${passed}/${tests.length} tests passed.`);
if(passed !== tests.length) process.exit(1);

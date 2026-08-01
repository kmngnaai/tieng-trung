'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const Core = require('../modules/shared/import-core.js');

const sample = [
  'Đây là phản hồi của AI, có giải thích trước JSON.',
  JSON.stringify([{ id:'w1', hanzi:'家', pinyin:'jiā', meaning:'gia đình', word_type:'Danh từ', tags:['HSK 1'] }]),
  'Phần câu:',
  '```json',
  JSON.stringify({ format:'tieng-trung-ai-result-v1', type:'sentence', level:'HSK 1', topic:'Gia đình', extra_words:[], quality_notes:[], items:[{ id:'s1', hanzi:'我家有三口人。', pinyin:'wǒ jiā yǒu sān kǒu rén.', meaning:'Nhà tôi có ba người.', tokens:['我家','有','三口人'], source_word_ids:['w1'], grammar_ids:[] }] }),
  '```',
  JSON.stringify({ id:'d1', title:'Gia đình', kind:'dialogue', items:[{id:'d1-1',order:1,speaker:'A',hanzi:'你家有几口人？',pinyin:'nǐ jiā yǒu jǐ kǒu rén?',meaning:'Nhà bạn có mấy người?',tokens:['你家','有','几口人']},{id:'d1-2',order:2,speaker:'B',hanzi:'我家有三口人。',pinyin:'wǒ jiā yǒu sān kǒu rén.',meaning:'Nhà tôi có ba người.',tokens:['我家','有','三口人']}] })
].join('\n');

const parsed = Core.parseAiPaste(sample);
assert.deepStrictEqual(parsed.errors, []);
assert.strictEqual(parsed.blocks.length, 3);
assert.deepStrictEqual(parsed.blocks.map(block => block.type), ['vocabulary','sentence','dialogue']);
assert.strictEqual(parsed.stats.vocabularyCount, 1);
assert.strictEqual(parsed.stats.sentenceCount, 1);
assert.strictEqual(parsed.stats.dialogueCount, 1);


const repeatedTokens = Core.parseAiPaste(JSON.stringify({
  format:'tieng-trung-ai-result-v1', type:'sentence', level:'HSK 1', topic:'Lặp từ', extra_words:[], quality_notes:[],
  items:[{id:'repeat-1',hanzi:'我爱我家。',pinyin:'wǒ ài wǒ jiā.',meaning:'Tôi yêu gia đình tôi.',tokens:['我','爱','我','家'],source_word_ids:[],grammar_ids:[]}]
}), { expectedType:'sentence' });
assert.deepStrictEqual(repeatedTokens.blocks[0].items[0].tokens, ['我','爱','我','家']);

const crossChecked = Core.parseAiPaste([
  JSON.stringify({format:'tieng-trung-ai-result-v1',type:'vocabulary',level:'HSK 1',topic:'Gia đình',extra_words:[],quality_notes:[],items:[{id:'w-known',hanzi:'家',pinyin:'jiā',meaning:'gia đình',word_type:'Danh từ',tags:[]}]}),
  JSON.stringify({format:'tieng-trung-ai-result-v1',type:'sentence',level:'HSK 1',topic:'Gia đình',extra_words:[{hanzi:'医院',pinyin:'yī yuàn',meaning:'bệnh viện',reason:'cần cho ngữ cảnh'}],quality_notes:[],items:[{id:'s-ref',hanzi:'我爱我家。',pinyin:'wǒ ài wǒ jiā.',meaning:'Tôi yêu gia đình tôi.',tokens:['我','爱','我','家'],source_word_ids:['w-missing'],grammar_ids:[]}]})
].join('\n'));
assert.ok(crossChecked.blocks[1].warnings.some(message => message.includes('医院')));
assert.ok(crossChecked.blocks[1].warnings.some(message => message.includes('w-missing')));

const selected = new Set(parsed.blocks.map(block => block.id));
const listening = Core.buildAiListeningImport(parsed, { title:'Gia đình', selectedBlockIds:selected });
assert.strictEqual(listening.errors.length, 0);
assert.strictEqual(listening.decks.length, 1);
assert.strictEqual(listening.stats.wordCount, 1);
assert.ok(listening.stats.sentenceCount >= 2);
assert.strictEqual(listening.stats.dialogueCount, 1);

const flashcard = Core.buildAiFlashcardImport(parsed, { title:'Gia đình', selectedBlockIds:selected });
assert.strictEqual(flashcard.errors.length, 0);
assert.strictEqual(flashcard.decks.length, 1);
assert.ok(flashcard.decks[0].cards.length >= 4);

const listeningSplit = Core.buildAiListeningImport(parsed, { title:'Gia đình', selectedBlockIds:selected, splitByType:true });
assert.strictEqual(listeningSplit.errors.length, 0);
assert.strictEqual(listeningSplit.groups.length, 1);
assert.strictEqual(listeningSplit.decks.length, 3);
assert.deepStrictEqual(listeningSplit.decks.map(deck => deck.name), ['Gia đình · Từ vựng','Gia đình · Câu','Gia đình · Hội thoại']);
assert.ok(listeningSplit.decks.every(deck => deck.groupId === listeningSplit.groups[0].id));

const flashcardSplit = Core.buildAiFlashcardImport(parsed, { title:'Gia đình', selectedBlockIds:selected, splitByType:true });
assert.strictEqual(flashcardSplit.errors.length, 0);
assert.strictEqual(flashcardSplit.groups.length, 1);
assert.strictEqual(flashcardSplit.decks.length, 3);
assert.deepStrictEqual(flashcardSplit.decks.map(deck => deck.name), ['Gia đình · Từ vựng','Gia đình · Câu','Gia đình · Hội thoại']);
assert.ok(flashcardSplit.decks.every(deck => deck.groupId === flashcardSplit.groups[0].id));


const fullFive = Core.parseAiPaste([
  JSON.stringify([{id:'v5',hanzi:'家',pinyin:'jiā',meaning:'gia đình',word_type:'Danh từ',tags:[]}]),
  JSON.stringify([{id:'s5',hanzi:'我爱我家。',pinyin:'wǒ ài wǒ jiā.',meaning:'Tôi yêu gia đình tôi.',tokens:['我','爱','我','家'],tags:[]}]),
  JSON.stringify([{id:'g5',topic:'Gia đình',pattern:'A + 有 + B',explanation:'Diễn tả sở hữu.',tips:'',attentions:'',examples:[{hanzi:'我有妹妹。',pinyin:'wǒ yǒu mèi mei.',meaning:'Tôi có em gái.'}]}]),
  JSON.stringify({id:'d5',title:'Hội thoại',kind:'dialogue',items:[{id:'d5-1',order:1,speaker:'A',hanzi:'你好！',pinyin:'nǐ hǎo!',meaning:'Xin chào!',tokens:['你好']},{id:'d5-2',order:2,speaker:'B',hanzi:'你好！',pinyin:'nǐ hǎo!',meaning:'Xin chào!',tokens:['你好']}]}),
  JSON.stringify({id:'p5',title:'Đoạn văn',kind:'passage',items:[{id:'p5-1',order:1,hanzi:'我爱我家。',pinyin:'wǒ ài wǒ jiā.',meaning:'Tôi yêu gia đình tôi.',tokens:['我','爱','我','家']}]})
].join('\n'));
const fullFiveIds = new Set(fullFive.blocks.map(block => block.id));
const fullFiveFlashcards = Core.buildAiFlashcardImport(fullFive,{title:'Giới thiệu gia đình',selectedBlockIds:fullFiveIds,splitByType:true});
const fullFiveListening = Core.buildAiListeningImport(fullFive,{title:'Giới thiệu gia đình',selectedBlockIds:fullFiveIds,splitByType:true});
assert.strictEqual(fullFiveFlashcards.decks.length,5);
assert.strictEqual(fullFiveListening.decks.length,5);
assert.deepStrictEqual(fullFiveFlashcards.decks.map(deck=>deck.contentType),['vocabulary','sentence','grammar','dialogue','passage']);
assert.deepStrictEqual(fullFiveListening.decks.map(deck=>deck.name),['Giới thiệu gia đình · Từ vựng','Giới thiệu gia đình · Câu','Giới thiệu gia đình · Ngữ pháp','Giới thiệu gia đình · Hội thoại','Giới thiệu gia đình · Đoạn văn']);

const promptCode = fs.readFileSync(path.join(__dirname,'../modules/shared/ai-prompt-templates.js'),'utf8');
const sandbox = { window:{} };
vm.createContext(sandbox);
vm.runInContext(promptCode, sandbox);
const prompt = sandbox.window.TiengTrungAiPromptTemplates.build('sentence', { level:'HSK 1', topic:'Gia đình', count:5, inputText:'家\n爸爸' });
assert.match(prompt, /extra_words/);
assert.match(prompt, /source_word_ids/);
assert.match(prompt, /grammar_ids/);
assert.match(prompt, /Không gộp cả một chủ ngữ dài/);
assert.match(prompt, /chỉ dùng các từ đó làm dữ liệu chính/);

const listeningApp = fs.readFileSync(path.join(__dirname,'../modules/listening/app.js'),'utf8');
const flashcardApp = fs.readFileSync(path.join(__dirname,'../modules/hanzi-stroke/app.js'),'utf8');
assert.match(listeningApp, /Dán kết quả AI/);
assert.match(listeningApp, /parseAiPaste/);
assert.match(listeningApp, /Tạo nhóm và các bộ Nghe riêng/);
assert.match(flashcardApp, /Tạo nhóm và các bộ riêng/);
assert.match(flashcardApp, /data-flashcard-ai-paste-open/);
assert.match(flashcardApp, /aiPasteToListening/);
console.log('PASS: AI paste parser, preview adapters, prompt quality and app integration contracts');

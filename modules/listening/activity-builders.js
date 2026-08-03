(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./core.js'));
  } else {
    root.ListeningActivityBuilders = factory(root.ListeningCore);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core) {
  'use strict';

  const MIN_ORDERING_TOKENS = 3;

  function toArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function hashSeed(value) {
    let hash = 2166136261;
    const text = String(value || '');
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seedText) {
    let state = hashSeed(seedText) || 1;
    return function next() {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function deterministicShuffle(list, seed) {
    const result = toArray(list).slice();
    const random = seededRandom(seed);
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function plainPinyin(value) {
    return String(value || '').toLowerCase().replace(/[^a-züv]/g, '');
  }

  function distractorScore(answer, candidate) {
    let score = 0;
    const answerLength = Core.answerUnits(answer.text).length;
    const candidateLength = Core.answerUnits(candidate.text).length;
    score += Math.max(0, 5 - Math.abs(answerLength - candidateLength));
    if (answer.wordType && candidate.wordType && answer.wordType === candidate.wordType) score += 3;
    const left = plainPinyin(answer.pinyin);
    const right = plainPinyin(candidate.pinyin);
    if (left && right && left[0] === right[0]) score += 2;
    if (left && right && left.slice(0, 2) === right.slice(0, 2)) score += 2;
    return score;
  }

  function buildWordChoiceItems(dataset, options) {
    const configured = options || {};
    const choiceCount = Math.max(2, Number(configured.choiceCount || 4));
    const words = toArray(dataset && dataset.words).filter((word) => Core.containsHan(word.text));
    return words.map((answer, index) => {
      const candidates = words
        .filter((word) => word.id !== answer.id)
        .map((word) => ({ word, score: distractorScore(answer, word) }))
        .sort((left, right) => right.score - left.score || left.word.text.localeCompare(right.word.text));
      const bucket = candidates.slice(0, Math.max(choiceCount * 3, choiceCount - 1));
      const distractors = deterministicShuffle(bucket, `${configured.shuffleSeed || 'stable'}:${answer.id}:distractors`)
        .slice(0, Math.max(0, choiceCount - 1))
        .map((entry) => entry.word);
      const choices = deterministicShuffle([answer].concat(distractors), `${configured.shuffleSeed || 'stable'}:${answer.id}:choices:${choiceCount}`)
        .map((word) => ({ id: word.id, text: word.text, pinyin: word.pinyin, meaning: word.meaning }));
      return Object.assign({}, answer, {
        id: `word-choice:${answer.id}`,
        canonicalItemId: answer.id,
        activityType: 'word-choice',
        answerId: answer.id,
        choices,
        choiceCount: choices.length,
        order: index
      });
    }).filter((item) => item.choices.length >= 2);
  }

  function normalizedTokens(sentence) {
    const pinyinUnits = String(sentence && sentence.pinyin || '').trim().split(/\s+/).filter(Boolean);
    let pinyinIndex = 0;
    return toArray(sentence && sentence.tokens).map((token, index) => {
      const text = token.text || token;
      const unitCount = Core.answerUnits(text).length;
      const pinyin = pinyinUnits.slice(pinyinIndex, pinyinIndex + unitCount).join(' ');
      pinyinIndex += unitCount;
      return {
        id: `${sentence.id}:token-${index + 1}`,
        text,
        pinyin
      };
    }).filter((token) => token.text);
  }

  function buildSentenceOrderingItems(dataset, options) {
    const configured = options || {};
    const allowedIds = configured.sentenceIds ? new Set(configured.sentenceIds) : null;
    return toArray(dataset && dataset.sentences)
      .filter((sentence) => !allowedIds || allowedIds.has(sentence.id))
      .map((sentence) => {
        const tokens = normalizedTokens(sentence);
        if (tokens.length < MIN_ORDERING_TOKENS) return null;
        return Object.assign({}, sentence, {
          id: `sentence-ordering:${sentence.id}`,
          canonicalItemId: sentence.id,
          activityType: 'token-ordering',
          tokens,
          shuffledTokens: deterministicShuffle(tokens, `${configured.shuffleSeed || 'stable'}:${sentence.id}:tokens`)
        });
      })
      .filter(Boolean);
  }

  function createGroupAudioItem(group, activityType) {
    const items = toArray(group && group.items);
    return {
      id: `${activityType}:${group.id}`,
      canonicalItemId: group.id,
      activityType,
      text: items.map((item) => item.text).join(''),
      speechText: items.map((item) => item.text).join('。'),
      pinyin: items.map((item) => item.pinyin).filter(Boolean).join(' / '),
      meaning: items.map((item) => item.meaning).filter(Boolean).join(' / '),
      sourceType: group.sourceType || 'structured-group',
      sourceId: group.sourceId,
      sourceTitle: group.title,
      lessonId: group.lessonId,
      isPassage: true,
      segments: items.map((item) => ({
        id: item.id,
        text: item.text,
        pinyin: item.pinyin,
        meaning: item.meaning,
        speaker: item.speaker || ''
      })),
      groupId: group.id,
      groupKind: group.kind,
      groupTitle: group.title
    };
  }

  function buildGroupSequenceItem(group) {
    const base = createGroupAudioItem(group, `${group.kind}-sequence-ordering`);
    const cards = toArray(group.items).map((item, index) => ({
      id: item.id,
      text: item.text,
      pinyin: item.pinyin,
      meaning: item.meaning,
      speaker: item.speaker || '',
      expectedIndex: index
    }));
    base.cards = cards;
    base.shuffledCards = deterministicShuffle(cards, `${group.id}:sequence`);
    return base;
  }

  function groupContextFor(group, currentIndex, practiceItemIds) {
    const items = toArray(group && group.items);
    return {
      id: group.id,
      kind: group.kind,
      title: group.title,
      currentIndex,
      speechText: items.map((entry) => entry.text).join('。'),
      practiceItemIds: toArray(practiceItemIds),
      items: items.map((entry) => ({
        id: entry.id,
        text: entry.text,
        pinyin: entry.pinyin || '',
        meaning: entry.meaning || '',
        speaker: entry.speaker || ''
      }))
    };
  }

  function buildGroupTokenItems(group) {
    const sourceItems = toArray(group && group.items);
    const eligible = sourceItems.map((item, index) => ({ item, index, tokens: normalizedTokens(item) }))
      .filter((entry) => entry.tokens.length >= MIN_ORDERING_TOKENS);
    const practiceItemIds = eligible.map((entry) => entry.item.id);
    return eligible.map(({ item, index, tokens }) => Object.assign({}, item, {
      id: `${group.kind}-token-ordering:${item.id}`,
      canonicalItemId: item.canonicalSentenceId || item.id,
      activityType: `${group.kind}-token-ordering`,
      tokens,
      shuffledTokens: deterministicShuffle(tokens, `${item.id}:tokens`),
      groupContext: groupContextFor(group, index, practiceItemIds)
    }));
  }

  function buildGroupDictationItems(group) {
    const items = toArray(group && group.items);
    const practiceItemIds = items.map((entry) => entry.id);
    return items.map((item, index) => Object.assign({}, item, {
      id: `${group.kind}-dictation:${item.id}`,
      canonicalItemId: item.canonicalSentenceId || item.id,
      activityType: `${group.kind}-dictation`,
      groupContext: groupContextFor(group, index, practiceItemIds)
    }));
  }

  function buildGroupFullDictationItem(group) {
    const item = createGroupAudioItem(group, `${group.kind}-full-dictation`);
    item.text = toArray(group && group.items).map((entry) => entry.text).join('\n');
    item.fullGroupDictation = true;
    return item;
  }

  return {
    deterministicShuffle,
    buildWordChoiceItems,
    buildSentenceOrderingItems,
    buildGroupSequenceItem,
    buildGroupTokenItems,
    buildGroupDictationItems,
    buildGroupFullDictationItem,
    MIN_ORDERING_TOKENS
  };
});

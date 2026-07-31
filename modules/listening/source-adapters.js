(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./core.js'));
  } else {
    root.ListeningSourceAdapters = factory(root.ListeningCore);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core) {
  'use strict';

  const SCHEMA_VERSION = 1;
  const GROUP_KINDS = new Set(['dialogue', 'passage']);

  function toArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function cleanText(value) {
    return String(value || '').trim();
  }

  function cleanPinyin(value) {
    return cleanText(value).replace(/\s*\*\s*/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function normalizedSentenceKey(value) {
    return cleanText(value)
      .replace(/[\s\u3000]+/g, '')
      .replace(/[，,。.!！?？；;：:“”"'‘’—–-]/g, '')
      .toLowerCase();
  }

  function stableId(value, prefix) {
    if (Core && typeof Core.stableId === 'function') return Core.stableId(String(value || ''), prefix || 'id');
    let hash = 2166136261;
    const text = String(value || '');
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `${prefix || 'id'}-${(hash >>> 0).toString(36)}`;
  }

  function routeForUnit(item, unitId) {
    return toArray(item && item.routes).find((route) => route && route.sectionId === unitId && route.libraryId === 'new_hsk') || null;
  }

  function listNewHskUnits(levelData, options) {
    const configured = options || {};
    const levelId = configured.levelId || 'new-hsk-1';
    const units = new Map();
    toArray(levelData && levelData.items).forEach((item) => {
      toArray(item.routes).forEach((route) => {
        if (!route || route.libraryId !== 'new_hsk' || route.levelId !== levelId) return;
        if (configured.sectionType && route.sectionType !== configured.sectionType) return;
        if (!units.has(route.sectionId)) {
          units.set(route.sectionId, {
            id: route.sectionId,
            unitId: route.sectionId,
            levelId: route.levelId,
            levelName: route.levelName,
            sectionType: route.sectionType,
            sectionOrder: route.sectionOrder,
            title: route.sectionTitle || '',
            titleZh: route.sectionTitleZh || '',
            wordCount: 0,
            exampleCount: 0
          });
        }
        const unit = units.get(route.sectionId);
        unit.wordCount += 1;
        unit.exampleCount += toArray(item.examples).filter((entry) => cleanText(entry && entry.chinese)).length;
      });
    });
    return Array.from(units.values()).sort((left, right) => {
      if (left.sectionType !== right.sectionType) return String(left.sectionType).localeCompare(String(right.sectionType));
      return Number(left.sectionOrder || 0) - Number(right.sectionOrder || 0);
    });
  }

  function normalizeWord(item, route, unitId, sourceFile) {
    const text = cleanText(item.word || item.simplified || item.traditional);
    if (!text) return null;
    return {
      id: stableId(`${unitId}|word|${text}|${item.pinyin || ''}`, 'nhsk-word'),
      text,
      hanzi: text,
      pinyin: cleanPinyin(item.pinyin),
      meaning: cleanText(item.meaningVi || item.translationVi),
      wordType: cleanText(item.wordType),
      sourceType: 'new-hsk-word',
      sourceId: unitId,
      sourceTitle: route.sectionTitle || '',
      lessonId: unitId,
      originType: 'source',
      origin: {
        file: sourceFile || 'modules/hanzi-stroke/data/learning/hsk/hsk_1.json',
        path: `items[word=${text}]`,
        routeId: route.sectionId
      }
    };
  }

  function normalizeExample(example, context) {
    const text = cleanText(example && (example.chinese || example.hanzi || example.text));
    if (!text || !(Core ? Core.containsHan(text) : /[\u3400-\u9fff]/u.test(text))) return null;
    const key = normalizedSentenceKey(text);
    return {
      id: stableId(`${context.unitId}|sentence|${key}`, 'nhsk-sentence'),
      text,
      hanzi: text,
      pinyin: cleanPinyin(example.pinyin),
      meaning: cleanText(example.meaning_vi || example.vietnamese || example.meaning),
      sourceType: 'new-hsk-sentence',
      sourceId: context.unitId,
      sourceTitle: context.title || '',
      lessonId: context.unitId,
      sentenceType: context.sentenceType || 'vocabulary-example',
      originType: context.originType || 'source',
      grammarId: context.grammarId || '',
      wordId: context.wordId || '',
      origin: context.origin || null
    };
  }

  function dedupeSentences(sentences) {
    const seen = new Map();
    toArray(sentences).forEach((sentence) => {
      if (!sentence) return;
      const key = normalizedSentenceKey(sentence.text);
      if (!key) return;
      if (!seen.has(key)) {
        seen.set(key, sentence);
        return;
      }
      const current = seen.get(key);
      if (!current.pinyin && sentence.pinyin) current.pinyin = sentence.pinyin;
      if (!current.meaning && sentence.meaning) current.meaning = sentence.meaning;
      if (current.sentenceType !== 'grammar-example' && sentence.sentenceType === 'grammar-example') {
        current.alsoGrammarExample = true;
        current.grammarId = current.grammarId || sentence.grammarId;
      }
    });
    return Array.from(seen.values());
  }

  function tokenizeSentence(text, vocabulary, explicitTokens) {
    const answer = Core && typeof Core.answerUnits === 'function'
      ? Core.answerUnits(text).join('')
      : cleanText(text).replace(/[\s，,。.!！?？；;：:“”"'‘’—–-]/g, '');
    if (!answer) return [];
    const explicit = toArray(explicitTokens).map(cleanText).filter(Boolean);
    if (explicit.length && explicit.join('') === answer) {
      return explicit.map((token, index) => ({ id: `token-${index + 1}`, text: token }));
    }
    const lexicon = Array.from(new Set(toArray(vocabulary)
      .map((word) => cleanText(word.text))
      .filter((word) => word.length > 1)))
      .sort((left, right) => right.length - left.length);
    const result = [];
    let index = 0;
    while (index < answer.length) {
      const match = lexicon.find((word) => answer.startsWith(word, index)) || answer[index];
      result.push({ id: `token-${result.length + 1}`, text: match });
      index += match.length;
    }
    return result;
  }

  function grammarItemsForUnit(grammarData, route, context) {
    const chapter = Number(route.sectionOrder || 0);
    const entries = toArray(grammarData && grammarData.items).filter((item) => Number(item.from_book_chapter || 0) === chapter);
    const sentences = [];
    entries.forEach((item) => {
      toArray(item.example).forEach((example, exampleIndex) => {
        const sentence = normalizeExample(example, {
          unitId: context.unitId,
          title: context.title,
          sentenceType: 'grammar-example',
          originType: 'source',
          grammarId: item.id,
          origin: {
            file: context.grammarFile || 'modules/hanzi-stroke/data/learning/grammar/new_hsk_1.json',
            path: `items[id=${item.id}].example[${exampleIndex}]`,
            routeId: route.sectionId
          }
        });
        if (sentence) sentences.push(sentence);
      });
    });
    return { entries, sentences };
  }

  function resolveStructureSentences(structureData, sentencePool, context, vocabulary) {
    const byText = new Map(sentencePool.map((sentence) => [normalizedSentenceKey(sentence.text), sentence]));
    const resolved = new Map();
    const diagnostics = [];
    toArray(structureData && structureData.sentenceDefinitions).forEach((definition) => {
      let sentence = null;
      if (definition.originType === 'source' || definition.originType === 'grammar') {
        const match = byText.get(normalizedSentenceKey(definition.sourceText));
        if (!match) {
          diagnostics.push({ level: 'error', code: 'MISSING_SENTENCE_REF', definitionId: definition.id, sourceText: definition.sourceText });
          return;
        }
        sentence = Object.assign({}, match, {
          id: definition.id,
          originType: definition.originType === 'grammar' ? 'source' : match.originType,
          grammarId: definition.grammarId || match.grammarId || ''
        });
      } else if (definition.originType === 'authored') {
        sentence = normalizeExample({
          chinese: definition.hanzi,
          pinyin: definition.pinyin,
          meaning: definition.meaning
        }, {
          unitId: context.unitId,
          title: context.title,
          sentenceType: 'authored',
          originType: 'authored',
          origin: {
            file: context.structureFile || '',
            path: `sentenceDefinitions[id=${definition.id}]`,
            routeId: context.unitId
          }
        });
        if (sentence) sentence.id = definition.id;
      }
      if (!sentence) return;
      sentence.tokens = tokenizeSentence(sentence.text, vocabulary, definition.tokens);
      sentence.basedOn = definition.basedOn || null;
      resolved.set(definition.id, sentence);
    });
    return { resolved, diagnostics };
  }

  function buildGroups(structureData, resolvedSentences, context) {
    const diagnostics = [];
    const groups = [];
    toArray(structureData && structureData.dialogues).forEach((dialogue) => {
      const items = [];
      toArray(dialogue.turns).forEach((turn, index) => {
        const base = resolvedSentences.get(turn.sentenceRef);
        if (!base) {
          diagnostics.push({ level: 'error', code: 'MISSING_DIALOGUE_SENTENCE', groupId: dialogue.id, sentenceRef: turn.sentenceRef });
          return;
        }
        items.push(Object.assign({}, base, {
          id: `${dialogue.id}:${turn.id}`,
          canonicalSentenceId: base.id,
          speaker: cleanText(turn.speaker),
          groupId: dialogue.id,
          groupKind: 'dialogue',
          groupIndex: index
        }));
      });
      if (items.length >= 2) {
        groups.push({
          id: dialogue.id,
          kind: 'dialogue',
          title: dialogue.title || 'Hội thoại',
          originType: dialogue.originType || 'curated',
          sourceType: 'new-hsk-group',
          items,
          sourceId: context.unitId,
          lessonId: context.unitId
        });
      }
    });
    toArray(structureData && structureData.passages).forEach((passage) => {
      const items = [];
      toArray(passage.sentenceRefs).forEach((sentenceRef, index) => {
        const base = resolvedSentences.get(sentenceRef);
        if (!base) {
          diagnostics.push({ level: 'error', code: 'MISSING_PASSAGE_SENTENCE', groupId: passage.id, sentenceRef });
          return;
        }
        items.push(Object.assign({}, base, {
          id: `${passage.id}:sentence-${index + 1}`,
          canonicalSentenceId: base.id,
          groupId: passage.id,
          groupKind: 'passage',
          groupIndex: index
        }));
      });
      if (items.length >= 2) {
        groups.push({
          id: passage.id,
          kind: 'passage',
          title: passage.title || 'Đoạn văn',
          originType: passage.originType || 'curated',
          sourceType: 'new-hsk-group',
          items,
          sourceId: context.unitId,
          lessonId: context.unitId
        });
      }
    });
    return { groups, diagnostics };
  }

  function adaptNewHskUnit(levelData, grammarData, structureData, unitId, options) {
    const configured = options || {};
    const rawItems = toArray(levelData && levelData.items).filter((item) => routeForUnit(item, unitId));
    if (!rawItems.length) throw new Error(`Không tìm thấy đơn vị New HSK: ${unitId}`);
    const route = routeForUnit(rawItems[0], unitId);
    const context = {
      unitId,
      title: route.sectionTitle || '',
      structureFile: configured.structureFile || '',
      sourceFile: configured.sourceFile || 'modules/hanzi-stroke/data/learning/hsk/hsk_1.json',
      grammarFile: configured.grammarFile || 'modules/hanzi-stroke/data/learning/grammar/new_hsk_1.json'
    };
    const words = rawItems.map((item) => normalizeWord(item, route, unitId, context.sourceFile)).filter(Boolean);
    const vocabularySentences = [];
    rawItems.forEach((item) => {
      const word = words.find((entry) => entry.text === cleanText(item.word || item.simplified || item.traditional));
      toArray(item.examples).forEach((example, exampleIndex) => {
        const sentence = normalizeExample(example, {
          unitId,
          title: context.title,
          sentenceType: 'vocabulary-example',
          originType: 'source',
          wordId: word && word.id || '',
          origin: {
            file: context.sourceFile,
            path: `items[word=${item.word}].examples[${exampleIndex}]`,
            routeId: unitId
          }
        });
        if (sentence) vocabularySentences.push(sentence);
      });
    });
    const grammar = grammarItemsForUnit(grammarData, route, context);
    const sourceSentences = dedupeSentences(vocabularySentences.concat(grammar.sentences));
    sourceSentences.forEach((sentence) => {
      sentence.tokens = tokenizeSentence(sentence.text, words, null);
    });
    const structure = resolveStructureSentences(structureData, sourceSentences, context, words);
    const authored = Array.from(structure.resolved.values()).filter((sentence) => sentence.originType === 'authored');
    const sentences = dedupeSentences(sourceSentences.concat(authored));
    const groupsResult = buildGroups(structureData, structure.resolved, context);
    const groups = groupsResult.groups;
    const dialogues = groups.filter((group) => group.kind === 'dialogue');
    const passages = groups.filter((group) => group.kind === 'passage');
    const diagnostics = structure.diagnostics.concat(groupsResult.diagnostics);
    const validOrderingSentences = sentences.filter((sentence) => toArray(sentence.tokens).length >= 3);
    return {
      schemaVersion: SCHEMA_VERSION,
      source: {
        id: 'new-hsk',
        curriculum: 'new-hsk-9-level',
        levelId: route.levelId,
        levelName: route.levelName
      },
      unit: {
        id: unitId,
        unitId,
        sectionType: route.sectionType,
        sectionOrder: route.sectionOrder,
        title: route.sectionTitle || '',
        titleZh: route.sectionTitleZh || '',
        status: structureData && structureData.status || 'source-only'
      },
      words,
      sentences,
      grammar: grammar.entries,
      groups,
      capabilities: {
        wordChoice: words.length >= 4,
        wordTyping: words.length > 0,
        sentenceDictation: sentences.length > 0,
        sentenceTranscript: sentences.length > 0,
        sentenceOrdering: validOrderingSentences.length > 0,
        dialogueTurnOrdering: dialogues.some((group) => group.items.length >= 2),
        dialogueSentenceOrdering: dialogues.some((group) => group.items.some((item) => toArray(item.tokens).length >= 3)),
        dialogueDictation: dialogues.some((group) => group.items.length >= 2),
        dialogueFullDictation: dialogues.some((group) => group.items.length >= 2),
        passageSentenceOrdering: passages.some((group) => group.items.length >= 2),
        passageSentenceTokenOrdering: passages.some((group) => group.items.some((item) => toArray(item.tokens).length >= 3)),
        passageDictation: passages.some((group) => group.items.length >= 2),
        passageFullDictation: passages.some((group) => group.items.length >= 2)
      },
      diagnostics,
      stats: {
        wordCount: words.length,
        sentenceCount: sentences.length,
        vocabularyExampleCount: sentences.filter((sentence) => sentence.sentenceType === 'vocabulary-example').length,
        grammarExampleCount: sentences.filter((sentence) => sentence.sentenceType === 'grammar-example' || sentence.alsoGrammarExample).length,
        grammarOnlyCount: sentences.filter((sentence) => sentence.sentenceType === 'grammar-example').length,
        authoredSentenceCount: sentences.filter((sentence) => sentence.originType === 'authored').length,
        sourceSentenceCount: sentences.filter((sentence) => sentence.originType === 'source').length,
        dialogueCount: dialogues.length,
        passageCount: passages.length
      },
      rules: Object.assign({
        audio: 'user-mp3-or-device-tts',
        defaultChoiceCount: 4,
        hardChoiceCount: 5,
        grammarIncludedInAllSentences: true
      }, structureData && structureData.rules || {})
    };
  }

  function validateDataset(dataset) {
    const errors = [];
    const warnings = [];
    const ids = new Set();
    if (!dataset || typeof dataset !== 'object') {
      return { ok: false, errors: ['Dataset không hợp lệ.'], warnings };
    }
    if (dataset.schemaVersion !== SCHEMA_VERSION) errors.push(`Schema version không hỗ trợ: ${dataset.schemaVersion || 'thiếu'}.`);
    if (!dataset.source || !cleanText(dataset.source.id)) errors.push('Dataset thiếu source.id.');
    if (!dataset.unit || !cleanText(dataset.unit.id)) errors.push('Dataset thiếu unit.id.');
    ['words', 'sentences', 'groups', 'diagnostics'].forEach((field) => {
      if (!Array.isArray(dataset[field])) errors.push(`Dataset.${field} phải là mảng.`);
    });
    if (!dataset.capabilities || typeof dataset.capabilities !== 'object' || Array.isArray(dataset.capabilities)) {
      errors.push('Dataset thiếu capabilities hợp lệ.');
    }
    function register(id, label) {
      if (!id) errors.push(`${label} thiếu id.`);
      else if (ids.has(id)) errors.push(`Trùng id: ${id}`);
      else ids.add(id);
    }
    toArray(dataset && dataset.words).forEach((word) => {
      register(word.id, 'Từ');
      if (!cleanText(word.text)) errors.push(`Từ ${word.id || '?'} thiếu chữ Hán.`);
    });
    toArray(dataset && dataset.sentences).forEach((sentence) => {
      register(sentence.id, 'Câu');
      if (!cleanText(sentence.text)) errors.push(`Câu ${sentence.id || '?'} thiếu chữ Hán.`);
      const tokenText = toArray(sentence.tokens).map((token) => token.text).join('');
      const answer = Core.answerUnits(sentence.text).join('');
      if (sentence.tokens && tokenText !== answer) errors.push(`Token không khớp câu ${sentence.id}.`);
      if (!sentence.pinyin) warnings.push(`Câu ${sentence.id} thiếu pinyin.`);
      if (!sentence.meaning) warnings.push(`Câu ${sentence.id} thiếu nghĩa.`);
    });
    toArray(dataset && dataset.groups).forEach((group) => {
      register(group.id, 'Nhóm');
      if (!GROUP_KINDS.has(group.kind)) errors.push(`Nhóm ${group.id || '?'} có kind không hợp lệ: ${group.kind || 'thiếu'}.`);
      if (toArray(group.items).length < 2) errors.push(`Nhóm ${group.id} có ít hơn 2 mục.`);
      toArray(group.items).forEach((item) => {
        if (!cleanText(item.text)) errors.push(`Nhóm ${group.id} có mục thiếu chữ Hán.`);
        if (!cleanText(item.canonicalSentenceId)) errors.push(`Nhóm ${group.id} có mục thiếu canonicalSentenceId.`);
      });
    });
    toArray(dataset && dataset.diagnostics).forEach((diagnostic) => {
      if (diagnostic.level === 'error') errors.push(`${diagnostic.code}: ${diagnostic.definitionId || diagnostic.groupId || ''}`.trim());
      else warnings.push(diagnostic.code || 'Cảnh báo dữ liệu');
    });
    return { ok: errors.length === 0, errors, warnings };
  }

  return {
    SCHEMA_VERSION,
    normalizedSentenceKey,
    listNewHskUnits,
    tokenizeSentence,
    adaptNewHskUnit,
    validateDataset
  };
});

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
        sentence.tags = Array.from(new Set(toArray(sentence.tags).map(cleanText).filter(Boolean)));
        seen.set(key, sentence);
        return;
      }
      const current = seen.get(key);
      if (!current.pinyin && sentence.pinyin) current.pinyin = sentence.pinyin;
      if (!current.meaning && sentence.meaning) current.meaning = sentence.meaning;
      current.tags = Array.from(new Set(toArray(current.tags).concat(toArray(sentence.tags)).map(cleanText).filter(Boolean)));
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

  function listLdsnUnits(payload) {
    const lessons = toArray(payload && payload.lessons || payload);
    return lessons.map((lesson, index) => ({
      id: cleanText(lesson.id) || `ldsn-${String(index + 1).padStart(2, '0')}`,
      unitId: cleanText(lesson.id) || `ldsn-${String(index + 1).padStart(2, '0')}`,
      sectionType: 'lesson',
      sectionOrder: Number(lesson.lessonNumber || index + 1),
      title: cleanText(lesson.title && lesson.title.vi),
      titleZh: cleanText(lesson.title && lesson.title.hanzi),
      pinyin: cleanPinyin(lesson.title && lesson.title.pinyin),
      wordCount: toArray(lesson.vocabulary).length,
      dialogueCount: toArray(lesson.dialogue).length,
      passageSentenceCount: toArray(lesson.passage && lesson.passage.sentences).length,
      status: cleanText(lesson.sourceStatus) || 'source-complete'
    })).sort((left, right) => left.sectionOrder - right.sectionOrder);
  }

  function ldsnSentence(raw, context) {
    const text = cleanText(raw && (raw.hanzi || raw.text || raw.chinese));
    if (!text || !(Core ? Core.containsHan(text) : /[\u3400-\u9fff]/u.test(text))) return null;
    const explicitId = cleanText(raw && raw.id);
    const id = stableId(`${context.unitId}|${context.category}|${explicitId}|${normalizedSentenceKey(text)}`, 'ldsn-sentence');
    return {
      id,
      text,
      hanzi: text,
      pinyin: cleanPinyin(raw && raw.pinyin),
      meaning: cleanText(raw && (raw.vi || raw.meaning || raw.vietnamese)),
      sourceType: 'ldsn14-sentence',
      sourceId: context.unitId,
      sourceTitle: context.title || '',
      lessonId: context.unitId,
      sentenceType: context.sentenceType || 'source-sentence',
      originType: 'source',
      grammarId: context.grammarId || '',
      tags: toArray(context.tags),
      origin: {
        file: context.sourceFile,
        path: context.path,
        routeId: context.unitId
      },
      tokens: tokenizeSentence(text, context.vocabulary, raw && raw.answerTokens)
    };
  }

  function adaptLdsnUnit(payload, unitId, options) {
    const configured = options || {};
    const lessons = toArray(payload && payload.lessons || payload);
    const lesson = lessons.find((entry) => cleanText(entry && entry.id) === cleanText(unitId));
    if (!lesson) throw new Error(`Không tìm thấy đơn vị LDSN1-4: ${unitId}`);
    const sourceFile = configured.sourceFile || 'modules/ldsn14/data/lessons.json';
    const title = cleanText(lesson.title && lesson.title.vi);
    const titleZh = cleanText(lesson.title && lesson.title.hanzi);
    const words = toArray(lesson.vocabulary).map((raw, index) => {
      const text = cleanText(raw && raw.hanzi);
      if (!text) return null;
      return {
        id: stableId(`${unitId}|word|${raw.id || index}|${text}`, 'ldsn-word'),
        text,
        hanzi: text,
        pinyin: cleanPinyin(raw.pinyin),
        meaning: cleanText(raw.vi),
        wordType: cleanText(raw.wordClass),
        hanViet: cleanText(raw.hanViet),
        sourceType: 'ldsn14-word',
        sourceId: unitId,
        sourceTitle: title,
        lessonId: unitId,
        originType: 'source',
        origin: {
          file: sourceFile,
          path: `lessons[id=${unitId}].vocabulary[${index}]`,
          routeId: unitId
        }
      };
    }).filter(Boolean);

    const collected = [];
    const addRows = (rows, category, sentenceType, tags, pathPrefix, grammarId) => {
      toArray(rows).forEach((row, index) => {
        const sentence = ldsnSentence(row, {
          unitId,
          title,
          sourceFile,
          category,
          sentenceType,
          tags,
          grammarId,
          vocabulary: words,
          path: `lessons[id=${unitId}].${pathPrefix}[${index}]`
        });
        if (sentence) collected.push(sentence);
      });
    };

    const translation = lesson.translation || {};
    addRows(translation.zhVi && translation.zhVi.questions, 'translation-zhvi-question', 'translation-sentence', ['translation', 'zh-vi'], 'translation.zhVi.questions');
    addRows(translation.zhVi && translation.zhVi.answers, 'translation-zhvi-answer', 'translation-sentence', ['translation', 'zh-vi'], 'translation.zhVi.answers');
    addRows(translation.viZh && translation.viZh.questions, 'translation-vizh-question', 'translation-sentence', ['translation', 'vi-zh'], 'translation.viZh.questions');
    addRows(translation.viZh && translation.viZh.answers, 'translation-vizh-answer', 'translation-sentence', ['translation', 'vi-zh'], 'translation.viZh.answers');
    addRows(lesson.dialogue, 'dialogue', 'dialogue-turn', ['dialogue'], 'dialogue');
    addRows(lesson.passage && lesson.passage.sentences, 'passage', 'passage-sentence', ['passage'], 'passage.sentences');

    const grammarEntries = toArray(lesson.grammar).map((grammar, grammarIndex) => {
      const grammarId = cleanText(grammar.id) || stableId(`${unitId}|grammar|${grammarIndex}|${grammar.title || ''}`, 'ldsn-grammar');
      const examples = toArray(grammar.examples);
      addRows(examples, `grammar-${grammarId}`, 'grammar-example', ['grammar'], `grammar[${grammarIndex}].examples`, grammarId);
      return Object.assign({}, grammar, {
        id: grammarId,
        sourceId: unitId,
        lessonId: unitId,
        origin: {
          file: sourceFile,
          path: `lessons[id=${unitId}].grammar[${grammarIndex}]`,
          routeId: unitId
        }
      });
    });

    const sentences = dedupeSentences(collected);
    const sentenceByKey = new Map(sentences.map((sentence) => [normalizedSentenceKey(sentence.text), sentence]));
    const diagnostics = [];
    const buildLdsnGroup = (kind, rawItems, groupId, groupTitle) => {
      const items = [];
      toArray(rawItems).forEach((raw, index) => {
        const rawText = cleanText(raw && raw.hanzi);
        if (!rawText) return;
        const canonical = sentenceByKey.get(normalizedSentenceKey(rawText));
        if (!canonical) {
          diagnostics.push({ level: 'error', code: 'MISSING_LDSN_GROUP_SENTENCE', groupId, definitionId: raw && raw.id || String(index + 1) });
          return;
        }
        items.push(Object.assign({}, canonical, {
          id: `${groupId}:item-${index + 1}`,
          canonicalSentenceId: canonical.id,
          speaker: kind === 'dialogue' ? cleanText(raw && raw.speaker) : '',
          groupId,
          groupKind: kind,
          groupIndex: index
        }));
      });
      if (items.length < 2) return null;
      return {
        id: groupId,
        kind,
        title: groupTitle,
        originType: 'source',
        sourceType: 'ldsn14-group',
        sourceId: unitId,
        lessonId: unitId,
        items
      };
    };

    const dialogue = buildLdsnGroup('dialogue', lesson.dialogue, `${unitId}-dialogue`, `${titleZh || title} · Hội thoại`);
    const passageTitle = cleanText(lesson.passage && lesson.passage.title && (lesson.passage.title.vi || lesson.passage.title.hanzi)) || `${titleZh || title} · Đoạn văn`;
    const passage = buildLdsnGroup('passage', lesson.passage && lesson.passage.sentences, `${unitId}-passage`, passageTitle);
    const groups = [dialogue, passage].filter(Boolean);
    const dialogues = groups.filter((group) => group.kind === 'dialogue');
    const passages = groups.filter((group) => group.kind === 'passage');
    const validOrderingSentences = sentences.filter((sentence) => toArray(sentence.tokens).length >= 3);

    return {
      schemaVersion: SCHEMA_VERSION,
      source: {
        id: 'ldsn14',
        curriculum: 'ldsn1-4',
        levelId: 'ldsn1-4',
        levelName: 'LDSN1-4'
      },
      unit: {
        id: unitId,
        unitId,
        sectionType: 'lesson',
        sectionOrder: Number(lesson.lessonNumber || 0),
        title,
        titleZh,
        status: cleanText(lesson.sourceStatus) || 'source-complete'
      },
      words,
      sentences,
      grammar: grammarEntries,
      groups,
      sentenceFilters: [
        { id: 'all', label: 'Toàn bộ', tag: '', description: `${sentences.length} câu phân biệt` },
        { id: 'translation', label: 'Dịch câu', tag: 'translation', description: `${sentences.filter((item) => item.tags.includes('translation')).length} câu` },
        { id: 'dialogue', label: 'Hội thoại', tag: 'dialogue', description: `${sentences.filter((item) => item.tags.includes('dialogue')).length} lượt` },
        { id: 'passage', label: 'Đoạn văn', tag: 'passage', description: `${sentences.filter((item) => item.tags.includes('passage')).length} câu` },
        { id: 'grammar', label: 'Ngữ pháp', tag: 'grammar', description: `${sentences.filter((item) => item.tags.includes('grammar')).length} ví dụ` }
      ],
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
        vocabularyExampleCount: 0,
        grammarExampleCount: sentences.filter((sentence) => sentence.tags.includes('grammar')).length,
        grammarOnlyCount: sentences.filter((sentence) => sentence.tags.length === 1 && sentence.tags.includes('grammar')).length,
        authoredSentenceCount: 0,
        sourceSentenceCount: sentences.length,
        translationSentenceCount: sentences.filter((sentence) => sentence.tags.includes('translation')).length,
        dialogueSentenceCount: sentences.filter((sentence) => sentence.tags.includes('dialogue')).length,
        passageSentenceCount: sentences.filter((sentence) => sentence.tags.includes('passage')).length,
        dialogueCount: dialogues.length,
        passageCount: passages.length
      },
      rules: {
        audio: 'user-mp3-or-device-tts',
        defaultChoiceCount: 4,
        hardChoiceCount: 5,
        grammarIncludedInAllSentences: true
      }
    };
  }

  function listNewHskCourseUnits(manifest, options){
    const level = Number(options && options.level || 1);
    return toArray(manifest && manifest.lessons).filter(row => Number(row.level) === level && String(row.status || '').includes('ready')).map(row => ({
      id: cleanText(row.id), unitId: cleanText(row.id), level: Number(row.level), sectionOrder: Number(row.lessonNumber || 0), title: cleanText(row.title && row.title.vi), titleZh: cleanText(row.title && row.title.hanzi), pinyin: cleanPinyin(row.title && row.title.pinyin), dataPath: cleanText(row.path), status: cleanText(row.status)
    })).sort((a,b)=>a.sectionOrder-b.sectionOrder);
  }

  function adaptNewHskCourseLesson(lesson, options){
    const configured=options || {};
    const entities=lesson && lesson.entities || {};
    const unitId=cleanText(lesson && lesson.id);
    const title=cleanText(lesson && lesson.title && lesson.title.vi);
    const titleZh=cleanText(lesson && lesson.title && lesson.title.hanzi);
    const sourceFile=configured.sourceFile || `modules/new-hsk-course/data/hsk${lesson.level}/lesson-${String(lesson.lessonNumber).padStart(2,'0')}.json`;
    const words=[...toArray(entities.vocabulary),...toArray(entities.properNouns)].map((raw,index)=>{
      const text=cleanText(raw.hanzi); if(!text) return null;
      return {id:cleanText(raw.id)||stableId(`${unitId}|word|${text}`,'nhsk-course-word'),text,hanzi:text,pinyin:cleanPinyin(raw.pinyin),meaning:cleanText(raw.vi),hanViet:cleanText(raw.hanViet),wordType:cleanText(raw.wordClass || raw.kind),sourceType:'new-hsk-course-word',sourceId:unitId,sourceTitle:title,lessonId:unitId,originType:'source',origin:{file:sourceFile,path:`entities.${raw.kind?'properNouns':'vocabulary'}[${index}]`,routeId:unitId}};
    }).filter(Boolean);
    const sentences=[]; const groups=[];
    toArray(entities.dialogues).forEach((dialogue,dialogueIndex)=>{
      const items=[];
      toArray(dialogue.turns).forEach((turn,turnIndex)=>{
        const sentence={id:cleanText(turn.id)||stableId(`${unitId}|dialogue|${dialogueIndex}|${turnIndex}`,'nhsk-course-sentence'),text:cleanText(turn.hanzi),hanzi:cleanText(turn.hanzi),pinyin:cleanPinyin(turn.pinyin),meaning:cleanText(turn.vi),speaker:cleanText(turn.speaker && turn.speaker.vi),sourceType:'new-hsk-course-sentence',sourceId:unitId,sourceTitle:title,lessonId:unitId,sentenceType:'dialogue-turn',originType:'source',tags:['dialogue'],origin:{file:sourceFile,path:`entities.dialogues[${dialogueIndex}].turns[${turnIndex}]`,routeId:unitId},tokens:tokenizeSentence(turn.hanzi,words,turn.answerTokens)};
        if(!sentence.text) return; sentences.push(sentence); items.push(Object.assign({},sentence,{id:`${sentence.id}:group`,canonicalSentenceId:sentence.id,groupId:dialogue.id,groupKind:'dialogue',groupIndex:turnIndex}));
      });
      if(items.length>=2) groups.push({id:cleanText(dialogue.id)||`${unitId}-dialogue-${dialogueIndex+1}`,kind:'dialogue',title:cleanText(dialogue.sourceHeading)||`${titleZh||title} · Hội thoại`,originType:'source',sourceType:'new-hsk-course-group',sourceId:unitId,lessonId:unitId,items});
    });
    toArray(entities.passages).forEach((passage,passageIndex)=>{
      const hanzi=cleanText(passage.hanzi).split(/\n+/u).filter(Boolean); const pinyin=cleanText(passage.pinyin).split(/\n+/u); const vi=cleanText(passage.vi).split(/\n+/u); const items=[];
      hanzi.forEach((line,lineIndex)=>{ const sentence={id:`${cleanText(passage.id)||`${unitId}-passage-${passageIndex+1}`}-line-${lineIndex+1}`,text:line,hanzi:line,pinyin:cleanPinyin(pinyin[lineIndex]),meaning:cleanText(vi[lineIndex]),sourceType:'new-hsk-course-sentence',sourceId:unitId,sourceTitle:title,lessonId:unitId,sentenceType:'passage-sentence',originType:'source',tags:['passage'],origin:{file:sourceFile,path:`entities.passages[${passageIndex}]`,routeId:unitId},tokens:tokenizeSentence(line,words,null)}; sentences.push(sentence); items.push(Object.assign({},sentence,{id:`${sentence.id}:group`,canonicalSentenceId:sentence.id,groupId:passage.id,groupKind:'passage',groupIndex:lineIndex})); });
      if(items.length>=2) groups.push({id:cleanText(passage.id)||`${unitId}-passage-${passageIndex+1}`,kind:'passage',title:cleanText(passage.title)||`${titleZh||title} · Bài đọc`,originType:'source',sourceType:'new-hsk-course-group',sourceId:unitId,lessonId:unitId,items});
    });
    const grammar=[...toArray(entities.grammar),...toArray(entities.languageNotes)].map((raw,index)=>Object.assign({},raw,{id:cleanText(raw.id)||`${unitId}-grammar-${index+1}`,sourceId:unitId,lessonId:unitId,origin:{file:sourceFile,path:`entities.languageNotes[${index}]`,routeId:unitId}}));
    const validOrdering=sentences.filter(row=>toArray(row.tokens).length>=2); const dialogues=groups.filter(g=>g.kind==='dialogue'); const passages=groups.filter(g=>g.kind==='passage');
    return {schemaVersion:SCHEMA_VERSION,source:{id:'new-hsk-course',curriculum:'new-hsk-course',levelId:`hsk-${lesson.level}`,levelName:`HSK ${lesson.level}`},unit:{id:unitId,unitId,sectionType:'lesson',sectionOrder:Number(lesson.lessonNumber||0),title,titleZh,status:cleanText(lesson.source && lesson.source.status)||'app-ready'},words,sentences,grammar,groups,sentenceFilters:[{id:'all',label:'Toàn bộ',tag:'',description:`${sentences.length} câu`},{id:'dialogue',label:'Hội thoại',tag:'dialogue',description:`${sentences.filter(x=>x.tags.includes('dialogue')).length} lượt`},{id:'passage',label:'Bài đọc / bài vè',tag:'passage',description:`${sentences.filter(x=>x.tags.includes('passage')).length} câu`}],capabilities:{wordChoice:words.length>=4,wordTyping:words.length>0,sentenceDictation:sentences.length>0,sentenceTranscript:sentences.length>0,sentenceOrdering:validOrdering.length>0,dialogueTurnOrdering:dialogues.some(g=>g.items.length>=2),dialogueSentenceOrdering:dialogues.some(g=>g.items.some(i=>toArray(i.tokens).length>=2)),dialogueDictation:dialogues.length>0,dialogueFullDictation:dialogues.length>0,passageSentenceOrdering:passages.some(g=>g.items.length>=2),passageSentenceTokenOrdering:passages.some(g=>g.items.some(i=>toArray(i.tokens).length>=2)),passageDictation:passages.length>0,passageFullDictation:passages.length>0},diagnostics:[],stats:{wordCount:words.length,sentenceCount:sentences.length,vocabularyExampleCount:0,grammarExampleCount:0,grammarOnlyCount:0,authoredSentenceCount:0,sourceSentenceCount:sentences.length,dialogueCount:dialogues.length,passageCount:passages.length},rules:{audio:'source-audio-or-device-tts',defaultChoiceCount:4,hardChoiceCount:5,grammarIncludedInAllSentences:true}};
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
    if (dataset.sentenceFilters !== undefined) {
      if (!Array.isArray(dataset.sentenceFilters)) {
        errors.push('Dataset.sentenceFilters phải là mảng.');
      } else {
        const filterIds = new Set();
        dataset.sentenceFilters.forEach((filter, index) => {
          const filterId = cleanText(filter && filter.id);
          if (!filterId) errors.push(`Dataset.sentenceFilters[${index}] thiếu id.`);
          else if (filterIds.has(filterId)) errors.push(`Dataset.sentenceFilters trùng id: ${filterId}`);
          else filterIds.add(filterId);
          if (!cleanText(filter && filter.label)) errors.push(`Dataset.sentenceFilters[${index}] thiếu label.`);
        });
        if (dataset.sentenceFilters.length && !filterIds.has('all')) {
          errors.push('Dataset.sentenceFilters phải có bộ lọc all.');
        }
      }
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
    listNewHskCourseUnits,
    listLdsnUnits,
    tokenizeSentence,
    adaptNewHskUnit,
    adaptNewHskCourseLesson,
    adaptLdsnUnit,
    validateDataset
  };
});

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ListeningCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const HAN_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u;
  const UNIT_RE = /[\p{L}\p{N}]/u;
  const PUNCTUATION_RE = /[，。！？；、,.!?;：:“”‘’（）()《》〈〉【】\[\]…—\-\s]/u;

  function toArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function containsHan(value) {
    return HAN_RE.test(String(value || ''));
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function answerUnits(value) {
    return Array.from(String(value || '')).filter((char) => UNIT_RE.test(char) && !PUNCTUATION_RE.test(char));
  }

  function sanitizeAnswer(value, maxLength) {
    const units = answerUnits(value);
    const limited = Number.isFinite(maxLength) ? units.slice(0, Math.max(0, maxLength)) : units;
    return limited.join('');
  }

  function sanitizeDictationAnswer(value, target, maxLength) {
    const targetUnits = answerUnits(target);
    const targetHasLatin = targetUnits.some((char) => /[A-Za-z]/.test(char));
    const units = answerUnits(value).filter((char) => {
      if (HAN_RE.test(char) || /\p{N}/u.test(char)) return true;
      return targetHasLatin && /[A-Za-z]/.test(char);
    });
    const limited = Number.isFinite(maxLength) ? units.slice(0, Math.max(0, maxLength)) : units;
    return limited.join('');
  }

  function appendDictationInput(current, committed, target, maxLength) {
    return sanitizeDictationAnswer(`${current || ''}${committed || ''}`, target, maxLength);
  }

  function removeLastAnswerUnit(value) {
    return answerUnits(value).slice(0, -1).join('');
  }

  function splitIntoRows(unitsOrText, size) {
    const units = Array.isArray(unitsOrText) ? unitsOrText.slice() : answerUnits(unitsOrText);
    const rowSize = Math.max(1, Number(size) || 10);
    const rows = [];
    for (let index = 0; index < units.length; index += rowSize) {
      rows.push(units.slice(index, index + rowSize));
    }
    return rows;
  }

  function compareAnswers(input, target) {
    const expected = answerUnits(target);
    const actual = answerUnits(input).slice(0, expected.length);
    const cells = expected.map((char, index) => ({
      expected: char,
      actual: actual[index] || '',
      correct: actual[index] === char
    }));
    return {
      expected,
      actual,
      cells,
      correctCount: cells.filter((cell) => cell.correct).length,
      total: expected.length,
      isCorrect: expected.length > 0 && actual.length === expected.length && cells.every((cell) => cell.correct)
    };
  }

  function stableId(text, prefix) {
    let hash = 2166136261;
    const input = String(text || '');
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `${prefix || 'item'}-${(hash >>> 0).toString(36)}`;
  }

  function firstString(object, keys) {
    for (const key of keys) {
      const value = object && object[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  }

  function normalizeItem(raw, context) {
    const object = raw && typeof raw === 'object' ? raw : {};
    const text = firstString(object, ['zh', 'text', 'chinese', 'hanzi', 'sentence', 'front', 'term', 'word']);
    if (!containsHan(text)) return null;
    if (object.listenEnabled === false || object.listeningEnabled === false || object.excludeFromListening === true) return null;

    const source = context || {};
    return {
      id: String(object.id || stableId(`${source.sourceId || ''}|${text}`, 'listen')),
      text: normalizeText(text),
      pinyin: firstString(object, ['pinyin', 'pronunciation', 'romanization']),
      meaning: firstString(object, ['vi', 'meaning', 'translation', 'back', 'definition']),
      speaker: firstString(object, ['speaker_zh', 'speaker', 'speakerName']),
      sourceType: source.sourceType || object.sourceType || 'custom',
      sourceId: source.sourceId || object.sourceId || '',
      sourceTitle: source.sourceTitle || object.sourceTitle || '',
      lessonId: source.lessonId || object.lessonId || '',
      lessonTitle: source.lessonTitle || object.lessonTitle || '',
      raw: object
    };
  }

  function dedupeItems(items) {
    const seen = new Set();
    return toArray(items).filter(Boolean).filter((item) => {
      const key = answerUnits(item.text).join('');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function extract301Items(data, lesson) {
    const lessonMeta = lesson || {};
    const context = {
      sourceType: '301',
      sourceId: '301',
      sourceTitle: 'Giáo trình 301',
      lessonId: String(data && data.lesson_id || lessonMeta.lesson_id || ''),
      lessonTitle: String(data && (data.title_zh || data.title) || lessonMeta.title_zh || lessonMeta.title || '')
    };
    const groups = ['sentences', 'dialogue', 'extension', 'phrases', 'main_items'];
    const items = [];
    groups.forEach((key) => {
      toArray(data && data[key]).forEach((raw) => {
        const item = normalizeItem(raw, context);
        if (item) items.push(item);
      });
    });
    return dedupeItems(items);
  }

  function extractCustomItems(data, context) {
    const source = Object.assign({ sourceType: 'custom', sourceId: 'custom-import', sourceTitle: 'Bộ tự tạo' }, context || {});
    const found = [];
    const visited = new Set();

    function walk(value, depth) {
      if (depth > 12 || value === null || value === undefined) return;
      if (typeof value !== 'object') return;
      if (visited.has(value)) return;
      visited.add(value);

      if (Array.isArray(value)) {
        value.forEach((entry) => walk(entry, depth + 1));
        return;
      }

      const item = normalizeItem(value, source);
      if (item) found.push(item);

      Object.keys(value).forEach((key) => {
        if (['raw', 'audio', 'image', 'images', 'media'].includes(key)) return;
        walk(value[key], depth + 1);
      });
    }

    walk(data, 0);
    return dedupeItems(found);
  }

  function tokenizePinyin(value) {
    const normalized = String(value || '')
      .replace(/[，。！？；、,.!?;:：“”‘’（）()\[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return normalized ? normalized.split(' ') : [];
  }

  function getCharacterPinyin(item, index) {
    const textUnits = answerUnits(item && item.text);
    const syllables = tokenizePinyin(item && item.pinyin);
    if (!syllables.length) return '';
    if (syllables.length === textUnits.length) return syllables[index] || '';
    if (syllables.length > index && syllables.length >= Math.max(1, textUnits.length - 1)) return syllables[index] || '';
    return String(item && item.pinyin || '');
  }

  function findVocabularyHint(item, index, vocabulary) {
    const units = answerUnits(item && item.text);
    const char = units[index] || '';
    if (!char) return null;
    const text = units.join('');
    const candidates = toArray(vocabulary)
      .map((entry) => normalizeItem(entry, {}))
      .filter(Boolean)
      .filter((entry) => entry.text.length > 1 && entry.text.includes(char) && text.includes(answerUnits(entry.text).join('')))
      .sort((a, b) => b.text.length - a.text.length);
    return candidates[0] || null;
  }

  function findRewindStart(text, charIndex, seconds, rate) {
    const source = String(text || '');
    const current = Math.max(0, Math.min(source.length, Number(charIndex) || 0));
    const speed = Math.max(0.5, Number(rate) || 1);
    const charsPerSecond = 3.6 * speed;
    let target = Math.max(0, current - Math.max(1, Math.round((Number(seconds) || 3) * charsPerSecond)));
    const punctuation = /[，。！？；、,.!?;：]/;
    const lowerBound = Math.max(0, target - 8);
    for (let index = target; index >= lowerBound; index -= 1) {
      if (punctuation.test(source[index - 1] || '')) {
        target = index;
        break;
      }
    }
    return target;
  }

  function chooseVoice(voices, settings) {
    const available = toArray(voices);
    const configured = settings || {};
    const chinese = available.filter((voice) => String(voice.lang || '').toLowerCase().startsWith('zh'));
    const pool = chinese.length ? chinese : available;
    if (!pool.length) return null;

    if (configured.voiceURI) {
      const exact = pool.find((voice) => voice.voiceURI === configured.voiceURI || voice.name === configured.voiceURI);
      if (exact) return exact;
    }

    const mainland = pool.filter((voice) => String(voice.lang || '').toLowerCase().startsWith('zh-cn'));
    const candidates = mainland.length ? mainland : pool;
    const preference = configured.voiceGender || 'auto';
    const femaleTokens = ['xiaoxiao', 'huihui', 'yaoyao', 'tingting', 'meijia', 'sinji', 'lili', 'female', 'woman', 'nữ'];
    const maleTokens = ['yunxi', 'kangkang', 'yunyang', 'male', 'man', 'nam'];
    const tokens = preference === 'female' ? femaleTokens : preference === 'male' ? maleTokens : [];
    if (tokens.length) {
      const match = candidates.find((voice) => {
        const name = `${voice.name || ''} ${voice.voiceURI || ''}`.toLowerCase();
        return tokens.some((token) => name.includes(token));
      });
      if (match) return match;
    }

    return candidates.find((voice) => voice.default) || candidates[0];
  }

  return {
    answerUnits,
    sanitizeAnswer,
    sanitizeDictationAnswer,
    appendDictationInput,
    removeLastAnswerUnit,
    splitIntoRows,
    compareAnswers,
    containsHan,
    normalizeItem,
    extract301Items,
    extractCustomItems,
    tokenizePinyin,
    getCharacterPinyin,
    findVocabularyHint,
    findRewindStart,
    chooseVoice,
    stableId
  };
});

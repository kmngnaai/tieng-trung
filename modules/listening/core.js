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


  function layoutTokens(value) {
    let unitIndex = 0;
    return Array.from(String(value || '')).map((char) => {
      if (char === '\n') return { type: 'break', char };
      if (UNIT_RE.test(char) && !PUNCTUATION_RE.test(char)) {
        return { type: 'slot', char, unitIndex: unitIndex++ };
      }
      if (/\s/u.test(char)) return { type: 'space', char };
      return { type: 'punctuation', char };
    });
  }

  function createPassageItem(items, options) {
    const sourceItems = toArray(items).filter((item) => item && containsHan(item.text));
    if (!sourceItems.length) return null;
    const configured = options || {};
    const segments = sourceItems.map((item, index) => ({
      id: String(item.id || `segment-${index + 1}`),
      text: normalizeText(item.text),
      pinyin: String(item.pinyin || ''),
      meaning: String(item.meaning || ''),
      speaker: String(item.speaker || ''),
      sourceType: item.sourceType || '',
      sourceId: item.sourceId || '',
      lessonId: item.lessonId || ''
    }));
    const speechText = segments.map((segment) => segment.text).join(' ');
    const text = segments.map((segment) => segment.text).join('\n');
    return {
      id: stableId(`${configured.sourceId || ''}|${speechText}`, 'passage'),
      text,
      speechText,
      pinyin: segments.map((segment) => segment.pinyin).filter(Boolean).join(' '),
      meaning: segments.map((segment) => segment.meaning).filter(Boolean).join(' '),
      sourceType: configured.sourceType || sourceItems[0].sourceType || 'passage',
      sourceId: configured.sourceId || sourceItems[0].sourceId || '',
      sourceTitle: configured.sourceTitle || sourceItems[0].sourceTitle || '',
      lessonId: configured.lessonId || sourceItems[0].lessonId || '',
      lessonTitle: configured.lessonTitle || sourceItems[0].lessonTitle || '',
      isPassage: true,
      segments
    };
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

  function isCompleteDictation(input, target) {
    const expected = answerUnits(target);
    const actual = answerUnits(input);
    return expected.length > 0 && actual.length === expected.length;
  }

  function deriveAutomaticRating(meta) {
    const value = meta || {};
    if (value.usedHint || value.viewedAnswer) return 'hard';
    if (Number(value.wrongChecks || 0) > 0) return 'review';
    return 'easy';
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
    let text = firstString(object, ['zh', 'text', 'chinese', 'hanzi', 'sentence', 'front', 'term', 'word']);
    let speaker = firstString(object, ['speaker_zh', 'speaker', 'speakerName']);
    if (!speaker) {
      const match = text.match(/^(男|女|旁白|老师|學生|学生|妈妈|爸爸|甲|乙|A|B|C)[：:]\s*/u);
      if (match) {
        speaker = match[1];
        text = text.slice(match[0].length);
      }
    }
    if (!containsHan(text)) return null;
    if (object.listenEnabled === false || object.listeningEnabled === false || object.excludeFromListening === true) return null;

    const source = context || {};
    return {
      id: String(object.id || stableId(`${source.sourceId || ''}|${text}`, 'listen')),
      text: normalizeText(text),
      pinyin: firstString(object, ['pinyin', 'pronunciation', 'romanization']),
      meaning: firstString(object, ['vi', 'meaning', 'translation', 'back', 'definition']),
      speaker,
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

  const PINYIN_SYLLABLES = new Set(`
    a ai an ang ao ba bai ban bang bao bei ben beng bi bian biao bie bin bing bo bu
    ca cai can cang cao ce cen ceng ci cong cou cu cuan cui cun cuo
    cha chai chan chang chao che chen cheng chi chong chou chu chua chuai chuan chuang chui chun chuo
    da dai dan dang dao de dei den deng di dia dian diao die ding diu dong dou du duan dui dun duo
    e ei en eng er fa fan fang fei fen feng fo fou fu
    ga gai gan gang gao ge gei gen geng gong gou gu gua guai guan guang gui gun guo
    ha hai han hang hao he hei hen heng hong hou hu hua huai huan huang hui hun huo
    ji jia jian jiang jiao jie jin jing jiong jiu ju juan jue jun
    ka kai kan kang kao ke ken keng kong kou ku kua kuai kuan kuang kui kun kuo
    la lai lan lang lao le lei leng li lia lian liang liao lie lin ling liu long lou lu lv luan lve lun luo
    ma mai man mang mao me mei men meng mi mian miao mie min ming miu mo mou mu
    na nai nan nang nao ne nei nen neng ni nian niang niao nie nin ning niu nong nou nu nv nuan nve nun nuo
    o ou pa pai pan pang pao pei pen peng pi pian piao pie pin ping po pou pu
    qi qia qian qiang qiao qie qin qing qiong qiu qu quan que qun
    ran rang rao re ren reng ri rong rou ru rua ruan rui run ruo
    sa sai san sang sao se sen seng sha shai shan shang shao she shei shen sheng shi shou shu shua shuai shuan shuang shui shun shuo
    si song sou su suan sui sun suo
    ta tai tan tang tao te teng ti tian tiao tie ting tong tou tu tuan tui tun tuo
    wa wai wan wang wei wen weng wo wu
    xi xia xian xiang xiao xie xin xing xiong xiu xu xuan xue xun
    ya yan yang yao ye yi yin ying yo yong you yu yuan yue yun
    za zai zan zang zao ze zei zen zeng zha zhai zhan zhang zhao zhe zhei zhen zheng zhi zhong zhou
    zhu zhua zhuai zhuan zhuang zhui zhun zhuo zi zong zou zu zuan zui zun zuo
    hm hng m n ng
  `.trim().split(/\s+/));

  function tokenizePinyin(value) {
    const normalized = String(value || '')
      .replace(/[，。！？；、,.!?;:：“”‘’（）()\[\]《》〈〉【】]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return normalized ? normalized.split(' ') : [];
  }

  function normalizePinyin(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/u:/g, 'v')
      .replace(/ü/g, 'v')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zv]/g, '');
  }

  function cleanPinyinToken(value) {
    return String(value || '').replace(/[^\p{L}:]/gu, '');
  }

  function enumeratePinyinSplits(token) {
    const source = Array.from(cleanPinyinToken(token));
    const results = [];
    const seen = new Set();

    function walk(position, parts) {
      if (results.length >= 80 || parts.length > 8) return;
      if (position === source.length) {
        const key = parts.join('|');
        if (!seen.has(key)) {
          seen.add(key);
          results.push(parts.slice());
        }
        return;
      }
      const maxEnd = Math.min(source.length, position + 7);
      for (let end = maxEnd; end > position; end -= 1) {
        const display = source.slice(position, end).join('');
        if (!PINYIN_SYLLABLES.has(normalizePinyin(display))) continue;
        parts.push(display);
        walk(end, parts);
        parts.pop();
      }
    }

    walk(0, []);
    if (!results.length && source.length) results.push([source.join('')]);
    return results.sort((a, b) => a.length - b.length || b.join('').length - a.join('').length);
  }

  function alignPinyinToText(item) {
    const units = answerUnits(item && item.text);
    const tokens = tokenizePinyin(item && item.pinyin);
    if (!units.length || !tokens.length) return { syllables: [], groups: [] };

    const options = tokens.map(enumeratePinyinSplits);
    const memo = new Map();

    function solve(tokenIndex, used) {
      const key = `${tokenIndex}:${used}`;
      if (memo.has(key)) return memo.get(key);
      if (tokenIndex === options.length) return used === units.length ? [] : null;
      for (const split of options[tokenIndex]) {
        const nextUsed = used + split.length;
        if (nextUsed > units.length) continue;
        const tail = solve(tokenIndex + 1, nextUsed);
        if (tail) {
          const result = [split].concat(tail);
          memo.set(key, result);
          return result;
        }
      }
      memo.set(key, null);
      return null;
    }

    const selected = solve(0, 0);
    if (!selected) {
      if (tokens.length >= units.length && tokens.length - units.length <= 1) {
        const direct = tokens.slice(0, units.length);
        const oneSyllableEach = direct.every((token) => enumeratePinyinSplits(token).some((split) => split.length === 1));
        if (oneSyllableEach) {
          return {
            syllables: direct,
            groups: direct.map((token, index) => ({ start: index, end: index + 1, pinyin: token, syllables: [token] }))
          };
        }
      }
      return { syllables: [], groups: [] };
    }

    const syllables = [];
    const groups = [];
    let offset = 0;
    selected.forEach((split, tokenIndex) => {
      const start = offset;
      split.forEach((syllable) => syllables.push(syllable));
      offset += split.length;
      groups.push({ start, end: offset, pinyin: tokens[tokenIndex], syllables: split.slice() });
    });
    return { syllables, groups };
  }

  function getCharacterPinyin(item, index) {
    if (item && item.isPassage && Array.isArray(item.segments)) {
      let offset = 0;
      for (const segment of item.segments) {
        const length = answerUnits(segment.text).length;
        if (index >= offset && index < offset + length) return getCharacterPinyin(segment, index - offset);
        offset += length;
      }
      return '';
    }
    const alignment = alignPinyinToText(item);
    return alignment.syllables[index] || '';
  }

  function findVocabularyHint(item, index, vocabulary) {
    const units = answerUnits(item && item.text);
    const char = units[index] || '';
    if (!char) return null;
    const text = units.join('');
    const candidates = [];
    toArray(vocabulary)
      .map((entry) => normalizeItem(entry, {}))
      .filter(Boolean)
      .forEach((entry) => {
        const word = answerUnits(entry.text).join('');
        if (word.length <= 1 || !word.includes(char)) return;
        let start = text.indexOf(word);
        while (start >= 0) {
          const end = start + word.length;
          if (index >= start && index < end) {
            candidates.push(Object.assign({}, entry, { matchStart: start, matchEnd: end }));
            break;
          }
          start = text.indexOf(word, start + 1);
        }
      });
    candidates.sort((a, b) => {
      const aLen = answerUnits(a.text).length;
      const bLen = answerUnits(b.text).length;
      if (aLen !== bLen) return bLen - aLen;
      return a.matchStart - b.matchStart;
    });
    return candidates[0] || null;
  }

  function findSegmentedWordHint(item, index, alignment) {
    const units = answerUnits(item && item.text);
    const text = units.join('');
    if (!text || index < 0 || index >= units.length) return null;

    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
      try {
        const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
        for (const part of segmenter.segment(text)) {
          const wordUnits = answerUnits(part.segment);
          const start = Array.from(text.slice(0, part.index)).length;
          const end = start + wordUnits.length;
          if (wordUnits.length > 1 && index >= start && index < end) {
            return {
              text: wordUnits.join(''),
              pinyin: alignment.syllables.slice(start, end).join(' '),
              meaning: '',
              matchStart: start,
              matchEnd: end
            };
          }
        }
      } catch (error) {
        // Segmenter is only a fallback; ignore unsupported runtimes.
      }
    }

    const pinyinGroup = alignment.groups.find((group) => group.end - group.start > 1 && index >= group.start && index < group.end);
    if (!pinyinGroup) return null;
    return {
      text: units.slice(pinyinGroup.start, pinyinGroup.end).join(''),
      pinyin: pinyinGroup.syllables.join(' '),
      meaning: '',
      matchStart: pinyinGroup.start,
      matchEnd: pinyinGroup.end
    };
  }

  function buildHint(item, index, vocabulary) {
    if (!item) return null;
    if (item.isPassage && Array.isArray(item.segments)) {
      let offset = 0;
      for (const segment of item.segments) {
        const length = answerUnits(segment.text).length;
        if (index >= offset && index < offset + length) {
          const local = buildHint(segment, index - offset, vocabulary);
          if (!local) return null;
          const word = local.word ? Object.assign({}, local.word, {
            matchStart: Number(local.word.matchStart || 0) + offset,
            matchEnd: Number(local.word.matchEnd || 0) + offset
          }) : null;
          return Object.assign({}, local, { index, word });
        }
        offset += length;
      }
      return null;
    }

    const units = answerUnits(item.text);
    if (!units.length) return null;
    const safeIndex = Math.max(0, Math.min(Number(index) || 0, units.length - 1));
    const alignment = alignPinyinToText(item);
    let word = findVocabularyHint(item, safeIndex, vocabulary);
    if (word) {
      const wordUnits = answerUnits(word.text);
      const wordAlignment = alignPinyinToText(word);
      word = Object.assign({}, word, {
        text: wordUnits.join(''),
        pinyin: word.pinyin || wordAlignment.syllables.join(' ') || alignment.syllables.slice(word.matchStart, word.matchEnd).join(' ')
      });
    } else {
      word = findSegmentedWordHint(item, safeIndex, alignment);
    }

    return {
      index: safeIndex,
      char: units[safeIndex] || '',
      pinyin: alignment.syllables[safeIndex] || '',
      word
    };
  }

  function extractVocabularyItems(data) {
    const roots = [];
    ['vocabulary', 'words', 'word_list', 'new_words'].forEach((key) => {
      if (data && data[key]) roots.push(data[key]);
    });
    const found = [];
    const visited = new Set();

    function walk(value, depth) {
      if (depth > 8 || value === null || value === undefined || typeof value !== 'object') return;
      if (visited.has(value)) return;
      visited.add(value);
      if (Array.isArray(value)) {
        value.forEach((entry) => walk(entry, depth + 1));
        return;
      }
      const item = normalizeItem(value, { sourceType: 'vocabulary' });
      if (item) found.push(item);
      Object.values(value).forEach((entry) => walk(entry, depth + 1));
    }

    roots.forEach((root) => walk(root, 0));
    return dedupeItems(found);
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

  function normalizeDelaySeconds(value, maxSeconds) {
    const parsed = Number(String(value ?? '').trim().replace(',', '.'));
    if (!Number.isFinite(parsed)) return null;
    const limit = Number.isFinite(Number(maxSeconds)) ? Math.max(0, Number(maxSeconds)) : 60;
    return Math.min(limit, Math.max(0, Math.round(parsed * 10) / 10));
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
    layoutTokens,
    createPassageItem,
    compareAnswers,
    isCompleteDictation,
    deriveAutomaticRating,
    containsHan,
    normalizeItem,
    extract301Items,
    extractCustomItems,
    tokenizePinyin,
    alignPinyinToText,
    getCharacterPinyin,
    findVocabularyHint,
    buildHint,
    extractVocabularyItems,
    findRewindStart,
    normalizeDelaySeconds,
    chooseVoice,
    stableId
  };
});

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TiengTrungImportCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LISTENING_FORMAT = 'tieng-trung-listening-import-v1';
  const FLASHCARD_FORMAT = 'tieng-trung-flashcard-import-v1';
  const HAN_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u;
  const PUNCT_RE = /[\s\u3000，,。.!！?？；;：:“”"'‘’—–\-（）()【】\[\]]/gu;
  const GUIDE_SHEET_RE = /^(00|0)[-_ ]*(huong[_ -]?dan|guide|instructions?)/i;

  const HEADER_ALIASES = Object.freeze({
    type: 'row_type', rowtype: 'row_type', loai: 'row_type', loai_dong: 'row_type',
    library_group: 'library_group_id', library_group_id: 'library_group_id', group_id: 'library_group_id', nhom_id: 'library_group_id',
    library_group_name: 'library_group_name', group_name: 'library_group_name', ten_nhom: 'library_group_name',
    deck: 'deck_id', deck_id: 'deck_id', bo_id: 'deck_id',
    deck_name: 'deck_name', ten_bo: 'deck_name',
    deck_description: 'deck_description', description: 'deck_description', mo_ta: 'deck_description',
    content_group: 'content_group_id', content_group_id: 'content_group_id', conversation_id: 'content_group_id', dialogue_id: 'content_group_id', passage_id: 'content_group_id',
    content_group_title: 'content_group_title', group_title: 'content_group_title', dialogue_title: 'content_group_title', passage_title: 'content_group_title',
    order: 'order', thu_tu: 'order', index: 'order',
    speaker: 'speaker', nguoi_noi: 'speaker', role: 'speaker',
    hanzi: 'hanzi', word: 'hanzi', text: 'hanzi', chinese: 'hanzi', chu_han: 'hanzi',
    pinyin: 'pinyin', py: 'pinyin',
    meaning: 'meaning', meaning_vi: 'meaning', meaningvi: 'meaning', vietnamese: 'meaning', nghia: 'meaning', nghia_viet: 'meaning',
    word_type: 'word_type', loai_tu: 'word_type',
    sentence_type: 'sentence_type', loai_cau: 'sentence_type',
    tokens: 'tokens', token: 'tokens', cum_tu: 'tokens',
    tags: 'tags', tag: 'tags', nhan: 'tags',
    enabled: 'enabled', active: 'enabled', su_dung: 'enabled',
    card_id: 'card_id', the_id: 'card_id'
  });

  const ROW_TYPE_ALIASES = Object.freeze({
    group: 'group', nhom: 'group',
    deck: 'deck', bo: 'deck',
    word: 'word', vocabulary: 'word', tu: 'word', tu_vung: 'word',
    sentence: 'sentence', cau: 'sentence',
    dialogue_turn: 'dialogue_turn', dialogue: 'dialogue_turn', hoi_thoai: 'dialogue_turn', luot_thoai: 'dialogue_turn',
    passage_sentence: 'passage_sentence', passage: 'passage_sentence', doan_van: 'passage_sentence', cau_doan: 'passage_sentence',
    card: 'card', the: 'card'
  });

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function clean(value) {
    return String(value == null ? '' : value).replace(/^\uFEFF/, '').trim();
  }

  function containsHan(value) {
    return HAN_RE.test(clean(value));
  }

  function slug(value, fallback = 'item') {
    const normalized = clean(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\u3400-\u9fff]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72);
    return normalized || fallback;
  }

  function stableId(value, prefix = 'id') {
    let hash = 2166136261;
    const text = String(value || '');
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `${prefix}-${(hash >>> 0).toString(36)}`;
  }

  function normalizeHeader(value) {
    const key = clean(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return HEADER_ALIASES[key] || key;
  }

  function normalizeRowType(value, fallback = '') {
    const key = clean(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return ROW_TYPE_ALIASES[key] || key || fallback;
  }

  function parseBoolean(value, fallback = true) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const text = clean(value).toLowerCase();
    if (['0', 'false', 'no', 'n', 'off', 'khong', 'không', 'tat', 'tắt'].includes(text)) return false;
    if (['1', 'true', 'yes', 'y', 'on', 'co', 'có', 'bat', 'bật'].includes(text)) return true;
    return fallback;
  }

  function splitList(value) {
    if (Array.isArray(value)) return value.map(clean).filter(Boolean);
    return clean(value).split(/[|;,]/).map(clean).filter(Boolean);
  }

  function answerText(value) {
    return clean(value).replace(PUNCT_RE, '');
  }

  function tokensFor(text, explicit) {
    const answer = answerText(text);
    if (!answer) return [];
    const listed = splitList(explicit);
    if (listed.length && listed.join('') === answer) return listed.map((token, index) => ({ id: `token-${index + 1}`, text: token }));
    return Array.from(answer).map((token, index) => ({ id: `token-${index + 1}`, text: token }));
  }

  function parseDelimited(text, delimiter) {
    const source = String(text || '').replace(/^\uFEFF/, '');
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (quoted) {
        if (char === '"' && source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else if (char === '"') quoted = false;
        else cell += char;
        continue;
      }
      if (char === '"') quoted = true;
      else if (char === delimiter) {
        row.push(cell);
        cell = '';
      } else if (char === '\n') {
        row.push(cell.replace(/\r$/, ''));
        rows.push(row);
        row = [];
        cell = '';
      } else cell += char;
    }
    row.push(cell.replace(/\r$/, ''));
    if (row.some((value) => clean(value))) rows.push(row);
    return rows;
  }

  function detectDelimiter(text, extension) {
    if (extension === 'txt' && String(text).includes('\t')) return '\t';
    const first = String(text || '').split(/\r?\n/).find((line) => clean(line)) || '';
    const counts = [',', ';', '\t'].map((delimiter) => ({ delimiter, count: first.split(delimiter).length - 1 }));
    counts.sort((left, right) => right.count - left.count);
    return counts[0].count > 0 ? counts[0].delimiter : '|';
  }

  function objectsFromMatrix(matrix) {
    const rows = Array.isArray(matrix) ? matrix : [];
    const headerIndex = rows.findIndex((row) => Array.isArray(row) && row.some((value) => clean(value)));
    if (headerIndex < 0) return [];
    const headers = rows[headerIndex].map(normalizeHeader);
    return rows.slice(headerIndex + 1).map((row, rowIndex) => {
      const item = { __row: headerIndex + rowIndex + 2 };
      headers.forEach((header, index) => {
        if (header) item[header] = row[index] == null ? '' : row[index];
      });
      return item;
    }).filter((row) => Object.entries(row).some(([key, value]) => key !== '__row' && clean(value)));
  }

  async function parseXlsx(arrayBuffer) {
    if (!globalThis.JSZip) throw new Error('Thiếu thư viện JSZip để đọc XLSX.');
    const zip = await globalThis.JSZip.loadAsync(arrayBuffer);
    const xmlText = async (path) => {
      const entry = zip.file(path);
      return entry ? entry.async('text') : '';
    };
    const parseXml = (text) => new DOMParser().parseFromString(text, 'application/xml');
    const sharedXml = await xmlText('xl/sharedStrings.xml');
    const shared = [];
    if (sharedXml) {
      parseXml(sharedXml).querySelectorAll('si').forEach((node) => {
        shared.push(Array.from(node.querySelectorAll('t')).map((entry) => entry.textContent || '').join(''));
      });
    }
    const workbookXml = await xmlText('xl/workbook.xml');
    if (!workbookXml) throw new Error('XLSX thiếu xl/workbook.xml.');
    const workbook = parseXml(workbookXml);
    const relsXml = await xmlText('xl/_rels/workbook.xml.rels');
    const rels = new Map();
    if (relsXml) {
      parseXml(relsXml).querySelectorAll('Relationship').forEach((node) => {
        rels.set(node.getAttribute('Id'), node.getAttribute('Target'));
      });
    }
    const columnIndex = (ref) => {
      const letters = String(ref || '').replace(/[^A-Z]/gi, '').toUpperCase();
      let result = 0;
      for (const letter of letters) result = result * 26 + letter.charCodeAt(0) - 64;
      return Math.max(0, result - 1);
    };
    const sheets = [];
    for (const sheetNode of Array.from(workbook.querySelectorAll('sheet'))) {
      const name = sheetNode.getAttribute('name') || `Sheet${sheets.length + 1}`;
      const relId = sheetNode.getAttribute('r:id') || sheetNode.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      let target = rels.get(relId) || `worksheets/sheet${sheets.length + 1}.xml`;
      target = target.replace(/^\//, '');
      if (!target.startsWith('xl/')) target = `xl/${target.replace(/^\.\//, '')}`;
      target = target.replace(/xl\/worksheets\/\.\.\//, 'xl/');
      const sheetXml = await xmlText(target);
      if (!sheetXml) continue;
      const matrix = [];
      parseXml(sheetXml).querySelectorAll('sheetData row').forEach((rowNode) => {
        const rowIndex = Math.max(0, Number(rowNode.getAttribute('r') || matrix.length + 1) - 1);
        const row = matrix[rowIndex] || [];
        rowNode.querySelectorAll('c').forEach((cellNode) => {
          const index = columnIndex(cellNode.getAttribute('r'));
          const type = cellNode.getAttribute('t') || '';
          let value = '';
          if (type === 'inlineStr') value = Array.from(cellNode.querySelectorAll('is t')).map((node) => node.textContent || '').join('');
          else {
            const raw = cellNode.querySelector('v')?.textContent || '';
            if (type === 's') value = shared[Number(raw)] ?? '';
            else if (type === 'b') value = raw === '1';
            else value = raw;
          }
          row[index] = value;
        });
        matrix[rowIndex] = row;
      });
      sheets.push({ name, matrix, rows: objectsFromMatrix(matrix) });
    }
    return sheets;
  }

  async function readFile(file, options = {}) {
    if (!file) throw new Error('Chưa chọn file.');
    const fileName = clean(file.name || 'du-lieu');
    const extension = (fileName.split('.').pop() || '').toLowerCase();
    if (extension === 'json') {
      let data;
      try { data = JSON.parse(await file.text()); }
      catch (error) { throw new Error(`JSON không hợp lệ: ${error.message}`); }
      return { format: 'json', fileName, extension, data, sheets: [] };
    }
    if (extension === 'xlsx') {
      const sheets = await parseXlsx(await file.arrayBuffer());
      return { format: 'xlsx', fileName, extension, data: null, sheets };
    }
    if (!['csv', 'txt', 'tsv'].includes(extension)) throw new Error('Chỉ hỗ trợ JSON, XLSX, CSV và TXT.');
    const text = await file.text();
    if (extension === 'txt' && options.simpleText === 'flashcard' && !text.includes('\t') && !/\brow[_ ]?type\b/i.test(text)) {
      const matrix = [['row_type', 'hanzi', 'pinyin', 'meaning']];
      text.split(/\r?\n/).map(clean).filter(Boolean).forEach((line) => {
        const parts = line.split('|').map(clean);
        matrix.push(['card', parts[0] || '', parts[1] || '', parts.slice(2).join(' | ') || '']);
      });
      return { format: 'txt', fileName, extension, data: null, sheets: [{ name: 'TXT', matrix, rows: objectsFromMatrix(matrix) }] };
    }
    const delimiter = detectDelimiter(text, extension);
    const matrix = parseDelimited(text, delimiter);
    return { format: extension, fileName, extension, delimiter, data: null, sheets: [{ name: extension.toUpperCase(), matrix, rows: objectsFromMatrix(matrix) }] };
  }

  function tableRows(parsed) {
    return (parsed.sheets || [])
      .filter((sheet) => !GUIDE_SHEET_RE.test(clean(sheet.name)))
      .flatMap((sheet) => (sheet.rows || []).map((row) => ({ ...row, __sheet: sheet.name })));
  }

  function canonicalSentence(rows, row, deckId, sentenceMap, warnings) {
    const text = clean(row.hanzi);
    if (!containsHan(text)) return null;
    const key = answerText(text);
    let sentence = sentenceMap.get(key);
    if (!sentence) {
      sentence = {
        id: clean(row.card_id) || stableId(`${deckId}|sentence|${key}`, 'custom-sentence'),
        text,
        hanzi: text,
        pinyin: clean(row.pinyin),
        meaning: clean(row.meaning),
        tokens: tokensFor(text, row.tokens),
        sentenceType: clean(row.sentence_type) || normalizeRowType(row.row_type) || 'custom',
        originType: 'source',
        sourceType: 'custom-sentence',
        sourceId: deckId,
        sourceTitle: clean(row.deck_name),
        lessonId: deckId,
        tags: splitList(row.tags),
        listenEnabled: parseBoolean(row.enabled, true),
        origin: { file: clean(row.__file), sheet: clean(row.__sheet), row: Number(row.__row || 0) }
      };
      sentenceMap.set(key, sentence);
      rows.push(sentence);
    } else {
      if (!sentence.pinyin && clean(row.pinyin)) sentence.pinyin = clean(row.pinyin);
      if (!sentence.meaning && clean(row.meaning)) sentence.meaning = clean(row.meaning);
      sentence.tags = Array.from(new Set(sentence.tags.concat(splitList(row.tags))));
    }
    if (!sentence.pinyin) warnings.push(`Câu “${text}” thiếu pinyin.`);
    if (!sentence.meaning) warnings.push(`Câu “${text}” thiếu nghĩa.`);
    return sentence;
  }

  function buildCapabilities(dataset) {
    const words = dataset.words || [];
    const sentences = dataset.sentences || [];
    const groups = dataset.groups || [];
    const dialogues = groups.filter((group) => group.kind === 'dialogue');
    const passages = groups.filter((group) => group.kind === 'passage');
    return {
      wordChoice: words.length >= 2,
      wordTyping: words.length > 0,
      sentenceDictation: sentences.length > 0,
      sentenceTranscript: sentences.length > 0,
      sentenceOrdering: sentences.some((sentence) => (sentence.tokens || []).length >= 3),
      dialogueTurnOrdering: dialogues.some((group) => group.items.length >= 2),
      dialogueSentenceOrdering: dialogues.some((group) => group.items.some((item) => (item.tokens || []).length >= 3)),
      dialogueDictation: dialogues.some((group) => group.items.length >= 2),
      dialogueFullDictation: dialogues.some((group) => group.items.length >= 2),
      passageSentenceOrdering: passages.some((group) => group.items.length >= 2),
      passageSentenceTokenOrdering: passages.some((group) => group.items.some((item) => (item.tokens || []).length >= 3)),
      passageDictation: passages.some((group) => group.items.length >= 2),
      passageFullDictation: passages.some((group) => group.items.length >= 2)
    };
  }

  function finalizeListeningDataset(dataset) {
    const dialogues = dataset.groups.filter((group) => group.kind === 'dialogue');
    const passages = dataset.groups.filter((group) => group.kind === 'passage');
    dataset.grammar = Array.isArray(dataset.grammar) ? dataset.grammar : [];
    dataset.diagnostics = Array.isArray(dataset.diagnostics) ? dataset.diagnostics : [];
    dataset.sentenceFilters = Array.isArray(dataset.sentenceFilters) && dataset.sentenceFilters.length
      ? dataset.sentenceFilters
      : [{ id: 'all', label: 'Toàn bộ', tag: '', description: `${dataset.sentences.length} câu` }];
    dataset.capabilities = buildCapabilities(dataset);
    dataset.stats = Object.assign({}, dataset.stats, {
      wordCount: dataset.words.length,
      sentenceCount: dataset.sentences.length,
      dialogueCount: dialogues.length,
      passageCount: passages.length,
      dialogueSentenceCount: dialogues.reduce((sum, group) => sum + group.items.length, 0),
      passageSentenceCount: passages.reduce((sum, group) => sum + group.items.length, 0),
      grammarExampleCount: 0,
      authoredSentenceCount: 0,
      vocabularyExampleCount: dataset.sentences.filter((sentence) => sentence.sentenceType === 'sentence').length
    });
    dataset.rules = Object.assign({ audio: 'import-or-device-tts', noGrammarSheet: true }, dataset.rules || {});
    return dataset;
  }

  function legacyDeckToDataset(raw, index = 0) {
    const name = clean(raw?.name || raw?.title || `Bộ ${index + 1}`);
    const deckId = clean(raw?.id) || `deck-${slug(name)}`;
    const cards = Array.isArray(raw?.cards) ? raw.cards : Array.isArray(raw?.items) ? raw.items : [];
    const sentences = cards.map((card, cardIndex) => {
      const text = clean(card?.word || card?.hanzi || card?.text || card);
      if (!containsHan(text)) return null;
      return {
        id: clean(card?.id) || stableId(`${deckId}|legacy|${cardIndex}|${text}`, 'custom-sentence'),
        text,
        hanzi: text,
        pinyin: clean(card?.pinyin),
        meaning: clean(card?.meaningVi || card?.meaning),
        tokens: tokensFor(text, card?.tokens),
        sentenceType: 'legacy-import',
        originType: 'source',
        sourceType: 'custom-sentence',
        sourceId: deckId,
        sourceTitle: name,
        lessonId: deckId,
        tags: ['legacy'],
        listenEnabled: card?.listenEnabled !== false,
        origin: { file: 'legacy', path: `cards[${cardIndex}]` }
      };
    }).filter(Boolean);
    return finalizeListeningDataset({
      schemaVersion: 1,
      source: { id: `custom:${deckId}`, curriculum: 'custom', levelId: 'custom', levelName: 'Bộ tự tạo' },
      unit: { id: deckId, sectionType: 'custom', sectionOrder: index + 1, title: name, titleZh: name, status: 'READY' },
      words: [], sentences, grammar: [], groups: [], diagnostics: [], sentenceFilters: [{ id: 'all', label: 'Toàn bộ', tag: '', description: `${sentences.length} câu cũ` }], rules: { migratedFromCards: true }
    });
  }

  function normalizeExistingListeningDeck(raw, index = 0) {
    const name = clean(raw?.name || raw?.title || `Bộ ${index + 1}`);
    const id = clean(raw?.id) || `deck-${slug(name)}`;
    let dataset = raw?.dataset && Number(raw.dataset.schemaVersion) === 1 ? clone(raw.dataset) : legacyDeckToDataset(raw, index);
    if (!dataset.source) dataset.source = { id: `custom:${id}`, curriculum: 'custom', levelId: 'custom', levelName: 'Bộ tự tạo' };
    if (!dataset.unit) dataset.unit = { id, sectionType: 'custom', sectionOrder: index + 1, title: name, titleZh: name, status: 'READY' };
    dataset.unit.id = id;
    dataset.unit.title = dataset.unit.title || name;
    dataset.unit.titleZh = dataset.unit.titleZh || name;
    finalizeListeningDataset(dataset);
    const cards = [];
    dataset.words.forEach((word) => cards.push({ id: word.id, kind: 'word', word: word.text, pinyin: word.pinyin || '', meaningVi: word.meaning || '', speaker: '', listenEnabled: word.listenEnabled !== false }));
    dataset.sentences.forEach((sentence) => cards.push({ id: sentence.id, kind: 'sentence', word: sentence.text, pinyin: sentence.pinyin || '', meaningVi: sentence.meaning || '', speaker: '', listenEnabled: sentence.listenEnabled !== false }));
    return {
      id, name, description: clean(raw?.description || raw?.summary),
      groupId: raw?.groupId == null ? null : clean(raw.groupId) || null,
      dataset, cards,
      createdAt: clean(raw?.createdAt) || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function buildListeningFromRows(rows, fileName) {
    const errors = [];
    const warnings = [];
    const groupsById = new Map();
    const deckMeta = new Map();
    const baseDeckId = `deck-${slug(fileName.replace(/\.[^.]+$/, ''), 'nhap-file')}`;
    rows.forEach((raw) => {
      const row = { ...raw, __file: fileName };
      const rowType = normalizeRowType(row.row_type);
      const groupId = clean(row.library_group_id);
      if (groupId) {
        const current = groupsById.get(groupId) || { id: groupId, name: clean(row.library_group_name) || groupId, description: '' };
        if (clean(row.library_group_name)) current.name = clean(row.library_group_name);
        groupsById.set(groupId, current);
      }
      const deckId = clean(row.deck_id) || baseDeckId;
      const current = deckMeta.get(deckId) || { id: deckId, name: clean(row.deck_name) || deckId, description: clean(row.deck_description), groupId: groupId || null, rows: [] };
      if (clean(row.deck_name)) current.name = clean(row.deck_name);
      if (clean(row.deck_description)) current.description = clean(row.deck_description);
      if (groupId) current.groupId = groupId;
      if (!['group', 'deck'].includes(rowType)) current.rows.push(row);
      deckMeta.set(deckId, current);
    });

    const decks = [];
    deckMeta.forEach((meta, deckIndex) => {
      const words = [];
      const sentences = [];
      const sentenceMap = new Map();
      const contentGroups = new Map();
      meta.rows.forEach((row, rowIndex) => {
        const rowType = normalizeRowType(row.row_type, 'sentence');
        const text = clean(row.hanzi);
        if (!containsHan(text)) {
          errors.push(`${meta.name}: dòng ${row.__row || rowIndex + 2} thiếu chữ Hán.`);
          return;
        }
        if (rowType === 'word') {
          const word = {
            id: clean(row.card_id) || stableId(`${meta.id}|word|${text}|${row.pinyin || ''}`, 'custom-word'),
            text, hanzi: text, pinyin: clean(row.pinyin), meaning: clean(row.meaning), wordType: clean(row.word_type),
            sourceType: 'custom-word', sourceId: meta.id, sourceTitle: meta.name, lessonId: meta.id,
            originType: 'source', tags: splitList(row.tags), listenEnabled: parseBoolean(row.enabled, true),
            origin: { file: fileName, sheet: clean(row.__sheet), row: Number(row.__row || 0) }
          };
          if (!word.pinyin) warnings.push(`Từ “${text}” thiếu pinyin.`);
          if (!word.meaning) warnings.push(`Từ “${text}” thiếu nghĩa.`);
          words.push(word);
          return;
        }
        const sentence = canonicalSentence(sentences, row, meta.id, sentenceMap, warnings);
        if (!sentence) return;
        if (rowType === 'dialogue_turn' || rowType === 'passage_sentence') {
          const kind = rowType === 'dialogue_turn' ? 'dialogue' : 'passage';
          const contentGroupId = clean(row.content_group_id) || `${meta.id}-${kind}-1`;
          const group = contentGroups.get(contentGroupId) || {
            id: contentGroupId, kind,
            title: clean(row.content_group_title) || (kind === 'dialogue' ? 'Hội thoại' : 'Đoạn văn'),
            originType: 'source', sourceType: 'custom-group', sourceId: meta.id, lessonId: meta.id, items: []
          };
          group.items.push({
            ...clone(sentence),
            id: `${contentGroupId}:item-${group.items.length + 1}`,
            canonicalSentenceId: sentence.id,
            speaker: kind === 'dialogue' ? clean(row.speaker) : '',
            groupId: contentGroupId,
            groupKind: kind,
            groupIndex: Number(row.order || group.items.length + 1) - 1,
            __order: Number(row.order || group.items.length + 1)
          });
          contentGroups.set(contentGroupId, group);
        }
      });
      const groups = [];
      contentGroups.forEach((group) => {
        group.items.sort((left, right) => left.__order - right.__order).forEach((item, index) => {
          delete item.__order;
          item.groupIndex = index;
        });
        if (group.items.length < 2) warnings.push(`${meta.name}: “${group.title}” chỉ có 1 dòng nên chỉ giữ dưới dạng câu.`);
        else groups.push(group);
      });
      const uniqueWords = Array.from(new Map(words.map((word) => [`${word.text}\u0000${word.pinyin}\u0000${word.meaning}`, word])).values());
      if (!uniqueWords.length && !sentences.length) return;
      const dataset = finalizeListeningDataset({
        schemaVersion: 1,
        source: { id: `custom:${meta.id}`, curriculum: 'custom', levelId: 'custom', levelName: 'Bộ tự tạo' },
        unit: { id: meta.id, sectionType: 'custom', sectionOrder: deckIndex + 1, title: meta.name, titleZh: meta.name, status: 'READY' },
        words: uniqueWords, sentences, grammar: [], groups, diagnostics: [],
        sentenceFilters: [{ id: 'all', label: 'Toàn bộ', tag: '', description: `${sentences.length} câu` }],
        rules: { importedFormat: LISTENING_FORMAT, noGrammarSheet: true }
      });
      decks.push(normalizeExistingListeningDeck({ id: meta.id, name: meta.name, description: meta.description, groupId: meta.groupId, dataset }, deckIndex));
    });
    if (!decks.length && !errors.length) errors.push('Không tìm thấy từ, câu, hội thoại hoặc đoạn văn có chữ Hán.');
    return {
      format: LISTENING_FORMAT,
      groups: Array.from(groupsById.values()),
      decks,
      errors: Array.from(new Set(errors)),
      warnings: Array.from(new Set(warnings)),
      stats: listeningStats(decks, groupsById.size)
    };
  }

  function listeningStats(decks, groupCount) {
    return decks.reduce((stats, deck) => {
      const dataset = deck.dataset || {};
      stats.wordCount += (dataset.words || []).length;
      stats.sentenceCount += (dataset.sentences || []).length;
      stats.dialogueCount += (dataset.groups || []).filter((group) => group.kind === 'dialogue').length;
      stats.passageCount += (dataset.groups || []).filter((group) => group.kind === 'passage').length;
      return stats;
    }, { groupCount: Number(groupCount || 0), deckCount: decks.length, wordCount: 0, sentenceCount: 0, dialogueCount: 0, passageCount: 0 });
  }

  function buildListeningImport(parsed) {
    if (parsed.format === 'json') {
      const data = parsed.data;
      if (data?.format === LISTENING_FORMAT && Array.isArray(data.rows)) return buildListeningFromRows(data.rows, parsed.fileName);
      if (data?.schemaVersion === 1 && data?.source && data?.unit) {
        const name = clean(data.unit.titleZh || data.unit.title || parsed.fileName.replace(/\.json$/i, ''));
        const deck = normalizeExistingListeningDeck({ id: clean(data.unit.id) || `deck-${slug(name)}`, name, dataset: data }, 0);
        return { format: LISTENING_FORMAT, groups: [], decks: [deck], errors: [], warnings: [], stats: listeningStats([deck], 0) };
      }
      const rawGroups = Array.isArray(data?.groups) ? data.groups : [];
      const rawDecks = Array.isArray(data) ? data : Array.isArray(data?.decks) ? data.decks : data?.deck ? [data.deck] : [];
      if (rawDecks.length) {
        const decks = rawDecks.map(normalizeExistingListeningDeck).filter((deck) => deck.dataset.words.length || deck.dataset.sentences.length);
        return { format: data?.type === 'tieng-trung-listening-library-backup' ? 'listening-backup' : LISTENING_FORMAT, groups: rawGroups.map((group, index) => ({ id: clean(group.id) || `group-${index + 1}`, name: clean(group.name || group.title) || `Nhóm ${index + 1}`, description: clean(group.description) })), decks, errors: decks.length ? [] : ['JSON không có dữ liệu Nghe hợp lệ.'], warnings: [], stats: listeningStats(decks, rawGroups.length) };
      }
      return buildListeningFromRows(Array.isArray(data?.rows) ? data.rows : [], parsed.fileName);
    }
    return buildListeningFromRows(tableRows(parsed), parsed.fileName);
  }

  function buildFlashcardFromRows(rows, fileName) {
    const errors = [];
    const warnings = [];
    const groupsById = new Map();
    const deckMeta = new Map();
    const baseDeckId = `deck-${slug(fileName.replace(/\.[^.]+$/, ''), 'nhap-file')}`;
    rows.forEach((raw) => {
      const row = { ...raw, __file: fileName };
      const rowType = normalizeRowType(row.row_type, 'card');
      const groupId = clean(row.library_group_id);
      if (groupId) {
        const group = groupsById.get(groupId) || { id: groupId, name: clean(row.library_group_name) || groupId, description: '' };
        if (clean(row.library_group_name)) group.name = clean(row.library_group_name);
        groupsById.set(groupId, group);
      }
      const deckId = clean(row.deck_id) || baseDeckId;
      const meta = deckMeta.get(deckId) || { id: deckId, name: clean(row.deck_name) || deckId, description: clean(row.deck_description), groupId: groupId || null, cards: [] };
      if (clean(row.deck_name)) meta.name = clean(row.deck_name);
      if (clean(row.deck_description)) meta.description = clean(row.deck_description);
      if (groupId) meta.groupId = groupId;
      if (!['group', 'deck'].includes(rowType)) {
        const word = clean(row.hanzi);
        if (!containsHan(word)) errors.push(`${meta.name}: dòng ${row.__row || '?'} thiếu chữ Hán.`);
        else meta.cards.push({ id: clean(row.card_id) || stableId(`${deckId}|card|${word}|${row.pinyin || ''}|${row.meaning || ''}`, 'card'), word, pinyin: clean(row.pinyin), meaningVi: clean(row.meaning) });
      }
      deckMeta.set(deckId, meta);
    });
    const decks = Array.from(deckMeta.values()).map((deck) => ({
      ...deck,
      cards: Array.from(new Map(deck.cards.map((card) => [`${card.word}\u0000${card.pinyin}\u0000${card.meaningVi}`, card])).values()),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    })).filter((deck) => deck.cards.length);
    if (!decks.length && !errors.length) errors.push('Không tìm thấy thẻ có chữ Hán.');
    if (decks.some((deck) => deck.cards.some((card) => !card.pinyin))) warnings.push('Một số thẻ thiếu pinyin.');
    if (decks.some((deck) => deck.cards.some((card) => !card.meaningVi))) warnings.push('Một số thẻ thiếu nghĩa.');
    return { format: FLASHCARD_FORMAT, groups: Array.from(groupsById.values()), decks, errors: Array.from(new Set(errors)), warnings: Array.from(new Set(warnings)), stats: { groupCount: groupsById.size, deckCount: decks.length, cardCount: decks.reduce((sum, deck) => sum + deck.cards.length, 0) } };
  }

  function buildFlashcardImport(parsed) {
    if (parsed.format === 'json') {
      const data = parsed.data;
      if (data?.format === FLASHCARD_FORMAT && Array.isArray(data.rows)) return buildFlashcardFromRows(data.rows, parsed.fileName);
      const rawDecks = Array.isArray(data) ? data : Array.isArray(data?.decks) ? data.decks : data?.deck ? [data.deck] : [];
      if (rawDecks.length || Array.isArray(data?.groups)) {
        const decks = rawDecks.map((raw, index) => ({
          id: clean(raw.id) || `deck-${index + 1}`,
          name: clean(raw.name || raw.title) || `Bộ ${index + 1}`,
          description: clean(raw.description), groupId: raw.groupId == null ? null : clean(raw.groupId) || null,
          cards: (Array.isArray(raw.cards) ? raw.cards : Array.isArray(raw.items) ? raw.items : []).map((card, cardIndex) => ({
            id: clean(card?.id) || `card-${index + 1}-${cardIndex + 1}`,
            word: clean(card?.word || card?.hanzi || card?.text || card), pinyin: clean(card?.pinyin), meaningVi: clean(card?.meaningVi || card?.meaning)
          })).filter((card) => containsHan(card.word)),
          createdAt: clean(raw.createdAt) || new Date().toISOString(), updatedAt: new Date().toISOString()
        })).filter((deck) => deck.cards.length);
        const groups = (Array.isArray(data?.groups) ? data.groups : []).map((group, index) => ({ id: clean(group.id) || `group-${index + 1}`, name: clean(group.name || group.title) || `Nhóm ${index + 1}`, description: clean(group.description) }));
        return { format: data?.type === 'hanzi-flashcard-backup' ? 'flashcard-backup' : FLASHCARD_FORMAT, groups, decks, results: data?.results || null, errors: decks.length || groups.length || data?.results ? [] : ['JSON không có dữ liệu Thẻ hợp lệ.'], warnings: [], stats: { groupCount: groups.length, deckCount: decks.length, cardCount: decks.reduce((sum, deck) => sum + deck.cards.length, 0) } };
      }
      return buildFlashcardFromRows(Array.isArray(data?.rows) ? data.rows : [], parsed.fileName);
    }
    return buildFlashcardFromRows(tableRows(parsed), parsed.fileName);
  }

  function prefixDataset(dataset, prefix) {
    const cloned = clone(dataset);
    const sentenceMap = new Map();
    cloned.words = (cloned.words || []).filter((item) => item.listenEnabled !== false).map((word) => ({ ...word, id: `${prefix}:${word.id}`, sourceId: prefix, lessonId: prefix }));
    cloned.sentences = (cloned.sentences || []).filter((item) => item.listenEnabled !== false).map((sentence) => {
      const next = { ...sentence, id: `${prefix}:${sentence.id}`, sourceId: prefix, lessonId: prefix };
      sentenceMap.set(sentence.id, next.id);
      return next;
    });
    cloned.groups = (cloned.groups || []).map((group) => ({
      ...group, id: `${prefix}:${group.id}`, sourceId: prefix, lessonId: prefix,
      items: (group.items || []).filter((item) => item.listenEnabled !== false && sentenceMap.has(item.canonicalSentenceId)).map((item, index) => ({ ...item, id: `${prefix}:${item.id}`, canonicalSentenceId: sentenceMap.get(item.canonicalSentenceId), groupId: `${prefix}:${group.id}`, groupIndex: index }))
    })).filter((group) => group.items.length >= 2);
    return cloned;
  }

  function mergeListeningDatasets(decks, context = {}) {
    const normalized = (decks || []).map((deck, index) => ({ deck, dataset: prefixDataset(normalizeExistingListeningDeck(deck, index).dataset, deck.id) }));
    const title = clean(context.title) || 'Học toàn nhóm';
    const dataset = finalizeListeningDataset({
      schemaVersion: 1,
      source: { id: `custom-group:${clean(context.id) || slug(title)}`, curriculum: 'custom', levelId: 'custom-group', levelName: 'Nhóm tự tạo' },
      unit: { id: clean(context.id) || `group-${slug(title)}`, sectionType: 'custom-group', sectionOrder: 1, title, titleZh: title, status: 'READY' },
      words: normalized.flatMap((entry) => entry.dataset.words),
      sentences: normalized.flatMap((entry) => entry.dataset.sentences),
      grammar: [], groups: normalized.flatMap((entry) => entry.dataset.groups), diagnostics: [],
      sentenceFilters: [{ id: 'all', label: 'Toàn bộ', tag: '', description: `${normalized.reduce((sum, entry) => sum + entry.dataset.sentences.length, 0)} câu` }],
      rules: { mergedLibraryGroup: true, deckCount: normalized.length }
    });
    return dataset;
  }

  function downloadText(text, fileName, mime = 'text/plain;charset=utf-8') {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return Object.freeze({
    LISTENING_FORMAT, FLASHCARD_FORMAT,
    clean, slug, stableId, containsHan, normalizeHeader, normalizeRowType, parseBoolean, splitList,
    parseDelimited, objectsFromMatrix, readFile, tableRows,
    buildListeningImport, buildFlashcardImport,
    normalizeExistingListeningDeck, legacyDeckToDataset, finalizeListeningDataset, mergeListeningDatasets,
    downloadText
  });
});

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

  const AI_PASTE_FORMAT = 'tieng-trung-ai-paste-v1';
  const AI_RESULT_FORMAT = 'tieng-trung-ai-result-v1';
  const AI_TYPES = Object.freeze(['vocabulary', 'sentence', 'grammar', 'dialogue', 'passage']);
  const AI_TYPE_LABELS = Object.freeze({ vocabulary: 'Từ vựng', sentence: 'Câu', grammar: 'Ngữ pháp', dialogue: 'Hội thoại', passage: 'Đoạn văn' });
  const PINYIN_TONE_RE = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜńňǹḿ]/iu;

  function uniqueStrings(values) {
    return Array.from(new Set((values || []).map(clean).filter(Boolean)));
  }

  function orderedStrings(values) {
    return (values || []).map(clean).filter(Boolean);
  }

  function jsonCandidateEnd(text, start) {
    const opener = text[start];
    if (opener !== '{' && opener !== '[') return -1;
    const stack = [opener];
    let quoted = false;
    let escaped = false;
    for (let index = start + 1; index < text.length; index += 1) {
      const char = text[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') { quoted = true; continue; }
      if (char === '{' || char === '[') stack.push(char);
      else if (char === '}' || char === ']') {
        const expected = char === '}' ? '{' : '[';
        if (stack[stack.length - 1] !== expected) return -1;
        stack.pop();
        if (!stack.length) return index + 1;
      }
    }
    return -1;
  }

  function extractJsonValues(text) {
    const source = String(text || '').replace(/^\uFEFF/, '');
    const values = [];
    const seen = new Set();
    const add = (value, raw, start, end) => {
      let key = '';
      try { key = JSON.stringify(value); } catch (_error) { return; }
      if (!key || seen.has(key)) return;
      seen.add(key);
      values.push({ value, raw, start, end });
    };
    const fenced = /```(?:json|javascript|js)?\s*([\s\S]*?)```/gi;
    let match;
    while ((match = fenced.exec(source))) {
      const raw = clean(match[1]);
      if (!raw) continue;
      try { add(JSON.parse(raw), raw, match.index, fenced.lastIndex); } catch (_error) { /* scanner below can recover nested JSON */ }
    }
    for (let index = 0; index < source.length; index += 1) {
      if (source[index] !== '{' && source[index] !== '[') continue;
      const end = jsonCandidateEnd(source, index);
      if (end < 0) continue;
      const raw = source.slice(index, end);
      try {
        add(JSON.parse(raw), raw, index, end);
        index = end - 1;
      } catch (_error) {
        // Continue scanning from the next character so a later valid JSON block can still be found.
      }
    }
    return values.sort((left, right) => left.start - right.start);
  }

  function normalizeAiType(value) {
    const type = clean(value).toLowerCase();
    const map = {
      vocabulary: 'vocabulary', word: 'vocabulary', words: 'vocabulary', tu_vung: 'vocabulary', 'từ vựng': 'vocabulary',
      sentence: 'sentence', sentences: 'sentence', cau: 'sentence', 'câu': 'sentence',
      grammar: 'grammar', grammars: 'grammar', ngu_phap: 'grammar', 'ngữ pháp': 'grammar',
      dialogue: 'dialogue', dialogues: 'dialogue', hoi_thoai: 'dialogue', 'hội thoại': 'dialogue',
      passage: 'passage', passages: 'passage', doan_van: 'passage', 'đoạn văn': 'passage'
    };
    return map[type] || '';
  }

  function inferAiType(value, expectedType) {
    const expected = normalizeAiType(expectedType);
    if (expected && expected !== 'auto') return expected;
    if (!value) return '';
    if (!Array.isArray(value) && typeof value === 'object') {
      const direct = normalizeAiType(value.type || value.content_type || value.kind);
      if (direct) return direct;
      if (value.pattern || value.explanation || value.examples) return 'grammar';
      if (Array.isArray(value.items)) {
        if (value.kind === 'dialogue' || value.items.some((item) => clean(item?.speaker))) return 'dialogue';
        if (value.kind === 'passage' || value.items.some((item) => item && item.order != null && !item.speaker)) return 'passage';
        return inferAiType(value.items, expectedType);
      }
    }
    const items = Array.isArray(value) ? value : [];
    const first = items.find((item) => item && typeof item === 'object');
    if (!first) return '';
    if (first.pattern || first.explanation || Array.isArray(first.examples)) return 'grammar';
    if (first.kind === 'dialogue' || clean(first.speaker)) return 'dialogue';
    if (first.kind === 'passage') return 'passage';
    if (Array.isArray(first.tokens) || Array.isArray(first.source_word_ids) || Array.isArray(first.grammar_ids)) return 'sentence';
    if (first.word_type != null || first.hanzi || first.word || first.text) return 'vocabulary';
    return '';
  }

  function aiRootItems(value, type) {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    if (value.format === AI_RESULT_FORMAT && Array.isArray(value.items)) return value.items;
    if (type === 'dialogue' || type === 'passage') {
      if ((value.kind === type || normalizeAiType(value.type) === type) && Array.isArray(value.items)) return [value];
    }
    return Array.isArray(value.items) ? value.items : [value];
  }

  function normalizeAiRefs(value) {
    return uniqueStrings(Array.isArray(value) ? value : splitList(value));
  }

  function normalizeAiVocabulary(raw, index) {
    const hanzi = clean(raw?.hanzi || raw?.word || raw?.text);
    return {
      id: clean(raw?.id) || stableId(`ai-word|${hanzi}|${raw?.pinyin || ''}`, 'ai-word'),
      hanzi,
      pinyin: clean(raw?.pinyin),
      meaning: clean(raw?.meaning || raw?.meaningVi || raw?.meaning_vi),
      word_type: clean(raw?.word_type || raw?.wordType),
      tags: uniqueStrings(Array.isArray(raw?.tags) ? raw.tags : splitList(raw?.tags)),
      __index: index
    };
  }

  function normalizeAiSentence(raw, index) {
    const hanzi = clean(raw?.hanzi || raw?.text || raw?.word);
    return {
      id: clean(raw?.id) || stableId(`ai-sentence|${hanzi}|${raw?.pinyin || ''}`, 'ai-sentence'),
      hanzi,
      pinyin: clean(raw?.pinyin),
      meaning: clean(raw?.meaning || raw?.meaningVi || raw?.meaning_vi),
      tokens: orderedStrings(Array.isArray(raw?.tokens) ? raw.tokens : splitList(raw?.tokens)),
      tags: uniqueStrings(Array.isArray(raw?.tags) ? raw.tags : splitList(raw?.tags)),
      source_word_ids: normalizeAiRefs(raw?.source_word_ids || raw?.sourceWordIds),
      grammar_ids: normalizeAiRefs(raw?.grammar_ids || raw?.grammarIds),
      __index: index
    };
  }

  function normalizeAiGrammar(raw, index) {
    const pattern = clean(raw?.pattern || raw?.title || raw?.topic);
    const id = clean(raw?.id) || stableId(`ai-grammar|${pattern}`, 'ai-grammar');
    return {
      id,
      topic: clean(raw?.topic),
      pattern,
      explanation: clean(raw?.explanation || raw?.meaning),
      tips: clean(raw?.tips),
      attentions: clean(raw?.attentions || raw?.attention || raw?.notes),
      examples: (Array.isArray(raw?.examples) ? raw.examples : []).map((example, exampleIndex) => {
        const sentence = normalizeAiSentence(example, exampleIndex);
        sentence.id = clean(example?.id) || `${id}-example-${exampleIndex + 1}`;
        sentence.grammar_ids = uniqueStrings(sentence.grammar_ids.concat(id));
        return sentence;
      }),
      __index: index
    };
  }

  function normalizeAiGroup(raw, type, index) {
    const title = clean(raw?.title || raw?.name) || AI_TYPE_LABELS[type];
    const id = clean(raw?.id) || stableId(`ai-${type}|${title}|${index}`, `ai-${type}`);
    return {
      id,
      title,
      kind: type,
      items: (Array.isArray(raw?.items) ? raw.items : []).map((item, itemIndex) => ({
        ...normalizeAiSentence(item, itemIndex),
        id: clean(item?.id) || `${id}-item-${itemIndex + 1}`,
        order: Number(item?.order) > 0 ? Number(item.order) : itemIndex + 1,
        speaker: type === 'dialogue' ? clean(item?.speaker) : ''
      })).sort((left, right) => left.order - right.order),
      __index: index
    };
  }

  function validateAiSentence(item, label, errors, warnings) {
    if (!containsHan(item.hanzi)) errors.push(`${label} thiếu chữ Hán.`);
    if (!item.pinyin) warnings.push(`${label} thiếu pinyin.`);
    else if (/[aeiouvü]/i.test(item.pinyin) && !PINYIN_TONE_RE.test(item.pinyin) && !/[1-5]/.test(item.pinyin)) warnings.push(`${label} có pinyin nhưng chưa thấy dấu thanh.`);
    if (!item.meaning) warnings.push(`${label} thiếu nghĩa tiếng Việt.`);
    if (item.tokens.length) {
      const joined = answerText(item.tokens.join(''));
      if (joined !== answerText(item.hanzi)) warnings.push(`${label} có tokens không khớp hoàn toàn với câu.`);
      if (item.tokens.some((token) => answerText(token).length >= Math.max(7, Math.ceil(answerText(item.hanzi).length * 0.75)))) warnings.push(`${label} có token quá dài; nên chia theo từ hoặc cụm ngữ pháp tự nhiên.`);
    } else if (answerText(item.hanzi).length >= 3) warnings.push(`${label} chưa có tokens để luyện xếp câu.`);
  }

  function makeAiBlock(type, value, sourceIndex, rootMeta = {}) {
    const errors = [];
    const warnings = [];
    let items = aiRootItems(value, type);
    if (type === 'vocabulary') items = items.map(normalizeAiVocabulary);
    else if (type === 'sentence') items = items.map(normalizeAiSentence);
    else if (type === 'grammar') items = items.map(normalizeAiGrammar);
    else items = items.map((item, index) => normalizeAiGroup(item, type, index));
    items = items.filter(Boolean);
    const ids = new Set();
    const texts = new Set();
    items.forEach((item, index) => {
      const label = `${AI_TYPE_LABELS[type]} ${index + 1}`;
      if (ids.has(item.id)) errors.push(`${label} trùng ID “${item.id}”.`);
      ids.add(item.id);
      if (type === 'vocabulary') {
        if (!containsHan(item.hanzi)) errors.push(`${label} thiếu chữ Hán.`);
        if (!item.pinyin) warnings.push(`${label} thiếu pinyin.`);
        if (!item.meaning) warnings.push(`${label} thiếu nghĩa tiếng Việt.`);
        const key = `${item.hanzi}\u0000${item.pinyin}\u0000${item.meaning}`;
        if (texts.has(key)) warnings.push(`${label} trùng hoàn toàn với mục khác.`);
        texts.add(key);
      } else if (type === 'sentence') {
        validateAiSentence(item, label, errors, warnings);
        const key = answerText(item.hanzi);
        if (texts.has(key)) warnings.push(`${label} trùng nội dung câu.`);
        texts.add(key);
      } else if (type === 'grammar') {
        if (!item.pattern) errors.push(`${label} thiếu pattern.`);
        if (!item.explanation) warnings.push(`${label} thiếu explanation.`);
        if (!item.examples.length) warnings.push(`${label} chưa có ví dụ.`);
        item.examples.forEach((example, exampleIndex) => validateAiSentence(example, `${label}, ví dụ ${exampleIndex + 1}`, errors, warnings));
      } else {
        if (!item.items.length) errors.push(`${label} không có câu/lượt.`);
        if (item.items.length < 2) warnings.push(`${label} chỉ có một câu nên chưa đủ tạo hoạt động ${AI_TYPE_LABELS[type].toLowerCase()}.`);
        item.items.forEach((sentence, sentenceIndex) => {
          if (type === 'dialogue' && !sentence.speaker) errors.push(`${label}, lượt ${sentenceIndex + 1} thiếu speaker.`);
          validateAiSentence(sentence, `${label}, ${type === 'dialogue' ? 'lượt' : 'câu'} ${sentenceIndex + 1}`, errors, warnings);
        });
      }
    });
    const root = value && !Array.isArray(value) && typeof value === 'object' ? value : {};
    return {
      id: `ai-block-${sourceIndex + 1}-${type}`,
      type,
      label: AI_TYPE_LABELS[type],
      title: clean(root.title || root.topic) || AI_TYPE_LABELS[type],
      level: clean(root.level || rootMeta.level),
      topic: clean(root.topic || rootMeta.topic),
      extra_words: Array.isArray(root.extra_words) ? clone(root.extra_words) : [],
      quality_notes: uniqueStrings(Array.isArray(root.quality_notes) ? root.quality_notes : []),
      items,
      errors: uniqueStrings(errors),
      warnings: uniqueStrings(warnings)
    };
  }

  function expandAiPackage(value) {
    if (!value || Array.isArray(value) || typeof value !== 'object') return [];
    const result = [];
    const aliases = {
      vocabulary: value.vocabulary || value.words,
      sentence: value.sentences,
      grammar: value.grammar || value.grammars,
      dialogue: value.dialogues,
      passage: value.passages
    };
    Object.entries(aliases).forEach(([type, items]) => {
      if (!items) return;
      const wrapped = { format: AI_RESULT_FORMAT, type, level: value.meta?.level || value.level, topic: value.meta?.title || value.topic, extra_words: value.extra_words || [], quality_notes: value.quality_notes || [], items: Array.isArray(items) ? items : [items] };
      result.push({ type, value: wrapped });
    });
    return result;
  }

  function aiBlockSentences(block) {
    if (block.type === 'sentence') return block.items || [];
    if (block.type === 'grammar') return (block.items || []).flatMap((item) => item.examples || []);
    if (block.type === 'dialogue' || block.type === 'passage') return (block.items || []).flatMap((item) => item.items || []);
    return [];
  }

  function extraWordLabel(entry) {
    if (typeof entry === 'string') return clean(entry);
    return clean(entry?.hanzi || entry?.word || entry?.text);
  }

  function applyAiCrossChecks(blocks) {
    const vocabularyIds = new Set(blocks.filter((block) => block.type === 'vocabulary').flatMap((block) => block.items || []).map((item) => item.id));
    const grammarIds = new Set(blocks.filter((block) => block.type === 'grammar').flatMap((block) => block.items || []).map((item) => item.id));
    const hasVocabulary = vocabularyIds.size > 0;
    blocks.forEach((block) => {
      const extras = (block.extra_words || []).map(extraWordLabel).filter(Boolean);
      if (extras.length) block.warnings.push(`Có ${extras.length} từ ngoài dữ liệu nguồn: ${extras.slice(0, 8).join(', ')}${extras.length > 8 ? '…' : ''}.`);
      const sentences = aiBlockSentences(block);
      if (!sentences.length) { block.warnings = uniqueStrings(block.warnings); return; }
      const missingWordRefs = new Set();
      const missingGrammarRefs = new Set();
      let noWordReferenceCount = 0;
      sentences.forEach((item) => {
        if (hasVocabulary && !(item.source_word_ids || []).length) noWordReferenceCount += 1;
        (item.source_word_ids || []).forEach((id) => { if (hasVocabulary && !vocabularyIds.has(id)) missingWordRefs.add(id); });
        (item.grammar_ids || []).forEach((id) => { if (grammarIds.size && !grammarIds.has(id)) missingGrammarRefs.add(id); });
      });
      if (noWordReferenceCount) block.warnings.push(`${noWordReferenceCount} câu/lượt chưa khai báo source_word_ids dù kết quả có khối Từ vựng.`);
      if (missingWordRefs.size) block.warnings.push(`source_word_ids không tồn tại trong khối Từ vựng: ${Array.from(missingWordRefs).slice(0, 10).join(', ')}.`);
      if (missingGrammarRefs.size) block.warnings.push(`grammar_ids không tồn tại trong khối Ngữ pháp: ${Array.from(missingGrammarRefs).slice(0, 10).join(', ')}.`);
      block.warnings = uniqueStrings(block.warnings);
    });
    return blocks;
  }

  function aiStats(blocks) {
    const stats = { blockCount: blocks.length, vocabularyCount: 0, sentenceCount: 0, grammarCount: 0, dialogueCount: 0, dialogueTurnCount: 0, passageCount: 0, passageSentenceCount: 0, errorCount: 0, warningCount: 0 };
    blocks.forEach((block) => {
      if (block.type === 'vocabulary') stats.vocabularyCount += block.items.length;
      else if (block.type === 'sentence') stats.sentenceCount += block.items.length;
      else if (block.type === 'grammar') stats.grammarCount += block.items.length;
      else if (block.type === 'dialogue') { stats.dialogueCount += block.items.length; stats.dialogueTurnCount += block.items.reduce((sum, group) => sum + group.items.length, 0); }
      else if (block.type === 'passage') { stats.passageCount += block.items.length; stats.passageSentenceCount += block.items.reduce((sum, group) => sum + group.items.length, 0); }
      stats.errorCount += block.errors.length;
      stats.warningCount += block.warnings.length + block.quality_notes.length;
    });
    return stats;
  }

  function parseAiPaste(text, options = {}) {
    const expectedType = normalizeAiType(options.expectedType);
    const values = extractJsonValues(text);
    const blocks = [];
    const ignored = [];
    values.forEach((entry, sourceIndex) => {
      const expanded = expandAiPackage(entry.value);
      if (expanded.length) {
        expanded.forEach((row) => blocks.push(makeAiBlock(row.type, row.value, blocks.length, entry.value.meta || {})));
        return;
      }
      const type = inferAiType(entry.value, expectedType);
      if (!type) { ignored.push(`Khối JSON ${sourceIndex + 1} không nhận diện được loại nội dung.`); return; }
      blocks.push(makeAiBlock(type, entry.value, blocks.length));
    });
    applyAiCrossChecks(blocks);
    const errors = [];
    if (!clean(text)) errors.push('Chưa dán kết quả AI.');
    else if (!values.length) errors.push('Không tìm thấy khối JSON hợp lệ trong nội dung đã dán.');
    else if (!blocks.length) errors.push('Có JSON nhưng không nhận diện được Từ vựng, Câu, Ngữ pháp, Hội thoại hoặc Đoạn văn.');
    return {
      format: AI_PASTE_FORMAT,
      expectedType: expectedType || 'auto',
      blocks,
      errors,
      warnings: ignored,
      stats: aiStats(blocks),
      sourceLength: String(text || '').length
    };
  }

  function selectedAiBlocks(analysis, selectedBlockIds) {
    const selected = selectedBlockIds instanceof Set ? selectedBlockIds : new Set(Array.isArray(selectedBlockIds) ? selectedBlockIds : []);
    const blocks = Array.isArray(analysis?.blocks) ? analysis.blocks : [];
    return selected.size ? blocks.filter((block) => selected.has(block.id)) : blocks.slice();
  }

  const AI_IMPORT_TYPE_META = Object.freeze({
    vocabulary: { label: 'Từ vựng', slug: 'tu-vung', description: 'Từ vựng tạo bằng AI và đã xem trước trong ứng dụng.' },
    sentence: { label: 'Câu', slug: 'cau', description: 'Câu luyện tập tạo bằng AI và đã xem trước trong ứng dụng.' },
    grammar: { label: 'Ngữ pháp', slug: 'ngu-phap', description: 'Ngữ pháp và câu ví dụ tạo bằng AI và đã xem trước trong ứng dụng.' },
    dialogue: { label: 'Hội thoại', slug: 'hoi-thoai', description: 'Hội thoại tạo bằng AI và đã xem trước trong ứng dụng.' },
    passage: { label: 'Đoạn văn', slug: 'doan-van', description: 'Đoạn văn tạo bằng AI và đã xem trước trong ứng dụng.' }
  });

  function aiDeckMeta(type, options = {}) {
    const title = clean(options.title) || 'Nội dung AI';
    const rootDeckId = clean(options.deckId) || `ai-${slug(title, 'noi-dung-ai')}`;
    const meta = AI_IMPORT_TYPE_META[type] || { label: 'Nội dung', slug: slug(type, 'noi-dung'), description: 'Nội dung tạo bằng AI và đã xem trước trong ứng dụng.' };
    if (options.splitByType === true) {
      return {
        id: `${rootDeckId}-${meta.slug}`,
        name: `${title} · ${meta.label}`,
        description: meta.description
      };
    }
    return {
      id: rootDeckId,
      name: title,
      description: clean(options.description) || 'Nội dung tạo bằng AI và đã xem trước trong ứng dụng.'
    };
  }

  function aiRows(blocks, options = {}) {
    const title = clean(options.title) || 'Nội dung AI';
    const groupId = clean(options.groupId);
    const groupName = clean(options.groupName);
    const rows = [];
    const baseFor = (type) => {
      const deck = aiDeckMeta(type, options);
      return {
        library_group_id: groupId,
        library_group_name: groupName,
        deck_id: deck.id,
        deck_name: deck.name,
        deck_description: deck.description
      };
    };
    blocks.forEach((block) => {
      const base = baseFor(block.type);
      if (block.type === 'vocabulary') block.items.forEach((item) => rows.push({ ...base, row_type: 'word', card_id: item.id, hanzi: item.hanzi, pinyin: item.pinyin, meaning: item.meaning, word_type: item.word_type, tags: item.tags.join('|') }));
      else if (block.type === 'sentence') block.items.forEach((item) => rows.push({ ...base, row_type: 'sentence', card_id: item.id, hanzi: item.hanzi, pinyin: item.pinyin, meaning: item.meaning, tokens: item.tokens.join('|'), tags: uniqueStrings(item.tags.concat(item.source_word_ids.map((id) => `source:${id}`), item.grammar_ids.map((id) => `grammar:${id}`))).join('|'), sentence_type: 'ai-sentence' }));
      else if (block.type === 'grammar') block.items.forEach((grammar) => grammar.examples.forEach((item) => rows.push({ ...base, row_type: 'sentence', card_id: item.id, hanzi: item.hanzi, pinyin: item.pinyin, meaning: item.meaning, tokens: item.tokens.join('|'), tags: uniqueStrings([`grammar:${grammar.id}`, 'grammar-example'].concat(item.source_word_ids.map((id) => `source:${id}`))).join('|'), sentence_type: 'grammar-example' })));
      else block.items.forEach((group) => group.items.forEach((item) => rows.push({ ...base, row_type: block.type === 'dialogue' ? 'dialogue_turn' : 'passage_sentence', content_group_id: group.id, content_group_title: group.title, order: item.order, speaker: item.speaker, card_id: item.id, hanzi: item.hanzi, pinyin: item.pinyin, meaning: item.meaning, tokens: item.tokens.join('|'), tags: uniqueStrings(item.source_word_ids.map((id) => `source:${id}`).concat(item.grammar_ids.map((id) => `grammar:${id}`))).join('|'), sentence_type: `ai-${block.type}` })));
    });
    return { rows, deckId: clean(options.deckId) || `ai-${slug(title, 'noi-dung-ai')}`, title, groupId, groupName };
  }

  function buildAiListeningImport(analysis, options = {}) {
    const blocks = selectedAiBlocks(analysis, options.selectedBlockIds);
    const blocking = blocks.flatMap((block) => block.errors || []);
    if (!blocks.length) return { format: LISTENING_FORMAT, groups: [], decks: [], errors: ['Chưa chọn nội dung để nhập vào Nghe.'], warnings: [], stats: listeningStats([], 0) };
    if (blocking.length && options.allowErrors !== true) return { format: LISTENING_FORMAT, groups: [], decks: [], errors: uniqueStrings(blocking), warnings: [], stats: listeningStats([], 0) };
    const title = clean(options.title) || 'Nội dung AI';
    const splitByType = options.splitByType === true;
    const preparedOptions = {
      ...options,
      title,
      groupId: clean(options.groupId) || (splitByType ? `ai-group-${slug(title, 'noi-dung-ai')}` : ''),
      groupName: clean(options.groupName) || (splitByType ? title : '')
    };
    const prepared = aiRows(blocks, preparedOptions);
    const payload = buildListeningFromRows(prepared.rows, `${prepared.title}.json`);
    payload.warnings = uniqueStrings(payload.warnings.concat(blocks.flatMap((block) => block.warnings || []), blocks.flatMap((block) => block.quality_notes || [])));
    return payload;
  }

  function grammarCard(grammar) {
    const details = [grammar.explanation, grammar.tips ? `Mẹo: ${grammar.tips}` : '', grammar.attentions ? `Lưu ý: ${grammar.attentions}` : ''].filter(Boolean);
    const examples = grammar.examples.slice(0, 3).map((example) => `${example.hanzi}${example.meaning ? ` — ${example.meaning}` : ''}`);
    return {
      id: grammar.id,
      word: grammar.pattern,
      pinyin: '',
      meaningVi: details.concat(examples.length ? [`Ví dụ: ${examples.join(' / ')}`] : []).join('\n'),
      contentType: 'grammar',
      grammar: clone(grammar)
    };
  }

  function cardsForAiBlock(block) {
    const cards = [];
    if (block.type === 'vocabulary') block.items.forEach((item) => cards.push({ id: item.id, word: item.hanzi, pinyin: item.pinyin, meaningVi: item.meaning, contentType: 'vocabulary', wordType: item.word_type, tags: clone(item.tags) }));
    else if (block.type === 'sentence') block.items.forEach((item) => cards.push({ id: item.id, word: item.hanzi, pinyin: item.pinyin, meaningVi: item.meaning, contentType: 'sentence', tokens: clone(item.tokens), sourceWordIds: clone(item.source_word_ids), grammarIds: clone(item.grammar_ids) }));
    else if (block.type === 'grammar') block.items.forEach((item) => cards.push(grammarCard(item)));
    else block.items.forEach((group) => group.items.forEach((item) => cards.push({ id: item.id, word: item.hanzi, pinyin: item.pinyin, meaningVi: item.meaning, contentType: block.type, groupId: group.id, groupTitle: group.title, speaker: item.speaker, order: item.order, tokens: clone(item.tokens), sourceWordIds: clone(item.source_word_ids), grammarIds: clone(item.grammar_ids) })));
    return cards;
  }

  function uniqueAiCards(cards) {
    return Array.from(new Map(cards.filter((card) => containsHan(card.word)).map((card) => [`${card.contentType}|${card.word}\u0000${card.pinyin}\u0000${card.meaningVi}`, card])).values());
  }

  function buildAiFlashcardImport(analysis, options = {}) {
    const blocks = selectedAiBlocks(analysis, options.selectedBlockIds);
    const errors = blocks.flatMap((block) => block.errors || []);
    if (!blocks.length) return { format: FLASHCARD_FORMAT, groups: [], decks: [], errors: ['Chưa chọn nội dung để nhập vào Thẻ.'], warnings: [], stats: { groupCount: 0, deckCount: 0, cardCount: 0 } };
    if (errors.length && options.allowErrors !== true) return { format: FLASHCARD_FORMAT, groups: [], decks: [], errors: uniqueStrings(errors), warnings: [], stats: { groupCount: 0, deckCount: 0, cardCount: 0 } };
    const title = clean(options.title) || 'Nội dung AI';
    const splitByType = options.splitByType === true;
    const defaultGroupId = splitByType ? `ai-group-${slug(title, 'noi-dung-ai')}` : '';
    const groupId = clean(options.groupId) || defaultGroupId || null;
    const groupName = clean(options.groupName) || (splitByType ? title : '');
    const now = new Date().toISOString();
    const decks = [];

    if (splitByType) {
      const byType = new Map();
      blocks.forEach((block) => {
        if (!byType.has(block.type)) byType.set(block.type, []);
        byType.get(block.type).push(...cardsForAiBlock(block));
      });
      byType.forEach((rawCards, type) => {
        const cards = uniqueAiCards(rawCards);
        if (!cards.length) return;
        const deckMeta = aiDeckMeta(type, options);
        decks.push({ id: deckMeta.id, name: deckMeta.name, description: deckMeta.description, groupId, cards, createdAt: now, updatedAt: now, contentType: type });
      });
    } else {
      const cards = uniqueAiCards(blocks.flatMap(cardsForAiBlock));
      if (cards.length) {
        const deckMeta = aiDeckMeta(blocks[0]?.type || 'content', options);
        decks.push({ id: deckMeta.id, name: deckMeta.name, description: deckMeta.description, groupId, cards, createdAt: now, updatedAt: now });
      }
    }

    const groups = groupId ? [{ id: groupId, name: groupName || groupId, description: splitByType ? 'Nhóm nội dung AI được tách thành các bộ theo từng loại.' : '' }] : [];
    const warnings = uniqueStrings(blocks.flatMap((block) => block.warnings || []).concat(blocks.flatMap((block) => block.quality_notes || [])));
    const cardCount = decks.reduce((sum, deck) => sum + deck.cards.length, 0);
    return { format: FLASHCARD_FORMAT, groups, decks, errors: decks.length ? [] : ['Không có nội dung phù hợp để tạo Thẻ.'], warnings, stats: { groupCount: groups.length, deckCount: decks.length, cardCount } };
  }

  function nextMergedId(base, used) {
    const cleanBase = clean(base) || 'item';
    if (!used.has(cleanBase)) { used.add(cleanBase); return cleanBase; }
    let index = 2;
    while (used.has(`${cleanBase}-${index}`)) index += 1;
    const id = `${cleanBase}-${index}`;
    used.add(id);
    return id;
  }

  function mergeListeningDeck(existingRaw, incomingRaw) {
    const existing = normalizeExistingListeningDeck(existingRaw || {}, 0);
    const incoming = normalizeExistingListeningDeck(incomingRaw || {}, 0);
    const dataset = clone(existing.dataset);
    const usedWordIds = new Set((dataset.words || []).map((item) => item.id));
    const usedSentenceIds = new Set((dataset.sentences || []).map((item) => item.id));
    const usedGroupIds = new Set((dataset.groups || []).map((item) => item.id));
    const wordKeys = new Set((dataset.words || []).map((item) => `${item.text}\u0000${item.pinyin}\u0000${item.meaning}`));
    const sentenceByText = new Map((dataset.sentences || []).map((item) => [answerText(item.text), item.id]));
    const sentenceIdMap = new Map();
    (incoming.dataset.words || []).forEach((word) => {
      const key = `${word.text}\u0000${word.pinyin}\u0000${word.meaning}`;
      if (wordKeys.has(key)) return;
      wordKeys.add(key);
      const copy = clone(word);
      copy.id = nextMergedId(copy.id, usedWordIds);
      copy.sourceId = existing.id; copy.lessonId = existing.id;
      dataset.words.push(copy);
    });
    (incoming.dataset.sentences || []).forEach((sentence) => {
      const key = answerText(sentence.text);
      if (sentenceByText.has(key)) { sentenceIdMap.set(sentence.id, sentenceByText.get(key)); return; }
      const copy = clone(sentence);
      copy.id = nextMergedId(copy.id, usedSentenceIds);
      copy.sourceId = existing.id; copy.lessonId = existing.id;
      sentenceByText.set(key, copy.id);
      sentenceIdMap.set(sentence.id, copy.id);
      dataset.sentences.push(copy);
    });
    (incoming.dataset.groups || []).forEach((group) => {
      const copy = clone(group);
      copy.id = nextMergedId(copy.id, usedGroupIds);
      copy.sourceId = existing.id; copy.lessonId = existing.id;
      copy.items = (copy.items || []).map((item, index) => {
        const canonicalSentenceId = sentenceIdMap.get(item.canonicalSentenceId);
        if (!canonicalSentenceId) return null;
        return { ...item, id: `${copy.id}:item-${index + 1}`, canonicalSentenceId, groupId: copy.id, groupIndex: index, sourceId: existing.id, lessonId: existing.id };
      }).filter(Boolean);
      if (copy.items.length >= 2) dataset.groups.push(copy);
    });
    dataset.grammar = (dataset.grammar || []).concat(clone(incoming.dataset.grammar || []));
    dataset.unit.id = existing.id;
    dataset.unit.title = existing.name;
    dataset.unit.titleZh = existing.name;
    dataset.source.id = `custom:${existing.id}`;
    finalizeListeningDataset(dataset);
    return normalizeExistingListeningDeck({ ...existing, dataset, updatedAt: new Date().toISOString() }, 0);
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
    LISTENING_FORMAT, FLASHCARD_FORMAT, AI_PASTE_FORMAT, AI_RESULT_FORMAT,
    clean, slug, stableId, containsHan, normalizeHeader, normalizeRowType, parseBoolean, splitList,
    parseDelimited, objectsFromMatrix, readFile, tableRows,
    buildListeningImport, buildFlashcardImport,
    extractJsonValues, parseAiPaste, buildAiListeningImport, buildAiFlashcardImport, mergeListeningDeck,
    normalizeExistingListeningDeck, legacyDeckToDataset, finalizeListeningDataset, mergeListeningDatasets,
    downloadText
  });
});

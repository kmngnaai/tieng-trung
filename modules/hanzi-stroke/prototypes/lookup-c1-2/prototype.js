const SAMPLE_INDEX_URL = '../../data/learning/character-enrichment/hsk1/index.json';
const LOCAL_CHAR_BASE = '../../data/chars/';
const HSK_LOOKUP_URL = '../../data/learning/hsk/hsk_flashcard_lookup.json';
const HSK_LEVEL_URL = '../../data/learning/hsk/hsk_1.json';
const HANZI_DATA_BASE = 'https://cdn.jsdelivr.net/npm/hanzi-writer-data@latest/';
const RADICAL_NOTES_URL = '../../data/learning/radicals/radical_learning_notes.json';

const state = {
  index: null,
  hskLookup: null,
  hskLevelItems: null,
  current: null,
  currentQuery: '',
  dark: false,
  writer: null,
  writerChar: '',
  outlineVisible: true,
  radicalNotes: null
};

const el = {
  view: document.querySelector('#characterView'),
  loading: document.querySelector('#loading'),
  input: document.querySelector('#searchInput'),
  form: document.querySelector('#searchForm'),
  message: document.querySelector('#searchMessage'),
  theme: document.querySelector('#themeBtn'),
  strokeNavLink: document.querySelector('#strokeNavLink'),
  menuStrokeLink: document.querySelector('#menuStrokeLink'),
  menuSheet: document.querySelector('#menuSheet'),
  menuBackdrop: document.querySelector('#menuBackdrop')
};

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const first = value => Array.isArray(value) ? (value[0] || '') : (value || '');
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const isHanText = value => /^[\p{Script=Han}]+$/u.test(value);
const isSingleHan = value => [...value].length === 1 && isHanText(value);
const codePointHex = char => char.codePointAt(0).toString(16).toUpperCase();
const normalizePinyin = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

function reviewed(item) {
  return !item?.reviewStatus || item.reviewStatus === 'reviewed';
}

function meaningSummary(data) {
  const senses = data.meaningSenses || data.meanings || [];
  const values = senses.filter(reviewed).map(x => x.meaningVi || x.value).filter(Boolean);
  return values.length ? values.slice(0, 3).join('; ') : clean(data.meaningVi) || 'Chưa có nghĩa phù hợp';
}

function speak(text) {
  if (!text || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  utterance.rate = 0.72;
  speechSynthesis.speak(utterance);
}

function panelTitle(icon, text) {
  return `<h2 class="panel-title"><span class="tag"></span>${icon ? `<span>${icon}</span>` : ''}${escapeHtml(text)}</h2>`;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Không tải được ${url}`);
  return response.json();
}

async function loadHskLookup() {
  if (state.hskLookup) return state.hskLookup;
  const payload = await fetchJson(HSK_LOOKUP_URL);
  state.hskLookup = payload.items || {};
  return state.hskLookup;
}

function exactHskItemForChar(char, lookup) {
  return lookup?.[char] || null;
}

async function loadHskLevelItems() {
  if (state.hskLevelItems) return state.hskLevelItems;
  const payload = await fetchJson(HSK_LEVEL_URL);
  state.hskLevelItems = Array.isArray(payload.items) ? payload.items : [];
  return state.hskLevelItems;
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter(item => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function reviewedCopy(item, extra = {}) {
  return { ...item, ...extra, reviewStatus: item?.reviewStatus || 'reviewed' };
}

async function loadCharacterRecord(char, lookup) {
  if (state.index?.characters?.[char]) {
    try { return await fetchJson(state.index.characters[char]); } catch {}
  }
  try {
    const raw = await fetchJson(`${LOCAL_CHAR_BASE}${codePointHex(char)}.json`);
    return buildFallbackCharacter(raw, exactHskItemForChar(char, lookup));
  } catch {
    return null;
  }
}

function buildFallbackCharacter(raw, hskItem = null) {
  const char = raw.char;
  const meaning = clean(hskItem?.meaningVi) || clean(raw.meaningVi) || clean(raw.meaningEn);
  const compounds = (raw.relatedWords || []).filter(x => x.word && x.word.includes(char)).map(x => ({
    word: x.word,
    pinyin: x.pinyin || '',
    meaningVi: x.meaningVi || x.meaningEn || '',
    relationType: 'contains-target-character',
    hskLevel: '',
    source: ['local_chars'],
    reviewStatus: 'reviewed'
  }));
  return {
    schemaVersion: 'runtime-local-fallback-v1',
    id: `char:${char}`,
    type: 'character',
    char,
    simplified: char,
    traditional: raw.traditional || char,
    pronunciation: { pinyin: [hskItem?.pinyin || raw.pinyin || ''], hanViet: raw.hanViet || '' },
    meaningSenses: [{ partOfSpeech: '', meaningVi: meaning, source: [hskItem ? 'local_hsk_lookup' : 'local_chars'], reviewStatus: 'reviewed' }],
    characterInfo: {
      strokeCount: raw.strokeCount ?? null,
      structureType: '',
      formationType: '',
      formationTypeVi: 'chưa chuẩn hóa',
      radical: { mainForm: raw.radical || '', variant: raw.radical || '', nameVi: raw.radical ? `Bộ ${raw.radical}` : '', pinyin: '', meaningVi: '' }
    },
    components: raw.radical ? [{ char: raw.radical, role: 'unknown', roleVi: 'bộ thủ', meaningVi: 'Chưa có giải thích thành phần đã duyệt', reviewStatus: 'needs-review' }] : [],
    etymology: { standardExplanationVi: 'Chữ này hiện dùng dữ liệu local cơ bản. Phần chiết tự chưa được biên soạn và kiểm duyệt.', confidence: 'not-reviewed' },
    learningStory: { memoryStoryVi: '', reviewStatus: 'not-available' },
    vocabulary: { compounds, relatedWords: [], collocations: [] },
    sentences: [],
    grammarLinks: [],
    sameRadicalCharacters: [],
    sources: [
      { sourceId: 'local_chars', title: `data/chars/${codePointHex(char)}.json`, reviewStatus: 'reviewed' },
      ...(hskItem ? [{ sourceId: 'local_hsk_lookup', title: 'hsk_flashcard_lookup.json', reviewStatus: 'reviewed' }] : [])
    ],
    review: { status: 'local-fallback', warnings: ['Chưa có dữ liệu chiết tự đã duyệt cho chữ này.'] }
  };
}

async function buildFallbackWord(word, hskItem) {
  const lookup = await loadHskLookup();
  const hskItems = await loadHskLevelItems();
  const exact = hskItems.find(item => item.word === word) || hskItem || {};
  const chars = [...word];
  const charRecords = (await Promise.all(chars.map(char => loadCharacterRecord(char, lookup)))).filter(Boolean);

  const components = charRecords.map((record, index) => ({
    char: chars[index] || record.char,
    role: 'structural',
    roleVi: 'chữ trong từ',
    meaningVi: meaningSummary(record),
    soundHint: first(record.pronunciation?.pinyin),
    reviewStatus: 'reviewed'
  }));

  const exactTargetCompounds = charRecords.flatMap(record => record.vocabulary?.compounds || [])
    .filter(item => item.word && item.word !== word && item.word.includes(word));
  const componentCompounds = charRecords.flatMap(record => record.vocabulary?.compounds || [])
    .filter(item => item.word && item.word !== word);
  const hskRelated = hskItems.filter(item => item.word && item.word !== word && [...word].some(char => item.word.includes(char)))
    .map(item => ({
      word: item.word,
      pinyin: item.pinyin || '',
      meaningVi: item.meaningVi || item.translationVi || '',
      relationType: 'shares-component-character',
      hskLevel: item.hsk ? `HSK ${item.hsk}` : 'New HSK 1',
      source: ['hsk_1.json'],
      reviewStatus: 'reviewed'
    }));
  const compounds = uniqueBy(
    [...exactTargetCompounds, ...componentCompounds, ...hskRelated].map(item => reviewedCopy(item)),
    item => item.word
  ).slice(0, 12);

  const collocationsFromExact = (exact.collocations || []).map(item => ({
    text: item.chinese || item.text,
    pinyin: item.pinyin || '',
    meaningVi: item.meaning_vi || item.meaningVi || '',
    target: word,
    source: 'hsk_1.json',
    reviewStatus: 'reviewed'
  }));
  const collocationsFromChars = charRecords.flatMap(record => record.vocabulary?.collocations || [])
    .filter(item => item.target === word || String(item.text || '').includes(word));
  const collocations = uniqueBy([...collocationsFromExact, ...collocationsFromChars], item => item.text || item.word).slice(0, 10);

  const sentencesFromExact = (exact.examples || []).map(item => ({
    target: word,
    targetType: 'word',
    chinese: item.chinese || '',
    pinyin: item.pinyin || '',
    meaningVi: item.meaning_vi || item.meaningVi || '',
    source: 'hsk_1.json',
    sourceRef: `${word}.examples`,
    containsTarget: String(item.chinese || '').includes(word),
    reviewStatus: 'reviewed'
  })).filter(item => item.containsTarget);
  const sentencesFromChars = charRecords.flatMap(record => record.sentences || [])
    .filter(item => item.target === word && String(item.chinese || '').includes(word));
  const sentences = uniqueBy([...sentencesFromExact, ...sentencesFromChars], item => item.chinese).slice(0, 12);

  const grammarLinks = [];
  if (clean(exact.usageNote)) grammarLinks.push({
    grammarTopic: `Cách dùng ${word}`,
    syntax: clean(exact.wordTypeExplanation) || clean(exact.wordType),
    matchedExample: clean(exact.usageNote),
    source: 'hsk_1.json',
    reviewStatus: 'reviewed'
  });
  if (clean(exact.wordTypeExplanation) && clean(exact.wordTypeExplanation) !== clean(exact.usageNote)) grammarLinks.push({
    grammarTopic: 'Loại từ và chức năng',
    syntax: clean(exact.wordType),
    matchedExample: clean(exact.wordTypeExplanation),
    source: 'hsk_1.json',
    reviewStatus: 'reviewed'
  });

  const componentCharacters = charRecords.map(record => ({
    word: record.char,
    pinyin: first(record.pronunciation?.pinyin),
    meaningVi: meaningSummary(record),
    reviewStatus: 'reviewed'
  }));

  const sourceRoutes = (exact.routes || []).filter(route => ['hsk', 'new_hsk'].includes(route.libraryId) && Number(route.levelNo) === 1);
  return {
    schemaVersion: 'runtime-local-word-enrichment-v2',
    id: `word:${word}`,
    type: 'word',
    char: word,
    simplified: exact.simplified || word,
    traditional: exact.traditional || word,
    pronunciation: { pinyin: [exact.pinyin || hskItem?.pinyin || ''], hanViet: '' },
    meaningSenses: [{ partOfSpeech: exact.wordType || '', meaningVi: exact.meaningVi || exact.translationVi || hskItem?.meaningVi || 'Chưa có nghĩa local', source: ['hsk_1.json'], reviewStatus: 'reviewed' }],
    characterInfo: { strokeCount: null, structureType: '', formationTypeVi: 'từ nhiều chữ', radical: {} },
    components,
    etymology: { standardExplanationVi: clean(exact.wordTypeExplanation) || 'Đây là từ nhiều chữ. Chọn từng chữ bên dưới để xem cấu tạo và luyện viết.', confidence: 'local-reviewed' },
    learningStory: { memoryStoryVi: '', reviewStatus: 'not-available' },
    vocabulary: { compounds, relatedWords: [], collocations },
    sentences,
    grammarLinks,
    sameRadicalCharacters: componentCharacters,
    sources: [
      { sourceId: 'hsk_1_json', title: 'data/learning/hsk/hsk_1.json', reviewStatus: 'reviewed' },
      ...sourceRoutes.slice(0, 4).map(route => ({ sourceId: route.sectionId, title: `${route.libraryName} · ${route.sectionTitle}`, reviewStatus: 'reviewed' }))
    ],
    review: { status: 'local-enriched', warnings: sentences.length ? [] : ['Chưa tìm thấy câu chứa đúng từ trong dữ liệu HSK 1 hiện có.'] }
  };
}

async function resolveQuery(rawQuery) {
  const query = clean(rawQuery);
  if (!query) throw new Error('Hãy nhập chữ, từ hoặc pinyin cần tra.');

  if (state.index?.characters?.[query]) {
    return fetchJson(state.index.characters[query]);
  }

  const lookup = await loadHskLookup();
  if (isSingleHan(query)) {
    try {
      const raw = await fetchJson(`${LOCAL_CHAR_BASE}${codePointHex(query)}.json`);
      return buildFallbackCharacter(raw, exactHskItemForChar(query, lookup));
    } catch {
      const hsk = lookup[query];
      if (hsk) return buildFallbackWord(query, hsk);
      throw new Error(`Chưa tìm thấy dữ liệu local cho “${query}”.`);
    }
  }

  if (isHanText(query)) {
    const hsk = lookup[query];
    if (hsk) return buildFallbackWord(query, hsk);
    throw new Error(`Chưa tìm thấy từ “${query}” trong dữ liệu HSK local.`);
  }

  const target = normalizePinyin(query);
  const indexedChar = state.index?.pinyinIndex?.[target]?.[0];
  if (indexedChar && state.index?.characters?.[indexedChar]) {
    return fetchJson(state.index.characters[indexedChar]);
  }
  const match = Object.values(lookup).find(item => normalizePinyin(item.pinyin) === target);
  if (!match) throw new Error(`Chưa tìm thấy pinyin “${query}” trong dữ liệu local.`);
  if (state.index?.characters?.[match.word]) return fetchJson(state.index.characters[match.word]);
  if (isSingleHan(match.word)) {
    try {
      const raw = await fetchJson(`${LOCAL_CHAR_BASE}${codePointHex(match.word)}.json`);
      return buildFallbackCharacter(raw, match);
    } catch {}
  }
  return buildFallbackWord(match.word, match);
}

function componentCards(data) {
  const list = data.components || [];
  if (!list.length) return '<div class="empty-state">Chưa có dữ liệu thành phần.</div>';
  return list.map((component, index) => {
    const roleClass = component.role === 'semantic' ? 'semantic' : component.role === 'phonetic' ? 'phonetic' : 'unknown';
    const extra = component.soundHint ? ` · ${component.soundHint}` : '';
    return `${index ? '<div class="plus">+</div>' : ''}<button class="component-card ${roleClass}" type="button" data-search-char="${escapeHtml(component.char)}">
      <span class="component-char">${escapeHtml(component.char)}</span>
      <strong class="component-role">${escapeHtml(component.roleVi || component.role || '')}${escapeHtml(extra)}</strong>
      <span class="component-meaning">${escapeHtml(component.meaningVi || '')}</span>
    </button>`;
  }).join('');
}

function wordCards(items = [], limit = 6) {
  const list = items.filter(reviewed).slice(0, limit);
  if (!list.length) return '<div class="empty-state">Chưa có dữ liệu đã kiểm duyệt.</div>';
  return `<div class="card-list">${list.map(item => {
    const target = item.word || item.text || '';
    return `<div class="word-card">
      <button class="word-card-search" type="button" data-search-char="${escapeHtml(target)}" aria-label="Tra ${escapeHtml(target)}">
        <span class="word-main"><strong>${escapeHtml(target)}</strong><span class="word-pinyin">${escapeHtml(item.pinyin || '')}</span></span>
        <span class="word-meaning">${escapeHtml(item.meaningVi || '')}</span>
      </button>
      <div class="word-card-actions">
        <button class="word-speak-btn" type="button" data-speak="${escapeHtml(target)}" aria-label="Nghe phát âm ${escapeHtml(target)}" title="Nghe phát âm">🔊</button>
        ${item.hskLevel ? `<span class="word-badge">${escapeHtml(item.hskLevel)}</span>` : ''}
      </div>
    </div>`;
  }).join('')}</div>`;
}

function sentenceCards(items = [], limit = 4) {
  const list = items.filter(item => reviewed(item) && item.containsTarget !== false).slice(0, limit);
  if (!list.length) return '<div class="empty-state">Chưa có câu mẫu đã kiểm duyệt cho mục này.</div>';
  return `<div class="card-list">${list.map(item => `<div class="sentence-card">
    <div class="zh">${escapeHtml(item.chinese)}</div>
    <div class="py">${escapeHtml(item.pinyin)}</div>
    <div class="vi">${escapeHtml(item.meaningVi)}</div>
  </div>`).join('')}</div>`;
}

async function loadRadicalNotes() {
  if (state.radicalNotes) return state.radicalNotes;
  state.radicalNotes = await fetchJson(RADICAL_NOTES_URL);
  return state.radicalNotes;
}

function matchRadicalNote(notes, form) {
  const target = clean(form);
  return Object.values(notes || {}).find(note => {
    const forms = [note.key, note.mainForm, note.sideForm, ...(note.variants || [])].map(clean);
    return forms.includes(target);
  }) || null;
}

function radicalExampleItems(note) {
  return (note?.examples?.chars || note?.examples?.charsShort || []).slice(0, 24);
}

function radicalWordItems(note) {
  return (note?.examples?.words || []).slice(0, 30);
}

function radicalSentenceItems(note) {
  return (note?.examples?.sentences || note?.examples?.sentencesShort || []).slice(0, 12);
}

function radicalAccordion(title, content, open = false) {
  if (!content) return '';
  return `<details class="prototype-radical-accordion" ${open ? 'open' : ''}>
    <summary><span>${escapeHtml(title)}</span><span class="prototype-radical-chevron">⌄</span></summary>
    <div class="prototype-radical-accordion-body">${content}</div>
  </details>`;
}

function radicalSearchCards(items = [], kind = 'char') {
  const list = items.filter(item => item && (item.char || item.word)).slice(0, kind === 'char' ? 24 : 30);
  if (!list.length) return '';
  return `<div class="prototype-radical-${kind === 'char' ? 'examples' : 'words'}">${list.map(item => {
    const target = item.char || item.word || '';
    return `<div class="prototype-radical-item">
      <button type="button" class="prototype-radical-item-search" data-search-char="${escapeHtml(target)}">
        <strong>${escapeHtml(target)}</strong>
        <span>${escapeHtml(item.pinyin || '')}</span>
        <small>${escapeHtml(item.meaningVi || '')}</small>
      </button>
      <button type="button" class="prototype-radical-item-audio" data-speak="${escapeHtml(target)}" aria-label="Nghe ${escapeHtml(target)}">🔊</button>
    </div>`;
  }).join('')}</div>`;
}

function radicalFormsHtml(forms = []) {
  if (!forms.length) return '';
  return `<div class="prototype-radical-form-list">${forms.map(form => `
    <article class="prototype-radical-form-card">
      <div class="prototype-radical-form-head">
        <strong>${escapeHtml(form.form || '')}</strong>
        <div><b>${escapeHtml(form.nameVi || '')}</b><span>${escapeHtml(form.pinyin || '')}</span></div>
        ${form.form ? `<button type="button" class="prototype-radical-item-audio" data-speak="${escapeHtml(form.form)}" aria-label="Nghe ${escapeHtml(form.form)}">🔊</button>` : ''}
      </div>
      ${form.description ? `<p>${escapeHtml(form.description)}</p>` : ''}
      ${radicalSearchCards(form.examples || [], 'char')}
    </article>`).join('')}</div>`;
}

function radicalSemanticGroupsHtml(groups = []) {
  if (!groups.length) return '';
  return `<div class="prototype-radical-semantic-list">${groups.map(group => `
    <article>
      <h5>${escapeHtml(group.title || '')}</h5>
      ${group.description ? `<p>${escapeHtml(group.description)}</p>` : ''}
      ${radicalSearchCards(group.examples || [], 'char')}
    </article>`).join('')}</div>`;
}

function radicalSentencesHtml(items = []) {
  if (!items.length) return '';
  return `<div class="prototype-radical-sentence-list">${items.map(item => `
    <article>
      <strong>${escapeHtml(item.zh || item.chinese || '')}</strong>
      <span>${escapeHtml(item.pinyin || '')}</span>
      <small>${escapeHtml(item.vi || item.meaningVi || '')}</small>
    </article>`).join('')}</div>`;
}

function radicalSourcesHtml(source = {}) {
  const urls = source.sourceUrls || [];
  const rows = [
    source.primary ? `<li><b>Nguồn chính:</b> ${escapeHtml(source.primary)}</li>` : '',
    (source.supplement || []).length ? `<li><b>Nguồn bổ sung:</b> ${escapeHtml(source.supplement.join(', '))}</li>` : '',
    source.hasManualOverride ? '<li><b>Hiệu chỉnh thủ công:</b> Có</li>' : '',
    source.needsManualReview ? '<li><b>Trạng thái:</b> Cần kiểm tra thêm</li>' : '<li><b>Trạng thái:</b> Đã tổng hợp</li>',
    ...(source.notes || []).map(note => `<li>${escapeHtml(note)}</li>`),
    ...urls.map(url => `<li class="prototype-radical-source-url">${escapeHtml(url)}</li>`)
  ].filter(Boolean);
  return rows.length ? `<ul>${rows.join('')}</ul>` : '';
}

function ensureRadicalDialog() {
  let dialog = document.querySelector('#prototypeRadicalDialog');
  if (dialog) return dialog;
  dialog = document.createElement('div');
  dialog.id = 'prototypeRadicalDialog';
  dialog.className = 'prototype-radical-dialog';
  dialog.hidden = true;
  dialog.innerHTML = '<div class="prototype-radical-sheet" role="dialog" aria-modal="true" aria-label="Chi tiết bộ thủ"><div id="prototypeRadicalBody"></div></div>';
  document.body.appendChild(dialog);
  dialog.addEventListener('click', event => {
    if (event.target === dialog || event.target.closest('[data-close-radical]')) closeRadicalDialog();
  });
  return dialog;
}

function closeRadicalDialog() {
  const dialog = document.querySelector('#prototypeRadicalDialog');
  if (!dialog) return;
  dialog.hidden = true;
  document.body.classList.remove('radical-dialog-open');
}

function renderRadicalDialog(note) {
  const dialog = ensureRadicalDialog();
  const body = dialog.querySelector('#prototypeRadicalBody');
  const detail = note.detailForRadicalPopup || {};
  const examples = radicalExampleItems(note);
  const words = radicalWordItems(note);
  const sentences = radicalSentenceItems(note);
  const forms = detail.formVariants || [];
  const semanticGroups = detail.semanticGroups || [];
  const basicLines = [
    note.mainForm ? `<span><b>Dạng chính:</b> ${escapeHtml(note.mainForm)}</span>` : '',
    note.sideForm ? `<span><b>Biến thể:</b> ${escapeHtml(note.sideForm)}</span>` : '',
    note.pinyin ? `<span><b>Pinyin:</b> ${escapeHtml(note.pinyin)}</span>` : '',
    note.hanViet ? `<span><b>Hán Việt:</b> ${escapeHtml(note.hanViet)}</span>` : '',
    Number.isFinite(note.strokeCount) ? `<span><b>Số nét:</b> ${escapeHtml(note.strokeCount)}</span>` : '',
    note.kangxiNo ? `<span><b>Số Khang Hy:</b> ${escapeHtml(note.kangxiNo)}</span>` : ''
  ].filter(Boolean).join('');

  body.innerHTML = `
    <div class="prototype-radical-topbar">
      <button type="button" data-close-radical>← Quay lại</button>
      <button type="button" class="prototype-radical-close" data-close-radical aria-label="Đóng">×</button>
    </div>
    <div class="prototype-radical-hero">
      <div class="prototype-radical-glyph">${escapeHtml(note.key || note.sideForm || note.mainForm || '')}</div>
      <div>
        <h3>${escapeHtml(note.displayNameVi || 'Bộ thủ')}</h3>
        <p>${escapeHtml(note.shortForCharLookup?.meaningLine || '')}</p>
        <div class="prototype-radical-basic">${basicLines}</div>
      </div>
      <button class="word-speak-btn" type="button" data-speak="${escapeHtml(note.key || note.mainForm || '')}" aria-label="Nghe bộ thủ">🔊</button>
    </div>
    ${radicalAccordion('Nguồn gốc và ý nghĩa', detail.originMeaning ? `<p>${escapeHtml(detail.originMeaning)}</p>` : '', true)}
    ${radicalAccordion('Các dạng và vị trí xuất hiện', `${radicalFormsHtml(forms)}${note.shortForCharLookup?.positionLine ? `<p class="prototype-radical-note">${escapeHtml(note.shortForCharLookup.positionLine)}</p>` : ''}`)}
    ${radicalAccordion('Nhóm nghĩa thường gặp', radicalSemanticGroupsHtml(semanticGroups))}
    ${radicalAccordion('Cách nhận biết', detail.recognition ? `<p>${escapeHtml(detail.recognition)}</p>` : '')}
    ${radicalAccordion('Gợi nhớ', (detail.imageAssociation || note.shortForCharLookup?.memoryLine) ? `<p>${escapeHtml(detail.imageAssociation || note.shortForCharLookup.memoryLine)}</p>` : '')}
    ${radicalAccordion('Chữ ví dụ', radicalSearchCards(examples, 'char'))}
    ${radicalAccordion('Từ ghép', radicalSearchCards(words, 'word'))}
    ${radicalAccordion('Câu mẫu', radicalSentencesHtml(sentences))}
    ${radicalAccordion('Dễ nhầm', (detail.avoidConfusion || []).length ? `<ul>${detail.avoidConfusion.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '')}
    ${radicalAccordion('Nguồn dữ liệu', radicalSourcesHtml(note.source || {}))}
  `;
  body.querySelectorAll('[data-speak]').forEach(button => button.addEventListener('click', event => {
    event.stopPropagation();
    speak(button.dataset.speak);
  }));
  body.querySelectorAll('[data-search-char]').forEach(button => button.addEventListener('click', () => {
    closeRadicalDialog();
    runSearch(button.dataset.searchChar);
  }));
  dialog.hidden = false;
  document.body.classList.add('radical-dialog-open');
}

async function openRadicalDetails(form) {
  try {
    const notes = await loadRadicalNotes();
    const note = matchRadicalNote(notes, form);
    if (!note) throw new Error('Bộ thủ này chưa có hồ sơ chi tiết trong dữ liệu local.');
    renderRadicalDialog(note);
  } catch (error) {
    el.message.textContent = error.message || 'Không mở được chi tiết bộ thủ.';
    el.message.hidden = false;
  }
}

function warningFor(data) {
  const warnings = data.review?.warnings || [];
  const componentWarning = (data.components || []).some(item => item.reviewStatus === 'needs-review');
  if (warnings.length) return warnings.join(' ');
  if (componentWarning) return 'Một phần vai trò cấu tạo vẫn đang được đối chiếu.';
  return '';
}

function writingCharacters(data) {
  return [...new Set([...String(data.char || '')].filter(isHanText))];
}

function writingPanel(data) {
  const chars = writingCharacters(data);
  if (!chars.length) return '<div class="empty-state">Không có chữ để luyện viết.</div>';
  return `<div class="writing-char-tabs" aria-label="Chọn chữ luyện viết">${chars.map((char, i) => `<button type="button" class="writing-char-tab ${i === 0 ? 'active' : ''}" data-writer-char="${char}">${char}</button>`).join('')}</div>
    <div class="writing-stage"><div id="writerMount" class="writer-mount" aria-label="Ô luyện viết"></div></div>
    <p class="writing-status" id="writingStatus">Chọn Phát nét để xem thứ tự hoặc Luyện viết để viết trực tiếp.</p>
    <div class="writing-controls">
      <button class="writer-control" type="button" data-writer-action="animate">▶ <span>Phát nét</span></button>
      <button class="writer-control" type="button" data-writer-action="quiz">✍ <span>Luyện viết</span></button>
      <button class="writer-control" type="button" data-writer-action="outline">▣ <span>Không viền</span></button>
      <button class="writer-control" type="button" data-writer-action="reset">↻ <span>Viết lại</span></button>
    </div>
    <a class="open-stroke-link" id="openStrokeLink" href="../../index.html?word=${encodeURIComponent(chars[0])}">Mở đầy đủ trong Học →</a>`;
}

function render(data) {
  state.current = data;
  state.currentQuery = data.char;
  const radical = data.characterInfo?.radical || {};
  const vocabulary = data.vocabulary || {};
  const pinyin = first(data.pronunciation?.pinyin);
  const formation = data.characterInfo?.formationTypeVi || '';
  const structure = data.characterInfo?.structureType === 'left-right' ? 'trái – phải' : (data.characterInfo?.structureType || '');
  const warning = warningFor(data);
  const sources = (data.sources || []).filter(item => item.reviewStatus !== 'rejected');
  const story = clean(data.learningStory?.memoryStoryVi);
  const primaryChar = writingCharacters(data)[0] || '';

  el.view.innerHTML = `
    <section class="panel hero-card full-width"><div class="panel-inner">
      <div class="hero-grid"><div class="main-char">${escapeHtml(data.char)}</div><div><div class="pinyin">${escapeHtml(pinyin)}</div><div class="hanviet">${data.pronunciation?.hanViet ? `Hán Việt: ${escapeHtml(data.pronunciation.hanViet)}` : ''}</div><p class="primary-meaning">${escapeHtml(meaningSummary(data))}</p></div><button class="speak-btn" type="button" data-speak="${escapeHtml(data.char)}" aria-label="Nghe phát âm">🔊</button></div>
      <div class="meta-row">${formation ? `<span class="meta-chip">${escapeHtml(formation)}</span>` : ''}${structure ? `<span class="meta-chip">${escapeHtml(structure)}</span>` : ''}${data.characterInfo?.strokeCount ? `<span class="meta-chip">${escapeHtml(data.characterInfo.strokeCount)} nét</span>` : ''}${radical.nameVi ? `<span class="meta-chip">${escapeHtml(radical.nameVi)}</span>` : ''}</div>
    </div></section>

    <section class="panel decomp-panel full-width"><div class="panel-inner">${panelTitle('◫', data.type === 'word' ? 'Từng chữ trong từ' : 'Cấu tạo chữ')}<div class="decomposition">${componentCards(data)}</div><div class="explanation">${escapeHtml(data.etymology?.standardExplanationVi || 'Chưa có giải thích chiết tự đã duyệt.')}</div>${warning ? `<div class="warning">${escapeHtml(warning)}</div>` : ''}</div></section>

    ${story ? `<section class="panel story-panel full-width"><div class="panel-inner">${panelTitle('💡', 'Câu chuyện ghi nhớ')}<div class="story-card"><div class="story-icon">✦</div><div><p class="story-text">${escapeHtml(story)}</p><div class="story-note">Mẹo học theo cấu tạo, không phải khẳng định lịch sử chữ.</div></div></div></div></section>` : ''}

    ${radical.mainForm || radical.variant ? `<section class="panel"><div class="panel-inner">${panelTitle('部', 'Bộ thủ')}<button class="radical-card radical-card-button" type="button" data-open-radical="${escapeHtml(radical.variant || radical.mainForm || '')}" aria-label="Mở chi tiết ${escapeHtml(radical.nameVi || 'bộ thủ')}"><div class="radical-char">${escapeHtml(radical.variant || radical.mainForm || '')}</div><div><strong>${escapeHtml(radical.nameVi || 'Bộ thủ')}</strong><span>${escapeHtml(radical.mainForm || '')}${radical.pinyin ? ` · ${escapeHtml(radical.pinyin)}` : ''}${radical.meaningVi ? ` · ${escapeHtml(radical.meaningVi)}` : ''}</span><small>Chạm để xem chi tiết →</small></div></button></div></section>` : ''}

    <section class="panel writing-panel full-width"><div class="panel-inner">${panelTitle('✎', 'Cách viết và luyện cơ bản')}${writingPanel(data)}</div></section>

    <section class="panel"><div class="panel-inner">${panelTitle('词', 'Từ ghép')}${wordCards(vocabulary.compounds || [])}</div></section>
    <section class="panel"><div class="panel-inner">${panelTitle('搭', 'Kết hợp thường thấy')}${wordCards(vocabulary.collocations || [], 5)}</div></section>
    <section class="panel full-width"><div class="panel-inner">${panelTitle('例', 'Câu mẫu')}${sentenceCards(data.sentences || [])}</div></section>
    <section class="panel"><div class="panel-inner">${panelTitle('语', data.type === 'word' ? 'Ngữ pháp / cách dùng' : 'Ngữ pháp liên quan')}${wordCards((data.grammarLinks || []).map(item => ({word:item.grammarTopic, pinyin:item.syntax, meaningVi:item.matchedExample, reviewStatus:item.reviewStatus})), 3)}</div></section>
    <section class="panel"><div class="panel-inner">${panelTitle('同', data.type === 'word' ? 'Chữ thành phần' : 'Chữ cùng bộ')}${wordCards(data.sameRadicalCharacters || [], 8)}</div></section>
    <section class="panel details-panel full-width"><details><summary>Nguồn dữ liệu và ghi chú kiểm duyệt</summary><ul class="source-list">${sources.length ? sources.map(item => `<li>${escapeHtml(item.title || item.sourceId || '')}</li>`).join('') : '<li>Không có thông tin nguồn bổ sung.</li>'}</ul></details></section>`;

  updateStrokeLinks(primaryChar);
  bindDynamicEvents();
  requestAnimationFrame(() => initWriter(primaryChar));
  el.view.hidden = false;
  el.loading.hidden = true;
  document.querySelectorAll('[data-char]').forEach(button => button.classList.toggle('active', button.dataset.char === data.char));
}

function updateStrokeLinks(char) {
  const href = `../../index.html${char ? `?word=${encodeURIComponent(char)}` : ''}`;
  el.strokeNavLink.href = href;
  el.menuStrokeLink.href = href;
  const direct = document.querySelector('#openStrokeLink');
  if (direct) direct.href = href;
}

function initWriter(char) {
  const mount = document.querySelector('#writerMount');
  if (!mount || !char) return;
  mount.innerHTML = '';
  state.writer = null;
  state.writerChar = char;
  state.outlineVisible = true;
  if (!window.HanziWriter) {
    mount.innerHTML = `<div class="writer-fallback">${escapeHtml(char)}<small>Không tải được Hanzi Writer.</small></div>`;
    return;
  }
  const size = Math.max(158, Math.min(184, mount.clientWidth || 176));
  state.writer = HanziWriter.create(mount, char, {
    width: size,
    height: size,
    padding: 10,
    showOutline: true,
    showCharacter: true,
    strokeAnimationSpeed: 1,
    delayBetweenStrokes: 180,
    radicalColor: '#d16648',
    charDataLoader: (character, onComplete, onError) => {
      fetch(`${HANZI_DATA_BASE}${encodeURIComponent(character)}.json`)
        .then(response => response.ok ? response.json() : Promise.reject(new Error('Không có dữ liệu nét')))
        .then(onComplete)
        .catch(onError);
    }
  });
}

function writerAction(action) {
  const status = document.querySelector('#writingStatus');
  if (!state.writer) {
    if (status) status.textContent = 'Hanzi Writer chưa sẵn sàng.';
    return;
  }
  if (action === 'animate') {
    state.writer.cancelQuiz();
    state.writer.showCharacter();
    state.writer.animateCharacter();
    if (status) status.textContent = `Đang phát thứ tự nét của ${state.writerChar}.`;
  } else if (action === 'quiz') {
    state.writer.hideCharacter();
    state.writer.quiz({
      showHintAfterMisses: 2,
      highlightOnComplete: true,
      onComplete: summary => { if (status) status.textContent = `Hoàn thành ${state.writerChar} · sai ${summary.totalMistakes || 0} lần.`; }
    });
    if (status) status.textContent = `Hãy viết chữ ${state.writerChar} trực tiếp trong ô.`;
  } else if (action === 'outline') {
    state.outlineVisible = !state.outlineVisible;
    if (state.outlineVisible) state.writer.showOutline(); else state.writer.hideOutline();
    if (status) status.textContent = state.outlineVisible ? 'Đã hiện khung chữ.' : 'Đã ẩn khung chữ.';
  } else if (action === 'reset') {
    state.writer.cancelQuiz();
    state.writer.showCharacter();
    state.writer.showOutline();
    state.outlineVisible = true;
    if (status) status.textContent = 'Đã đặt lại ô viết.';
  }
}

function bindDynamicEvents() {
  el.view.querySelectorAll('[data-speak]').forEach(button => button.addEventListener('click', () => speak(button.dataset.speak)));
  el.view.querySelectorAll('[data-search-char]').forEach(button => button.addEventListener('click', () => runSearch(button.dataset.searchChar)));
  el.view.querySelectorAll('[data-writer-char]').forEach(button => button.addEventListener('click', () => {
    el.view.querySelectorAll('[data-writer-char]').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    initWriter(button.dataset.writerChar);
    updateStrokeLinks(button.dataset.writerChar);
  }));
  el.view.querySelectorAll('[data-writer-action]').forEach(button => button.addEventListener('click', () => writerAction(button.dataset.writerAction)));
  el.view.querySelectorAll('[data-open-radical]').forEach(button => button.addEventListener('click', () => openRadicalDetails(button.dataset.openRadical)));
}

async function runSearch(value) {
  const query = clean(value);
  el.message.hidden = true;
  el.loading.hidden = false;
  el.view.hidden = true;
  try {
    const data = await resolveQuery(query);
    el.input.value = query;
    render(data);
  } catch (error) {
    el.loading.hidden = true;
    el.message.textContent = error.message || 'Không tìm thấy dữ liệu.';
    el.message.hidden = false;
  }
}

function setDark(force) {
  state.dark = typeof force === 'boolean' ? force : !state.dark;
  document.body.classList.toggle('dark', state.dark);
  localStorage.setItem('lookup-c1-2-theme', state.dark ? 'dark' : 'light');
}

function openMenu() {
  el.menuBackdrop.hidden = false;
  el.menuSheet.classList.add('open');
  el.menuSheet.setAttribute('aria-hidden', 'false');
  document.body.classList.add('menu-open');
}

function closeMenu() {
  el.menuSheet.classList.remove('open');
  el.menuSheet.setAttribute('aria-hidden', 'true');
  el.menuBackdrop.hidden = true;
  document.body.classList.remove('menu-open');
}

el.form.addEventListener('submit', event => { event.preventDefault(); runSearch(el.input.value); });
document.querySelectorAll('[data-char]').forEach(button => button.addEventListener('click', () => runSearch(button.dataset.char)));
el.theme.addEventListener('click', () => setDark());
document.querySelector('#menuThemeBtn').addEventListener('click', () => setDark());
document.querySelectorAll('[data-menu-open]').forEach(button => button.addEventListener('click', openMenu));
document.querySelectorAll('[data-menu-close]').forEach(button => button.addEventListener('click', closeMenu));
el.menuBackdrop.addEventListener('click', closeMenu);
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });

(async function init() {
  try {
    state.dark = localStorage.getItem('lookup-c1-2-theme') === 'dark';
    document.body.classList.toggle('dark', state.dark);
    state.index = await fetchJson(SAMPLE_INDEX_URL);
    await runSearch('休');
  } catch (error) {
    el.loading.textContent = `Không thể khởi động prototype: ${error.message}`;
  }
})();

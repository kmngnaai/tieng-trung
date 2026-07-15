const SCRIPT_BASE_URL = (() => {
  const script = document.currentScript;
  if (script?.src) return new URL('./', script.src);
  return new URL('./', window.location.href);
})();
const resolveAssetUrl = relativePath => new URL(relativePath, SCRIPT_BASE_URL).href;
const UNIFIED_BASE_URL = resolveAssetUrl('../../data/learning/unified-lookup/all-sources/');
const UNIFIED_INDEX_URL = new URL('unified-target-index.json', UNIFIED_BASE_URL).href;
const UNIFIED_SEARCH_URL = new URL('search-index.json', UNIFIED_BASE_URL).href;
const SINGLE_CHAR_INDEX_URL = '../../data/learning/character-enrichment/hsk1-3-single/index.json';
const SINGLE_CHAR_BASE_URL = '../../data/learning/character-enrichment/hsk1-3-single/';
const SINGLE_CHAR_RADICAL_INDEX_URL = '../../data/learning/character-enrichment/hsk1-3-single/radical-character-index.json';
const LOCAL_CHAR_BASE = '../../data/chars/';
const HSK_LOOKUP_URL = '../../data/learning/hsk/hsk_flashcard_lookup.json';
const HSK_LEVEL_URLS = [1, 2, 3].map(level => `../../data/learning/hsk/hsk_${level}.json`);
const WORD_INDEX_URL = '../../data/learning/word-enrichment/hsk1-3/index.json';
const WORD_SEARCH_INDEX_URL = '../../data/learning/word-enrichment/hsk1-3/search_index.json';
const HANZI_DATA_BASE = 'https://cdn.jsdelivr.net/npm/hanzi-writer-data@latest/';
const RADICAL_NOTES_URL = '../../data/learning/radicals/radical_learning_notes.json';
const CURATED_CHAR_INDEX_URL = 'data/index.json';
const CURATED_CHAR_BASE_URL = '';

const state = {
  singleCharacterIndex: null,
  singleCharacterRadicalIndex: null,
  hskLookup: null,
  hskLevelItems: null,
  wordIndex: null,
  wordSearchIndex: null,
  current: null,
  currentQuery: '',
  dark: false,
  writer: null,
  writerChar: '',
  outlineVisible: true,
  radicalNotes: null,
  curatedCharacterIndex: null,
  unifiedIndex: null,
  unifiedSearch: null,
  unifiedBuckets: {},
  navigationStack: [],
  pendingRestore: null
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
const normalizeViText = value => String(value || '').toLowerCase().replace(/[^a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ0-9\u3400-\u9fff]+/g, ' ').replace(/\s+/g, ' ').trim();
const normalizeSearchText = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();

const targetOf = data => clean(data?.char || data?.word || data?.target || '');
const extractHanCharacters = value => [...new Set([...String(value || '')].filter(ch => isSingleHan(ch)))];

function currentSectionId(sourceElement) {
  return sourceElement?.closest('section')?.id || '';
}

function pushNavigationContext(sourceElement) {
  const target = targetOf(state.current);
  if (!target) return;
  state.navigationStack.push({
    target,
    scrollY: window.scrollY || document.documentElement.scrollTop || 0,
    sectionId: currentSectionId(sourceElement)
  });
  if (state.navigationStack.length > 20) state.navigationStack.shift();
}

async function openTargetWithContext(target, sourceElement = null) {
  const next = clean(target);
  if (!next) return;
  const current = targetOf(state.current);
  if (current && current !== next) pushNavigationContext(sourceElement);
  await runSearch(next, { skipHistory: true });
}

async function restoreParentTarget() {
  const parent = state.navigationStack.pop();
  if (!parent) return;
  state.pendingRestore = parent;
  await runSearch(parent.target, { skipHistory: true });
}


async function loadUnifiedIndex() {
  if (state.unifiedIndex) return state.unifiedIndex;
  const payload = await fetchJson(UNIFIED_INDEX_URL);
  state.unifiedIndex = payload?.targets || {};
  return state.unifiedIndex;
}
async function loadUnifiedSearch() {
  if (state.unifiedSearch) return state.unifiedSearch;
  const payload = await fetchJson(UNIFIED_SEARCH_URL);
  state.unifiedSearch = payload?.items || [];
  return state.unifiedSearch;
}
async function loadUnifiedRecord(target) {
  const index = await loadUnifiedIndex();
  const bucket = index[target];
  if (!bucket) return null;
  if (!/^[0-9A-F]{2}$/i.test(String(bucket))) {
    throw new Error(`Index Tra không hợp lệ cho “${target}”: bucket ${bucket}`);
  }
  if (!state.unifiedBuckets[bucket]) {
    const bucketUrl = new URL(`records/${bucket}.json`, UNIFIED_BASE_URL).href;
    const payload = await fetchJson(bucketUrl);
    state.unifiedBuckets[bucket] = payload?.records || {};
  }
  const raw = state.unifiedBuckets[bucket]?.[target];
  if (!raw) {
    throw new Error(`Bucket ${bucket} không chứa record “${target}”.`);
  }
  return adaptUnifiedRecord(raw);
}

async function runUnifiedRuntimeSelfCheck(sampleTargets = ['一', '青', '清', '亲人', '学习']) {
  const report = { ok: true, baseUrl: UNIFIED_BASE_URL, checks: [] };
  try {
    const index = await loadUnifiedIndex();
    report.checks.push({ name: 'unified-index', ok: Object.keys(index).length > 0, count: Object.keys(index).length });
    const search = await loadUnifiedSearch();
    report.checks.push({ name: 'search-index', ok: Array.isArray(search) && search.length > 0, count: search.length });
    for (const target of sampleTargets) {
      const record = await loadUnifiedRecord(target);
      report.checks.push({ name: `record:${target}`, ok: Boolean(record), bucket: index[target] || '' });
    }
  } catch (error) {
    report.ok = false;
    report.error = error.message;
  }
  report.ok = report.ok && report.checks.every(item => item.ok);
  window.__TRA_RUNTIME_CHECK__ = report;
  return report;
}
window.runUnifiedRuntimeSelfCheck = runUnifiedRuntimeSelfCheck;
function adaptUnifiedRadical(raw) {
  if (!raw || raw.status !== 'resolved') return null;
  return {
    status: 'verified-local', radicalId: raw.id || '', mainForm: raw.mainForm || '', variant: raw.inputForm || '',
    nameVi: raw.displayNameVi || '', pinyin: raw.pinyin || '', hanViet: raw.hanViet || '', meaningVi: raw.meaningVi || '',
    kangxiNo: raw.kangxiNo || null, evidenceLabel: `Đối chiếu 214 bộ · ${raw.resolutionType || ''}`
  };
}
function adaptUnifiedRecord(raw) {
  const single = raw.targetType === 'single-character';
  const pronunciation = { pinyin: raw.pinyin ? [raw.pinyin] : [], hanViet: raw.hanViet || '' };
  const meaningSenses = [{ meaningShortVi: raw.meaningShortVi || '', meaningFullVi: raw.meaningFullVi || '', reviewStatus: 'reviewed-local' }];
  const components = (raw.components || []).map(item => ({
    char: item.char || item.character || '', role: item.role || 'source-component',
    roleVi: item.roleVi || (item.role === 'semantic' ? 'biểu nghĩa' : item.role === 'phonetic' ? 'biểu âm' : 'thành phần'),
    pinyin: item.pinyin || '', hanViet: item.hanViet || '', meaningVi: item.meaningVi || '', reviewStatus: 'reviewed-local'
  })).filter(item => item.char);
  const grammarLinks = (raw.grammar || []).map((item, index) => ({
    id: item.grammarId || item.id || `${raw.target || 'target'}-grammar-${index + 1}`,
    grammarTopic: item.topic || item.title || 'Cách dùng',
    title: item.title || item.topic || 'Cách dùng',
    syntax: item.syntax || item.pattern || '',
    partOfSpeech: item.partOfSpeech || item.wordType || '',
    usageNoteVi: item.usageNoteVi || item.explanationVi || item.explanation || '',
    explanationVi: item.explanationVi || item.explanation || '',
    tipsVi: item.tipsVi || item.tipVi || '',
    attentionsVi: item.attentionsVi || item.attentionVi || item.noteVi || '',
    matchedExample: item.matchedExample || item.example?.chinese || item.exampleZh || '',
    examplePinyin: item.example?.pinyin || item.examplePinyin || '',
    exampleMeaningVi: item.example?.meaningVi || item.exampleMeaningVi || '',
    examples: (item.examples || []).map(row => ({
      chinese: row.chinese || row.zh || '',
      pinyin: row.pinyin || '',
      meaningVi: row.meaningVi || row.vietnamese || row.vi || ''
    })).filter(row => row.chinese),
    tipsVi: item.tipsVi || item.tipVi || '',
    attentionsVi: item.attentionsVi || item.attentionVi || item.noteVi || '',
    source: item.sourceFile || item.source || '',
    level: item.level || item.hskLevel || '',
    curriculum: item.curriculum || '',
    chapter: item.chapter || '',
    reviewStatus: 'reviewed-local'
  }));
  const sources = (raw.sources || []).map((item, index) => ({ sourceId: `${item.file || 'source'}-${index}`, title: item.file || 'Dữ liệu local', reviewStatus: 'reviewed-local' }));
  if (single) {
    const memoryText = raw.memory?.reviewedStory?.memoryStoryVi || raw.memory?.reviewedStory?.textVi || raw.memory?.characterStructure?.conclusion || '';
    return {
      schemaVersion: raw.schemaVersion, type: 'character', char: raw.target, pronunciation, meaningSenses,
      characterInfo: { strokeCount: raw.characters?.[0]?.strokeCount ?? null, structureVi: '', formationTypeVi: '', radical: adaptUnifiedRadical(raw.radical) },
      components,
      etymology: { standardExplanationVi: raw.memory?.characterStructure?.explanation?.join(' ') || '', confidence: components.length ? 'source-backed' : 'not-available' },
      learningStory: { memoryStoryVi: memoryText, reviewStatus: memoryText ? 'reviewed-local' : 'not-available' },
      vocabulary: { compounds: [], relatedWords: raw.relatedWords || [], collocations: raw.collocations || [] },
      sentences: raw.sentences || [], grammarLinks,
      sameRadicalCharacters: (raw.radicalComponentOf || []).map(item => ({ word: item.char, pinyin: item.pinyin || '', meaningVi: item.meaningVi || '', reviewStatus: 'reviewed-local' })),
      sources, review: { status: 'unified-source-backed', warnings: [] }
    };
  }
  return {
    schemaVersion: raw.schemaVersion, type: 'word', word: raw.target, pronunciation, meaningSenses,
    characterInfo: { structureVi: 'Từ nhiều chữ', radical: null }, components,
    etymology: { standardExplanationVi: raw.wordTypeExplanation || '', confidence: raw.wordTypeExplanation ? 'source-backed' : 'not-available' },
    learningStory: { memoryStoryVi: '', reviewStatus: 'not-available' },
    vocabulary: { compounds: raw.relatedWords || [], relatedWords: [], collocations: raw.collocations || [] },
    sentences: raw.sentences || [], grammarLinks,
    sameRadicalCharacters: (raw.characters || []).map(item => ({ word: item.char, pinyin: item.pinyin || '', meaningVi: item.meaningVi || '', reviewStatus: 'reviewed-local' })),
    sources, review: { status: 'unified-source-backed', warnings: [] }
  };
}
async function safeFetchJson(url, fallback = null) {
  try { return await fetchJson(url); } catch { return fallback; }
}

function reviewed(item) {
  const status = item?.reviewStatus || '';
  return !status || status === 'reviewed' || status === 'reviewed-local';
}

function meaningSummary(data) {
  const senses = data.meaningSenses || data.meanings || [];
  const values = senses.filter(reviewed).map(x => x.meaningShortVi || x.meaningVi || x.meaningFullVi || x.value).filter(Boolean);
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

async function fetchJson(url, options = {}) {
  const absoluteUrl = new URL(url, SCRIPT_BASE_URL).href;
  const attempts = Math.max(1, Number(options.attempts || 2));
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 15000));
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(absoluteUrl, {
        cache: attempt === 1 ? 'no-store' : 'reload',
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new Error(`JSON không hợp lệ: ${error.message}`);
      }
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, 180));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const reason = lastError?.name === 'AbortError'
    ? `quá thời gian ${timeoutMs}ms`
    : (lastError?.message || 'lỗi mạng không xác định');
  throw new Error(`Không tải được dữ liệu Tra: ${absoluteUrl} (${reason})`);
}

async function loadHskLookup() {
  if (state.hskLookup) return state.hskLookup;
  const payload = await safeFetchJson(HSK_LOOKUP_URL, { items: {} });
  state.hskLookup = payload?.items || {};
  return state.hskLookup;
}

function exactHskItemForChar(char, lookup) {
  return lookup?.[char] || null;
}

async function loadHskLevelItems() {
  if (state.hskLevelItems) return state.hskLevelItems;
  const payloads = await Promise.all(HSK_LEVEL_URLS.map(url => safeFetchJson(url, { items: [] })));
  state.hskLevelItems = payloads.flatMap((payload, index) =>
    (Array.isArray(payload?.items) ? payload.items : []).map(item => ({ ...item, __hskFileLevel: index + 1 }))
  );
  return state.hskLevelItems;
}



async function loadCuratedCharacterIndex() {
  if (state.curatedCharacterIndex) return state.curatedCharacterIndex;
  const payload = await safeFetchJson(CURATED_CHAR_INDEX_URL, { characters: {} });
  state.curatedCharacterIndex = payload?.characters || {};
  return state.curatedCharacterIndex;
}

function normalizeCuratedCharacterRecord(raw = {}) {
  const data = JSON.parse(JSON.stringify(raw || {}));
  const radical = data.characterInfo?.radical || null;
  if (radical) {
    data.characterInfo.radical = {
      ...radical,
      status: radical.status || 'reviewed',
      radicalId: radical.radicalId || radical.id || '',
      evidenceLabel: radical.evidenceLabel || 'Bộ thủ từ hồ sơ đã kiểm duyệt'
    };
  }
  const vocabulary = data.vocabulary || {};
  data.vocabulary = {
    compounds: Array.isArray(vocabulary.compounds) ? vocabulary.compounds : [],
    relatedWords: Array.isArray(vocabulary.relatedWords) ? vocabulary.relatedWords : [],
    collocations: Array.isArray(vocabulary.collocations) ? vocabulary.collocations : []
  };
  data.sentences = (data.sentences || []).map(item => ({
    ...item,
    containsTarget: item.containsTarget !== false,
    reviewStatus: item.reviewStatus || 'reviewed'
  }));
  data.review = data.review || { status: 'reviewed', warnings: [] };
  data.type = 'character';
  return data;
}

function mergeCharacterRecords(base, curatedRaw) {
  if (!curatedRaw) return base;
  const curated = normalizeCuratedCharacterRecord(curatedRaw);
  if (!base) return curated;
  const baseVocabulary = base.vocabulary || {};
  const curatedVocabulary = curated.vocabulary || {};
  const mergeRows = (a, b, keyFn) => uniqueBy([...(a || []), ...(b || [])], keyFn);
  return {
    ...base,
    ...curated,
    pronunciation: curated.pronunciation || base.pronunciation,
    meaningSenses: curated.meaningSenses?.length ? curated.meaningSenses : base.meaningSenses,
    characterInfo: {
      ...(base.characterInfo || {}),
      ...(curated.characterInfo || {}),
      radical: curated.characterInfo?.radical || base.characterInfo?.radical || null
    },
    components: curated.components?.length ? curated.components : (base.components || []),
    etymology: clean(curated.etymology?.standardExplanationVi)
      ? curated.etymology
      : (base.etymology || curated.etymology || {}),
    learningStory: clean(curated.learningStory?.memoryStoryVi)
      ? curated.learningStory
      : (base.learningStory || curated.learningStory || {}),
    vocabulary: {
      compounds: mergeRows(curatedVocabulary.compounds, baseVocabulary.compounds, item => item.word || item.text),
      relatedWords: mergeRows(curatedVocabulary.relatedWords, baseVocabulary.relatedWords, item => item.word || item.text),
      collocations: mergeRows(curatedVocabulary.collocations, baseVocabulary.collocations, item => item.word || item.text)
    },
    sentences: mergeRows(curated.sentences, base.sentences, item => item.chinese),
    grammarLinks: mergeRows(curated.grammarLinks, base.grammarLinks, item => [item.title,item.grammarTopic,item.syntax,item.usageNoteVi].join('|')),
    sameRadicalCharacters: mergeRows(curated.sameRadicalCharacters, base.sameRadicalCharacters, item => item.word),
    sources: mergeRows(curated.sources, base.sources, item => item.sourceId || item.sourceTitle || item.title || JSON.stringify(item)),
    review: curated.review || base.review
  };
}

async function loadCuratedCharacterRecord(char) {
  const index = await loadCuratedCharacterIndex();
  const path = index?.[char];
  if (!path) return null;
  return safeFetchJson(`${CURATED_CHAR_BASE_URL}${path}`, null);
}

async function loadSingleCharacterIndex() {
  if (state.singleCharacterIndex) return state.singleCharacterIndex;
  const payload = await safeFetchJson(SINGLE_CHAR_INDEX_URL, {});
  state.singleCharacterIndex = payload && typeof payload === 'object' ? payload : {};
  return state.singleCharacterIndex;
}

async function loadSingleCharacterRadicalIndex() {
  if (state.singleCharacterRadicalIndex) return state.singleCharacterRadicalIndex;
  const payload = await safeFetchJson(SINGLE_CHAR_RADICAL_INDEX_URL, {});
  state.singleCharacterRadicalIndex = payload && typeof payload === 'object' ? payload : {};
  return state.singleCharacterRadicalIndex;
}

function publishableRadicalStatus(status = '') {
  return ['verified', 'verified-local', 'reviewed'].includes(status);
}

function normalizeSingleCharacterRadical(raw = {}) {
  if (!publishableRadicalStatus(raw.status)) return null;
  return {
    status: raw.status === 'verified' ? 'verified-local' : raw.status,
    source: raw.source || '',
    radicalId: raw.radicalId || '',
    mainForm: raw.mainForm || '',
    variant: raw.inputForm || raw.sideForm || '',
    nameVi: raw.displayNameVi || '',
    pinyin: raw.pinyin || '',
    hanViet: raw.hanViet || '',
    meaningVi: raw.meaningVi || '',
    kangxiNo: raw.kangxiNo || null,
    strokeCount: raw.strokeCount ?? null,
    evidenceLabel: 'Bộ thủ theo dữ liệu local đã đối chiếu'
  };
}

function normalizeSingleCharacterComponent(item = {}) {
  const char = item.character || item.char || '';
  const role = item.role || 'unknown';
  const roleViMap = {
    semantic: 'biểu nghĩa', phonetic: 'biểu âm', deleted: 'đã lược trong giản thể',
    structural: 'thành phần', unknown: 'vai trò đang đối chiếu'
  };
  return {
    char,
    role,
    roleVi: roleViMap[role] || role,
    pinyin: item.pinyin || '',
    hanViet: item.hanViet || '',
    meaningVi: item.meaningVi || item.meaningEn || '',
    soundHint: role === 'phonetic' ? (item.pinyin || '') : '',
    source: item.source || '',
    reviewStatus: item.reviewStatus || 'needs-review'
  };
}

function normalizeSingleCharacterGrammar(raw, exactHsk) {
  const meanings = raw.meanings || {};
  const rows = [];
  if (clean(meanings.wordType) || clean(meanings.wordTypeExplanation) || clean(meanings.usageNoteVi)) {
    rows.push({
      title: `Cách dùng ${raw.char}`,
      partOfSpeech: clean(meanings.wordType),
      explanationVi: clean(meanings.wordTypeExplanation),
      usageNoteVi: clean(meanings.usageNoteVi),
      source: 'hsk1-3-single',
      reviewStatus: 'reviewed-local'
    });
  }
  if (exactHsk && (clean(exactHsk.usageNote) || clean(exactHsk.wordTypeExplanation) || clean(exactHsk.wordType))) {
    rows.push({
      title: `Cách dùng ${raw.char}`,
      partOfSpeech: clean(exactHsk.wordType),
      explanationVi: clean(exactHsk.wordTypeExplanation),
      usageNoteVi: clean(exactHsk.usageNote),
      source: `hsk_${exactHsk.__hskFileLevel || raw.primaryHskLevel || 1}.json`,
      reviewStatus: 'reviewed-local'
    });
  }
  return uniqueBy(rows, item => [item.title,item.partOfSpeech,item.explanationVi,item.usageNoteVi].join('|'));
}

async function normalizeSingleCharacterRecord(raw, exactHsk = null) {
  const char = raw.char;
  const radical = normalizeSingleCharacterRadical(raw.characterInfo?.radical || {});
  const radicalIndex = radical?.radicalId ? await loadSingleCharacterRadicalIndex() : {};
  const sameRadicalCharacters = radical?.radicalId
    ? (radicalIndex[radical.radicalId] || []).filter(item => item.word !== char).slice(0, 12).map(item => ({...item, reviewStatus:'reviewed-local'}))
    : [];
  const components = (raw.components || []).map(normalizeSingleCharacterComponent).filter(item => item.char);
  const explanationRows = (raw.structureExplanations || []).map(item => item.textVi || item.textEn || '').filter(Boolean);
  const relatedWords = (raw.relatedWords || []).filter(item => item.word && item.word.includes(char) && item.pinyin && item.meaningVi).map(item => ({
    ...item,
    relationType: 'contains-target-character',
    hskLevel: item.hskLevel ? `HSK ${item.hskLevel}` : '',
    reviewStatus: 'reviewed-local'
  }));
  const sentences = (raw.sentences || []).filter(item => item.chinese?.includes(char) && item.pinyin && item.meaningVi).map(item => ({
    ...item,
    target: char,
    containsTarget: true,
    reviewStatus: 'reviewed-local'
  }));
  return {
    schemaVersion: 'lookup-adapter-c2a20-single-v1',
    id: `char:${char}`,
    type: 'character',
    char,
    simplified: char,
    traditional: raw.characterInfo?.traditional || char,
    pronunciation: { pinyin: [raw.pronunciation?.pinyin || ''], hanViet: raw.pronunciation?.hanViet || '' },
    meaningSenses: [{
      meaningShortVi: raw.meanings?.shortVi || '',
      meaningFullVi: raw.meanings?.fullVi || raw.meanings?.shortVi || '',
      meaningVi: raw.meanings?.shortVi || raw.meanings?.fullVi || '',
      partOfSpeech: raw.meanings?.wordType || '',
      reviewStatus: 'reviewed-local'
    }],
    characterInfo: {
      strokeCount: raw.characterInfo?.strokeCount ?? null,
      structureType: raw.characterInfo?.structureType || '',
      formationTypeVi: raw.characterInfo?.formationStatus === 'source-backed' ? (raw.characterInfo?.formationTypeVi || '') : '',
      radical
    },
    components,
    etymology: {
      standardExplanationVi: explanationRows.join(' '),
      confidence: raw.etymology?.reviewStatus || raw.characterInfo?.formationStatus || 'not-available'
    },
    learningStory: { memoryStoryVi: raw.learningStory?.memoryStoryVi || '', reviewStatus: raw.learningStory?.reviewStatus || 'not-available' },
    vocabulary: { compounds: [], relatedWords, collocations: [] },
    sentences,
    grammarLinks: normalizeSingleCharacterGrammar(raw, exactHsk),
    sameRadicalCharacters,
    sources: (raw.sources || []).map(source => typeof source === 'string' ? {title: source, reviewStatus:'reviewed-local'} : source),
    review: {
      status: raw.quality?.status || 'PARTIAL',
      warnings: [
        !radical && raw.characterInfo?.radical?.status ? `Bộ thủ chưa được xuất bản vì trạng thái ${raw.characterInfo.radical.status}.` : '',
        raw.etymology?.reviewStatus === 'needs-review' ? 'Chiết tự PDF mới là ứng viên, chưa được đánh dấu đã duyệt.' : ''
      ].filter(Boolean)
    },
    hskLevel: raw.primaryHskLevel ? `HSK ${raw.primaryHskLevel}` : ''
  };
}

async function loadWordIndex() {
  if (state.wordIndex) return state.wordIndex;
  const payload = await safeFetchJson(WORD_INDEX_URL, { words: {} });
  state.wordIndex = payload?.words || {};
  return state.wordIndex;
}


async function loadWordSearchIndex() {
  if (state.wordSearchIndex) return state.wordSearchIndex;
  const payload = await safeFetchJson(WORD_SEARCH_INDEX_URL, { items: [] });
  state.wordSearchIndex = Array.isArray(payload?.items) ? payload.items : [];
  return state.wordSearchIndex;
}

async function loadNormalizedWordRecord(word) {
  const index = await loadWordIndex();
  const path = index?.[word];
  if (!path) return null;
  const raw = await safeFetchJson(`../../data/learning/word-enrichment/hsk1-3/${path}`, null);
  if (!raw) return null;
  const pinyin = raw.pronunciation?.primary || raw.pronunciation?.readings?.[0]?.pinyin || '';
  const meaningSenses = (raw.meaningSenses || []).map(item => ({ ...item, meaningVi: item.meaningShortVi || item.meaningVi || item.meaningFullVi || '', reviewStatus: item.reviewStatus || 'reviewed-local' }));
  const primaryLevel = raw.hsk?.primaryLevel;
  const compounds = (raw.vocabulary?.compounds || []).map(item => ({
    ...item,
    hskLevel: item.hskLevel || (item.hskLevels?.length ? `HSK ${Math.min(...item.hskLevels)}` : ''),
    reviewStatus: item.reviewStatus || 'reviewed-local'
  }));
  const collocations = (raw.vocabulary?.collocations || []).map(item => ({
    ...item,
    word: item.word || item.text,
    reviewStatus: item.reviewStatus || 'reviewed-local'
  }));
  return {
    ...raw,
    char: raw.word,
    pronunciation: { pinyin: [pinyin], hanViet: '' },
    meaningSenses,
    characterInfo: { strokeCount: null, structureType: '', formationTypeVi: 'từ nhiều chữ', radical: {} },
    components: (raw.characters || [...raw.word]).map(char => ({ char, role: 'structural', roleVi: 'chữ trong từ', meaningVi: '', reviewStatus: 'reviewed' })),
    etymology: {
      standardExplanationVi: raw.wordTypeExplanations?.[0] || 'Đây là từ nhiều chữ. Chọn từng chữ bên dưới để xem cấu tạo và luyện viết.',
      confidence: 'local-normalized'
    },
    learningStory: { memoryStoryVi: '', reviewStatus: 'not-available' },
    vocabulary: { compounds, relatedWords: [], collocations },
    sameRadicalCharacters: (raw.characters || [...raw.word]).map(char => ({ word: char, pinyin: '', meaningVi: '', reviewStatus: 'reviewed' })),
    grammarLinks: raw.grammarLinks || [],
    sentences: raw.sentences || [],
    review: raw.review || { status: 'local-normalized', warnings: [] },
    sources: raw.sources || [],
    hskLevel: primaryLevel ? `HSK ${primaryLevel}` : ''
  };
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
  const curatedRaw = await loadCuratedCharacterRecord(char);
  const singleIndex = await loadSingleCharacterIndex();
  const meta = singleIndex?.[char];
  let base = null;
  if (meta?.path) {
    const raw = await safeFetchJson(`${SINGLE_CHAR_BASE_URL}${meta.path}`, null);
    if (raw) {
      const hskItems = await loadHskLevelItems();
      const exact = hskItems.find(item => item.word === char) || exactHskItemForChar(char, lookup);
      base = await normalizeSingleCharacterRecord(raw, exact);
    }
  }
  if (!base) {
    const raw = await safeFetchJson(`${LOCAL_CHAR_BASE}${codePointHex(char)}.json`, null);
    base = raw ? buildFallbackCharacter(raw, exactHskItemForChar(char, lookup)) : null;
  }
  return mergeCharacterRecords(base, curatedRaw);
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
      radical: raw.radical ? { status: 'unverified-local', mainForm: raw.radical, variant: raw.radical, nameVi: '', pinyin: '', meaningVi: '', evidenceLabel: 'Chưa đối chiếu với dữ liệu 214 bộ thủ' } : null
    },
    components: [],
    etymology: { standardExplanationVi: '', confidence: 'not-reviewed' },
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
  const normalized = await loadNormalizedWordRecord(word);
  if (normalized) {
    const lookup = await loadHskLookup();
    const chars = [...word];
    const charRecords = (await Promise.all(chars.map(char => loadCharacterRecord(char, lookup)))).filter(Boolean);
    normalized.components = charRecords.map((record, index) => ({
      char: chars[index] || record.char,
      role: 'structural',
      roleVi: 'chữ trong từ',
      meaningVi: meaningSummary(record),
      soundHint: first(record.pronunciation?.pinyin),
      reviewStatus: 'reviewed'
    }));
    normalized.sameRadicalCharacters = charRecords.map(record => ({
      word: record.char,
      pinyin: first(record.pronunciation?.pinyin),
      meaningVi: meaningSummary(record),
      reviewStatus: 'reviewed'
    }));
    return normalized;
  }
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
      hskLevel: item.hsk ? `HSK ${item.hsk}` : (item.__hskFileLevel ? `HSK ${item.__hskFileLevel}` : 'HSK local'),
      source: [`hsk_${exact.__hskFileLevel || 1}.json`],
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
    source: `hsk_${exact.__hskFileLevel || 1}.json`,
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
    source: `hsk_${exact.__hskFileLevel || 1}.json`,
    sourceRef: `hsk_${exact.__hskFileLevel || 1}.json:${word}.examples`,
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
    source: `hsk_${exact.__hskFileLevel || 1}.json`,
    reviewStatus: 'reviewed'
  });
  if (clean(exact.wordTypeExplanation) && clean(exact.wordTypeExplanation) !== clean(exact.usageNote)) grammarLinks.push({
    grammarTopic: 'Loại từ và chức năng',
    syntax: clean(exact.wordType),
    matchedExample: clean(exact.wordTypeExplanation),
    source: `hsk_${exact.__hskFileLevel || 1}.json`,
    reviewStatus: 'reviewed'
  });

  const componentCharacters = charRecords.map(record => ({
    word: record.char,
    pinyin: first(record.pronunciation?.pinyin),
    meaningVi: meaningSummary(record),
    reviewStatus: 'reviewed'
  }));

  const sourceRoutes = (exact.routes || []).filter(route => ['hsk', 'new_hsk'].includes(route.libraryId) && Number(route.levelNo) <= 3);
  return {
    schemaVersion: 'runtime-local-word-enrichment-v2',
    id: `word:${word}`,
    type: 'word',
    char: word,
    simplified: exact.simplified || word,
    traditional: exact.traditional || word,
    pronunciation: { pinyin: [exact.pinyin || hskItem?.pinyin || ''], hanViet: '' },
    meaningSenses: [{ partOfSpeech: exact.wordType || '', meaningVi: exact.meaningVi || exact.translationVi || hskItem?.meaningVi || 'Chưa có nghĩa local', source: [`hsk_${exact.__hskFileLevel || 1}.json`], reviewStatus: 'reviewed' }],
    characterInfo: { strokeCount: null, structureType: '', formationTypeVi: 'từ nhiều chữ', radical: {} },
    components,
    etymology: { standardExplanationVi: clean(exact.wordTypeExplanation) || 'Đây là từ nhiều chữ. Chọn từng chữ bên dưới để xem cấu tạo và luyện viết.', confidence: 'local-reviewed' },
    learningStory: { memoryStoryVi: '', reviewStatus: 'not-available' },
    vocabulary: { compounds, relatedWords: [], collocations },
    sentences,
    grammarLinks,
    sameRadicalCharacters: componentCharacters,
    sources: [
      { sourceId: `hsk_${exact.__hskFileLevel || 1}_json`, title: `data/learning/hsk/hsk_${exact.__hskFileLevel || 1}.json`, reviewStatus: 'reviewed' },
      ...sourceRoutes.slice(0, 4).map(route => ({ sourceId: route.sectionId, title: `${route.libraryName} · ${route.sectionTitle}`, reviewStatus: 'reviewed' }))
    ],
    review: { status: 'local-enriched', warnings: sentences.length ? [] : ['Chưa tìm thấy câu chứa đúng từ trong dữ liệu HSK 1–3 hiện có.'] }
  };
}


function radicalSearchText(note = {}) {
  const examples = note.examples || {};
  const words = examples.words || note.words || [];
  const sentences = examples.sentences || note.sentences || [];
  return normalizeSearchText([
    note.mainForm, note.sideForm, ...(note.variants || []),
    note.displayNameVi, note.pinyin, note.hanViet,
    note.shortMeaningVi, note.meaningVi, note.originMeaning,
    note.recognition, note.memoryVi, note.hintVi,
    ...words.flatMap(item => [item.word, item.chinese, item.pinyin, item.meaningVi, item.meaning_vi]),
    ...sentences.flatMap(item => [item.zh, item.chinese, item.pinyin, item.meaningVi, item.meaning_vi])
  ].filter(Boolean).join(' '));
}

async function searchExistingData(query) {
  const qVi = normalizeViText(query); const q = normalizeSearchText(query); if (!q) return [];
  const items = await loadUnifiedSearch(); const results = [];
  for (const item of items) {
    const word = normalizeSearchText(item.target); const p = normalizeSearchText(item.pinyin || ''); const mVi = normalizeViText(item.meaningVi || ''); const m = normalizeSearchText(item.meaningVi || '');
    let score = 0;
    if (word === q) score = 1000; else if (p === q) score = 950; else if (mVi === qVi) score = 920;
    else if (word.startsWith(q)) score = 820; else if (p.startsWith(q)) score = 780; else if (mVi.startsWith(qVi)) score = 740;
    else if (` ${mVi} `.includes(` ${qVi} `)) score = 650; else if (m.includes(q)) score = 420;
    if (!score) continue;
    results.push({ kind:'word', target:item.target, title:item.target, pinyin:item.pinyin || '', meaningVi:item.meaningVi || '', meta:[...(item.libraries || []),...(item.levels || []).map(x=>`Cấp ${x}`)].join(' · '), score });
  }
  const notes = await safeFetchJson(RADICAL_NOTES_URL, {});
  for (const note of Object.values(notes || {})) {
    if (!note) continue; const form = note.sideForm || note.mainForm || first(note.variants) || ''; const text = radicalSearchText(note); let score=0;
    if ([form,note.displayNameVi,note.pinyin,note.hanViet].some(x=>normalizeSearchText(x)===q)) score=880; else if (text.includes(q)) score=280;
    if (score) results.push({kind:'radical',target:form,title:form,pinyin:note.pinyin||'',meaningVi:note.displayNameVi||'',meta:note.kangxiNo?`Bộ Khang Hy số ${note.kangxiNo}`:'Bộ thủ',score});
  }
  return uniqueBy(results.sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title)),x=>`${x.kind}:${x.target}`).slice(0,24);
}

function renderSearchResults(payload) {
  state.current = null;
  const results = payload.results || [];
  el.loading.hidden = true;
  el.message.hidden = true;
  el.view.hidden = false;
  el.view.innerHTML = `<section class="panel search-results-panel">
    ${panelTitle('⌕', `Kết quả cho “${payload.query}”`)}
    <p class="search-results-note">Tìm trong nghĩa tiếng Việt, pinyin, bộ thủ, từ liên quan và câu mẫu từ dữ liệu local hiện có.</p>
    <div class="search-results-list">${results.map(item => {
      const attr = item.kind === 'radical' ? `data-open-radical="${escapeHtml(item.target)}"` : `data-search-char="${escapeHtml(item.target)}"`;
      return `<button class="search-result-card" type="button" ${attr}>
        <span class="search-result-main"><strong>${escapeHtml(item.title)}</strong>${item.pinyin ? `<span>${escapeHtml(item.pinyin)}</span>` : ''}</span>
        <span class="search-result-meaning">${escapeHtml(item.meaningVi || '')}</span>
        <small>${escapeHtml(item.meta || '')}</small>
      </button>`;
    }).join('')}</div>
  </section>`;
  bindDynamicEvents();
}

async function resolveQuery(rawQuery) {
  const query = clean(rawQuery); if (!query) throw new Error('Hãy nhập chữ, từ hoặc pinyin cần tra.');
  if (isHanText(query)) {
    const exact = await loadUnifiedRecord(query); if (exact) return exact;
    const results = await searchExistingData(query); if (results.length) return { type:'search-results', query, results };
    throw new Error(`Không tìm thấy “${query}” trong dữ liệu hiện có.`);
  }
  const results = await searchExistingData(query);
  if (results.length === 1 && results[0].kind === 'word') { const exact = await loadUnifiedRecord(results[0].target); if (exact) return exact; }
  if (results.length) return { type:'search-results', query, results };
  throw new Error(`Không tìm thấy “${query}” trong dữ liệu hiện có.`);
}

function componentCards(data) {
  const list = data.components || [];
  if (!list.length) return '';
  return list.map((component, index) => {
    const roleClass = component.role === 'semantic' ? 'semantic' : component.role === 'phonetic' ? 'phonetic' : 'unknown';
    const extra = component.soundHint ? ` · ${component.soundHint}` : '';
    return `${index ? '<div class="plus">+</div>' : ''}<button class="component-card ${roleClass}" type="button" data-search-char="${escapeHtml(component.char)}">
      <span class="component-char">${escapeHtml(component.char)}</span>
      <strong class="component-role">${escapeHtml(component.roleVi || component.role || '')}${escapeHtml(extra)}</strong>
      ${component.hanViet || component.pinyin ? `<span class="component-meta">${escapeHtml([component.hanViet, component.pinyin].filter(Boolean).join(' · '))}</span>` : ''}<span class="component-meaning">${escapeHtml(component.meaningVi || '')}</span>
    </button>`;
  }).join('');
}

function audioIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"></path><path d="M16 9.5c1.2 1.4 1.2 3.6 0 5M18.5 7c2.6 2.8 2.6 7.2 0 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg>`;
}

function vocabularyCards(items = [], limit = 6, kind = 'compound') {
  const list = items.filter(item => reviewed(item) && (item.word || item.text) && item.pinyin && item.meaningVi).slice(0, limit);
  if (!list.length) return `<div class="empty-state">Chưa có ${kind === 'collocation' ? 'kết hợp' : 'từ ghép'} đạt cổng chất lượng.</div>`;
  return `<div class="card-list">${list.map(item => {
    const target = item.word || item.text || '';
    const canOpen = kind === 'compound';
    return `<div class="word-card quality-card">
      ${canOpen ? `<button class="word-card-search" type="button" data-search-char="${escapeHtml(target)}" aria-label="Tra ${escapeHtml(target)}">` : `<div class="word-card-search">`}
        <span class="word-main"><strong>${escapeHtml(target)}</strong><span class="word-pinyin">${escapeHtml(item.pinyin)}</span></span>
        <span class="word-meaning">${escapeHtml(item.meaningVi)}</span>
      ${canOpen ? '</button>' : '</div>'}
      <div class="word-card-actions"><button class="word-speak-btn icon-audio-btn" type="button" data-speak="${escapeHtml(target)}" aria-label="Nghe phát âm ${escapeHtml(target)}">${audioIcon()}</button>${item.hskLevel ? `<span class="word-badge">${escapeHtml(item.hskLevel)}</span>` : ''}</div>
    </div>`;
  }).join('')}</div>`;
}

function componentWordCards(items = [], limit = 8) {
  const list = items.filter(item => reviewed(item) && item.word).slice(0, limit);
  if (!list.length) return '';
  return `<div class="card-list">${list.map(item => `<div class="word-card"><button class="word-card-search" type="button" data-search-char="${escapeHtml(item.word)}"><span class="word-main"><strong>${escapeHtml(item.word)}</strong><span class="word-pinyin">${escapeHtml(item.pinyin || '')}</span></span><span class="word-meaning">${escapeHtml(item.meaningVi || '')}</span></button>${item.pinyin ? `<div class="word-card-actions"><button class="word-speak-btn icon-audio-btn" type="button" data-speak="${escapeHtml(item.word)}">${audioIcon()}</button></div>` : ''}</div>`).join('')}</div>`;
}

function sentenceCards(items = [], initialLimit = 3) {
  const list = items.filter(item => reviewed(item) && item.containsTarget !== false && item.chinese && item.pinyin && item.meaningVi);
  if (!list.length) return '';
  const cards = list.map((item, index) => `<div class="sentence-card quality-card ${index >= initialLimit ? 'sentence-extra' : ''}" ${index >= initialLimit ? 'hidden' : ''}>
    <div class="sentence-top"><div class="zh">${escapeHtml(item.chinese)}</div><button class="word-speak-btn icon-audio-btn" type="button" data-speak="${escapeHtml(item.chinese)}" aria-label="Nghe câu">${audioIcon()}</button></div>
    <div class="py">${escapeHtml(item.pinyin)}</div>
    <div class="vi">${escapeHtml(item.meaningVi)}</div>
  </div>`).join('');
  const more = list.length > initialLimit
    ? `<button class="sentence-show-more" type="button" data-show-more-sentences aria-expanded="false">Xem thêm ${list.length - initialLimit} câu</button>`
    : '';
  return `<div class="card-list sentence-card-list">${cards}</div>${more}`;
}

function grammarMetaLabel(item) {
  const parts = [];
  if (item.curriculum) parts.push(item.curriculum === 'new-hsk' ? 'New HSK' : item.curriculum.toUpperCase());
  if (item.level) parts.push(`Cấp ${item.level}`);
  if (item.chapter) parts.push(`Bài ${item.chapter}`);
  return parts.join(' · ');
}

function grammarCards(items = [], limit = 8) {
  const list = items
    .filter(item => reviewed(item) && (item.title || item.grammarTopic || item.syntax || item.explanationVi || item.examples?.length))
    .slice(0, limit);
  if (!list.length) return '';

  return `<div class="grammar-list hsk-style-grammar-list">${list.map((item, index) => {
    const title = item.title || item.grammarTopic || 'Cách dùng';
    const meta = grammarMetaLabel(item);
    const examples = item.examples?.length || (item.matchedExample ? 1 : 0);
    const preview = item.syntax || item.explanationVi || '';
    return `<button class="grammar-preview-card" type="button" data-open-grammar="${index}" aria-label="Mở chi tiết ${escapeHtml(title)}">
      <span class="grammar-preview-meta">
        ${meta ? `<span class="grammar-level-badge">${escapeHtml(meta)}</span>` : '<span class="grammar-level-badge">NGỮ PHÁP</span>'}
        <span class="grammar-example-count">${examples} ví dụ</span>
      </span>
      <strong class="grammar-preview-title">${escapeHtml(title)}</strong>
      ${preview ? `<span class="grammar-preview-text">${escapeHtml(preview)}</span>` : '<span class="grammar-preview-text is-muted">Mở để xem dữ liệu nguồn.</span>'}
      <span class="grammar-preview-arrow" aria-hidden="true">›</span>
    </button>`;
  }).join('')}</div>`;
}

function ensureGrammarDialog() {
  let dialog = document.querySelector('#grammarDetailDialog');
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = 'grammarDetailDialog';
  dialog.className = 'grammar-detail-dialog';
  document.body.appendChild(dialog);
  dialog.addEventListener('click', event => {
    if (event.target === dialog || event.target.closest('[data-close-grammar]')) dialog.close();
  });
  dialog.addEventListener('close', () => window.speechSynthesis?.cancel());
  return dialog;
}

function grammarDetailBlock(label, text, tone = '') {
  if (!clean(text)) return '';
  return `<section class="grammar-popup-block ${tone ? `is-${tone}` : ''}"><h4>${escapeHtml(label)}</h4><p>${escapeHtml(text)}</p></section>`;
}

function openGrammarDetail(index) {
  const items = (state.current?.grammarLinks || []).filter(item => reviewed(item));
  const item = items[Number(index)];
  if (!item) return;
  const dialog = ensureGrammarDialog();
  const title = item.title || item.grammarTopic || 'Ngữ pháp';
  const meta = grammarMetaLabel(item);
  const examples = item.examples?.length
    ? item.examples
    : (item.matchedExample ? [{ chinese: item.matchedExample, pinyin: item.examplePinyin || '', meaningVi: item.exampleMeaningVi || '' }] : []);

  dialog.innerHTML = `<div class="grammar-dialog-shell">
    <div class="grammar-dialog-topbar">
      <button type="button" class="grammar-dialog-back" data-close-grammar>← Quay về Ngữ pháp</button>
      <button type="button" class="grammar-dialog-close" data-close-grammar aria-label="Đóng">×</button>
    </div>
    <section class="grammar-dialog-hero">
      <span class="grammar-dialog-kicker">NGỮ PHÁP / CÁCH DÙNG</span>
      <h3>${escapeHtml(title)}</h3>
      ${meta ? `<div class="grammar-dialog-meta"><span>${escapeHtml(meta)}</span></div>` : ''}
    </section>
    <div class="grammar-dialog-content">
      ${grammarDetailBlock('Loại từ', item.partOfSpeech, 'type')}
      ${grammarDetailBlock('Cấu trúc', item.syntax, 'syntax')}
      ${grammarDetailBlock('Cách dùng', item.usageNoteVi, 'usage')}
      ${item.explanationVi && item.explanationVi !== item.usageNoteVi ? grammarDetailBlock('Giải thích', item.explanationVi, 'explanation') : ''}
      ${grammarDetailBlock('Mẹo nhớ', item.tipsVi, 'tips')}
      ${grammarDetailBlock('Lưu ý', item.attentionsVi, 'attention')}
      ${examples.length ? `<section class="grammar-popup-examples"><div class="grammar-popup-examples-head"><h4>Ví dụ</h4><span>${examples.length} câu</span></div><div class="grammar-popup-example-list">${examples.map((row, i) => `<article class="grammar-popup-example-card"><span class="grammar-popup-example-index">${String(i + 1).padStart(2, '0')}</span><div class="grammar-popup-example-main"><strong>${escapeHtml(row.chinese)}</strong>${row.pinyin ? `<em>${escapeHtml(row.pinyin)}</em>` : ''}${row.meaningVi ? `<span>${escapeHtml(row.meaningVi)}</span>` : ''}</div><button class="word-speak-btn icon-audio-btn" type="button" data-speak="${escapeHtml(row.chinese)}" aria-label="Nghe ví dụ">${audioIcon()}</button></article>`).join('')}</div></section>` : ''}
      ${!item.syntax && !item.explanationVi && !item.usageNoteVi && !examples.length ? '<p class="grammar-popup-empty">Nguồn hiện chỉ xác định tên chủ điểm; chưa có nội dung chi tiết.</p>' : ''}
      <div class="grammar-popup-source">${item.source ? `<span>Nguồn: ${escapeHtml(item.source)}</span>` : ''}</div>
    </div>
  </div>`;
  dialog.querySelectorAll('[data-speak]').forEach(button => button.addEventListener('click', () => speak(button.dataset.speak)));
  if (!dialog.open) dialog.showModal();
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

function radicalAudioIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M4 9v6h4l5 4V5L8 9H4z"></path>
    <path d="M16 9.5c1.25 1.35 1.25 3.65 0 5"></path>
    <path d="M18.5 7c2.6 2.7 2.6 7.3 0 10"></path>
  </svg>`;
}

function radicalSearchCards(items = [], kind = 'char') {
  const list = items.filter(item => item && (item.char || item.word)).slice(0, kind === 'char' ? 24 : 30);
  if (!list.length) return '';
  const wrapperClass = kind === 'char' ? 'prototype-radical-examples prototype-radical-char-list' : 'prototype-radical-words';
  return `<div class="${wrapperClass}">${list.map(item => {
    const target = item.char || item.word || '';
    return `<div class="prototype-radical-item ${kind === 'char' ? 'prototype-radical-char-row' : ''}">
      <button type="button" class="prototype-radical-item-search" data-search-char="${escapeHtml(target)}">
        <strong>${escapeHtml(target)}</strong>
        <span>${escapeHtml(item.pinyin || '')}</span>
        <small>${escapeHtml(item.meaningVi || '')}</small>
      </button>
      <button type="button" class="prototype-radical-item-audio" data-speak="${escapeHtml(target)}" aria-label="Nghe ${escapeHtml(target)}">${radicalAudioIcon()}</button>
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
        ${form.form ? `<button type="button" class="prototype-radical-item-audio" data-speak="${escapeHtml(form.form)}" aria-label="Nghe ${escapeHtml(form.form)}">${radicalAudioIcon()}</button>` : ''}
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
  return `<div class="prototype-radical-sentence-list">${items.map(item => {
    const chinese = item.zh || item.chinese || '';
    return `<article>
      <div class="prototype-radical-sentence-head">
        <strong>${escapeHtml(chinese)}</strong>
        ${chinese ? `<button type="button" class="prototype-radical-item-audio prototype-radical-sentence-audio" data-speak="${escapeHtml(chinese)}" aria-label="Nghe câu ${escapeHtml(chinese)}">${radicalAudioIcon()}</button>` : ''}
      </div>
      <span>${escapeHtml(item.pinyin || '')}</span>
      <small>${escapeHtml(item.vi || item.meaningVi || '')}</small>
    </article>`;
  }).join('')}</div>`;
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
      <button class="word-speak-btn" type="button" data-speak="${escapeHtml(note.key || note.mainForm || '')}" aria-label="Nghe bộ thủ">${radicalAudioIcon()}</button>
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
  return extractHanCharacters(targetOf(data));
}

function writingPanel(data) {
  const chars = writingCharacters(data);
  if (!chars.length) return '';
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
  const target = targetOf(data);
  state.currentQuery = target;
  const radical = data.characterInfo?.radical || null;
  const vocabulary = data.vocabulary || {};
  const pinyin = first(data.pronunciation?.pinyin);
  const formation = data.characterInfo?.formationTypeVi || '';
  const structure = data.characterInfo?.structureType === 'left-right' ? 'trái – phải' : (data.characterInfo?.structureType || '');
  const warning = warningFor(data);
  const sources = (data.sources || []).filter(item => item.reviewStatus !== 'rejected');
  const story = clean(data.learningStory?.memoryStoryVi);
  const primaryChar = writingCharacters(data)[0] || '';
  const components = (data.components || []).filter(item => item.char);
  const explanation = clean(data.etymology?.standardExplanationVi);
  const relatedWords = uniqueBy([...(vocabulary.relatedWords || []), ...(data.type === 'character' ? (vocabulary.compounds || []) : [])], item => item.word || item.text)
    .filter(item => reviewed(item) && item.word && item.pinyin && item.meaningVi);
  const compounds = (vocabulary.compounds || []).filter(item => reviewed(item) && item.word && item.pinyin && item.meaningVi);
  const collocations = (vocabulary.collocations || []).filter(item => reviewed(item) && (item.word || item.text) && item.pinyin && item.meaningVi);
  const sentences = (data.sentences || []).filter(item => reviewed(item) && item.containsTarget !== false && item.chinese && item.pinyin && item.meaningVi);
  const grammar = (data.grammarLinks || []).filter(item => reviewed(item) && (item.title || item.grammarTopic || item.partOfSpeech || item.usageNoteVi || item.explanationVi || item.matchedExample));
  const peerChars = (data.sameRadicalCharacters || []).filter(item => reviewed(item) && item.word);
  const componentChars = data.type === 'word' ? (data.sameRadicalCharacters || []).filter(item => reviewed(item) && item.word) : [];
  const radicalVisible = radical && publishableRadicalStatus(radical.status || 'verified-local') && (radical.mainForm || radical.variant);

  const sections = [];
  const parent = state.navigationStack[state.navigationStack.length - 1];
  if (parent) sections.push(`<div class="lookup-context-back-wrap"><button type="button" class="lookup-context-back" data-back-parent>← Quay lại ${escapeHtml(parent.target)}</button></div>`);
  sections.push(`<section id="lookup-hero-section" class="panel hero-card full-width"><div class="panel-inner">
      <div class="hero-grid"><div class="main-char">${escapeHtml(target)}</div><div><div class="pinyin">${escapeHtml(pinyin)}</div><div class="hanviet">${data.pronunciation?.hanViet ? `Hán Việt: ${escapeHtml(data.pronunciation.hanViet)}` : ''}</div><p class="primary-meaning">${escapeHtml(meaningSummary(data))}</p></div><button class="speak-btn icon-audio-btn" type="button" data-speak="${escapeHtml(target)}" aria-label="Nghe phát âm">${audioIcon()}</button></div>
      <div class="meta-row">${formation ? `<span class="meta-chip">${escapeHtml(formation)}</span>` : ''}${structure ? `<span class="meta-chip">${escapeHtml(structure)}</span>` : ''}${data.characterInfo?.strokeCount ? `<span class="meta-chip">${escapeHtml(data.characterInfo.strokeCount)} nét</span>` : ''}${radicalVisible && radical.nameVi ? `<span class="meta-chip">${escapeHtml(radical.nameVi)} · local</span>` : ''}${data.review?.status && !['local-fallback','PARTIAL'].includes(data.review.status) ? `<span class="meta-chip">${escapeHtml(data.review.status)}</span>` : ''}</div>
    </div></section>`);

  if (components.length || explanation) {
    sections.push(`<section id="component-characters" class="panel decomp-panel full-width"><div class="panel-inner">${panelTitle('◫', data.type === 'word' ? 'Từng chữ trong từ' : 'Cấu tạo chữ')}${components.length ? `<div class="decomposition">${componentCards(data)}</div>` : ''}${explanation ? `<div class="explanation">${escapeHtml(explanation)}</div>` : ''}${warning ? `<div class="warning">${escapeHtml(warning)}</div>` : ''}</div></section>`);
  }
  if (story) sections.push(`<section class="panel story-panel full-width"><div class="panel-inner">${panelTitle('💡', 'Câu chuyện ghi nhớ')}<div class="story-card"><div class="story-icon">✦</div><div><p class="story-text">${escapeHtml(story)}</p><div class="story-note">Mẹo học theo cấu tạo, không phải khẳng định lịch sử chữ.</div></div></div></div></section>`);
  if (radicalVisible) sections.push(`<section class="panel"><div class="panel-inner">${panelTitle('部', 'Bộ thủ')}<button class="radical-card radical-card-button" type="button" data-open-radical="${escapeHtml(radical.variant || radical.mainForm || '')}" aria-label="Mở chi tiết ${escapeHtml(radical.nameVi || 'bộ thủ')}"><div class="radical-char">${escapeHtml(radical.variant || radical.mainForm || '')}</div><div><strong>${escapeHtml(radical.nameVi || 'Bộ thủ')}</strong><span>${escapeHtml(radical.mainForm || '')}${radical.pinyin ? ` · ${escapeHtml(radical.pinyin)}` : ''}${radical.meaningVi ? ` · ${escapeHtml(radical.meaningVi)}` : ''}</span><small>${escapeHtml(radical.evidenceLabel || 'Theo dữ liệu local')} · Chạm để xem chi tiết →</small></div></button></div></section>`);

  const writingHtml = writingPanel(data);
  if (writingHtml) sections.push(`<section id="writing-section" class="panel writing-panel full-width"><div class="panel-inner">${panelTitle('✎', 'Cách viết và luyện cơ bản')}${writingHtml}</div></section>`);

  if (data.type === 'character' && relatedWords.length) sections.push(`<section class="panel"><div class="panel-inner">${panelTitle('词', 'Từ liên quan')}${vocabularyCards(relatedWords, 10, 'compound')}</div></section>`);
  if (data.type === 'word' && compounds.length) sections.push(`<section class="panel"><div class="panel-inner">${panelTitle('词', 'Từ mở rộng')}${vocabularyCards(compounds, 6, 'compound')}</div></section>`);
  if (collocations.length) sections.push(`<section class="panel"><div class="panel-inner">${panelTitle('搭', 'Kết hợp thường thấy')}${vocabularyCards(collocations, 6, 'collocation')}</div></section>`);
  if (sentences.length) sections.push(`<section class="panel full-width"><div class="panel-inner">${panelTitle('例', 'Câu mẫu')}${sentenceCards(sentences, 3)}</div></section>`);
  if (grammar.length) sections.push(`<section class="panel"><div class="panel-inner">${panelTitle('语', 'Ngữ pháp / cách dùng')}${grammarCards(grammar, 5)}</div></section>`);
  if (data.type === 'character' && peerChars.length) sections.push(`<section class="panel"><div class="panel-inner">${panelTitle('同', 'Chữ cùng bộ')}${componentWordCards(peerChars, 12)}</div></section>`);
  if (data.type === 'word' && componentChars.length) sections.push(`<section class="panel"><div class="panel-inner">${panelTitle('字', 'Chữ thành phần')}${componentWordCards(componentChars, 8)}</div></section>`);
  if (sources.length || warning) sections.push(`<section class="panel details-panel full-width"><details><summary>Nguồn dữ liệu và ghi chú kiểm duyệt</summary>${warning ? `<p class="source-warning">${escapeHtml(warning)}</p>` : ''}<ul class="source-list">${sources.map(item => `<li>${escapeHtml(item.title || item.sourceId || String(item))}</li>`).join('')}</ul></details></section>`);

  el.view.innerHTML = sections.join('');
  updateStrokeLinks(primaryChar);
  bindDynamicEvents();
  requestAnimationFrame(() => initWriter(primaryChar));
  el.view.hidden = false;
  el.loading.hidden = true;
  document.querySelectorAll('[data-char]').forEach(button => button.classList.toggle('active', button.dataset.char === target));
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
  el.view.querySelectorAll('[data-search-char]').forEach(button => button.addEventListener('click', () => openTargetWithContext(button.dataset.searchChar, button)));
  el.view.querySelectorAll('[data-back-parent]').forEach(button => button.addEventListener('click', restoreParentTarget));
  el.view.querySelectorAll('[data-show-more-sentences]').forEach(button => button.addEventListener('click', () => {
    const expanded = button.getAttribute('aria-expanded') === 'true';
    el.view.querySelectorAll('.sentence-extra').forEach(card => { card.hidden = expanded; });
    button.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    const hiddenCount = el.view.querySelectorAll('.sentence-extra').length;
    button.textContent = expanded ? `Xem thêm ${hiddenCount} câu` : 'Thu gọn';
  }));
  el.view.querySelectorAll('[data-writer-char]').forEach(button => button.addEventListener('click', () => {
    el.view.querySelectorAll('[data-writer-char]').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    initWriter(button.dataset.writerChar);
    updateStrokeLinks(button.dataset.writerChar);
  }));
  el.view.querySelectorAll('[data-writer-action]').forEach(button => button.addEventListener('click', () => writerAction(button.dataset.writerAction)));
  el.view.querySelectorAll('[data-open-radical]').forEach(button => button.addEventListener('click', () => openRadicalDetails(button.dataset.openRadical)));
  el.view.querySelectorAll('[data-open-grammar]').forEach(button => button.addEventListener('click', () => openGrammarDetail(button.dataset.openGrammar)));
}

async function runSearch(value, options = {}) {
  const query = clean(value);
  el.message.hidden = true;
  if (!query) {
    el.loading.hidden = true;
    el.view.hidden = true;
    el.view.innerHTML = '';
    return;
  }
  el.loading.textContent = 'Đang tìm trong dữ liệu local…';
  el.loading.hidden = false;
  el.view.hidden = true;
  try {
    const data = await resolveQuery(query);
    el.input.value = query;
    if (data?.type === 'search-results') renderSearchResults(data);
    else render(data);
    if (state.pendingRestore) {
      const restore = state.pendingRestore;
      state.pendingRestore = null;
      requestAnimationFrame(() => {
        const anchor = restore.sectionId ? document.getElementById(restore.sectionId) : null;
        if (anchor) anchor.scrollIntoView({ block: 'start' });
        else window.scrollTo({ top: restore.scrollY || 0, behavior: 'auto' });
      });
    }
  } catch (error) {
    el.loading.hidden = true;
    el.view.hidden = true;
    el.view.innerHTML = '';
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

el.form.addEventListener('submit', event => { event.preventDefault(); state.navigationStack = []; runSearch(el.input.value); });
document.querySelectorAll('[data-char]').forEach(button => button.addEventListener('click', () => { state.navigationStack = []; runSearch(button.dataset.char); }));
el.theme.addEventListener('click', () => setDark());
document.querySelector('#menuThemeBtn').addEventListener('click', () => setDark());
document.querySelectorAll('[data-menu-open]').forEach(button => button.addEventListener('click', openMenu));
document.querySelectorAll('[data-menu-close]').forEach(button => button.addEventListener('click', closeMenu));
el.menuBackdrop.addEventListener('click', closeMenu);
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });

(async function init() {
  state.dark = localStorage.getItem('lookup-c1-2-theme') === 'dark';
  document.body.classList.toggle('dark', state.dark);
  await Promise.all([loadSingleCharacterIndex(), loadWordIndex()]);
  el.loading.hidden = true;
  el.view.hidden = true;
  el.message.hidden = true;
})();

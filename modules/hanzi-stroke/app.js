const HANZI_DATA_BASE = 'https://cdn.jsdelivr.net/npm/hanzi-writer-data@latest/';
const hanRegex = /\p{Script=Han}/u;

const defaultSettings = {
  size: 200,
  horizontal: false,
  autoplay: false,
  strokeOrder: true,
  showGrid: true,
  animationSpeed: 1,
  delayBetweenStrokes: 180,
  drawingWidth: 34,
  strokeColor: '#111827',
  radicalColor: '#c96f4d',
  outlineColor: '#d8c9b8',
  drawingColor: '#c96f4d',
  highlightColor: '#d97706',
  showHintAfterMisses: 2
};

const els = {
  input: document.getElementById('hanziInput'),
  size: document.getElementById('sizeRange'),
  sizeValue: document.getElementById('sizeValue'),
  horizontal: document.getElementById('horizontalToggle'),
  autoplay: document.getElementById('autoplayToggle'),
  strokeOrder: document.getElementById('strokeOrderToggle'),
  showGrid: document.getElementById('showGridToggle'),
  animationSpeed: document.getElementById('animationSpeedRange'),
  animationSpeedValue: document.getElementById('animationSpeedValue'),
  strokeDelay: document.getElementById('strokeDelayRange'),
  strokeDelayValue: document.getElementById('strokeDelayValue'),
  drawingWidth: document.getElementById('drawingWidthRange'),
  drawingWidthValue: document.getElementById('drawingWidthValue'),
  strokeColor: document.getElementById('strokeColorInput'),
  radicalColor: document.getElementById('radicalColorInput'),
  outlineColor: document.getElementById('outlineColorInput'),
  drawingColor: document.getElementById('drawingColorInput'),
  highlightColor: document.getElementById('highlightColorInput'),
  hintAfterMisses: document.getElementById('hintAfterMissesRange'),
  hintAfterMissesValue: document.getElementById('hintAfterMissesValue'),
  resetSettings: document.getElementById('resetSettingsBtn'),
  presetBright: document.getElementById('presetBrightBtn'),
  presetClassic: document.getElementById('presetClassicBtn'),
  play: document.getElementById('playBtn'),
  quiz: document.getElementById('quizBtn'),
  quizNoOutline: document.getElementById('quizNoOutlineBtn'),
  reset: document.getElementById('resetBtn'),
  share: document.getElementById('shareBtn'),
  embed: document.getElementById('embedBtn'),
  theme: document.getElementById('themeBtn'),
  embedBox: document.getElementById('embedBox'),
  embedCode: document.getElementById('embedCode'),
  embedStatus: document.getElementById('embedStatus'),
  empty: document.getElementById('emptyState'),
  compound: document.getElementById('compoundInfo'),
  list: document.getElementById('writerList'),
  infoDialog: document.getElementById('charInfoDialog')
};

let writers = [];
let renderId = 0;
let playId = 0;
let autoplayToken = 0;
let autoplayLoopActive = false;
let initialAutoplayDone = false;
const charDataCache = new Map();
const localCharInfoCache = new Map();
const HANZI_COLOR_STORAGE_KEY = 'hanziStrokeColorSettings.v1';
const HANZI_PRESET_STORAGE_KEY = 'hanziStrokeActivePreset.v1';
const HANZI_THEME_STORAGE_KEY = 'hanziStrokeTheme.v1';

const wordBucketCache = new Map();
const WORD_LOOKUP_SOURCES = ['by_first_char', 'by_length'];

function getWordLookupPath(wordText, source){
  const chars = getHanziChars(wordText);
  if(!chars.length){
    return '';
  }
  if(source === 'by_first_char'){
    const first = chars[0];
    return `data/words/by_first_char/${first.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}.json`;
  }
  if(source === 'by_length'){
    return `data/words/by_length/len_${String(chars.length).padStart(2, '0')}.json`;
  }
  return '';
}

function loadWordBucket(wordText, source){
  const path = getWordLookupPath(wordText, source);
  if(!path){
    return Promise.resolve(null);
  }
  if(wordBucketCache.has(path)){
    return wordBucketCache.get(path);
  }

  const promise = fetch(path)
    .then(response => {
      if(response.status === 404){
        return null;
      }
      if(!response.ok){
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return response.json();
    })
    .catch(err => {
      console.warn(`Cannot load word dictionary bucket ${path}:`, err);
      return null;
    });

  wordBucketCache.set(path, promise);
  return promise;
}

function pickBestWordEntry(rows){
  const list = Array.isArray(rows) ? rows : (rows ? [rows] : []);
  if(!list.length){
    return null;
  }
  return list.find(row => String(row?.vi || '').trim())
    || list.find(row => String(row?.en || '').trim())
    || list[0];
}

function findWordEntryInBucket(bucket, target){
  if(!bucket){
    return null;
  }
  if(Array.isArray(bucket)){
    return pickBestWordEntry(bucket.filter(row => String(row?.s || row?.word || '').trim() === target));
  }
  return pickBestWordEntry(bucket[target]);
}

function normalizeWordDictionaryEntry(entry, target, source){
  if(!entry){
    return null;
  }
  return {
    word: entry.s || entry.word || target,
    traditional: entry.t || entry.traditional || '',
    pinyin: entry.p || entry.pinyin || entry.pt || '',
    meaningVi: entry.vi || entry.meaningVi || '',
    meaningEn: entry.en || entry.meaningEn || '',
    hanViet: entry.sv || entry.hanViet || '',
    hsk: entry.hsk || '',
    source: `data/words/${source}`
  };
}

async function loadCompoundWordInfo(wordText){
  const target = String(wordText || '').trim();
  if(!target){
    return null;
  }

  for(const source of WORD_LOOKUP_SOURCES){
    const bucket = await loadWordBucket(target, source);
    const entry = findWordEntryInBucket(bucket, target);
    const normalized = normalizeWordDictionaryEntry(entry, target, source);
    if(normalized){
      return normalized;
    }
  }

  return null;
}
async function loadCompoundWordCandidates(wordText){
  const target = String(wordText || '').trim();
  if(!target) return [];
  const out = []; const seen = new Set();
  for(const source of WORD_LOOKUP_SOURCES){
    const bucket = await loadWordBucket(target, source); let rows = [];
    if(Array.isArray(bucket)) rows = bucket.filter(row => String(row?.s || row?.word || '').trim() === target);
    else if(bucket && bucket[target]) rows = Array.isArray(bucket[target]) ? bucket[target] : [bucket[target]];
    rows.forEach(entry => { const normalized = normalizeWordDictionaryEntry(entry, target, source); if(!normalized) return; const key=[normalized.pinyin,normalized.meaningVi].join('|'); if(!key.trim()||seen.has(key)) return; seen.add(key); out.push(normalized); });
  }
  return out;
}

const colorPresets = {
  bright: {
    strokeColor: '#111827',
    radicalColor: '#c96f4d',
    outlineColor: '#d8c9b8',
    drawingColor: '#c96f4d',
    highlightColor: '#d97706'
  },
  classic: {
    strokeColor: '#9f2d20',
    radicalColor: '#8b5a3c',
    outlineColor: '#d8c9b8',
    drawingColor: '#9f2d20',
    highlightColor: '#d97706'
  }
};

function getHanziChars(text){
  return Array.from(String(text || '')).filter(char => hanRegex.test(char));
}

function clampNumber(value, min, max, fallback){
  const number = Number(value);
  if(!Number.isFinite(number)){
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

function getSettings(){
  return {
    size: clampNumber(els.size.value, 120, 320, defaultSettings.size),
    horizontal: Boolean(els.horizontal.checked),
    autoplay: Boolean(els.autoplay.checked),
    strokeOrder: Boolean(els.strokeOrder.checked),
    showGrid: Boolean(els.showGrid.checked),
    animationSpeed: clampNumber(els.animationSpeed.value, 0.3, 5, defaultSettings.animationSpeed),
    delayBetweenStrokes: clampNumber(els.strokeDelay.value, 0, 1500, defaultSettings.delayBetweenStrokes),
    drawingWidth: clampNumber(els.drawingWidth.value, 4, 40, defaultSettings.drawingWidth),
    strokeColor: els.strokeColor.value || defaultSettings.strokeColor,
    radicalColor: els.radicalColor.value || defaultSettings.radicalColor,
    outlineColor: els.outlineColor.value || defaultSettings.outlineColor,
    drawingColor: els.drawingColor.value || defaultSettings.drawingColor,
    highlightColor: els.highlightColor.value || defaultSettings.highlightColor,
    showHintAfterMisses: clampNumber(els.hintAfterMisses.value, 1, 5, defaultSettings.showHintAfterMisses)
  };
}

function syncSettingLabels(settings = getSettings()){
  els.sizeValue.textContent = `${settings.size}px`;
  els.animationSpeedValue.textContent = settings.animationSpeed.toFixed(1);
  els.strokeDelayValue.textContent = `${settings.delayBetweenStrokes}ms`;
  els.drawingWidthValue.textContent = String(settings.drawingWidth);
  els.hintAfterMissesValue.textContent = String(settings.showHintAfterMisses);
}

function updateLayout(settings = getSettings()){
  syncSettingLabels(settings);
  els.list.classList.toggle('is-horizontal', settings.horizontal);
}

function createWriterOptions(size, settings = getSettings()){
  return {
    width: size,
    height: size,
    padding: 8,
    showOutline: true,
    showCharacter: false,
    strokeColor: settings.strokeColor,
    radicalColor: settings.radicalColor,
    outlineColor: settings.outlineColor,
    drawingColor: settings.drawingColor,
    highlightColor: settings.highlightColor,
    drawingWidth: settings.drawingWidth,
    strokeAnimationSpeed: settings.animationSpeed,
    delayBetweenStrokes: settings.delayBetweenStrokes
  };
}

function renderWriters(){
  renderId += 1;
  playId += 1;
  const currentRender = renderId;
  const settings = getSettings();
  const chars = getHanziChars(els.input.value);

  updateLayout(settings);
  stopAutoplayLoop();
  writers = [];
  els.list.innerHTML = '';
  els.empty.hidden = chars.length > 0;

  if(!chars.length){
    if(els.compound){
      els.compound.hidden = true;
      els.compound.innerHTML = '';
    }
    return;
  }

  renderCompoundInfo(chars, currentRender);

  chars.forEach((char, index) => {
    const card = document.createElement('article');
    card.className = 'char-card';

    const targetId = `writer-${Date.now()}-${currentRender}-${index}`;
    card.innerHTML = `
      <div class="char-head">
        <div class="char-main">
          <div class="char-label">${escapeHtml(char)}</div>
          <span class="char-pinyin" hidden></span>
        </div>
        <div class="char-meta">Chữ ${index + 1}/${chars.length}</div>
      </div>
      <div id="${targetId}" class="writer-box ${settings.showGrid ? 'has-grid' : ''}" style="--writer-size:${settings.size}px"></div>
      <div class="char-actions" aria-label="Thao tác cho chữ ${escapeHtml(char)}">
        ${charActionButton('play', '▶', 'Phát nét')}
        ${charActionButton('quiz', '✎', 'Luyện viết')}
        ${charActionButton('quiz-no-outline', '◌', 'Không viền')}
        ${charActionButton('stroke-order', '①', 'Thứ tự nét')}
        ${charActionButton('speak', '🔊', 'Nghe âm')}
        ${charActionButton('info', 'i', 'Từ điển')}
      </div>
      <div class="stroke-order" hidden></div>
      <div class="char-info-tools">
        <button
          type="button"
          class="char-info-toggle"
          data-char-action="toggle-info"
          title="Xem thông tin chữ"
          aria-label="Xem thông tin chữ"
          aria-expanded="false"
        ><span aria-hidden="true">📖</span><span>Từ điển</span></button>
      </div>
      <div class="char-info-panel" hidden></div>
    `;

    els.list.appendChild(card);

    const writer = HanziWriter.create(targetId, char, createWriterOptions(settings.size, settings));
    const strokeContainer = card.querySelector('.stroke-order');
    const infoPanel = card.querySelector('.char-info-panel');
    const infoToggle = card.querySelector('.char-info-toggle');
    const pinyinEl = card.querySelector('.char-pinyin');
    const item = {
      char,
      writer,
      card,
      strokeContainer,
      infoPanel,
      infoToggle,
      pinyinEl,
      infoLoaded: false
    };
    writers.push(item);
    bindCharActions(item);
    loadCardHeaderInfo(item);

    if(settings.strokeOrder){
      strokeContainer.hidden = false;
      renderStrokeOrder(char, strokeContainer);
    }
  });

  if(settings.autoplay){
    window.setTimeout(() => {
      if(currentRender === renderId){
        startAutoplayLoop();
      }
    }, 120);
  }

  if(!initialAutoplayDone){
    initialAutoplayDone = true;
    window.setTimeout(() => {
      if(currentRender === renderId && writers.length){
        playAll();
      }
    }, 300);
  }
}

function charActionButton(action, icon, label){
  return `
    <button type="button" class="icon-btn icon-btn--${escapeHtml(action)}" data-char-action="${escapeHtml(action)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
      <span class="icon-symbol" aria-hidden="true">${escapeHtml(icon)}</span>
      <span class="icon-label">${escapeHtml(label)}</span>
    </button>
  `;
}

function sleep(ms){
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function stopAutoplayLoop(){
  autoplayToken += 1;
  autoplayLoopActive = false;
}

function startAutoplayLoop(){
  if(!getSettings().autoplay || !writers.length){
    return;
  }

  const token = ++autoplayToken;
  autoplayLoopActive = true;
  runAutoplayLoop(token);
}

async function runAutoplayLoop(token){
  while(token === autoplayToken && getSettings().autoplay && writers.length){
    await playAll({ fromAutoplay: true });
    if(token !== autoplayToken || !getSettings().autoplay){
      break;
    }
    await sleep(400);
  }

  if(token === autoplayToken){
    autoplayLoopActive = false;
  }
}

async function playAll({ fromAutoplay = false } = {}){
  if(!fromAutoplay){
    stopAutoplayLoop();
  }

  const currentPlay = ++playId;
  const tasks = writers.map(item => playItem(item, { currentPlay, fromAutoplay: true }));

  await Promise.all(tasks);
}

async function playItem(item, { currentPlay = ++playId, fromAutoplay = false } = {}){
  if(!item) return;
  if(!fromAutoplay){
    stopAutoplayLoop();
  }
  if(currentPlay !== playId) return;
  if(typeof item.writer.cancelQuiz === 'function'){
    item.writer.cancelQuiz();
  }
  item.writer.showOutline();
  item.writer.hideCharacter();
  await item.writer.animateCharacter();
}

function startQuiz({ hideOutline = false } = {}){
  stopAutoplayLoop();
  playId += 1;
  if(hideOutline){
    disableStrokeOrder();
  }
  const settings = getSettings();

  writers.forEach(item => {
    startQuizItem(item, { hideOutline, settings, stopLoop: false });
  });
}

function startQuizItem(item, { hideOutline = false, settings = getSettings(), stopLoop = true } = {}){
  if(!item) return;
  if(stopLoop){
    stopAutoplayLoop();
    playId += 1;
  }
  if(hideOutline && stopLoop){
    disableStrokeOrder();
    settings = getSettings();
  }
  if(typeof item.writer.cancelQuiz === 'function'){
    item.writer.cancelQuiz();
  }
  item.writer.hideCharacter();
  if(hideOutline){
    item.writer.hideOutline();
  }else{
    item.writer.showOutline();
  }
  item.writer.quiz({
    showHintAfterMisses: settings.showHintAfterMisses
  });
}

function resetAll(){
  stopAutoplayLoop();
  playId += 1;

  writers.forEach(item => {
    resetItem(item, { stopLoop: false });
  });
}

function resetItem(item, { stopLoop = true } = {}){
  if(!item) return;
  if(stopLoop){
    stopAutoplayLoop();
    playId += 1;
  }
  if(typeof item.writer.cancelQuiz === 'function'){
    item.writer.cancelQuiz();
  }
  item.writer.hideCharacter();
  item.writer.showOutline();
}

async function loadCharData(char){
  if(charDataCache.has(char)){
    return charDataCache.get(char);
  }

  const url = `${HANZI_DATA_BASE}${encodeURIComponent(char)}.json`;
  const promise = fetch(url).then(response => {
    if(!response.ok){
      throw new Error(`${response.status} ${response.statusText}`);
    }
    return response.json();
  });

  charDataCache.set(char, promise);
  return promise;
}

function charToDataPath(char){
  const code = String(char || '').codePointAt(0);
  if(!Number.isFinite(code)){
    return '';
  }
  return `data/chars/${code.toString(16).toUpperCase()}.json`;
}

async function loadLocalCharInfo(char){
  if(localCharInfoCache.has(char)){
    return localCharInfoCache.get(char);
  }

  const path = charToDataPath(char);
  if(!path){
    return null;
  }

  const promise = fetch(path)
    .then(response => {
      if(response.status === 404){
        return null;
      }
      if(!response.ok){
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return response.json();
    })
    .catch(err => {
      console.warn(`Cannot load local dictionary data for ${char}:`, err);
      return null;
    });

  localCharInfoCache.set(char, promise);
  return promise;
}

function formatInfoValue(value, fallback = 'Chưa có dữ liệu'){
  const text = String(value ?? '').trim();
  return text || fallback;
}

function formatMeaning(info){
  const vi = String(info?.meaningVi || '').trim();
  const en = String(info?.meaningEn || '').trim();
  return [vi, en].filter(Boolean).join('; ');
}

function formatPinyin(pinyin){
  return String(pinyin || '').trim().toLocaleLowerCase('vi-VN');
}

function getPrimaryMeaningText(info){
  return String(info?.meaningVi || info?.meaningEn || '').trim();
}

function getExactCompoundMatch(wordText, charInfos){
  const target = String(wordText || '').trim();
  if(!target){
    return null;
  }

  const matches = [];
  charInfos.forEach(info => {
    const related = Array.isArray(info?.relatedWords) ? info.relatedWords : [];
    related.forEach(word => {
      if(String(word?.word || '').trim() === target){
        matches.push(word);
      }
    });
  });

  if(!matches.length){
    return null;
  }

  return matches.find(item => item.meaningVi) || matches[0];
}

function buildCompoundFallback(wordText, charInfos){
  const pinyin = charInfos.map(info => formatPinyin(info?.pinyin)).filter(Boolean).join(' ');
  const meaningVi = charInfos
    .map(info => {
      const char = String(info?.char || '').trim();
      const meaning = getPrimaryMeaningText(info);
      return char && meaning ? `${char}: ${meaning}` : '';
    })
    .filter(Boolean)
    .join('; ');

  return {
    word: wordText,
    pinyin,
    meaningVi,
    isFallback: true
  };
}

function renderCompoundCharsHtml(charInfos){
  const rows = charInfos
    .filter(info => info?.char)
    .map(info => {
      const pinyin = formatPinyin(info.pinyin);
      const meaning = getPrimaryMeaningText(info);
      return `
        <li class="compound-char-row">
          <strong>${escapeHtml(info.char)}</strong>
          <span>${escapeHtml(pinyin || '—')}</span>
          <small>${escapeHtml(meaning || 'Chưa có nghĩa')}</small>
        </li>
      `;
    })
    .join('');

  if(!rows){
    return '';
  }

  return `
    <div class="compound-char-section">
      <div class="compound-section-title">Từng chữ trong cụm</div>
      <ul class="compound-char-list">${rows}</ul>
    </div>
  `;
}

async function renderCompoundInfo(chars, currentRender = renderId){
  if(!els.compound){
    return;
  }

  const wordText = chars.join('');
  if(chars.length <= 1){
    els.compound.hidden = true;
    els.compound.innerHTML = '';
    return;
  }

  els.compound.hidden = false;
  els.compound.innerHTML = '<p class="compound-loading">Đang tải nghĩa cụm từ...</p>';

  const charInfos = await Promise.all(chars.map(char => loadLocalCharInfo(char)));
  if(currentRender !== renderId || getHanziChars(els.input.value).join('') !== wordText){
    return;
  }

  const displayInfos = charInfos.map((info, index) => info || { char: chars[index] });
  const availableInfos = displayInfos.filter(Boolean);
  const wordDictionaryMatch = await loadCompoundWordInfo(wordText);
  if(currentRender !== renderId || getHanziChars(els.input.value).join('') !== wordText){
    return;
  }
  const exactMatch = getExactCompoundMatch(wordText, availableInfos);
  const compound = wordDictionaryMatch || exactMatch || buildCompoundFallback(wordText, displayInfos);
  const compoundPinyin = formatPinyin(compound?.pinyin);
  const compoundMeaning = String(compound?.meaningVi || compound?.meaningEn || '').trim();

  els.compound.innerHTML = `
    <article class="compound-card">
      <div class="compound-head">
        <div>
          <p class="panel-kicker">Cụm từ đang học</p>
          <h3>${escapeHtml(wordText)}</h3>
        </div>
        <button type="button" class="compound-speak" aria-label="Nghe cụm ${escapeHtml(wordText)}">🔊</button>
      </div>
      <div class="compound-main">
        <div class="compound-word">${escapeHtml(wordText)}</div>
        ${compoundPinyin ? `<div class="compound-pinyin">${escapeHtml(compoundPinyin)}</div>` : ''}
        ${compoundMeaning ? `<div class="compound-meaning">${escapeHtml(compoundMeaning)}</div>` : '<div class="compound-meaning is-muted">Chưa có nghĩa cụm từ trực tiếp trong dữ liệu. Xem nghĩa từng chữ bên dưới.</div>'}
      </div>
      ${renderCompoundCharsHtml(displayInfos)}
    </article>
  `;

  els.compound.querySelector('.compound-speak')?.addEventListener('click', () => speakChar(wordText));
}

function renderDictionaryInfoHtml(info, options = {}){
  const mode = options.mode === 'modal' ? 'modal' : 'panel';
  const fallbackChar = String(options.char || '').trim();

  if(!info){
    return '<p class="dict-empty">Chưa có dữ liệu từ điển.</p>';
  }

  const char = formatInfoValue(info.char || fallbackChar, fallbackChar || '字');
  const pinyin = formatPinyin(info.pinyin);
  const strokeCount = Number.isFinite(Number(info.strokeCount)) ? String(Number(info.strokeCount)) : '';
  const hsk = info.hsk ? `HSK ${info.hsk}` : '';
  const rows = [
    ['Hán Việt', formatInfoValue(info.hanViet)],
    ['Nghĩa', formatInfoValue(formatMeaning(info))],
    ['Bộ thủ', formatInfoValue(info.radical)],
    ['Số nét', formatInfoValue(strokeCount)],
    ['HSK', formatInfoValue(hsk)]
  ];

  return `
    <section class="dict-info dict-info--${mode}">
      <div class="dict-title">
        <strong>${escapeHtml(char)}</strong>
        ${pinyin ? `<span>/${escapeHtml(pinyin)}/</span>` : ''}
      </div>
      <dl class="dict-grid">
        ${rows.map(([label, value]) => `
          <div class="dict-row">
            <dt class="dict-label">${escapeHtml(label)}</dt>
            <dd class="dict-value">${escapeHtml(value)}</dd>
          </div>
        `).join('')}
      </dl>
      ${renderDictionaryRelatedHtml(info.relatedWords)}
    </section>
  `;
}

function renderDictionaryRelatedHtml(words = []){
  const related = Array.isArray(words) ? words.slice(0, 6) : [];
  if(!related.length){
    return '';
  }

  return `
    <div class="dict-related">
      <div class="dict-related-title">Từ liên quan</div>
      <ul>
        ${related.map(word => `
          <li>
            <strong>${escapeHtml(word.word || '')}</strong>
            <span class="related-pinyin">${escapeHtml(formatPinyin(word.pinyin))}</span>
            <small class="related-meaning">${escapeHtml(word.meaningVi || word.meaningEn || '')}</small>
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}

function setCardPinyin(item, pinyin){
  if(!item?.pinyinEl){
    return;
  }

  const value = formatPinyin(pinyin);
  item.pinyinEl.textContent = value ? `/${value}/` : '';
  item.pinyinEl.hidden = !value;
}

async function loadCardHeaderInfo(item){
  if(!item?.char){
    return;
  }

  const info = await loadLocalCharInfo(item?.char);
  if(info?.pinyin){
    setCardPinyin(item, info.pinyin);
  }
}

async function toggleCharacterInfo(item){
  if(!item?.infoPanel){
    return;
  }

  const willOpen = item.infoPanel.hidden;
  item.infoPanel.hidden = !willOpen;
  item.infoToggle?.setAttribute('aria-expanded', String(willOpen));
  item.infoToggle?.classList.toggle('is-active', willOpen);

  if(willOpen && !item.infoLoaded){
    item.infoLoaded = true;
    await renderCharacterInfo(item);
  }
}

async function renderCharacterInfo(item){
  if(!item?.infoPanel){
    return;
  }

  item.infoPanel.innerHTML = '<p class="dict-empty">Đang tải dữ liệu từ điển...</p>';
  const info = await loadLocalCharInfo(item.char);

  if(!info){
    item.infoPanel.innerHTML = renderDictionaryInfoHtml(null, { mode: 'panel', char: item.char });
    return;
  }

  setCardPinyin(item, info.pinyin);
  item.infoPanel.innerHTML = renderDictionaryInfoHtml(info, { mode: 'panel', char: item.char });
}

async function renderStrokeOrder(char, container){
  container.hidden = false;
  container.innerHTML = '<p class="stroke-message">Đang tải thứ tự nét...</p>';

  try{
    const data = await loadCharData(char);
    const strokes = Array.isArray(data.strokes) ? data.strokes : [];

    if(!strokes.length){
      throw new Error('Missing strokes');
    }

    const steps = strokes.map((_, index) => renderStrokeStep(strokes, index)).join('');
    container.innerHTML = `<div class="stroke-strip" aria-label="Thứ tự nét chữ ${escapeHtml(char)}">${steps}</div>`;
  }catch(err){
    console.warn(`Cannot load stroke data for ${char}:`, err);
    container.innerHTML = '<p class="stroke-message">Không có dữ liệu nét cho chữ này.</p>';
  }
}

function renderStrokeStep(strokes, activeIndex){
  const settings = getSettings();
  const oldColor = settings.outlineColor;
  const currentColor = settings.highlightColor || settings.strokeColor;
  const paths = strokes
    .slice(0, activeIndex + 1)
    .map((path, index) => {
      const fill = index === activeIndex ? currentColor : oldColor;
      return `<path fill="${escapeHtml(fill)}" d="${escapeHtml(path)}"></path>`;
    })
    .join('');

  return `
    <div class="stroke-step">
      <svg viewBox="0 0 1024 1024" aria-hidden="true" focusable="false">
        <g transform="translate(0, 900) scale(1, -1)">${paths}</g>
      </svg>
      <span>${activeIndex + 1}</span>
    </div>
  `;
}

function refreshStrokeOrderVisibility(){
  const settings = getSettings();
  syncSettingLabels(settings);

  writers.forEach(item => {
    item.strokeContainer.hidden = !settings.strokeOrder;
    if(settings.strokeOrder && !item.strokeContainer.innerHTML.trim()){
      renderStrokeOrder(item.char, item.strokeContainer);
    }
  });
}

function disableStrokeOrder(){
  if(!els.strokeOrder){
    return;
  }

  els.strokeOrder.checked = false;
  refreshStrokeOrderVisibility();
}

function toggleStrokeOrderItem(item){
  if(!item) return;
  const isHidden = item.strokeContainer.hidden;
  item.strokeContainer.hidden = !isHidden;
  if(isHidden && !item.strokeContainer.innerHTML.trim()){
    renderStrokeOrder(item.char, item.strokeContainer);
  }
}

function applyGridSetting(){
  const settings = getSettings();
  syncSettingLabels(settings);
  document.querySelectorAll('.writer-box').forEach(box => {
    box.classList.toggle('has-grid', settings.showGrid);
  });
}

function getColorSettings(){
  return {
    strokeColor: els.strokeColor.value || defaultSettings.strokeColor,
    radicalColor: els.radicalColor.value || defaultSettings.radicalColor,
    outlineColor: els.outlineColor.value || defaultSettings.outlineColor,
    drawingColor: els.drawingColor.value || defaultSettings.drawingColor,
    highlightColor: els.highlightColor.value || defaultSettings.highlightColor
  };
}

function normalizeColor(value){
  return String(value || '').trim().toLowerCase();
}

function detectActivePreset(colors = getColorSettings()){
  return Object.entries(colorPresets).find(([, preset]) => (
    normalizeColor(colors.strokeColor) === normalizeColor(preset.strokeColor) &&
    normalizeColor(colors.radicalColor) === normalizeColor(preset.radicalColor) &&
    normalizeColor(colors.outlineColor) === normalizeColor(preset.outlineColor) &&
    normalizeColor(colors.drawingColor) === normalizeColor(preset.drawingColor) &&
    normalizeColor(colors.highlightColor) === normalizeColor(preset.highlightColor)
  ))?.[0] || '';
}

function updatePresetState(activePreset = detectActivePreset()){
  els.presetBright?.classList.toggle('is-active', activePreset === 'bright');
  els.presetClassic?.classList.toggle('is-active', activePreset === 'classic');
  els.presetBright?.setAttribute('aria-pressed', String(activePreset === 'bright'));
  els.presetClassic?.setAttribute('aria-pressed', String(activePreset === 'classic'));
}

function setColorSettings(colors){
  if(!colors || typeof colors !== 'object'){
    return;
  }

  if(colors.strokeColor) els.strokeColor.value = colors.strokeColor;
  if(colors.radicalColor) els.radicalColor.value = colors.radicalColor;
  if(colors.outlineColor) els.outlineColor.value = colors.outlineColor;
  if(colors.drawingColor) els.drawingColor.value = colors.drawingColor;
  if(colors.highlightColor) els.highlightColor.value = colors.highlightColor;
}

function saveColorSettings(activePreset = detectActivePreset()){
  try{
    window.localStorage.setItem(HANZI_COLOR_STORAGE_KEY, JSON.stringify(getColorSettings()));
    if(activePreset){
      window.localStorage.setItem(HANZI_PRESET_STORAGE_KEY, activePreset);
    }else{
      window.localStorage.removeItem(HANZI_PRESET_STORAGE_KEY);
    }
    updatePresetState(activePreset);
  }catch(err){
    console.warn('Cannot save color settings:', err);
  }
}

function restoreColorSettings(){
  try{
    const raw = window.localStorage.getItem(HANZI_COLOR_STORAGE_KEY);
    if(!raw){
      updatePresetState('bright');
      return;
    }

    const colors = JSON.parse(raw);
    const activePreset = window.localStorage.getItem(HANZI_PRESET_STORAGE_KEY);
    if(activePreset && colorPresets[activePreset]){
      setColorSettings(colorPresets[activePreset]);
      window.localStorage.setItem(HANZI_COLOR_STORAGE_KEY, JSON.stringify(getColorSettings()));
      updatePresetState(activePreset);
      return;
    }

    setColorSettings(colors);
    updatePresetState(detectActivePreset());
  }catch(err){
    console.warn('Cannot restore color settings:', err);
    updatePresetState();
  }
}

function applyColorPreset(preset){
  stopAutoplayLoop();

  if(colorPresets[preset]){
    setColorSettings(colorPresets[preset]);
  }

  saveColorSettings(preset);
  syncSettingLabels();
  renderWriters();
}

function resetAdvancedSettings(){
  stopAutoplayLoop();
  els.showGrid.checked = defaultSettings.showGrid;
  els.animationSpeed.value = String(defaultSettings.animationSpeed);
  els.strokeDelay.value = String(defaultSettings.delayBetweenStrokes);
  els.drawingWidth.value = String(defaultSettings.drawingWidth);
  els.strokeColor.value = defaultSettings.strokeColor;
  els.radicalColor.value = defaultSettings.radicalColor;
  els.outlineColor.value = defaultSettings.outlineColor;
  els.drawingColor.value = defaultSettings.drawingColor;
  els.highlightColor.value = defaultSettings.highlightColor;
  els.hintAfterMisses.value = String(defaultSettings.showHintAfterMisses);
  saveColorSettings('bright');
  syncSettingLabels();
  renderWriters();
}

function bindCharActions(item){
  item.card.querySelectorAll('[data-char-action]').forEach(button => {
    button.addEventListener('click', () => {
      const action = button.dataset.charAction;

      if(action === 'play'){
        playItem(item);
      }else if(action === 'quiz'){
        startQuizItem(item);
      }else if(action === 'quiz-no-outline'){
        startQuizItem(item, { hideOutline: true });
      }else if(action === 'stroke-order'){
        toggleStrokeOrderItem(item);
      }else if(action === 'speak'){
        speakChar(item.char);
      }else if(action === 'info'){
        showCharInfo(item.char);
      }else if(action === 'toggle-info'){
        toggleCharacterInfo(item);
      }
    });
  });
}

function speakChar(char){
  stopAutoplayLoop();

  const text = String(char || '').trim();
  if(!text){
    return;
  }

  try{
    if(!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined'){
      return;
    }

    const synth = window.speechSynthesis;
    if(typeof synth.resume === 'function'){
      synth.resume();
    }
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.78;
    utterance.pitch = 1;
    utterance.volume = 1;

    const voices = typeof synth.getVoices === 'function' ? synth.getVoices() : [];
    const zhVoice = voices.find(voice => /^zh[-_]/i.test(voice.lang || ''))
      || voices.find(voice => /Chinese|Mandarin|中文|普通话/i.test(voice.name || ''));
    if(zhVoice){
      utterance.voice = zhVoice;
    }

    synth.speak(utterance);
  }catch(err){
    console.warn('Speech synthesis failed:', err);
  }
}

async function showCharInfo(char){
  stopAutoplayLoop();

  const content = document.querySelector('.char-info-content');
  if(content){
    content.innerHTML = '<p class="dict-empty">Đang tải dữ liệu từ điển...</p>';
  }

  if(typeof els.infoDialog.showModal === 'function' && !els.infoDialog.open){
    els.infoDialog.showModal();
  }else{
    els.infoDialog.setAttribute('open', '');
  }

  const localInfo = await loadLocalCharInfo(char);
  if(content){
    content.innerHTML = renderDictionaryInfoHtml(localInfo, { mode: 'modal', char });
  }
}

async function copyEmbedCode(){
  const settings = getSettings();
  const chars = getHanziChars(els.input.value).join('');
  const embedUrl = new URL('embed.html', window.location.href);
  embedUrl.searchParams.set('chars', chars);
  embedUrl.searchParams.set('size', String(settings.size));
  embedUrl.searchParams.set('autoplay', settings.autoplay ? '1' : '0');
  embedUrl.searchParams.set('strokeColor', settings.strokeColor);
  embedUrl.searchParams.set('radicalColor', settings.radicalColor);
  embedUrl.searchParams.set('outlineColor', settings.outlineColor);
  embedUrl.searchParams.set('drawingColor', settings.drawingColor);
  embedUrl.searchParams.set('speed', String(settings.animationSpeed));
  embedUrl.searchParams.set('delay', String(settings.delayBetweenStrokes));
  embedUrl.searchParams.set('grid', settings.showGrid ? '1' : '0');

  const height = Math.max(420, settings.size + 220);
  const code = `<iframe src="${embedUrl.href}" width="100%" height="${height}" style="border:0;border-radius:16px;"></iframe>`;

  els.embedBox.hidden = false;
  els.embedCode.value = code;
  els.embedCode.focus();
  els.embedCode.select();
  els.embedStatus.textContent = 'Mã nhúng đã sẵn sàng.';

  try{
    if(navigator.clipboard?.writeText){
      await navigator.clipboard.writeText(code);
      els.embedStatus.textContent = 'Đã copy mã nhúng vào clipboard.';
    }
  }catch(err){
    console.warn('Clipboard copy failed:', err);
    els.embedStatus.textContent = 'Chưa copy tự động được. Bạn có thể copy trong ô bên trên.';
  }
}

function getShareUrl(){
  const settings = getSettings();
  const shareUrl = new URL(window.location.href);
  shareUrl.searchParams.set('chars', getHanziChars(els.input.value).join(''));
  shareUrl.searchParams.set('size', String(settings.size));
  return shareUrl.href;
}

async function shareCurrentView(){
  const shareUrl = getShareUrl();
  const title = 'Tra chữ Hán';

  try{
    if(navigator.share){
      await navigator.share({ title, url: shareUrl });
      return;
    }

    if(navigator.clipboard?.writeText){
      await navigator.clipboard.writeText(shareUrl);
      els.embedBox.hidden = false;
      els.embedStatus.textContent = 'Đã copy liên kết chia sẻ.';
    }
  }catch(err){
    console.warn('Share failed:', err);
    els.embedBox.hidden = false;
    els.embedStatus.textContent = 'Chưa chia sẻ tự động được. Bạn có thể dùng nút mã nhúng.';
  }
}

function restoreUrlState(){
  const params = new URLSearchParams(window.location.search);
  const chars = params.get('chars');
  const word = params.get('word');
  const size = params.get('size');

  if(word){
    els.input.value = word;
  }else if(chars){
    els.input.value = chars;
  }

  if(size){
    els.size.value = String(clampNumber(size, 120, 320, defaultSettings.size));
  }
}

function restoreTheme(){
  try{
    document.body.classList.toggle('is-dim', window.localStorage.getItem(HANZI_THEME_STORAGE_KEY) === 'dim');
  }catch(err){
    console.warn('Cannot restore theme:', err);
  }
}

function toggleTheme(){
  const isDim = document.body.classList.toggle('is-dim');
  try{
    window.localStorage.setItem(HANZI_THEME_STORAGE_KEY, isDim ? 'dim' : 'light');
  }catch(err){
    console.warn('Cannot save theme:', err);
  }
}

function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#039;'
  }[char]));
}

function bindUI(){
  els.input.addEventListener('input', renderWriters);
  els.size.addEventListener('input', renderWriters);
  els.horizontal.addEventListener('change', () => updateLayout());
  els.autoplay.addEventListener('change', () => {
    syncSettingLabels();
    if(els.autoplay.checked){
      startAutoplayLoop();
    }else{
      stopAutoplayLoop();
    }
  });
  els.strokeOrder.addEventListener('change', refreshStrokeOrderVisibility);
  els.showGrid.addEventListener('change', applyGridSetting);

  [
    els.animationSpeed,
    els.strokeDelay,
    els.drawingWidth,
    els.strokeColor,
    els.radicalColor,
    els.outlineColor,
    els.drawingColor,
    els.highlightColor,
    els.hintAfterMisses
  ].forEach(control => {
    control.addEventListener('input', () => {
      stopAutoplayLoop();
      saveColorSettings(detectActivePreset());
      syncSettingLabels();
      renderWriters();
    });
  });

  els.play.addEventListener('click', playAll);
  els.quiz.addEventListener('click', () => startQuiz({ hideOutline: false }));
  els.quizNoOutline.addEventListener('click', () => startQuiz({ hideOutline: true }));
  els.reset.addEventListener('click', resetAll);
  els.share?.addEventListener('click', shareCurrentView);
  els.embed.addEventListener('click', copyEmbedCode);
  els.resetSettings.addEventListener('click', resetAdvancedSettings);
  els.presetBright?.addEventListener('click', () => applyColorPreset('bright'));
  els.presetClassic?.addEventListener('click', () => applyColorPreset('classic'));
  els.theme?.addEventListener('click', toggleTheme);

  restoreUrlState();
  restoreTheme();
  restoreColorSettings();
  syncSettingLabels();
  renderWriters();
}

if(window.HanziWriter){
  bindUI();
}else{
  els.empty.hidden = false;
  els.empty.textContent = 'Không tải được Hanzi Writer. Vui lòng kiểm tra kết nối mạng.';
}


/* Step 7.3.2 - HSK tab popup detail + lesson source dropdown for Tra chữ Hán */
(function initHskLearningTab(){
  const lookupView = document.getElementById('lookupView');
  const hskView = document.getElementById('hskView');
  const radicalsView = document.getElementById('radicalsView');
  const tabHub = document.getElementById('studyTabHub');
  const learnHubView = document.getElementById('learnHubView');
  const tabLookup = document.getElementById('studyTabLookup');
  const tabHsk = document.getElementById('studyTabHsk');
  const tabRadicals = document.getElementById('studyTabRadicals');
  const sourceTabs = document.getElementById('hskSourceTabs');
  const levelTabs = document.getElementById('hskLevelTabs');
  const hskList = document.getElementById('hskList');
  const hskStatus = document.getElementById('hskStatus');
  const hskSearch = document.getElementById('hskSearchInput');
  const hskTotalBadge = document.getElementById('hskTotalBadge');
  const hskGroupModes = document.getElementById('hskGroupModes');
  const hskTopicFilters = document.getElementById('hskTopicFilters');

  if(!lookupView || !hskView || !tabLookup || !tabHsk || !sourceTabs || !levelTabs || !hskList){
    return;
  }

  const HSK_DATA_BASE = 'data/learning/hsk/';
  const HSK_QUICK_LOOKUP_PATH = `${HSK_DATA_BASE}hsk_flashcard_lookup.json`;
  const GRAMMAR_DATA_BASE = 'data/learning/grammar/';
  const DIALOGUE301_LESSONS_PATH = '../../lessons-301-v2/lessons.json';
  const HSK_CURRICULUM_STORAGE_KEY = 'hanziStroke.lastCurriculum.v1';
  const hskCache = new Map();
  let dialogue301CurriculumPromise = null;

  function readLastCurriculum(){
    const requested = new URLSearchParams(window.location.search).get('curriculum') || '';
    if(['dialogue301', 'hsk', 'new_hsk', 'yct', 'boya'].includes(requested)){
      return requested;
    }
    try{
      return window.localStorage.getItem(HSK_CURRICULUM_STORAGE_KEY) || 'dialogue301';
    }catch(_error){
      return 'dialogue301';
    }
  }

  function readRequestedHskLevel(){
    const value = Number(new URLSearchParams(window.location.search).get('level'));
    return Number.isFinite(value) && value > 0 ? value : 1;
  }

  function readRequestedHskSection(){
    const params = new URLSearchParams(window.location.search);
    return {
      key: params.get('section') || '',
      mode: ['lessons', 'topics'].includes(params.get('sectionMode')) ? params.get('sectionMode') : 'lessons'
    };
  }

  function buildHskRouteUrl(options = {}){
    const sourceKey = options.sourceKey || hskState.sourceKey || 'dialogue301';
    const hasExplicitLevel = Object.prototype.hasOwnProperty.call(options, 'level');
    const level = hasExplicitLevel && options.level === null ? '' : (Number(options.level || hskState.currentLevel) || 1);
    const sectionKey = options.sectionKey === undefined ? hskState.topicKey : options.sectionKey;
    const sectionMode = options.sectionMode || hskState.groupMode || 'lessons';
    const url = new URL(window.location.href);
    url.hash = '';
    url.searchParams.set('study', 'hsk');
    url.searchParams.set('curriculum', sourceKey);
    if(sourceKey === 'dialogue301'){
      url.searchParams.delete('level');
      url.searchParams.delete('section');
      url.searchParams.delete('sectionMode');
    }else{
      if(level) url.searchParams.set('level', String(level));
      else url.searchParams.delete('level');
      if(sectionKey && sectionKey !== 'all' && ['lessons', 'topics'].includes(sectionMode)){
        url.searchParams.set('section', sectionKey);
        url.searchParams.set('sectionMode', sectionMode);
      }else{
        url.searchParams.delete('section');
        url.searchParams.delete('sectionMode');
      }
    }
    return url;
  }

  function syncHskRoute(options = {}){
    const url = buildHskRouteUrl(options);
    const method = options.replace ? 'replaceState' : 'pushState';
    window.history[method](window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    publishHskBreadcrumb();
  }

  function saveLastCurriculum(sourceKey){
    try{
      window.localStorage.setItem(HSK_CURRICULUM_STORAGE_KEY, sourceKey);
    }catch(_error){}
  }
  let hskQuickLookupPromise = null;
  const grammarCache = new Map();
  const requestedHskSection = readRequestedHskSection();
  let pendingHskSectionKey = requestedHskSection.key;
  let pendingHskSectionMode = requestedHskSection.mode;
  const hskState = {
    summary: null,
    grammarSummary: null,
    currentLevel: readRequestedHskLevel(),
    currentItems: [],
    query: '',
    popupWord: '',
    popupStack: [],
    popupActiveChar: '',
    popupWriter: null,
    popupWriterChar: '',
    popupReturnContext: null,
    popupSeed: null,
    popupRelatedExpanded: false,
    popupLoadId: 0,
    groupMode: pendingHskSectionMode || 'lessons',
    topicKey: 'all',
    wordFilter: 'all',
    sourceKey: readLastCurriculum(),
    levelLoading: false,
    vocabViewMode: 'list',
    flashcardSession: null,
    flashcardStatsOpen: false
  };

  const HSK_MODE_STORAGE_KEY = 'hanziStroke.hskLastModeBySourceLevel.v1';
  const HSK_VOCAB_VIEW_STORAGE_KEY = 'hanziStroke.hskVocabViewMode.v1';
  const HSK_FLASHCARD_SETTINGS_KEY = 'hanziStroke.hskFlashcardSettings.v1';
  const HSK_FLASHCARD_RESULTS_KEY = 'hanziStroke.hskFlashcardResults.v1';
  const HSK_FLASHCARD_ACTIVE_SESSION_KEY = 'hanziStroke.hskFlashcardActiveSession.v1';
  const FLASHCARD_LIBRARY_SORT_KEY = 'hanziStroke.flashcardLibrarySort.v1';
  const FLASHCARD_DB_NAME = 'hanziStrokeFlashcards';
  const FLASHCARD_DB_VERSION = 2;
  const FLASHCARD_DECK_STORE = 'decks';
  const FLASHCARD_TRASH_STORE = 'trash';
  let flashcardTouchStart = null;
  let flashcardSuppressClickUntil = 0;
  let flashcardStrokeWriters = [];
  let flashcardStrokeRenderId = 0;
  let flashcardStrokePlayId = 0;
  let flashcardTypingCompletionTimer = 0;
  let flashcardTypingClockTimer = 0;
  const HSK_FLASHCARD_TYPING_SHORT_COMPLETION_DELAY_MS = 30000;
  const HSK_FLASHCARD_TYPING_LONG_COMPLETION_DELAY_MS = 120000;
  let tabFlashcards = null;
  let tabDialogue301 = null;
  let flashcardLibraryView = null;
  const flashcardLibraryState = { decks: [], editingDeck: null, detailDeckId: '', detailSearch: '', editingCardId: '', selectedCardIds: new Set(), message: '', quickImportBusy: false, searchQuery: '', sortMode: readFlashcardLibrarySort(), undoTrashId: '', undoTimer: null, trashOpen: false, trashItems: [] };

  function makeLocalId(prefix = 'id'){
    if(window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }


  function readFlashcardLibrarySort(){
    try{
      const value = window.localStorage?.getItem(FLASHCARD_LIBRARY_SORT_KEY) || '';
      return ['updated-desc', 'studied-desc', 'name-asc', 'cards-desc', 'hard-desc', 'review-desc'].includes(value) ? value : 'updated-desc';
    }catch(_err){
      return 'updated-desc';
    }
  }

  function saveFlashcardLibrarySort(value){
    try{ window.localStorage?.setItem(FLASHCARD_LIBRARY_SORT_KEY, value); }catch(_err){}
  }

  function normalizeLibrarySearch(value){
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ü/g, 'u')
      .toLowerCase()
      .trim();
  }

  function getDeckLearningStats(deck, results){
    const cards = Array.isArray(deck?.cards) ? deck.cards : [];
    const counts = { easy: 0, review: 0, hard: 0, unseen: 0 };
    let lastStudiedAt = '';
    cards.forEach(card => {
      const id = `custom:${deck.id}:${card.id}`;
      const entry = results[id];
      const rating = entry?.lastRating;
      if(rating === 'easy') counts.easy += 1;
      else if(rating === 'review') counts.review += 1;
      else if(rating === 'hard') counts.hard += 1;
      else counts.unseen += 1;
      if(String(entry?.lastStudiedAt || '') > lastStudiedAt) lastStudiedAt = String(entry.lastStudiedAt);
    });
    return { ...counts, total: cards.length, lastStudiedAt };
  }

  function getDeckSearchText(deck){
    const cardText = (deck.cards || []).map(card => `${card.word || ''} ${card.pinyin || ''} ${card.meaningVi || ''}`).join(' ');
    return normalizeLibrarySearch(`${deck.name || ''} ${deck.description || ''} ${cardText}`);
  }

  function prepareFlashcardLibraryDecks(decks){
    const results = readFlashcardResults();
    const query = normalizeLibrarySearch(flashcardLibraryState.searchQuery);
    const rows = (decks || []).map(deck => ({ deck, stats: getDeckLearningStats(deck, results) }));
    const filtered = query ? rows.filter(row => getDeckSearchText(row.deck).includes(query)) : rows;
    const compareText = (a, b) => String(a || '').localeCompare(String(b || ''), 'vi', { sensitivity: 'base' });
    filtered.sort((a, b) => {
      const mode = flashcardLibraryState.sortMode;
      if(mode === 'studied-desc') return String(b.stats.lastStudiedAt || '').localeCompare(String(a.stats.lastStudiedAt || '')) || String(b.deck.updatedAt || '').localeCompare(String(a.deck.updatedAt || ''));
      if(mode === 'name-asc') return compareText(a.deck.name, b.deck.name);
      if(mode === 'cards-desc') return b.stats.total - a.stats.total || compareText(a.deck.name, b.deck.name);
      if(mode === 'hard-desc') return b.stats.hard - a.stats.hard || b.stats.total - a.stats.total;
      if(mode === 'review-desc') return b.stats.review - a.stats.review || b.stats.total - a.stats.total;
      return String(b.deck.updatedAt || '').localeCompare(String(a.deck.updatedAt || ''));
    });
    return filtered;
  }

  function formatLibraryDate(value, emptyText = 'Chưa có'){
    if(!value) return emptyText;
    const date = new Date(value);
    if(Number.isNaN(date.getTime())) return emptyText;
    return date.toLocaleDateString('vi-VN');
  }

  function normalizeCardPart(value){
    return normalizeLibrarySearch(value).replace(/\s+/g, ' ').trim();
  }

  function getCardExactKey(card){
    return [card?.word, card?.pinyin, card?.meaningVi].map(normalizeCardPart).join('|');
  }

  function getCardWordPinyinKey(card){
    return [card?.word, card?.pinyin].map(normalizeCardPart).join('|');
  }

  function findDeckDuplicateInfo(deck, candidate, ignoreCardId = ''){
    const cards = Array.isArray(deck?.cards) ? deck.cards : [];
    const exactKey = getCardExactKey(candidate);
    const wordPinyinKey = getCardWordPinyinKey(candidate);
    const exact = cards.find(card => card.id !== ignoreCardId && getCardExactKey(card) === exactKey);
    const sameWordPinyin = cards.find(card => card.id !== ignoreCardId && getCardWordPinyinKey(card) === wordPinyinKey && getCardExactKey(card) !== exactKey);
    return { exact, sameWordPinyin };
  }

  function getDuplicateCardIds(deck){
    const seen = new Map();
    const duplicates = new Set();
    for(const card of deck?.cards || []){
      const key = getCardExactKey(card);
      if(!key.replace(/\|/g, '')) continue;
      if(seen.has(key)){
        duplicates.add(card.id);
        duplicates.add(seen.get(key));
      }else{
        seen.set(key, card.id);
      }
    }
    return duplicates;
  }

  function readFlashcardResultEntry(deckId, cardId){
    return readFlashcardResults()[`custom:${deckId}:${cardId}`] || null;
  }

  function writeFlashcardResults(results){
    try{ window.localStorage?.setItem(HSK_FLASHCARD_RESULTS_KEY, JSON.stringify(results)); }catch(_err){}
  }

  function moveCardLearningResult(sourceDeckId, targetDeckId, cardId){
    const results = readFlashcardResults();
    const oldKey = `custom:${sourceDeckId}:${cardId}`;
    const newKey = `custom:${targetDeckId}:${cardId}`;
    if(results[oldKey]){
      results[newKey] = results[oldKey];
      delete results[oldKey];
      writeFlashcardResults(results);
    }
  }

  function deleteCardLearningResults(deckId, cardIds){
    const results = readFlashcardResults();
    let changed = false;
    for(const cardId of cardIds){
      const key = `custom:${deckId}:${cardId}`;
      if(results[key]){ delete results[key]; changed = true; }
    }
    if(changed) writeFlashcardResults(results);
  }

  function getCardRatingLabel(entry){
    if(entry?.lastRating === 'easy') return 'Dễ';
    if(entry?.lastRating === 'review') return 'Ôn';
    if(entry?.lastRating === 'hard') return 'Khó';
    return 'Chưa học';
  }

  function getDetailDeck(){
    return flashcardLibraryState.decks.find(deck => deck.id === flashcardLibraryState.detailDeckId) || null;
  }

  function getFilteredDetailCards(deck){
    const query = normalizeLibrarySearch(flashcardLibraryState.detailSearch);
    if(!query) return deck?.cards || [];
    return (deck?.cards || []).filter(card => normalizeLibrarySearch(`${card.word || ''} ${card.pinyin || ''} ${card.meaningVi || ''}`).includes(query));
  }

  function downloadJsonFile(payload, filename){
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function openFlashcardDb(){
    return new Promise((resolve, reject) => {
      if(!window.indexedDB){ reject(new Error('Trình duyệt không hỗ trợ IndexedDB.')); return; }
      const request = window.indexedDB.open(FLASHCARD_DB_NAME, FLASHCARD_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if(!db.objectStoreNames.contains(FLASHCARD_DECK_STORE)){
          db.createObjectStore(FLASHCARD_DECK_STORE, { keyPath: 'id' });
        }
        if(!db.objectStoreNames.contains(FLASHCARD_TRASH_STORE)){
          const trashStore = db.createObjectStore(FLASHCARD_TRASH_STORE, { keyPath: 'id' });
          trashStore.createIndex('deletedAt', 'deletedAt', { unique: false });
          trashStore.createIndex('expiresAt', 'expiresAt', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Không mở được IndexedDB.'));
    });
  }

  async function withDeckStore(mode, callback){
    const db = await openFlashcardDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FLASHCARD_DECK_STORE, mode);
      const store = tx.objectStore(FLASHCARD_DECK_STORE);
      let value;
      try{ value = callback(store); }catch(err){ db.close(); reject(err); return; }
      tx.oncomplete = () => { db.close(); resolve(value); };
      tx.onerror = () => { db.close(); reject(tx.error || new Error('Lỗi IndexedDB.')); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error('Giao dịch bị hủy.')); };
    });
  }

  async function getAllCustomDecks(){
    const db = await openFlashcardDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FLASHCARD_DECK_STORE, 'readonly');
      const request = tx.objectStore(FLASHCARD_DECK_STORE).getAll();
      request.onsuccess = () => resolve((request.result || []).sort((a,b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))));
      request.onerror = () => reject(request.error || new Error('Không đọc được bộ thẻ.'));
      tx.oncomplete = () => db.close();
    });
  }

  async function saveCustomDeck(deck){
    const now = new Date().toISOString();
    const clean = {
      id: String(deck.id || makeLocalId('deck')),
      name: String(deck.name || '').trim() || 'Bộ thẻ chưa đặt tên',
      description: String(deck.description || '').trim(),
      createdAt: deck.createdAt || now,
      updatedAt: now,
      cards: (deck.cards || []).map(card => ({
        id: String(card.id || makeLocalId('card')),
        word: String(card.word || '').trim(),
        pinyin: String(card.pinyin || '').trim(),
        meaningVi: String(card.meaningVi || '').trim()
      })).filter(card => card.word)
    };
    await withDeckStore('readwrite', store => store.put(clean));
    return clean;
  }

  async function deleteCustomDeck(id){
    await withDeckStore('readwrite', store => store.delete(id));
  }


  function makeTrashExpiry(deletedAt){
    return new Date(new Date(deletedAt).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  }

  async function getTrashItem(id){
    const db = await openFlashcardDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FLASHCARD_TRASH_STORE, 'readonly');
      const request = tx.objectStore(FLASHCARD_TRASH_STORE).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Không đọc được Thùng rác.'));
      tx.oncomplete = () => db.close();
    });
  }


  async function getAllTrashItems(){
    const db = await openFlashcardDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FLASHCARD_TRASH_STORE, 'readonly');
      const request = tx.objectStore(FLASHCARD_TRASH_STORE).getAll();
      request.onsuccess = () => resolve((request.result || []).sort((a,b) => String(b.deletedAt || '').localeCompare(String(a.deletedAt || ''))));
      request.onerror = () => reject(request.error || new Error('Không đọc được Thùng rác.'));
      tx.oncomplete = () => db.close();
    });
  }

  async function deleteTrashItemPermanently(id){
    const db = await openFlashcardDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(FLASHCARD_TRASH_STORE, 'readwrite');
      tx.objectStore(FLASHCARD_TRASH_STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Không thể xóa vĩnh viễn.'));
      tx.onabort = () => reject(tx.error || new Error('Giao dịch bị hủy.'));
    });
    db.close();
  }

  async function clearTrashPermanently(){
    const db = await openFlashcardDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(FLASHCARD_TRASH_STORE, 'readwrite');
      tx.objectStore(FLASHCARD_TRASH_STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Không thể dọn sạch Thùng rác.'));
      tx.onabort = () => reject(tx.error || new Error('Giao dịch bị hủy.'));
    });
    db.close();
  }

  async function cleanupExpiredTrash(){
    const items = await getAllTrashItems();
    const now = Date.now();
    const expired = items.filter(item => {
      const time = new Date(item.expiresAt || '').getTime();
      return Number.isFinite(time) && time <= now;
    });
    if(!expired.length) return 0;
    const db = await openFlashcardDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(FLASHCARD_TRASH_STORE, 'readwrite');
      const store = tx.objectStore(FLASHCARD_TRASH_STORE);
      expired.forEach(item => store.delete(item.id));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Không thể tự dọn Thùng rác.'));
      tx.onabort = () => reject(tx.error || new Error('Giao dịch bị hủy.'));
    });
    db.close();
    return expired.length;
  }

  function getTrashDaysLeft(item){
    const expires = new Date(item?.expiresAt || '').getTime();
    if(!Number.isFinite(expires)) return 30;
    return Math.max(0, Math.ceil((expires - Date.now()) / (24 * 60 * 60 * 1000)));
  }

  function confirmFlashcardAction({ title = 'Xác nhận', message = '', confirmText = 'Xác nhận', danger = false } = {}){
    return new Promise(resolve => {
      document.getElementById('flashcardConfirmOverlay')?.remove();
      const overlay = document.createElement('div');
      overlay.id = 'flashcardConfirmOverlay';
      overlay.className = 'flashcard-confirm-overlay';
      overlay.innerHTML = `
        <section class="flashcard-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="flashcardConfirmTitle">
          <button type="button" class="flashcard-confirm-x" data-flashcard-confirm-cancel aria-label="Đóng">×</button>
          <div class="flashcard-confirm-icon">${danger ? '🗑' : '↺'}</div>
          <h3 id="flashcardConfirmTitle">${escapeHtml(title)}</h3>
          <p>${escapeHtml(message)}</p>
          <div class="flashcard-confirm-actions">
            <button type="button" data-flashcard-confirm-cancel>Hủy</button>
            <button type="button" class="${danger ? 'danger' : 'primary'}" data-flashcard-confirm-ok>${escapeHtml(confirmText)}</button>
          </div>
        </section>`;
      const finish = value => { overlay.remove(); resolve(value); };
      overlay.addEventListener('click', event => {
        if(event.target === overlay || event.target.closest('[data-flashcard-confirm-cancel]')) finish(false);
        else if(event.target.closest('[data-flashcard-confirm-ok]')) finish(true);
      });
      document.body.appendChild(overlay);
      overlay.querySelector('[data-flashcard-confirm-ok]')?.focus();
    });
  }

  async function moveCardsToTrash(deck, cardIds){
    const selected = new Set(cardIds || []);
    const entries = (deck.cards || []).map((card, index) => ({ card, index })).filter(item => selected.has(item.card.id));
    if(!entries.length) return null;
    const deletedAt = new Date().toISOString();
    const trashItem = {
      id: makeLocalId('trash'),
      type: 'cards',
      deletedAt,
      expiresAt: makeTrashExpiry(deletedAt),
      sourceDeckId: deck.id,
      sourceDeckName: deck.name,
      entries: entries.map(item => ({ index: item.index, card: { ...item.card } }))
    };
    const updatedDeck = { ...deck, cards: (deck.cards || []).filter(card => !selected.has(card.id)), updatedAt: deletedAt };
    const db = await openFlashcardDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction([FLASHCARD_DECK_STORE, FLASHCARD_TRASH_STORE], 'readwrite');
      tx.objectStore(FLASHCARD_DECK_STORE).put(updatedDeck);
      tx.objectStore(FLASHCARD_TRASH_STORE).put(trashItem);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Không thể chuyển thẻ vào Thùng rác.'));
      tx.onabort = () => reject(tx.error || new Error('Giao dịch bị hủy.'));
    });
    db.close();
    return trashItem;
  }

  async function moveDeckToTrash(deckId){
    const deck = flashcardLibraryState.decks.find(item => item.id === deckId);
    if(!deck) return null;
    const deletedAt = new Date().toISOString();
    const trashItem = {
      id: makeLocalId('trash'),
      type: 'deck',
      deletedAt,
      expiresAt: makeTrashExpiry(deletedAt),
      data: JSON.parse(JSON.stringify(deck))
    };
    const db = await openFlashcardDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction([FLASHCARD_DECK_STORE, FLASHCARD_TRASH_STORE], 'readwrite');
      tx.objectStore(FLASHCARD_DECK_STORE).delete(deckId);
      tx.objectStore(FLASHCARD_TRASH_STORE).put(trashItem);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Không thể chuyển bộ vào Thùng rác.'));
      tx.onabort = () => reject(tx.error || new Error('Giao dịch bị hủy.'));
    });
    db.close();
    return trashItem;
  }

  async function restoreTrashItem(id){
    const item = await getTrashItem(id);
    if(!item) return false;
    const db = await openFlashcardDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction([FLASHCARD_DECK_STORE, FLASHCARD_TRASH_STORE], 'readwrite');
      const deckStore = tx.objectStore(FLASHCARD_DECK_STORE);
      const trashStore = tx.objectStore(FLASHCARD_TRASH_STORE);
      if(item.type === 'deck'){
        deckStore.put({ ...item.data, updatedAt: new Date().toISOString() });
        trashStore.delete(item.id);
      }else if(item.type === 'cards'){
        const request = deckStore.get(item.sourceDeckId);
        request.onsuccess = () => {
          const current = request.result || {
            id: item.sourceDeckId || makeLocalId('deck'),
            name: item.sourceDeckName || 'Đã khôi phục',
            description: 'Bộ được tạo lại khi hoàn tác.',
            createdAt: new Date().toISOString(),
            cards: []
          };
          const cards = [...(current.cards || [])];
          const existingIds = new Set(cards.map(card => card.id));
          for(const entry of [...(item.entries || [])].sort((a,b) => a.index - b.index)){
            if(existingIds.has(entry.card.id)) continue;
            cards.splice(Math.max(0, Math.min(entry.index, cards.length)), 0, entry.card);
            existingIds.add(entry.card.id);
          }
          deckStore.put({ ...current, cards, updatedAt: new Date().toISOString() });
          trashStore.delete(item.id);
        };
        request.onerror = () => tx.abort();
      }else{
        trashStore.delete(item.id);
      }
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Không thể hoàn tác.'));
      tx.onabort = () => reject(tx.error || new Error('Hoàn tác bị hủy.'));
    });
    db.close();
    return true;
  }

  function hideFlashcardUndoToast(){
    document.getElementById('flashcardUndoToast')?.remove();
    if(flashcardLibraryState.undoTimer){
      window.clearTimeout(flashcardLibraryState.undoTimer);
      flashcardLibraryState.undoTimer = null;
    }
  }

  function showFlashcardUndoToast(message, trashId){
    hideFlashcardUndoToast();
    flashcardLibraryState.undoTrashId = trashId || '';
    const toast = document.createElement('div');
    toast.id = 'flashcardUndoToast';
    toast.className = 'flashcard-undo-toast';
    toast.innerHTML = `<span>${escapeHtml(message)}</span><button type="button" data-flashcard-undo-delete>Hoàn tác</button><button type="button" class="flashcard-undo-close" data-flashcard-undo-close aria-label="Đóng">×</button>`;
    toast.addEventListener('click', async event => {
      if(event.target.closest('[data-flashcard-undo-close]')){
        hideFlashcardUndoToast();
        return;
      }
      const undoButton = event.target.closest('[data-flashcard-undo-delete]');
      if(!undoButton) return;
      const currentTrashId = flashcardLibraryState.undoTrashId;
      if(!currentTrashId) return;
      undoButton.disabled = true;
      try{
        const restored = await restoreTrashItem(currentTrashId);
        hideFlashcardUndoToast();
        flashcardLibraryState.message = restored ? 'Đã hoàn tác thao tác xóa.' : 'Mục này không còn trong Thùng rác.';
        await renderFlashcardLibrary();
      }catch(err){
        undoButton.disabled = false;
        window.alert(err.message || 'Không thể hoàn tác.');
      }
    });
    document.body.appendChild(toast);
    flashcardLibraryState.undoTimer = window.setTimeout(() => hideFlashcardUndoToast(), 8000);
  }

  async function importCustomDecks(decks){
    const db = await openFlashcardDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FLASHCARD_DECK_STORE, 'readwrite');
      const store = tx.objectStore(FLASHCARD_DECK_STORE);
      for(const raw of decks || []){
        const deck = {
          id: String(raw.id || makeLocalId('deck')),
          name: String(raw.name || 'Bộ thẻ đã nhập'),
          description: String(raw.description || ''),
          createdAt: raw.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          cards: (raw.cards || []).map(card => ({
            id: String(card.id || makeLocalId('card')),
            word: String(card.word || '').trim(),
            pinyin: String(card.pinyin || '').trim(),
            meaningVi: String(card.meaningVi || '').trim()
          })).filter(card => card.word)
        };
        store.put(deck);
      }
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error || new Error('Không nhập được dữ liệu.')); };
    });
  }

  function navigateStudyRoute(routeName, tabName){
    const currentRoute = new URLSearchParams(window.location.search).get('study') || 'hub';
    if(currentRoute === routeName){
      setStudyTab(tabName);
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set('study', routeName);
    window.location.href = url.href;
  }

  function ensureFlashcardLibraryUi(){
    if(tabFlashcards && flashcardLibraryView) return;
    const tabHost = tabHsk.parentElement;
    const viewHost = hskView.parentElement;
    if(!tabHost || !viewHost) return;
    tabFlashcards = document.createElement('button');
    tabFlashcards.type = 'button';
    tabFlashcards.id = 'studyTabFlashcards';
    tabFlashcards.className = tabHsk.className;
    tabFlashcards.setAttribute('role', 'tab');
    tabFlashcards.setAttribute('aria-selected', 'false');
    tabFlashcards.textContent = 'Thẻ';
    tabHost.appendChild(tabFlashcards);
    tabHost.querySelectorAll('[data-study-tab="dialogue301"], #studyTabDialogue301, a[href*="dialogue301"]').forEach(node => node.remove());
    tabDialogue301 = null;
    flashcardLibraryView = document.createElement('section');
    flashcardLibraryView.id = 'flashcardLibraryView';
    flashcardLibraryView.className = hskView.className;
    flashcardLibraryView.hidden = true;
    viewHost.appendChild(flashcardLibraryView);
    tabFlashcards.addEventListener('click', () => navigateStudyRoute('flashcards', 'flashcards'));
    flashcardLibraryView.addEventListener('click', event => { event.stopPropagation(); handleFlashcardLibraryClick(event); });
    flashcardLibraryView.addEventListener('change', handleFlashcardLibraryChange);
    flashcardLibraryView.addEventListener('input', handleFlashcardLibraryInput);
  }

  function ensureDeckEditorState(deck){
    if(!deck) return null;
    if(!Array.isArray(deck.cards)) deck.cards = [];
    if(!['manual', 'quick'].includes(deck.entryMode)) deck.entryMode = 'manual';
    if(typeof deck.quickImportText !== 'string') deck.quickImportText = '';
    if(!Array.isArray(deck.quickImportRows)) deck.quickImportRows = [];
    if(!Array.isArray(deck.quickSegmentTokens)) deck.quickSegmentTokens = [];
    if(typeof deck.quickNewToken !== 'string') deck.quickNewToken = '';
    return deck;
  }

  function syncDeckEditorFields(){
    const deck = ensureDeckEditorState(flashcardLibraryState.editingDeck);
    if(!deck || !flashcardLibraryView) return deck;
    const name = flashcardLibraryView.querySelector('[data-flashcard-deck-name]');
    const description = flashcardLibraryView.querySelector('[data-flashcard-deck-description]');
    const quickText = flashcardLibraryView.querySelector('[data-flashcard-quick-text]');
    if(name) deck.name = name.value;
    if(description) deck.description = description.value;
    if(quickText) deck.quickImportText = quickText.value;
    return deck;
  }

  function parseDelimitedQuickLine(line){
    const raw = String(line || '').trim(); if(!raw) return null;
    const delimiter = raw.includes('|') ? '|' : (raw.includes('\t') ? '\t' : null);
    if(!delimiter) return { word:getHanziChars(raw).join('').trim(), pinyin:'', meaningVi:'', userProvided:false };
    const parts = raw.split(delimiter).map(part => part.trim());
    return { word:getHanziChars(parts[0]||'').join('').trim(), pinyin:parts[1]||'', meaningVi:parts.slice(2).join(' ').trim(), userProvided:true };
  }

  function splitQuickImportEntries(value){
    const seen=new Set(), entries=[];
    String(value||'').split(/\r?\n/).forEach(line=>{ const trimmed=line.trim(); if(!trimmed) return;
      if(trimmed.includes('|')||trimmed.includes('\t')){ const entry=parseDelimitedQuickLine(trimmed); const key=`${entry?.word||''}|${normalizeSearchText(entry?.pinyin||'')}|${normalizeSearchText(entry?.meaningVi||'')}`; if(entry?.word&&!seen.has(key)){seen.add(key);entries.push(entry);} return; }
      trimmed.split(/[,，;；、]+/).forEach(part=>{ const word=getHanziChars(part).join('').trim(); const key=`${word}||`; if(word&&!seen.has(key)){seen.add(key);entries.push({word,pinyin:'',meaningVi:'',userProvided:false});} });
    }); return entries;
  }

  async function segmentChineseSentence(text){
    const chars=getHanziChars(text), tokens=[], hskLookup=await loadHskQuickLookup(); let index=0;
    while(index<chars.length){ let match=''; for(let len=Math.min(6,chars.length-index);len>=2;len-=1){ const candidate=chars.slice(index,index+len).join(''); if(hskLookup[candidate]||await loadCompoundWordInfo(candidate)){match=candidate;break;} } if(!match)match=chars[index]; tokens.push(match); index+=Array.from(match).length; }
    return tokens;
  }
  async function segmentQuickImportText(value){
    const entries=[];
    for(const line of String(value||'').split(/\r?\n/)){
      if(!line.trim()) continue;
      for(const word of await segmentChineseSentence(line)){
        if(word) entries.push({ id:makeLocalId('token'), word, selected:false });
      }
    }
    return entries;
  }

  async function prepareQuickImportTokens(){
    const deck=syncDeckEditorFields();
    if(!deck) return;
    const source=String(deck.quickImportText||'').trim();
    if(!source){ flashcardLibraryState.message='Hãy nhập một câu tiếng Trung trước khi tách.'; renderFlashcardLibrary(); return; }
    flashcardLibraryState.quickImportBusy=true;
    deck.quickSegmentTokens=[];
    deck.quickImportRows=[];
    await renderFlashcardLibrary();
    try{
      deck.quickSegmentTokens=await segmentQuickImportText(source);
      flashcardLibraryState.message=deck.quickSegmentTokens.length ? 'Đã tạo gợi ý token. Hãy chỉnh, gộp hoặc tách trước khi tra.' : 'Không tìm thấy chữ Hán để tách.';
    }finally{
      flashcardLibraryState.quickImportBusy=false;
      await renderFlashcardLibrary();
    }
  }

  function getSelectedQuickTokens(deck){
    return (deck?.quickSegmentTokens||[]).map((token,index)=>({token,index})).filter(item=>item.token.selected);
  }

  function mergeSelectedQuickTokens(){
    const deck=ensureDeckEditorState(flashcardLibraryState.editingDeck);
    const selected=getSelectedQuickTokens(deck);
    if(selected.length<2){ flashcardLibraryState.message='Chọn ít nhất 2 token liền kề để gộp.'; renderFlashcardLibrary(); return; }
    const indexes=selected.map(item=>item.index);
    const contiguous=indexes.every((value,index)=>index===0||value===indexes[index-1]+1);
    if(!contiguous){ flashcardLibraryState.message='Chỉ có thể gộp các token nằm liền nhau.'; renderFlashcardLibrary(); return; }
    const merged=selected.map(item=>item.token.word).join('');
    deck.quickSegmentTokens.splice(indexes[0],indexes.length,{id:makeLocalId('token'),word:merged,selected:false});
    flashcardLibraryState.message=`Đã gộp thành “${merged}”.`;
    renderFlashcardLibrary();
  }

  function applyQuickTokenSplit(tokenIndex, splitPosition){
    const deck=ensureDeckEditorState(flashcardLibraryState.editingDeck);
    const token=deck?.quickSegmentTokens?.[tokenIndex];
    const chars=getHanziChars(token?.word || '');
    const position=Number(splitPosition);
    if(!token || chars.length<2 || !Number.isInteger(position) || position<=0 || position>=chars.length){
      flashcardLibraryState.message='Vị trí tách không hợp lệ.';
      renderFlashcardLibrary();
      return false;
    }
    const left=chars.slice(0,position).join('');
    const right=chars.slice(position).join('');
    deck.quickSegmentTokens.splice(tokenIndex,1,
      {id:makeLocalId('token'),word:left,selected:false},
      {id:makeLocalId('token'),word:right,selected:false}
    );
    flashcardLibraryState.message=`Đã tách “${chars.join('')}” thành “${left}” và “${right}”.`;
    renderFlashcardLibrary();
    return true;
  }

  function openQuickTokenSplitDialog(){
    const deck=ensureDeckEditorState(flashcardLibraryState.editingDeck);
    const selected=getSelectedQuickTokens(deck);
    if(selected.length!==1){
      flashcardLibraryState.message='Chọn đúng 1 token để tách.';
      renderFlashcardLibrary();
      return;
    }
    const item=selected[0];
    const chars=getHanziChars(item.token.word);
    if(chars.length<2){
      flashcardLibraryState.message='Token này chỉ có một chữ, không thể tách thêm.';
      renderFlashcardLibrary();
      return;
    }

    document.getElementById('flashcardTokenSplitOverlay')?.remove();
    const overlay=document.createElement('div');
    overlay.id='flashcardTokenSplitOverlay';
    overlay.className='flashcard-token-split-overlay';
    const defaultPosition=Math.max(1,Math.floor(chars.length/2));
    const options=[];
    for(let position=1;position<chars.length;position+=1){
      const left=chars.slice(0,position).join('');
      const right=chars.slice(position).join('');
      options.push(`
        <label class="flashcard-token-split-option">
          <input type="radio" name="flashcard-token-split-position" value="${position}" ${position===defaultPosition?'checked':''}>
          <span><b>${escapeHtml(left)}</b><i aria-hidden="true">|</i><b>${escapeHtml(right)}</b></span>
        </label>`);
    }
    overlay.innerHTML=`
      <section class="flashcard-token-split-dialog" role="dialog" aria-modal="true" aria-labelledby="flashcardTokenSplitTitle">
        <header>
          <div><small>TÁCH TOKEN</small><h3 id="flashcardTokenSplitTitle">Tách “${escapeHtml(chars.join(''))}”</h3></div>
          <button type="button" data-flashcard-token-split-cancel aria-label="Đóng">×</button>
        </header>
        <p>Chọn vị trí tách. Dữ liệu chỉ được cập nhật trong danh sách token, chưa tự thêm vào bộ thẻ.</p>
        <div class="flashcard-token-split-options">${options.join('')}</div>
        <div class="flashcard-token-split-actions">
          <button type="button" data-flashcard-token-split-cancel>Hủy</button>
          <button type="button" class="primary" data-flashcard-token-split-confirm>Tách token</button>
        </div>
      </section>`;

    const close=()=>{
      document.removeEventListener('keydown',onKeydown);
      overlay.remove();
    };
    const onKeydown=event=>{
      if(event.key==='Escape') close();
    };
    overlay.addEventListener('click',event=>{
      if(event.target===overlay || event.target.closest('[data-flashcard-token-split-cancel]')){
        close();
        return;
      }
      if(event.target.closest('[data-flashcard-token-split-confirm]')){
        const checked=overlay.querySelector('input[name="flashcard-token-split-position"]:checked');
        if(!checked) return;
        const position=Number(checked.value);
        close();
        applyQuickTokenSplit(item.index,position);
      }
    });
    document.body.appendChild(overlay);
    document.addEventListener('keydown',onKeydown);
    overlay.querySelector('input[name="flashcard-token-split-position"]:checked')?.focus();
  }

  function deleteSelectedQuickTokens(){
    const deck=ensureDeckEditorState(flashcardLibraryState.editingDeck);
    const before=deck.quickSegmentTokens.length;
    deck.quickSegmentTokens=deck.quickSegmentTokens.filter(token=>!token.selected);
    const removed=before-deck.quickSegmentTokens.length;
    flashcardLibraryState.message=removed?`Đã bỏ ${removed} token.`:'Chưa chọn token nào.';
    renderFlashcardLibrary();
  }

  function addQuickToken(){
    const deck=ensureDeckEditorState(flashcardLibraryState.editingDeck);
    const word=getHanziChars(deck.quickNewToken).join('');
    if(!word){ flashcardLibraryState.message='Hãy nhập một token tiếng Trung hợp lệ.'; renderFlashcardLibrary(); return; }
    deck.quickSegmentTokens.push({id:makeLocalId('token'),word,selected:false});
    deck.quickNewToken='';
    flashcardLibraryState.message=`Đã thêm token “${word}”.`;
    renderFlashcardLibrary();
  }

  async function analyzeQuickImportTokens(){
    const deck=ensureDeckEditorState(flashcardLibraryState.editingDeck);
    const entries=(deck.quickSegmentTokens||[]).map(token=>({word:getHanziChars(token.word).join(''),pinyin:'',meaningVi:'',userProvided:false,segmented:true})).filter(entry=>entry.word);
    await analyzeQuickImportEntries(entries);
  }

  function parseCsvText(text){
    const rows=[]; let row=[],cell='',quoted=false; const input=String(text||'').replace(/^\uFEFF/,'');
    const pushCell=()=>{row.push(cell);cell='';}, pushRow=()=>{pushCell();if(row.some(v=>String(v).trim()))rows.push(row);row=[];};
    for(let i=0;i<input.length;i+=1){const ch=input[i];if(ch==='"'){if(quoted&&input[i+1]==='"'){cell+='"';i+=1;}else quoted=!quoted;}else if(ch===','&&!quoted)pushCell();else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&input[i+1]==='\n')i+=1;pushRow();}else cell+=ch;} if(cell||row.length)pushRow(); return rows;
  }
  function mapCsvRowsToQuickEntries(rows){ if(!rows.length)return[]; const header=rows[0].map(v=>normalizeSearchText(v)); const wi=header.findIndex(v=>['word','hanzi','chinese','tu','tutiengtrung'].includes(v)),pi=header.findIndex(v=>v==='pinyin'),mi=header.findIndex(v=>['meaningvi','meaning_vi','meaning','nghia','nghiaviet'].includes(v)); const start=(wi>=0||pi>=0||mi>=0)?1:0; return rows.slice(start).map(cols=>({word:getHanziChars(cols[wi>=0?wi:0]||'').join('').trim(),pinyin:String(cols[pi>=0?pi:1]||'').trim(),meaningVi:String(cols[mi>=0?mi:2]||'').trim(),userProvided:true})).filter(e=>e.word); }

  async function loadHskQuickLookup(){
    if(!hskQuickLookupPromise){
      hskQuickLookupPromise = fetch(HSK_QUICK_LOOKUP_PATH)
        .then(response => {
          if(!response.ok){
            throw new Error(`${response.status} ${response.statusText}`);
          }
          return response.json();
        })
        .then(payload => payload?.items && typeof payload.items === 'object' ? payload.items : {})
        .catch(err => {
          console.warn('Cannot load HSK quick lookup index:', err);
          return {};
        });
    }
    return hskQuickLookupPromise;
  }

  const VERIFIED_QUICK_IMPORT_CORRECTIONS = Object.freeze({
    '圆满': { meaningVi: 'viên mãn, trọn vẹn, hoàn thành tốt đẹp', note: 'Nghĩa tính từ/trạng thái đã xác minh' },
    '哇': { meaningVi: 'oa, chà; thán từ biểu thị ngạc nhiên hoặc cảm thán', note: 'Nghĩa thán từ đã xác minh' },
    '哎': { meaningVi: 'ôi, này; thán từ dùng để gọi, đáp hoặc biểu thị cảm xúc', note: 'Nghĩa thán từ đã xác minh' },
    '嘛': { meaningVi: 'mà; trợ từ ngữ khí dùng để nhấn mạnh điều hiển nhiên hoặc giải thích', note: 'Nghĩa trợ từ ngữ khí đã xác minh' },
    '肝': { meaningVi: 'gan', note: 'Nghĩa danh từ chỉ cơ quan cơ thể đã xác minh' },
    '那': { meaningVi: 'kia, đó, ấy', note: 'Nghĩa đại từ chỉ định đã xác minh' }
  });

  function normalizeHskQuickLookupEntry(entry, target){
    if(!entry) return null;
    return {
      word: entry.word || target,
      pinyin: entry.pinyin || '',
      meaningVi: entry.meaningVi || '',
      source: entry.libraryId === 'hsk'
        ? `HSK ${entry.levelNo || ''}`.trim()
        : `New HSK ${entry.levelNo || ''}`.trim()
    };
  }

  function normalizeLatinForMeaningCheck(value){
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ü/g, 'u')
      .replace(/[^a-z0-9]+/gi, '')
      .toLowerCase();
  }

  function isPlaceholderMeaning(value){
    const normalized = String(value || '').trim().toLowerCase();
    return !normalized || ['-', '--', '—', '?', 'n/a', 'null', 'undefined', '...'].includes(normalized);
  }

  function isSuspiciousMeaning(target, pinyin, meaning){
    const raw = String(meaning || '').trim();
    if(isPlaceholderMeaning(raw)) return true;
    if(raw === String(target || '').trim()) return true;
    const comparableMeaning = normalizeLatinForMeaningCheck(raw);
    const comparablePinyin = normalizeLatinForMeaningCheck(pinyin);
    const asciiOnlyMeaning = /^[a-z0-9\s'-]+$/i.test(raw);
    return Boolean(asciiOnlyMeaning && comparableMeaning && comparablePinyin && comparableMeaning === comparablePinyin);
  }

  function isUsableDictionaryMeaning(target, pinyin, meaning){
    return !isSuspiciousMeaning(target, pinyin, meaning);
  }

  function formatDictionarySource(source){
    const raw = String(source || '').trim();
    if(!raw) return 'Dictionary';
    return raw.startsWith('data/words/') ? `Dictionary (${raw.replace('data/words/', '')})` : raw;
  }

  function buildQuickImportSource(baseSource, usedDictionaryPinyin, usedDictionaryMeaning, dictionarySource){
    if(!baseSource) return formatDictionarySource(dictionarySource);
    if(usedDictionaryPinyin && usedDictionaryMeaning) return `${baseSource} · Pinyin + nghĩa: Dictionary`;
    if(usedDictionaryPinyin) return `${baseSource} · Pinyin: Dictionary`;
    if(usedDictionaryMeaning) return `${baseSource} · Nghĩa: Dictionary`;
    return baseSource;
  }

  async function lookupQuickImportWord(word, seed = {}){
    const target = getHanziChars(word).join('');
    if(!target){
      return { id: makeLocalId('preview'), word: '', pinyin: '', meaningVi: '', status: 'missing', source: '' };
    }

    const hskLookup = await loadHskQuickLookup();
    const hskInfo = normalizeHskQuickLookupEntry(hskLookup[target], target);
    const hskPinyin = String(hskInfo?.pinyin || '').trim();
    const hskMeaning = String(hskInfo?.meaningVi || '').trim();
    const hskMeaningSuspicious = Boolean(hskInfo && isSuspiciousMeaning(target, hskPinyin, hskMeaning));
    const needsDictionary = !hskInfo || !hskPinyin || !hskMeaning || hskMeaningSuspicious;
    const verifiedCorrection = VERIFIED_QUICK_IMPORT_CORRECTIONS[target] || null;
    const dictionaryInfo = needsDictionary && !verifiedCorrection ? await loadCompoundWordInfo(target) : null;
    const dictionaryPinyin = String(dictionaryInfo?.pinyin || '').trim();
    const dictionaryMeaning = String(dictionaryInfo?.meaningVi || '').trim();
    const dictionaryMeaningUsable = Boolean(dictionaryInfo && isUsableDictionaryMeaning(target, dictionaryPinyin, dictionaryMeaning));

    let info = null;
    if(hskInfo){
      const usedDictionaryPinyin = !hskPinyin && Boolean(dictionaryPinyin);
      const usedVerifiedMeaning = (!hskMeaning || hskMeaningSuspicious) && Boolean(verifiedCorrection?.meaningVi);
      const usedDictionaryMeaning = !usedVerifiedMeaning && (!hskMeaning || hskMeaningSuspicious) && dictionaryMeaningUsable;
      info = {
        word: target,
        pinyin: hskPinyin || dictionaryPinyin,
        meaningVi: usedVerifiedMeaning
          ? verifiedCorrection.meaningVi
          : (usedDictionaryMeaning ? dictionaryMeaning : (hskMeaningSuspicious ? '' : hskMeaning)),
        source: usedVerifiedMeaning
          ? `${hskInfo.source} · Nghĩa: hiệu chỉnh đã xác minh`
          : buildQuickImportSource(hskInfo.source, usedDictionaryPinyin, usedDictionaryMeaning, dictionaryInfo?.source)
      };
      if(hskMeaningSuspicious && !usedVerifiedMeaning && !usedDictionaryMeaning){
        info.source = `${hskInfo.source} · Nghĩa HSK cần kiểm tra`;
      }
    }else if(verifiedCorrection){
      info = {
        word: target,
        pinyin: dictionaryPinyin,
        meaningVi: verifiedCorrection.meaningVi,
        source: 'Hiệu chỉnh đã xác minh'
      };
    }else if(dictionaryInfo){
      info = {
        ...dictionaryInfo,
        meaningVi: dictionaryMeaningUsable ? dictionaryMeaning : '',
        source: formatDictionarySource(dictionaryInfo.source)
      };
    }

    if((!info || (!String(info.pinyin || '').trim() && !String(info.meaningVi || '').trim())) && getHanziChars(target).length === 1){
      const charInfo = await loadLocalCharInfo(target);
      if(charInfo){
        info = {
          word: target,
          pinyin: charInfo.pinyin || '',
          meaningVi: charInfo.meaningVi || '',
          source: 'data/chars'
        };
      }
    }

    const candidates = await loadCompoundWordCandidates(target);
    const meaningOptions = [...new Set(candidates.flatMap(item => String(item.meaningVi || '').split(/[;；]/).map(v => v.trim()).filter(Boolean)))];
    const pinyin = String(seed.pinyin || info?.pinyin || '').trim();
    const meaningVi = String(seed.meaningVi || info?.meaningVi || '').trim();
    const status = pinyin && meaningVi ? 'found' : (pinyin || meaningVi ? 'partial' : 'missing');
    return { id:makeLocalId('preview'), word:target, pinyin, meaningVi, status, source:seed.userProvided?'Người dùng nhập':String(info?.source||''), meaningOptions, selectedMeanings:meaningVi?[meaningVi]:[] };
  }

  async function analyzeQuickImportEntries(entries){ const deck=syncDeckEditorFields(); if(!deck)return; if(!entries.length){window.alert('Hãy nhập ít nhất một từ tiếng Trung.');return;} flashcardLibraryState.quickImportBusy=true; deck.quickImportRows=[]; await renderFlashcardLibrary(); try{deck.quickImportRows=annotateQuickImportRows(deck,await Promise.all(entries.map(entry=>lookupQuickImportWord(entry.word,entry))));}finally{flashcardLibraryState.quickImportBusy=false;await renderFlashcardLibrary();} }
  async function analyzeQuickImportWords(){const deck=syncDeckEditorFields();if(deck)await analyzeQuickImportEntries(splitQuickImportEntries(deck.quickImportText));}
  async function analyzeQuickImportSentence(){ await prepareQuickImportTokens(); }
  async function importQuickCsvFile(file){await analyzeQuickImportEntries(mapCsvRowsToQuickEntries(parseCsvText(await file.text())));}

  function annotateQuickImportRows(deck, rows){
    const seenExact = new Map();
    return (rows || []).map(row => {
      const candidate = { word: row.word, pinyin: row.pinyin, meaningVi: row.meaningVi };
      const duplicate = findDeckDuplicateInfo(deck, candidate);
      const exactKey = getCardExactKey(candidate);
      const inputDuplicateOf = exactKey.replace(/\|/g, '') && seenExact.has(exactKey) ? seenExact.get(exactKey) : '';
      if(!inputDuplicateOf && exactKey.replace(/\|/g, '')) seenExact.set(exactKey, row.id);
      let duplicateType = 'new';
      let duplicateCardId = '';
      let action = 'add';
      let selected = true;
      if(inputDuplicateOf){
        duplicateType = 'input-exact';
        duplicateCardId = inputDuplicateOf;
        action = 'skip';
        selected = false;
      }else if(duplicate.exact){
        duplicateType = 'deck-exact';
        duplicateCardId = duplicate.exact.id;
        action = 'skip';
        selected = false;
      }else if(duplicate.sameWordPinyin){
        duplicateType = 'same-word-pinyin';
        duplicateCardId = duplicate.sameWordPinyin.id;
        action = 'keep';
      }
      return { ...row, selected, duplicateType, duplicateCardId, action };
    });
  }

  function getQuickDuplicateLabel(row){
    if(row.duplicateType === 'deck-exact') return 'Trùng hoàn toàn trong bộ';
    if(row.duplicateType === 'input-exact') return 'Trùng trong danh sách nhập';
    if(row.duplicateType === 'same-word-pinyin') return 'Cùng từ + pinyin, nghĩa khác';
    return 'Thẻ mới';
  }

  function getQuickSelectedRows(rows){
    return (rows || []).filter(row => row.selected && row.action !== 'skip' && row.word);
  }

  function readQuickPreviewRows(){
    if(!flashcardLibraryView) return [];
    return [...flashcardLibraryView.querySelectorAll('[data-flashcard-quick-row]')].map(row => ({
      id: row.dataset.flashcardQuickRow || makeLocalId('preview'),
      word: row.querySelector('[data-flashcard-quick-word]')?.value.trim() || '',
      pinyin: row.querySelector('[data-flashcard-quick-pinyin]')?.value.trim() || '',
      meaningVi: row.querySelector('[data-flashcard-quick-meaning]')?.value.trim() || '',
      status: row.dataset.flashcardQuickStatus || 'missing',
      source: row.dataset.flashcardQuickSource || '',
      selected: Boolean(row.querySelector('[data-flashcard-quick-select]')?.checked),
      duplicateType: row.dataset.flashcardQuickDuplicate || 'new',
      duplicateCardId: row.dataset.flashcardQuickDuplicateCard || '',
      action: row.querySelector('[data-flashcard-quick-action]')?.value || row.dataset.flashcardQuickAction || 'add',
      meaningOptions:[...row.querySelectorAll('[data-flashcard-meaning-option]')].map(input=>input.value),
      selectedMeanings:[...row.querySelectorAll('[data-flashcard-meaning-option]:checked')].map(input=>input.value)
    })).map(row=>({...row,meaningVi:row.selectedMeanings?.length?row.selectedMeanings.join('; '):row.meaningVi})).filter(row => row.word);
  }

  function addQuickPreviewToDeck(){
    const deck = syncDeckEditorFields();
    if(!deck) return;
    const rows = readQuickPreviewRows();
    let added = 0;
    let updated = 0;
    let skipped = 0;
    rows.forEach(row => {
      if(!row.selected || row.action === 'skip' || !row.word){ skipped += 1; return; }
      const candidate = { word: row.word, pinyin: row.pinyin, meaningVi: row.meaningVi };
      const duplicate = findDeckDuplicateInfo(deck, candidate);
      if(duplicate.exact){ skipped += 1; return; }
      if(row.action === 'replace' && row.duplicateCardId){
        const target = deck.cards.find(card => card.id === row.duplicateCardId);
        if(target){ Object.assign(target, candidate); updated += 1; return; }
      }
      if(row.action === 'merge' && row.duplicateCardId){
        const target = deck.cards.find(card => card.id === row.duplicateCardId);
        if(target){
          const parts = [target.meaningVi, row.meaningVi].map(value => String(value || '').trim()).filter(Boolean);
          target.meaningVi = [...new Set(parts)].join('; ');
          if(!target.pinyin && row.pinyin) target.pinyin = row.pinyin;
          updated += 1;
          return;
        }
      }
      deck.cards.push({ id: makeLocalId('card'), ...candidate });
      added += 1;
    });
    deck.quickImportRows = annotateQuickImportRows(deck, rows);
    flashcardLibraryState.message = `Đã thêm ${added} · cập nhật ${updated} · bỏ qua ${skipped}.`;
    renderFlashcardLibrary();
  }

  function renderQuickTokenEditor(deck){
    const tokens=Array.isArray(deck.quickSegmentTokens)?deck.quickSegmentTokens:[];
    if(!tokens.length) return '';
    const selectedIndexes=tokens.map((token,index)=>token.selected?index:-1).filter(index=>index>=0);
    const selected=selectedIndexes.length;
    const contiguous=selected>1 && selectedIndexes.every((value,index)=>index===0 || value===selectedIndexes[index-1]+1);
    const selectedToken=selected===1?tokens[selectedIndexes[0]]:null;
    const canSplit=Boolean(selectedToken && Array.from(String(selectedToken.word||'').trim()).length>1);
    const selectionText=selected ? `Đã chọn ${selected}` : 'Chưa chọn token';
    return `
      <section class="flashcard-token-editor" aria-label="Chỉnh token sau khi phân từ câu">
        <div class="flashcard-token-editor-head">
          <div>
            <span class="flashcard-token-step">BƯỚC 2 · KIỂM TRA TOKEN</span>
            <b>Chỉnh kết quả phân từ</b>
            <small>Tất cả token sẽ được tra. Checkbox chỉ dùng để <strong>Gộp, Tách token hoặc Bỏ</strong>.</small>
          </div>
          <span>${tokens.length} token</span>
        </div>
        <p class="flashcard-token-selection-hint ${selected?'has-selection':''}">${selectionText}${selected===1?' · Có thể tách hoặc bỏ':selected>1?(contiguous?' · Có thể gộp hoặc bỏ':' · Chỉ gộp được token liền nhau'):''}</p>
        <div class="flashcard-token-list">
          ${tokens.map((token,index)=>`<label class="flashcard-token-chip ${token.selected?'is-selected':''}">
            <input type="checkbox" data-flashcard-token-select="${index}" ${token.selected?'checked':''} aria-label="Chọn token ${escapeHtml(token.word)} để chỉnh">
            <input type="text" data-flashcard-token-word="${index}" value="${escapeHtml(token.word)}" aria-label="Sửa token ${index+1}">
          </label>`).join('')}
        </div>
        <div class="flashcard-token-actions" aria-label="Thao tác với token đã chọn">
          <button type="button" data-flashcard-token-merge ${contiguous?'':'disabled'}>Gộp token</button>
          <button type="button" data-flashcard-token-split ${canSplit?'':'disabled'}>Tách token</button>
          <button type="button" class="danger" data-flashcard-token-delete ${selected?'':'disabled'}>Bỏ token</button>
        </div>
        <div class="flashcard-token-add">
          <input type="text" data-flashcard-token-new value="${escapeHtml(deck.quickNewToken||'')}" placeholder="Nhập token muốn thêm">
          <button type="button" data-flashcard-token-add>+ Thêm</button>
        </div>
        <button type="button" class="flashcard-quick-analyze" data-flashcard-token-analyze ${flashcardLibraryState.quickImportBusy?'disabled':''}>Tra dữ liệu cho ${tokens.length} token</button>
      </section>`;
  }

  function renderQuickImportPreview(deck){
    let rows = Array.isArray(deck.quickImportRows) ? deck.quickImportRows : [];
    if(rows.some(row => typeof row.selected !== 'boolean' || !row.duplicateType)){
      rows = annotateQuickImportRows(deck, rows);
      deck.quickImportRows = rows;
    }
    if(flashcardLibraryState.quickImportBusy){
      return '<div class="flashcard-quick-loading">Đang tra dữ liệu local…</div>';
    }
    if(!rows.length){
      return '<p class="flashcard-library-empty">Chưa có kết quả xem trước.</p>';
    }
    const counts = rows.reduce((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      acc[row.duplicateType || 'new'] = (acc[row.duplicateType || 'new'] || 0) + 1;
      if(row.selected && row.action !== 'skip') acc.selected += 1;
      return acc;
    }, { selected: 0 });
    const selectableRows = rows.filter(row => !['deck-exact','input-exact'].includes(row.duplicateType));
    const allSelected = selectableRows.length && selectableRows.every(row => row.selected && row.action !== 'skip');
    return `
      <div class="flashcard-quick-summary">
        <span class="is-found">Đầy đủ ${counts.found || 0}</span>
        <span class="is-partial">Thiếu ${counts.partial || 0}</span>
        <span class="is-missing">Không thấy ${counts.missing || 0}</span>
        <span class="is-duplicate">Trùng ${(counts['deck-exact'] || 0) + (counts['input-exact'] || 0)}</span>
      </div>
      <div class="flashcard-quick-selectbar">
        <label><input type="checkbox" data-flashcard-quick-select-all ${allSelected ? 'checked' : ''}> Chọn tất cả có thể thêm</label>
        <span>${counts.selected} / ${rows.length} mục được chọn</span>
      </div>
      <div class="flashcard-quick-preview">
        ${rows.map(row => {
          const locked = ['deck-exact','input-exact'].includes(row.duplicateType);
          const statusLabel = row.status === 'found' ? '✓ Tìm thấy' : (row.status === 'partial' ? '△ Thiếu dữ liệu' : '✕ Không tìm thấy');
          return `
          <article data-flashcard-quick-row="${escapeHtml(row.id)}" data-flashcard-quick-status="${escapeHtml(row.status)}" data-flashcard-quick-source="${escapeHtml(row.source || '')}" data-flashcard-quick-duplicate="${escapeHtml(row.duplicateType || 'new')}" data-flashcard-quick-duplicate-card="${escapeHtml(row.duplicateCardId || '')}" data-flashcard-quick-action="${escapeHtml(row.action || 'add')}" class="is-${escapeHtml(row.status)} duplicate-${escapeHtml(row.duplicateType || 'new')}">
            <div class="flashcard-quick-row-head">
              <label><input type="checkbox" data-flashcard-quick-select ${row.selected && !locked ? 'checked' : ''} ${locked ? 'disabled' : ''}> ${statusLabel}</label>
              <span class="flashcard-quick-duplicate-label">${escapeHtml(getQuickDuplicateLabel(row))}</span>
            </div>
            <div class="flashcard-quick-fields">
              <input type="text" data-flashcard-quick-word value="${escapeHtml(row.word)}" aria-label="Hán tự">
              <input type="text" data-flashcard-quick-pinyin value="${escapeHtml(row.pinyin)}" placeholder="Pinyin" aria-label="Pinyin">
              <input type="text" data-flashcard-quick-meaning value="${escapeHtml(row.meaningVi)}" placeholder="Nghĩa Việt" aria-label="Nghĩa Việt">
            </div>
            ${row.duplicateType === 'same-word-pinyin' ? `
              <label class="flashcard-quick-action-label">Xử lý trùng
                <select data-flashcard-quick-action>
                  <option value="keep" ${row.action === 'keep' ? 'selected' : ''}>Giữ thêm một thẻ</option>
                  <option value="merge" ${row.action === 'merge' ? 'selected' : ''}>Gộp nghĩa vào thẻ cũ</option>
                  <option value="replace" ${row.action === 'replace' ? 'selected' : ''}>Thay thế thẻ cũ</option>
                  <option value="skip" ${row.action === 'skip' ? 'selected' : ''}>Bỏ qua</option>
                </select>
              </label>` : ''}
            ${(row.meaningOptions || []).length > 1 ? `<details class="flashcard-meaning-options"><summary>Chọn nhiều nghĩa Dictionary</summary><div class="flashcard-meaning-option-list">${row.meaningOptions.map(option => `<label><input type="checkbox" data-flashcard-meaning-option value="${escapeHtml(option)}" ${(row.selectedMeanings || []).includes(option) ? 'checked' : ''}><span>${escapeHtml(option)}</span></label>`).join('')}</div></details>` : ''}
            ${row.source ? `<small>${escapeHtml(row.source)}</small>` : ''}
          </article>`;
        }).join('')}
      </div>
      <button type="button" class="flashcard-quick-add-all" data-flashcard-quick-add-all ${counts.selected ? '' : 'disabled'}>+ Thêm ${counts.selected} mục đã chọn vào bộ</button>
    `;
  }

  function renderFlashcardDeckDetail(deck){
    const cards = getFilteredDetailCards(deck);
    const duplicateIds = getDuplicateCardIds(deck);
    const selected = flashcardLibraryState.selectedCardIds;
    const editingCard = (deck.cards || []).find(card => card.id === flashcardLibraryState.editingCardId) || null;
    const stats = getDeckLearningStats(deck, readFlashcardResults());
    const otherDecks = flashcardLibraryState.decks.filter(item => item.id !== deck.id);
    return `
      <div class="flashcard-library-page flashcard-deck-detail-page">
        <header class="flashcard-library-header">
          <button type="button" class="flashcard-library-back flashcard-detail-back-compact" data-flashcard-detail-back aria-label="Về thư viện">←</button>
          <div class="flashcard-detail-title"><span>CHI TIẾT BỘ THẺ</span><h2>${escapeHtml(deck.name)}</h2><p>${escapeHtml(deck.description || 'Không có mô tả')}</p></div>
          <button type="button" class="flashcard-library-primary" data-flashcard-detail-study ${stats.total ? '' : 'disabled'}>Học bộ</button>
        </header>
        ${flashcardLibraryState.message ? `<p class="flashcard-library-message">${escapeHtml(flashcardLibraryState.message)}</p>` : ''}
        <section class="flashcard-detail-summary">
          <span>Tổng <b>${stats.total}</b></span><span class="easy">Dễ <b>${stats.easy}</b></span><span class="review">Ôn <b>${stats.review}</b></span><span class="hard">Khó <b>${stats.hard}</b></span><span>Chưa học <b>${stats.unseen}</b></span>
        </section>
        <section class="flashcard-detail-tools">
          <label class="flashcard-detail-search"><span>🔎</span><input type="search" data-flashcard-detail-search value="${escapeHtml(flashcardLibraryState.detailSearch)}" placeholder="Tìm Hán tự, pinyin hoặc nghĩa..."></label>
          <button type="button" data-flashcard-detail-edit-deck aria-label="Sửa thông tin hoặc thêm thẻ">✎ Sửa bộ</button>
          <button type="button" data-flashcard-detail-export aria-label="Xuất riêng bộ này">⇩ Xuất</button>
        </section>
        ${editingCard ? `
          <section class="flashcard-inline-card-editor" data-flashcard-inline-editor>
            <h3>Sửa thẻ</h3>
            <label>Hán tự<input type="text" data-flashcard-inline-word value="${escapeHtml(editingCard.word || '')}"></label>
            <label>Pinyin<input type="text" data-flashcard-inline-pinyin value="${escapeHtml(editingCard.pinyin || '')}"></label>
            <label>Nghĩa Việt<input type="text" data-flashcard-inline-meaning value="${escapeHtml(editingCard.meaningVi || '')}"></label>
            <div><button type="button" data-flashcard-inline-cancel>Hủy</button><button type="button" class="flashcard-library-primary" data-flashcard-inline-save="${escapeHtml(editingCard.id)}">Lưu thẻ</button></div>
          </section>` : ''}
        ${selected.size ? `
          <section class="flashcard-bulk-bar">
            <b>Đã chọn ${selected.size} thẻ</b>
            <button type="button" data-flashcard-selected-study>Học</button>
            <label>Đến bộ<select data-flashcard-bulk-target><option value="">Chọn bộ đích</option>${otherDecks.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}</select></label>
            <button type="button" data-flashcard-selected-move ${otherDecks.length ? '' : 'disabled'}>Chuyển</button>
            <button type="button" data-flashcard-selected-copy ${otherDecks.length ? '' : 'disabled'}>Sao chép</button>
            <button type="button" class="danger" data-flashcard-selected-delete>Xóa</button>
            <button type="button" class="ghost" data-flashcard-selected-clear>Bỏ chọn</button>
          </section>` : ''}
        <section class="flashcard-detail-list-wrap">
          <div class="flashcard-detail-list-head">
            <label><input type="checkbox" data-flashcard-select-all ${cards.length && cards.every(card => selected.has(card.id)) ? 'checked' : ''}> Chọn tất cả đang hiển thị</label>
            <span>${cards.length}${flashcardLibraryState.detailSearch ? ` / ${deck.cards.length}` : ''} thẻ</span>
          </div>
          <div class="flashcard-detail-card-list">
            ${cards.length ? cards.map(card => {
              const entry = readFlashcardResultEntry(deck.id, card.id);
              const rating = entry?.lastRating || 'unseen';
              return `<article class="flashcard-detail-card ${duplicateIds.has(card.id) ? 'is-duplicate' : ''}">
                <label class="flashcard-detail-check"><input type="checkbox" data-flashcard-card-select="${escapeHtml(card.id)}" ${selected.has(card.id) ? 'checked' : ''}></label>
                <div class="flashcard-detail-card-main"><b>${escapeHtml(card.word)}</b><span>${escapeHtml(card.pinyin || '')}</span><p>${escapeHtml(card.meaningVi || '')}</p>${duplicateIds.has(card.id) ? '<small class="duplicate">Trùng hoàn toàn trong bộ</small>' : ''}</div>
                <span class="flashcard-card-rating ${escapeHtml(rating)}">${escapeHtml(getCardRatingLabel(entry))}</span>
                <div class="flashcard-detail-card-actions"><button type="button" data-flashcard-card-speak="${escapeHtml(card.word)}" aria-label="Nghe">🔊</button><button type="button" data-flashcard-inline-edit="${escapeHtml(card.id)}">Sửa</button><button type="button" class="danger" data-flashcard-detail-delete-card="${escapeHtml(card.id)}">Xóa</button></div>
              </article>`;
            }).join('') : '<p class="flashcard-library-empty">Không tìm thấy thẻ phù hợp.</p>'}
          </div>
        </section>
      </div>`;
  }

  function renderFlashcardTrashPage(items){
    const deckItems = items.filter(item => item.type === 'deck');
    const cardItems = items.filter(item => item.type === 'cards');
    const renderItem = item => {
      const isDeck = item.type === 'deck';
      const title = isDeck ? (item.data?.name || 'Bộ thẻ') : `${item.entries?.length || 0} thẻ từ ${item.sourceDeckName || 'bộ cũ'}`;
      const detail = isDeck ? `${item.data?.cards?.length || 0} thẻ` : (item.entries || []).slice(0,3).map(entry => entry.card?.word || '').filter(Boolean).join(' · ');
      return `<article class="flashcard-trash-card">
        <div><span>${isDeck ? 'BỘ THẺ' : 'THẺ'}</span><h4>${escapeHtml(title)}</h4><p>${escapeHtml(detail || 'Không có mô tả')}</p><small>Đã xóa ${escapeHtml(formatLibraryDate(item.deletedAt))} · còn ${getTrashDaysLeft(item)} ngày</small></div>
        <div class="flashcard-trash-actions"><button type="button" data-flashcard-trash-restore="${escapeHtml(item.id)}">Khôi phục</button><button type="button" class="danger" data-flashcard-trash-delete="${escapeHtml(item.id)}">Xóa vĩnh viễn</button></div>
      </article>`;
    };
    return `<div class="flashcard-library-page flashcard-trash-page">
      <header class="flashcard-library-header"><button type="button" class="flashcard-library-back" data-flashcard-trash-back>← Thư viện</button><div><span>THÙNG RÁC</span><h2>Khôi phục dữ liệu đã xóa</h2><p>Các mục tự động bị xóa vĩnh viễn sau 30 ngày.</p></div></header>
      ${flashcardLibraryState.message ? `<p class="flashcard-library-message">${escapeHtml(flashcardLibraryState.message)}</p>` : ''}
      <section class="flashcard-trash-toolbar"><b>${items.length} mục</b><div><button type="button" data-flashcard-trash-restore-all ${items.length ? '' : 'disabled'}>Khôi phục tất cả</button><button type="button" class="danger" data-flashcard-trash-clear ${items.length ? '' : 'disabled'}>Dọn sạch</button></div></section>
      <section class="flashcard-trash-group"><h3>Bộ đã xóa <span>${deckItems.length}</span></h3>${deckItems.length ? deckItems.map(renderItem).join('') : '<p class="flashcard-library-empty">Không có bộ thẻ đã xóa.</p>'}</section>
      <section class="flashcard-trash-group"><h3>Thẻ đã xóa <span>${cardItems.length}</span></h3>${cardItems.length ? cardItems.map(renderItem).join('') : '<p class="flashcard-library-empty">Không có thẻ đã xóa.</p>'}</section>
    </div>`;
  }

  async function renderFlashcardLibrary(){
    ensureFlashcardLibraryUi();
    if(!flashcardLibraryView) return;
    const restoreSearchFocus = document.activeElement?.matches?.('[data-flashcard-library-search]');
    const restoreDetailSearchFocus = document.activeElement?.matches?.('[data-flashcard-detail-search]');
    const restoreSearchStart = (restoreSearchFocus || restoreDetailSearchFocus) ? document.activeElement.selectionStart : null;
    const restoreSearchEnd = (restoreSearchFocus || restoreDetailSearchFocus) ? document.activeElement.selectionEnd : null;
    try{ await cleanupExpiredTrash(); }catch(_err){}
    if(flashcardLibraryState.trashOpen){
      try{ flashcardLibraryState.trashItems = await getAllTrashItems(); }catch(err){ flashcardLibraryState.message = err.message || 'Không đọc được Thùng rác.'; flashcardLibraryState.trashItems = []; }
      flashcardLibraryView.innerHTML = renderFlashcardTrashPage(flashcardLibraryState.trashItems);
      return;
    }
    if(flashcardLibraryState.editingDeck){
      const deck = ensureDeckEditorState(flashcardLibraryState.editingDeck);
      flashcardLibraryView.innerHTML = `
        <div class="flashcard-library-page">
          <header class="flashcard-library-header">
            <button type="button" class="flashcard-library-back" data-flashcard-library-cancel>← Thư viện</button>
            <div><span>BỘ THẺ TỰ TẠO</span><h2>${escapeHtml(deck.isNew ? 'Tạo bộ thẻ mới' : 'Chỉnh sửa bộ thẻ')}</h2></div>
          </header>
          <section class="flashcard-deck-editor">
            <label>Tên bộ<input type="text" data-flashcard-deck-name value="${escapeHtml(deck.name || '')}" placeholder="Ví dụ: Từ vựng du lịch"></label>
            <label>Mô tả<textarea data-flashcard-deck-description rows="2" placeholder="Ghi chú ngắn về bộ thẻ">${escapeHtml(deck.description || '')}</textarea></label>
            <div class="flashcard-entry-tabs" role="tablist" aria-label="Cách thêm thẻ">
              <button type="button" class="${deck.entryMode === 'manual' ? 'active' : ''}" data-flashcard-entry-mode="manual">Nhập thủ công</button>
              <button type="button" class="${deck.entryMode === 'quick' ? 'active' : ''}" data-flashcard-entry-mode="quick">Nhập nhanh từ tiếng Trung</button>
            </div>
            ${deck.entryMode === 'quick' ? `
              <section class="flashcard-quick-import">
                <label>Dán từ, câu hoặc dữ liệu có cấu trúc
                  <textarea rows="7" data-flashcard-quick-text placeholder="你好 | nǐ hǎo | xin chào&#10;谢谢&#10;我今天去学校学习中文">${escapeHtml(deck.quickImportText || '')}</textarea>
                </label>
                <p><b>Danh sách từ:</b> mỗi từ một dòng, dấu phẩy/chấm phẩy/、 hoặc <code>word | pinyin | meaning</code>. <b>Câu liền:</b> dùng “Phân từ câu”.</p>
                <div class="flashcard-quick-actions">
                  <button type="button" class="flashcard-quick-analyze" data-flashcard-quick-analyze ${flashcardLibraryState.quickImportBusy ? 'disabled' : ''}>${flashcardLibraryState.quickImportBusy ? 'Đang tra…' : 'Nhận diện danh sách từ'}</button>
                  <button type="button" data-flashcard-quick-segment ${flashcardLibraryState.quickImportBusy ? 'disabled' : ''}>Phân từ câu</button>
                  <button type="button" data-flashcard-csv-trigger>Nhập CSV</button>
                  <input type="file" accept=".csv,text/csv" data-flashcard-csv-file hidden>
                </div>
                ${renderQuickTokenEditor(deck)}
                ${renderQuickImportPreview(deck)}
              </section>` : `
              <div class="flashcard-card-entry">
                <input type="text" data-flashcard-card-word placeholder="Hán tự, ví dụ 咖啡">
                <input type="text" data-flashcard-card-pinyin placeholder="Pinyin, ví dụ kāfēi">
                <input type="text" data-flashcard-card-meaning placeholder="Nghĩa Việt, ví dụ cà phê">
                <button type="button" data-flashcard-card-add>+ Thêm thẻ</button>
              </div>`}
            ${flashcardLibraryState.message ? `<p class="flashcard-library-message">${escapeHtml(flashcardLibraryState.message)}</p>` : ''}
            <div class="flashcard-editor-card-list">
              ${(deck.cards || []).length ? deck.cards.map((card,index) => `
                <article>
                  <div><b>${escapeHtml(card.word)}</b><span>${escapeHtml(card.pinyin || '')}</span><p>${escapeHtml(card.meaningVi || '')}</p></div>
                  <button type="button" data-flashcard-card-remove="${index}" aria-label="Xóa thẻ">×</button>
                </article>`).join('') : '<p class="flashcard-library-empty">Chưa có thẻ. Hãy nhập ít nhất một từ.</p>'}
            </div>
            <div class="flashcard-editor-actions">
              <button type="button" class="hsk-flashcard-secondary" data-flashcard-library-cancel>Hủy</button>
              <button type="button" class="hsk-flashcard-start" data-flashcard-deck-save>Lưu bộ thẻ · ${(deck.cards || []).length}</button>
            </div>
          </section>
        </div>`;
      return;
    }
    try{
      flashcardLibraryState.decks = await getAllCustomDecks();
    }catch(err){
      flashcardLibraryState.message = err.message || 'Không đọc được bộ thẻ tự tạo.';
      flashcardLibraryState.decks = [];
    }
    if(flashcardLibraryState.detailDeckId){
      const detailDeck = getDetailDeck();
      if(detailDeck){
        flashcardLibraryView.innerHTML = renderFlashcardDeckDetail(detailDeck);
        if(restoreDetailSearchFocus){
          const input = flashcardLibraryView.querySelector('[data-flashcard-detail-search]');
          if(input){
            input.focus({ preventScroll: true });
            const end = input.value.length;
            input.setSelectionRange(restoreSearchStart ?? end, restoreSearchEnd ?? end);
          }
        }
        return;
      }
      flashcardLibraryState.detailDeckId = '';
      flashcardLibraryState.selectedCardIds.clear();
      flashcardLibraryState.editingCardId = '';
    }
    const stats = getFlashcardStats();
    const libraryRows = prepareFlashcardLibraryDecks(flashcardLibraryState.decks);
    flashcardLibraryView.innerHTML = `
      <div class="flashcard-library-page">
        <header class="flashcard-library-header">
          <div><span>FLASHCARD</span><h2>Thư viện bộ thẻ</h2><p>Học lại thẻ HSK và quản lý bộ thẻ tự tạo.</p></div>
          <button type="button" class="flashcard-library-primary" data-flashcard-deck-new>+ Tạo bộ</button>
        </header>
        ${flashcardLibraryState.message ? `<p class="flashcard-library-message">${escapeHtml(flashcardLibraryState.message)}</p>` : ''}
        <section class="flashcard-library-tools">
          <button type="button" data-flashcard-export>Xuất JSON</button>
          <button type="button" data-flashcard-import-trigger>Nhập JSON</button>
          <button type="button" data-flashcard-trash-open>🗑 Thùng rác</button>
          <input type="file" accept="application/json,.json" data-flashcard-import-file hidden>
          <button type="button" class="danger" data-flashcard-reset-history>Xóa lịch sử</button>
          <button type="button" class="danger ghost" data-flashcard-reset-session>Đặt lại phiên dở</button>
        </section>
        <section class="flashcard-library-review">
          <div class="flashcard-library-section-head"><div><h3>Ôn từ kết quả đã lưu</h3><p>${stats.total} thẻ đã học · ${stats.review} Ôn · ${stats.hard} Khó</p></div><button type="button" data-hsk-flashcard-stats>Xem thống kê</button></div>
          <div class="flashcard-library-review-actions">
            <button type="button" data-hsk-flashcard-study-group="review" ${stats.review ? '' : 'disabled'}>Ôn ${stats.review}</button>
            <button type="button" data-hsk-flashcard-study-group="hard" ${stats.hard ? '' : 'disabled'}>Khó ${stats.hard}</button>
            <button type="button" data-hsk-flashcard-study-group="review-hard" ${(stats.review + stats.hard) ? '' : 'disabled'}>Ôn + Khó ${stats.review + stats.hard}</button>
          </div>
        </section>
        <section class="flashcard-library-decks">
          <div class="flashcard-library-section-head"><div><h3>Bộ thẻ tự tạo</h3><p>Lưu trên trình duyệt bằng IndexedDB.</p></div><span>${libraryRows.length}${flashcardLibraryState.searchQuery ? ` / ${flashcardLibraryState.decks.length}` : ''} bộ</span></div>
          <div class="flashcard-library-browser">
            <label class="flashcard-library-search"><span>⌕</span><input type="search" data-flashcard-library-search value="${escapeHtml(flashcardLibraryState.searchQuery)}" placeholder="Tìm tên bộ, Hán tự, pinyin hoặc nghĩa..."></label>
            <label class="flashcard-library-sort"><span>Sắp xếp</span><select data-flashcard-library-sort>
              <option value="updated-desc" ${flashcardLibraryState.sortMode === 'updated-desc' ? 'selected' : ''}>Mới sửa gần nhất</option>
              <option value="studied-desc" ${flashcardLibraryState.sortMode === 'studied-desc' ? 'selected' : ''}>Học gần nhất</option>
              <option value="name-asc" ${flashcardLibraryState.sortMode === 'name-asc' ? 'selected' : ''}>Tên A–Z</option>
              <option value="cards-desc" ${flashcardLibraryState.sortMode === 'cards-desc' ? 'selected' : ''}>Nhiều thẻ nhất</option>
              <option value="hard-desc" ${flashcardLibraryState.sortMode === 'hard-desc' ? 'selected' : ''}>Nhiều thẻ Khó nhất</option>
              <option value="review-desc" ${flashcardLibraryState.sortMode === 'review-desc' ? 'selected' : ''}>Nhiều thẻ Ôn nhất</option>
            </select></label>
          </div>
          <div class="flashcard-deck-grid">
            ${libraryRows.length ? libraryRows.map(({ deck, stats: deckStats }) => `
              <article class="flashcard-deck-card">
                <div class="flashcard-deck-card-main">
                  <div class="flashcard-deck-card-title"><h4>${escapeHtml(deck.name)}</h4><b>${deckStats.total} thẻ</b></div>
                  <p>${escapeHtml(deck.description || 'Không có mô tả')}</p>
                  <div class="flashcard-deck-stats" aria-label="Thống kê bộ thẻ">
                    <span class="easy">Dễ <b>${deckStats.easy}</b></span>
                    <span class="review">Ôn <b>${deckStats.review}</b></span>
                    <span class="hard">Khó <b>${deckStats.hard}</b></span>
                    <span class="unseen">Chưa học <b>${deckStats.unseen}</b></span>
                  </div>
                  <div class="flashcard-deck-dates"><small>Học gần nhất: ${escapeHtml(formatLibraryDate(deckStats.lastStudiedAt))}</small><small>Sửa: ${escapeHtml(formatLibraryDate(deck.updatedAt))}</small></div>
                </div>
                <div class="flashcard-deck-card-actions">
                  <button type="button" data-flashcard-deck-open="${escapeHtml(deck.id)}">Mở bộ</button>
                  <button type="button" data-flashcard-deck-study="${escapeHtml(deck.id)}" ${deckStats.total ? '' : 'disabled'}>Học</button>
                  <button type="button" data-flashcard-deck-edit="${escapeHtml(deck.id)}">Sửa</button>
                  <button type="button" class="danger" data-flashcard-deck-delete="${escapeHtml(deck.id)}">Xóa</button>
                </div>
              </article>`).join('') : `<p class="flashcard-library-empty">${flashcardLibraryState.decks.length ? 'Không tìm thấy bộ thẻ phù hợp.' : 'Chưa có bộ thẻ tự tạo.'}</p>`}
          </div>
        </section>
      </div>`;
    if(restoreSearchFocus){
      const searchInput = flashcardLibraryView.querySelector('[data-flashcard-library-search]');
      if(searchInput){
        searchInput.focus({ preventScroll: true });
        const end = searchInput.value.length;
        searchInput.setSelectionRange(restoreSearchStart ?? end, restoreSearchEnd ?? end);
      }
    }
  }

  async function exportFlashcardBackup(){
    const decks = await getAllCustomDecks();
    const payload = { version: 1, type: 'hanzi-flashcard-backup', exportedAt: new Date().toISOString(), decks, results: readFlashcardResults() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hanzi-flashcard-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  async function importFlashcardBackup(file){
    const parsed = JSON.parse(await file.text());
    const decks = Array.isArray(parsed)
      ? parsed
      : (Array.isArray(parsed.decks) ? parsed.decks : (parsed.deck && typeof parsed.deck === 'object' ? [parsed.deck] : []));
    if(!decks.length && !parsed.results) throw new Error('File JSON không có dữ liệu Flashcard hợp lệ.');
    if(decks.length) await importCustomDecks(decks);
    if(parsed.results && typeof parsed.results === 'object'){
      const merged = { ...readFlashcardResults(), ...parsed.results };
      window.localStorage?.setItem(HSK_FLASHCARD_RESULTS_KEY, JSON.stringify(merged));
    }
    await renderFlashcardLibrary();
  }

  function resetFlashcardHistory(){
    if(!window.confirm('Xóa toàn bộ lịch sử Dễ / Ôn / Khó? Bộ thẻ tự tạo sẽ được giữ lại.')) return;
    window.localStorage?.removeItem(HSK_FLASHCARD_RESULTS_KEY);
    renderFlashcardLibrary();
  }

  function resetActiveFlashcardSession(){
    if(!window.confirm('Xóa phiên Flashcard đang học dở?')) return;
    clearPersistedFlashcardSession();
    hskState.flashcardSession = null;
    hskState.flashcardStatsOpen = false;
    renderFlashcardLibrary();
  }

  async function saveInlineDeckCard(deck, cardId){
    const word = flashcardLibraryView.querySelector('[data-flashcard-inline-word]')?.value.trim() || '';
    const pinyin = flashcardLibraryView.querySelector('[data-flashcard-inline-pinyin]')?.value.trim() || '';
    const meaningVi = flashcardLibraryView.querySelector('[data-flashcard-inline-meaning]')?.value.trim() || '';
    if(!word){ window.alert('Hán tự không được để trống.'); return false; }
    const candidate = { id: cardId, word, pinyin, meaningVi };
    const duplicate = findDeckDuplicateInfo(deck, candidate, cardId);
    if(duplicate.exact){ window.alert('Thẻ trùng hoàn toàn với một thẻ khác trong bộ.'); return false; }
    if(duplicate.sameWordPinyin && !window.confirm('Đã có thẻ cùng Hán tự và pinyin nhưng nghĩa khác. Vẫn lưu thẻ này?')) return false;
    const index = deck.cards.findIndex(card => card.id === cardId);
    if(index < 0) return false;
    deck.cards[index] = { ...deck.cards[index], word, pinyin, meaningVi };
    await saveCustomDeck(deck);
    flashcardLibraryState.editingCardId = '';
    flashcardLibraryState.message = 'Đã lưu thay đổi của thẻ.';
    await renderFlashcardLibrary();
    return true;
  }

  async function runBulkDeckAction(action){
    const sourceDeck = getDetailDeck();
    if(!sourceDeck) return;
    const selectedIds = [...flashcardLibraryState.selectedCardIds];
    const selectedCards = sourceDeck.cards.filter(card => selectedIds.includes(card.id));
    if(!selectedCards.length) return;
    if(action === 'delete'){
      if(!await confirmFlashcardAction({ title: 'Chuyển vào Thùng rác?', message: `Bạn đang xóa ${selectedCards.length} thẻ đã chọn. Có thể khôi phục trong 30 ngày.`, confirmText: 'Chuyển vào Thùng rác', danger: true })) return;
      const trashItem = await moveCardsToTrash(sourceDeck, selectedIds);
      flashcardLibraryState.selectedCardIds.clear();
      flashcardLibraryState.message = `Đã chuyển ${selectedCards.length} thẻ vào Thùng rác.`;
      await renderFlashcardLibrary();
      if(trashItem) showFlashcardUndoToast(`Đã chuyển ${selectedCards.length} thẻ vào Thùng rác.`, trashItem.id);
      return;
    }
    const targetId = flashcardLibraryView.querySelector('[data-flashcard-bulk-target]')?.value || '';
    const targetDeck = flashcardLibraryState.decks.find(deck => deck.id === targetId);
    if(!targetDeck){ window.alert('Hãy chọn bộ đích.'); return; }
    const targetKeys = new Set((targetDeck.cards || []).map(getCardExactKey));
    const accepted = [];
    let skipped = 0;
    for(const card of selectedCards){
      const key = getCardExactKey(card);
      if(targetKeys.has(key)){ skipped += 1; continue; }
      targetKeys.add(key);
      accepted.push(card);
    }
    if(!accepted.length){ window.alert('Tất cả thẻ đã chọn đều trùng hoàn toàn trong bộ đích.'); return; }
    if(action === 'copy'){
      targetDeck.cards.push(...accepted.map(card => ({ ...card, id: makeLocalId('card') })));
      await saveCustomDeck(targetDeck);
      flashcardLibraryState.message = `Đã sao chép ${accepted.length} thẻ${skipped ? `, bỏ qua ${skipped} thẻ trùng` : ''}.`;
    }else if(action === 'move'){
      targetDeck.cards.push(...accepted.map(card => ({ ...card })));
      sourceDeck.cards = sourceDeck.cards.filter(card => !accepted.some(item => item.id === card.id));
      await saveCustomDeck(targetDeck);
      await saveCustomDeck(sourceDeck);
      accepted.forEach(card => moveCardLearningResult(sourceDeck.id, targetDeck.id, card.id));
      flashcardLibraryState.message = `Đã chuyển ${accepted.length} thẻ${skipped ? `, giữ lại ${skipped} thẻ trùng ở bộ nguồn` : ''}.`;
    }
    flashcardLibraryState.selectedCardIds.clear();
    await renderFlashcardLibrary();
  }

  function exportSingleDeck(deck){
    const allResults = readFlashcardResults();
    const results = {};
    for(const card of deck.cards || []){
      const key = `custom:${deck.id}:${card.id}`;
      if(allResults[key]) results[key] = allResults[key];
    }
    downloadJsonFile({ version: 1, type: 'hanzi-flashcard-deck', exportedAt: new Date().toISOString(), deck, results }, `hanzi-deck-${String(deck.name || 'bo-the').replace(/[^a-z0-9\u00C0-\u024F\u4E00-\u9FFF]+/gi, '-').replace(/^-|-$/g, '') || 'bo-the'}.json`);
  }

  async function handleFlashcardLibraryClick(event){
    const target = event.target;
    if(target.closest('[data-flashcard-undo-close]')){ hideFlashcardUndoToast(); return; }
    if(target.closest('[data-flashcard-undo-delete]')){
      const trashId = flashcardLibraryState.undoTrashId;
      if(!trashId) return;
      target.closest('[data-flashcard-undo-delete]').disabled = true;
      try{
        const restored = await restoreTrashItem(trashId);
        hideFlashcardUndoToast();
        flashcardLibraryState.message = restored ? 'Đã hoàn tác thao tác xóa.' : 'Mục này không còn trong Thùng rác.';
        await renderFlashcardLibrary();
      }catch(err){
        target.closest('[data-flashcard-undo-delete]').disabled = false;
        window.alert(err.message || 'Không thể hoàn tác.');
      }
      return;
    }
    if(target.closest('[data-flashcard-trash-open]')){ flashcardLibraryState.trashOpen = true; flashcardLibraryState.message = ''; await renderFlashcardLibrary(); return; }
    if(target.closest('[data-flashcard-trash-back]')){ flashcardLibraryState.trashOpen = false; flashcardLibraryState.message = ''; await renderFlashcardLibrary(); return; }
    const trashRestore = target.closest('[data-flashcard-trash-restore]');
    if(trashRestore){
      const restored = await restoreTrashItem(trashRestore.dataset.flashcardTrashRestore || '');
      flashcardLibraryState.message = restored ? 'Đã khôi phục mục đã chọn.' : 'Mục này không còn trong Thùng rác.';
      await renderFlashcardLibrary(); return;
    }
    const trashDelete = target.closest('[data-flashcard-trash-delete]');
    if(trashDelete){
      if(await confirmFlashcardAction({ title: 'Xóa vĩnh viễn?', message: 'Dữ liệu này sẽ không thể khôi phục. Lịch sử học vẫn được giữ lại.', confirmText: 'Xóa vĩnh viễn', danger: true })){
        await deleteTrashItemPermanently(trashDelete.dataset.flashcardTrashDelete || '');
        flashcardLibraryState.message = 'Đã xóa vĩnh viễn mục đã chọn.';
        await renderFlashcardLibrary();
      }
      return;
    }
    if(target.closest('[data-flashcard-trash-restore-all]')){
      const items = await getAllTrashItems();
      for(const item of items) await restoreTrashItem(item.id);
      flashcardLibraryState.message = `Đã khôi phục ${items.length} mục.`;
      await renderFlashcardLibrary(); return;
    }
    if(target.closest('[data-flashcard-trash-clear]')){
      const items = await getAllTrashItems();
      if(items.length && await confirmFlashcardAction({ title: 'Dọn sạch Thùng rác?', message: `${items.length} mục sẽ bị xóa vĩnh viễn và không thể khôi phục.`, confirmText: 'Dọn sạch', danger: true })){
        await clearTrashPermanently();
        flashcardLibraryState.message = 'Đã dọn sạch Thùng rác.';
        await renderFlashcardLibrary();
      }
      return;
    }
    const speakCard = target.closest('[data-flashcard-card-speak]');
    if(speakCard){ event.preventDefault(); event.stopPropagation(); speakChar(speakCard.dataset.flashcardCardSpeak || ''); return; }
    if(target.closest('[data-flashcard-detail-back]')){
      flashcardLibraryState.detailDeckId = '';
      flashcardLibraryState.detailSearch = '';
      flashcardLibraryState.editingCardId = '';
      flashcardLibraryState.selectedCardIds.clear();
      flashcardLibraryState.message = '';
      await renderFlashcardLibrary(); return;
    }
    const openDeck = target.closest('[data-flashcard-deck-open]');
    if(openDeck){
      flashcardLibraryState.detailDeckId = openDeck.dataset.flashcardDeckOpen || '';
      flashcardLibraryState.detailSearch = '';
      flashcardLibraryState.editingCardId = '';
      flashcardLibraryState.selectedCardIds.clear();
      flashcardLibraryState.message = '';
      await renderFlashcardLibrary(); return;
    }
    if(target.closest('[data-flashcard-detail-study]')){
      const deck = getDetailDeck();
      if(deck) createFlashcardSessionFromCards((deck.cards || []).map(card => ({ id: `custom:${deck.id}:${card.id}`, word: card.word, pinyin: card.pinyin, meaningVi: card.meaningVi })), deck.name);
      return;
    }
    if(target.closest('[data-flashcard-detail-edit-deck]')){
      const deck = getDetailDeck();
      if(deck){ flashcardLibraryState.editingDeck = ensureDeckEditorState(JSON.parse(JSON.stringify({ ...deck, isNew: false }))); renderFlashcardLibrary(); }
      return;
    }
    if(target.closest('[data-flashcard-detail-export]')){ const deck = getDetailDeck(); if(deck) exportSingleDeck(deck); return; }
    const inlineEdit = target.closest('[data-flashcard-inline-edit]');
    if(inlineEdit){ flashcardLibraryState.editingCardId = inlineEdit.dataset.flashcardInlineEdit || ''; flashcardLibraryState.message = ''; renderFlashcardLibrary(); return; }
    if(target.closest('[data-flashcard-inline-cancel]')){ flashcardLibraryState.editingCardId = ''; renderFlashcardLibrary(); return; }
    const inlineSave = target.closest('[data-flashcard-inline-save]');
    if(inlineSave){ const deck = getDetailDeck(); if(deck) await saveInlineDeckCard(deck, inlineSave.dataset.flashcardInlineSave || ''); return; }
    const deleteCard = target.closest('[data-flashcard-detail-delete-card]');
    if(deleteCard){
      const deck = getDetailDeck(); const cardId = deleteCard.dataset.flashcardDetailDeleteCard || '';
      const card = deck?.cards?.find(item => item.id === cardId);
      if(deck && card && await confirmFlashcardAction({ title: 'Chuyển thẻ vào Thùng rác?', message: `Thẻ “${card.word}” có thể khôi phục trong 30 ngày.`, confirmText: 'Chuyển vào Thùng rác', danger: true })){
        const trashItem = await moveCardsToTrash(deck, [cardId]);
        flashcardLibraryState.selectedCardIds.delete(cardId);
        flashcardLibraryState.message = 'Đã chuyển thẻ vào Thùng rác.';
        await renderFlashcardLibrary();
        if(trashItem) showFlashcardUndoToast(`Đã chuyển “${card.word}” vào Thùng rác.`, trashItem.id);
      }
      return;
    }
    if(target.closest('[data-flashcard-selected-clear]')){ flashcardLibraryState.selectedCardIds.clear(); renderFlashcardLibrary(); return; }
    if(target.closest('[data-flashcard-selected-study]')){
      const deck = getDetailDeck(); const ids = flashcardLibraryState.selectedCardIds;
      if(deck){ const cards = deck.cards.filter(card => ids.has(card.id)).map(card => ({ id: `custom:${deck.id}:${card.id}`, word: card.word, pinyin: card.pinyin, meaningVi: card.meaningVi })); if(cards.length) createFlashcardSessionFromCards(cards, `${deck.name} · Đã chọn`); }
      return;
    }
    if(target.closest('[data-flashcard-selected-move]')){ await runBulkDeckAction('move'); return; }
    if(target.closest('[data-flashcard-selected-copy]')){ await runBulkDeckAction('copy'); return; }
    if(target.closest('[data-flashcard-selected-delete]')){ await runBulkDeckAction('delete'); return; }
    if(target.closest('[data-hsk-flashcard-stats]')){ openFlashcardStats(); return; }
    const reviewGroup = target.closest('[data-hsk-flashcard-study-group]');
    if(reviewGroup && !reviewGroup.disabled){ startFlashcardStatsGroup(reviewGroup.dataset.hskFlashcardStudyGroup || 'review-hard'); return; }
    if(target.closest('[data-flashcard-deck-new]')){
      flashcardLibraryState.editingDeck = { id: makeLocalId('deck'), name: '', description: '', cards: [], isNew: true, entryMode: 'manual', quickImportText: '', quickImportRows: [], quickSegmentTokens: [], quickNewToken: '' };
      renderFlashcardLibrary(); return;
    }
    if(target.closest('[data-flashcard-library-cancel]')){ flashcardLibraryState.editingDeck = null; flashcardLibraryState.message = ''; renderFlashcardLibrary(); return; }
    const entryMode = target.closest('[data-flashcard-entry-mode]');
    if(entryMode && flashcardLibraryState.editingDeck){
      const deck = syncDeckEditorFields();
      deck.entryMode = entryMode.dataset.flashcardEntryMode === 'quick' ? 'quick' : 'manual';
      flashcardLibraryState.message = '';
      renderFlashcardLibrary(); return;
    }
    if(target.closest('[data-flashcard-quick-analyze]')){ await analyzeQuickImportWords(); return; }
    if(target.closest('[data-flashcard-quick-segment]')){ await analyzeQuickImportSentence(); return; }
    if(target.closest('[data-flashcard-token-merge]')){ mergeSelectedQuickTokens(); return; }
    if(target.closest('[data-flashcard-token-split]')){ openQuickTokenSplitDialog(); return; }
    if(target.closest('[data-flashcard-token-delete]')){ deleteSelectedQuickTokens(); return; }
    if(target.closest('[data-flashcard-token-add]')){ addQuickToken(); return; }
    if(target.closest('[data-flashcard-token-analyze]')){ await analyzeQuickImportTokens(); return; }
    if(target.closest('[data-flashcard-csv-trigger]')){ flashcardLibraryView.querySelector('[data-flashcard-csv-file]')?.click(); return; }
    if(target.closest('[data-flashcard-quick-add-all]')){ addQuickPreviewToDeck(); return; }
    const edit = target.closest('[data-flashcard-deck-edit]');
    if(edit){
      const deck = flashcardLibraryState.decks.find(item => item.id === edit.dataset.flashcardDeckEdit);
      if(deck){ flashcardLibraryState.editingDeck = ensureDeckEditorState(JSON.parse(JSON.stringify({ ...deck, isNew: false }))); renderFlashcardLibrary(); }
      return;
    }
    const del = target.closest('[data-flashcard-deck-delete]');
    if(del){
      const deckId = del.dataset.flashcardDeckDelete || '';
      const deck = flashcardLibraryState.decks.find(item => item.id === deckId);
      if(deck && await confirmFlashcardAction({ title: 'Chuyển bộ vào Thùng rác?', message: `Bộ “${deck.name}” và ${deck.cards?.length || 0} thẻ có thể khôi phục trong 30 ngày.`, confirmText: 'Chuyển vào Thùng rác', danger: true })){
        const trashItem = await moveDeckToTrash(deckId);
        await renderFlashcardLibrary();
        if(trashItem) showFlashcardUndoToast(`Đã chuyển bộ “${deck.name}” vào Thùng rác.`, trashItem.id);
      }
      return;
    }
    const study = target.closest('[data-flashcard-deck-study]');
    if(study){
      const deck = flashcardLibraryState.decks.find(item => item.id === study.dataset.flashcardDeckStudy);
      if(deck){ createFlashcardSessionFromCards((deck.cards || []).map(card => ({ id: `custom:${deck.id}:${card.id}`, word: card.word, pinyin: card.pinyin, meaningVi: card.meaningVi })), deck.name); }
      return;
    }
    if(target.closest('[data-flashcard-card-add]')){
      syncDeckEditorFields();
      const word = flashcardLibraryView.querySelector('[data-flashcard-card-word]')?.value.trim() || '';
      const pinyin = flashcardLibraryView.querySelector('[data-flashcard-card-pinyin]')?.value.trim() || '';
      const meaningVi = flashcardLibraryView.querySelector('[data-flashcard-card-meaning]')?.value.trim() || '';
      if(!word){ window.alert('Vui lòng nhập Hán tự.'); return; }
      const candidate = { id: makeLocalId('card'), word, pinyin, meaningVi };
      const duplicate = findDeckDuplicateInfo(flashcardLibraryState.editingDeck, candidate);
      if(duplicate.exact){ window.alert('Thẻ trùng hoàn toàn đã có trong bộ.'); return; }
      if(duplicate.sameWordPinyin && !window.confirm('Đã có thẻ cùng Hán tự và pinyin nhưng nghĩa khác. Vẫn thêm?')) return;
      flashcardLibraryState.editingDeck.cards.push(candidate);
      renderFlashcardLibrary(); return;
    }
    const remove = target.closest('[data-flashcard-card-remove]');
    if(remove){ syncDeckEditorFields(); flashcardLibraryState.editingDeck.cards.splice(Number(remove.dataset.flashcardCardRemove), 1); renderFlashcardLibrary(); return; }
    if(target.closest('[data-flashcard-deck-save]')){
      const deckState = syncDeckEditorFields();
      if(deckState?.entryMode === 'quick' && flashcardLibraryView.querySelector('[data-flashcard-quick-row]')) deckState.quickImportRows = readQuickPreviewRows();
      const name = flashcardLibraryView.querySelector('[data-flashcard-deck-name]')?.value.trim() || deckState?.name.trim() || '';
      const description = flashcardLibraryView.querySelector('[data-flashcard-deck-description]')?.value.trim() || deckState?.description.trim() || '';
      if(!name){ window.alert('Vui lòng nhập tên bộ thẻ.'); return; }
      flashcardLibraryState.editingDeck.name = name; flashcardLibraryState.editingDeck.description = description;
      await saveCustomDeck(flashcardLibraryState.editingDeck); flashcardLibraryState.editingDeck = null; await renderFlashcardLibrary(); return;
    }
    if(target.closest('[data-flashcard-export]')){ try{ await exportFlashcardBackup(); }catch(err){ window.alert(err.message || 'Không xuất được JSON.'); } return; }
    if(target.closest('[data-flashcard-import-trigger]')){ flashcardLibraryView.querySelector('[data-flashcard-import-file]')?.click(); return; }
    if(target.closest('[data-flashcard-reset-history]')){ resetFlashcardHistory(); return; }
    if(target.closest('[data-flashcard-reset-session]')){ resetActiveFlashcardSession(); return; }
  }

  async function handleFlashcardLibraryChange(event){
    const tokenSelect=event.target.closest('[data-flashcard-token-select]');
    if(tokenSelect && flashcardLibraryState.editingDeck){
      const deck=ensureDeckEditorState(flashcardLibraryState.editingDeck);
      const index=Number(tokenSelect.dataset.flashcardTokenSelect);
      if(deck.quickSegmentTokens[index]) deck.quickSegmentTokens[index].selected=Boolean(tokenSelect.checked);
      renderFlashcardLibrary();
      return;
    }
    const quickSelectAll = event.target.closest('[data-flashcard-quick-select-all]');
    if(quickSelectAll && flashcardLibraryState.editingDeck){
      const rows = readQuickPreviewRows().map(row => {
        const locked = ['deck-exact','input-exact'].includes(row.duplicateType);
        return { ...row, selected: locked ? false : quickSelectAll.checked, action: locked ? 'skip' : (row.action === 'skip' ? 'add' : row.action) };
      });
      flashcardLibraryState.editingDeck.quickImportRows = rows;
      renderFlashcardLibrary();
      return;
    }
    const quickSelect = event.target.closest('[data-flashcard-quick-select]');
    const quickAction = event.target.closest('[data-flashcard-quick-action]');
    const meaningOption = event.target.closest('[data-flashcard-meaning-option]');
    if((quickSelect || quickAction || meaningOption) && flashcardLibraryState.editingDeck){
      flashcardLibraryState.editingDeck.quickImportRows = readQuickPreviewRows();
      renderFlashcardLibrary();
      return;
    }
    const selectedCard = event.target.closest('[data-flashcard-card-select]');
    if(selectedCard){
      const id = selectedCard.dataset.flashcardCardSelect || '';
      if(selectedCard.checked) flashcardLibraryState.selectedCardIds.add(id);
      else flashcardLibraryState.selectedCardIds.delete(id);
      renderFlashcardLibrary();
      return;
    }
    const selectAll = event.target.closest('[data-flashcard-select-all]');
    if(selectAll){
      const deck = getDetailDeck();
      const cards = getFilteredDetailCards(deck);
      cards.forEach(card => selectAll.checked ? flashcardLibraryState.selectedCardIds.add(card.id) : flashcardLibraryState.selectedCardIds.delete(card.id));
      renderFlashcardLibrary();
      return;
    }
    const sort = event.target.closest('[data-flashcard-library-sort]');
    if(sort){
      flashcardLibraryState.sortMode = sort.value || 'updated-desc';
      saveFlashcardLibrarySort(flashcardLibraryState.sortMode);
      renderFlashcardLibrary();
      return;
    }
    const csvInput = event.target.closest('[data-flashcard-csv-file]');
    if(csvInput?.files?.[0]){try{await importQuickCsvFile(csvInput.files[0]);}catch(err){window.alert(err.message||'Không đọc được CSV.');}csvInput.value='';return;}
    const input = event.target.closest('[data-flashcard-import-file]');
    if(!input?.files?.[0]) return;
    try{ await importFlashcardBackup(input.files[0]); window.alert('Đã nhập dữ liệu Flashcard.'); }
    catch(err){ window.alert(err.message || 'Không nhập được file JSON.'); }
    input.value = '';
  }

  let flashcardLibrarySearchTimer = 0;
  function handleFlashcardLibraryInput(event){
    const tokenWord=event.target.closest('[data-flashcard-token-word]');
    if(tokenWord && flashcardLibraryState.editingDeck){
      const deck=ensureDeckEditorState(flashcardLibraryState.editingDeck);
      const index=Number(tokenWord.dataset.flashcardTokenWord);
      if(deck.quickSegmentTokens[index]) deck.quickSegmentTokens[index].word=getHanziChars(tokenWord.value).join('');
      return;
    }
    const tokenNew=event.target.closest('[data-flashcard-token-new]');
    if(tokenNew && flashcardLibraryState.editingDeck){ flashcardLibraryState.editingDeck.quickNewToken=tokenNew.value; return; }
    const detailInput = event.target.closest('[data-flashcard-detail-search]');
    if(detailInput){
      flashcardLibraryState.detailSearch = detailInput.value;
      window.clearTimeout(flashcardLibrarySearchTimer);
      flashcardLibrarySearchTimer = window.setTimeout(() => renderFlashcardLibrary(), 180);
      return;
    }
    const input = event.target.closest('[data-flashcard-library-search]');
    if(!input) return;
    flashcardLibraryState.searchQuery = input.value;
    window.clearTimeout(flashcardLibrarySearchTimer);
    flashcardLibrarySearchTimer = window.setTimeout(() => renderFlashcardLibrary(), 180);
  }

  function readStoredVocabViewMode(){
    try{
      const stored = window.localStorage?.getItem(HSK_VOCAB_VIEW_STORAGE_KEY);
      return stored === 'grid' ? 'grid' : 'list';
    }catch(_err){
      return 'list';
    }
  }

  function saveStoredVocabViewMode(mode){
    const nextMode = mode === 'grid' ? 'grid' : 'list';
    hskState.vocabViewMode = nextMode;
    try{
      window.localStorage?.setItem(HSK_VOCAB_VIEW_STORAGE_KEY, nextMode);
    }catch(_err){
      // localStorage có thể bị chặn; state trong phiên vẫn hoạt động bình thường.
    }
  }

  hskState.vocabViewMode = readStoredVocabViewMode();

  function ensureHskVocabViewControls(){
    let controls = document.getElementById('hskVocabViewControls');
    if(controls || !hskStatus?.parentElement){
      return controls;
    }
    controls = document.createElement('div');
    controls.id = 'hskVocabViewControls';
    controls.className = 'hsk-vocab-view-controls';
    controls.hidden = true;
    hskStatus.parentElement.insertBefore(controls, hskStatus);
    controls.addEventListener('click', event => {
      const button = event.target.closest('[data-hsk-vocab-view]');
      if(!button) return;
      const nextMode = button.dataset.hskVocabView === 'grid' ? 'grid' : 'list';
      if(nextMode === hskState.vocabViewMode) return;
      saveStoredVocabViewMode(nextMode);
      renderHskList();
    });
    return controls;
  }

  function renderHskVocabViewControls(show = false){
    const controls = ensureHskVocabViewControls();
    if(!controls) return;
    controls.hidden = !show;
    if(!show){
      controls.innerHTML = '';
      return;
    }
    controls.innerHTML = `
      <span>Kiểu hiển thị</span>
      <div class="hsk-vocab-view-switch" role="group" aria-label="Chọn kiểu hiển thị từ vựng">
        <button type="button" class="${hskState.vocabViewMode === 'list' ? 'active' : ''}" data-hsk-vocab-view="list" aria-pressed="${hskState.vocabViewMode === 'list'}" title="Danh sách">
          <span aria-hidden="true">☰</span><b>Danh sách</b>
        </button>
        <button type="button" class="${hskState.vocabViewMode === 'grid' ? 'active' : ''}" data-hsk-vocab-view="grid" aria-pressed="${hskState.vocabViewMode === 'grid'}" title="Lưới">
          <span aria-hidden="true">▦</span><b>Lưới</b>
        </button>
      </div>
    `;
  }

  function getHskModeStorageId(sourceKey = hskState.sourceKey, level = hskState.currentLevel){
    return `${String(sourceKey || 'hsk')}:${Number(level) || 1}`;
  }

  function readStoredHskModes(){
    try{
      const raw = window.localStorage?.getItem(HSK_MODE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    }catch(_err){
      return {};
    }
  }

  function getStoredHskMode(){
    return readStoredHskModes()[getHskModeStorageId()] || '';
  }

  function saveStoredHskMode(mode){
    if(!['lessons', 'topics', 'grammar', 'all'].includes(mode)) return;
    try{
      const values = readStoredHskModes();
      values[getHskModeStorageId()] = mode;
      window.localStorage?.setItem(HSK_MODE_STORAGE_KEY, JSON.stringify(values));
    }catch(_err){
      // localStorage có thể bị chặn; state trong phiên vẫn hoạt động bình thường.
    }
  }

  function restoreHskModeForCurrentSourceLevel(){
    const stored = getStoredHskMode();
    if(stored && hskModeAvailable(stored)){
      hskState.groupMode = stored;
      return;
    }
    if(!hskModeAvailable(hskState.groupMode)){
      hskState.groupMode = getFirstAvailableHskMode();
    }
  }

  function ensureHskPopup(){
    let popup = document.getElementById('hskDetailOverlay');
    if(popup){
      return popup;
    }
    popup = document.createElement('div');
    popup.id = 'hskDetailOverlay';
    popup.className = 'hsk-popup-overlay';
    popup.hidden = true;
    popup.innerHTML = `
      <div class="hsk-popup-card" role="dialog" aria-modal="true" aria-label="Chi tiết HSK">
        <div class="hsk-popup-body" id="hskDetailBody"></div>
      </div>
    `;
    document.body.appendChild(popup);
    popup.addEventListener('click', event => {
      if(event.target === popup){
        closeHskPopup();
      }
    });
    return popup;
  }

  function getHskPopupBody(){
    ensureHskPopup();
    return document.getElementById('hskDetailBody');
  }

  function setStudyTab(tabName){
    ensureFlashcardLibraryUi();
    const isHub = tabName === 'hub';
    const isLookup = tabName === 'lookup';
    const isHsk = tabName === 'hsk';
    const isRadicals = tabName === 'radicals';
    const isFlashcards = tabName === 'flashcards';
    document.querySelector('.hanzi-app')?.classList.toggle('is-hub-view', isHub);
    if(learnHubView){ learnHubView.hidden = !isHub; }
    lookupView.hidden = !isLookup;
    hskView.hidden = !isHsk;
    if(radicalsView){ radicalsView.hidden = !isRadicals; }
    if(flashcardLibraryView){ flashcardLibraryView.hidden = !isFlashcards; }
    tabHub?.classList.toggle('active', isHub);
    tabLookup.classList.toggle('active', isLookup);
    tabHsk.classList.toggle('active', isHsk);
    tabRadicals?.classList.toggle('active', isRadicals);
    tabFlashcards?.classList.toggle('active', isFlashcards);
    tabHub?.setAttribute('aria-selected', String(isHub));
    tabLookup.setAttribute('aria-selected', String(isLookup));
    tabHsk.setAttribute('aria-selected', String(isHsk));
    tabRadicals?.setAttribute('aria-selected', String(isRadicals));
    tabFlashcards?.setAttribute('aria-selected', String(isFlashcards));

    if(isHub){
      stopAutoplayLoop();
    }else if(isHsk){
      stopAutoplayLoop();
      loadHskSummary();
      loadGrammarSummary();
      window.setTimeout(() => hskSearch?.focus(), 80);
    }else if(isRadicals){
      stopAutoplayLoop();
      window.dispatchEvent(new CustomEvent('hanzi:radicals-tab-open'));
    }else if(isFlashcards){
      stopAutoplayLoop();
      renderFlashcardLibrary();
    }else{
      window.setTimeout(() => els.input?.focus(), 80);
    }
  }

  async function fetchJson(path){
    const response = await fetch(path);
    if(!response.ok){
      throw new Error(`${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  async function loadGrammarSummary(){
    if(hskState.grammarSummary){
      normalizeHskSourceAndLevel();
      renderHskSourceTabs();
      renderHskLevelTabs();
      renderHskFilters();
      return hskState.grammarSummary;
    }
    try{
      const summary = await fetchJson(`${GRAMMAR_DATA_BASE}grammar_summary.json`);
      hskState.grammarSummary = summary;
      normalizeHskSourceAndLevel();
      if(hskState.groupMode === 'grammar' && !hasGrammarForCurrentSource()){
        hskState.groupMode = 'all';
      }
      renderHskSourceTabs();
      renderHskLevelTabs();
      renderHskFilters();
      return summary;
    }catch(err){
      console.warn('Cannot load grammar summary:', err);
      hskState.grammarSummary = null;
      normalizeHskSourceAndLevel();
      renderHskSourceTabs();
      renderHskLevelTabs();
      renderHskFilters();
      return null;
    }
  }

  function getGrammarSourcesForLevel(level = hskState.currentLevel){
    const sources = hskState.grammarSummary?.sources || {};
    const levelKey = String(Number(level) || 1);
    return Object.entries(sources).map(([key, source]) => {
      const levelInfo = source?.levels?.[levelKey] || {};
      return {
        key,
        label: source?.label || key,
        total: Number(levelInfo.total || 0),
        file: levelInfo.file || '',
        hasGrammar: Boolean(levelInfo.hasGrammar && levelInfo.file && Number(levelInfo.total || 0) > 0)
      };
    }).filter(source => source.hasGrammar).sort((a, b) => {
      const ai = HSK_LIBRARY_PRIORITY.indexOf(a.key);
      const bi = HSK_LIBRARY_PRIORITY.indexOf(b.key);
      const ap = ai === -1 ? 99 : ai;
      const bp = bi === -1 ? 99 : bi;
      if(ap !== bp) return ap - bp;
      return String(a.label).localeCompare(String(b.label), 'vi');
    });
  }

  function hasGrammarForCurrentSource(){
    const levelKey = String(Number(hskState.currentLevel) || 1);
    const source = hskState.grammarSummary?.sources?.[hskState.sourceKey];
    const info = source?.levels?.[levelKey];
    return Boolean(info?.hasGrammar && info?.file && Number(info?.total || 0) > 0);
  }

  function ensureGrammarSourceSelection(){
    const sources = getGrammarSourcesForLevel();
    if(!sources.length){
      return sources;
    }
    if(!sources.some(source => source.key === hskState.sourceKey)){
      const preferred = HSK_LIBRARY_PRIORITY.map(key => sources.find(source => source.key === key)).find(Boolean);
      hskState.sourceKey = (preferred || sources[0]).key;
    }
    return sources;
  }

  function getCurrentGrammarInfo(){
    const sources = hskState.grammarSummary?.sources || {};
    const levelKey = String(Number(hskState.currentLevel) || 1);
    const source = sources[hskState.sourceKey];
    const levelInfo = source?.levels?.[levelKey] || null;
    if(!source || !levelInfo?.hasGrammar || !levelInfo?.file){
      return null;
    }
    return {
      sourceKey: hskState.sourceKey,
      sourceLabel: source.label || hskState.sourceKey,
      level: Number(hskState.currentLevel) || 1,
      total: Number(levelInfo.total || 0),
      file: levelInfo.file
    };
  }

  async function loadGrammarForCurrentLevel(){
    const info = getCurrentGrammarInfo();
    if(!info){
      return null;
    }
    const cacheKey = `${info.sourceKey}:${info.level}`;
    if(grammarCache.has(cacheKey)){
      return grammarCache.get(cacheKey);
    }
    const data = await fetchJson(`${GRAMMAR_DATA_BASE}${info.file}`);
    grammarCache.set(cacheKey, data);
    return data;
  }

  function setDialogue301CurriculumMode(active){
    const card = hskView.querySelector('.hsk-card');
    card?.classList.toggle('is-dialogue301', Boolean(active));
  }

  async function loadDialogue301Curriculum(){
    if(dialogue301CurriculumPromise) return dialogue301CurriculumPromise;
    dialogue301CurriculumPromise = fetchJson(DIALOGUE301_LESSONS_PATH).then(data => Array.isArray(data) ? data : (data?.lessons || []));
    return dialogue301CurriculumPromise;
  }

  async function renderDialogue301Curriculum(){
    setDialogue301CurriculumMode(true);
    renderHskSourceTabs();
    renderHskLevelTabs();
    hskStatus.textContent = '301 Đàm thoại · đang tải danh sách bài...';
    hskList.className = 'hsk-list hsk-dialogue301-list';
    try{
      const lessons = await loadDialogue301Curriculum();
      if(hskState.sourceKey !== 'dialogue301') return;
      hskStatus.textContent = `301 Đàm thoại · ${lessons.length.toLocaleString('vi-VN')} bài.`;
      publishHskBreadcrumb();
      hskList.innerHTML = `
        ${lessons.map(lesson => `
          <a class="hsk-dialogue301-item" href="../../index.html?lesson=${encodeURIComponent(lesson.lesson_id || '')}#dialogue301">
            <span class="hsk-dialogue301-item__no">${escapeHtml(lesson.lesson_no || '')}</span>
            <span class="hsk-dialogue301-item__copy"><strong>${escapeHtml(lesson.title || lesson.title_zh || `Bài ${lesson.lesson_no || ''}`)}</strong><small>${escapeHtml(lesson.title_zh || '301 Đàm thoại')}</small></span>
            <b aria-hidden="true">›</b>
          </a>`).join('')}
      `;
    }catch(err){
      console.warn('Cannot load 301 curriculum:', err);
      hskStatus.textContent = 'Không tải được danh sách 301 Đàm thoại.';
      publishHskBreadcrumb();
      hskList.innerHTML = '<p class="hsk-empty">Kiểm tra thư mục lessons-301-v2.</p>';
    }
  }

  async function loadHskSummary(){
    if(!hskState.currentItems.length){
      hskState.levelLoading = true;
    }
    if(hskState.summary){
      normalizeHskSourceAndLevel();
      renderHskSourceTabs();
      renderHskLevelTabs();
      loadGrammarSummary();
      if(hskState.sourceKey === 'dialogue301'){
        await renderDialogue301Curriculum();
      }else if(!hskState.currentItems.length){
        await loadHskLevel(hskState.currentLevel);
      }
      return;
    }

    try{
      hskStatus.textContent = 'Đang tải danh sách cấp HSK...';
      const summary = await fetchJson(`${HSK_DATA_BASE}hsk_summary.json`);
      hskState.summary = summary;
      const total = summary?.totals?.itemsAssignedToHsk || summary?.totals?.sourceWords || '';
      if(hskTotalBadge){
        hskTotalBadge.textContent = total ? `${Number(total).toLocaleString('vi-VN')} mục` : 'HSK';
      }
      normalizeHskSourceAndLevel();
      renderHskSourceTabs();
      renderHskLevelTabs();
      if(hskState.sourceKey === 'dialogue301') await renderDialogue301Curriculum();
      else await loadHskLevel(hskState.currentLevel);
    }catch(err){
      console.warn('Cannot load HSK summary:', err);
      hskState.levelLoading = false;
      hskStatus.textContent = 'Không tải được dữ liệu HSK. Kiểm tra thư mục data/learning/hsk.';
    }
  }

  function renderHskLevelTabs(){
    normalizeHskSourceAndLevel();
    if(hskState.sourceKey === 'dialogue301'){
      levelTabs.innerHTML = '';
      return;
    }
    const levels = getAvailableLevelsForSource(hskState.sourceKey);
    if(!levels.length){
      levelTabs.innerHTML = '';
      return;
    }

    levelTabs.innerHTML = levels.map(level => {
      const levelNo = Number(level.level);
      const active = levelNo === Number(hskState.currentLevel);
      const meta = getSourceLevelMeta(hskState.sourceKey, levelNo) || {};
      const countText = getHskLevelCountText(level, meta);
      const partialClass = meta.status === 'PARTIAL' ? 'is-partial' : '';
      return `
        <button type="button" class="hsk-level-btn ${active ? 'active' : ''} ${partialClass}" data-hsk-level="${escapeHtml(levelNo)}" aria-pressed="${active}" title="${escapeHtml(meta.status === 'PARTIAL' ? 'Dữ liệu chưa đủ' : '')}">
          <strong>${escapeHtml(getHskLevelLabel(levelNo))}</strong>
          <small>${escapeHtml(countText)}</small>
        </button>
      `;
    }).join('');
  }

  async function loadHskLevel(level, options = {}){
    const normalizedLevel = Number(level) || 1;
    hskState.currentLevel = normalizedLevel;
    hskState.levelLoading = true;
    hskState.topicKey = 'all';
    hskState.wordFilter = 'all';
    normalizeHskSourceAndLevel();
    renderHskSourceTabs();
    renderHskLevelTabs();
    if(options.updateRoute){
      syncHskRoute({ sectionKey: 'all' });
    }else{
      publishHskBreadcrumb();
    }

    if(hskCache.has(normalizedLevel)){
      const data = hskCache.get(normalizedLevel);
      hskState.currentItems = Array.isArray(data?.items) ? data.items : [];
      normalizeHskSourceAndLevel();
      hskState.levelLoading = false;
      restoreHskModeForCurrentSourceLevel();
      applyPendingHskSection();
      renderHskSourceTabs();
      renderHskLevelTabs();
      renderHskFilters();
      renderHskList();
      publishHskBreadcrumb();
      return;
    }

    try{
      hskStatus.textContent = `Đang tải HSK ${normalizedLevel}...`;
      hskList.innerHTML = '';
      const data = await fetchJson(`${HSK_DATA_BASE}hsk_${normalizedLevel}.json`);
      hskCache.set(normalizedLevel, data);
      hskState.currentItems = Array.isArray(data?.items) ? data.items : [];
      normalizeHskSourceAndLevel();
      hskState.levelLoading = false;
      restoreHskModeForCurrentSourceLevel();
      applyPendingHskSection();
      renderHskSourceTabs();
      renderHskLevelTabs();
      renderHskFilters();
      renderHskList();
      publishHskBreadcrumb();
    }catch(err){
      console.warn(`Cannot load HSK ${normalizedLevel}:`, err);
      hskState.currentItems = [];
      hskState.levelLoading = false;
      hskStatus.textContent = `Không tải được HSK ${normalizedLevel}.`;
      hskList.innerHTML = '';
    }
  }

  function normalizeSearchText(value){
    return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function itemMatchesQuery(item, query){
    if(!query){
      return true;
    }
    const haystack = [
      item?.word,
      item?.simplified,
      item?.pinyin,
      item?.pinyinPlain,
      item?.meaningVi,
      item?.hanViet,
      ...(Array.isArray(item?.chars) ? item.chars.flatMap(char => [char.char, char.pinyin, char.meaningVi, char.hanViet]) : [])
    ].map(normalizeSearchText).join(' ');
    return haystack.includes(query);
  }

  function getPrimarySection(item){
    const routes = Array.isArray(item?.routes) ? item.routes : [];
    const selected = routes.find(route => {
      if(String(route?.libraryId || '') !== String(hskState.sourceKey || '')){
        return false;
      }
      const routeLevel = Number(route?.levelNo);
      return !Number.isFinite(routeLevel) || routeLevel === Number(hskState.currentLevel);
    });
    const primary = selected || item?.primaryRoute || routes[0] || null;
    if(!primary){
      return '';
    }
    const title = primary.sectionTitle || primary.levelName || '';
    const library = primary.libraryName || primary.libraryId || '';
    return [library, title].filter(Boolean).join(' · ');
  }


  const HSK_LIBRARY_PRIORITY = ['dialogue301', 'hsk', 'new_hsk', 'yct', 'boya'];
  const HSK_LIBRARY_LABELS = {
    dialogue301: '301',
    new_hsk: 'HSK 9 cấp',
    hsk: 'HSK 6 cấp',
    yct: 'YCT',
    boya: 'Boya'
  };
  const HSK_LEVEL_LABEL_PREFIX = {
    dialogue301: 'Bài',
    new_hsk: 'HSK',
    hsk: 'HSK',
    yct: 'YCT',
    boya: 'Boya'
  };

  function getHskSourceLabel(sourceKey = hskState.sourceKey){
    return HSK_LIBRARY_LABELS[sourceKey] || String(sourceKey || 'Nguồn học');
  }

  function getSummaryLevels(){
    return Array.isArray(hskState.summary?.levels) ? hskState.summary.levels : [];
  }

  function getGrammarLevelInfo(sourceKey, level){
    const levelKey = String(Number(level) || 1);
    return hskState.grammarSummary?.sources?.[sourceKey]?.levels?.[levelKey] || null;
  }

  function sourceHasAnyGrammar(sourceKey){
    const levels = hskState.grammarSummary?.sources?.[sourceKey]?.levels || {};
    return Object.values(levels).some(info => info?.hasGrammar && info?.file && Number(info?.total || 0) > 0);
  }

  function getSourceLevelMeta(sourceKey = hskState.sourceKey, level = hskState.currentLevel){
    const levelNo = Number(level) || 1;
    const summaryLevel = getSummaryLevels().find(row => Number(row?.level) === levelNo);
    return summaryLevel?.statusBySource?.[sourceKey] || null;
  }

  function sourceHasVocabularyForCurrentLevel(){
    const sourceItems = hskState.currentItems.filter(itemBelongsToSelectedSource);
    if(sourceItems.length > 0){
      return true;
    }
    return Boolean(getSourceLevelMeta()?.hasVocabulary);
  }

  function sourceHasSectionForCurrentLevel(sectionType){
    if(!sourceHasVocabularyForCurrentLevel()){
      return false;
    }
    return hskState.currentItems.some(item => {
      if(!itemBelongsToSelectedSource(item)){
        return false;
      }
      return getRoutesForSelectedSource(item, sectionType).length > 0;
    });
  }

  function hskModeAvailable(mode){
    if(mode === 'grammar') return hasGrammarForCurrentSource();
    if(mode === 'lessons') return sourceHasSectionForCurrentLevel('lesson');
    if(mode === 'topics') return sourceHasSectionForCurrentLevel('topic');
    if(mode === 'all' || mode === 'char1' || mode === 'char2' || mode === 'char3plus') return sourceHasVocabularyForCurrentLevel();
    return false;
  }

  function getFirstAvailableHskMode(){
    const order = ['lessons', 'topics', 'grammar', 'all'];
    return order.find(hskModeAvailable) || 'all';
  }

  function normalizeHskGroupMode(){
    if(['char1', 'char2', 'char3plus'].includes(hskState.groupMode) || !hskModeAvailable(hskState.groupMode)){
      hskState.groupMode = getFirstAvailableHskMode();
      hskState.topicKey = 'all';
      hskState.wordFilter = 'all';
    }
  }

  function getAvailableHskSources(){
    const sourceSet = new Set(['dialogue301']);
    getSummaryLevels().forEach(level => {
      const libs = level?.libraries || {};
      Object.keys(libs).forEach(key => {
        if(Number(libs[key] || 0) > 0){
          sourceSet.add(key);
        }
      });
    });
    const grammarSources = hskState.grammarSummary?.sources || {};
    Object.keys(grammarSources).forEach(key => {
      if(sourceHasAnyGrammar(key)){
        sourceSet.add(key);
      }
    });
    const keys = HSK_LIBRARY_PRIORITY.filter(key => sourceSet.has(key));
    if(!keys.length){
      return HSK_LIBRARY_PRIORITY.slice();
    }
    return keys;
  }

  function getAvailableLevelsForSource(sourceKey = hskState.sourceKey){
    if(sourceKey === 'dialogue301'){
      return [{ level: 1, count: 40, grammarTotal: 0, hasGrammar: false, file: '' }];
    }
    const rows = [];
    const seen = new Set();
    getSummaryLevels().forEach(level => {
      const levelNo = Number(level?.level);
      if(!Number.isFinite(levelNo)) return;
      const count = Number(level?.libraries?.[sourceKey] || 0);
      const grammarInfo = getGrammarLevelInfo(sourceKey, levelNo);
      const grammarTotal = Number(grammarInfo?.total || 0);
      const hasGrammar = Boolean(grammarInfo?.hasGrammar && grammarInfo?.file && grammarTotal > 0);
      if(count > 0 || hasGrammar){
        seen.add(levelNo);
        rows.push({
          level: levelNo,
          count,
          grammarTotal,
          hasGrammar,
          file: level.file || `hsk_${levelNo}.json`
        });
      }
    });
    const grammarLevels = hskState.grammarSummary?.sources?.[sourceKey]?.levels || {};
    Object.entries(grammarLevels).forEach(([levelKey, info]) => {
      const levelNo = Number(levelKey);
      const grammarTotal = Number(info?.total || 0);
      const hasGrammar = Boolean(info?.hasGrammar && info?.file && grammarTotal > 0);
      if(Number.isFinite(levelNo) && hasGrammar && !seen.has(levelNo)){
        rows.push({ level: levelNo, count: 0, grammarTotal, hasGrammar, file: `hsk_${levelNo}.json` });
        seen.add(levelNo);
      }
    });
    return rows.sort((a, b) => a.level - b.level);
  }

  function normalizeHskSourceAndLevel(){
    const sources = getAvailableHskSources();
    if(!sources.includes(hskState.sourceKey)){
      hskState.sourceKey = sources.includes('hsk') ? 'hsk' : sources[0] || 'new_hsk';
    }
    const levels = getAvailableLevelsForSource(hskState.sourceKey);
    if(levels.length && !levels.some(row => Number(row.level) === Number(hskState.currentLevel))){
      hskState.currentLevel = Number(levels[0].level) || 1;
      hskState.topicKey = 'all';
      hskState.wordFilter = 'all';
    }
    if(hskState.groupMode === 'grammar' && hskState.grammarSummary && !hasGrammarForCurrentSource()){
      hskState.groupMode = getFirstAvailableHskMode();
      hskState.topicKey = 'all';
      hskState.wordFilter = 'all';
    }
  }

  function renderHskSourceTabs(){
    if(!sourceTabs){
      return;
    }
    const sources = getAvailableHskSources();
    sourceTabs.innerHTML = sources.map(key => {
      const active = key === hskState.sourceKey;
      const levels = getAvailableLevelsForSource(key);
      const levelCount = levels.length;
      const grammarCount = levels.filter(row => row.hasGrammar).length;
      const partialCount = levels.filter(row => getSourceLevelMeta(key, row.level)?.status === 'PARTIAL').length;
      const unit = getHskSourceLevelUnit(key);
      const detail = key === 'dialogue301' ? ''
        : `${levelCount ? `${levelCount} ${unit}` : 'Đang tải'}${grammarCount ? ` · ${grammarCount} có ngữ pháp` : ''}`;
      return `
        <button type="button" class="hsk-source-btn ${active ? 'active' : ''} ${partialCount ? 'is-partial' : ''}" data-hsk-source="${escapeHtml(key)}" aria-pressed="${active}" title="${escapeHtml(partialCount ? 'Có cấp dữ liệu chưa đủ' : '')}">
          <strong>${escapeHtml(getHskSourceLabel(key))}</strong>
          ${detail ? `<small>${escapeHtml(detail)}</small>` : ''}
        </button>
      `;
    }).join('');
  }

  function getHskSourceLevelUnit(sourceKey = hskState.sourceKey){
    if(sourceKey === 'dialogue301') return 'chương trình';
    if(sourceKey === 'boya') return 'quyển';
    return 'cấp';
  }

  function formatLoadedDeclared(loaded, declared, unit){
    const loadedCount = Number(loaded || 0);
    const declaredCount = Number(declared || 0);
    if(!loadedCount && !declaredCount) return '';
    if(declaredCount > 0 && loadedCount !== declaredCount){
      return `${loadedCount}/${declaredCount} ${unit}`;
    }
    return `${loadedCount || declaredCount} ${unit}`;
  }

  function getHskLevelCountText(levelRow, meta = null){
    const parts = [];
    if(meta?.hasLesson){
      const lessonText = formatLoadedDeclared(meta.loadedLessonCount, meta.declaredLessonCount, 'bài');
      if(lessonText) parts.push(lessonText);
    }
    if(meta?.hasTopic){
      const topicText = formatLoadedDeclared(meta.loadedTopicCount, meta.declaredTopicCount, 'chủ đề');
      if(topicText) parts.push(topicText);
    }
    const grammarTotal = Number(levelRow?.grammarTotal || meta?.grammarTotal || 0);
    if(grammarTotal > 0) parts.push(`${grammarTotal.toLocaleString('vi-VN')} ngữ pháp`);
    if(parts.length) return parts.join(' · ');

    const count = Number(levelRow?.count || meta?.uniqueItemCount || 0);
    if(count > 0) return `${count.toLocaleString('vi-VN')} từ`;
    return 'Chưa có dữ liệu';
  }

  function getHskLevelLabel(levelNo, sourceKey = hskState.sourceKey){
    const no = Number(levelNo) || 1;
    const meta = getSourceLevelMeta(sourceKey, no);
    if(meta?.label){
      return String(meta.label);
    }
    if(sourceKey === 'new_hsk' && no === 7){
      return 'HSK 7-9';
    }
    const prefix = HSK_LEVEL_LABEL_PREFIX[sourceKey] || 'Cấp';
    return `${prefix} ${no}`;
  }

  function getHskSectionBreadcrumbLabel(){
    if(!hskState.topicKey || hskState.topicKey === 'all') return '';
    const sectionType = hskState.groupMode === 'topics' ? 'topic' : 'lesson';
    const groups = getLearningSectionGroups(hskState.currentItems, sectionType);
    const index = groups.findIndex(group => group.key === hskState.topicKey);
    if(index < 0) return sectionType === 'topic' ? 'Chủ đề' : 'Bài học';
    return sectionType === 'topic' ? `Chủ đề ${index + 1}` : `Bài ${index + 1}`;
  }

  function getHskRouteHref(options = {}){
    return buildHskRouteUrl(options).href;
  }

  function publishHskBreadcrumb(){
    if(new URLSearchParams(window.location.search).get('study') !== 'hsk') return;
    const items = [
      { label: 'Học', href: window.TiengTrungAppShell?.routes?.learn || './index.html?study=hub' },
      { label: 'Giáo trình', href: window.TiengTrungAppShell?.routes?.curriculum || './index.html?study=hsk' }
    ];
    const sourceLabel = getHskSourceLabel();
    const hasLevel = hskState.sourceKey !== 'dialogue301';
    const hasSection = hasLevel && hskState.topicKey && hskState.topicKey !== 'all';
    items.push({
      label: sourceLabel,
      href: getHskRouteHref({ sourceKey: hskState.sourceKey, level: null, sectionKey: 'all' }),
      current: !hasLevel
    });
    if(hasLevel){
      items.push({
        label: getHskLevelLabel(hskState.currentLevel),
        href: getHskRouteHref({ sourceKey: hskState.sourceKey, level: hskState.currentLevel, sectionKey: 'all' }),
        current: !hasSection
      });
    }
    if(hasSection){
      items.push({ label: getHskSectionBreadcrumbLabel(), current: true });
    }
    window.dispatchEvent(new CustomEvent('tiengtrung:breadcrumbchange', { detail: { items } }));
  }

  function applyPendingHskSection(){
    if(!pendingHskSectionKey) return;
    const mode = ['lessons', 'topics'].includes(pendingHskSectionMode) ? pendingHskSectionMode : 'lessons';
    if(!hskModeAvailable(mode)){
      pendingHskSectionKey = '';
      return;
    }
    const sectionType = mode === 'topics' ? 'topic' : 'lesson';
    const exists = getLearningSectionGroups(hskState.currentItems, sectionType).some(group => group.key === pendingHskSectionKey);
    if(exists){
      hskState.groupMode = mode;
      hskState.topicKey = pendingHskSectionKey;
    }
    pendingHskSectionKey = '';
  }

  async function restoreHskRouteFromLocation(){
    const params = new URLSearchParams(window.location.search);
    if(params.get('study') !== 'hsk') return;
    const nextSource = params.get('curriculum') || readLastCurriculum();
    const requestedSection = readRequestedHskSection();
    hskState.sourceKey = nextSource;
    hskState.currentLevel = readRequestedHskLevel();
    pendingHskSectionKey = requestedSection.key;
    pendingHskSectionMode = requestedSection.mode;
    hskState.topicKey = 'all';
    hskState.wordFilter = 'all';
    if(!hskState.summary){
      publishHskBreadcrumb();
      return;
    }
    normalizeHskSourceAndLevel();
    renderHskSourceTabs();
    renderHskLevelTabs();
    if(hskState.sourceKey === 'dialogue301') await renderDialogue301Curriculum();
    else await loadHskLevel(hskState.currentLevel, { updateRoute: false });
  }

  function itemBelongsToSelectedSource(item){
    const sourceKey = hskState.sourceKey || '';
    if(!sourceKey){
      return true;
    }
    if(Array.isArray(item?.libraries) && item.libraries.includes(sourceKey)){
      return true;
    }
    return (Array.isArray(item?.routes) ? item.routes : []).some(route => String(route?.libraryId || '') === sourceKey);
  }

  function getRoutesForCurrentLevel(item){
    const currentLevel = Number(hskState.currentLevel) || 1;
    return (Array.isArray(item?.routes) ? item.routes : [])
      .filter(route => Number(route?.levelNo) === currentLevel || !route?.levelNo);
  }

  function getCurrentSectionType(){
    if(hskState.groupMode === 'topics') return 'topic';
    if(hskState.groupMode === 'lessons') return 'lesson';
    return '';
  }

  function getSectionModeLabel(){
    return getCurrentSectionType() === 'topic' ? 'Chủ đề' : 'Bài học';
  }

  function getSectionModePluralLabel(){
    return getCurrentSectionType() === 'topic' ? 'chủ đề' : 'bài học';
  }

  function getAvailableLessonSources(items = hskState.currentItems){
    const map = new Map();
    const sectionType = getCurrentSectionType();
    items.forEach(item => {
      const word = getHskWordKey(item);
      getRoutesForCurrentLevel(item).forEach(route => {
        if(sectionType && route?.sectionType !== sectionType){
          return;
        }
        const libraryId = String(route?.libraryId || '').trim();
        if(!libraryId){
          return;
        }
        if(!map.has(libraryId)){
          map.set(libraryId, {
            key: libraryId,
            label: route.libraryName || libraryId,
            words: new Set()
          });
        }
        if(word){
          map.get(libraryId).words.add(word);
        }
      });
    });
    return Array.from(map.values()).map(source => ({
      key: source.key,
      label: source.label,
      count: source.words.size
    })).sort((a, b) => {
      const ai = HSK_LIBRARY_PRIORITY.indexOf(a.key);
      const bi = HSK_LIBRARY_PRIORITY.indexOf(b.key);
      const ap = ai === -1 ? 99 : ai;
      const bp = bi === -1 ? 99 : bi;
      if(ap !== bp) return ap - bp;
      return String(a.label).localeCompare(String(b.label), 'vi');
    });
  }

  function ensureHskSourceSelection(){
    const sources = getAvailableLessonSources();
    if(!sources.length){
      hskState.sourceKey = '';
      return sources;
    }
    if(!sources.some(source => source.key === hskState.sourceKey)){
      const preferred = HSK_LIBRARY_PRIORITY.map(key => sources.find(source => source.key === key)).find(Boolean);
      hskState.sourceKey = (preferred || sources[0]).key;
    }
    return sources;
  }

  function getRoutesForSelectedSource(item, sectionType = ''){
    const sourceKey = hskState.sourceKey || 'new_hsk';
    return getRoutesForCurrentLevel(item).filter(route => {
      if(String(route?.libraryId || '') !== sourceKey){
        return false;
      }
      if(sectionType && route?.sectionType !== sectionType){
        return false;
      }
      return true;
    });
  }

  function getRouteSortOrder(route){
    const sectionOrder = Number(route?.sectionOrder);
    return Number.isFinite(sectionOrder) ? sectionOrder : 999999;
  }

  function getRouteTypeRank(route){
    if(route?.sectionType === 'lesson') return 0;
    if(route?.sectionType === 'topic') return 1;
    return 2;
  }

  function sortRoutesForSections(routes){
    return routes.slice().sort((a, b) => {
      const ao = getRouteSortOrder(a);
      const bo = getRouteSortOrder(b);
      if(ao !== bo) return ao - bo;
      const at = getRouteTypeRank(a);
      const bt = getRouteTypeRank(b);
      if(at !== bt) return at - bt;
      return String(a?.sectionTitle || '').localeCompare(String(b?.sectionTitle || ''), 'vi');
    });
  }

  function getBestSectionRoute(item){
    const sectionType = getCurrentSectionType();
    const sourceRoutes = sortRoutesForSections(getRoutesForSelectedSource(item, sectionType));
    if(sourceRoutes.length){
      return sourceRoutes[0];
    }
    return null;
  }

  function formatSectionNumber(route){
    const order = getRouteSortOrder(route);
    if(!Number.isFinite(order) || order >= 999999){
      return 'Khác';
    }
    const prefix = route?.sectionType === 'topic' ? 'Chủ đề' : 'Bài';
    return `${prefix} ${String(order).padStart(2, '0')}`;
  }

  function cleanLessonTitle(title){
    return String(title || 'Chưa rõ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getTopicLabel(route){
    if(!route){
      return getCurrentSectionType() === 'topic' ? 'Chưa rõ chủ đề' : 'Chưa rõ bài học';
    }
    const fallbackTitle = route.sectionType === 'topic' ? 'Chưa rõ chủ đề' : 'Chưa rõ bài học';
    return `${formatSectionNumber(route)} · ${cleanLessonTitle(route.sectionTitle || route.levelName || fallbackTitle)}`;
  }

  function slugifyTopic(value){
    return normalizeSearchText(value)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unknown';
  }

  function getTopicKeyFromRoute(route){
    if(!route){
      return 'unknown';
    }
    const library = route.libraryId || hskState.sourceKey || 'source';
    return String(route.sectionId || `${library}__${slugifyTopic(getTopicLabel(route))}` || 'unknown');
  }

  function getItemTopic(item){
    const route = getBestSectionRoute(item);
    return {
      key: getTopicKeyFromRoute(route),
      label: getTopicLabel(route),
      route
    };
  }

  function getItemCharCount(item){
    const word = getHskWordKey(item);
    return Number(item?.charCount) || getHanziChars(word).length || word.length || 0;
  }

  function getCharGroupLabel(mode){
    if(mode === 'char1') return '1 chữ';
    if(mode === 'char2') return '2 chữ';
    if(mode === 'char3plus') return '3+ chữ';
    if(mode === 'grammar') return 'Ngữ pháp';
    if(mode === 'lessons') return 'Bài học';
    if(mode === 'topics') return 'Chủ đề';
    return 'Tất cả';
  }

  function itemHasSelectedSourceRoute(item){
    const sectionType = getCurrentSectionType();
    if(!sectionType){
      return false;
    }
    return getRoutesForSelectedSource(item, sectionType).length > 0;
  }

  function getFilteredByMode(items){
    const mode = hskState.groupMode || 'all';
    const sourceItems = items.filter(itemBelongsToSelectedSource);
    if(mode === 'lessons' || mode === 'topics'){
      const sectionType = mode === 'topics' ? 'topic' : 'lesson';
      const sectionItems = sourceItems
        .filter(item => itemInSelectedLearningSection(item, sectionType))
        .filter(item => getRoutesForSelectedSource(item, sectionType).length > 0);
      return hskState.topicKey === 'all' ? sectionItems : filterItemsByWordFilter(sectionItems);
    }
    if(mode === 'grammar'){
      return [];
    }
    const scopedItems = sourceItems.filter(item => itemInSelectedLearningSection(item));
    return filterItemsByWordFilter(scopedItems);
  }

  function getOrderInTopic(item, topicKey){
    const sectionType = getCurrentSectionType();
    const route = getRoutesForSelectedSource(item, sectionType).find(route => getTopicKeyFromRoute(route) === topicKey)
      || getBestSectionRoute(item);
    const order = Number(route?.orderInSection);
    return Number.isFinite(order) ? order : 999999;
  }

  function getTopicGroups(items){
    const map = new Map();
    items.filter(itemBelongsToSelectedSource).filter(itemHasSelectedSourceRoute).forEach(item => {
      const topic = getItemTopic(item);
      if(!topic.route){
        return;
      }
      if(!map.has(topic.key)){
        map.set(topic.key, { key: topic.key, label: topic.label, route: topic.route, items: [] });
      }
      map.get(topic.key).items.push(item);
    });
    return Array.from(map.values()).map(group => ({
      ...group,
      items: group.items.slice().sort((a, b) => {
        const ao = getOrderInTopic(a, group.key);
        const bo = getOrderInTopic(b, group.key);
        if(ao !== bo) return ao - bo;
        return getHskWordKey(a).localeCompare(getHskWordKey(b), 'zh-Hans-CN');
      })
    })).sort((a, b) => {
      const ao = getRouteSortOrder(a.route);
      const bo = getRouteSortOrder(b.route);
      if(ao !== bo) return ao - bo;
      const at = getRouteTypeRank(a.route);
      const bt = getRouteTypeRank(b.route);
      if(at !== bt) return at - bt;
      return String(a.label).localeCompare(String(b.label), 'vi');
    });
  }

  function getLearningSectionGroups(items = hskState.currentItems, sectionType = ''){
    const map = new Map();
    items.filter(itemBelongsToSelectedSource).forEach(item => {
      getRoutesForSelectedSource(item, sectionType).forEach(route => {
        if(!route?.sectionType){
          return;
        }
        const key = getTopicKeyFromRoute(route);
        if(!map.has(key)){
          map.set(key, { key, label: getTopicLabel(route), route, items: [] });
        }
        map.get(key).items.push(item);
      });
    });
    return Array.from(map.values()).map(group => ({
      ...group,
      items: group.items.slice().sort((a, b) => {
        const ao = getOrderInTopic(a, group.key);
        const bo = getOrderInTopic(b, group.key);
        if(ao !== bo) return ao - bo;
        return getHskWordKey(a).localeCompare(getHskWordKey(b), 'zh-Hans-CN');
      })
    })).sort((a, b) => {
      const at = getRouteTypeRank(a.route);
      const bt = getRouteTypeRank(b.route);
      if(at !== bt) return at - bt;
      const ao = getRouteSortOrder(a.route);
      const bo = getRouteSortOrder(b.route);
      if(ao !== bo) return ao - bo;
      return String(a.label).localeCompare(String(b.label), 'vi');
    });
  }

  function getSelectedLearningSection(){
    const key = hskState.topicKey || 'all';
    if(key === 'all') return null;
    return getLearningSectionGroups(hskState.currentItems).find(group => group.key === key) || null;
  }

  function getSelectedLearningLabel(){
    const selected = getSelectedLearningSection();
    return selected?.label || `Tất cả ${getHskLevelLabel(hskState.currentLevel)}`;
  }

  function itemInSelectedLearningSection(item, sectionType = ''){
    const selectedKey = hskState.topicKey || 'all';
    if(selectedKey === 'all'){
      return true;
    }
    return getRoutesForSelectedSource(item, sectionType).some(route => getTopicKeyFromRoute(route) === selectedKey);
  }

  function getSelectedLessonChapter(){
    const selected = getSelectedLearningSection();
    if(!selected || selected.route?.sectionType !== 'lesson'){
      return null;
    }
    const order = Number(selected.route?.sectionOrder);
    return Number.isFinite(order) ? order : null;
  }

  function getCurrentModeSections(sectionType = getCurrentSectionType(), items = hskState.currentItems){
    if(!sectionType){
      return [];
    }
    return getLearningSectionGroups(items, sectionType);
  }

  function getCurrentGrammarTotal(){
    const info = getCurrentGrammarInfo();
    return Number(info?.total || 0);
  }

  function getRouteModeRows(){
    const rows = [];
    const lessonCount = getLearningSectionGroups(hskState.currentItems, 'lesson').length;
    const topicCount = getLearningSectionGroups(hskState.currentItems, 'topic').length;
    const grammarCount = getCurrentGrammarTotal();
    if(hskModeAvailable('lessons')){
      rows.push({ mode: 'lessons', label: 'Bài học', count: lessonCount, tone: 'lesson' });
    }
    if(hskModeAvailable('topics')){
      rows.push({ mode: 'topics', label: 'Chủ đề', count: topicCount, tone: 'topic' });
    }
    if(hskModeAvailable('grammar')){
      rows.push({ mode: 'grammar', label: 'Ngữ pháp', count: grammarCount, tone: 'grammar' });
    }
    if(!rows.length && hskModeAvailable('all')){
      rows.push({ mode: 'all', label: 'Từ vựng', count: hskState.currentItems.filter(itemBelongsToSelectedSource).length, tone: 'word' });
    }
    return rows;
  }

  function ensureHskModeMatchesAvailableRows(){
    if(hskState.levelLoading){
      return;
    }
    const rows = getRouteModeRows();
    if(!rows.some(row => row.mode === hskState.groupMode)){
      hskState.groupMode = rows[0]?.mode || getFirstAvailableHskMode();
      hskState.topicKey = 'all';
      hskState.wordFilter = 'all';
    }
  }

  function renderHskRouteTabs(){
    if(!hskGroupModes){
      return;
    }
    ensureHskModeMatchesAvailableRows();
    const rows = getRouteModeRows();
    const selectedSection = getSelectedLearningSection();
    const showingSelectedVocabulary = Boolean(
      selectedSection &&
      (hskState.groupMode === 'lessons' || hskState.groupMode === 'topics')
    );
    const routeTabs = rows.map(row => {
      const active = row.mode === hskState.groupMode;
      return `
        <button type="button" class="hsk-route-tab hsk-route-tab--${escapeHtml(row.tone)} ${active ? 'active' : ''}" data-hsk-group-mode="${escapeHtml(row.mode)}" aria-pressed="${active}">
          <span>${escapeHtml(row.label)}</span>
          <small>${Number(row.count || 0).toLocaleString('vi-VN')}</small>
        </button>
      `;
    }).join('');
    const backTool = showingSelectedVocabulary ? `
      <button type="button" class="hsk-route-icon-button hsk-route-back-button" data-hsk-section-back aria-label="Quay lại danh sách ${hskState.groupMode === 'topics' ? 'chủ đề' : 'bài học'}" title="Quay lại">←</button>
    ` : '';
    const viewTools = showingSelectedVocabulary ? `
      <span class="hsk-route-inline-tools">
        <button type="button" class="hsk-route-icon-button ${hskState.vocabViewMode === 'list' ? 'active' : ''}" data-hsk-vocab-view="list" aria-pressed="${hskState.vocabViewMode === 'list'}" aria-label="Hiển thị dạng danh sách" title="Danh sách">☰</button>
        <button type="button" class="hsk-route-icon-button ${hskState.vocabViewMode === 'grid' ? 'active' : ''}" data-hsk-vocab-view="grid" aria-pressed="${hskState.vocabViewMode === 'grid'}" aria-label="Hiển thị dạng lưới" title="Lưới">▦</button>
      </span>
    ` : '';

    hskGroupModes.classList.toggle('has-back', showingSelectedVocabulary);
    hskGroupModes.classList.toggle('has-view-tools', showingSelectedVocabulary);
    hskGroupModes.classList.remove(
      'hsk-route-toolbar--1-tab',
      'hsk-route-toolbar--2-tabs',
      'hsk-route-toolbar--3-tabs'
    );
    hskGroupModes.classList.add(`hsk-route-toolbar--${Math.min(Math.max(rows.length, 1), 3)}-${rows.length === 1 ? 'tab' : 'tabs'}`);
    hskGroupModes.innerHTML = `
      <span class="hsk-route-toolbar-slot hsk-route-toolbar-left">${backTool}</span>
      <span class="hsk-route-toolbar-main hsk-route-toolbar-main--${Math.min(Math.max(rows.length, 1), 3)}">${routeTabs}</span>
      <span class="hsk-route-toolbar-slot hsk-route-toolbar-right">${viewTools}</span>
    `;
  }

  function filterItemsByWordFilter(items){
    return items;
  }

  function renderHskWordFilters(){
    return '';
  }

  function renderHskSelectedSectionControls(){
    if(!hskTopicFilters){
      return;
    }
    hskTopicFilters.hidden = true;
    hskTopicFilters.innerHTML = '';
  }

  function renderHskFilters(){
    normalizeHskGroupMode();
    renderHskRouteTabs();
    renderHskSelectedSectionControls();
  }

  function getSectionCardNumber(group, index){
    const order = Number(group?.route?.sectionOrder);
    if(Number.isFinite(order) && order > 0){
      return String(order).padStart(2, '0');
    }
    return String(index + 1).padStart(2, '0');
  }

  function getSectionEstimatedMinutes(count){
    const min = Math.max(6, Math.round(Number(count || 0) * 0.7));
    const max = Math.max(min + 4, Math.round(Number(count || 0) * 1.1));
    return `${min}–${max} phút`;
  }

  function renderHskSectionCards(items, sectionType){
    const groups = getLearningSectionGroups(items, sectionType);
    const isTopic = sectionType === 'topic';
    const totalGroups = getLearningSectionGroups(hskState.currentItems, sectionType).length;
    const heading = isTopic ? 'Danh sách chủ đề' : 'Danh sách bài học';
    const unit = isTopic ? 'chủ đề' : 'bài học';
    const badge = isTopic ? 'CHỦ ĐỀ' : 'BÀI';
    const modeClass = isTopic ? 'topic' : 'lesson';
    if(!groups.length){
      return `<p class="hsk-empty">Không tìm thấy ${escapeHtml(unit)} phù hợp.</p>`;
    }
    return `
      <section class="hsk-section-library hsk-section-library--${modeClass}">
        <div class="hsk-section-library-head">
          <div>
            <h3>${escapeHtml(heading)}</h3>
            <p>${groups.length.toLocaleString('vi-VN')} / ${totalGroups.toLocaleString('vi-VN')} ${escapeHtml(unit)}</p>
          </div>
        </div>
        <div class="hsk-section-card-list">
          ${groups.map((group, index) => {
            const no = getSectionCardNumber(group, index);
            const label = `${badge} ${no}`;
            return `
              <button type="button" class="hsk-section-card hsk-section-card--${modeClass}" data-hsk-section-key="${escapeHtml(group.key)}">
                <span class="hsk-section-card-badge">${escapeHtml(label)}</span>
                <strong>${escapeHtml(group.label)}</strong>
                ${group.route?.sectionTitle && group.route.sectionTitle !== group.label ? `<em>${escapeHtml(group.route.sectionTitle)}</em>` : ''}
                <span class="hsk-section-card-meta">${group.items.length.toLocaleString('vi-VN')} từ${!isTopic ? ` · ${escapeHtml(getSectionEstimatedMinutes(group.items.length))}` : ''}</span>
                <span class="hsk-section-practice">◎ Luyện tập</span>
                <b aria-hidden="true">${escapeHtml(no)}</b>
                <i aria-hidden="true">›</i>
              </button>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }

  function renderSelectedSectionWordList(items){
    const selected = getSelectedLearningSection();
    const sectionType = getCurrentSectionType();
    const filtered = filterItemsByWordFilter(items);
    if(!selected){
      return filtered.map((item, index) => renderHskItem(item, index)).join('');
    }
    if(!filtered.length){
      return '<p class="hsk-empty">Không tìm thấy từ phù hợp trong mục này.</p>';
    }
    const modeClass = sectionType === 'topic' ? 'topic' : 'lesson';
    return `
      <section class="hsk-section-word-view hsk-section-word-view--${modeClass}">
        <div class="hsk-section-word-list">
          ${filtered.map((item, index) => renderHskItem(item, index)).join('')}
        </div>
      </section>
    `;
  }

  function getItemRadicalHints(item){
    const chars = Array.isArray(item?.chars) ? item.chars : [];
    const hints = [];
    chars.forEach(charInfo => {
      const radical = charInfo?.radicalCandidate?.char || '';
      if(!radical){
        return;
      }
      const definition = charInfo?.radicalCandidate?.definition || '';
      const label = `${radical}${definition ? ` · ${definition}` : ''}`;
      if(!hints.includes(label)){
        hints.push(label);
      }
    });
    return hints.slice(0, 3);
  }

  function getHskWordKey(item){
    return String(item?.word || item?.simplified || '').trim();
  }

  function formatSlashMeaning(value, limit = 3){
    const parts = String(value || '')
      .split(/\s*\/\s*/)
      .map(part => part.trim())
      .filter(Boolean);
    if(!parts.length){
      return '';
    }
    return parts.slice(0, limit).join(' / ');
  }

  function getAllKnownHskItems(){
    const list = [];
    for(const data of hskCache.values()){
      if(Array.isArray(data?.items)){
        list.push(...data.items);
      }
    }
    list.push(...hskState.currentItems);
    const seen = new Set();
    return list.filter(item => {
      const key = getHskWordKey(item);
      if(!key || seen.has(key)){
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  function findHskItem(word){
    const target = String(word || '').trim();
    if(!target){
      return null;
    }
    return getAllKnownHskItems().find(item => getHskWordKey(item) === target)
      || hskState.currentItems.find(item => getHskWordKey(item) === target)
      || null;
  }

  function normalizePopupCharRows(item){
    const wordChars = getHanziChars(getHskWordKey(item));
    const rawChars = Array.isArray(item?.chars) ? item.chars : [];
    const byChar = new Map();

    rawChars.forEach(row => {
      const normalized = typeof row === 'string'
        ? { char: row }
        : {
            ...row,
            char: String(row?.char || row?.s || '').trim()
          };
      if(normalized.char && !byChar.has(normalized.char)){
        byChar.set(normalized.char, normalized);
      }
    });

    wordChars.forEach(char => {
      if(!byChar.has(char)) byChar.set(char, { char });
    });
    return Array.from(byChar.values());
  }

  function getRelatedWords(item){
    const related = [];
    const self = getHskWordKey(item);
    const chars = normalizePopupCharRows(item).map(row => row.char).filter(Boolean);
    const add = row => {
      const word = String(row?.word || row?.s || row?.simplified || row?.char || '').trim();
      if(!word || word === self || related.some(item => item.word === word)) return;
      const known = findHskItem(word);
      const meaningVi = String(known?.meaningVi || row?.meaningVi || row?.vi || '').trim();
      if(!meaningVi) return;
      related.push({
        word,
        pinyin: known?.pinyin || row?.pinyin || row?.p || '',
        meaningVi,
        knownItem: known
      });
    };

    (Array.isArray(item?.relatedWords) ? item.relatedWords : []).forEach(add);
    normalizePopupCharRows(item).forEach(charInfo => {
      (Array.isArray(charInfo?.relatedWords) ? charInfo.relatedWords : []).forEach(add);
    });

    getAllKnownHskItems().forEach(candidate => {
      if(related.length >= 12) return;
      const word = getHskWordKey(candidate);
      if(!word || word === self) return;
      if(chars.some(char => word.includes(char))){
        add({ word, pinyin: candidate.pinyin, meaningVi: candidate.meaningVi });
      }
    });
    return related.slice(0, 12);
  }

  function renderRouteList(item){
    const routes = Array.isArray(item?.routes) ? item.routes.slice(0, 5) : [];
    if(!routes.length) return '';
    return `
      <section class="hsk-popup-section">
        <h4>Xuất hiện trong lộ trình</h4>
        <ul class="hsk-popup-route-list">
          ${routes.map(route => `
            <li>
              <strong>${escapeHtml(route.libraryName || route.libraryId || 'Nguồn học')}</strong>
              ${route.sectionTitle ? `<span>${escapeHtml(route.sectionTitle)}</span>` : ''}
            </li>
          `).join('')}
        </ul>
      </section>
    `;
  }

  function renderRelatedWords(item){
    const related = getRelatedWords(item);
    if(!related.length) return '';
    const initialLimit = 3;
    const expanded = Boolean(hskState.popupRelatedExpanded);
    const visible = expanded ? related : related.slice(0, initialLimit);
    const hiddenCount = Math.max(0, related.length - initialLimit);
    return `
      <section class="hsk-popup-section hsk-popup-related-section">
        <h4>Từ liên quan</h4>
        <div class="hsk-popup-related-list">
          ${visible.map(row => `
            <button type="button" class="hsk-popup-related-item" data-hsk-popup-open="${escapeHtml(row.word)}" data-hsk-popup-pinyin="${escapeHtml(row.pinyin || '')}" data-hsk-popup-meaning="${escapeHtml(row.meaningVi || '')}">
              <span class="hsk-related-main">
                <strong class="hsk-related-word" data-copy-text="${escapeHtml(row.word)}">${escapeHtml(row.word)}</strong>
                ${row.pinyin ? `<em class="hsk-related-pinyin">${escapeHtml(formatPinyin(row.pinyin))}</em>` : ''}
                ${row.meaningVi ? `<small class="hsk-related-meaning">${escapeHtml(formatSlashMeaning(row.meaningVi, 3))}</small>` : ''}
              </span>
              <b type="button" role="button" tabindex="0" class="hsk-popup-inline-speaker" data-hsk-speak="${escapeHtml(row.word)}" aria-label="Nghe ${escapeHtml(row.word)}">🔊</b>
            </button>
          `).join('')}
        </div>
        ${related.length > initialLimit ? `
          <button type="button" class="hsk-popup-more-btn" data-hsk-related-toggle>
            ${expanded ? 'Thu gọn' : `Xem thêm ${hiddenCount} từ`}
          </button>
        ` : ''}
      </section>
    `;
  }

  function renderPopupCharacters(item){
    const chars = normalizePopupCharRows(item);
    if(!chars.length) return '';
    return `
      <section class="hsk-popup-section hsk-popup-character-section">
        <h4>Từng chữ trong từ</h4>
        <div class="hsk-popup-char-grid">
          ${chars.map(charInfo => `
            <button type="button" class="hsk-popup-char-card" data-hsk-popup-open="${escapeHtml(charInfo.char || '')}" data-hsk-popup-pinyin="${escapeHtml(charInfo.pinyin || '')}" data-hsk-popup-meaning="${escapeHtml(charInfo.meaningVi || '')}" data-copy-text="${escapeHtml(charInfo.char || '')}">
              <strong>${escapeHtml(charInfo.char || '')}</strong>
              ${charInfo.pinyin ? `<span>${escapeHtml(formatPinyin(charInfo.pinyin))}</span>` : ''}
              ${charInfo.meaningVi ? `<em>${escapeHtml(formatSlashMeaning(charInfo.meaningVi, 2))}</em>` : ''}
              ${charInfo.hanViet ? `<small>Hán Việt: ${escapeHtml(charInfo.hanViet)}</small>` : ''}
            </button>
          `).join('')}
        </div>
      </section>
    `;
  }

  function collectPopupSentenceRows(item){
    const rows = [];
    const append = value => {
      if(Array.isArray(value)) rows.push(...value);
    };
    append(item?.sampleSentences);
    append(item?.sentences);
    append(item?.examples);
    append(item?.examples?.sentences);
    return rows;
  }

  function renderPopupSampleSentences(item){
    const rows = normalizePopupSentences(collectPopupSentenceRows(item));
    if(!rows.length) return '';
    return `
      <section class="hsk-popup-section hsk-popup-sentences">
        <h4>Câu mẫu</h4>
        <div class="hsk-popup-sentence-list">
          ${rows.map(row => `
            <button type="button" class="hsk-popup-sentence-item" data-copy-text="${escapeHtml(row.zh)}" data-hsk-speak="${escapeHtml(row.zh)}">
              <strong>${escapeHtml(row.zh)}</strong>
              ${row.pinyin ? `<em>${escapeHtml(formatPinyin(row.pinyin))}</em>` : ''}
              ${row.vi ? `<span>${escapeHtml(row.vi)}</span>` : ''}
              <b aria-hidden="true">🔊</b>
            </button>
          `).join('')}
        </div>
      </section>
    `;
  }

  function renderPopupDictionaryInfo(item){
    const rows = [
      item?.hsk ? ['HSK', `HSK ${item.hsk}`] : null,
      item?.hanViet ? ['Hán Việt', item.hanViet] : null,
      getPrimarySection(item) ? ['Lộ trình', getPrimarySection(item)] : null,
      Array.isArray(item?.libraries) && item.libraries.length ? ['Nguồn', item.libraries.slice(0, 3).join(', ')] : null
    ].filter(Boolean);
    if(!rows.length){
      return '';
    }
    return `
      <section class="hsk-popup-section hsk-popup-info-box">
        <h4>Thông tin từ điển</h4>
        <dl>
          ${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}
        </dl>
      </section>
    `;
  }

  function getPopupChars(item){
    const fromItem = normalizePopupCharRows(item).map(row => row.char).filter(Boolean);
    const fromWord = getHanziChars(getHskWordKey(item));
    return Array.from(new Set([...fromItem, ...fromWord]));
  }

  function renderPopupWriting(item){
    const chars = getPopupChars(item);
    if(!chars.length){
      return '';
    }
    const activeChar = hskState.popupActiveChar && chars.includes(hskState.popupActiveChar)
      ? hskState.popupActiveChar
      : chars[0];
    hskState.popupActiveChar = activeChar;
    return `
      <section class="hsk-popup-section hsk-popup-writing">
        <h4>Cách viết</h4>
        <p>Chọn một chữ để xem nét và luyện viết.</p>
        <div class="hsk-popup-write-chips">
          ${chars.map(char => `
            <button type="button" class="hsk-popup-write-chip ${char === activeChar ? 'active' : ''}" data-hsk-write-char="${escapeHtml(char)}">${escapeHtml(char)}</button>
          `).join('')}
        </div>
        <div class="hsk-popup-writing-status">Đang luyện: <strong>${escapeHtml(activeChar)}</strong></div>
        <div id="hskPopupWriter" class="hsk-popup-writer" aria-label="Luyện viết ${escapeHtml(activeChar)}"></div>
        <div class="hsk-popup-write-actions">
          <button type="button" data-hsk-popup-play-strokes>Phát nét</button>
          <button type="button" data-hsk-popup-quiz>Luyện viết</button>
        </div>
      </section>
    `;
  }

  function renderHskPopup(item, options = {}){
    const word = getHskWordKey(item);
    const pinyin = formatPinyin(item?.pinyin);
    const meaning = String(item?.meaningVi || '').trim();
    const popup = ensureHskPopup();
    const body = getHskPopupBody();
    const canBack = hskState.popupStack.length > 0;
    const fallbackLabel = hskState.popupReturnContext?.label || 'Quay về HSK';
    body.innerHTML = `
      <div class="hsk-popup-topbar">
        <button type="button" class="hsk-popup-back" data-hsk-popup-back>← ${canBack ? 'Quay lại' : fallbackLabel}</button>
        <button type="button" class="hsk-popup-close" data-hsk-popup-close aria-label="Đóng">×</button>
      </div>

      <section class="hsk-popup-hero">
        <div>
          <h3 data-copy-text="${escapeHtml(word)}">${escapeHtml(word)}</h3>
          ${pinyin ? `<p class="hsk-popup-pinyin">${escapeHtml(pinyin)}</p>` : ''}
          ${meaning ? `<p class="hsk-popup-meaning">${escapeHtml(formatSlashMeaning(meaning, 4))}</p>` : '<p class="hsk-popup-meaning is-muted">Chưa có nghĩa tiếng Việt.</p>'}
        </div>
        <button type="button" class="hsk-popup-speaker" data-hsk-speak="${escapeHtml(word)}" aria-label="Nghe ${escapeHtml(word)}">🔊</button>
      </section>

      ${renderPopupCharacters(item)}
      ${renderRelatedWords(item)}
      ${renderPopupSampleSentences(item)}
      ${renderPopupWriting(item)}
      ${renderRouteList(item)}

      <div class="hsk-popup-bottom-actions">
        <button type="button" class="hsk-open-btn" data-hsk-open-lookup="${escapeHtml(word)}">Mở trong tab Tra</button>
      </div>
    `;
    popup.hidden = false;
    document.body.classList.add('hsk-popup-open');
    window.setTimeout(initPopupWriter, 60);
    if(!options.skipEnrich){
      const loadId = ++hskState.popupLoadId;
      enrichHskPopupItem(item, loadId);
    }
  }

  function normalizeSeedRelatedWords(rows){
    return (Array.isArray(rows) ? rows : [])
      .map(row => ({
        word: String(row?.word || row?.char || row?.s || row?.simplified || '').trim(),
        pinyin: String(row?.pinyin || row?.p || '').trim(),
        meaningVi: String(row?.meaningVi || row?.vi || '').trim()
      }))
      .filter(row => row.word && row.meaningVi)
      .slice(0, 12);
  }

  function normalizePopupSentences(rows){
    const seen = new Set();
    return (Array.isArray(rows) ? rows : [])
      .map(row => ({
        zh: String(row?.zh || row?.chinese || row?.hanzi || row?.sentence || row?.text || '').trim(),
        pinyin: String(row?.pinyin || row?.py || '').trim(),
        vi: String(row?.vi || row?.vietnamese || row?.meaningVi || row?.meaning_vi || row?.meaning || row?.translation || '').trim()
      }))
      .filter(row => {
        if(!row.zh || seen.has(row.zh)) return false;
        seen.add(row.zh);
        return true;
      })
      .slice(0, 5);
  }

  async function enrichHskPopupItem(item, loadId){
    const chars = normalizePopupCharRows(item);
    if(!chars.length) return;
    const infos = await Promise.all(chars.map(row => loadLocalCharInfo(row.char)));
    if(loadId !== hskState.popupLoadId || getHskWordKey(item) !== hskState.popupWord) return;

    const enrichedChars = chars.map((row, index) => {
      const info = infos[index] || {};
      return {
        ...info,
        ...row,
        char: row.char,
        pinyin: row.pinyin || info.pinyin || '',
        meaningVi: row.meaningVi || info.meaningVi || '',
        hanViet: row.hanViet || info.hanViet || '',
        relatedWords: [
          ...(Array.isArray(row.relatedWords) ? row.relatedWords : []),
          ...(Array.isArray(info.relatedWords) ? info.relatedWords : [])
        ]
      };
    });
    const current = mergePopupSeed(findHskItem(hskState.popupWord) || getFallbackItem(hskState.popupWord, hskState.popupSeed || {}), hskState.popupSeed || {});
    if(!current) return;
    current.chars = enrichedChars;
    renderHskPopup(current, { skipEnrich: true });
  }

  function mergePopupSeed(item, seed = {}){
    const base = item ? { ...item } : null;
    if(!base){
      return null;
    }
    const seedPinyin = String(seed?.pinyin || '').trim();
    const seedMeaning = String(seed?.meaningVi || '').trim();
    if(seedPinyin){
      base.pinyin = seedPinyin;
    }
    if(seedMeaning){
      base.meaningVi = seedMeaning;
    }
    const seedSentences = normalizePopupSentences(seed?.sampleSentences || seed?.sentences);
    if(seedSentences.length){
      base.sampleSentences = seedSentences;
    }
    const seedRelated = normalizeSeedRelatedWords(seed?.relatedWords);
    if(seedRelated.length){
      const existingRelated = Array.isArray(base.relatedWords) ? base.relatedWords : [];
      const seenRelated = new Set();
      base.relatedWords = [...seedRelated, ...existingRelated].filter(row => {
        const key = String(row?.word || row?.s || row?.simplified || '').trim();
        if(!key || seenRelated.has(key)){
          return false;
        }
        seenRelated.add(key);
        return true;
      });
    }
    const word = getHskWordKey(base);
    if(seedPinyin || seedMeaning){
      const chars = normalizePopupCharRows(base).map(row => ({ ...row }));
      if(getHanziChars(word).length === 1){
        const idx = chars.findIndex(row => row?.char === word);
        const merged = { char: word, ...(idx >= 0 ? chars[idx] : {}) };
        if(seedPinyin){
          merged.pinyin = seedPinyin;
        }
        if(seedMeaning){
          merged.meaningVi = seedMeaning;
        }
        if(idx >= 0){
          chars[idx] = merged;
        }else{
          chars.unshift(merged);
        }
        base.chars = chars;
      }
    }
    return base;
  }

  function getFallbackItem(word, seed = {}){
    const target = String(word || '').trim();
    if(!target){
      return null;
    }
    const seedPinyin = String(seed?.pinyin || '').trim();
    const seedMeaning = String(seed?.meaningVi || '').trim();
    const chars = getHanziChars(target).map(char => ({
      char,
      pinyin: getHanziChars(target).length === 1 ? seedPinyin : '',
      meaningVi: getHanziChars(target).length === 1 ? seedMeaning : ''
    }));
    return mergePopupSeed({
      word: target,
      pinyin: seedPinyin,
      meaningVi: seedMeaning,
      hanViet: '',
      hsk: '',
      chars,
      routes: [],
      libraries: []
    }, seed);
  }

  function openHskPopup(word, options = {}){
    const target = String(word || '').trim();
    if(!target){
      return;
    }
    const current = hskState.popupWord;
    if(options.pushHistory && current && current !== target){
      hskState.popupStack.push({ type: 'word', word: current, seed: hskState.popupSeed || {} });
    }
    if(options.returnContext){
      hskState.popupReturnContext = options.returnContext;
    }else if(!options.pushHistory){
      hskState.popupReturnContext = null;
    }
    hskState.popupWord = target;
    hskState.popupSeed = options.seed || {};
    hskState.popupRelatedExpanded = false;
    hskState.popupActiveChar = '';
    const item = mergePopupSeed(findHskItem(target) || getFallbackItem(target, options.seed || {}), options.seed || {});
    renderHskPopup(item);
  }

  function closeHskPopup(){
    const popup = ensureHskPopup();
    popup.hidden = true;
    document.body.classList.remove('hsk-popup-open');
    hskState.popupWord = '';
    hskState.popupStack = [];
    hskState.popupActiveChar = '';
    hskState.popupWriter = null;
    hskState.popupWriterChar = '';
    hskState.popupReturnContext = null;
    hskState.popupSeed = null;
    hskState.popupRelatedExpanded = false;
  }

  function goBackHskPopup(){
    if(hskState.popupStack.length){
      const previous = hskState.popupStack.pop();
      const previousWord = typeof previous === 'string' ? previous : previous?.word;
      const previousSeed = typeof previous === 'string' ? {} : (previous?.seed || {});
      hskState.popupWord = previousWord;
      hskState.popupSeed = previousSeed;
      hskState.popupRelatedExpanded = false;
      hskState.popupActiveChar = '';
      const item = mergePopupSeed(findHskItem(previousWord) || getFallbackItem(previousWord, previousSeed), previousSeed);
      renderHskPopup(item);
      return;
    }
    const returnContext = hskState.popupReturnContext;
    closeHskPopup();
    if(returnContext?.type === 'radical' && returnContext.id && window.openRadicalLearningPopup){
      window.openRadicalLearningPopup(returnContext.id);
    }
  }

  function initPopupWriter(){
    const target = document.getElementById('hskPopupWriter');
    const char = hskState.popupActiveChar;
    if(!target || !char || !window.HanziWriter){
      return;
    }
    target.innerHTML = '';
    const settings = getSettings();
    const rectSize = Math.floor(target.getBoundingClientRect().width || 176);
    const size = Math.min(190, Math.max(150, rectSize));
    const popupWriterOptions = {
      ...createWriterOptions(size, settings),
      padding: 16,
      showCharacter: true
    };
    try{
      hskState.popupWriter = HanziWriter.create('hskPopupWriter', char, popupWriterOptions);
      hskState.popupWriterChar = char;
    }catch(err){
      console.warn('Cannot create HSK popup writer:', err);
      target.innerHTML = '<p class="hsk-popup-writer-error">Không tải được nét chữ này.</p>';
    }
  }

  function setPopupWriteChar(char){
    const target = String(char || '').trim();
    if(!target){
      return;
    }
    hskState.popupActiveChar = target;
    const item = findHskItem(hskState.popupWord) || getFallbackItem(hskState.popupWord);
    renderHskPopup(item);
  }

  function popupAnimateStrokes(){
    if(hskState.popupWriter){
      hskState.popupWriter.animateCharacter();
    }
  }

  function popupQuiz(){
    if(hskState.popupWriter){
      hskState.popupWriter.quiz({
        showHintAfterMisses: getSettings().showHintAfterMisses
      });
    }
  }

  const HSK_CARD_ACCENTS = [
    '#6f9fe8',
    '#68b982',
    '#62b9c8',
    '#9a7fd1',
    '#e79a62',
    '#df7fa8',
    '#7f8fd8',
    '#68a99f'
  ];

  function getHskCardAccent(index){
    const safeIndex = Number.isFinite(Number(index)) ? Number(index) : 0;
    return HSK_CARD_ACCENTS[Math.abs(safeIndex) % HSK_CARD_ACCENTS.length];
  }

  function renderHskItem(item, index = 0){
    const word = String(item?.word || item?.simplified || '').trim();
    const pinyin = formatPinyin(item?.pinyin);
    const meaning = String(item?.meaningVi || '').trim();
    return `
      <article class="hsk-item hsk-item-compact hsk-vocab-item hsk-item--accented" style="--hsk-card-accent:${getHskCardAccent(index)}" data-hsk-popup-word="${escapeHtml(word)}" data-copy-text="${escapeHtml(word)}" tabindex="0" role="button" aria-label="Mở chi tiết ${escapeHtml(word)}">
        <div class="hsk-item-main">
          <div class="hsk-word-row">
            <strong class="hsk-word">${escapeHtml(word)}</strong>
            ${pinyin ? `<span class="hsk-pinyin">${escapeHtml(pinyin)}</span>` : ''}
            <span class="hsk-card-actions">
              <button type="button" class="hsk-speak" data-hsk-speak="${escapeHtml(word)}" aria-label="Nghe ${escapeHtml(word)}">🔊</button>
            </span>
          </div>
          ${meaning ? `<p class="hsk-meaning">${escapeHtml(formatSlashMeaning(meaning, 3))}</p>` : '<p class="hsk-meaning is-muted">Chưa có nghĩa tiếng Việt.</p>'}
        </div>
      </article>
    `;
  }

  function getGrammarItemsFromData(data){
    if(Array.isArray(data?.items)) return data.items;
    return [];
  }

  function getGrammarItemId(item){
    return String(item?.id || '').trim();
  }

  function findGrammarItemById(id){
    const target = String(id || '').trim();
    if(!target) return null;
    for(const data of grammarCache.values()){
      const found = getGrammarItemsFromData(data).find(item => getGrammarItemId(item) === target);
      if(found) return found;
    }
    return null;
  }

  function normalizeGrammarItem(item){
    const examples = Array.isArray(item?.examples)
      ? item.examples
      : (Array.isArray(item?.example) ? item.example : []);
    const chapterValue = item?.chapter ?? item?.from_book_chapter ?? '';
    const chapterNumber = Number(chapterValue);
    return {
      id: getGrammarItemId(item),
      topic: String(item?.topic || 'Ngữ pháp').trim(),
      syntax: String(item?.syntax || item?.grammar_syntax || '').trim(),
      explanation: String(item?.explanation || item?.grammar_explanation || '').trim(),
      tips: String(item?.tips || item?.grammar_tips || '').trim(),
      attentions: String(item?.attentions || item?.grammar_attentions || '').trim(),
      examples,
      chapter: Number.isFinite(chapterNumber) && chapterNumber > 0 ? chapterNumber : ''
    };
  }

  function renderGrammarCard(item, index = 0){
    const grammar = normalizeGrammarItem(item);
    const chapterLabel = grammar.chapter
      ? `BÀI ${String(grammar.chapter).padStart(2, '0')}`
      : 'NGỮ PHÁP';
    const exampleLabel = `${grammar.examples.length.toLocaleString('vi-VN')} ví dụ`;
    return `
      <article class="hsk-item hsk-grammar-item hsk-item--accented" style="--hsk-card-accent:${getHskCardAccent(index)}" tabindex="0" data-hsk-grammar-id="${escapeHtml(grammar.id)}" data-copy-text="${escapeHtml(grammar.topic)}">
        <div class="hsk-item-main hsk-grammar-card-main">
          <div class="hsk-grammar-card-meta">
            <span class="hsk-grammar-chapter-badge">${escapeHtml(chapterLabel)}</span>
            <span class="hsk-grammar-example-count">${escapeHtml(exampleLabel)}</span>
          </div>
          <h3 class="hsk-grammar-topic">${escapeHtml(grammar.topic)}</h3>
          ${grammar.syntax ? `<p class="hsk-grammar-syntax">${escapeHtml(grammar.syntax)}</p>` : ''}
          ${grammar.explanation ? `<p class="hsk-grammar-preview">${escapeHtml(grammar.explanation)}</p>` : ''}
        </div>
      </article>
    `;
  }

  function renderGrammarListFromData(data){
    renderHskVocabViewControls(false);
    const info = getCurrentGrammarInfo();
    const query = normalizeSearchText(hskState.query);
    const selectedChapter = getSelectedLessonChapter();
    const rawItems = getGrammarItemsFromData(data);
    const scopedItems = selectedChapter ? rawItems.filter(item => Number(item?.chapter || item?.from_book_chapter) === selectedChapter) : rawItems;
    const items = scopedItems.filter(item => {
      if(!query) return true;
      const examples = Array.isArray(item?.examples) ? item.examples : (Array.isArray(item?.example) ? item.example : []);
      const haystack = [
        item?.topic,
        item?.syntax || item?.grammar_syntax,
        item?.explanation || item?.grammar_explanation,
        item?.tips || item?.grammar_tips,
        item?.attentions || item?.grammar_attentions,
        ...examples.flatMap(row => [row?.chinese, row?.pinyin, row?.vietnamese])
      ].map(normalizeSearchText).join(' ');
      return haystack.includes(query);
    });
    const total = scopedItems.length;
    const foundCount = items.length.toLocaleString('vi-VN');
    const baseCount = total.toLocaleString('vi-VN');
    const scopeLabel = selectedChapter ? ` · ${escapeHtml(getSelectedLearningLabel())}` : '';
    hskStatus.textContent = `${escapeHtml(getHskSourceLabel())} · ${escapeHtml(getHskLevelLabel(hskState.currentLevel))}${scopeLabel} · Ngữ pháp${query ? ` · tìm thấy ${foundCount} / ${baseCount}` : ` · ${foundCount} / ${baseCount}`} mục.`;
    hskList.classList.remove('hsk-list--topics', 'hsk-list--section-cards');
    hskList.classList.add('hsk-list--grammar');
    if(!items.length){
      hskList.innerHTML = selectedChapter
        ? '<p class="hsk-empty">Bài này chưa có mục ngữ pháp khớp theo chapter.</p>'
        : '<p class="hsk-empty">Không tìm thấy mục ngữ pháp phù hợp.</p>';
      return;
    }
    hskList.innerHTML = items.map((item, index) => renderGrammarCard(item, index)).join('');
  }

  function renderGrammarList(){
    renderHskVocabViewControls(false);
    const info = getCurrentGrammarInfo();
    hskList.classList.remove('hsk-list--topics', 'hsk-list--section-cards');
    hskList.classList.add('hsk-list--grammar');
    if(!info){
      hskStatus.textContent = `${escapeHtml(getHskSourceLabel())} · ${escapeHtml(getHskLevelLabel(hskState.currentLevel))} · chưa có dữ liệu ngữ pháp.`;
      hskList.innerHTML = '<p class="hsk-empty">Cấp này chưa có dữ liệu ngữ pháp.</p>';
      return;
    }
    const cacheKey = `${info.sourceKey}:${info.level}`;
    if(grammarCache.has(cacheKey)){
      renderGrammarListFromData(grammarCache.get(cacheKey));
      return;
    }
    hskStatus.textContent = `Đang tải ngữ pháp HSK ${info.level}...`;
    hskList.innerHTML = '<p class="hsk-empty">Đang tải ngữ pháp...</p>';
    loadGrammarForCurrentLevel().then(data => {
      if(hskState.groupMode !== 'grammar') return;
      renderGrammarListFromData(data);
    }).catch(err => {
      console.warn('Cannot load grammar data:', err);
      if(hskState.groupMode === 'grammar'){
        hskStatus.textContent = `Không tải được dữ liệu ngữ pháp HSK ${info.level}.`;
        hskList.innerHTML = '<p class="hsk-empty">Không tải được dữ liệu ngữ pháp.</p>';
      }
    });
  }

  function normalizeGrammarExamples(item){
    return (Array.isArray(item?.examples) ? item.examples : (Array.isArray(item?.example) ? item.example : []))
      .map(row => ({
        chinese: String(row?.chinese || row?.zh || '').trim(),
        pinyin: String(row?.pinyin || '').trim(),
        vietnamese: String(row?.vietnamese || row?.vi || row?.meaningVi || '').trim()
      }))
      .filter(row => row.chinese && row.vietnamese)
      .slice(0, 6);
  }

  function renderGrammarPopup(item){
    if(!item) return;
    const popup = ensureHskPopup();
    const body = getHskPopupBody();
    const grammar = normalizeGrammarItem(item);
    const examples = normalizeGrammarExamples(item);
    const levelLabel = getHskLevelLabel(hskState.currentLevel);
    const sourceLabel = getHskSourceLabel();
    const chapterLabel = grammar.chapter ? `Bài ${grammar.chapter}` : '';
    const exampleLabel = `${examples.length.toLocaleString('vi-VN')} ví dụ`;
    const metaItems = [sourceLabel, levelLabel, chapterLabel, exampleLabel].filter(Boolean);

    const renderGrammarBlock = (type, label, text, icon = '') => {
      if(!text) return '';
      return `
        <section class="hsk-popup-section hsk-grammar-detail-block hsk-grammar-detail-${escapeHtml(type)}">
          <div class="hsk-grammar-detail-head">
            ${icon ? `<span class="hsk-grammar-detail-icon" aria-hidden="true">${escapeHtml(icon)}</span>` : ''}
            <h4>${escapeHtml(label)}</h4>
          </div>
          <p class="hsk-grammar-text" data-copy-text="${escapeHtml(text)}">${escapeHtml(text)}</p>
        </section>
      `;
    };

    body.innerHTML = `
      <div class="hsk-popup-topbar">
        <button type="button" class="hsk-popup-back" data-hsk-popup-close>← Quay về Ngữ pháp</button>
        <button type="button" class="hsk-popup-close" data-hsk-popup-close aria-label="Đóng">×</button>
      </div>
      <section class="hsk-popup-hero hsk-grammar-hero hsk-grammar-detail-hero">
        <div>
          <div class="hsk-grammar-hero-kicker">NGỮ PHÁP</div>
          <h3 data-copy-text="${escapeHtml(grammar.topic)}">${escapeHtml(grammar.topic)}</h3>
          <div class="hsk-grammar-hero-meta">
            ${metaItems.map(value => `<span>${escapeHtml(value)}</span>`).join('')}
          </div>
        </div>
      </section>
      <div class="hsk-grammar-detail-stack">
        ${renderGrammarBlock('syntax', 'Cấu trúc', grammar.syntax)}
        ${renderGrammarBlock('explanation', 'Giải thích', grammar.explanation)}
        ${renderGrammarBlock('tips', 'Mẹo nhớ', grammar.tips, '💡')}
        ${renderGrammarBlock('attention', 'Lưu ý', grammar.attentions, '!')}
        ${examples.length ? `
          <section class="hsk-popup-section hsk-grammar-examples hsk-grammar-detail-examples">
            <div class="hsk-grammar-examples-head">
              <h4>Ví dụ</h4>
              <span>${escapeHtml(exampleLabel)}</span>
            </div>
            <div class="hsk-grammar-example-list">
              ${examples.map((row, index) => `
                <article class="hsk-grammar-example-card" data-copy-text="${escapeHtml(row.chinese)}">
                  <span class="hsk-grammar-example-index">${String(index + 1).padStart(2, '0')}</span>
                  <div class="hsk-grammar-example-main">
                    <strong>${escapeHtml(row.chinese)}</strong>
                    ${row.pinyin ? `<em>${escapeHtml(formatPinyin(row.pinyin))}</em>` : ''}
                    ${row.vietnamese ? `<span>${escapeHtml(row.vietnamese)}</span>` : ''}
                  </div>
                  <button type="button" class="hsk-grammar-example-speaker" data-hsk-speak="${escapeHtml(row.chinese)}" aria-label="Nghe ${escapeHtml(row.chinese)}">🔊</button>
                </article>
              `).join('')}
            </div>
          </section>
        ` : ''}
      </div>
    `;
    popup.hidden = false;
    document.body.classList.add('hsk-popup-open');
  }



  function readFlashcardResults(){
    try{
      const parsed = JSON.parse(window.localStorage?.getItem(HSK_FLASHCARD_RESULTS_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    }catch(_err){
      return {};
    }
  }


  function getFlashcardResultEntries(){
    return Object.values(readFlashcardResults())
      .filter(entry => entry && entry.cardId && entry.word)
      .sort((a, b) => String(b.lastStudiedAt || '').localeCompare(String(a.lastStudiedAt || '')));
  }

  function getFlashcardStats(){
    const entries = getFlashcardResultEntries();
    const groups = {
      easy: entries.filter(entry => entry.lastRating === 'easy'),
      review: entries.filter(entry => entry.lastRating === 'review'),
      hard: entries.filter(entry => entry.lastRating === 'hard')
    };
    return {
      entries,
      groups,
      total: entries.length,
      easy: groups.easy.length,
      review: groups.review.length,
      hard: groups.hard.length
    };
  }

  function flashcardResultEntryToCard(entry){
    return {
      id: String(entry.cardId || ''),
      word: String(entry.word || ''),
      pinyin: String(entry.pinyin || ''),
      meaningVi: String(entry.meaningVi || '')
    };
  }

  function createFlashcardSessionFromCards(cards, title){
    const cleanCards = (cards || []).filter(card => card?.id && card?.word);
    if(!cleanCards.length) return false;
    hskState.flashcardStatsOpen = false;
    hskState.flashcardSession = {
      phase: 'setup',
      title: String(title || 'Ôn Flashcard'),
      cards: cleanCards,
      settings: getFlashcardSettings(),
      index: 0,
      flipped: false,
      ratings: {},
      mixedTypes: [],
      origin: 'library',
      contextKey: `library:${String(title || 'flashcards')}`,
      contextLabel: String(title || 'Ôn Flashcard'),
      typing: null,
      typingPromptTypes: []
    };
    renderFlashcardOverlay();
    return true;
  }

  function openFlashcardStats(){
    hskState.flashcardSession = null;
    hskState.flashcardStatsOpen = true;
    renderFlashcardOverlay();
  }

  function startFlashcardStatsGroup(group){
    const stats = getFlashcardStats();
    let entries = [];
    let title = 'Ôn Flashcard';
    if(group === 'review'){
      entries = stats.groups.review;
      title = 'Thẻ cần Ôn';
    }else if(group === 'hard'){
      entries = stats.groups.hard;
      title = 'Thẻ Khó';
    }else{
      entries = [...stats.groups.review, ...stats.groups.hard];
      title = 'Thẻ cần Ôn và Khó';
    }
    createFlashcardSessionFromCards(entries.map(flashcardResultEntryToCard), title);
  }

  function saveFlashcardRatingResult(card, rating, previousRating = ''){
    if(!card?.id || !['easy', 'review', 'hard'].includes(rating)) return;
    try{
      const results = readFlashcardResults();
      const previous = results[card.id] && typeof results[card.id] === 'object' ? results[card.id] : {};
      const changedWithinSession = ['easy', 'review', 'hard'].includes(previousRating) && previousRating !== rating;
      const sameWithinSession = previousRating === rating;
      const counts = {
        easy: Number(previous.easy || 0),
        review: Number(previous.review || 0),
        hard: Number(previous.hard || 0)
      };
      if(changedWithinSession){
        counts[previousRating] = Math.max(0, counts[previousRating] - 1);
      }
      if(!sameWithinSession){
        counts[rating] += 1;
      }
      results[card.id] = {
        cardId: card.id,
        word: card.word || '',
        pinyin: card.pinyin || '',
        meaningVi: card.meaningVi || '',
        easy: counts.easy,
        review: counts.review,
        hard: counts.hard,
        total: Number(previous.total || 0) + (previousRating ? 0 : 1),
        lastRating: rating,
        lastStudiedAt: new Date().toISOString()
      };
      window.localStorage?.setItem(HSK_FLASHCARD_RESULTS_KEY, JSON.stringify(results));
    }catch(_err){
      // localStorage có thể bị chặn; kết quả vẫn được giữ trong phiên hiện tại.
    }
  }

  function serializeFlashcardSession(session){
    if(!session || session.phase === 'complete') return null;
    return {
      version: 1,
      savedAt: Date.now(),
      phase: session.phase,
      title: String(session.title || ''),
      cards: (session.cards || []).map(card => ({
        id: String(card.id || ''),
        word: String(card.word || ''),
        pinyin: String(card.pinyin || ''),
        meaningVi: String(card.meaningVi || '')
      })).filter(card => card.id && card.word),
      settings: {
        mode: session.settings?.mode || 'flashcard',
        showPinyin: session.settings?.showPinyin !== false,
        autoPlay: Boolean(session.settings?.autoPlay),
        shuffle: Boolean(session.settings?.shuffle),
        showStroke: Boolean(session.settings?.showStroke),
        typingPromptType: session.settings?.typingPromptType || 'hanzi-to-pinyin'
      },
      index: Number(session.index || 0),
      flipped: Boolean(session.flipped),
      ratings: session.ratings && typeof session.ratings === 'object' ? session.ratings : {},
      mixedTypes: Array.isArray(session.mixedTypes) ? session.mixedTypes : [],
      origin: session.origin || 'lesson',
      contextKey: String(session.contextKey || ''),
      contextLabel: String(session.contextLabel || ''),
      typingPromptTypes: Array.isArray(session.typingPromptTypes) ? session.typingPromptTypes : [],
      typing: session.typing && typeof session.typing === 'object' ? session.typing : null
    };
  }

  function persistFlashcardSession(){
    const payload = serializeFlashcardSession(hskState.flashcardSession);
    try{
      if(payload?.cards?.length){
        window.localStorage?.setItem(HSK_FLASHCARD_ACTIVE_SESSION_KEY, JSON.stringify(payload));
      }else{
        window.localStorage?.removeItem(HSK_FLASHCARD_ACTIVE_SESSION_KEY);
      }
    }catch(_err){
      // localStorage có thể bị chặn; phiên vẫn hoạt động cho đến khi reload.
    }
  }

  function clearPersistedFlashcardSession(){
    try{
      window.localStorage?.removeItem(HSK_FLASHCARD_ACTIVE_SESSION_KEY);
    }catch(_err){
      // Không cần xử lý thêm.
    }
  }

  function restorePersistedFlashcardSession(){
    try{
      const raw = window.localStorage?.getItem(HSK_FLASHCARD_ACTIVE_SESSION_KEY);
      if(!raw) return false;
      const saved = JSON.parse(raw);
      const cards = Array.isArray(saved?.cards) ? saved.cards.filter(card => card?.id && card?.word) : [];
      if(!cards.length){
        clearPersistedFlashcardSession();
        return false;
      }
      const settings = saved.settings && typeof saved.settings === 'object' ? saved.settings : getFlashcardSettings();
      const index = Math.max(0, Math.min(Number(saved.index || 0), cards.length - 1));
      hskState.flashcardSession = {
        phase: saved.phase === 'setup' ? 'setup' : 'study',
        title: String(saved.title || 'Phiên Flashcard'),
        cards,
        settings: {
          mode: ['flashcard', 'reverse', 'listen', 'typing', 'mixed'].includes(settings.mode) ? settings.mode : 'flashcard',
          showPinyin: settings.showPinyin !== false,
          autoPlay: Boolean(settings.autoPlay),
          shuffle: Boolean(settings.shuffle),
          showStroke: Boolean(settings.showStroke),
          typingPromptType: ['hanzi-to-pinyin', 'meaning-to-pinyin', 'mixed'].includes(settings.typingPromptType) ? settings.typingPromptType : 'hanzi-to-pinyin'
        },
        index,
        flipped: Boolean(saved.flipped),
        ratings: saved.ratings && typeof saved.ratings === 'object' ? saved.ratings : {},
        mixedTypes: Array.isArray(saved.mixedTypes) && saved.mixedTypes.length === cards.length
          ? saved.mixedTypes
          : cards.map((_, cardIndex) => ['flashcard', 'reverse', 'listen'][cardIndex % 3]),
        origin: saved.origin || 'lesson',
        contextKey: String(saved.contextKey || ''),
        contextLabel: String(saved.contextLabel || ''),
        typingPromptTypes: Array.isArray(saved.typingPromptTypes) ? saved.typingPromptTypes : [],
        typing: saved.typing && typeof saved.typing === 'object' ? saved.typing : null
      };
      renderFlashcardOverlay();
      if(hskState.flashcardSession.phase === 'study' && !hskState.flashcardSession.flipped){
        maybeAutoPlayFlashcard();
      }
      return true;
    }catch(_err){
      clearPersistedFlashcardSession();
      return false;
    }
  }


  const PINYIN_TONE_BASE_MAP = Object.freeze({
    'ā':'a','á':'a','ǎ':'a','à':'a','ē':'e','é':'e','ě':'e','è':'e',
    'ī':'i','í':'i','ǐ':'i','ì':'i','ō':'o','ó':'o','ǒ':'o','ò':'o',
    'ū':'u','ú':'u','ǔ':'u','ù':'u','ǖ':'ü','ǘ':'ü','ǚ':'ü','ǜ':'ü',
    'ń':'n','ň':'n','ǹ':'n','ḿ':'m'
  });

  function tokenizeFlashcardPinyin(value){
    const chars = Array.from(String(value || '').trim().toLowerCase());
    const tokens = [];
    for(let i = 0; i < chars.length; i += 1){
      let char = PINYIN_TONE_BASE_MAP[chars[i]] || chars[i];
      if(/[\s'’·-]/u.test(char)) continue;
      if(/[1-5]/.test(char)) continue;
      if(char === 'u' && chars[i + 1] === ':'){
        tokens.push('u:');
        i += 1;
        continue;
      }
      if(char === ':') continue;
      if(/[a-züv]/u.test(char)) tokens.push(char);
    }
    return tokens;
  }

  function isFlashcardTypingTokenAccepted(expected, actual){
    if(expected === 'ü') return ['ü', 'u', 'v', 'u:'].includes(actual);
    return expected === actual;
  }

  function getTypingEligibleCards(cards, promptType){
    return (cards || []).filter(card => {
      if(!String(card?.pinyin || '').trim()) return false;
      if(promptType === 'meaning-to-pinyin') return Boolean(String(card?.meaningVi || '').trim());
      return true;
    });
  }

  function resolveTypingPromptType(session, index){
    const configured = session.settings?.typingPromptType || 'hanzi-to-pinyin';
    if(configured !== 'mixed') return configured;
    const stored = session.typingPromptTypes?.[index];
    if(stored) return stored;
    const card = session.cards[index];
    return index % 2 === 1 && String(card?.meaningVi || '').trim() ? 'meaning-to-pinyin' : 'hanzi-to-pinyin';
  }

  function createFlashcardTypingState(session, card){
    const answerTokens = tokenizeFlashcardPinyin(card?.pinyin || '');
    return {
      cardId: String(card?.id || ''),
      promptType: resolveTypingPromptType(session, session.index),
      answerTokens,
      currentIndex: 0,
      committedTokens: [],
      currentWrongToken: '',
      mistakesByIndex: answerTokens.map(() => 0),
      hintShownByIndex: answerTokens.map(() => false),
      totalMistakes: 0,
      correctInputs: 0,
      startedAt: Date.now(),
      completedAt: 0,
      isCompleting: false,
      answerRevealUsed: false,
      answerRevealCount: 0,
      answerRevealedAt: 0,
      answerVisible: false,
      completionPending: false,
      completionTapArmed: false,
      keyboardDismissedAfterComplete: false,
      completionDelayMs: 0,
      completionDueAt: 0,
      completionCardKey: ''
    };
  }

  function ensureFlashcardTypingState(session){
    const card = session?.cards?.[session.index];
    if(!session || !card) return null;
    if(!session.typing || session.typing.cardId !== card.id){
      session.typing = createFlashcardTypingState(session, card);
    }
    return session.typing;
  }

  function getFlashcardTypingStats(state){
    const correct = Number(state?.correctInputs || 0);
    const mistakes = Number(state?.totalMistakes || 0);
    const total = correct + mistakes;
    return {
      elapsedMs: Math.max(0, (state?.completedAt || Date.now()) - Number(state?.startedAt || Date.now())),
      accuracy: total ? Math.round((correct / total) * 100) : 100,
      mistakes
    };
  }

  function formatFlashcardTypingTime(ms){
    const totalSeconds = Math.floor(Math.max(0, Number(ms || 0)) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function renderFlashcardTypingSlots(state){
    return state.answerTokens.map((expected, index) => {
      const isDone = index < state.currentIndex;
      const isCurrent = index === state.currentIndex && !state.isCompleting;
      const value = isDone ? (state.committedTokens[index] || expected) : (isCurrent && state.currentWrongToken ? state.currentWrongToken : '_');
      const classes = [
        'hsk-flashcard-typing-slot',
        isDone ? 'is-correct' : '',
        isCurrent ? 'is-current' : '',
        isCurrent && state.currentWrongToken ? 'is-wrong' : ''
      ].filter(Boolean).join(' ');
      return `<span class="${classes}">${escapeHtml(value)}</span>`;
    }).join('');
  }

  function renderFlashcardTypingStudy(session, card){
    const state = ensureFlashcardTypingState(session);
    const stats = getFlashcardTypingStats(state);
    const hintIndex = state.currentIndex;
    const hintVisible = Boolean(state.hintShownByIndex?.[hintIndex]);
    const prompt = state.promptType === 'meaning-to-pinyin'
      ? `<small>NGHĨA VIỆT → PINYIN</small><strong class="hsk-flashcard-typing-prompt-text">${escapeHtml(card.meaningVi)}</strong>`
      : `<small>CHỮ TRUNG → PINYIN</small><strong class="hsk-flashcard-typing-prompt-hanzi">${escapeHtml(card.word)}</strong>`;
    return `
      <header class="hsk-flashcard-header">
        <button type="button" class="hsk-flashcard-back" data-hsk-flashcard-to-setup>← Thiết lập</button>
        <span class="hsk-flashcard-progress" data-hsk-flashcard-typing-progress>${session.index + 1} / ${session.cards.length}</span>
        <button type="button" class="hsk-flashcard-close" data-hsk-flashcard-close aria-label="Đóng">×</button>
      </header>
      <div class="hsk-flashcard-study hsk-flashcard-typing-study">
        <div class="hsk-flashcard-study-meta"><b>Gõ Pinyin</b><span>${escapeHtml(session.title)}</span></div>
        <section class="hsk-flashcard-typing-card ${state.isCompleting ? 'is-complete' : ''}" data-hsk-flashcard-typing-card>
          <div class="hsk-flashcard-typing-prompt" data-hsk-flashcard-typing-prompt>${prompt}</div>
          <div class="hsk-flashcard-typing-slots" data-hsk-flashcard-typing-slots aria-label="Nhập pinyin">${renderFlashcardTypingSlots(state)}</div>
          <input class="hsk-flashcard-typing-input" data-hsk-flashcard-typing-input type="text" inputmode="text" autocapitalize="none" autocomplete="off" autocorrect="off" spellcheck="false" aria-label="Nhập ký tự pinyin hiện tại">
          <div class="hsk-flashcard-typing-feedback" data-hsk-flashcard-typing-feedback aria-live="polite">
            ${state.currentWrongToken ? '<span class="is-error">Ký tự chưa đúng</span>' : ''}
            ${hintVisible ? `<span class="is-hint">Gợi ý: ${escapeHtml(state.answerTokens[hintIndex] || '')}</span>` : ''}
            ${state.isCompleting ? '<span class="is-success">✓ Chính xác</span>' : ''}
          </div>
          <div class="hsk-flashcard-typing-result" data-hsk-flashcard-typing-result data-hsk-flashcard-typing-complete aria-live="polite" ${state.isCompleting ? '' : 'hidden'}>
            <span class="hsk-flashcard-typing-result-word" data-hsk-flashcard-typing-result-word>${escapeHtml(card.word)}</span>
            <strong class="hsk-flashcard-typing-result-pinyin" data-hsk-flashcard-typing-result-pinyin>${escapeHtml(card.pinyin)}</strong>
            <p class="hsk-flashcard-typing-result-meaning" data-hsk-flashcard-typing-result-meaning ${card.meaningVi ? '' : 'hidden'}>${escapeHtml(card.meaningVi || '')}</p>
            <p class="hsk-flashcard-typing-continue-hint" data-hsk-flashcard-typing-continue-hint ${state.completionTapArmed ? '' : 'hidden'}>Chạm vào đáp án để tiếp tục</p>
            <button type="button" class="hsk-flashcard-typing-continue" data-hsk-flashcard-typing-continue>Tiếp tục →</button>
          </div>
          <div class="hsk-flashcard-typing-controls" data-hsk-flashcard-typing-controls ${state.isCompleting ? 'hidden' : ''}>
            <button type="button" class="hsk-flashcard-typing-hint" data-hsk-flashcard-typing-reveal aria-expanded="${state.answerVisible}">💡 Đáp án</button>
            <div class="hsk-flashcard-typing-answer" data-hsk-flashcard-typing-answer ${state.answerVisible ? '' : 'hidden'}>
              <strong data-hsk-flashcard-typing-answer-pinyin>${escapeHtml(card.pinyin)}</strong>
              <span data-hsk-flashcard-typing-answer-word>${escapeHtml(card.word)}</span>
              <p data-hsk-flashcard-typing-answer-meaning ${card.meaningVi ? '' : 'hidden'}>${escapeHtml(card.meaningVi || '')}</p>
            </div>
          </div>
          <div class="hsk-flashcard-typing-stats">
            <div><b data-hsk-flashcard-typing-time>${formatFlashcardTypingTime(stats.elapsedMs)}</b><span>Thời gian</span></div>
            <div><b data-hsk-flashcard-typing-accuracy>${stats.accuracy}%</b><span>Chính xác</span></div>
            <div><b data-hsk-flashcard-typing-errors>${stats.mistakes}</b><span>Lỗi</span></div>
          </div>
        </section>
        <div class="hsk-flashcard-nav">
          <button type="button" data-hsk-flashcard-prev ${session.index === 0 ? 'disabled' : ''}>← Trước</button>
          <button type="button" data-hsk-flashcard-next>${session.index === session.cards.length - 1 ? 'Hoàn thành' : 'Bỏ qua →'}</button>
        </div>
      </div>
    `;
  }


  function cancelFlashcardTypingCompletionTimer(){
    if(flashcardTypingCompletionTimer){
      window.clearTimeout(flashcardTypingCompletionTimer);
      flashcardTypingCompletionTimer = 0;
    }
  }

  function stopFlashcardTypingClock(){
    if(flashcardTypingClockTimer){
      window.clearInterval(flashcardTypingClockTimer);
      flashcardTypingClockTimer = 0;
    }
  }

  function patchFlashcardTypingStats(session){
    const overlay = document.getElementById('hskFlashcardOverlay');
    if(!overlay || overlay.hidden || !session || getCurrentFlashcardType(session) !== 'typing') return;
    const state = ensureFlashcardTypingState(session);
    if(!state) return;
    const stats = getFlashcardTypingStats(state);
    const time = overlay.querySelector('[data-hsk-flashcard-typing-time]');
    const accuracy = overlay.querySelector('[data-hsk-flashcard-typing-accuracy]');
    const errors = overlay.querySelector('[data-hsk-flashcard-typing-errors]');
    if(time) time.textContent = formatFlashcardTypingTime(stats.elapsedMs);
    if(accuracy) accuracy.textContent = `${stats.accuracy}%`;
    if(errors) errors.textContent = String(stats.mistakes);
  }

  function startFlashcardTypingClock(session){
    stopFlashcardTypingClock();
    if(!session || session.phase !== 'study' || getCurrentFlashcardType(session) !== 'typing') return;
    flashcardTypingClockTimer = window.setInterval(() => {
      if(hskState.flashcardSession !== session || session.phase !== 'study' || getCurrentFlashcardType(session) !== 'typing'){
        stopFlashcardTypingClock();
        return;
      }
      patchFlashcardTypingStats(session);
    }, 250);
  }

  function patchFlashcardTypingView(session, options = {}){
    const overlay = document.getElementById('hskFlashcardOverlay');
    if(!overlay || overlay.hidden || !session || getCurrentFlashcardType(session) !== 'typing') return false;
    const body = overlay.querySelector('#hskFlashcardBody');
    const input = body?.querySelector('[data-hsk-flashcard-typing-input]');
    const card = session.cards[session.index];
    const state = ensureFlashcardTypingState(session);
    if(!body || !input || !card || !state) return false;

    const prompt = body.querySelector('[data-hsk-flashcard-typing-prompt]');
    if(options.refreshCard && prompt){
      prompt.innerHTML = state.promptType === 'meaning-to-pinyin'
        ? `<small>NGHĨA VIỆT → PINYIN</small><strong class="hsk-flashcard-typing-prompt-text">${escapeHtml(card.meaningVi)}</strong>`
        : `<small>CHỮ TRUNG → PINYIN</small><strong class="hsk-flashcard-typing-prompt-hanzi">${escapeHtml(card.word)}</strong>`;
    }
    const progress = body.querySelector('[data-hsk-flashcard-typing-progress]');
    if(progress) progress.textContent = `${session.index + 1} / ${session.cards.length}`;

    const slots = body.querySelector('[data-hsk-flashcard-typing-slots]');
    if(slots) slots.innerHTML = renderFlashcardTypingSlots(state);

    const hintIndex = state.currentIndex;
    const hintVisible = Boolean(state.hintShownByIndex?.[hintIndex]);
    const feedback = body.querySelector('[data-hsk-flashcard-typing-feedback]');
    if(feedback){
      feedback.innerHTML = [
        state.currentWrongToken ? '<span class="is-error">Ký tự chưa đúng</span>' : '',
        hintVisible ? `<span class="is-hint">Gợi ý: ${escapeHtml(state.answerTokens[hintIndex] || '')}</span>` : '',
        state.isCompleting ? '<span class="is-success">✓ Chính xác</span>' : ''
      ].filter(Boolean).join('');
    }

    const typingCard = body.querySelector('[data-hsk-flashcard-typing-card]');
    if(typingCard) typingCard.classList.toggle('is-complete', Boolean(state.isCompleting));
    const result = body.querySelector('[data-hsk-flashcard-typing-result]');
    const controls = body.querySelector('[data-hsk-flashcard-typing-controls]');
    const continueHint = body.querySelector('[data-hsk-flashcard-typing-continue-hint]');
    if(result) result.hidden = !state.isCompleting;
    if(controls) controls.hidden = Boolean(state.isCompleting);
    if(continueHint) continueHint.hidden = !state.completionTapArmed;

    const setText = (selector, value) => {
      const node = body.querySelector(selector);
      if(node) node.textContent = value || '';
      return node;
    };
    setText('[data-hsk-flashcard-typing-result-word]', card.word);
    setText('[data-hsk-flashcard-typing-result-pinyin]', card.pinyin);
    const resultMeaning = setText('[data-hsk-flashcard-typing-result-meaning]', card.meaningVi);
    if(resultMeaning) resultMeaning.hidden = !card.meaningVi;
    setText('[data-hsk-flashcard-typing-answer-word]', card.word);
    setText('[data-hsk-flashcard-typing-answer-pinyin]', card.pinyin);
    const answerMeaning = setText('[data-hsk-flashcard-typing-answer-meaning]', card.meaningVi);
    if(answerMeaning) answerMeaning.hidden = !card.meaningVi;
    const answer = body.querySelector('[data-hsk-flashcard-typing-answer]');
    const reveal = body.querySelector('[data-hsk-flashcard-typing-reveal]');
    if(answer) answer.hidden = !state.answerVisible;
    if(reveal) reveal.setAttribute('aria-expanded', String(Boolean(state.answerVisible)));

    patchFlashcardTypingStats(session);
    input.value = '';
    input.readOnly = false;
    input.setAttribute('aria-disabled', 'false');
    if(options.keepFocus !== false && document.activeElement !== input){
      try{ input.focus({ preventScroll: true }); }catch(_err){ input.focus(); }
    }
    return true;
  }

  function countFlashcardHanCharacters(word){
    let count = 0;
    for(const character of Array.from(String(word || ''))){
      if(/\p{Script=Han}/u.test(character)) count += 1;
    }
    return count;
  }

  function getFlashcardTypingCompletionDelayMs(card){
    return countFlashcardHanCharacters(card?.word) > 5
      ? HSK_FLASHCARD_TYPING_LONG_COMPLETION_DELAY_MS
      : HSK_FLASHCARD_TYPING_SHORT_COMPLETION_DELAY_MS;
  }

  function resetFlashcardTypingCompletionTimer(session, state){
    if(!session || !state?.isCompleting) return;
    const delay = Number(state.completionDelayMs || getFlashcardTypingCompletionDelayMs(session.cards?.[session.index]));
    state.completionDelayMs = delay;
    state.completionDueAt = Date.now() + delay;
    scheduleFlashcardTypingNextCard(session, state.cardId, delay);
  }

  function armFlashcardTypingCompletionAfterKeyboardDismiss(session, state, input){
    if(!session || !state?.isCompleting || !input || document.activeElement !== input) return false;
    input.blur();
    state.keyboardDismissedAfterComplete = true;
    state.completionTapArmed = true;
    resetFlashcardTypingCompletionTimer(session, state);
    persistFlashcardSession();
    patchFlashcardTypingView(session, { keepFocus: false });
    return true;
  }

  function completeFlashcardTypingTransitionNow(){
    const session = hskState.flashcardSession;
    if(!session || session.phase !== 'study' || getCurrentFlashcardType(session) !== 'typing') return;
    const state = ensureFlashcardTypingState(session);
    if(!state?.isCompleting) return;
    state.completionPending = false;
    cancelFlashcardTypingCompletionTimer();
    moveFlashcard(1);
  }

  function scheduleFlashcardTypingNextCard(session, cardId, delayMs){
    cancelFlashcardTypingCompletionTimer();
    const delay = Number(delayMs || HSK_FLASHCARD_TYPING_SHORT_COMPLETION_DELAY_MS);
    flashcardTypingCompletionTimer = window.setTimeout(() => {
      flashcardTypingCompletionTimer = 0;
      const state = session?.typing;
      if(hskState.flashcardSession !== session || state?.cardId !== cardId || !state?.completionPending) return;
      completeFlashcardTypingTransitionNow();
    }, delay);
  }

  function submitFlashcardTypingInput(rawValue){
    const session = hskState.flashcardSession;
    if(!session || session.phase !== 'study' || getCurrentFlashcardType(session) !== 'typing') return;
    const state = ensureFlashcardTypingState(session);
    if(!state || state.isCompleting) return;
    const tokens = tokenizeFlashcardPinyin(rawValue);
    if(!tokens.length) return;
    for(const token of tokens){
      if(state.isCompleting) break;
      const expected = state.answerTokens[state.currentIndex];
      if(expected === undefined) break;
      if(isFlashcardTypingTokenAccepted(expected, token)){
        state.committedTokens[state.currentIndex] = token;
        state.currentWrongToken = '';
        state.correctInputs += 1;
        state.currentIndex += 1;
        if(state.currentIndex >= state.answerTokens.length){
          state.isCompleting = true;
          state.completedAt = Date.now();
          state.completionPending = true;
          state.completionTapArmed = false;
          state.keyboardDismissedAfterComplete = false;
          const card = session.cards[session.index];
          state.completionDelayMs = getFlashcardTypingCompletionDelayMs(card);
          state.completionDueAt = Date.now() + state.completionDelayMs;
          state.completionCardKey = String(card?.id || state.cardId || '');
          const rating = state.answerRevealUsed ? 'hard' : (state.totalMistakes > 0 ? 'review' : 'easy');
          const previousRating = session.ratings[card.id] || '';
          session.ratings[card.id] = rating;
          saveFlashcardRatingResult(card, rating, previousRating);
          persistFlashcardSession();
          patchFlashcardTypingView(session);
          scheduleFlashcardTypingNextCard(session, card.id, state.completionDelayMs);
          return;
        }
      }else{
        state.currentWrongToken = token;
        state.totalMistakes += 1;
        state.mistakesByIndex[state.currentIndex] = Number(state.mistakesByIndex[state.currentIndex] || 0) + 1;
        if(state.mistakesByIndex[state.currentIndex] >= 5){
          state.hintShownByIndex[state.currentIndex] = true;
        }
        break;
      }
    }
    persistFlashcardSession();
    patchFlashcardTypingView(session);
  }

  function deleteFlashcardTypingToken(){
    const session = hskState.flashcardSession;
    if(!session || getCurrentFlashcardType(session) !== 'typing') return;
    const state = ensureFlashcardTypingState(session);
    if(!state || state.isCompleting) return;
    if(state.currentWrongToken){
      state.currentWrongToken = '';
    }else if(state.currentIndex > 0){
      state.currentIndex -= 1;
      state.committedTokens.splice(state.currentIndex, 1);
    }
    persistFlashcardSession();
    patchFlashcardTypingView(session);
  }


  function getFlashcardSettings(){
    const defaults = {
      mode: 'flashcard',
      showPinyin: true,
      autoPlay: false,
      shuffle: false,
      showStroke: false,
      typingPromptType: 'hanzi-to-pinyin'
    };
    try{
      const saved = JSON.parse(window.localStorage?.getItem(HSK_FLASHCARD_SETTINGS_KEY) || '{}');
      return {
        mode: ['flashcard', 'reverse', 'listen', 'typing', 'mixed'].includes(saved.mode) ? saved.mode : defaults.mode,
        showPinyin: saved.showPinyin !== false,
        autoPlay: Boolean(saved.autoPlay),
        shuffle: Boolean(saved.shuffle),
        showStroke: Boolean(saved.showStroke),
        typingPromptType: ['hanzi-to-pinyin', 'meaning-to-pinyin', 'mixed'].includes(saved.typingPromptType) ? saved.typingPromptType : defaults.typingPromptType
      };
    }catch(_err){
      return defaults;
    }
  }

  function saveFlashcardSettings(settings){
    try{
      window.localStorage?.setItem(HSK_FLASHCARD_SETTINGS_KEY, JSON.stringify(settings));
    }catch(_err){
      // localStorage có thể bị chặn; cài đặt vẫn dùng được trong phiên hiện tại.
    }
  }

  function getSelectedFlashcardItems(){
    if(!['lessons', 'topics'].includes(hskState.groupMode) || !hskState.topicKey || hskState.topicKey === 'all'){
      return [];
    }
    const query = normalizeSearchText(hskState.query);
    return getFilteredByMode(hskState.currentItems.filter(item => itemMatchesQuery(item, query)))
      .map((item, index) => ({
        id: `${hskState.sourceKey}:${hskState.currentLevel}:${hskState.topicKey}:${String(item?.word || item?.simplified || index)}`,
        word: String(item?.word || item?.simplified || '').trim(),
        pinyin: formatPinyin(item?.pinyin),
        meaningVi: String(item?.meaningVi || '').trim(),
        sourceItem: item
      }))
      .filter(card => card.word);
  }

  function ensureFlashcardLaunchButton(){
    if(!hskStatus?.parentElement) return null;
    let wrap = document.getElementById('hskFlashcardLaunchWrap');
    if(wrap) return wrap;
    wrap = document.createElement('div');
    wrap.id = 'hskFlashcardLaunchWrap';
    wrap.className = 'hsk-flashcard-launch-wrap';
    hskStatus.insertAdjacentElement('afterend', wrap);
    return wrap;
  }

  function renderFlashcardLaunchButton(cards = []){
    const wrap = ensureFlashcardLaunchButton();
    if(!wrap) return;
    const canStudy = cards.length > 0 && ['lessons', 'topics'].includes(hskState.groupMode) && hskState.topicKey !== 'all';
    const stats = getFlashcardStats();
    const showStats = stats.total > 0;
    wrap.hidden = !canStudy && !showStats;
    wrap.innerHTML = `
      ${canStudy ? `
        <button type="button" class="hsk-flashcard-launch" data-hsk-flashcard-open>
          <span aria-hidden="true">🎓</span>
          <span>Học Flashcard</span>
          <small>${cards.length.toLocaleString('vi-VN')} thẻ</small>
        </button>
      ` : ''}
      ${showStats ? `
        <button type="button" class="hsk-flashcard-launch hsk-flashcard-launch--stats" data-hsk-flashcard-stats>
          <span aria-hidden="true">📊</span>
          <span>Thống kê</span>
          <small>${stats.review + stats.hard} cần ôn</small>
        </button>
      ` : ''}
    `;
  }

  function getFlashcardSectionTitle(){
    return getSelectedLearningLabel() || `${getHskSourceLabel()} · ${getHskLevelLabel(hskState.currentLevel)}`;
  }

  function ensureFlashcardOverlay(){
    let overlay = document.getElementById('hskFlashcardOverlay');
    if(overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'hskFlashcardOverlay';
    overlay.className = 'hsk-flashcard-overlay';
    overlay.hidden = true;
    overlay.innerHTML = '<section class="hsk-flashcard-shell" role="dialog" aria-modal="true" aria-label="Học Flashcard"><div id="hskFlashcardBody"></div></section>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', event => {
      const session = hskState.flashcardSession;
      const state = session && getCurrentFlashcardType(session) === 'typing'
        ? ensureFlashcardTypingState(session)
        : null;
      const typingInput = overlay.querySelector('[data-hsk-flashcard-typing-input]');

      if(event.target.closest('[data-hsk-flashcard-typing-continue]')){
        if(state?.isCompleting){
          event.preventDefault();
          completeFlashcardTypingTransitionNow();
        }
        return;
      }

      const completeResult = event.target.closest('[data-hsk-flashcard-typing-complete]');
      if(completeResult && state?.isCompleting && !event.target.closest('button, a, input, select, textarea')){
        event.preventDefault();
        if(armFlashcardTypingCompletionAfterKeyboardDismiss(session, state, typingInput)) return;
        if(state.completionTapArmed) completeFlashcardTypingTransitionNow();
        return;
      }

      const typingCard = event.target.closest('[data-hsk-flashcard-typing-card]');
      if(typingCard && state?.isCompleting && !event.target.closest('button, a, input, select, textarea')){
        if(armFlashcardTypingCompletionAfterKeyboardDismiss(session, state, typingInput)){
          event.preventDefault();
          return;
        }
      }

      if(event.target === overlay){
        if(state?.isCompleting && armFlashcardTypingCompletionAfterKeyboardDismiss(session, state, typingInput)) return;
        closeFlashcardOverlay();
      }
    });
    overlay.addEventListener('input', event => {
      const input = event.target.closest('[data-hsk-flashcard-typing-input]');
      if(!input) return;
      const value = input.value;
      input.value = '';
      submitFlashcardTypingInput(value);
    });
    overlay.addEventListener('keydown', event => {
      const input = event.target.closest('[data-hsk-flashcard-typing-input]');
      if(!input) return;
      if(event.key === 'Backspace' && !input.value){
        event.preventDefault();
        deleteFlashcardTypingToken();
      }
    });
    overlay.addEventListener('touchstart', event => {
      const card = event.target.closest('[data-hsk-flashcard-flip]');
      if(!card || event.touches.length !== 1 || event.target.closest('button, input, .hsk-flashcard-stroke-section, .hsk-flashcard-typing-card')){
        flashcardTouchStart = null;
        return;
      }
      const touch = event.touches[0];
      flashcardTouchStart = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    }, { passive: true });
    overlay.addEventListener('touchend', event => {
      if(!flashcardTouchStart || event.changedTouches.length !== 1){
        flashcardTouchStart = null;
        return;
      }
      const touch = event.changedTouches[0];
      const dx = touch.clientX - flashcardTouchStart.x;
      const dy = touch.clientY - flashcardTouchStart.y;
      const elapsed = Date.now() - flashcardTouchStart.time;
      flashcardTouchStart = null;
      if(elapsed > 900 || Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
      flashcardSuppressClickUntil = Date.now() + 400;
      moveFlashcard(dx < 0 ? 1 : -1);
    }, { passive: true });
    return overlay;
  }

  function closeFlashcardOverlay(){
    cancelFlashcardTypingCompletionTimer();
    stopFlashcardTypingClock();
    const overlay = document.getElementById('hskFlashcardOverlay');
    if(!overlay) return;
    overlay.hidden = true;
    document.body.classList.remove('hsk-flashcard-open');
    window.speechSynthesis?.cancel?.();
    cleanupFlashcardStrokeWriters();
    hskState.flashcardStatsOpen = false;
    if(hskState.flashcardSession){
      clearPersistedFlashcardSession();
    }
    const selectedCards = (hskState.topicKey && hskState.topicKey !== 'all') ? getSelectedFlashcardItems() : [];
    renderFlashcardLaunchButton(selectedCards);
  }

  function openFlashcardSetup(){
    hskState.flashcardStatsOpen = false;
    const cards = getSelectedFlashcardItems();
    if(!cards.length) return;
    hskState.flashcardSession = {
      phase: 'setup',
      title: getFlashcardSectionTitle(),
      cards,
      settings: getFlashcardSettings(),
      index: 0,
      flipped: false,
      ratings: {},
      mixedTypes: [],
      origin: hskState.groupMode === 'topics' ? 'topic' : 'lesson',
      contextKey: `${hskState.sourceKey}:${hskState.currentLevel}:${hskState.groupMode}:${hskState.topicKey}`,
      contextLabel: getSelectedLearningLabel() || '',
      typing: null,
      typingPromptTypes: []
    };
    renderFlashcardOverlay();
  }

  function getFlashcardModeLabel(mode){
    return ({
      flashcard: 'Flashcard',
      reverse: 'Đảo ngược',
      listen: 'Nghe',
      typing: 'Gõ Pinyin',
      mixed: 'Hỗn hợp'
    })[mode] || 'Flashcard';
  }

  function renderFlashcardSetup(session){
    const settings = session.settings;
    const contextNoun = session.origin === 'topic' ? 'chủ đề' : (session.origin === 'lesson' ? 'bài' : 'bộ thẻ');
    const backLabel = session.origin === 'topic' ? '← Quay lại chủ đề' : (session.origin === 'lesson' ? '← Quay lại bài' : '← Quay lại Thẻ');
    const modes = [
      ['flashcard', 'Flashcard', 'Hán tự → lật xem pinyin và nghĩa'],
      ['reverse', 'Đảo ngược', 'Nghĩa Việt → đoán chữ Hán'],
      ['listen', 'Nghe', 'Nghe phát âm → nhớ lại từ và nghĩa'],
      ['typing', 'Gõ Pinyin', 'Nhập tuần tự từng ký tự pinyin'],
      ['mixed', 'Hỗn hợp', 'Flashcard → Đảo ngược → Nghe']
    ];
    return `
      <header class="hsk-flashcard-header">
        <button type="button" class="hsk-flashcard-back" data-hsk-flashcard-close>${backLabel}</button>
        <button type="button" class="hsk-flashcard-close" data-hsk-flashcard-close aria-label="Đóng">×</button>
      </header>
      <div class="hsk-flashcard-setup">
        <div class="hsk-flashcard-title-block">
          <span>HỌC FLASHCARD</span>
          <h2>${escapeHtml(session.title)}</h2>
          <p>${session.cards.length.toLocaleString('vi-VN')} thẻ trong ${contextNoun}</p>
        </div>
        <section class="hsk-flashcard-panel">
          <h3>Chọn cách học</h3>
          <div class="hsk-flashcard-mode-grid">
            ${modes.map(([key, title, desc]) => `
              <button type="button" class="hsk-flashcard-mode ${settings.mode === key ? 'active' : ''}" data-hsk-flashcard-mode="${key}" aria-pressed="${settings.mode === key}">
                <b>${title}</b><span>${desc}</span>
              </button>
            `).join('')}
          </div>
        </section>
        ${settings.mode === 'typing' ? `
          <section class="hsk-flashcard-panel hsk-flashcard-typing-setup">
            <h3>Kiểu câu hỏi</h3>
            <div class="hsk-flashcard-typing-prompt-grid">
              ${[
                ['hanzi-to-pinyin', 'Chữ Trung → Pinyin'],
                ['meaning-to-pinyin', 'Nghĩa Việt → Pinyin'],
                ['mixed', 'Hỗn hợp hai kiểu']
              ].map(([key, label]) => `<button type="button" class="${settings.typingPromptType === key ? 'active' : ''}" data-hsk-flashcard-typing-prompt="${key}">${label}</button>`).join('')}
            </div>
            <p class="hsk-flashcard-typing-eligible">${getTypingEligibleCards(session.cards, settings.typingPromptType).length.toLocaleString('vi-VN')} thẻ đủ pinyin để luyện.</p>
          </section>
        ` : ''}
        <section class="hsk-flashcard-panel hsk-flashcard-options">
          <label><span><b>Hiện pinyin</b><small>Hiển thị pinyin sau khi mở đáp án.</small></span><input type="checkbox" data-hsk-flashcard-option="showPinyin" ${settings.showPinyin ? 'checked' : ''}></label>
          <label><span><b>Tự phát âm</b><small>Tự đọc theo chế độ học hiện tại.</small></span><input type="checkbox" data-hsk-flashcard-option="autoPlay" ${settings.autoPlay ? 'checked' : ''}></label>
          <label><span><b>Xáo trộn thứ tự</b><small>Trộn bộ thẻ một lần khi bắt đầu.</small></span><input type="checkbox" data-hsk-flashcard-option="shuffle" ${settings.shuffle ? 'checked' : ''}></label>
          <label><span><b>Hiện cách viết từng chữ</b><small>Hiển thị ô thứ tự nét ở mặt đáp án.</small></span><input type="checkbox" data-hsk-flashcard-option="showStroke" ${settings.showStroke ? 'checked' : ''}></label>
        </section>
        <button type="button" class="hsk-flashcard-start" data-hsk-flashcard-start>Bắt đầu học · ${(settings.mode === 'typing' ? getTypingEligibleCards(session.cards, settings.typingPromptType).length : session.cards.length).toLocaleString('vi-VN')} thẻ</button>
      </div>
    `;
  }

  function shuffleCards(cards){
    const copy = [...cards];
    for(let i = copy.length - 1; i > 0; i -= 1){
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function startFlashcardSession(){
    const session = hskState.flashcardSession;
    if(!session) return;
    saveFlashcardSettings(session.settings);
    session.phase = 'study';
    if(session.settings.mode === 'typing'){
      session.cards = getTypingEligibleCards(session.cards, session.settings.typingPromptType);
      if(!session.cards.length){
        session.phase = 'setup';
        session.typing = null;
        renderFlashcardOverlay();
        return;
      }
    }
    session.cards = session.settings.shuffle ? shuffleCards(session.cards) : [...session.cards];
    session.index = 0;
    session.flipped = false;
    session.strokeExpanded = false;
    session.ratings = {};
    session.mixedTypes = session.cards.map((_, index) => ['flashcard', 'reverse', 'listen'][index % 3]);
    session.typingPromptTypes = session.cards.map((card, index) => session.settings.typingPromptType === 'mixed' && card.meaningVi && index % 2 === 1 ? 'meaning-to-pinyin' : 'hanzi-to-pinyin');
    session.typing = session.settings.mode === 'typing' ? createFlashcardTypingState(session, session.cards[0]) : null;
    persistFlashcardSession();
    renderFlashcardOverlay();
    maybeAutoPlayFlashcard();
  }

  function getCurrentFlashcardType(session){
    if(session.settings.mode !== 'mixed') return session.settings.mode;
    return session.mixedTypes[session.index] || 'flashcard';
  }

  function maybeAutoPlayFlashcard(){
    const session = hskState.flashcardSession;
    if(!session || session.phase !== 'study') return;
    const card = session.cards[session.index];
    const type = getCurrentFlashcardType(session);
    if(type === 'listen' || session.settings.autoPlay){
      window.setTimeout(() => speakChar(card?.word || ''), 100);
    }
  }

  function cleanupFlashcardStrokeWriters(){
    flashcardStrokeRenderId += 1;
    flashcardStrokePlayId += 1;
    flashcardStrokeWriters = [];
  }

  function getFlashcardStrokeChars(word){
    return getHanziChars(String(word || ''));
  }

  function renderFlashcardStrokeSection(session, card){
    if(!session.settings?.showStroke || !session.flipped) return '';
    const chars = getFlashcardStrokeChars(card.word);
    if(!chars.length){
      return '<section class="hsk-flashcard-stroke-section" data-hsk-flashcard-stroke-area><p class="hsk-flashcard-stroke-empty">Chưa có chữ Hán để hiển thị cách viết.</p></section>';
    }
    const expanded = Boolean(session.strokeExpanded);
    const visibleChars = expanded ? chars : chars.slice(0, 4);
    const remaining = Math.max(0, chars.length - visibleChars.length);
    return `
      <section class="hsk-flashcard-stroke-section" data-hsk-flashcard-stroke-area aria-label="Cách viết từng chữ">
        <div class="hsk-flashcard-stroke-header">
          <b>Cách viết từng chữ</b>
          <button type="button" data-hsk-flashcard-stroke-play-all>▶ Phát tất cả</button>
        </div>
        <div class="hsk-flashcard-stroke-grid" data-visible-count="${visibleChars.length}" data-last-row-single="${visibleChars.length % 2 === 1 ? 'true' : 'false'}">
          ${visibleChars.map((char, index) => `
            <article class="hsk-flashcard-stroke-item" data-stroke-index="${index}">
              <div class="hsk-flashcard-stroke-canvas has-grid" id="hskFlashcardStroke-${flashcardStrokeRenderId}-${index}" data-stroke-char="${escapeHtml(char)}">
                <span class="hsk-flashcard-stroke-placeholder">${escapeHtml(char)}</span>
              </div>
              <div class="hsk-flashcard-stroke-status" data-hsk-flashcard-stroke-status="${index}" aria-live="polite">Sẵn sàng</div>
              <div class="hsk-flashcard-stroke-toolbar" role="group" aria-label="Công cụ chữ ${escapeHtml(char)}">
                <button type="button" data-hsk-flashcard-stroke-play="${index}" aria-label="Phát nét chữ ${escapeHtml(char)}" title="Phát nét">▶</button>
                <button type="button" data-hsk-flashcard-stroke-quiz="${index}" aria-label="Luyện viết chữ ${escapeHtml(char)}" title="Luyện viết">✍</button>
                <button type="button" data-hsk-flashcard-stroke-outline="${index}" aria-label="Bật hoặc tắt viền chữ ${escapeHtml(char)}" title="Không viền">□</button>
                <button type="button" data-hsk-flashcard-stroke-reset="${index}" aria-label="Viết lại chữ ${escapeHtml(char)}" title="Viết lại">↺</button>
              </div>
            </article>
          `).join('')}
        </div>
        ${remaining ? `<button type="button" class="hsk-flashcard-stroke-more" data-hsk-flashcard-stroke-expand>Hiện thêm ${remaining} chữ</button>` : (expanded && chars.length > 4 ? '<button type="button" class="hsk-flashcard-stroke-more" data-hsk-flashcard-stroke-collapse>Thu gọn</button>' : '')}
      </section>
    `;
  }

  function mountFlashcardStrokeWriters(){
    cleanupFlashcardStrokeWriters();
    const session = hskState.flashcardSession;
    if(!session || session.phase !== 'study' || !session.flipped || !session.settings?.showStroke) return;
    if(!window.HanziWriter) {
      document.querySelectorAll('.hsk-flashcard-stroke-canvas').forEach(target => {
        target.innerHTML = '<span class="hsk-flashcard-stroke-error">Không thể tải trình hiển thị nét.</span>';
      });
      return;
    }
    const currentRender = flashcardStrokeRenderId;
    const settings = getSettings();
    const targets = [...document.querySelectorAll('.hsk-flashcard-stroke-canvas[data-stroke-char]')];
    flashcardStrokeWriters = targets.map((target, index) => {
      const char = target.dataset.strokeChar || '';
      const size = Math.max(96, Math.min(132, Math.floor(target.getBoundingClientRect().width || 116)));
      target.innerHTML = '';
      try{
        const writer = HanziWriter.create(target.id, char, {
          ...createWriterOptions(size, settings),
          width: size,
          height: size,
          padding: 8,
          showCharacter: true,
          onLoadCharDataError: () => {
            if(currentRender !== flashcardStrokeRenderId) return;
            target.innerHTML = `<span class="hsk-flashcard-stroke-error"><b>${escapeHtml(char)}</b><small>Chưa có dữ liệu nét</small></span>`;
            const item = flashcardStrokeWriters[index];
            if(item){
              item.available = false;
              item.mode = 'error';
            }
            setFlashcardStrokeControlsDisabled(index, true);
            setFlashcardStrokeStatus(index, 'Thiếu dữ liệu nét', 'error');
          }
        });
        return { char, writer, target, available: true, mode: 'view', outlineHidden: false };
      }catch(err){
        console.warn('Cannot create flashcard stroke writer:', char, err);
        target.innerHTML = `<span class="hsk-flashcard-stroke-error"><b>${escapeHtml(char)}</b><small>Chưa có dữ liệu nét</small></span>`;
        return { char, writer: null, target, available: false, mode: 'error', outlineHidden: false };
      }
    });
  }

  function getFlashcardStrokeItem(index){
    return flashcardStrokeWriters[Number(index)] || null;
  }

  function setFlashcardStrokeStatus(index, message, tone = ''){
    const status = document.querySelector(`[data-hsk-flashcard-stroke-status="${Number(index)}"]`);
    if(!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function setFlashcardStrokeControlsDisabled(index, disabled){
    document.querySelectorAll(`.hsk-flashcard-stroke-item[data-stroke-index="${Number(index)}"] .hsk-flashcard-stroke-toolbar button`).forEach(button => {
      button.disabled = Boolean(disabled);
    });
  }

  function updateFlashcardStrokeOutlineButton(index, hidden){
    const button = document.querySelector(`[data-hsk-flashcard-stroke-outline="${Number(index)}"]`);
    if(!button) return;
    button.classList.toggle('active', Boolean(hidden));
    button.setAttribute('aria-pressed', hidden ? 'true' : 'false');
    button.title = hidden ? 'Hiện viền' : 'Không viền';
  }

  function playFlashcardStroke(index){
    const item = getFlashcardStrokeItem(index);
    if(!item?.writer || item.available === false) return;
    try{
      if(typeof item.writer.cancelQuiz === 'function') item.writer.cancelQuiz();
      item.mode = 'view';
      item.writer.hideCharacter();
      if(item.outlineHidden) item.writer.hideOutline();
      else item.writer.showOutline();
      setFlashcardStrokeStatus(index, 'Đang phát nét…');
      item.writer.animateCharacter({
        onComplete: () => setFlashcardStrokeStatus(index, 'Sẵn sàng')
      });
    }catch(err){
      console.warn('Cannot animate flashcard stroke:', err);
      setFlashcardStrokeStatus(index, 'Không thể phát nét', 'error');
    }
  }

  function startFlashcardStrokeQuiz(index, { reset = false } = {}){
    const item = getFlashcardStrokeItem(index);
    if(!item?.writer || item.available === false) return;
    try{
      if(typeof item.writer.cancelQuiz === 'function') item.writer.cancelQuiz();
      item.mode = 'quiz';
      item.writer.hideCharacter();
      if(item.outlineHidden) item.writer.hideOutline();
      else item.writer.showOutline();
      setFlashcardStrokeStatus(index, reset ? 'Viết lại từ nét đầu' : 'Đang luyện viết');
      item.writer.quiz({
        showHintAfterMisses: getSettings().showHintAfterMisses,
        onMistake: () => setFlashcardStrokeStatus(index, 'Chưa đúng, thử lại', 'error'),
        onCorrectStroke: () => setFlashcardStrokeStatus(index, 'Đúng nét', 'success'),
        onComplete: () => {
          item.mode = 'complete';
          setFlashcardStrokeStatus(index, '✓ Hoàn thành', 'success');
        }
      });
    }catch(err){
      console.warn('Cannot start flashcard stroke quiz:', err);
      setFlashcardStrokeStatus(index, 'Không thể luyện viết', 'error');
    }
  }

  function toggleFlashcardStrokeOutline(index){
    const item = getFlashcardStrokeItem(index);
    if(!item?.writer || item.available === false) return;
    item.outlineHidden = !item.outlineHidden;
    try{
      if(typeof item.writer.cancelQuiz === 'function') item.writer.cancelQuiz();
      item.writer.hideCharacter();
      if(item.outlineHidden) item.writer.hideOutline();
      else item.writer.showOutline();
      updateFlashcardStrokeOutlineButton(index, item.outlineHidden);

      // Nút Không viền là một chế độ luyện viết, không phải chế độ chỉ xem.
      item.mode = 'quiz';
      setFlashcardStrokeStatus(index, item.outlineHidden ? 'Luyện viết không viền' : 'Luyện viết có viền');
      item.writer.quiz({
        showHintAfterMisses: getSettings().showHintAfterMisses,
        onMistake: () => setFlashcardStrokeStatus(index, 'Chưa đúng, thử lại', 'error'),
        onCorrectStroke: () => setFlashcardStrokeStatus(index, 'Đúng nét', 'success'),
        onComplete: () => {
          item.mode = 'complete';
          setFlashcardStrokeStatus(index, '✓ Hoàn thành', 'success');
        }
      });
    }catch(err){
      console.warn('Cannot toggle flashcard stroke outline:', err);
      setFlashcardStrokeStatus(index, 'Không thể đổi chế độ viền', 'error');
    }
  }

  function resetFlashcardStrokeQuiz(index){
    startFlashcardStrokeQuiz(index, { reset: true });
  }

  function playAllFlashcardStrokes(){
    const playId = ++flashcardStrokePlayId;
    const available = flashcardStrokeWriters.filter(item => item?.writer && item.available !== false);
    const button = document.querySelector('[data-hsk-flashcard-stroke-play-all]');
    if(button){ button.disabled = true; button.textContent = 'Đang phát…'; }
    const playNext = index => {
      if(playId !== flashcardStrokePlayId) return;
      const item = available[index];
      if(!item){
        if(button?.isConnected){ button.disabled = false; button.textContent = '▶ Phát tất cả'; }
        return;
      }
      try{
        if(typeof item.writer.cancelQuiz === 'function') item.writer.cancelQuiz();
        item.mode = 'view';
        item.writer.hideCharacter();
        if(item.outlineHidden) item.writer.hideOutline();
        else item.writer.showOutline();
        item.writer.animateCharacter({ onComplete: () => playNext(index + 1) });
      }catch(_err){
        playNext(index + 1);
      }
    };
    playNext(0);
  }

  function renderFlashcardFace(session, card, type){
    const answerVisible = session.flipped;
    if(type === 'listen' && !answerVisible){
      return `
        <div class="hsk-flashcard-listen-front">
          <button type="button" class="hsk-flashcard-listen-button" data-hsk-flashcard-speak aria-label="Phát âm">🔊</button>
          <h3>Nghe và nhớ lại từ</h3>
          <p>Bấm phát lại nếu cần, sau đó xem đáp án.</p>
        </div>
      `;
    }
    if(type === 'reverse' && !answerVisible){
      return `
        <div class="hsk-flashcard-front hsk-flashcard-front--reverse">
          <small>NGHĨA TIẾNG VIỆT</small>
          <strong>${escapeHtml(card.meaningVi || 'Chưa có nghĩa tiếng Việt')}</strong>
          <p>Bấm để xem chữ Hán</p>
        </div>
      `;
    }
    if(!answerVisible){
      return `
        <div class="hsk-flashcard-front hsk-flashcard-front--hanzi">
          <button type="button" class="hsk-flashcard-inline-speaker" data-hsk-flashcard-speak aria-label="Nghe ${escapeHtml(card.word)}">🔊</button>
          <strong>${escapeHtml(card.word)}</strong>
          <p>Bấm để lật thẻ</p>
        </div>
      `;
    }
    return `
      <div class="hsk-flashcard-answer">
        <button type="button" class="hsk-flashcard-inline-speaker" data-hsk-flashcard-speak aria-label="Nghe ${escapeHtml(card.word)}">🔊</button>
        <strong>${escapeHtml(card.word)}</strong>
        ${session.settings.showPinyin && card.pinyin ? `<span>${escapeHtml(card.pinyin)}</span>` : ''}
        <p>${escapeHtml(card.meaningVi || 'Chưa có nghĩa tiếng Việt')}</p>
        ${renderFlashcardStrokeSection(session, card)}
      </div>
    `;
  }

  function renderFlashcardStudy(session){
    const card = session.cards[session.index];
    const type = getCurrentFlashcardType(session);
    if(type === 'typing') return renderFlashcardTypingStudy(session, card);
    const rating = session.ratings[card.id] || '';
    return `
      <header class="hsk-flashcard-header">
        <button type="button" class="hsk-flashcard-back" data-hsk-flashcard-to-setup>← Thiết lập</button>
        <span class="hsk-flashcard-progress">${session.index + 1} / ${session.cards.length}</span>
        <button type="button" class="hsk-flashcard-close" data-hsk-flashcard-close aria-label="Đóng">×</button>
      </header>
      <div class="hsk-flashcard-study">
        <div class="hsk-flashcard-study-meta"><b>${escapeHtml(getFlashcardModeLabel(type))}</b><span>${escapeHtml(session.title)}</span></div>
        <div class="hsk-flashcard-card ${session.flipped ? 'is-flipped' : ''}" data-hsk-flashcard-flip role="button" tabindex="0" aria-label="Thẻ flashcard, bấm để lật">
          ${renderFlashcardFace(session, card, type)}
        </div>
        ${session.flipped ? `
          <div class="hsk-flashcard-rating" role="group" aria-label="Tự đánh giá">
            ${[['easy','Dễ'],['review','Ôn'],['hard','Khó']].map(([key,label]) => `<button type="button" class="${rating === key ? 'active' : ''}" data-hsk-flashcard-rate="${key}">${label}</button>`).join('')}
          </div>
        ` : `<button type="button" class="hsk-flashcard-reveal" data-hsk-flashcard-flip>Xem đáp án</button>`}
        <div class="hsk-flashcard-nav">
          <button type="button" data-hsk-flashcard-prev ${session.index === 0 ? 'disabled' : ''}>← Trước</button>
          <button type="button" data-hsk-flashcard-next>${session.index === session.cards.length - 1 ? 'Hoàn thành' : 'Tiếp →'}</button>
        </div>
      </div>
    `;
  }

  function renderFlashcardComplete(session){
    const values = Object.values(session.ratings);
    const counts = {
      easy: values.filter(value => value === 'easy').length,
      review: values.filter(value => value === 'review').length,
      hard: values.filter(value => value === 'hard').length
    };
    return `
      <header class="hsk-flashcard-header">
        <button type="button" class="hsk-flashcard-back" data-hsk-flashcard-close>← Quay về bài</button>
        <button type="button" class="hsk-flashcard-close" data-hsk-flashcard-close aria-label="Đóng">×</button>
      </header>
      <div class="hsk-flashcard-complete">
        <span>HOÀN THÀNH</span>
        <h2>${escapeHtml(session.title)}</h2>
        <p>Đã xem ${session.cards.length.toLocaleString('vi-VN')} thẻ</p>
        <div class="hsk-flashcard-result-grid">
          <div><b>${counts.easy}</b><span>Dễ</span></div>
          <div><b>${counts.review}</b><span>Ôn</span></div>
          <div><b>${counts.hard}</b><span>Khó</span></div>
        </div>
        <button type="button" class="hsk-flashcard-start" data-hsk-flashcard-restart>Học lại toàn bộ</button>
        ${(counts.review + counts.hard) > 0 ? `<button type="button" class="hsk-flashcard-secondary" data-hsk-flashcard-review>Ôn lại ${counts.review + counts.hard} thẻ</button>` : ''}
        <button type="button" class="hsk-flashcard-secondary" data-hsk-flashcard-close>Quay về bài</button>
      </div>
    `;
  }


  function formatFlashcardStudyDate(value){
    if(!value) return '';
    const date = new Date(value);
    if(Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('vi-VN');
  }

  function renderFlashcardStatsList(entries, emptyText){
    if(!entries.length){
      return `<p class="hsk-flashcard-stats-empty">${escapeHtml(emptyText)}</p>`;
    }
    return `
      <div class="hsk-flashcard-stats-list">
        ${entries.map(entry => `
          <article class="hsk-flashcard-stats-card">
            <div class="hsk-flashcard-stats-word">
              <strong>${escapeHtml(entry.word)}</strong>
              ${entry.pinyin ? `<span>${escapeHtml(entry.pinyin)}</span>` : ''}
              ${entry.meaningVi ? `<p>${escapeHtml(entry.meaningVi)}</p>` : ''}
            </div>
            <div class="hsk-flashcard-stats-meta">
              <small>${escapeHtml(formatFlashcardStudyDate(entry.lastStudiedAt))}</small>
              <button type="button" data-hsk-flashcard-speak-word="${escapeHtml(entry.word)}" aria-label="Nghe ${escapeHtml(entry.word)}">🔊</button>
            </div>
          </article>
        `).join('')}
      </div>
    `;
  }

  function renderFlashcardStats(){
    const stats = getFlashcardStats();
    return `
      <header class="hsk-flashcard-header">
        <button type="button" class="hsk-flashcard-back" data-hsk-flashcard-close>← Quay về bài</button>
        <button type="button" class="hsk-flashcard-close" data-hsk-flashcard-close aria-label="Đóng">×</button>
      </header>
      <div class="hsk-flashcard-stats">
        <div class="hsk-flashcard-title-block">
          <span>THỐNG KÊ FLASHCARD</span>
          <h2>${stats.total.toLocaleString('vi-VN')} thẻ đã học</h2>
          <p>Tính theo đánh giá gần nhất của mỗi thẻ.</p>
        </div>
        <div class="hsk-flashcard-result-grid hsk-flashcard-result-grid--stats">
          <div><b>${stats.easy}</b><span>Dễ</span></div>
          <div><b>${stats.review}</b><span>Ôn</span></div>
          <div><b>${stats.hard}</b><span>Khó</span></div>
        </div>
        <div class="hsk-flashcard-stats-actions">
          <button type="button" class="hsk-flashcard-secondary" data-hsk-flashcard-study-group="review" ${stats.review ? '' : 'disabled'}>Học ${stats.review} thẻ Ôn</button>
          <button type="button" class="hsk-flashcard-secondary" data-hsk-flashcard-study-group="hard" ${stats.hard ? '' : 'disabled'}>Học ${stats.hard} thẻ Khó</button>
          <button type="button" class="hsk-flashcard-start" data-hsk-flashcard-study-group="review-hard" ${(stats.review + stats.hard) ? '' : 'disabled'}>Học Ôn + Khó · ${stats.review + stats.hard} thẻ</button>
          <button type="button" class="hsk-flashcard-secondary hsk-flashcard-danger" data-flashcard-reset-history>Xóa lịch sử</button>
        </div>
        <section class="hsk-flashcard-stats-section hsk-flashcard-stats-section--review">
          <div class="hsk-flashcard-stats-section-head"><h3>Cần Ôn</h3><span>${stats.review} thẻ</span></div>
          ${renderFlashcardStatsList(stats.groups.review, 'Chưa có thẻ nào được đánh dấu Ôn.')}
        </section>
        <section class="hsk-flashcard-stats-section hsk-flashcard-stats-section--hard">
          <div class="hsk-flashcard-stats-section-head"><h3>Thẻ Khó</h3><span>${stats.hard} thẻ</span></div>
          ${renderFlashcardStatsList(stats.groups.hard, 'Chưa có thẻ nào được đánh dấu Khó.')}
        </section>
      </div>
    `;
  }

  function renderFlashcardOverlay(){
    cleanupFlashcardStrokeWriters();
    const overlay = ensureFlashcardOverlay();
    const body = overlay.querySelector('#hskFlashcardBody');
    if(!body) return;
    if(hskState.flashcardStatsOpen){
      body.innerHTML = renderFlashcardStats();
      overlay.hidden = false;
      document.body.classList.add('hsk-flashcard-open');
      return;
    }
    const session = hskState.flashcardSession;
    if(!session) return;
    body.innerHTML = session.phase === 'setup'
      ? renderFlashcardSetup(session)
      : (session.phase === 'complete' ? renderFlashcardComplete(session) : renderFlashcardStudy(session));
    overlay.hidden = false;
    document.body.classList.add('hsk-flashcard-open');
    persistFlashcardSession();
    window.requestAnimationFrame(() => {
      mountFlashcardStrokeWriters();
      const typingInput = body.querySelector('[data-hsk-flashcard-typing-input]');
      if(typingInput && !typingInput.readOnly){
        try{ typingInput.focus({ preventScroll: true }); }catch(_err){ typingInput.focus(); }
      }
      if(session.phase === 'study' && getCurrentFlashcardType(session) === 'typing') startFlashcardTypingClock(session);
      else stopFlashcardTypingClock();
    });
  }

  function moveFlashcard(step){
    const session = hskState.flashcardSession;
    if(!session || session.phase !== 'study') return;
    cancelFlashcardTypingCompletionTimer();
    const wasTyping = getCurrentFlashcardType(session) === 'typing';
    const next = session.index + step;
    if(next < 0) return;
    if(next >= session.cards.length){
      stopFlashcardTypingClock();
      session.phase = 'complete';
      renderFlashcardOverlay();
      return;
    }
    session.index = next;
    session.flipped = false;
    session.strokeExpanded = false;
    session.typing = getCurrentFlashcardType(session) === 'typing'
      ? createFlashcardTypingState(session, session.cards[next])
      : null;
    persistFlashcardSession();
    if(wasTyping && getCurrentFlashcardType(session) === 'typing' && patchFlashcardTypingView(session, { refreshCard: true })){
      startFlashcardTypingClock(session);
    }else{
      renderFlashcardOverlay();
    }
    maybeAutoPlayFlashcard();
  }

  function renderHskList(){
    if(hskState.sourceKey === 'dialogue301'){
      renderDialogue301Curriculum();
      return;
    }
    setDialogue301CurriculumMode(false);
    renderHskFilters();
    hskList.classList.remove('hsk-list--vocab-list', 'hsk-list--vocab-grid');
    if(hskState.groupMode === 'grammar'){
      renderFlashcardLaunchButton([]);
      renderHskVocabViewControls(false);
      renderGrammarList();
      return;
    }
    hskList.classList.remove('hsk-list--grammar');
    const query = normalizeSearchText(hskState.query);
    const searched = hskState.currentItems.filter(item => itemMatchesQuery(item, query));
    const filtered = getFilteredByMode(searched);
    renderFlashcardLaunchButton((hskState.topicKey && hskState.topicKey !== 'all') ? getSelectedFlashcardItems() : []);
    const level = Number(hskState.currentLevel) || 1;
    const groupLabel = getCharGroupLabel(hskState.groupMode);
    const selectedLearningLabel = hskState.topicKey && hskState.topicKey !== 'all' ? getSelectedLearningLabel() : '';
    const baseCount = hskState.currentItems.filter(itemBelongsToSelectedSource).length.toLocaleString('vi-VN');
    const foundCount = filtered.length.toLocaleString('vi-VN');
    const searchText = query ? ` · tìm thấy ${foundCount} / ${baseCount}` : ` · ${foundCount} / ${baseCount}`;
    const modeLabel = selectedLearningLabel ? '' : ` · ${groupLabel}`;
    hskStatus.textContent = `${escapeHtml(getHskSourceLabel())} · ${escapeHtml(getHskLevelLabel(level))}${selectedLearningLabel ? ` · ${escapeHtml(selectedLearningLabel)}` : ''}${modeLabel}${searchText} mục.`;

    if((hskState.groupMode === 'lessons' || hskState.groupMode === 'topics') && hskState.topicKey === 'all'){
      renderHskVocabViewControls(false);
      const sectionType = hskState.groupMode === 'topics' ? 'topic' : 'lesson';
      hskList.classList.add('hsk-list--topics', 'hsk-list--section-cards');
      hskList.innerHTML = renderHskSectionCards(searched, sectionType);
      return;
    }

    hskList.classList.remove('hsk-list--topics', 'hsk-list--section-cards');
    renderHskVocabViewControls(false);
    hskList.classList.add(hskState.vocabViewMode === 'grid' ? 'hsk-list--vocab-grid' : 'hsk-list--vocab-list');
    if(!filtered.length){
      hskList.innerHTML = '<p class="hsk-empty">Không tìm thấy mục phù hợp.</p>';
      return;
    }

    if(hskState.groupMode === 'lessons' || hskState.groupMode === 'topics'){
      hskList.innerHTML = renderSelectedSectionWordList(filtered);
      return;
    }

    hskList.innerHTML = filtered.map((item, index) => renderHskItem(item, index)).join('');
  }


  function openHskWord(word){
    const target = String(word || '').trim();
    if(!target) return;
    closeHskPopup();
    const url = new URL('../lookup/index.html', window.location.href);
    url.searchParams.set('q', target);
    window.location.href = url.href;
  }

  window.openHanziLearningPopup = openHskPopup;
  window.openHanziLookupWord = openHskWord;
  ensureFlashcardLibraryUi();

  tabHub?.addEventListener('click', () => navigateStudyRoute('hub', 'hub'));
  learnHubView?.addEventListener('click', event => {
    const trigger = event.target.closest('[data-open-study]');
    if(!trigger) return;
    const tabName = trigger.dataset.openStudy;
    const routeName = tabName === 'lookup' ? 'writing' : tabName;
    navigateStudyRoute(routeName, tabName);
  });
  tabLookup.addEventListener('click', () => navigateStudyRoute('writing', 'lookup'));
  tabHsk.addEventListener('click', () => navigateStudyRoute('hsk', 'hsk'));
  tabRadicals?.addEventListener('click', () => navigateStudyRoute('radicals', 'radicals'));

  sourceTabs.addEventListener('click', event => {
    const button = event.target.closest('[data-hsk-source]');
    if(!button){
      return;
    }
    const nextSource = button.dataset.hskSource || 'hsk';
    if(nextSource === hskState.sourceKey){
      return;
    }
    hskState.sourceKey = nextSource;
    saveLastCurriculum(nextSource);
    hskState.topicKey = 'all';
    hskState.wordFilter = 'all';
    pendingHskSectionKey = '';
    normalizeHskSourceAndLevel();
    syncHskRoute({ sectionKey: 'all' });
    renderHskSourceTabs();
    renderHskLevelTabs();
    if(nextSource === 'dialogue301') renderDialogue301Curriculum();
    else { setDialogue301CurriculumMode(false); loadHskLevel(hskState.currentLevel, { updateRoute: false }); }
  });

  levelTabs.addEventListener('click', event => {
    const button = event.target.closest('[data-hsk-level]');
    if(!button){
      return;
    }
    pendingHskSectionKey = '';
    loadHskLevel(button.dataset.hskLevel, { updateRoute: true });
  });

  hskSearch?.addEventListener('input', () => {
    hskState.query = hskSearch.value || '';
    renderHskList();
  });


  hskGroupModes?.addEventListener('click', event => {
    const backButton = event.target.closest('[data-hsk-section-back]');
    if(backButton){
      event.preventDefault();
      hskState.topicKey = 'all';
      hskState.wordFilter = 'all';
      renderHskFilters();
      renderHskList();
      syncHskRoute({ sectionKey: 'all' });
      return;
    }
    const viewButton = event.target.closest('[data-hsk-vocab-view]');
    if(viewButton){
      event.preventDefault();
      const nextMode = viewButton.dataset.hskVocabView === 'grid' ? 'grid' : 'list';
      if(nextMode !== hskState.vocabViewMode){
        saveStoredVocabViewMode(nextMode);
        renderHskFilters();
        renderHskList();
      }
      return;
    }
    const button = event.target.closest('[data-hsk-group-mode]');
    if(!button){
      return;
    }
    const nextMode = button.dataset.hskGroupMode || 'lessons';
    if(button.hidden || button.disabled || !hskModeAvailable(nextMode)){
      return;
    }
    hskState.groupMode = nextMode;
    saveStoredHskMode(nextMode);
    hskState.topicKey = 'all';
    hskState.wordFilter = 'all';
    if(hskState.groupMode === 'grammar'){
      if(!hskState.grammarSummary){
        loadGrammarSummary().then(() => {
          ensureGrammarSourceSelection();
          renderHskFilters();
          renderHskList();
        });
      }else{
        ensureGrammarSourceSelection();
      }
    }
    renderHskFilters();
    renderHskList();
    syncHskRoute({ replace: true, sectionKey: 'all' });
  });

  hskTopicFilters?.addEventListener('click', event => {
    const backButton = event.target.closest('[data-hsk-section-back]');
    if(backButton){
      event.preventDefault();
      hskState.topicKey = 'all';
      hskState.wordFilter = 'all';
      renderHskFilters();
      renderHskList();
      syncHskRoute({ sectionKey: 'all' });
      return;
    }
    const filterButton = event.target.closest('[data-hsk-word-filter]');
    if(filterButton){
      event.preventDefault();
      hskState.wordFilter = filterButton.dataset.hskWordFilter || 'all';
      renderHskFilters();
      renderHskList();
    }
  });

  hskList.addEventListener('click', event => {
    const sectionCard = event.target.closest('[data-hsk-section-key]');
    if(sectionCard){
      event.preventDefault();
      hskState.topicKey = sectionCard.dataset.hskSectionKey || 'all';
      hskState.wordFilter = 'all';
      renderHskFilters();
      renderHskList();
      syncHskRoute();
      return;
    }
    const speakButton = event.target.closest('[data-hsk-speak]');
    if(speakButton){
      event.preventDefault();
      event.stopPropagation();
      speakChar(speakButton.dataset.hskSpeak || '');
      return;
    }

    const grammarTrigger = event.target.closest('[data-hsk-grammar-id]');
    if(grammarTrigger){
      event.preventDefault();
      event.stopPropagation();
      renderGrammarPopup(findGrammarItemById(grammarTrigger.dataset.hskGrammarId || ''));
      return;
    }

    const popupTrigger = event.target.closest('[data-hsk-popup-word]');
    if(popupTrigger){
      event.preventDefault();
      event.stopPropagation();
      openHskPopup(popupTrigger.dataset.hskPopupWord || '');
    }
  });

  hskList.addEventListener('keydown', event => {
    if(event.key !== 'Enter' && event.key !== ' '){
      return;
    }
    const grammarItem = event.target.closest('.hsk-item[data-hsk-grammar-id]');
    if(grammarItem){
      event.preventDefault();
      renderGrammarPopup(findGrammarItemById(grammarItem.dataset.hskGrammarId || ''));
      return;
    }
    const item = event.target.closest('.hsk-item[data-hsk-popup-word]');
    if(item){
      event.preventDefault();
      openHskPopup(item.dataset.hskPopupWord || '');
    }
  });

  document.addEventListener('click', event => {
    const flashOpen = event.target.closest('[data-hsk-flashcard-open]');
    if(flashOpen){
      event.preventDefault();
      openFlashcardSetup();
      return;
    }
    const flashStats = event.target.closest('[data-hsk-flashcard-stats]');
    if(flashStats){
      event.preventDefault();
      openFlashcardStats();
      return;
    }
    const statsSpeak = event.target.closest('[data-hsk-flashcard-speak-word]');
    if(statsSpeak){
      event.preventDefault();
      event.stopPropagation();
      speakChar(statsSpeak.dataset.hskFlashcardSpeakWord || '');
      return;
    }
    const statsGroup = event.target.closest('[data-hsk-flashcard-study-group]');
    if(statsGroup && !statsGroup.disabled){
      event.preventDefault();
      startFlashcardStatsGroup(statsGroup.dataset.hskFlashcardStudyGroup || 'review-hard');
      return;
    }
    if(event.target.closest('[data-flashcard-reset-history]')){
      event.preventDefault();
      resetFlashcardHistory();
      const overlay = document.getElementById('hskFlashcardOverlay');
      if(overlay && !overlay.hidden && hskState.flashcardStatsOpen){ renderFlashcardOverlay(); }
      return;
    }
    if(event.target.closest('[data-flashcard-reset-session]')){
      event.preventDefault();
      resetActiveFlashcardSession();
      return;
    }
    const flashClose = event.target.closest('[data-hsk-flashcard-close]');
    if(flashClose){
      event.preventDefault();
      closeFlashcardOverlay();
      return;
    }
    const session = hskState.flashcardSession;
    if(session){
      const modeButton = event.target.closest('[data-hsk-flashcard-mode]');
      if(modeButton && session.phase === 'setup'){
        session.settings.mode = modeButton.dataset.hskFlashcardMode || 'flashcard';
        saveFlashcardSettings(session.settings);
        renderFlashcardOverlay();
        return;
      }
      const typingPromptButton = event.target.closest('[data-hsk-flashcard-typing-prompt]');
      if(typingPromptButton && session.phase === 'setup'){
        session.settings.typingPromptType = typingPromptButton.dataset.hskFlashcardTypingPrompt || 'hanzi-to-pinyin';
        saveFlashcardSettings(session.settings);
        renderFlashcardOverlay();
        return;
      }
      const option = event.target.closest('[data-hsk-flashcard-option]');
      if(option && session.phase === 'setup'){
        session.settings[option.dataset.hskFlashcardOption] = Boolean(option.checked);
        saveFlashcardSettings(session.settings);
        return;
      }
      if(event.target.closest('[data-hsk-flashcard-start]')){
        startFlashcardSession();
        return;
      }
      if(event.target.closest('[data-hsk-flashcard-to-setup]')){
        cancelFlashcardTypingCompletionTimer();
        stopFlashcardTypingClock();
        session.phase = 'setup';
        renderFlashcardOverlay();
        return;
      }
      const strokePlay = event.target.closest('[data-hsk-flashcard-stroke-play]');
      if(strokePlay){
        event.preventDefault();
        event.stopPropagation();
        playFlashcardStroke(strokePlay.dataset.hskFlashcardStrokePlay);
        return;
      }
      const strokeQuiz = event.target.closest('[data-hsk-flashcard-stroke-quiz]');
      if(strokeQuiz){
        event.preventDefault();
        event.stopPropagation();
        startFlashcardStrokeQuiz(strokeQuiz.dataset.hskFlashcardStrokeQuiz);
        return;
      }
      const strokeOutline = event.target.closest('[data-hsk-flashcard-stroke-outline]');
      if(strokeOutline){
        event.preventDefault();
        event.stopPropagation();
        toggleFlashcardStrokeOutline(strokeOutline.dataset.hskFlashcardStrokeOutline);
        return;
      }
      const strokeReset = event.target.closest('[data-hsk-flashcard-stroke-reset]');
      if(strokeReset){
        event.preventDefault();
        event.stopPropagation();
        resetFlashcardStrokeQuiz(strokeReset.dataset.hskFlashcardStrokeReset);
        return;
      }
      if(event.target.closest('[data-hsk-flashcard-stroke-play-all]')){
        event.preventDefault();
        event.stopPropagation();
        playAllFlashcardStrokes();
        return;
      }
      if(event.target.closest('[data-hsk-flashcard-stroke-expand]')){
        event.preventDefault();
        event.stopPropagation();
        session.strokeExpanded = true;
        renderFlashcardOverlay();
        return;
      }
      if(event.target.closest('[data-hsk-flashcard-stroke-collapse]')){
        event.preventDefault();
        event.stopPropagation();
        session.strokeExpanded = false;
        renderFlashcardOverlay();
        return;
      }
      if(event.target.closest('[data-hsk-flashcard-stroke-area]')){
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if(event.target.closest('[data-hsk-flashcard-speak]')){
        event.preventDefault();
        event.stopPropagation();
        speakChar(session.cards[session.index]?.word || '');
        return;
      }
      if(event.target.closest('[data-hsk-flashcard-typing-reveal]')){
        const state = ensureFlashcardTypingState(session);
        if(state){
          state.answerVisible = !state.answerVisible;
          if(state.answerVisible){
            state.answerRevealUsed = true;
            state.answerRevealCount += 1;
            state.answerRevealedAt = Date.now();
          }
          persistFlashcardSession();
          patchFlashcardTypingView(session);
        }
        return;
      }
      if(event.target.closest('[data-hsk-flashcard-flip]')){
        if(Date.now() < flashcardSuppressClickUntil) return;
        session.flipped = !session.flipped;
        if(!session.flipped) session.strokeExpanded = false;
        renderFlashcardOverlay();
        if(session.flipped && session.settings.autoPlay){
          speakChar(session.cards[session.index]?.word || '');
        }
        return;
      }
      const rate = event.target.closest('[data-hsk-flashcard-rate]');
      if(rate){
        const rating = rate.dataset.hskFlashcardRate || '';
        const activeCard = session.cards[session.index];
        const previousRating = session.ratings[activeCard.id] || '';
        session.ratings[activeCard.id] = rating;
        saveFlashcardRatingResult(activeCard, rating, previousRating);
        renderFlashcardOverlay();
        return;
      }
      if(event.target.closest('[data-hsk-flashcard-prev]')){
        moveFlashcard(-1);
        return;
      }
      if(event.target.closest('[data-hsk-flashcard-next]')){
        moveFlashcard(1);
        return;
      }
      if(event.target.closest('[data-hsk-flashcard-restart]')){
        session.phase = 'study';
        session.index = 0;
        session.flipped = false;
        session.strokeExpanded = false;
        session.ratings = {};
        session.typing = getCurrentFlashcardType(session) === 'typing' ? createFlashcardTypingState(session, session.cards[0]) : null;
        renderFlashcardOverlay();
        maybeAutoPlayFlashcard();
        return;
      }
      if(event.target.closest('[data-hsk-flashcard-review]')){
        const selected = session.cards.filter(card => ['review', 'hard'].includes(session.ratings[card.id]));
        session.cards = selected;
        session.phase = 'study';
        session.index = 0;
        session.flipped = false;
        session.strokeExpanded = false;
        session.ratings = {};
        session.mixedTypes = selected.map((_, index) => ['flashcard', 'reverse', 'listen'][index % 3]);
        renderFlashcardOverlay();
        maybeAutoPlayFlashcard();
        return;
      }
    }

    const popup = document.getElementById('hskDetailOverlay');
    if(!popup || popup.hidden){
      return;
    }

    const closeButton = event.target.closest('[data-hsk-popup-close]');
    if(closeButton){
      event.preventDefault();
      closeHskPopup();
      return;
    }

    const backButton = event.target.closest('[data-hsk-popup-back]');
    if(backButton){
      event.preventDefault();
      goBackHskPopup();
      return;
    }

    const speakButton = event.target.closest('[data-hsk-speak]');
    if(speakButton){
      event.preventDefault();
      event.stopPropagation();
      speakChar(speakButton.dataset.hskSpeak || '');
      return;
    }

    const lookupButton = event.target.closest('[data-hsk-open-lookup]');
    if(lookupButton){
      event.preventDefault();
      openHskWord(lookupButton.dataset.hskOpenLookup || '');
      return;
    }

    const writeButton = event.target.closest('[data-hsk-write-char]');
    if(writeButton){
      event.preventDefault();
      setPopupWriteChar(writeButton.dataset.hskWriteChar || '');
      return;
    }

    const playButton = event.target.closest('[data-hsk-popup-play-strokes]');
    if(playButton){
      event.preventDefault();
      popupAnimateStrokes();
      return;
    }

    const quizButton = event.target.closest('[data-hsk-popup-quiz]');
    if(quizButton){
      event.preventDefault();
      popupQuiz();
      return;
    }

    const relatedToggle = event.target.closest('[data-hsk-related-toggle]');
    if(relatedToggle){
      event.preventDefault();
      hskState.popupRelatedExpanded = !hskState.popupRelatedExpanded;
      const item = mergePopupSeed(findHskItem(hskState.popupWord) || getFallbackItem(hskState.popupWord, hskState.popupSeed || {}), hskState.popupSeed || {});
      renderHskPopup(item);
      return;
    }

    const nextButton = event.target.closest('[data-hsk-popup-open]');
    if(nextButton){
      event.preventDefault();
      openHskPopup(nextButton.dataset.hskPopupOpen || '', {
        pushHistory: true,
        seed: {
          pinyin: nextButton.dataset.hskPopupPinyin || '',
          meaningVi: nextButton.dataset.hskPopupMeaning || ''
        }
      });
    }
  });

  document.addEventListener('keydown', event => {
    const flashOverlay = document.getElementById('hskFlashcardOverlay');
    const session = hskState.flashcardSession;
    if(flashOverlay && !flashOverlay.hidden && session?.phase === 'study'){
      const flashCard = document.querySelector('[data-hsk-flashcard-flip]');
      const active = document.activeElement;
      const isInteractiveFocus = Boolean(active?.closest?.('button, input, textarea, select, a')) && active !== flashCard;
      if((event.key === ' ' || event.key === 'Enter') && !isInteractiveFocus){
        event.preventDefault();
        session.flipped = !session.flipped;
        if(!session.flipped) session.strokeExpanded = false;
        renderFlashcardOverlay();
        return;
      }
      if(event.key === 'ArrowLeft'){
        event.preventDefault();
        moveFlashcard(-1);
        return;
      }
      if(event.key === 'ArrowRight'){
        event.preventDefault();
        moveFlashcard(1);
        return;
      }
    }
    if(event.key === 'Escape' && flashOverlay && !flashOverlay.hidden){
      closeFlashcardOverlay();
      return;
    }
    const popup = document.getElementById('hskDetailOverlay');
    if(event.key === 'Escape' && popup && !popup.hidden){
      closeHskPopup();
    }
  });

  window.setTimeout(() => {
    restorePersistedFlashcardSession();
  }, 0);
})();


/* Shared long-press copy for HSK and Radical learning UI */
(function initLearningLongPressCopy(){
  let pressTimer = null;
  let pressTarget = null;
  let startX = 0;
  let startY = 0;
  let copiedDuringPress = false;

  function getCopyTarget(target){
    return target?.closest?.('[data-copy-text]') || null;
  }

  async function copyText(text){
    const value = String(text || '').trim();
    if(!value){
      return;
    }
    try{
      if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(value);
      }else{
        const area = document.createElement('textarea');
        area.value = value;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
      }
      showLearningCopyToast(`Đã copy: ${value}`);
    }catch(err){
      showLearningCopyToast('Không copy được.');
    }
  }

  function showLearningCopyToast(message){
    let toast = document.getElementById('learningCopyToast');
    if(!toast){
      toast = document.createElement('div');
      toast.id = 'learningCopyToast';
      toast.className = 'learning-copy-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(showLearningCopyToast.timer);
    showLearningCopyToast.timer = window.setTimeout(() => toast.classList.remove('show'), 1400);
  }

  function clearPress(){
    if(pressTimer){
      window.clearTimeout(pressTimer);
      pressTimer = null;
    }
    pressTarget = null;
  }

  document.addEventListener('pointerdown', event => {
    const target = getCopyTarget(event.target);
    if(!target){
      return;
    }
    pressTarget = target;
    copiedDuringPress = false;
    startX = event.clientX;
    startY = event.clientY;
    pressTimer = window.setTimeout(() => {
      if(!pressTarget){
        return;
      }
      copiedDuringPress = true;
      copyText(pressTarget.dataset.copyText || pressTarget.textContent || '');
    }, 650);
  }, true);

  document.addEventListener('pointermove', event => {
    if(!pressTarget){
      return;
    }
    if(Math.abs(event.clientX - startX) > 12 || Math.abs(event.clientY - startY) > 12){
      clearPress();
    }
  }, true);

  document.addEventListener('pointerup', clearPress, true);
  document.addEventListener('pointercancel', clearPress, true);

  document.addEventListener('click', event => {
    if(!copiedDuringPress){
      return;
    }
    const target = getCopyTarget(event.target);
    if(target){
      event.preventDefault();
      event.stopPropagation();
      copiedDuringPress = false;
    }
  }, true);

  window.addEventListener('popstate', restoreHskRouteFromLocation);
})();

/* Step 8 - Radical learning tab for Tra chữ Hán */
(function initRadicalLearningTab(){
  const view = document.getElementById('radicalsView');
  const list = document.getElementById('radicalList');
  const status = document.getElementById('radicalStatus');
  const search = document.getElementById('radicalSearchInput');
  const totalBadge = document.getElementById('radicalTotalBadge');
  const groupTrigger = document.getElementById('radicalGroupTrigger');
  const groupPanel = document.getElementById('radicalGroupPanel');
  const groupSummary = document.getElementById('radicalGroupSummary');

  if(!view || !list){
    return;
  }

  const RADICAL_DATA_BASE = 'data/learning/radicals/';
  const COMMON_RADICAL_IDS = [
    'thuy_085','nhan_009','khau_030','nu_038','nhat_072','moc_075','tam_061','thu_064','thao_140','ngon_149','suoc_162','mien_040','muc_109','nguyet_074','kim_167','boi_154','thuc_184','ma_187','vu_173','hoa_086','ap_163','phu_170'
  ];
  const MODE_IDS = {
    water: ['thuy_085','bang_015','vu_173'],
    person: ['nhan_009','nu_038','tu_039','tam_061','thu_064'],
    speech: ['khau_030','ngon_149']
  };

  const state = {
    notes: null,
    items: [],
    groups: [],
    groupId: 'all',
    query: '',
    activeId: '',
    popupExpanded: {}
  };

  async function fetchJsonLocal(path){
    const response = await fetch(path);
    if(!response.ok){
      throw new Error(`${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  function normalizeRadicalText(value){
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }


  function formatRadicalSlashMeaning(value, limit = 3){
    const parts = String(value || '')
      .split(/\s*\/\s*/)
      .map(part => part.trim())
      .filter(Boolean);
    if(!parts.length){
      return '';
    }
    return parts.slice(0, limit).join(' / ');
  }

  function getRadicalExampleText(examples){
    if(!Array.isArray(examples)){
      return '';
    }
    return examples.map(row => [row?.char, row?.word, row?.zh, row?.pinyin, row?.meaningVi, row?.vi].filter(Boolean).join(' ')).join(' ');
  }

  function getSearchHaystack(note){
    const short = note?.shortForCharLookup || {};
    const detail = note?.detailForRadicalPopup || {};
    return normalizeRadicalText([
      note.id,
      note.key,
      note.mainForm,
      note.sideForm,
      note.displayNameVi,
      note.pinyin,
      note.hanViet,
      short.meaningLine,
      short.positionLine,
      short.memoryLine,
      detail.originMeaning,
      detail.meaning,
      detail.recognition,
      detail.imageAssociation,
      (detail.semanticGroups || []).map(group => `${group.title || ''} ${group.description || ''} ${getRadicalExampleText(group.examples)}`).join(' '),
      getRadicalExampleText(note?.examples?.charsShort),
      getRadicalExampleText(note?.examples?.chars),
      getRadicalExampleText(note?.examples?.words),
      getRadicalExampleText(note?.examples?.sentences)
    ].filter(Boolean).join(' '));
  }

  function getRadicalSortRank(note){
    const commonIndex = COMMON_RADICAL_IDS.indexOf(note?.id);
    if(commonIndex !== -1){
      return commonIndex;
    }
    const no = Number(note?.kangxiNo);
    return 1000 + (Number.isFinite(no) ? no : 999);
  }

  function getActiveRadicalGroup(){
    return state.groups.find(group => group.id === state.groupId) || state.groups.find(group => group.id === 'all') || null;
  }

  function noteMatchesGroup(note){
    const group = getActiveRadicalGroup();
    if(!group || group.id === 'all'){
      return true;
    }
    return Array.isArray(group.radicals) && group.radicals.includes(note.id);
  }

  function getGroupOrderMap(){
    const group = getActiveRadicalGroup();
    const ids = Array.isArray(group?.radicals) ? group.radicals : [];
    return new Map(ids.map((id, index) => [id, index]));
  }

  function getFilteredRadicals(){
    const query = normalizeRadicalText(state.query);
    const groupOrder = getGroupOrderMap();
    return state.items.filter(note => {
      if(!noteMatchesGroup(note)){
        return false;
      }
      if(!query){
        return true;
      }
      return getSearchHaystack(note).includes(query);
    }).sort((a, b) => {
      if(groupOrder.size){
        const ai = groupOrder.has(a.id) ? groupOrder.get(a.id) : 9999;
        const bi = groupOrder.has(b.id) ? groupOrder.get(b.id) : 9999;
        if(ai !== bi) return ai - bi;
      }
      const ar = getRadicalSortRank(a);
      const br = getRadicalSortRank(b);
      if(ar !== br) return ar - br;
      return String(a.displayNameVi || '').localeCompare(String(b.displayNameVi || ''), 'vi');
    });
  }

  function formatRadicalBrief(note){
    const short = note?.shortForCharLookup || {};
    const chars = Array.isArray(note?.examples?.charsShort) ? note.examples.charsShort.slice(0, 5) : [];
    return `
      <button type="button" class="radical-item" data-radical-id="${escapeHtml(note.id)}" data-copy-text="${escapeHtml(note.key || note.mainForm || note.sideForm || '')}">
        <span class="radical-item-main">
          <strong class="radical-glyph">${escapeHtml(note.key || note.sideForm || note.mainForm || '')}</strong>
          <span>
            <b>${escapeHtml(note.displayNameVi || 'Bộ thủ')}</b>
            <em>${escapeHtml(formatPinyin(note.pinyin || ''))}${note.hanViet ? ` · ${escapeHtml(note.hanViet)}` : ''}</em>
          </span>
        </span>
        <span class="radical-item-copy">
          ${short.meaningLine ? `<span>${escapeHtml(short.meaningLine)}</span>` : ''}
          ${short.positionLine ? `<small>${escapeHtml(short.positionLine)}</small>` : ''}
        </span>
        ${chars.length ? `<span class="radical-item-chars">${chars.map(row => `<i>${escapeHtml(row.char || row.word || '')}</i>`).join('')}</span>` : ''}
      </button>
    `;
  }

  function renderRadicals(){
    const items = getFilteredRadicals();
    if(totalBadge){
      totalBadge.textContent = state.items.length ? `${state.items.length.toLocaleString('vi-VN')} bộ` : 'Bộ thủ';
    }
    if(status){
      const group = getActiveRadicalGroup();
      const label = group?.title || 'Tất cả nhóm';
      status.textContent = `${label}: ${items.length.toLocaleString('vi-VN')} bộ thủ.`;
    }
    if(groupSummary){
      const group = getActiveRadicalGroup();
      groupSummary.textContent = group?.description || 'Chọn nhóm để học bộ thủ theo chủ đề nghĩa.';
    }
    if(!items.length){
      list.innerHTML = '<p class="radical-empty">Không tìm thấy bộ thủ phù hợp.</p>';
      return;
    }
    list.innerHTML = items.map(formatRadicalBrief).join('');
  }

  function getFallbackRadicalGroups(){
    return [
      { id: 'all', order: 0, title: 'Tất cả nhóm', description: 'Hiển thị toàn bộ bộ thủ học chữ.', radicals: state.items.map(note => note.id) },
      { id: 'common', order: 1, title: 'Hay gặp', description: 'Những bộ thủ hay gặp trong HSK và từ vựng cơ bản.', radicals: COMMON_RADICAL_IDS }
    ];
  }

  function normalizeRadicalGroups(groups){
    const validIds = new Set(state.items.map(note => note.id));
    const rows = Array.isArray(groups) ? groups : [];
    const normalized = rows
      .filter(group => group && group.id && group.title)
      .map(group => ({
        id: String(group.id),
        order: Number.isFinite(Number(group.order)) ? Number(group.order) : 999,
        title: String(group.title || 'Nhóm bộ thủ'),
        description: String(group.description || ''),
        radicals: Array.isArray(group.radicals) ? group.radicals.filter(id => validIds.has(id)) : []
      }))
      .filter(group => group.id === 'all' || group.radicals.length);
    if(!normalized.some(group => group.id === 'all')){
      normalized.unshift({ id: 'all', order: 0, title: 'Tất cả nhóm', description: 'Hiển thị toàn bộ bộ thủ học chữ.', radicals: state.items.map(note => note.id) });
    }
    return normalized.sort((a, b) => (a.order - b.order) || a.title.localeCompare(b.title, 'vi'));
  }

  function getRadicalGroupCount(group){
    return group?.id === 'all' ? state.items.length : (Array.isArray(group?.radicals) ? group.radicals.length : 0);
  }

  function closeRadicalGroupDropdown(){
    if(groupPanel){
      groupPanel.hidden = true;
    }
    groupTrigger?.setAttribute('aria-expanded', 'false');
  }

  function toggleRadicalGroupDropdown(){
    if(!groupPanel || !groupTrigger){
      return;
    }
    const willOpen = groupPanel.hidden;
    groupPanel.hidden = !willOpen;
    groupTrigger.setAttribute('aria-expanded', String(willOpen));
  }

  function renderRadicalGroupDropdown(){
    if(!groupTrigger || !groupPanel){
      return;
    }
    if(!state.groups.some(group => group.id === state.groupId)){
      state.groupId = 'all';
    }
    const activeGroup = getActiveRadicalGroup() || state.groups[0] || null;
    const activeCount = getRadicalGroupCount(activeGroup);
    groupTrigger.innerHTML = `
      <span class="radical-group-trigger-main">
        <strong>${escapeHtml(activeGroup?.title || 'Tất cả nhóm')}</strong>
        <small>${activeCount.toLocaleString('vi-VN')} bộ</small>
      </span>
      <span class="radical-group-trigger-icon" aria-hidden="true">⌄</span>
    `;
    groupTrigger.setAttribute('aria-expanded', 'false');
    groupPanel.innerHTML = state.groups.map(group => {
      const count = getRadicalGroupCount(group);
      const active = group.id === state.groupId;
      return `
        <button type="button" class="radical-group-option ${active ? 'active' : ''}" data-radical-group-id="${escapeHtml(group.id)}" aria-pressed="${active ? 'true' : 'false'}">
          <span>
            <strong>${escapeHtml(group.title)}</strong>
            ${group.description ? `<small>${escapeHtml(group.description)}</small>` : ''}
          </span>
          <em>${count.toLocaleString('vi-VN')} bộ</em>
        </button>
      `;
    }).join('');
    groupPanel.hidden = true;
  }

  async function loadRadicals(){
    if(state.notes){
      renderRadicals();
      return;
    }
    try{
      if(status) status.textContent = 'Đang tải dữ liệu bộ thủ...';
      const notes = await fetchJsonLocal(`${RADICAL_DATA_BASE}radical_learning_notes.json`);
      state.notes = notes || {};
      state.items = Object.values(state.notes)
        .filter(note => note && note.id)
        .sort((a, b) => {
          const ar = getRadicalSortRank(a);
          const br = getRadicalSortRank(b);
          if(ar !== br) return ar - br;
          return String(a.displayNameVi || '').localeCompare(String(b.displayNameVi || ''), 'vi');
        });
      try{
        const groups = await fetchJsonLocal(`${RADICAL_DATA_BASE}radical_groups.json`);
        state.groups = normalizeRadicalGroups(groups);
      }catch(groupErr){
        console.warn('Cannot load radical groups, fallback to common groups:', groupErr);
        state.groups = normalizeRadicalGroups(getFallbackRadicalGroups());
      }
      renderRadicalGroupDropdown();
      renderRadicals();
    }catch(err){
      console.warn('Cannot load radical learning notes:', err);
      if(status) status.textContent = 'Không tải được dữ liệu bộ thủ. Kiểm tra data/learning/radicals.';
      list.innerHTML = '<p class="radical-empty">Chưa có dữ liệu bộ thủ.</p>';
    }
  }

  function ensureRadicalPopup(){
    let popup = document.getElementById('radicalDetailOverlay');
    if(popup){
      return popup;
    }
    popup = document.createElement('div');
    popup.id = 'radicalDetailOverlay';
    popup.className = 'radical-popup-overlay';
    popup.hidden = true;
    popup.innerHTML = `
      <div class="radical-popup-card" role="dialog" aria-modal="true" aria-label="Chi tiết bộ thủ">
        <div class="radical-popup-body" id="radicalDetailBody"></div>
      </div>
    `;
    document.body.appendChild(popup);
    popup.addEventListener('click', event => {
      if(event.target === popup){
        closeRadicalPopup();
      }
    });
    return popup;
  }

  function closeRadicalPopup(){
    const popup = ensureRadicalPopup();
    popup.hidden = true;
    document.body.classList.remove('radical-popup-open');
    state.activeId = '';
  }

  function getExampleLabel(row){
    return row?.char || row?.word || row?.zh || '';
  }

  function formatRadicalMeaningSnippet(value, limit = 3){
    const parts = String(value || '')
      .split(/\s*\/\s*/)
      .map(part => part.trim())
      .filter(Boolean);
    if(!parts.length){
      return '';
    }
    return parts.slice(0, limit).join(' / ');
  }

  function getActiveRadicalSentences(){
    const note = state.items.find(row => row.id === state.activeId) || state.notes?.[state.activeId];
    const rows = note?.examples?.sentences || [];
    return (Array.isArray(rows) ? rows : [])
      .map(row => ({
        zh: String(row?.zh || '').trim(),
        pinyin: String(row?.pinyin || '').trim(),
        vi: String(row?.vi || row?.meaningVi || '').trim()
      }))
      .filter(row => row.zh && row.pinyin && row.vi)
      .slice(0, 5);
  }

  function getActiveRadicalRelatedWords(currentWord){
    const note = state.items.find(row => row.id === state.activeId) || state.notes?.[state.activeId];
    const examples = note?.examples || {};
    const rows = [
      ...(Array.isArray(examples.chars) ? examples.chars : []),
      ...(Array.isArray(examples.words) ? examples.words : [])
    ];
    const current = String(currentWord || '').trim();
    const seen = new Set();
    return rows
      .map(row => {
        const word = String(row?.word || row?.char || '').trim();
        const pinyin = String(row?.pinyin || '').trim();
        const meaningVi = String(row?.meaningVi || row?.vi || '').trim();
        return { word, pinyin, meaningVi };
      })
      .filter(row => {
        if(!row.word || row.word === current || seen.has(row.word)){
          return false;
        }
        seen.add(row.word);
        return Boolean(row.pinyin || row.meaningVi);
      })
      .slice(0, 12);
  }

  function renderExampleRows(rows, options = {}){
    const listRows = Array.isArray(rows) ? rows.filter(row => getExampleLabel(row)).slice(0, options.limit || 50) : [];
    if(!listRows.length){
      return '';
    }
    const kind = options.kind || 'word';
    return `
      <div class="radical-example-list ${kind === 'sentence' ? 'radical-example-list--sentences' : ''}">
        ${listRows.map(row => {
          const label = getExampleLabel(row);
          const pinyin = row?.pinyin || '';
          const meaning = row?.meaningVi || row?.vi || '';
          if(kind === 'sentence'){
            return `
              <button type="button" class="radical-sentence-item" data-radical-speak="${escapeHtml(row.zh || label)}" data-copy-text="${escapeHtml(row.zh || label)}">
                <strong>${escapeHtml(row.zh || label)}</strong>
                ${pinyin ? `<em>${escapeHtml(formatPinyin(pinyin))}</em>` : ''}
                ${meaning ? `<span>${escapeHtml(meaning)}</span>` : ''}
                <b aria-hidden="true">🔊</b>
              </button>
            `;
          }
          return `
            <button type="button" class="radical-example-item" data-radical-open-word="${escapeHtml(label)}" data-radical-open-pinyin="${escapeHtml(pinyin)}" data-radical-open-meaning="${escapeHtml(meaning)}" data-copy-text="${escapeHtml(label)}">
              <strong>${escapeHtml(label)}</strong>
              ${pinyin ? `<em>${escapeHtml(formatPinyin(pinyin))}</em>` : ''}
              ${meaning ? `<span>${escapeHtml(formatRadicalMeaningSnippet(meaning, 3))}</span>` : ''}
              <b type="button" role="button" tabindex="0" data-radical-speak="${escapeHtml(label)}" aria-label="Nghe ${escapeHtml(label)}">🔊</b>
            </button>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderLimitedExampleSection(title, rows, options = {}){
    const allRows = Array.isArray(rows) ? rows.filter(row => getExampleLabel(row)) : [];
    if(!allRows.length){
      return '';
    }
    const key = options.key || title;
    const collapsedLimit = options.collapsedLimit || 5;
    const fullLimit = options.fullLimit || 50;
    const expanded = Boolean(state.popupExpanded[key]);
    const limit = expanded ? fullLimit : collapsedLimit;
    const hiddenCount = Math.max(0, allRows.length - collapsedLimit);
    const html = renderExampleRows(allRows, { kind: options.kind || 'word', limit });
    const toggle = hiddenCount > 0 ? `
      <button type="button" class="radical-more-btn" data-radical-toggle-section="${escapeHtml(key)}">
        ${expanded ? 'Thu gọn' : `Xem thêm ${hiddenCount} mục`}
      </button>
    ` : '';
    return `<section class="radical-popup-section"><h4>${escapeHtml(title)}</h4>${html}${toggle}</section>`;
  }

  function renderFormVariants(variants){
    const rows = Array.isArray(variants) ? variants : [];
    if(!rows.length){
      return '';
    }
    return `
      <section class="radical-popup-section">
        <h4>Dạng / biến thể</h4>
        <div class="radical-variant-list">
          ${rows.map(row => `
            <article class="radical-variant-card">
              <div class="radical-variant-head"><strong>${escapeHtml(row.form || '')}</strong><span>${escapeHtml(row.nameVi || '')}${row.pinyin ? ` · ${escapeHtml(formatPinyin(row.pinyin))}` : ''}</span></div>
              ${row.description ? `<p>${escapeHtml(row.description)}</p>` : ''}
              ${renderExampleRows(row.examples, { limit: 5 })}
            </article>
          `).join('')}
        </div>
      </section>
    `;
  }

  function renderSemanticGroups(groups){
    const rows = Array.isArray(groups) ? groups : [];
    if(!rows.length){
      return '';
    }
    return `
      <section class="radical-popup-section">
        <h4>Ý nghĩa mở rộng</h4>
        <div class="radical-semantic-list">
          ${rows.map((group, index) => `
            <article class="radical-semantic-card">
              <h5>${index + 1}. ${escapeHtml(group.title || 'Nhóm nghĩa')}</h5>
              ${group.description ? `<p>${escapeHtml(group.description)}</p>` : ''}
              ${renderExampleRows(group.examples, { limit: 5 })}
            </article>
          `).join('')}
        </div>
      </section>
    `;
  }

  function renderRadicalPopup(note){
    const popup = ensureRadicalPopup();
    const body = document.getElementById('radicalDetailBody');
    const short = note.shortForCharLookup || {};
    const detail = note.detailForRadicalPopup || {};
    const examples = note.examples || {};
    body.innerHTML = `
      <div class="radical-popup-topbar">
        <button type="button" class="radical-popup-back" data-radical-popup-close>← Quay về Bộ thủ</button>
        <button type="button" class="radical-popup-close" data-radical-popup-close aria-label="Đóng">×</button>
      </div>

      <section class="radical-popup-hero">
        <div class="radical-popup-glyph">${escapeHtml(note.key || note.sideForm || note.mainForm || '')}</div>
        <div>
          <h3>${escapeHtml(note.key || '')} · ${escapeHtml(note.displayNameVi || 'Bộ thủ')}</h3>
          <p>${escapeHtml(formatPinyin(note.pinyin || ''))}${note.hanViet ? ` · ${escapeHtml(note.hanViet)}` : ''}${note.kangxiNo ? ` · Kangxi ${escapeHtml(note.kangxiNo)}` : ''}</p>
          ${short.meaningLine ? `<strong>${escapeHtml(short.meaningLine)}</strong>` : ''}
          ${short.positionLine ? `<span>${escapeHtml(short.positionLine)}</span>` : ''}
          ${short.memoryLine ? `<em>${escapeHtml(short.memoryLine)}</em>` : ''}
        </div>
        <button type="button" class="radical-popup-speaker" data-radical-speak="${escapeHtml(note.key || note.mainForm || '')}" aria-label="Nghe ${escapeHtml(note.key || note.mainForm || '')}">🔊</button>
      </section>

      ${detail.originMeaning ? `<section class="radical-popup-section"><h4>Nguồn gốc và ý nghĩa</h4><p>${escapeHtml(detail.originMeaning)}</p></section>` : ''}
      ${renderFormVariants(detail.formVariants)}
      ${renderSemanticGroups(detail.semanticGroups)}

      <section class="radical-popup-section radical-popup-two-col">
        ${detail.recognition ? `<article><h4>Nhận biết</h4><p>${escapeHtml(detail.recognition)}</p></article>` : ''}
        ${detail.imageAssociation ? `<article><h4>Học qua hình ảnh</h4><p>${escapeHtml(detail.imageAssociation)}</p></article>` : ''}
      </section>

      ${Array.isArray(detail.avoidConfusion) && detail.avoidConfusion.length ? `
        <section class="radical-popup-section"><h4>Dễ nhầm</h4><ul class="radical-note-list">${detail.avoidConfusion.map(row => `<li>${escapeHtml(row)}</li>`).join('')}</ul></section>
      ` : ''}

      ${renderLimitedExampleSection('Chữ cùng bộ', examples.chars, { key: 'chars', collapsedLimit: 5, fullLimit: 50 })}
      ${renderLimitedExampleSection('Từ vựng', examples.words, { key: 'words', collapsedLimit: 5, fullLimit: 50 })}
      ${renderLimitedExampleSection('Ví dụ', examples.sentences, { key: 'sentences', kind: 'sentence', collapsedLimit: 3, fullLimit: 8 })}
    `;
    popup.hidden = false;
    document.body.classList.add('radical-popup-open');
  }

  function openRadicalPopup(id){
    const note = state.items.find(row => row.id === id) || state.notes?.[id];
    if(!note){
      return;
    }
    state.activeId = id;
    state.popupExpanded = {};
    renderRadicalPopup(note);
  }

  window.openRadicalLearningPopup = openRadicalPopup;

  window.addEventListener('hanzi:radicals-tab-open', () => {
    loadRadicals();
    window.setTimeout(() => search?.focus(), 80);
  });

  search?.addEventListener('input', () => {
    state.query = search.value || '';
    renderRadicals();
  });

  groupTrigger?.addEventListener('click', event => {
    event.preventDefault();
    toggleRadicalGroupDropdown();
  });

  groupPanel?.addEventListener('click', event => {
    const option = event.target.closest('[data-radical-group-id]');
    if(!option){
      return;
    }
    event.preventDefault();
    state.groupId = option.dataset.radicalGroupId || 'all';
    closeRadicalGroupDropdown();
    renderRadicalGroupDropdown();
    renderRadicals();
  });

  document.addEventListener('click', event => {
    if(!groupPanel || groupPanel.hidden){
      return;
    }
    if(event.target.closest('.radical-group-picker')){
      return;
    }
    closeRadicalGroupDropdown();
  });

  function handleRadicalCardClick(event){
    const card = event.target.closest('.radical-item[data-radical-id]');
    if(!card || !list.contains(card)){
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    openRadicalPopup(card.dataset.radicalId || '');
  }

  list.addEventListener('click', handleRadicalCardClick);

  // Fallback delegated listener: on some mobile/browser states the nested button can
  // swallow the list listener after re-render. Keep card opening reliable.
  document.addEventListener('click', event => {
    const card = event.target.closest('.radical-item[data-radical-id]');
    if(!card || !list.contains(card)){
      return;
    }
    handleRadicalCardClick(event);
  }, true);

  document.addEventListener('click', event => {
    const popup = document.getElementById('radicalDetailOverlay');
    if(!popup || popup.hidden){
      return;
    }
    const closeButton = event.target.closest('[data-radical-popup-close]');
    if(closeButton){
      event.preventDefault();
      closeRadicalPopup();
      return;
    }
    const speaker = event.target.closest('[data-radical-speak]');
    if(speaker){
      event.preventDefault();
      event.stopPropagation();
      speakChar(speaker.dataset.radicalSpeak || '');
      return;
    }
    const toggleSection = event.target.closest('[data-radical-toggle-section]');
    if(toggleSection){
      event.preventDefault();
      const key = toggleSection.dataset.radicalToggleSection || '';
      if(key){
        state.popupExpanded[key] = !state.popupExpanded[key];
        const note = state.items.find(row => row.id === state.activeId) || state.notes?.[state.activeId];
        if(note){
          renderRadicalPopup(note);
        }
      }
      return;
    }
    const openWord = event.target.closest('[data-radical-open-word]');
    if(openWord){
      event.preventDefault();
      const word = openWord.dataset.radicalOpenWord || '';
      const seed = {
        pinyin: openWord.dataset.radicalOpenPinyin || '',
        meaningVi: openWord.dataset.radicalOpenMeaning || '',
        sampleSentences: getActiveRadicalSentences(),
        relatedWords: getActiveRadicalRelatedWords(word)
      };
      const returnContext = state.activeId ? { type: 'radical', id: state.activeId, label: 'Quay lại Bộ thủ' } : null;
      closeRadicalPopup();
      if(window.openHanziLearningPopup){
        window.openHanziLearningPopup(word, { pushHistory: false, seed, returnContext });
      }else if(window.openHanziLookupWord){
        window.openHanziLookupWord(word);
      }
    }
  });

  document.addEventListener('keydown', event => {
    const popup = document.getElementById('radicalDetailOverlay');
    if(event.key === 'Escape' && popup && !popup.hidden){
      closeRadicalPopup();
    }
  });
})();


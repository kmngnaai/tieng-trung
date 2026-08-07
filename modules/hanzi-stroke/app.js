const HANZI_DATA_BASE = 'https://cdn.jsdelivr.net/npm/hanzi-writer-data@latest/';
const hanRegex = /\p{Script=Han}/u;
const Matching = window.TiengTrungMatching;

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
const CHARACTER_LEARNING_INDEX_URL = 'data/learning/character-learning-index.json';
const HSK1_CHARACTER_LEARNING_INDEX_URL = 'data/learning/character-learning-index-hsk1.json';
const HSK1_VOCABULARY_SENTENCE_INDEX_URL = 'data/learning/hsk1-vocabulary-sentence-index.json';
let characterLearningIndexPromise = null;
let hsk1VocabularySentenceIndexPromise = null;
const HANZI_COLOR_STORAGE_KEY = 'hanziStrokeColorSettings.v1';
const HANZI_PRESET_STORAGE_KEY = 'hanziStrokeActivePreset.v1';
const HANZI_THEME_STORAGE_KEY = 'hanziStrokeTheme.v1';

const wordBucketCache = new Map();
const WORD_LOOKUP_SOURCES = ['by_first_char'];

function getWordLookupPath(wordText, source){
  const chars = getHanziChars(wordText);
  if(!chars.length){
    return '';
  }
  if(source === 'by_first_char'){
    const first = chars[0];
    return `data/words/by_first_char/${first.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}.json`;
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

async function loadCharacterLearningIndex(){
  if(!characterLearningIndexPromise){
    const loadItems = url => fetch(url)
      .then(response => {
        if(!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        return response.json();
      })
      .then(data => data?.items && typeof data.items === 'object' ? data.items : {});
    characterLearningIndexPromise = Promise.all([
      loadItems(CHARACTER_LEARNING_INDEX_URL).catch(error => {
        console.warn('Cannot load general character learning index:', error);
        return {};
      }),
      loadItems(HSK1_CHARACTER_LEARNING_INDEX_URL).catch(error => {
        console.warn('Cannot load HSK 1 character learning index:', error);
        return {};
      })
    ]).then(([general, hsk1]) => ({ ...general, ...hsk1 }));
  }
  return characterLearningIndexPromise;
}

async function loadHsk1VocabularySentenceIndex(){
  if(!hsk1VocabularySentenceIndexPromise){
    hsk1VocabularySentenceIndexPromise = fetch(HSK1_VOCABULARY_SENTENCE_INDEX_URL)
      .then(response => {
        if(!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        return response.json();
      })
      .then(data => data?.items && typeof data.items === 'object' ? data.items : {})
      .catch(error => {
        console.warn('Cannot load HSK 1 sentence index:', error);
        return {};
      });
  }
  return hsk1VocabularySentenceIndexPromise;
}

async function loadCharacterLearningInfo(char){
  const items = await loadCharacterLearningIndex();
  return items[String(char || '').trim()] || null;
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

function renderCharacterComponentsHtml(learning){
  const components = Array.isArray(learning?.components) ? learning.components.filter(item => item?.glyph) : [];
  if(!components.length){
    return '';
  }
  return `
    <div class="dict-components-row">
      <div class="dict-label">Thành phần chữ</div>
      <div class="dict-components-list">
        ${components.map(component => {
          const meta = [component.pinyin, component.hanViet].filter(Boolean).join(' · ');
          const role = [component.roleVi, component.positionVi].filter(Boolean).join(' · ');
          return `<article class="dict-component-card">
            <button type="button" class="dict-component-open" data-character-component-open="${escapeHtml(component.glyph)}" aria-label="Tra chữ ${escapeHtml(component.glyph)}">
              <strong>${escapeHtml(component.glyph)}</strong>
              <span>${escapeHtml(meta || component.nameVi || 'Chưa có pinyin')}</span>
              ${component.meaningVi ? `<small>${escapeHtml(component.meaningVi)}</small>` : ''}
              ${role ? `<em>${escapeHtml(role)}</em>` : ''}
            </button>
            <button type="button" class="dict-component-speak" data-character-component-speak="${escapeHtml(component.glyph)}" aria-label="Nghe ${escapeHtml(component.glyph)}">🔊</button>
          </article>`;
        }).join('')}
      </div>
    </div>
  `;
}

function bindCharacterLearningActions(container){
  if(!container || container.dataset.characterLearningBound === 'true') return;
  container.dataset.characterLearningBound = 'true';
  container.addEventListener('click', event => {
    const speak = event.target.closest?.('[data-character-component-speak]');
    if(speak){
      event.preventDefault();
      event.stopPropagation();
      speakChar(speak.dataset.characterComponentSpeak || '');
      return;
    }
    const open = event.target.closest?.('[data-character-component-open]');
    if(!open) return;
    event.preventDefault();
    const char = open.dataset.characterComponentOpen || '';
    if(!char) return;
    if(els.infoDialog?.open && typeof els.infoDialog.close === 'function') els.infoDialog.close();
    else els.infoDialog?.removeAttribute?.('open');
    if(els.input){
      els.input.value = char;
      renderWriters();
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  });
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
  const learning = options.learning || null;

  if(!info){
    return '<p class="dict-empty">Chưa có dữ liệu từ điển.</p>';
  }

  const char = formatInfoValue(info.char || fallbackChar, fallbackChar || '字');
  const pinyin = formatPinyin(info.pinyin);
  const strokeCount = Number.isFinite(Number(info.strokeCount)) ? String(Number(info.strokeCount)) : '';
  const hsk = info.hsk ? `HSK ${info.hsk}` : '';
  const rowsBeforeComponents = [
    ['Hán Việt', formatInfoValue(info.hanViet)],
    ['Nghĩa', formatInfoValue(formatMeaning(info))],
    ['Bộ thủ', formatInfoValue(info.radical)]
  ];
  const rowsAfterComponents = [
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
        ${rowsBeforeComponents.map(([label, value]) => `
          <div class="dict-row">
            <dt class="dict-label">${escapeHtml(label)}</dt>
            <dd class="dict-value">${escapeHtml(value)}</dd>
          </div>
        `).join('')}
        ${renderCharacterComponentsHtml(learning)}
        ${rowsAfterComponents.map(([label, value]) => `
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
  const [info, learning] = await Promise.all([
    loadLocalCharInfo(item.char),
    loadCharacterLearningInfo(item.char)
  ]);

  if(!info){
    item.infoPanel.innerHTML = renderDictionaryInfoHtml(null, { mode: 'panel', char: item.char, learning });
    bindCharacterLearningActions(item.infoPanel);
    return;
  }

  setCardPinyin(item, info.pinyin);
  item.infoPanel.innerHTML = renderDictionaryInfoHtml(info, { mode: 'panel', char: item.char, learning });
  bindCharacterLearningActions(item.infoPanel);
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

  const [localInfo, learning] = await Promise.all([
    loadLocalCharInfo(char),
    loadCharacterLearningInfo(char)
  ]);
  if(content){
    content.innerHTML = renderDictionaryInfoHtml(localInfo, { mode: 'modal', char, learning });
    bindCharacterLearningActions(content);
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

  const ImportCore = window.TiengTrungImportCore;
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
    popupSentencesExpanded: false,
    popupLoadId: 0,
    groupMode: pendingHskSectionMode || 'lessons',
    topicKey: 'all',
    wordFilter: 'all',
    sourceKey: readLastCurriculum(),
    levelLoading: false,
    vocabViewMode: 'list',
    showPinyin: true,
    flashcardSession: null,
    flashcardStatsOpen: false
  };

  const HSK_MODE_STORAGE_KEY = 'hanziStroke.hskLastModeBySourceLevel.v1';
  const HSK_VOCAB_VIEW_STORAGE_KEY = 'hanziStroke.hskVocabViewMode.v1';
  const HSK_PINYIN_VISIBILITY_STORAGE_KEY = 'hanziStroke.hskShowPinyin.v1';
  const HSK_FLASHCARD_SETTINGS_KEY = 'hanziStroke.hskFlashcardSettings.v1';
  const HSK_FLASHCARD_RESULTS_KEY = 'hanziStroke.hskFlashcardResults.v1';
  const HSK_FLASHCARD_ACTIVE_SESSION_KEY = 'hanziStroke.hskFlashcardActiveSession.v1';
  const FLASHCARD_LIBRARY_SORT_KEY = 'hanziStroke.flashcardLibrarySort.v1';
  const FLASHCARD_DB_NAME = 'hanziStrokeFlashcards';
  const FLASHCARD_DB_VERSION = 3;
  const FLASHCARD_DECK_STORE = 'decks';
  const FLASHCARD_GROUP_STORE = 'groups';
  const FLASHCARD_TRASH_STORE = 'trash';
  let flashcardTouchStart = null;
  let flashcardSuppressClickUntil = 0;
  let flashcardDeckLongPressTimer = 0;
  let flashcardDeckLongPressPointerId = null;
  let flashcardDeckLongPressStart = null;
  let flashcardDeckLongPressTriggered = false;
  const FLASHCARD_DECK_LONG_PRESS_MS = 520;
  let flashcardStrokeWriters = [];
  let flashcardStrokeRenderId = 0;
  let flashcardStrokePlayId = 0;
  let flashcardTypingCompletionTimer = 0;
  let flashcardTypingClockTimer = 0;
  let flashcardTypingErrorTimer = 0;
  let flashcardOrderingAdvanceTimer = 0;
  let flashcardPointerDrag = null;
  let flashcardPointerDragSuppressClickUntil = 0;
  let flashcardLearningHistorySignature = '';
  const HSK_FLASHCARD_TYPING_SHORT_COMPLETION_DELAY_MS = 30000;
  const HSK_FLASHCARD_TYPING_LONG_COMPLETION_DELAY_MS = 120000;
  const HSK_FLASHCARD_TYPING_CUSTOM_DELAY_DEFAULT_SECONDS = 3;
  const HSK_FLASHCARD_TYPING_CUSTOM_DELAY_MAX_SECONDS = 600;
  const HSK_FLASHCARD_TYPING_DELAY_PRESETS = Object.freeze([1, 2, 3, 5, 10]);
  const HSK_FLASHCARD_ORDERING_DELAY_PRESETS = Object.freeze([0, 0.8, 1.2, 2, 3]);
  let tabFlashcards = document.getElementById('studyTabFlashcards');
  let tabDialogue301 = null;
  let flashcardLibraryView = null;
  const flashcardLibraryState = { decks: [], groups: [], activeGroupId: '', editingGroup: null, movingDeckId: '', movingDeckIds: [], deckSelectionMode: false, selectedDeckIds: new Set(), deletingGroupId: '', editingDeck: null, detailDeckId: '', detailSearch: '', editingCardId: '', selectedCardIds: new Set(), message: '', quickImportBusy: false, searchQuery: '', sortMode: readFlashcardLibrarySort(), customDecksOpen: false, dataManagerOpen: false, sortSheetOpen: false, undoTrashId: '', undoTimer: null, trashOpen: false, trashItems: [], importPreview: null, importPayload: null, importMode: 'content', templateMenuOpen: false, curriculumBrowserOpen: false, curriculumSource: 'new_hsk', curriculumLevel: 1, curriculumLessons: [], curriculumLessonKey: '', curriculumLesson: null, curriculumContentType: 'vocabulary', curriculumCountMode: 'all', curriculumCustomCount: 10, curriculumSelectedIds: new Set(), curriculumLoading: false, curriculumError: '', curriculumScrollTop: 0, curriculumQuery: '', aiPromptBuilderOpen: false, aiPromptType: 'vocabulary', aiPromptFields: { level: 'HSK 1', topic: '', operation: 'create', count: 10, maxOutOfScopeWords: 0, inputText: '', allowedVocabulary: '', allowedGrammar: '', requiredVocabulary: '', requiredGrammar: '', requirements: '' }, aiPromptCopied: false, aiPasteOpen: false, aiPasteMode: 'full', aiPasteExpectedType: 'vocabulary', aiPasteText: '', aiPasteAnalysis: null, aiPasteSelectedIds: new Set(), aiPasteTitle: '', aiPasteToFlashcards: true, aiPasteToListening: true, aiPasteFlashcardMode: 'new', aiPasteFlashcardDeckId: '', aiPasteFlashcardGroupId: '', aiPasteListeningMode: 'new', aiPasteListeningDeckId: '', aiPasteListeningGroupId: '', listeningGroups: [], listeningDecks: [] };

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
        if(!db.objectStoreNames.contains(FLASHCARD_GROUP_STORE)){
          db.createObjectStore(FLASHCARD_GROUP_STORE, { keyPath: 'id' });
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

  async function withGroupStore(mode, callback){
    const db = await openFlashcardDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FLASHCARD_GROUP_STORE, mode);
      const store = tx.objectStore(FLASHCARD_GROUP_STORE);
      let value;
      try{ value = callback(store); }catch(err){ db.close(); reject(err); return; }
      tx.oncomplete = () => { db.close(); resolve(value); };
      tx.onerror = () => { db.close(); reject(tx.error || new Error('Lỗi IndexedDB.')); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error('Giao dịch bị hủy.')); };
    });
  }

  async function getAllFlashcardGroups(){
    const db = await openFlashcardDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FLASHCARD_GROUP_STORE, 'readonly');
      const request = tx.objectStore(FLASHCARD_GROUP_STORE).getAll();
      request.onsuccess = () => resolve((request.result || []).sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''), 'vi', { sensitivity: 'base' })));
      request.onerror = () => reject(request.error || new Error('Không đọc được nhóm bộ thẻ.'));
      tx.oncomplete = () => db.close();
    });
  }

  async function saveFlashcardGroup(group){
    const now = new Date().toISOString();
    const clean = {
      id: String(group?.id || makeLocalId('group')),
      name: String(group?.name || '').trim() || 'Nhóm chưa đặt tên',
      description: String(group?.description || '').trim(),
      createdAt: group?.createdAt || now,
      updatedAt: now
    };
    await withGroupStore('readwrite', store => store.put(clean));
    return clean;
  }

  async function deleteFlashcardGroupRecord(groupId){
    await withGroupStore('readwrite', store => store.delete(groupId));
  }

  function getActiveFlashcardGroup(){
    return flashcardLibraryState.groups.find(group => group.id === flashcardLibraryState.activeGroupId) || null;
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
      groupId: deck.groupId ? String(deck.groupId) : null,
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

  async function moveGroupDecksToUngrouped(groupId){
    const decks = flashcardLibraryState.decks.filter(deck => deck.groupId === groupId);
    const db = await openFlashcardDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction([FLASHCARD_DECK_STORE, FLASHCARD_GROUP_STORE], 'readwrite');
      const deckStore = tx.objectStore(FLASHCARD_DECK_STORE);
      const now = new Date().toISOString();
      decks.forEach(deck => deckStore.put({ ...deck, groupId: null, updatedAt: now }));
      tx.objectStore(FLASHCARD_GROUP_STORE).delete(groupId);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Không thể xóa nhóm.'));
      tx.onabort = () => reject(tx.error || new Error('Giao dịch bị hủy.'));
    });
    db.close();
  }

  async function moveGroupBundleToTrash(groupId){
    const group = flashcardLibraryState.groups.find(item => item.id === groupId);
    if(!group) return null;
    const decks = flashcardLibraryState.decks.filter(deck => deck.groupId === groupId);
    const deletedAt = new Date().toISOString();
    const trashItem = {
      id: makeLocalId('trash'),
      type: 'group-bundle',
      deletedAt,
      expiresAt: makeTrashExpiry(deletedAt),
      group: JSON.parse(JSON.stringify(group)),
      decks: JSON.parse(JSON.stringify(decks))
    };
    const db = await openFlashcardDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction([FLASHCARD_DECK_STORE, FLASHCARD_GROUP_STORE, FLASHCARD_TRASH_STORE], 'readwrite');
      const deckStore = tx.objectStore(FLASHCARD_DECK_STORE);
      decks.forEach(deck => deckStore.delete(deck.id));
      tx.objectStore(FLASHCARD_GROUP_STORE).delete(groupId);
      tx.objectStore(FLASHCARD_TRASH_STORE).put(trashItem);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Không thể chuyển nhóm vào Thùng rác.'));
      tx.onabort = () => reject(tx.error || new Error('Giao dịch bị hủy.'));
    });
    db.close();
    return trashItem;
  }

  function chooseFlashcardGroupDeletion(group, deckCount){
    return new Promise(resolve => {
      document.getElementById('flashcardGroupDeleteOverlay')?.remove();
      const overlay = document.createElement('div');
      overlay.id = 'flashcardGroupDeleteOverlay';
      overlay.className = 'flashcard-confirm-overlay flashcard-group-delete-overlay';
      overlay.innerHTML = `
        <section class="flashcard-confirm-dialog flashcard-group-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="flashcardGroupDeleteTitle">
          <button type="button" class="flashcard-confirm-x" data-flashcard-group-delete-choice="cancel" aria-label="Đóng">×</button>
          <div class="flashcard-confirm-icon">📁</div>
          <h3 id="flashcardGroupDeleteTitle">Xóa nhóm “${escapeHtml(group?.name || 'Nhóm')}”?</h3>
          <p>Nhóm này đang có ${deckCount} bộ thẻ. Chọn cách xử lý các bộ bên trong.</p>
          <div class="flashcard-group-delete-actions">
            <button type="button" class="primary" data-flashcard-group-delete-choice="ungroup"><b>Đưa về Chưa phân nhóm</b><span>Giữ nguyên bộ thẻ và lịch sử học.</span></button>
            <button type="button" class="danger" data-flashcard-group-delete-choice="trash"><b>Xóa nhóm và các bộ</b><span>Chuyển tất cả vào Thùng rác trong 30 ngày.</span></button>
            <button type="button" data-flashcard-group-delete-choice="cancel">Hủy</button>
          </div>
        </section>`;
      const finish = value => { overlay.remove(); resolve(value); };
      overlay.addEventListener('click', event => {
        if(event.target === overlay) return finish('cancel');
        const choice = event.target.closest('[data-flashcard-group-delete-choice]')?.dataset.flashcardGroupDeleteChoice;
        if(choice) finish(choice);
      });
      document.body.appendChild(overlay);
      overlay.querySelector('[data-flashcard-group-delete-choice="ungroup"]')?.focus();
    });
  }

  async function restoreTrashItem(id){
    const item = await getTrashItem(id);
    if(!item) return false;
    const db = await openFlashcardDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction([FLASHCARD_DECK_STORE, FLASHCARD_GROUP_STORE, FLASHCARD_TRASH_STORE], 'readwrite');
      const deckStore = tx.objectStore(FLASHCARD_DECK_STORE);
      const trashStore = tx.objectStore(FLASHCARD_TRASH_STORE);
      if(item.type === 'deck'){
        deckStore.put({ ...item.data, updatedAt: new Date().toISOString() });
        trashStore.delete(item.id);
      }else if(item.type === 'group-bundle'){
        const groupStore = tx.objectStore(FLASHCARD_GROUP_STORE);
        const now = new Date().toISOString();
        groupStore.put({ ...item.group, updatedAt: now });
        (item.decks || []).forEach(deck => deckStore.put({ ...deck, groupId: item.group?.id || deck.groupId || null, updatedAt: now }));
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

  function nextFlashcardImportId(base, used){
    const cleanBase = String(base || 'item');
    if(!used.has(cleanBase)){ used.add(cleanBase); return cleanBase; }
    let index = 2;
    while(used.has(`${cleanBase}-${index}`)) index += 1;
    const id = `${cleanBase}-${index}`;
    used.add(id);
    return id;
  }

  async function importFlashcardContent(payload, options = {}){
    const restore = options.restore === true;
    if(Array.isArray(payload?.errors) && payload.errors.length) throw new Error(payload.errors.join(' · '));
    const groups = Array.isArray(payload?.groups) ? payload.groups : [];
    const decks = Array.isArray(payload?.decks) ? payload.decks : [];
    if(!groups.length && !decks.length && !payload?.results) throw new Error('File không có dữ liệu Thẻ hợp lệ.');
    const [existingGroups, existingDecks] = await Promise.all([getAllFlashcardGroups(), getAllCustomDecks()]);
    const usedGroupIds = new Set(existingGroups.map(group => group.id));
    const usedDeckIds = new Set(existingDecks.map(deck => deck.id));
    const groupIdMap = new Map();
    const now = new Date().toISOString();
    const normalizedGroups = groups.map((raw, index) => {
      const originalId = String(raw?.id || `group-${index + 1}`);
      const id = restore ? originalId : nextFlashcardImportId(originalId, usedGroupIds);
      if(restore) usedGroupIds.add(id);
      groupIdMap.set(originalId, id);
      return { id, name: String(raw?.name || raw?.title || `Nhóm ${index + 1}`), description: String(raw?.description || ''), createdAt: raw?.createdAt || now, updatedAt: now };
    });
    const normalizedDecks = decks.map((raw, index) => {
      const originalId = String(raw?.id || `deck-${index + 1}`);
      const id = restore ? originalId : nextFlashcardImportId(originalId, usedDeckIds);
      if(restore) usedDeckIds.add(id);
      const originalGroupId = raw?.groupId ? String(raw.groupId) : '';
      const groupId = originalGroupId ? (groupIdMap.get(originalGroupId) || (restore ? originalGroupId : null)) : null;
      const seen = new Set();
      const cards = (raw?.cards || []).map((card, cardIndex) => {
        const word = String(card?.word || card?.hanzi || card?.text || '').trim();
        const pinyin = String(card?.pinyin || '').trim();
        const meaningVi = String(card?.meaningVi || card?.meaning || '').trim();
        const key = `${word}\u0000${pinyin}\u0000${meaningVi}`;
        if(!word || seen.has(key)) return null;
        seen.add(key);
        return { ...card, id: String(card?.id || makeLocalId('card')), word, pinyin, meaningVi };
      }).filter(Boolean);
      return { id, name: String(raw?.name || raw?.title || `Bộ ${index + 1}`), description: String(raw?.description || ''), groupId, createdAt: raw?.createdAt || now, updatedAt: now, cards };
    }).filter(deck => deck.cards.length);
    const db = await openFlashcardDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction([FLASHCARD_GROUP_STORE, FLASHCARD_DECK_STORE], 'readwrite');
      const groupStore = tx.objectStore(FLASHCARD_GROUP_STORE);
      const deckStore = tx.objectStore(FLASHCARD_DECK_STORE);
      normalizedGroups.forEach(group => groupStore.put(group));
      normalizedDecks.forEach(deck => deckStore.put(deck));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Không nhập được nội dung Thẻ.'));
      tx.onabort = () => reject(tx.error || new Error('Giao dịch nhập Thẻ bị hủy.'));
    });
    db.close();
    if(payload?.results && typeof payload.results === 'object'){
      const merged = { ...readFlashcardResults(), ...payload.results };
      window.localStorage?.setItem(HSK_FLASHCARD_RESULTS_KEY, JSON.stringify(merged));
    }
    return { groupCount: normalizedGroups.length, deckCount: normalizedDecks.length, cardCount: normalizedDecks.reduce((sum, deck) => sum + deck.cards.length, 0) };
  }

  async function prepareFlashcardImport(file, mode = 'content'){
    if(!ImportCore) throw new Error('Thiếu modules/shared/import-core.js.');
    const parsed = await ImportCore.readFile(file, { simpleText: 'flashcard' });
    const payload = ImportCore.buildFlashcardImport(parsed);
    if(mode === 'restore' && payload.format !== 'flashcard-backup') throw new Error('File này không phải backup Thẻ. Hãy dùng “Nhập nội dung” cho XLSX, CSV, TXT hoặc JSON mẫu.');
    flashcardLibraryState.importMode = mode;
    flashcardLibraryState.importPayload = payload;
    flashcardLibraryState.importPreview = { ...payload, fileName: file.name };
    await renderFlashcardLibrary();
  }

  async function confirmFlashcardImport(){
    const payload = flashcardLibraryState.importPayload;
    if(!payload) return;
    const summary = await importFlashcardContent(payload, { restore: flashcardLibraryState.importMode === 'restore' });
    flashcardLibraryState.importPayload = null;
    flashcardLibraryState.importPreview = null;
    flashcardLibraryState.message = `Đã nhập ${summary.groupCount} nhóm, ${summary.deckCount} bộ và ${summary.cardCount} thẻ.`;
    await renderFlashcardLibrary();
  }

  function cancelFlashcardImport(){
    flashcardLibraryState.importPayload = null;
    flashcardLibraryState.importPreview = null;
    renderFlashcardLibrary();
  }

  function renderFlashcardImportPreview(){
    const preview = flashcardLibraryState.importPreview;
    if(!preview) return '';
    const stats = preview.stats || {};
    const errors = preview.errors || [];
    const warnings = preview.warnings || [];
    return `<div class="flashcard-import-backdrop" data-flashcard-import-cancel>
      <section class="flashcard-import-dialog" role="dialog" aria-modal="true" aria-labelledby="flashcardImportTitle" onclick="event.stopPropagation()">
        <span class="flashcard-data-section__eyebrow">${flashcardLibraryState.importMode === 'restore' ? 'KHÔI PHỤC BACKUP' : 'XEM TRƯỚC FILE NHẬP'}</span>
        <h3 id="flashcardImportTitle">${escapeHtml(preview.fileName || 'File dữ liệu')}</h3>
        <div class="flashcard-import-stats"><span><b>${stats.groupCount || 0}</b> nhóm</span><span><b>${stats.deckCount || 0}</b> bộ</span><span><b>${stats.cardCount || 0}</b> thẻ</span></div>
        ${errors.length ? `<div class="flashcard-import-message is-error"><b>Lỗi cần sửa</b>${errors.map(message => `<p>${escapeHtml(message)}</p>`).join('')}</div>` : ''}
        ${warnings.length ? `<details class="flashcard-import-message is-warning"><summary>${warnings.length} cảnh báo</summary>${warnings.slice(0, 20).map(message => `<p>${escapeHtml(message)}</p>`).join('')}</details>` : ''}
        <p>${flashcardLibraryState.importMode === 'restore' ? 'Khôi phục backup có thể cập nhật bộ cùng ID.' : 'Nhập nội dung mới không ghi đè âm thầm; ID trùng sẽ được đổi ID.'}</p>
        <div class="flashcard-import-actions"><button type="button" data-flashcard-import-cancel>Hủy</button><button type="button" class="hsk-flashcard-start" data-flashcard-import-confirm ${errors.length ? 'disabled' : ''}>${flashcardLibraryState.importMode === 'restore' ? 'Khôi phục' : 'Nhập nội dung'}</button></div>
      </section>
    </div>`;
  }

  function renderFlashcardTemplatePanel(){
    if(!flashcardLibraryState.templateMenuOpen) return '';
    return `<section class="flashcard-template-panel"><div><b>File mẫu Thẻ</b><small>XLSX có hướng dẫn và các sheet cho một thẻ, một bộ, một nhóm.</small></div><div>
      <a href="templates/flashcards/the-mau-day-du.xlsx" download>Mẫu XLSX</a>
      <a href="templates/flashcards/the-mau-day-du.csv" download>Mẫu CSV</a>
      <a href="templates/flashcards/the-mau-day-du.txt" download>Mẫu TXT</a>
      <a href="templates/flashcards/the-mau-day-du.json" download>Mẫu JSON</a>
      <a href="templates/flashcards/README.md" target="_blank" rel="noopener">Hướng dẫn</a>
    </div></section>`;
  }


  const FLASHCARD_CURRICULUM_SOURCES = Object.freeze([
    { key: 'dialogue301', label: '301', description: 'Giáo trình 301' },
    { key: 'hsk', label: 'HSK 6 cấp', description: 'HSK 1–6' },
    { key: 'new_hsk', label: 'New HSK', description: 'HSK 9 cấp' },
    { key: 'new_hsk_course', label: 'New 3.0', description: 'Nội dung theo sách · HSK 1–3' },
    { key: 'yct', label: 'YCT', description: 'YCT 1–4' },
    { key: 'boya', label: 'Boya', description: 'Sơ cấp đến cao cấp' }
  ]);
  let flashcardCurriculumSummaryPromise = null;
  let flashcardNewHskCourseManifestPromise = null;
  const FLASHCARD_NEW_HSK_COURSE_MANIFEST_URL = '../new-hsk-course/data/manifest.json';
  const FLASHCARD_RADICAL_INDEX_URL = 'data/learning/radicals/radical-character-index.json';
  const FLASHCARD_RADICAL_CATALOG_URL = 'data/learning/radicals/radical_catalog.json';

  function getFlashcardCurriculumSourceMeta(sourceKey = flashcardLibraryState.curriculumSource){
    return FLASHCARD_CURRICULUM_SOURCES.find(source => source.key === sourceKey) || FLASHCARD_CURRICULUM_SOURCES[1];
  }

  async function loadFlashcardNewHskCourseManifest(){
    if(!flashcardNewHskCourseManifestPromise){
      flashcardNewHskCourseManifestPromise = fetchJson(FLASHCARD_NEW_HSK_COURSE_MANIFEST_URL).catch(error => {
        flashcardNewHskCourseManifestPromise = null;
        throw error;
      });
    }
    return flashcardNewHskCourseManifestPromise;
  }

  // Do not trust Intl.Segmenter blindly here; curated vocabulary matches prevent tokens such as 是好.
  function segmentFlashcardSentence(text, vocabularyHints = []){
    const clean = String(text || '').replace(/[，,。.!！?？；;：:“”"'‘’、]/gu, '').replace(/\s+/gu, '').trim();
    if(!clean) return [];
    const hints = Array.from(new Set((vocabularyHints || []).map(value => String(value || '').replace(/\s+/gu,'').trim()).filter(value => value && clean.includes(value)))).sort((a,b)=>b.length-a.length);
    const result=[];
    let rest=clean;
    while(rest){
      const match=hints.find(word=>rest.startsWith(word));
      if(match){ result.push(match); rest=rest.slice(match.length); continue; }
      const first=Array.from(rest)[0];
      result.push(first);
      rest=rest.slice(first.length);
    }
    return result;
  }

  function buildNewHskCourseCurriculum(lessonData, level, lessonNo){
    const entities = lessonData?.entities || {};
    const lessonKey = String(lessonData?.id || `nhsk-${level}-${String(lessonNo).padStart(2,'0')}`);
    const characters = Array.isArray(entities.characters) ? entities.characters : [];
    const charMap = new Map(characters.map(row => [row.hanzi, row]));
    const vocabularyRows = [...(entities.vocabulary || []), ...(entities.properNouns || [])];
    const vocabulary = vocabularyRows.map((item,index) => ({
      id: `curriculum:new_hsk_course:${lessonKey}:word:${item.id || index+1}`,
      entityId: item.id,
      cardType: item.kind ? 'proper-noun' : 'vocabulary',
      word: String(item.hanzi || '').trim(),
      pinyin: formatPinyin(item.pinyin),
      meaningVi: String(item.vi || '').trim(),
      hanViet: String(item.hanViet || '').trim(),
      order: Number(item.order) || index+1,
      sourceItem: item,
      characterData: Array.from(String(item.hanzi || '')).map(glyph => charMap.get(glyph)).filter(Boolean)
    })).filter(card => card.word);
    const vocabularyHints = vocabulary.map(card => card.word);
    const sentence=[];
    (entities.dialogues || []).forEach((dialogue, dialogueIndex) => {
      (dialogue.turns || []).forEach((turn, turnIndex) => {
        sentence.push({
          id: `curriculum:new_hsk_course:${lessonKey}:sentence:${turn.id || `${dialogueIndex+1}-${turnIndex+1}`}`,
          entityId: turn.id,
          cardType: 'sentence',
          sentenceKind: 'dialogue',
          word: String(turn.hanzi || '').trim(),
          pinyin: formatPinyin(turn.pinyin),
          meaningVi: String(turn.vi || '').trim(),
          speaker: String(turn.speaker?.vi || ''),
          speakerHanzi: String(turn.speaker?.hanzi || ''),
          tokens: Array.isArray(turn.answerTokens) && turn.answerTokens.length ? turn.answerTokens.slice() : segmentFlashcardSentence(turn.hanzi, vocabularyHints),
          order: (Number(dialogue.order)||dialogueIndex+1)*100+(Number(turn.order)||turnIndex+1),
          sourceItem: turn
        });
      });
    });
    (entities.passages || []).forEach((passage, passageIndex) => {
      const hanziLines=String(passage.hanzi || '').split(/\n+/u).filter(Boolean);
      const pinyinLines=String(passage.pinyin || '').split(/\n+/u);
      const viLines=String(passage.vi || '').split(/\n+/u);
      hanziLines.forEach((line,lineIndex)=>sentence.push({
        id:`curriculum:new_hsk_course:${lessonKey}:passage:${passage.id || passageIndex+1}-${lineIndex+1}`,
        entityId:`${passage.id || `passage-${passageIndex+1}`}-line-${lineIndex+1}`,
        cardType:'sentence',sentenceKind:'passage',word:line,pinyin:formatPinyin(pinyinLines[lineIndex]||''),meaningVi:String(viLines[lineIndex]||''),
        tokens:segmentFlashcardSentence(line,vocabularyHints),order:9000+passageIndex*100+lineIndex,sourceItem:passage
      }));
    });
    const grammar = [...(entities.grammar || []), ...(entities.languageNotes || [])].map((item,index)=>({
      id:`curriculum:new_hsk_course:${lessonKey}:grammar:${item.id || index+1}`,
      entityId:item.id,cardType:'grammar',word:String(item.structure || item.title || 'Ngữ pháp'),pinyin:'',meaningVi:String(item.explanationVi || item.vi || ''),title:String(item.title || item.structure || 'Ngữ pháp'),
      grammar:{topic:String(item.title || 'Ngữ pháp'),pattern:String(item.structure || item.hanzi || ''),explanation:String(item.explanationVi || item.vi || ''),tips:'',attentions:'',examples:[]},order:Number(item.order)||index+1,sourceItem:item
    }));
    return {
      key: lessonKey,
      title: String(lessonData?.title?.vi || `Bài ${lessonNo}`),
      titleZh: String(lessonData?.title?.hanzi || ''),
      order: Number(lessonNo) || Number(lessonData?.lessonNumber) || 9999,
      kind:'lesson',
      cards:vocabulary,
      content:{vocabulary,sentence,grammar},
      wordCount:vocabulary.length,sentenceCount:sentence.length,grammarCount:grammar.length,
      lessonData
    };
  }

  async function loadFlashcardCurriculumSummary(){
    if(!flashcardCurriculumSummaryPromise){
      flashcardCurriculumSummaryPromise = fetchJson(`${HSK_DATA_BASE}source_summary.json`).catch(error => {
        flashcardCurriculumSummaryPromise = null;
        throw error;
      });
    }
    return flashcardCurriculumSummaryPromise;
  }

  function getFlashcardCurriculumLevels(summary, sourceKey = flashcardLibraryState.curriculumSource){
    if(sourceKey === 'dialogue301') return [];
    if(sourceKey === 'new_hsk_course') return (summary?.course?.levels || []).filter(row => Number(row.level) > 0 && Number(row.readyLessons || 0) > 0).map(row => ({ level: row.level, label: `HSK ${row.level}`, uniqueItemCount: row.readyLessons, status: Number(row.readyLessons) < Number(row.lessonCount) ? 'PARTIAL' : 'READY' }));
    const rows = summary?.sources?.[sourceKey]?.levels || [];
    return rows.filter(level => level?.hasVocabulary !== false && Number(level?.level) > 0);
  }

  function getCurriculumRouteKey(route){
    return String(route?.sectionId || route?.sectionSlug || `${route?.sectionType || 'section'}-${route?.sectionOrder || ''}-${route?.sectionTitle || ''}`);
  }

  function getCurriculumRouteTitle(route){
    const title = String(route?.sectionTitle || route?.sectionTitleZh || '').trim();
    if(title) return title;
    const order = Number(route?.sectionOrder);
    return Number.isFinite(order) ? `Bài ${order}` : 'Bài học';
  }

  function buildFlashcardCurriculumSections(items, sourceKey, level){
    const rows = Array.isArray(items) ? items : [];
    const scopedRoutes = rows.flatMap(item => (Array.isArray(item?.routes) ? item.routes : [])
      .filter(route => String(route?.libraryId || '') === String(sourceKey || '') && Number(route?.levelNo || level) === Number(level))
      .map(route => ({ item, route })));
    const hasLessons = scopedRoutes.some(entry => entry.route?.sectionType === 'lesson');
    const preferredType = hasLessons ? 'lesson' : 'topic';
    const groups = new Map();
    scopedRoutes.filter(entry => entry.route?.sectionType === preferredType).forEach(({ item, route }) => {
      const key = getCurriculumRouteKey(route);
      if(!groups.has(key)) groups.set(key, {
        key,
        title: getCurriculumRouteTitle(route),
        titleZh: String(route?.sectionTitleZh || ''),
        order: Number(route?.sectionOrder) || 9999,
        kind: preferredType,
        cards: [],
        sentenceCards: [],
        grammarCards: [],
        route
      });
      const group = groups.get(key);
      const word = String(item?.word || item?.simplified || '').trim();
      if(word && !group.cards.some(card => card.word === word)){
        group.cards.push({
          id: `curriculum:${sourceKey}:${level}:${key}:word:${word}`,
          cardType: 'vocabulary',
          word,
          pinyin: formatPinyin(item?.pinyin),
          meaningVi: String(item?.meaningVi || item?.translationVi || '').trim(),
          order: Number(route?.orderInSection) || 9999,
          sourceItem: item
        });
      }
      (Array.isArray(item?.examples) ? item.examples : []).forEach((example, exampleIndex) => {
        const chinese = String(example?.chinese || example?.zh || '').trim();
        if(!chinese || group.sentenceCards.some(card => card.word === chinese)) return;
        group.sentenceCards.push({
          id: `curriculum:${sourceKey}:${level}:${key}:sentence:${encodeURIComponent(chinese)}`,
          cardType: 'sentence',
          word: chinese,
          pinyin: formatPinyin(example?.pinyin),
          meaningVi: String(example?.meaning_vi || example?.meaningVi || example?.vietnamese || example?.vi || '').trim(),
          order: (Number(route?.orderInSection) || 9999) * 100 + exampleIndex,
          sourceWord: word,
          tokens: segmentFlashcardSentence(chinese, [word])
        });
      });
    });
    return Array.from(groups.values()).map(group => {
      const vocabulary = group.cards.sort((left, right) => left.order - right.order || left.word.localeCompare(right.word, 'zh-Hans-CN'));
      const sentence = group.sentenceCards.sort((left, right) => left.order - right.order || left.word.localeCompare(right.word, 'zh-Hans-CN'));
      return {
        ...group,
        cards: vocabulary,
        content: { vocabulary, sentence, grammar: group.grammarCards || [] },
        wordCount: vocabulary.length,
        sentenceCount: sentence.length,
        grammarCount: 0
      };
    }).filter(group => group.wordCount || group.sentenceCount)
      .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title, 'vi'));
  }

  function grammarCardFromItem(item, sourceKey, level, lessonKey){
    const examples = (Array.isArray(item?.example) ? item.example : []).map((example, index) => ({
      id: `${item?.id || 'grammar'}-example-${index + 1}`,
      hanzi: String(example?.chinese || example?.hanzi || '').trim(),
      pinyin: formatPinyin(example?.pinyin),
      meaning: String(example?.vietnamese || example?.meaningVi || example?.vi || '').trim()
    })).filter(example => example.hanzi);
    const topic = String(item?.topic || item?.title || 'Ngữ pháp').trim();
    const pattern = String(item?.grammar_syntax || item?.pattern || topic).trim();
    return {
      id: `curriculum:${sourceKey}:${level}:${lessonKey}:grammar:${String(item?.id || item?.item_order || topic)}`,
      cardType: 'grammar',
      word: pattern,
      pinyin: '',
      meaningVi: String(item?.grammar_explanation || item?.explanation || '').trim(),
      title: topic,
      grammar: {
        topic,
        pattern,
        explanation: String(item?.grammar_explanation || item?.explanation || '').trim(),
        tips: String(item?.grammar_tips || item?.tips || '').trim(),
        attentions: String(item?.grammar_attentions || item?.attentions || '').trim(),
        examples
      },
      order: Number(item?.item_order) || 9999
    };
  }

  async function loadFlashcardCurriculumGrammar(sourceKey, level){
    if(!['hsk', 'new_hsk'].includes(sourceKey)) return [];
    try{
      const data = await fetchJson(`${GRAMMAR_DATA_BASE}${sourceKey}_${level}.json`);
      return Array.isArray(data?.items) ? data.items : [];
    }catch(_error){
      return [];
    }
  }

  function attachFlashcardGrammarToLessons(lessons, grammarItems, sourceKey, level){
    const rows = Array.isArray(grammarItems) ? grammarItems : [];
    return (lessons || []).map(lesson => {
      const lessonGrammar = rows.filter(item => Number(item?.from_book_chapter) === Number(lesson.order));
      const grammar = lessonGrammar.map(item => grammarCardFromItem(item, sourceKey, level, lesson.key));
      const content = { ...(lesson.content || {}), grammar };
      return { ...lesson, grammarCards: grammar, grammarCount: grammar.length, content };
    });
  }

  function curriculumContentTypes(lesson){
    const content = lesson?.content || {};
    return [
      { id: 'vocabulary', label: 'Từ vựng', icon: '词', cards: Array.isArray(content.vocabulary) ? content.vocabulary : [] },
      { id: 'sentence', label: 'Câu', icon: '句', cards: Array.isArray(content.sentence) ? content.sentence : [] },
      { id: 'grammar', label: 'Ngữ pháp', icon: '法', cards: Array.isArray(content.grammar) ? content.grammar : [] }
    ].filter(type => type.cards.length);
  }

  function currentFlashcardCurriculumCards(){
    const lesson = flashcardLibraryState.curriculumLesson;
    const type = curriculumContentTypes(lesson).find(row => row.id === flashcardLibraryState.curriculumContentType);
    return type ? type.cards : [];
  }

  async function loadFlashcardCurriculumLessons(options = {}){
    const sourceKey = options.sourceKey || flashcardLibraryState.curriculumSource || 'new_hsk';
    flashcardLibraryState.curriculumLoading = true;
    flashcardLibraryState.curriculumError = '';
    flashcardLibraryState.curriculumLessons = [];
    flashcardLibraryState.curriculumLesson = null;
    flashcardLibraryState.curriculumLessonKey = '';
    try{
      if(sourceKey === 'dialogue301'){
        const lessons = await loadDialogue301Curriculum();
        flashcardLibraryState.curriculumLessons = lessons.map(lesson => ({
          key: String(lesson.lesson_id || `lesson-${lesson.lesson_no || ''}`),
          title: String(lesson.title || lesson.title_zh || `Bài ${lesson.lesson_no || ''}`),
          titleZh: String(lesson.title_zh || ''),
          order: Number(lesson.lesson_no) || 9999,
          kind: 'lesson',
          dataPath: String(lesson.data || ''),
          wordCount: null,
          sentenceCount: null,
          grammarCount: null,
          cards: null,
          content: null
        })).sort((left, right) => left.order - right.order);
      }else if(sourceKey === 'new_hsk_course'){
        const manifest = await loadFlashcardNewHskCourseManifest();
        const levels = getFlashcardCurriculumLevels(manifest, sourceKey);
        if(!levels.length) throw new Error('New 3.0 chưa có bài app-ready.');
        if(!levels.some(row => Number(row.level) === Number(flashcardLibraryState.curriculumLevel))){
          flashcardLibraryState.curriculumLevel = Number(levels[0].level) || 1;
        }
        const level = Number(flashcardLibraryState.curriculumLevel) || 1;
        flashcardLibraryState.curriculumLessons = (manifest.lessons || []).filter(row => Number(row.level) === level && String(row.status || '').includes('ready')).map(row => ({
          key: String(row.id), title: String(row.title?.vi || `Bài ${row.lessonNumber}`), titleZh: String(row.title?.hanzi || ''), order: Number(row.lessonNumber) || 9999, kind:'lesson', dataPath:String(row.path || ''), wordCount:null, sentenceCount:null, grammarCount:null, cards:null, content:null
        })).sort((a,b)=>a.order-b.order);
      }else{
        const summary = await loadFlashcardCurriculumSummary();
        const levels = getFlashcardCurriculumLevels(summary, sourceKey);
        if(!levels.length) throw new Error('Nguồn này chưa có cấp độ từ vựng.');
        if(!levels.some(row => Number(row.level) === Number(flashcardLibraryState.curriculumLevel))){
          flashcardLibraryState.curriculumLevel = Number(levels[0].level) || 1;
        }
        const level = Number(flashcardLibraryState.curriculumLevel) || 1;
        const [data, grammarItems] = await Promise.all([
          fetchJson(`${HSK_DATA_BASE}hsk_${level}.json`),
          loadFlashcardCurriculumGrammar(sourceKey, level)
        ]);
        const lessons = buildFlashcardCurriculumSections(data?.items || [], sourceKey, level);
        flashcardLibraryState.curriculumLessons = attachFlashcardGrammarToLessons(lessons, grammarItems, sourceKey, level);
      }
    }catch(error){
      console.warn('Cannot load flashcard curriculum browser:', error);
      flashcardLibraryState.curriculumError = error?.message || 'Không tải được danh sách bài.';
    }finally{
      flashcardLibraryState.curriculumLoading = false;
    }
  }

  async function openFlashcardCurriculumBrowser(){
    flashcardLibraryState.curriculumBrowserOpen = true;
    flashcardLibraryState.curriculumLesson = null;
    flashcardLibraryState.curriculumLessonKey = '';
    flashcardLibraryState.curriculumQuery = '';
    flashcardLibraryState.curriculumContentType = 'vocabulary';
    await loadFlashcardCurriculumLessons();
    await renderFlashcardLibrary();
  }

  async function selectFlashcardCurriculumSource(sourceKey){
    if(!FLASHCARD_CURRICULUM_SOURCES.some(source => source.key === sourceKey)) return;
    flashcardLibraryState.curriculumSource = sourceKey;
    flashcardLibraryState.curriculumLevel = 1;
    flashcardLibraryState.curriculumScrollTop = 0;
    flashcardLibraryState.curriculumQuery = '';
    flashcardLibraryState.curriculumContentType = 'vocabulary';
    await loadFlashcardCurriculumLessons({ sourceKey });
    await renderFlashcardLibrary();
  }

  async function selectFlashcardCurriculumLevel(level){
    flashcardLibraryState.curriculumLevel = Number(level) || 1;
    flashcardLibraryState.curriculumScrollTop = 0;
    flashcardLibraryState.curriculumQuery = '';
    flashcardLibraryState.curriculumContentType = 'vocabulary';
    await loadFlashcardCurriculumLessons();
    await renderFlashcardLibrary();
  }

  function buildDialogue301CurriculumContent(data, lesson){
    const lessonKey = lesson.key;
    const vocabulary = (Array.isArray(data?.vocabulary) ? data.vocabulary : []).map((item, index) => ({
      id: `curriculum:dialogue301:${lessonKey}:word:${String(item?.id || index + 1)}`,
      cardType: 'vocabulary',
      word: String(item?.zh || item?.word || '').trim(),
      pinyin: formatPinyin(item?.pinyin),
      meaningVi: String(item?.vi || item?.meaningVi || '').trim(),
      order: Number(item?.no) || index + 1,
      sourceItem: item
    })).filter(card => card.word);
    const sentenceRows = [
      ...(Array.isArray(data?.sentences) ? data.sentences : []),
      ...(Array.isArray(data?.dialogue) ? data.dialogue : []),
      ...(Array.isArray(data?.extension) ? data.extension : [])
    ];
    const seen = new Set();
    const sentence = sentenceRows.map((item, index) => {
      const word = String(item?.zh || item?.chinese || '').trim();
      if(!word || seen.has(word)) return null;
      seen.add(word);
      return {
        id: `curriculum:dialogue301:${lessonKey}:sentence:${String(item?.id || index + 1)}`,
        cardType: 'sentence',
        word,
        pinyin: formatPinyin(item?.pinyin),
        meaningVi: String(item?.vi || item?.meaningVi || '').trim(),
        order: Number(item?.turn || item?.no) || index + 1,
        speaker: String(item?.speaker_zh || item?.speaker_vi || '').trim(),
        tokens: segmentFlashcardSentence(word, vocabulary.map(card => card.word)),
        sourceItem: item
      };
    }).filter(Boolean);
    const grammar = (Array.isArray(data?.grammar) ? data.grammar : []).map((item, index) => ({
      id: `curriculum:dialogue301:${lessonKey}:grammar:${String(item?.id || index + 1)}`,
      cardType: 'grammar',
      word: String(item?.title || 'Ngữ pháp').trim(),
      pinyin: '',
      meaningVi: String(item?.content || '').trim(),
      title: String(item?.title || 'Ngữ pháp').trim(),
      grammar: {
        topic: String(item?.title || 'Ngữ pháp').trim(),
        pattern: String(item?.title || '').trim(),
        explanation: String(item?.content || '').trim(),
        tips: '', attentions: '', examples: []
      },
      order: Number(item?.no) || index + 1
    }));
    return { vocabulary, sentence, grammar };
  }

  async function openFlashcardCurriculumLesson(key){
    const lesson = flashcardLibraryState.curriculumLessons.find(item => item.key === key);
    if(!lesson) return;
    flashcardLibraryState.curriculumScrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    flashcardLibraryState.curriculumLoading = true;
    flashcardLibraryState.curriculumError = '';
    await renderFlashcardLibrary();
    try{
      let fullLesson = lesson;
      if(flashcardLibraryState.curriculumSource === 'new_hsk_course' && !lesson.content){
        if(!lesson.dataPath) throw new Error('Bài New 3.0 chưa có đường dẫn dữ liệu.');
        const data = await fetchJson(`../new-hsk-course/data/${lesson.dataPath.replace(/^\.\//, '')}`);
        fullLesson = buildNewHskCourseCurriculum(data, flashcardLibraryState.curriculumLevel, lesson.order);
        const index = flashcardLibraryState.curriculumLessons.findIndex(item => item.key === key);
        if(index >= 0) flashcardLibraryState.curriculumLessons[index] = fullLesson;
      }else if(flashcardLibraryState.curriculumSource === 'dialogue301' && !lesson.content){
        if(!lesson.dataPath) throw new Error('Bài 301 chưa có đường dẫn dữ liệu.');
        const data = await fetchJson(`../../lessons-301-v2/${lesson.dataPath.replace(/^\.\//, '')}`);
        const content = buildDialogue301CurriculumContent(data, lesson);
        fullLesson = {
          ...lesson,
          cards: content.vocabulary,
          content,
          wordCount: content.vocabulary.length,
          sentenceCount: content.sentence.length,
          grammarCount: content.grammar.length
        };
        const index = flashcardLibraryState.curriculumLessons.findIndex(item => item.key === key);
        if(index >= 0) flashcardLibraryState.curriculumLessons[index] = fullLesson;
      }
      const types = curriculumContentTypes(fullLesson);
      if(!types.length) throw new Error('Bài này chưa có dữ liệu thẻ phù hợp.');
      flashcardLibraryState.curriculumLesson = fullLesson;
      flashcardLibraryState.curriculumLessonKey = key;
      flashcardLibraryState.curriculumContentType = types.some(type => type.id === flashcardLibraryState.curriculumContentType)
        ? flashcardLibraryState.curriculumContentType
        : types[0].id;
      const cards = currentFlashcardCurriculumCards();
      flashcardLibraryState.curriculumCountMode = cards.length > 10 ? '10' : 'all';
      flashcardLibraryState.curriculumCustomCount = Math.min(10, cards.length || 10);
      flashcardLibraryState.curriculumSelectedIds = new Set(cards.map(card => card.id));
      flashcardLibraryState.curriculumQuery = '';
    }catch(error){
      flashcardLibraryState.curriculumError = error?.message || 'Không tải được nội dung của bài.';
    }finally{
      flashcardLibraryState.curriculumLoading = false;
      await renderFlashcardLibrary();
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }

  function getFlashcardCurriculumSelectedCards(){
    const cards = currentFlashcardCurriculumCards();
    const mode = String(flashcardLibraryState.curriculumCountMode || 'all');
    if(mode === 'manual') return cards.filter(card => flashcardLibraryState.curriculumSelectedIds.has(card.id));
    if(mode === 'all') return cards.slice();
    const count = mode === 'custom' ? Number(flashcardLibraryState.curriculumCustomCount) : Number(mode);
    const safeCount = Math.max(1, Math.min(cards.length, Number.isFinite(count) ? Math.floor(count) : cards.length));
    return cards.slice(0, safeCount);
  }

  function curriculumLessonCountLabel(lesson){
    const parts = [];
    if(Number(lesson?.wordCount) > 0) parts.push(`${lesson.wordCount} từ`);
    if(Number(lesson?.sentenceCount) > 0) parts.push(`${lesson.sentenceCount} câu`);
    if(Number(lesson?.grammarCount) > 0) parts.push(`${lesson.grammarCount} NP`);
    return parts.join(' · ') || (lesson?.wordCount == null ? 'Mở' : 'Chưa có dữ liệu');
  }

  function curriculumContentLabel(type, count){
    if(type === 'sentence') return `${count} câu`;
    if(type === 'grammar') return `${count} ngữ pháp`;
    return `${count} từ vựng`;
  }

  function curriculumCardSearchText(card){
    const grammar = card?.grammar || {};
    return [card?.word, card?.pinyin, card?.meaningVi, card?.title, grammar.topic, grammar.pattern, ...(grammar.examples || []).flatMap(row => [row.hanzi, row.pinyin, row.meaning])].join(' ');
  }

  function renderFlashcardCurriculumBrowser(){
    const sourceMeta = getFlashcardCurriculumSourceMeta();
    const lesson = flashcardLibraryState.curriculumLesson;
    const contentTypes = curriculumContentTypes(lesson);
    const currentType = contentTypes.find(type => type.id === flashcardLibraryState.curriculumContentType) || contentTypes[0] || { id: 'vocabulary', label: 'Từ vựng', cards: [] };
    const selectedCards = getFlashcardCurriculumSelectedCards();
    const allCards = currentType.cards || [];
    const query = normalizeLibrarySearch(flashcardLibraryState.curriculumQuery || '');
    const visibleManualCards = allCards.filter(card => !query || normalizeLibrarySearch(curriculumCardSearchText(card)).includes(query));
    return `<div class="flashcard-library-page flashcard-curriculum-page">
      <header class="flashcard-library-subpage-header flashcard-library-subpage-header--plain flashcard-curriculum-header">
        <button type="button" class="flashcard-library-back" ${lesson ? 'data-flashcard-curriculum-lesson-back' : 'data-flashcard-curriculum-close'} aria-label="Quay lại">←</button>
        <div><span>课 · HSK & GIÁO TRÌNH</span><h2>${escapeHtml(lesson?.title || 'Chọn bài để tạo phiên')}</h2><p>${lesson ? `${curriculumLessonCountLabel(lesson)} · chọn loại nội dung và số lượng` : 'Tạo thẻ từ từ vựng, câu và ngữ pháp ngay trong bài.'}</p></div>
      </header>
      ${flashcardLibraryState.curriculumError ? `<p class="flashcard-library-message is-error">${escapeHtml(flashcardLibraryState.curriculumError)}</p>` : ''}
      ${lesson ? `
        <section class="flashcard-curriculum-lesson-panel">
          <div class="flashcard-curriculum-lesson-meta"><b>${escapeHtml(lesson.titleZh || sourceMeta.label)}</b><span>${escapeHtml(curriculumLessonCountLabel(lesson))}</span></div>
          <div class="flashcard-curriculum-content-tabs" role="tablist" aria-label="Chọn loại thẻ">
            ${contentTypes.map(type => `<button type="button" role="tab" aria-selected="${type.id === currentType.id}" class="${type.id === currentType.id ? 'active' : ''}" data-flashcard-curriculum-content="${type.id}"><span>${type.icon}</span><b>${escapeHtml(type.label)}</b><small>${type.cards.length}</small></button>`).join('')}
          </div>
          <div class="flashcard-curriculum-content-note"><b>${escapeHtml(currentType.label)}</b><span>${escapeHtml(curriculumContentLabel(currentType.id, allCards.length))}</span></div>
          <div class="flashcard-curriculum-count" role="group" aria-label="Chọn số thẻ">
            ${(allCards.length > 10 ? ['10','20','30','all','custom','manual'] : ['all','manual']).map(mode => {
              const labels = { all: 'Tất cả', custom: 'Tự nhập', manual: 'Tự chọn' };
              const disabled = /^\d+$/.test(mode) && Number(mode) > allCards.length;
              return `<button type="button" class="${flashcardLibraryState.curriculumCountMode === mode ? 'active' : ''}" data-flashcard-curriculum-count="${mode}" ${disabled ? 'disabled' : ''}>${labels[mode] || mode}</button>`;
            }).join('')}
          </div>
          ${flashcardLibraryState.curriculumCountMode === 'custom' ? `<label class="flashcard-curriculum-custom-count">Số thẻ muốn học<input type="number" min="1" max="${allCards.length}" value="${escapeHtml(flashcardLibraryState.curriculumCustomCount)}" data-flashcard-curriculum-custom-count><small>Tối đa ${allCards.length} thẻ</small></label>` : ''}
          ${flashcardLibraryState.curriculumCountMode === 'manual' ? `
            <div class="flashcard-curriculum-manual-tools">
              <label><span aria-hidden="true">⌕</span><input type="search" value="${escapeHtml(flashcardLibraryState.curriculumQuery || '')}" data-flashcard-curriculum-search placeholder="Tìm nội dung, pinyin, nghĩa..."></label>
              <button type="button" data-flashcard-curriculum-select-all>${visibleManualCards.length && visibleManualCards.every(card => flashcardLibraryState.curriculumSelectedIds.has(card.id)) ? 'Bỏ chọn đang hiện' : 'Chọn tất cả đang hiện'}</button>
            </div>
            <div class="flashcard-curriculum-word-list flashcard-curriculum-word-list--${currentType.id}">
              ${visibleManualCards.length ? visibleManualCards.map(card => `<label class="flashcard-curriculum-word flashcard-curriculum-word--${currentType.id} ${flashcardLibraryState.curriculumSelectedIds.has(card.id) ? 'is-selected' : ''}"><input type="checkbox" data-flashcard-curriculum-card="${escapeHtml(card.id)}" ${flashcardLibraryState.curriculumSelectedIds.has(card.id) ? 'checked' : ''}><span><b>${escapeHtml(card.title || card.word)}</b>${card.pinyin ? `<i>${escapeHtml(card.pinyin)}</i>` : ''}<small>${escapeHtml(card.meaningVi || card.grammar?.pattern || 'Chưa có mô tả')}</small></span></label>`).join('') : '<p class="flashcard-library-empty">Không tìm thấy nội dung phù hợp.</p>'}
            </div>` : `
            <div class="flashcard-curriculum-selection-preview flashcard-curriculum-selection-preview--${currentType.id}">
              ${selectedCards.slice(0, 12).map(card => `<span><b>${escapeHtml(card.title || card.word)}</b><small>${escapeHtml(card.pinyin || (card.cardType === 'grammar' ? 'Ngữ pháp' : ''))}</small></span>`).join('')}
              ${selectedCards.length > 12 ? `<span class="is-more">+${selectedCards.length - 12}</span>` : ''}
            </div>`}
          <button type="button" class="flashcard-library-primary flashcard-curriculum-start" data-flashcard-curriculum-start ${selectedCards.length ? '' : 'disabled'}>Tạo phiên ${escapeHtml(currentType.label)} · ${selectedCards.length} thẻ</button>
        </section>` : `
        <section class="flashcard-curriculum-source-tabs" aria-label="Chọn giáo trình">
          ${FLASHCARD_CURRICULUM_SOURCES.map(source => `<button type="button" class="${source.key === flashcardLibraryState.curriculumSource ? 'active' : ''}" data-flashcard-curriculum-source="${source.key}"><b>${escapeHtml(source.label)}</b><small>${escapeHtml(source.description)}</small></button>`).join('')}
        </section>
        ${flashcardLibraryState.curriculumSource !== 'dialogue301' ? `<div class="flashcard-curriculum-level-tabs" data-flashcard-curriculum-level-host></div>` : ''}
        ${flashcardLibraryState.curriculumLoading ? '<div class="flashcard-curriculum-loading"><span class="spinner"></span><b>Đang tải danh sách bài...</b></div>' : `
          <section class="flashcard-curriculum-lessons">
            <header><div><span>${escapeHtml(sourceMeta.label)}</span><h3>Chọn bài có nội dung thẻ</h3></div><small>${flashcardLibraryState.curriculumLessons.length} bài/chủ đề</small></header>
            <div>${flashcardLibraryState.curriculumLessons.length ? flashcardLibraryState.curriculumLessons.map(item => `<button type="button" class="flashcard-curriculum-lesson-card" data-flashcard-curriculum-lesson="${escapeHtml(item.key)}"><span class="flashcard-curriculum-lesson-no">${Number.isFinite(item.order) && item.order < 9999 ? escapeHtml(item.order) : '课'}</span><span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.titleZh || sourceMeta.label)}</small></span><i>${escapeHtml(curriculumLessonCountLabel(item))} ›</i></button>`).join('') : '<p class="flashcard-library-empty">Chưa có bài phù hợp ở cấp này.</p>'}</div>
          </section>`}
      `}
    </div>`;
  }

  async function hydrateFlashcardCurriculumLevels(){
    if(!flashcardLibraryState.curriculumBrowserOpen || flashcardLibraryState.curriculumLesson || flashcardLibraryState.curriculumSource === 'dialogue301') return;
    const host = flashcardLibraryView?.querySelector('[data-flashcard-curriculum-level-host]');
    if(!host) return;
    try{
      const summary = flashcardLibraryState.curriculumSource === 'new_hsk_course'
        ? await loadFlashcardNewHskCourseManifest()
        : await loadFlashcardCurriculumSummary();
      if(!host.isConnected) return;
      const levels = getFlashcardCurriculumLevels(summary);
      host.innerHTML = levels.map(level => `<button type="button" class="${Number(level.level) === Number(flashcardLibraryState.curriculumLevel) ? 'active' : ''}" data-flashcard-curriculum-level="${escapeHtml(level.level)}"><b>${escapeHtml(level.label || `Cấp ${level.level}`)}</b><small>${level.status === 'PARTIAL' ? 'Chưa đủ dữ liệu' : `${Number(level.uniqueItemCount || 0).toLocaleString('vi-VN')} từ`}</small></button>`).join('');
    }catch(error){
      host.innerHTML = `<p class="flashcard-library-empty">${escapeHtml(error?.message || 'Không tải được cấp độ.')}</p>`;
    }
  }

  function startFlashcardCurriculumSession(){
    const cards = getFlashcardCurriculumSelectedCards();
    const lesson = flashcardLibraryState.curriculumLesson;
    if(!lesson || !cards.length) return;
    const contentType = curriculumContentTypes(lesson).find(type => type.id === flashcardLibraryState.curriculumContentType);
    const contentLabel = contentType?.label || 'Thẻ';
    createFlashcardSessionFromCards(cards, `${lesson.title} · ${contentLabel}`, {
      origin: 'curriculum-library',
      contextKey: `curriculum:${flashcardLibraryState.curriculumSource}:${flashcardLibraryState.curriculumLevel}:${lesson.key}:${flashcardLibraryState.curriculumContentType}`,
      contextLabel: `${lesson.title} · ${contentLabel}`
    });
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
          groupId: raw.groupId ? String(raw.groupId) : null,
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

  async function importFlashcardGroups(groups){
    if(!Array.isArray(groups) || !groups.length) return;
    const db = await openFlashcardDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(FLASHCARD_GROUP_STORE, 'readwrite');
      const store = tx.objectStore(FLASHCARD_GROUP_STORE);
      const now = new Date().toISOString();
      groups.forEach(raw => store.put({
        id: String(raw?.id || makeLocalId('group')),
        name: String(raw?.name || 'Nhóm đã nhập'),
        description: String(raw?.description || ''),
        createdAt: raw?.createdAt || now,
        updatedAt: raw?.updatedAt || now
      }));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Không nhập được nhóm bộ thẻ.'));
      tx.onabort = () => reject(tx.error || new Error('Giao dịch bị hủy.'));
    });
    db.close();
  }

  function navigateStudyRoute(routeName, tabName){
    const currentRoute = new URLSearchParams(window.location.search).get('study') || 'hub';
    const sameRoute = currentRoute === routeName || (routeName === 'radicals' && currentRoute === 'radical');
    if(sameRoute){
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
    if(!tabFlashcards){
      tabFlashcards = document.createElement('button');
      tabFlashcards.type = 'button';
      tabFlashcards.id = 'studyTabFlashcards';
      tabFlashcards.className = tabHsk.className;
      tabFlashcards.setAttribute('role', 'tab');
      tabFlashcards.setAttribute('aria-selected', 'false');
      tabFlashcards.textContent = 'Thẻ';
      tabHost.appendChild(tabFlashcards);
    }
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
    flashcardLibraryView.addEventListener('pointerdown', handleFlashcardDeckPointerDown);
    flashcardLibraryView.addEventListener('pointermove', handleFlashcardDeckPointerMove);
    flashcardLibraryView.addEventListener('pointerup', cancelFlashcardDeckLongPress);
    flashcardLibraryView.addEventListener('pointercancel', cancelFlashcardDeckLongPress);
    flashcardLibraryView.addEventListener('contextmenu', event => {
      if(event.target.closest('[data-flashcard-deck-card]')) event.preventDefault();
    });
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
    const groupItems = items.filter(item => item.type === 'group-bundle');
    const deckItems = items.filter(item => item.type === 'deck');
    const cardItems = items.filter(item => item.type === 'cards');
    const renderItem = item => {
      const isGroup = item.type === 'group-bundle';
      const isDeck = item.type === 'deck';
      const title = isGroup
        ? (item.group?.name || 'Nhóm bộ thẻ')
        : (isDeck ? (item.data?.name || 'Bộ thẻ') : `${item.entries?.length || 0} thẻ từ ${item.sourceDeckName || 'bộ cũ'}`);
      const detail = isGroup
        ? `${item.decks?.length || 0} bộ · ${(item.decks || []).reduce((sum, deck) => sum + (deck.cards?.length || 0), 0)} thẻ`
        : (isDeck ? `${item.data?.cards?.length || 0} thẻ` : (item.entries || []).slice(0,3).map(entry => entry.card?.word || '').filter(Boolean).join(' · '));
      const label = isGroup ? 'NHÓM' : (isDeck ? 'BỘ THẺ' : 'THẺ');
      return `<article class="flashcard-trash-card">
        <div><span>${label}</span><h4>${escapeHtml(title)}</h4><p>${escapeHtml(detail || 'Không có mô tả')}</p><small>Đã xóa ${escapeHtml(formatLibraryDate(item.deletedAt))} · còn ${getTrashDaysLeft(item)} ngày</small></div>
        <div class="flashcard-trash-actions"><button type="button" data-flashcard-trash-restore="${escapeHtml(item.id)}">Khôi phục</button><button type="button" class="danger" data-flashcard-trash-delete="${escapeHtml(item.id)}">Xóa vĩnh viễn</button></div>
      </article>`;
    };
    return `<div class="flashcard-library-page flashcard-trash-page">
      <header class="flashcard-library-header"><button type="button" class="flashcard-library-back" data-flashcard-trash-back>← Thư viện</button><div><span>THÙNG RÁC</span><h2>Khôi phục dữ liệu đã xóa</h2><p>Các mục tự động bị xóa vĩnh viễn sau 30 ngày.</p></div></header>
      ${flashcardLibraryState.message ? `<p class="flashcard-library-message">${escapeHtml(flashcardLibraryState.message)}</p>` : ''}
      <section class="flashcard-trash-toolbar"><b>${items.length} mục</b><div><button type="button" data-flashcard-trash-restore-all ${items.length ? '' : 'disabled'}>Khôi phục tất cả</button><button type="button" class="danger" data-flashcard-trash-clear ${items.length ? '' : 'disabled'}>Dọn sạch</button></div></section>
      <section class="flashcard-trash-group"><h3>Nhóm đã xóa <span>${groupItems.length}</span></h3>${groupItems.length ? groupItems.map(renderItem).join('') : '<p class="flashcard-library-empty">Không có nhóm đã xóa.</p>'}</section>
      <section class="flashcard-trash-group"><h3>Bộ đã xóa <span>${deckItems.length}</span></h3>${deckItems.length ? deckItems.map(renderItem).join('') : '<p class="flashcard-library-empty">Không có bộ thẻ đã xóa.</p>'}</section>
      <section class="flashcard-trash-group"><h3>Thẻ đã xóa <span>${cardItems.length}</span></h3>${cardItems.length ? cardItems.map(renderItem).join('') : '<p class="flashcard-library-empty">Không có thẻ đã xóa.</p>'}</section>
    </div>`;
  }

  function getFlashcardLibrarySortLabel(mode = flashcardLibraryState.sortMode){
    return ({
      'updated-desc': 'Mới sửa gần nhất',
      'studied-desc': 'Học gần nhất',
      'name-asc': 'Tên A–Z',
      'cards-desc': 'Nhiều thẻ nhất',
      'hard-desc': 'Nhiều thẻ Khó nhất',
      'review-desc': 'Nhiều thẻ Ôn nhất'
    })[mode] || 'Mới sửa gần nhất';
  }

  function getFlashcardDeckPriorityLabel(deckStats){
    if(Number(deckStats?.review || 0) > 0) return { className: 'review', label: `Cần ôn ${deckStats.review}` };
    if(Number(deckStats?.hard || 0) > 0) return { className: 'hard', label: `Khó ${deckStats.hard}` };
    if(Number(deckStats?.unseen || 0) === Number(deckStats?.total || 0) && Number(deckStats?.total || 0) > 0) return { className: 'new', label: 'Chưa học' };
    if(Number(deckStats?.total || 0) > 0 && Number(deckStats?.unseen || 0) === 0) return { className: 'done', label: 'Đã học' };
    return { className: 'neutral', label: `${Number(deckStats?.total || 0)} thẻ` };
  }


  function clearFlashcardDeckSelection(){
    flashcardLibraryState.deckSelectionMode = false;
    flashcardLibraryState.selectedDeckIds.clear();
  }

  function toggleFlashcardDeckSelection(deckId, forceSelected){
    if(!deckId) return;
    const selected = flashcardLibraryState.selectedDeckIds;
    const shouldSelect = typeof forceSelected === 'boolean' ? forceSelected : !selected.has(deckId);
    if(shouldSelect) selected.add(deckId);
    else selected.delete(deckId);
  }

  function getPendingMovingDeckIds(){
    const ids = Array.isArray(flashcardLibraryState.movingDeckIds)
      ? flashcardLibraryState.movingDeckIds.filter(Boolean)
      : [];
    if(ids.length) return [...new Set(ids)];
    return flashcardLibraryState.movingDeckId ? [flashcardLibraryState.movingDeckId] : [];
  }

  function clearPendingMovingDecks(){
    flashcardLibraryState.movingDeckId = '';
    flashcardLibraryState.movingDeckIds = [];
  }

  async function moveFlashcardDecksToGroup(deckIds, groupId){
    const ids = new Set((deckIds || []).filter(Boolean));
    const decks = flashcardLibraryState.decks.filter(deck => ids.has(deck.id));
    for(const deck of decks){
      await saveCustomDeck({ ...deck, groupId: groupId || null });
    }
    return decks;
  }

  function cancelFlashcardDeckLongPress(){
    if(flashcardDeckLongPressTimer){
      window.clearTimeout(flashcardDeckLongPressTimer);
      flashcardDeckLongPressTimer = 0;
    }
    flashcardDeckLongPressPointerId = null;
    flashcardDeckLongPressStart = null;
  }

  function handleFlashcardDeckPointerDown(event){
    if(event.button !== undefined && event.button !== 0) return;
    if(flashcardLibraryState.deckSelectionMode) return;
    if(event.target.closest('.flashcard-custom-deck-menu')) return;
    const card = event.target.closest('[data-flashcard-deck-card]');
    if(!card) return;
    const deckId = card.dataset.flashcardDeckCard || '';
    if(!deckId) return;
    cancelFlashcardDeckLongPress();
    flashcardDeckLongPressTriggered = false;
    flashcardDeckLongPressPointerId = event.pointerId;
    flashcardDeckLongPressStart = { x: event.clientX, y: event.clientY, deckId };
    flashcardDeckLongPressTimer = window.setTimeout(async () => {
      flashcardDeckLongPressTimer = 0;
      flashcardDeckLongPressTriggered = true;
      flashcardSuppressClickUntil = Date.now() + 800;
      flashcardLibraryState.deckSelectionMode = true;
      toggleFlashcardDeckSelection(deckId, true);
      try{ window.navigator?.vibrate?.(25); }catch(_err){}
      await renderFlashcardLibrary();
    }, FLASHCARD_DECK_LONG_PRESS_MS);
  }

  function handleFlashcardDeckPointerMove(event){
    if(!flashcardDeckLongPressTimer || event.pointerId !== flashcardDeckLongPressPointerId || !flashcardDeckLongPressStart) return;
    const dx = Math.abs(event.clientX - flashcardDeckLongPressStart.x);
    const dy = Math.abs(event.clientY - flashcardDeckLongPressStart.y);
    if(dx > 12 || dy > 12) cancelFlashcardDeckLongPress();
  }

  function getFlashcardGroupSummary(groupId){
    const decks = flashcardLibraryState.decks.filter(deck => deck.groupId === groupId);
    return {
      decks,
      deckCount: decks.length,
      cardCount: decks.reduce((sum, deck) => sum + (deck.cards?.length || 0), 0)
    };
  }

  function renderFlashcardCustomDeckCard(row){
    const { deck, stats: deckStats } = row;
    const priority = getFlashcardDeckPriorityLabel(deckStats);
    const group = flashcardLibraryState.groups.find(item => item.id === deck.groupId);
    const selectionMode = flashcardLibraryState.deckSelectionMode;
    const selected = flashcardLibraryState.selectedDeckIds.has(deck.id);
    return `
      <article class="flashcard-custom-deck-card ${selectionMode ? 'is-selection-mode' : ''} ${selected ? 'is-selected' : ''}" data-flashcard-deck-card="${escapeHtml(deck.id)}" aria-selected="${selected}">
        <button type="button" class="flashcard-deck-select-toggle" data-flashcard-deck-select="${escapeHtml(deck.id)}" aria-label="${selected ? 'Bỏ chọn' : 'Chọn'} bộ ${escapeHtml(deck.name)}" aria-pressed="${selected}"><span aria-hidden="true">${selected ? '✓' : ''}</span></button>
        <div class="flashcard-custom-deck-card__head">
          <span class="flashcard-custom-deck-card__icon" aria-hidden="true">卡</span>
          <button type="button" class="flashcard-custom-deck-card__title" data-flashcard-deck-open="${escapeHtml(deck.id)}">
            <strong>${escapeHtml(deck.name)}</strong>
            <span>${escapeHtml(deck.description || 'Không có mô tả')}</span>
          </button>
          <details class="flashcard-custom-deck-menu">
            <summary aria-label="Mở tùy chọn bộ ${escapeHtml(deck.name)}">⋯</summary>
            <div>
              <button type="button" data-flashcard-deck-open="${escapeHtml(deck.id)}">Xem chi tiết</button>
              <button type="button" data-flashcard-deck-edit="${escapeHtml(deck.id)}">Sửa bộ thẻ</button>
              <button type="button" data-flashcard-deck-move="${escapeHtml(deck.id)}">Di chuyển vào nhóm</button>
              <button type="button" class="danger" data-flashcard-deck-delete="${escapeHtml(deck.id)}">Chuyển vào thùng rác</button>
            </div>
          </details>
        </div>
        <div class="flashcard-custom-deck-card__overview">
          <span>${deckStats.total} thẻ${group ? ` · ${escapeHtml(group.name)}` : ''}</span>
          <span class="status ${priority.className}">${escapeHtml(priority.label)}</span>
        </div>
        <div class="flashcard-custom-deck-card__stats" aria-label="Thống kê bộ thẻ">
          <span class="easy">Dễ <b>${deckStats.easy}</b></span>
          <span class="review">Ôn <b>${deckStats.review}</b></span>
          <span class="hard">Khó <b>${deckStats.hard}</b></span>
          <span class="unseen">Mới <b>${deckStats.unseen}</b></span>
        </div>
        <div class="flashcard-custom-deck-card__meta">
          <small>Học gần nhất ${escapeHtml(formatLibraryDate(deckStats.lastStudiedAt))}</small>
          <small>Sửa ${escapeHtml(formatLibraryDate(deck.updatedAt))}</small>
        </div>
        <button type="button" class="flashcard-custom-deck-card__study" data-flashcard-deck-study="${escapeHtml(deck.id)}" ${deckStats.total ? '' : 'disabled'}>Học bộ này</button>
      </article>`;
  }

  function renderFlashcardGroupCard(group){
    const summary = getFlashcardGroupSummary(group.id);
    return `
      <article class="flashcard-group-card">
        <button type="button" class="flashcard-group-card__open" data-flashcard-group-open="${escapeHtml(group.id)}">
          <span class="flashcard-group-card__icon" aria-hidden="true">📁</span>
          <span class="flashcard-group-card__copy">
            <strong>${escapeHtml(group.name)}</strong>
            <small>${escapeHtml(group.description || `${summary.deckCount} bộ · ${summary.cardCount} thẻ`)}</small>
          </span>
          <span class="flashcard-group-card__count">${summary.deckCount} bộ</span>
          <i aria-hidden="true">›</i>
        </button>
        <details class="flashcard-group-menu">
          <summary aria-label="Tùy chọn nhóm ${escapeHtml(group.name)}">⋯</summary>
          <div>
            <button type="button" data-flashcard-group-edit="${escapeHtml(group.id)}">Đổi tên nhóm</button>
            <button type="button" data-flashcard-group-export="${escapeHtml(group.id)}">Xuất cả nhóm</button>
            <button type="button" class="danger" data-flashcard-group-delete="${escapeHtml(group.id)}">Xóa nhóm</button>
          </div>
        </details>
      </article>`;
  }

  function renderFlashcardGroupEditorOverlay(){
    const editor = flashcardLibraryState.editingGroup;
    if(!editor) return '';
    return `
      <div class="flashcard-group-sheet-backdrop" data-flashcard-group-editor-backdrop>
        <section class="flashcard-group-sheet" role="dialog" aria-modal="true" aria-label="${editor.isNew ? 'Tạo nhóm' : 'Sửa nhóm'}">
          <header><div><span>NHÓM BỘ THẺ</span><h3>${editor.isNew ? 'Tạo nhóm mới' : 'Đổi tên nhóm'}</h3></div><button type="button" data-flashcard-group-editor-cancel aria-label="Đóng">×</button></header>
          <label>Tên nhóm<input type="text" data-flashcard-group-name value="${escapeHtml(editor.name || '')}" placeholder="Ví dụ: test"></label>
          <label>Mô tả <small>không bắt buộc</small><textarea rows="2" data-flashcard-group-description placeholder="Ghi chú ngắn về nhóm">${escapeHtml(editor.description || '')}</textarea></label>
          <div class="flashcard-group-sheet__actions"><button type="button" data-flashcard-group-editor-cancel>Hủy</button><button type="button" class="primary" data-flashcard-group-save>${editor.isNew ? 'Tạo nhóm' : 'Lưu thay đổi'}</button></div>
        </section>
      </div>`;
  }

  function renderFlashcardDeckMoveOverlay(){
    if(flashcardLibraryState.editingGroup) return '';
    const movingIds = getPendingMovingDeckIds();
    const decks = flashcardLibraryState.decks.filter(item => movingIds.includes(item.id));
    if(!decks.length) return '';
    const currentGroupIds = new Set(decks.map(deck => deck.groupId || ''));
    const sharedGroupId = currentGroupIds.size === 1 ? [...currentGroupIds][0] : null;
    const heading = decks.length === 1 ? decks[0].name : `${decks.length} bộ đã chọn`;
    return `
      <div class="flashcard-group-sheet-backdrop" data-flashcard-deck-move-backdrop>
        <section class="flashcard-group-sheet" role="dialog" aria-modal="true" aria-label="Di chuyển bộ thẻ">
          <header><div><span>${decks.length === 1 ? 'DI CHUYỂN BỘ' : 'DI CHUYỂN NHIỀU BỘ'}</span><h3>${escapeHtml(heading)}</h3></div><button type="button" data-flashcard-deck-move-cancel aria-label="Đóng">×</button></header>
          ${decks.length > 1 ? `<p class="flashcard-group-sheet__hint">Chọn một nhóm đích cho toàn bộ ${decks.length} bộ thẻ.</p>` : ''}
          <div class="flashcard-group-target-list">
            <button type="button" class="${sharedGroupId === '' ? 'active' : ''}" data-flashcard-deck-group-target=""><span>Không phân nhóm</span><i>${sharedGroupId === '' ? '✓' : ''}</i></button>
            ${flashcardLibraryState.groups.map(group => `<button type="button" class="${sharedGroupId === group.id ? 'active' : ''}" data-flashcard-deck-group-target="${escapeHtml(group.id)}"><span>📁 ${escapeHtml(group.name)}</span><i>${sharedGroupId === group.id ? '✓' : ''}</i></button>`).join('')}
          </div>
          <button type="button" class="flashcard-group-create-inline" data-flashcard-group-new>＋ Tạo nhóm mới</button>
        </section>
      </div>`;
  }

  function getAiPromptMeta(){
    const api = window.TiengTrungAiPromptTemplates;
    const type = flashcardLibraryState.aiPromptType || 'vocabulary';
    return api?.TYPE_META?.[type] || { label: 'Từ vựng', icon: '词', inputLabel: 'Dữ liệu đầu vào', inputPlaceholder: '', countLabel: 'Số lượng' };
  }

  function getAiPromptOutput(){
    const api = window.TiengTrungAiPromptTemplates;
    if(!api?.build) return 'Không tải được bộ mẫu prompt.';
    return api.build(flashcardLibraryState.aiPromptType, flashcardLibraryState.aiPromptFields || {});
  }

  function renderFlashcardAiPromptBuilder(){
    const api = window.TiengTrungAiPromptTemplates;
    const meta = getAiPromptMeta();
    const fields = flashcardLibraryState.aiPromptFields || {};
    const output = getAiPromptOutput();
    const types = Object.entries(api?.TYPE_META || {});
    return `<div class="flashcard-library-page flashcard-ai-prompt-page">
      <header class="flashcard-library-subpage-header flashcard-library-subpage-header--plain flashcard-ai-prompt-header">
        <button type="button" class="flashcard-library-back" data-flashcard-ai-close aria-label="Quay lại">←</button>
        <div><span>AI PROMPT BUILDER</span><h2>Tạo nội dung bằng AI</h2><p>Nhập ít thông tin, nhận prompt hoàn chỉnh để sao chép sang ChatGPT hoặc AI khác.</p></div>
      </header>
      <section class="flashcard-ai-prompt-card">
        <div class="flashcard-ai-type-tabs" role="tablist" aria-label="Chọn loại nội dung">
          ${types.map(([id, row]) => `<button type="button" class="${id === flashcardLibraryState.aiPromptType ? 'active' : ''}" data-flashcard-ai-type="${id}"><span>${row.icon}</span><b>${escapeHtml(row.label)}</b></button>`).join('')}
        </div>
        <div class="flashcard-ai-fields">
          <label><span>Trình độ</span><input type="text" data-flashcard-ai-field="level" value="${escapeHtml(fields.level || '')}" placeholder="Ví dụ: HSK 1"></label>
          <label><span>Chủ đề / bài</span><input type="text" data-flashcard-ai-field="topic" value="${escapeHtml(fields.topic || '')}" placeholder="Ví dụ: New 3.0 · HSK 1 · Bài 1"></label>
          <label><span>Chế độ xử lý</span><select data-flashcard-ai-field="operation"><option value="create" ${fields.operation === 'create' ? 'selected' : ''}>Tạo mới</option><option value="enrich" ${fields.operation === 'enrich' ? 'selected' : ''}>Bổ sung trường thiếu</option><option value="review" ${fields.operation === 'review' ? 'selected' : ''}>Kiểm tra và đề xuất patch</option></select></label>
          <label><span>${escapeHtml(meta.countLabel || 'Số lượng')}</span><input type="number" min="1" max="500" data-flashcard-ai-field="count" value="${escapeHtml(fields.count || 10)}"></label>
          <label><span>Từ ngoài phạm vi tối đa</span><input type="number" min="0" max="100" data-flashcard-ai-field="maxOutOfScopeWords" value="${escapeHtml(fields.maxOutOfScopeWords ?? 0)}"></label>
          <label class="is-wide"><span>${escapeHtml(meta.inputLabel || 'Dữ liệu đầu vào')}</span><textarea rows="8" data-flashcard-ai-field="inputText" placeholder="${escapeHtml(meta.inputPlaceholder || '')}">${escapeHtml(fields.inputText || '')}</textarea><small>Dán dữ liệu gốc; AI phải giữ nguyên trường đã có khi chọn Bổ sung.</small></label>
          <label class="is-wide"><span>Từ được phép dùng <small>không bắt buộc</small></span><textarea rows="4" data-flashcard-ai-field="allowedVocabulary" placeholder="Mỗi từ hoặc ID một dòng">${escapeHtml(fields.allowedVocabulary || '')}</textarea></label>
          <label class="is-wide"><span>Ngữ pháp được phép dùng <small>không bắt buộc</small></span><textarea rows="3" data-flashcard-ai-field="allowedGrammar" placeholder="Mỗi mẫu hoặc ID một dòng">${escapeHtml(fields.allowedGrammar || '')}</textarea></label>
          <label class="is-wide"><span>Từ bắt buộc <small>không bắt buộc</small></span><textarea rows="3" data-flashcard-ai-field="requiredVocabulary" placeholder="Các từ phải xuất hiện hoặc phải được xử lý">${escapeHtml(fields.requiredVocabulary || '')}</textarea></label>
          <label class="is-wide"><span>Ngữ pháp bắt buộc <small>không bắt buộc</small></span><textarea rows="3" data-flashcard-ai-field="requiredGrammar" placeholder="Các mẫu bắt buộc phải tham chiếu">${escapeHtml(fields.requiredGrammar || '')}</textarea></label>
          <label class="is-wide"><span>Yêu cầu bổ sung <small>không bắt buộc</small></span><textarea rows="4" data-flashcard-ai-field="requirements" placeholder="Ví dụ: tạo practicePlan; không tự đoán bộ thủ; giữ sourceRefs...">${escapeHtml(fields.requirements || '')}</textarea></label>
        </div>
      </section>
      <section class="flashcard-ai-paste-entry"><div><span>KẾT QUẢ AI</span><h3>Đã có dữ liệu trả về?</h3><p>Dán toàn bộ phản hồi để ứng dụng tự tách JSON, kiểm tra và nhập vào Thẻ hoặc Nghe.</p></div><button type="button" data-flashcard-ai-paste-open>Dán kết quả AI</button></section>
      <section class="flashcard-ai-output-card">
        <header><div><span>PROMPT ĐÃ TẠO</span><h3>${escapeHtml(meta.label || 'Nội dung')}</h3></div><button type="button" data-flashcard-ai-copy>${flashcardLibraryState.aiPromptCopied ? '✓ Đã sao chép' : 'Sao chép prompt'}</button></header>
        <textarea readonly rows="18" data-flashcard-ai-output>${escapeHtml(output)}</textarea>
        <p>Dán prompt này vào AI. Kết quả được yêu cầu ở dạng JSON thuần để dễ kiểm tra và nhập lại vào ứng dụng.</p>
      </section>
    </div>`;
  }

  function syncAiPromptFieldsFromView(){
    if(!flashcardLibraryView) return;
    const next = { ...(flashcardLibraryState.aiPromptFields || {}) };
    flashcardLibraryView.querySelectorAll('[data-flashcard-ai-field]').forEach(input => {
      const key = input.dataset.flashcardAiField;
      if(key) next[key] = key === 'count' ? Math.max(1, Number(input.value) || 1) : key === 'maxOutOfScopeWords' ? Math.max(0, Number(input.value) || 0) : input.value;
    });
    flashcardLibraryState.aiPromptFields = next;
  }

  async function copyAiPrompt(){
    syncAiPromptFieldsFromView();
    const prompt = getAiPromptOutput();
    try{
      await navigator.clipboard.writeText(prompt);
      flashcardLibraryState.aiPromptCopied = true;
    }catch(_error){
      const output = flashcardLibraryView?.querySelector('[data-flashcard-ai-output]');
      output?.focus();
      output?.select();
      document.execCommand?.('copy');
      flashcardLibraryState.aiPromptCopied = true;
    }
    await renderFlashcardLibrary();
    window.setTimeout(() => {
      flashcardLibraryState.aiPromptCopied = false;
      if(flashcardLibraryState.aiPromptBuilderOpen) renderFlashcardLibrary();
    }, 1600);
  }


  function flashcardAiPasteStatsText(stats){
    const parts=[];
    if(stats?.vocabularyCount) parts.push(`${stats.vocabularyCount} từ`);
    if(stats?.sentenceCount) parts.push(`${stats.sentenceCount} câu`);
    if(stats?.grammarCount) parts.push(`${stats.grammarCount} ngữ pháp`);
    if(stats?.dialogueCount) parts.push(`${stats.dialogueCount} hội thoại · ${stats.dialogueTurnCount} lượt`);
    if(stats?.passageCount) parts.push(`${stats.passageCount} đoạn · ${stats.passageSentenceCount} câu`);
    return parts.join(' · ') || 'Chưa nhận diện dữ liệu';
  }

  function flashcardSelectedAiBlocks(){
    const blocks=flashcardLibraryState.aiPasteAnalysis?.blocks || [];
    return blocks.filter(block=>flashcardLibraryState.aiPasteSelectedIds.has(block.id));
  }

  function renderFlashcardAiPastePreview(block){
    const rows=[];
    if(block.type==='vocabulary'||block.type==='sentence'){
      (block.items||[]).slice(0,12).forEach((item,index)=>rows.push(`<div class="flashcard-ai-paste-preview-row"><b>${index+1}</b><span><strong lang="zh-Hans">${escapeHtml(item.hanzi||'')}</strong>${item.pinyin?`<small>${escapeHtml(item.pinyin)}</small>`:''}${item.meaning?`<em>${escapeHtml(item.meaning)}</em>`:''}</span></div>`));
    }else if(block.type==='grammar'){
      (block.items||[]).slice(0,8).forEach((item,index)=>rows.push(`<div class="flashcard-ai-paste-preview-row"><b>${index+1}</b><span><strong>${escapeHtml(item.pattern||'')}</strong><small>${escapeHtml(item.explanation||'Chưa có giải thích')}</small><em>${(item.examples||[]).length} ví dụ</em></span></div>`));
    }else{
      (block.items||[]).slice(0,4).forEach((group)=>{
        rows.push(`<div class="flashcard-ai-paste-preview-group"><strong>${escapeHtml(group.title||block.label)}</strong>${(group.items||[]).slice(0,8).map((item)=>`<p>${item.speaker?`<b>${escapeHtml(item.speaker)}</b>`:''}<span lang="zh-Hans">${escapeHtml(item.hanzi||'')}</span><small>${escapeHtml(item.meaning||'')}</small></p>`).join('')}</div>`);
      });
    }
    const total=block.type==='dialogue'||block.type==='passage'?(block.items||[]).reduce((sum,group)=>sum+(group.items||[]).length,0):(block.items||[]).length;
    return `<details class="flashcard-ai-paste-preview"><summary>Xem nội dung đã nhận diện</summary><div>${rows.join('')}${total>12&&['vocabulary','sentence'].includes(block.type)?`<p class="flashcard-ai-paste-preview-more">Còn ${total-12} mục khác sẽ được nhập.</p>`:''}</div></details>`;
  }

  function renderFlashcardAiPasteBlock(block){
    const selected=flashcardLibraryState.aiPasteSelectedIds.has(block.id);
    const count=['dialogue','passage'].includes(block.type) ? block.items.reduce((sum,group)=>sum+(group.items||[]).length,0) : block.items.length;
    const errors=block.errors?.length || 0;
    const warnings=(block.warnings?.length || 0)+(block.quality_notes?.length || 0);
    return `<article class="flashcard-ai-paste-block ${selected?'is-selected':''} ${errors?'has-error':''}">
      <label><input type="checkbox" data-flashcard-ai-paste-block="${escapeHtml(block.id)}" ${selected?'checked':''} ${errors?'disabled':''}><span><b>${escapeHtml(block.label)}</b><small>${count} mục${errors?` · ${errors} lỗi`:''}${warnings?` · ${warnings} cảnh báo`:''}</small></span></label>
      ${renderFlashcardAiPastePreview(block)}
      ${(errors||warnings)?`<details class="flashcard-ai-paste-check"><summary>Xem kiểm tra</summary>${(block.errors||[]).map(message=>`<p class="is-error">${escapeHtml(message)}</p>`).join('')}${(block.warnings||[]).concat(block.quality_notes||[]).slice(0,12).map(message=>`<p>${escapeHtml(message)}</p>`).join('')}</details>`:''}
    </article>`;
  }

  function renderFlashcardAiPastePage(){
    const analysis=flashcardLibraryState.aiPasteAnalysis;
    const types=Object.entries(window.TiengTrungAiPromptTemplates?.TYPE_META || {}).filter(([, meta]) => meta?.importable !== false);
    const selectedBlocks=flashcardSelectedAiBlocks();
    const selectedCount=selectedBlocks.length;
    const isFull=flashcardLibraryState.aiPasteMode==='full';
    const listeningDecks=flashcardLibraryState.listeningDecks || [];
    const listeningGroups=flashcardLibraryState.listeningGroups || [];
    const selectedLabels=selectedBlocks.map(block=>block.label).join(' · ');
    const titleLabel=isFull?'Tên nhóm / chủ đề':'Tên bộ';
    const destinationTitle=isFull?'Tạo nhóm và các bộ riêng':'Tạo một bộ từ nội dung đã chọn';
    const fcTarget=isFull
      ? `<div class="flashcard-ai-paste-target"><b>Đích Thẻ</b><div class="flashcard-ai-paste-target-tabs"><button type="button" data-flashcard-ai-paste-fc-mode="new" class="${flashcardLibraryState.aiPasteFlashcardMode==='new'?'active':''}">Tạo nhóm mới</button><button type="button" data-flashcard-ai-paste-fc-mode="existing" class="${flashcardLibraryState.aiPasteFlashcardMode==='existing'?'active':''}" ${flashcardLibraryState.groups.length?'':'disabled'}>Thêm vào nhóm có sẵn</button></div>${flashcardLibraryState.aiPasteFlashcardMode==='existing'?`<select data-flashcard-ai-paste-fc-group>${flashcardLibraryState.groups.map(group=>`<option value="${escapeHtml(group.id)}" ${flashcardLibraryState.aiPasteFlashcardGroupId===group.id?'selected':''}>${escapeHtml(group.name)}</option>`).join('')}</select>`:`<p class="flashcard-ai-paste-target-note">Sẽ tạo một nhóm mới và tối đa 5 bộ riêng: Từ vựng, Câu, Ngữ pháp, Hội thoại, Đoạn văn.</p>`}</div>`
      : `<div class="flashcard-ai-paste-target"><b>Đích Thẻ</b><div class="flashcard-ai-paste-target-tabs"><button type="button" data-flashcard-ai-paste-fc-mode="new" class="${flashcardLibraryState.aiPasteFlashcardMode==='new'?'active':''}">Tạo bộ mới</button><button type="button" data-flashcard-ai-paste-fc-mode="existing" class="${flashcardLibraryState.aiPasteFlashcardMode==='existing'?'active':''}" ${flashcardLibraryState.decks.length?'':'disabled'}>Thêm vào bộ có sẵn</button></div>${flashcardLibraryState.aiPasteFlashcardMode==='existing'?`<select data-flashcard-ai-paste-fc-deck>${flashcardLibraryState.decks.map(deck=>`<option value="${escapeHtml(deck.id)}" ${flashcardLibraryState.aiPasteFlashcardDeckId===deck.id?'selected':''}>${escapeHtml(deck.name)}</option>`).join('')}</select>`:`<select data-flashcard-ai-paste-fc-group><option value="">Không phân nhóm</option>${flashcardLibraryState.groups.map(group=>`<option value="${escapeHtml(group.id)}" ${flashcardLibraryState.aiPasteFlashcardGroupId===group.id?'selected':''}>${escapeHtml(group.name)}</option>`).join('')}</select>`}</div>`;
    const listeningTarget=isFull
      ? `<div class="flashcard-ai-paste-target"><b>Đích Nghe</b><div class="flashcard-ai-paste-target-tabs"><button type="button" data-flashcard-ai-paste-listen-mode="new" class="${flashcardLibraryState.aiPasteListeningMode==='new'?'active':''}">Tạo nhóm mới</button><button type="button" data-flashcard-ai-paste-listen-mode="existing" class="${flashcardLibraryState.aiPasteListeningMode==='existing'?'active':''}" ${listeningGroups.length?'':'disabled'}>Thêm vào nhóm có sẵn</button></div>${flashcardLibraryState.aiPasteListeningMode==='existing'?`<select data-flashcard-ai-paste-listen-group>${listeningGroups.map(group=>`<option value="${escapeHtml(group.id)}" ${flashcardLibraryState.aiPasteListeningGroupId===group.id?'selected':''}>${escapeHtml(group.name)}</option>`).join('')}</select>`:`<p class="flashcard-ai-paste-target-note">Mỗi loại nội dung sẽ thành một bộ Nghe riêng trong cùng nhóm. Loại không có dữ liệu sẽ không được tạo.</p>`}</div>`
      : `<div class="flashcard-ai-paste-target"><b>Đích Nghe</b><div class="flashcard-ai-paste-target-tabs"><button type="button" data-flashcard-ai-paste-listen-mode="new" class="${flashcardLibraryState.aiPasteListeningMode==='new'?'active':''}">Tạo bộ mới</button><button type="button" data-flashcard-ai-paste-listen-mode="existing" class="${flashcardLibraryState.aiPasteListeningMode==='existing'?'active':''}" ${listeningDecks.length?'':'disabled'}>Thêm vào bộ có sẵn</button></div>${flashcardLibraryState.aiPasteListeningMode==='existing'?`<select data-flashcard-ai-paste-listen-deck>${listeningDecks.map(deck=>`<option value="${escapeHtml(deck.id)}" ${flashcardLibraryState.aiPasteListeningDeckId===deck.id?'selected':''}>${escapeHtml(deck.name)}</option>`).join('')}</select>`:`<select data-flashcard-ai-paste-listen-group><option value="">Không phân nhóm</option>${listeningGroups.map(group=>`<option value="${escapeHtml(group.id)}" ${flashcardLibraryState.aiPasteListeningGroupId===group.id?'selected':''}>${escapeHtml(group.name)}</option>`).join('')}</select>`}</div>`;
    return `<div class="flashcard-library-page flashcard-ai-paste-page">
      <header class="flashcard-library-subpage-header flashcard-library-subpage-header--plain">
        <button type="button" class="flashcard-library-back" data-flashcard-ai-paste-close aria-label="Quay lại">←</button>
        <div><span>AI IMPORT</span><h2>Dán kết quả AI</h2><p>Tự tách JSON, kiểm tra, xem trước rồi nhập vào Thẻ hoặc Nghe.</p></div>
      </header>
      <section class="flashcard-ai-paste-card">
        <div class="flashcard-ai-paste-mode"><button type="button" data-flashcard-ai-paste-mode="quick" class="${flashcardLibraryState.aiPasteMode==='quick'?'active':''}">Nhập nhanh từng loại</button><button type="button" data-flashcard-ai-paste-mode="full" class="${isFull?'active':''}">Nhập một bộ đầy đủ</button></div>
        ${!isFull?`<div class="flashcard-ai-paste-types">${types.map(([id,meta])=>`<button type="button" data-flashcard-ai-paste-type="${id}" class="${flashcardLibraryState.aiPasteExpectedType===id?'active':''}">${meta.icon} ${escapeHtml(meta.label)}</button>`).join('')}</div>`:`<p class="flashcard-ai-paste-help">Dán toàn bộ cuộc trò chuyện hoặc nhiều khối JSON liên tiếp. Khi nhập, ứng dụng tạo một nhóm và tách từng loại thành một bộ riêng.</p>`}
        <label class="flashcard-ai-paste-text"><span>Nội dung AI trả về</span><textarea rows="13" data-flashcard-ai-paste-text placeholder="Dán JSON thuần, JSON trong Markdown hoặc toàn bộ đoạn chat...">${escapeHtml(flashcardLibraryState.aiPasteText)}</textarea></label>
        <button type="button" class="hsk-flashcard-start" data-flashcard-ai-paste-analyze>Phân tích dữ liệu</button>
      </section>
      ${analysis?`<section class="flashcard-ai-paste-card flashcard-ai-paste-result">
        <header><div><span>ĐÃ NHẬN DIỆN</span><h3>${escapeHtml(flashcardAiPasteStatsText(analysis.stats))}</h3></div><i>${analysis.stats?.warningCount||0} cảnh báo</i></header>
        ${analysis.errors?.length?`<div class="flashcard-import-message is-error">${analysis.errors.map(message=>`<p>${escapeHtml(message)}</p>`).join('')}</div>`:''}
        ${analysis.warnings?.length?`<div class="flashcard-import-message is-warning">${analysis.warnings.map(message=>`<p>${escapeHtml(message)}</p>`).join('')}</div>`:''}
        <div class="flashcard-ai-paste-blocks">${(analysis.blocks||[]).map(renderFlashcardAiPasteBlock).join('')}</div>
      </section>
      <section class="flashcard-ai-paste-card flashcard-ai-paste-destination">
        <span class="flashcard-data-section__eyebrow">ĐÍCH NHẬP</span><h3>${destinationTitle}</h3>
        <label><span>${titleLabel}</span><input data-flashcard-ai-paste-title value="${escapeHtml(flashcardLibraryState.aiPasteTitle||'')}" placeholder="Ví dụ: Giới thiệu gia đình"></label>
        ${isFull&&selectedLabels?`<p class="flashcard-ai-paste-plan"><b>Sẽ tạo ${selectedCount} bộ:</b> ${escapeHtml(selectedLabels)}</p>`:''}
        <div class="flashcard-ai-paste-destination-switches">
          <label><input type="checkbox" data-flashcard-ai-paste-to="flashcards" ${flashcardLibraryState.aiPasteToFlashcards?'checked':''}><span><b>Thẻ</b><small>${isFull?'Tạo một nhóm và các bộ riêng theo từng loại':'Tạo một bộ Thẻ từ nội dung đã chọn'}</small></span></label>
          <label><input type="checkbox" data-flashcard-ai-paste-to="listening" ${flashcardLibraryState.aiPasteToListening?'checked':''}><span><b>Nghe</b><small>${isFull?'Tạo một nhóm Nghe và các bộ riêng theo từng loại':'Tạo một Listening Dataset V1'}</small></span></label>
        </div>
        ${flashcardLibraryState.aiPasteToFlashcards?fcTarget:''}
        ${flashcardLibraryState.aiPasteToListening?listeningTarget:''}
        <button type="button" class="hsk-flashcard-start" data-flashcard-ai-paste-import ${selectedCount&&(flashcardLibraryState.aiPasteToFlashcards||flashcardLibraryState.aiPasteToListening)?'':'disabled'}>${isFull?`Tạo nhóm và ${selectedCount} bộ`:`Nhập ${selectedCount} phần đã chọn`}</button>
      </section>`:''}
    </div>`;
  }

  async function openFlashcardAiPaste(){
    flashcardLibraryState.aiPasteOpen=true;
    flashcardLibraryState.aiPasteAnalysis=null;
    flashcardLibraryState.aiPasteSelectedIds=new Set();
    try{
      const store=window.ListeningLibraryStore;
      if(store){ await store.init(); [flashcardLibraryState.listeningGroups,flashcardLibraryState.listeningDecks]=await Promise.all([store.listGroups(),store.listDecks()]); }
    }catch(_error){ flashcardLibraryState.listeningGroups=[]; flashcardLibraryState.listeningDecks=[]; }
    await renderFlashcardLibrary();
  }

  function analyzeFlashcardAiPaste(){
    const text=flashcardLibraryView?.querySelector('[data-flashcard-ai-paste-text]')?.value || flashcardLibraryState.aiPasteText;
    flashcardLibraryState.aiPasteText=text;
    flashcardLibraryState.aiPasteAnalysis=ImportCore.parseAiPaste(text,{expectedType:flashcardLibraryState.aiPasteMode==='quick'?flashcardLibraryState.aiPasteExpectedType:'auto'});
    flashcardLibraryState.aiPasteSelectedIds=new Set((flashcardLibraryState.aiPasteAnalysis.blocks||[]).filter(block=>!(block.errors||[]).length).map(block=>block.id));
    if(!flashcardLibraryState.aiPasteTitle) flashcardLibraryState.aiPasteTitle=flashcardLibraryState.aiPromptFields?.topic || flashcardLibraryState.aiPasteAnalysis.blocks?.find(block=>block.topic)?.topic || '';
    renderFlashcardLibrary();
  }

  function uniqueAiImportId(base, ids){
    let id=String(base||'ai-content');
    if(!ids.has(id)){ids.add(id);return id;}
    let index=2; while(ids.has(`${id}-${index}`)) index+=1;
    const next=`${id}-${index}`;ids.add(next);return next;
  }

  function uniqueAiImportName(base, names){
    const clean=String(base||'Nội dung AI').trim()||'Nội dung AI';
    const normalized=new Set(Array.from(names||[]).map(name=>String(name||'').trim().toLocaleLowerCase('vi')));
    if(!normalized.has(clean.toLocaleLowerCase('vi'))) return clean;
    let index=2;while(normalized.has(`${clean} (${index})`.toLocaleLowerCase('vi')))index+=1;
    return `${clean} (${index})`;
  }

  function rebaseAiListeningDeck(incoming,id,groupId){
    const deck={...incoming,id,groupId:groupId||null};
    if(deck.dataset){
      deck.dataset.unit.id=id;
      deck.dataset.unit.title=deck.name;
      deck.dataset.source.id=`custom:${id}`;
      [...(deck.dataset.words||[]),...(deck.dataset.sentences||[])].forEach(item=>{item.sourceId=id;item.lessonId=id;});
      (deck.dataset.groups||[]).forEach(group=>{group.sourceId=id;group.lessonId=id;});
    }
    return deck;
  }

  async function importAiToFlashcards(payload,{splitByType=false,title='Nội dung AI'}={}){
    if(payload.errors?.length) throw new Error(payload.errors.join(' · '));
    if(!payload.decks?.length) throw new Error('Không có dữ liệu phù hợp để tạo Thẻ.');

    if(splitByType){
      let groupId='';let groupName='';
      if(flashcardLibraryState.aiPasteFlashcardMode==='existing'){
        const target=flashcardLibraryState.groups.find(group=>group.id===(flashcardLibraryState.aiPasteFlashcardGroupId||flashcardLibraryState.groups[0]?.id));
        if(!target) throw new Error('Nhóm Thẻ đích không còn tồn tại.');
        groupId=target.id;groupName=target.name;
      }else{
        const ids=new Set(flashcardLibraryState.groups.map(group=>group.id));
        const names=new Set(flashcardLibraryState.groups.map(group=>group.name));
        const sourceGroup=payload.groups?.[0]||{id:'ai-group',name:title};
        groupId=uniqueAiImportId(sourceGroup.id,ids);
        groupName=uniqueAiImportName(sourceGroup.name||title,names);
        await saveFlashcardGroup({id:groupId,name:groupName,description:'Nhóm nội dung AI được tách thành các bộ theo từng loại.'});
      }
      const ids=new Set(flashcardLibraryState.decks.map(deck=>deck.id));
      let cardCount=0;
      for(const incoming of payload.decks){
        const id=uniqueAiImportId(incoming.id,ids);
        await saveCustomDeck({...incoming,id,groupId,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
        cardCount+=(incoming.cards||[]).length;
      }
      return {groupName,deckCount:payload.decks.length,cardCount};
    }

    const incoming=payload.decks[0];
    if(flashcardLibraryState.aiPasteFlashcardMode==='existing'){
      const target=flashcardLibraryState.decks.find(deck=>deck.id===(flashcardLibraryState.aiPasteFlashcardDeckId||flashcardLibraryState.decks[0]?.id));
      if(!target) throw new Error('Bộ Thẻ đích không còn tồn tại.');
      const seen=new Set((target.cards||[]).map(card=>`${card.contentType||''}|${card.word}\u0000${card.pinyin}\u0000${card.meaningVi}`));
      const cards=(incoming.cards||[]).filter(card=>{const key=`${card.contentType||''}|${card.word}\u0000${card.pinyin}\u0000${card.meaningVi}`;if(seen.has(key))return false;seen.add(key);return true;});
      await saveCustomDeck({...target,cards:(target.cards||[]).concat(cards),updatedAt:new Date().toISOString()});
      return {deckCount:0,cardCount:cards.length,targetName:target.name};
    }
    const ids=new Set(flashcardLibraryState.decks.map(deck=>deck.id));
    const id=uniqueAiImportId(incoming.id,ids);
    await saveCustomDeck({...incoming,id,groupId:flashcardLibraryState.aiPasteFlashcardGroupId||null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
    return {deckCount:1,cardCount:incoming.cards.length,targetName:incoming.name};
  }

  async function importAiToListening(payload,{splitByType=false,title='Nội dung AI'}={}){
    if(payload.errors?.length) throw new Error(payload.errors.join(' · '));
    if(!payload.decks?.length) throw new Error('Không có dữ liệu phù hợp để tạo bộ Nghe.');
    const store=window.ListeningLibraryStore;
    if(!store) throw new Error('Thiếu ListeningLibraryStore.');
    await store.init();

    if(splitByType){
      let groupId='';let groupName='';
      if(flashcardLibraryState.aiPasteListeningMode==='existing'){
        const target=flashcardLibraryState.listeningGroups.find(group=>group.id===(flashcardLibraryState.aiPasteListeningGroupId||flashcardLibraryState.listeningGroups[0]?.id));
        if(!target) throw new Error('Nhóm Nghe đích không còn tồn tại.');
        groupId=target.id;groupName=target.name;
      }else{
        const ids=new Set(flashcardLibraryState.listeningGroups.map(group=>group.id));
        const names=new Set(flashcardLibraryState.listeningGroups.map(group=>group.name));
        const sourceGroup=payload.groups?.[0]||{id:'ai-group',name:title};
        groupId=uniqueAiImportId(sourceGroup.id,ids);
        groupName=uniqueAiImportName(sourceGroup.name||title,names);
        await store.saveGroup({id:groupId,name:groupName,description:'Nhóm nội dung AI được tách thành các bộ Nghe theo từng loại.'});
      }
      const ids=new Set(flashcardLibraryState.listeningDecks.map(deck=>deck.id));
      for(const incoming of payload.decks){
        const id=uniqueAiImportId(incoming.id,ids);
        await store.saveDeck(rebaseAiListeningDeck(incoming,id,groupId));
      }
      return {groupName,deckCount:payload.decks.length};
    }

    const incoming=payload.decks[0];
    if(flashcardLibraryState.aiPasteListeningMode==='existing'){
      const targetId=flashcardLibraryState.aiPasteListeningDeckId||flashcardLibraryState.listeningDecks[0]?.id;
      const existing=await store.getDeck(targetId);
      if(!existing) throw new Error('Bộ Nghe đích không còn tồn tại.');
      const merged=ImportCore.mergeListeningDeck(existing,incoming);
      await store.saveDeck(merged);
      return {deckCount:0,targetName:existing.name};
    }
    const ids=new Set(flashcardLibraryState.listeningDecks.map(deck=>deck.id));
    const id=uniqueAiImportId(incoming.id,ids);
    const deck=rebaseAiListeningDeck(incoming,id,flashcardLibraryState.aiPasteListeningGroupId||null);
    await store.saveDeck(deck);
    return {deckCount:1,targetName:deck.name};
  }

  async function importFlashcardAiPaste(){
    const analysis=flashcardLibraryState.aiPasteAnalysis;
    if(!analysis) return;
    const title=String(flashcardLibraryState.aiPasteTitle||'Nội dung AI').trim()||'Nội dung AI';
    const splitByType=flashcardLibraryState.aiPasteMode==='full';
    try{
      const messages=[];
      if(flashcardLibraryState.aiPasteToFlashcards){
        const existingGroup=splitByType&&flashcardLibraryState.aiPasteFlashcardMode==='existing'
          ? flashcardLibraryState.groups.find(group=>group.id===(flashcardLibraryState.aiPasteFlashcardGroupId||flashcardLibraryState.groups[0]?.id))
          : null;
        const payload=ImportCore.buildAiFlashcardImport(analysis,{selectedBlockIds:flashcardLibraryState.aiPasteSelectedIds,title,splitByType,groupId:existingGroup?.id||'',groupName:existingGroup?.name||title});
        const summary=await importAiToFlashcards(payload,{splitByType,title});
        messages.push(splitByType?`đã tạo ${summary.deckCount} bộ Thẻ trong nhóm “${summary.groupName}”`:summary.deckCount?`đã tạo bộ Thẻ “${summary.targetName}”`:`đã thêm ${summary.cardCount} thẻ vào “${summary.targetName}”`);
      }
      if(flashcardLibraryState.aiPasteToListening){
        const existingGroup=splitByType&&flashcardLibraryState.aiPasteListeningMode==='existing'
          ? flashcardLibraryState.listeningGroups.find(group=>group.id===(flashcardLibraryState.aiPasteListeningGroupId||flashcardLibraryState.listeningGroups[0]?.id))
          : null;
        const payload=ImportCore.buildAiListeningImport(analysis,{selectedBlockIds:flashcardLibraryState.aiPasteSelectedIds,title,splitByType,groupId:existingGroup?.id||'',groupName:existingGroup?.name||title});
        const summary=await importAiToListening(payload,{splitByType,title});
        messages.push(splitByType?`đã tạo ${summary.deckCount} bộ Nghe trong nhóm “${summary.groupName}”`:summary.deckCount?`đã tạo bộ Nghe “${summary.targetName}”`:`đã thêm vào bộ Nghe “${summary.targetName}”`);
      }
      flashcardLibraryState.aiPasteOpen=false;flashcardLibraryState.aiPasteAnalysis=null;flashcardLibraryState.aiPasteText='';flashcardLibraryState.aiPasteSelectedIds=new Set();flashcardLibraryState.aiPromptBuilderOpen=false;
      flashcardLibraryState.message=messages.join(' · ');
      await renderFlashcardLibrary();
    }catch(error){window.alert(error.message||'Không nhập được kết quả AI.');}
  }

  async function renderFlashcardLibrary(){
    ensureFlashcardLibraryUi();
    if(!flashcardLibraryView) return;
    const restoreSearchFocus = document.activeElement?.matches?.('[data-flashcard-library-search]');
    const restoreDetailSearchFocus = document.activeElement?.matches?.('[data-flashcard-detail-search]');
    const restoreCurriculumSearchFocus = document.activeElement?.matches?.('[data-flashcard-curriculum-search]');
    const restoreCurriculumCountFocus = document.activeElement?.matches?.('[data-flashcard-curriculum-custom-count]');
    const restoreTextFocus = restoreSearchFocus || restoreDetailSearchFocus || restoreCurriculumSearchFocus || restoreCurriculumCountFocus;
    const restoreSearchStart = restoreTextFocus ? document.activeElement.selectionStart : null;
    const restoreSearchEnd = restoreTextFocus ? document.activeElement.selectionEnd : null;
    try{ await cleanupExpiredTrash(); }catch(_err){}
    if(flashcardLibraryState.trashOpen){
      try{ flashcardLibraryState.trashItems = await getAllTrashItems(); }catch(err){ flashcardLibraryState.message = err.message || 'Không đọc được Thùng rác.'; flashcardLibraryState.trashItems = []; }
      flashcardLibraryView.innerHTML = renderFlashcardTrashPage(flashcardLibraryState.trashItems);
      return;
    }
    if(flashcardLibraryState.aiPasteOpen){
      flashcardLibraryView.innerHTML = renderFlashcardAiPastePage();
      return;
    }
    if(flashcardLibraryState.curriculumBrowserOpen){
      flashcardLibraryView.innerHTML = renderFlashcardCurriculumBrowser();
      await hydrateFlashcardCurriculumLevels();
      if(restoreCurriculumSearchFocus || restoreCurriculumCountFocus){
        const selector = restoreCurriculumSearchFocus ? '[data-flashcard-curriculum-search]' : '[data-flashcard-curriculum-custom-count]';
        const restoredInput = flashcardLibraryView.querySelector(selector);
        if(restoredInput){
          restoredInput.focus({ preventScroll: true });
          if(typeof restoredInput.setSelectionRange === 'function' && restoreSearchStart != null){
            const maxLength = String(restoredInput.value || '').length;
            restoredInput.setSelectionRange(Math.min(restoreSearchStart, maxLength), Math.min(restoreSearchEnd ?? restoreSearchStart, maxLength));
          }
        }
      }
      if(!flashcardLibraryState.curriculumLesson && flashcardLibraryState.curriculumScrollTop > 0){
        const restoreTop = flashcardLibraryState.curriculumScrollTop;
        flashcardLibraryState.curriculumScrollTop = 0;
        window.requestAnimationFrame(() => window.scrollTo({ top: restoreTop, behavior: 'auto' }));
      }
      return;
    }
    if(flashcardLibraryState.aiPromptBuilderOpen){
      flashcardLibraryView.innerHTML = renderFlashcardAiPromptBuilder();
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
      const [decks, groups] = await Promise.all([getAllCustomDecks(), getAllFlashcardGroups()]);
      flashcardLibraryState.decks = decks;
      flashcardLibraryState.groups = groups;
      const validDeckIds = new Set(decks.map(deck => deck.id));
      [...flashcardLibraryState.selectedDeckIds].forEach(id => { if(!validDeckIds.has(id)) flashcardLibraryState.selectedDeckIds.delete(id); });
      if(flashcardLibraryState.activeGroupId && !groups.some(group => group.id === flashcardLibraryState.activeGroupId)){
        flashcardLibraryState.activeGroupId = '';
      }
    }catch(err){
      flashcardLibraryState.message = err.message || 'Không đọc được bộ thẻ tự tạo.';
      flashcardLibraryState.decks = [];
      flashcardLibraryState.groups = [];
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
    const dueCount = stats.review + stats.hard;
    const customCardTotal = flashcardLibraryState.decks.reduce((sum, deck) => sum + (Array.isArray(deck.cards) ? deck.cards.length : 0), 0);

    if(flashcardLibraryState.dataManagerOpen){
      flashcardLibraryView.innerHTML = `
        <div class="flashcard-library-page flashcard-library-page--data-manager">
          <header class="flashcard-library-subpage-header flashcard-library-subpage-header--plain">
            <button type="button" class="flashcard-library-back" data-flashcard-tools-back aria-label="Quay lại trang Thẻ">←</button>
            <div><span>FLASHCARD</span><h2>Quản lý dữ liệu</h2><p>Sao lưu, khôi phục và dọn dữ liệu bộ thẻ.</p></div>
          </header>
          ${flashcardLibraryState.message ? `<p class="flashcard-library-message">${escapeHtml(flashcardLibraryState.message)}</p>` : ''}
          <section class="flashcard-data-section" aria-labelledby="flashcardBackupTitle">
            <header><span class="flashcard-data-section__eyebrow">SAO LƯU</span><h3 id="flashcardBackupTitle">Dữ liệu của bạn</h3></header>
            <div class="flashcard-data-action-list">
              <button type="button" data-flashcard-content-import-trigger>
                <span class="flashcard-data-action__icon import" aria-hidden="true">＋</span>
                <span class="flashcard-data-action__copy"><b>Nhập nội dung</b><small>Nhận JSON, XLSX, CSV hoặc TXT; có xem trước trước khi lưu.</small></span>
                <i aria-hidden="true">›</i>
              </button>
              <input type="file" accept=".json,.xlsx,.csv,.txt,application/json,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-flashcard-content-import-file hidden>
              <button type="button" data-flashcard-template-toggle>
                <span class="flashcard-data-action__icon export" aria-hidden="true">▦</span>
                <span class="flashcard-data-action__copy"><b>Tải file mẫu</b><small>Mẫu cho một thẻ, một bộ nhiều thẻ và một nhóm nhiều bộ.</small></span>
                <i aria-hidden="true">›</i>
              </button>
              ${renderFlashcardTemplatePanel()}
              <button type="button" data-flashcard-import-trigger>
                <span class="flashcard-data-action__icon import" aria-hidden="true">⇧</span>
                <span class="flashcard-data-action__copy"><b>Khôi phục backup</b><small>Chỉ nhận file JSON được xuất từ mục Xuất dữ liệu.</small></span>
                <i aria-hidden="true">›</i>
              </button>
              <input type="file" accept="application/json,.json" data-flashcard-import-file hidden>
              <button type="button" data-flashcard-export>
                <span class="flashcard-data-action__icon export" aria-hidden="true">⇩</span>
                <span class="flashcard-data-action__copy"><b>Xuất dữ liệu</b><small>Tải bộ thẻ và lịch sử học thành file JSON.</small></span>
                <i aria-hidden="true">›</i>
              </button>
            </div>
          </section>
          <section class="flashcard-data-section" aria-labelledby="flashcardRestoreTitle">
            <header><span class="flashcard-data-section__eyebrow">KHÔI PHỤC</span><h3 id="flashcardRestoreTitle">Nội dung đã xóa</h3></header>
            <div class="flashcard-data-action-list">
              <button type="button" data-flashcard-trash-open>
                <span class="flashcard-data-action__icon trash" aria-hidden="true">♲</span>
                <span class="flashcard-data-action__copy"><b>Thùng rác</b><small>Khôi phục bộ hoặc thẻ đã xóa trong 30 ngày.</small></span>
                <i aria-hidden="true">›</i>
              </button>
            </div>
          </section>
          <section class="flashcard-data-section flashcard-data-section--danger" aria-labelledby="flashcardDangerTitle">
            <header><span class="flashcard-data-section__eyebrow">VÙNG NGUY HIỂM</span><h3 id="flashcardDangerTitle">Đặt lại dữ liệu học</h3></header>
            <div class="flashcard-data-action-list">
              <button type="button" class="danger" data-flashcard-reset-history>
                <span class="flashcard-data-action__icon danger" aria-hidden="true">×</span>
                <span class="flashcard-data-action__copy"><b>Xóa lịch sử học</b><small>Xóa điểm Dễ, Ôn, Khó nhưng giữ nguyên bộ thẻ.</small></span>
                <i aria-hidden="true">›</i>
              </button>
              <button type="button" class="danger" data-flashcard-reset-session>
                <span class="flashcard-data-action__icon danger" aria-hidden="true">↺</span>
                <span class="flashcard-data-action__copy"><b>Đặt lại phiên học dở</b><small>Xóa tiến độ phiên hiện tại, không xóa bộ thẻ.</small></span>
                <i aria-hidden="true">›</i>
              </button>
            </div>
          </section>
          ${renderFlashcardImportPreview()}
        </div>`;
      return;
    }

    if(flashcardLibraryState.customDecksOpen){
      const sortOptions = [
        ['updated-desc', 'Mới sửa gần nhất'],
        ['studied-desc', 'Học gần nhất'],
        ['name-asc', 'Tên A–Z'],
        ['cards-desc', 'Nhiều thẻ nhất'],
        ['hard-desc', 'Nhiều thẻ Khó nhất'],
        ['review-desc', 'Nhiều thẻ Ôn nhất']
      ];
      const activeGroup = getActiveFlashcardGroup();
      const activeGroupDeckIds = activeGroup
        ? new Set(flashcardLibraryState.decks.filter(deck => deck.groupId === activeGroup.id).map(deck => deck.id))
        : null;
      const visibleDeckRows = activeGroupDeckIds
        ? libraryRows.filter(row => activeGroupDeckIds.has(row.deck.id))
        : libraryRows.filter(row => !row.deck.groupId || !flashcardLibraryState.groups.some(group => group.id === row.deck.groupId));
      const query = normalizeLibrarySearch(flashcardLibraryState.searchQuery);
      const visibleGroups = activeGroup ? [] : flashcardLibraryState.groups.filter(group => {
        if(!query) return true;
        if(normalizeLibrarySearch(`${group.name || ''} ${group.description || ''}`).includes(query)) return true;
        return flashcardLibraryState.decks.some(deck => deck.groupId === group.id && getDeckSearchText(deck).includes(query));
      });
      const currentCardTotal = activeGroup
        ? flashcardLibraryState.decks.filter(deck => deck.groupId === activeGroup.id).reduce((sum, deck) => sum + (deck.cards?.length || 0), 0)
        : customCardTotal;
      const currentDeckTotal = activeGroup
        ? flashcardLibraryState.decks.filter(deck => deck.groupId === activeGroup.id).length
        : flashcardLibraryState.decks.length;
      flashcardLibraryView.innerHTML = `
        <div class="flashcard-library-page flashcard-library-page--custom ${activeGroup ? 'is-group-view' : ''} ${flashcardLibraryState.deckSelectionMode ? 'is-deck-selection-mode' : ''}">
          <header class="flashcard-library-subpage-header flashcard-library-subpage-header--plain">
            <button type="button" class="flashcard-library-back" ${activeGroup ? 'data-flashcard-group-back' : 'data-flashcard-custom-back'} aria-label="Quay lại">←</button>
            <div><span>${activeGroup ? 'NHÓM BỘ THẺ' : 'BỘ THẺ CỦA BẠN'}</span><h2>${escapeHtml(activeGroup?.name || 'Bộ tự tạo')}</h2><p>${currentDeckTotal} bộ · ${currentCardTotal} thẻ${activeGroup?.description ? ` · ${escapeHtml(activeGroup.description)}` : ''}</p></div>
            <div class="flashcard-library-header-actions ${flashcardLibraryState.deckSelectionMode ? 'is-selecting' : ''}">
              ${flashcardLibraryState.deckSelectionMode
                ? '<button type="button" class="flashcard-library-secondary-compact flashcard-library-selection-cancel" data-flashcard-deck-selection-cancel>Hủy chọn</button>'
                : `${activeGroup ? '<button type="button" class="flashcard-library-secondary-compact" data-flashcard-group-edit-active>Đổi tên</button>' : '<button type="button" class="flashcard-library-secondary-compact" data-flashcard-group-new>＋ Tạo nhóm</button>'}<button type="button" class="flashcard-library-secondary-compact" data-flashcard-deck-selection-start>Chọn</button><button type="button" class="flashcard-library-primary flashcard-library-primary--compact" data-flashcard-deck-new><span aria-hidden="true">＋</span> Tạo bộ</button>`}
            </div>
          </header>
          ${flashcardLibraryState.message ? `<p class="flashcard-library-message">${escapeHtml(flashcardLibraryState.message)}</p>` : ''}
          <section class="flashcard-library-custom-browser" aria-label="Tìm kiếm và sắp xếp">
            <label class="flashcard-library-search"><span aria-hidden="true">⌕</span><input type="search" data-flashcard-library-search value="${escapeHtml(flashcardLibraryState.searchQuery)}" placeholder="${activeGroup ? 'Tìm trong nhóm này...' : 'Tìm nhóm, bộ thẻ, Hán tự, pinyin...'}"></label>
            <button type="button" class="flashcard-library-sort-trigger" data-flashcard-sort-open aria-haspopup="dialog" aria-expanded="${flashcardLibraryState.sortSheetOpen}">
              <span><small>Sắp xếp</small><b>${escapeHtml(getFlashcardLibrarySortLabel())}</b></span><i aria-hidden="true">⌄</i>
            </button>
          </section>
          ${activeGroup ? '' : `
            <section class="flashcard-library-group-section" aria-label="Nhóm bộ thẻ">
              <header><span>NHÓM BỘ THẺ</span><small>${visibleGroups.length} nhóm</small></header>
              <div class="flashcard-group-list">
                ${visibleGroups.length ? visibleGroups.map(renderFlashcardGroupCard).join('') : '<p class="flashcard-library-empty flashcard-library-empty--compact">Chưa có nhóm phù hợp.</p>'}
              </div>
            </section>`}
          <section class="flashcard-library-group-section" aria-label="${activeGroup ? `Các bộ trong nhóm ${escapeHtml(activeGroup.name)}` : 'Bộ chưa phân nhóm'}">
            <header><span>${activeGroup ? 'CÁC BỘ TRONG NHÓM' : 'CHƯA PHÂN NHÓM'}</span><small>${visibleDeckRows.length} bộ</small></header>
            <div class="flashcard-library-custom-list">
              ${visibleDeckRows.length ? visibleDeckRows.map(renderFlashcardCustomDeckCard).join('') : `<div class="flashcard-library-empty flashcard-library-empty--custom"><b>${query ? 'Không tìm thấy bộ phù hợp' : (activeGroup ? 'Nhóm này chưa có bộ thẻ' : 'Không có bộ chưa phân nhóm')}</b><p>${query ? 'Thử đổi từ khóa hoặc cách sắp xếp.' : 'Tạo bộ mới hoặc di chuyển một bộ vào đây.'}</p><button type="button" class="flashcard-library-primary" data-flashcard-deck-new>＋ Tạo bộ</button></div>`}
            </div>
          </section>
          ${flashcardLibraryState.sortSheetOpen ? `
            <div class="flashcard-sort-sheet-backdrop" data-flashcard-sort-backdrop>
              <section class="flashcard-sort-sheet" role="dialog" aria-modal="true" aria-label="Sắp xếp bộ thẻ" data-flashcard-sort-sheet>
                <header><div><span>SẮP XẾP</span><h3>${activeGroup ? escapeHtml(activeGroup.name) : 'Bộ thẻ tự tạo'}</h3></div><button type="button" data-flashcard-sort-close aria-label="Đóng">×</button></header>
                <div class="flashcard-sort-sheet__options">
                  ${sortOptions.map(([value, label]) => `<button type="button" class="${flashcardLibraryState.sortMode === value ? 'active' : ''}" data-flashcard-sort-option="${value}"><span>${escapeHtml(label)}</span><i aria-hidden="true">${flashcardLibraryState.sortMode === value ? '✓' : ''}</i></button>`).join('')}
                </div>
              </section>
            </div>` : ''}
          ${flashcardLibraryState.deckSelectionMode ? `
            <div class="flashcard-deck-selection-bar" role="region" aria-label="Hành động cho các bộ đã chọn">
              <div class="flashcard-deck-selection-bar__count"><b>${flashcardLibraryState.selectedDeckIds.size} bộ đã chọn</b><small>Chạm thêm bộ để chọn hoặc bỏ chọn.</small></div>
              <button type="button" class="flashcard-deck-selection-bar__all" data-flashcard-deck-select-all>${visibleDeckRows.length && visibleDeckRows.every(row => flashcardLibraryState.selectedDeckIds.has(row.deck.id)) ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}</button>
              <button type="button" class="flashcard-deck-selection-bar__move" data-flashcard-deck-move-selected ${flashcardLibraryState.selectedDeckIds.size ? '' : 'disabled'}>Di chuyển vào nhóm</button>
            </div>` : ''}
          ${renderFlashcardGroupEditorOverlay()}
          ${renderFlashcardDeckMoveOverlay()}
        </div>`;
      if(restoreSearchFocus){
        const searchInput = flashcardLibraryView.querySelector('[data-flashcard-library-search]');
        if(searchInput){
          searchInput.focus({ preventScroll: true });
          const focusEnd = searchInput.value.length;
          searchInput.setSelectionRange(restoreSearchStart ?? focusEnd, restoreSearchEnd ?? focusEnd);
        }
      }
      return;
    }

    flashcardLibraryView.innerHTML = `
      <div class="flashcard-library-page flashcard-library-page--dashboard">
        <header class="flashcard-library-header flashcard-library-header--dashboard">
          <div><span>FLASHCARD</span><h2>Bộ thẻ của bạn</h2><p>Học, ôn tập và quản lý các bộ thẻ.</p></div>
          <button type="button" class="flashcard-library-primary" data-flashcard-deck-new><span aria-hidden="true">＋</span> Tạo bộ</button>
        </header>
        ${flashcardLibraryState.message ? `<p class="flashcard-library-message">${escapeHtml(flashcardLibraryState.message)}</p>` : ''}
        <section class="flashcard-library-quick" aria-label="Học nhanh">
          <button type="button" class="flashcard-quick-row" data-flashcard-curriculum-open>
            <span class="flashcard-quick-row__icon hsk" aria-hidden="true">课</span>
            <span class="flashcard-quick-row__copy"><strong>HSK & Giáo trình</strong><small>Chọn bài, số từ hoặc tự chọn từ để tạo phiên</small></span>
            <span class="flashcard-quick-row__arrow" aria-hidden="true">›</span>
          </button>
          <button type="button" class="flashcard-quick-row" data-hsk-flashcard-study-group="review-hard" ${dueCount ? '' : 'disabled'}>
            <span class="flashcard-quick-row__icon review" aria-hidden="true">↻</span>
            <span class="flashcard-quick-row__copy"><strong>Ôn hôm nay</strong><small>${dueCount ? `${dueCount} thẻ cần ôn lại` : 'Bạn đã hoàn thành hôm nay'}</small></span>
            <span class="flashcard-quick-row__action">${dueCount ? 'Ôn ngay' : '✓'}</span>
          </button>
          <button type="button" class="flashcard-quick-row flashcard-quick-row--ai" data-flashcard-ai-open>
            <span class="flashcard-quick-row__icon ai" aria-hidden="true">AI</span>
            <span class="flashcard-quick-row__copy"><strong>Tạo nội dung bằng AI</strong><small>Sinh prompt cho từ vựng, câu, ngữ pháp, hội thoại và đoạn văn</small></span>
            <span class="flashcard-quick-row__arrow" aria-hidden="true">›</span>
          </button>
          <button type="button" class="flashcard-quick-row" data-flashcard-custom-open>
            <span class="flashcard-quick-row__icon custom" aria-hidden="true">＋</span>
            <span class="flashcard-quick-row__copy"><strong>Bộ tự tạo</strong><small>${flashcardLibraryState.decks.length} bộ · ${flashcardLibraryState.groups.length} nhóm · ${customCardTotal} thẻ</small></span>
            <span class="flashcard-quick-row__arrow" aria-hidden="true">›</span>
          </button>
        </section>
        <section class="flashcard-library-summary" aria-label="Tổng quan học tập">
          <div class="flashcard-library-summary__head"><h3>Tổng quan</h3><button type="button" data-hsk-flashcard-stats>Xem thống kê</button></div>
          <div class="flashcard-library-summary-strip">
            <button type="button" data-hsk-flashcard-stats><b>${stats.total}</b><span>Đã học</span></button>
            <button type="button" class="easy" data-hsk-flashcard-stats><b>${stats.easy}</b><span>Dễ</span></button>
            <button type="button" class="review" data-hsk-flashcard-study-group="review" ${stats.review ? '' : 'disabled'}><b>${stats.review}</b><span>Ôn</span></button>
            <button type="button" class="hard" data-hsk-flashcard-study-group="hard" ${stats.hard ? '' : 'disabled'}><b>${stats.hard}</b><span>Khó</span></button>
          </div>
        </section>
        <button type="button" class="flashcard-library-data-entry" data-flashcard-tools-open>
          <span class="flashcard-library-data-entry__icon" aria-hidden="true">↕</span>
          <span><b>Quản lý dữ liệu</b><small>Xuất, nhập, khôi phục và đặt lại dữ liệu</small></span>
          <i aria-hidden="true">›</i>
        </button>
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
    const groups = await getAllFlashcardGroups();
    const payload = { version: 2, type: 'hanzi-flashcard-backup', exportedAt: new Date().toISOString(), groups, decks, results: readFlashcardResults() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hanzi-flashcard-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  async function importFlashcardBackup(file){
    const parsed = await ImportCore.readFile(file, { simpleText: 'flashcard' });
    const payload = ImportCore.buildFlashcardImport(parsed);
    if(payload.format !== 'flashcard-backup') throw new Error('File JSON không phải backup Flashcard hợp lệ.');
    return importFlashcardContent(payload, { restore: true });
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

  function exportFlashcardGroup(group){
    const decks = flashcardLibraryState.decks.filter(deck => deck.groupId === group.id);
    const allResults = readFlashcardResults();
    const results = {};
    decks.forEach(deck => (deck.cards || []).forEach(card => {
      const key = `custom:${deck.id}:${card.id}`;
      if(allResults[key]) results[key] = allResults[key];
    }));
    const safeName = String(group.name || 'nhom-bo-the').replace(/[^a-z0-9\u00C0-\u024F\u4E00-\u9FFF]+/gi, '-').replace(/^-|-$/g, '') || 'nhom-bo-the';
    downloadJsonFile({ version: 2, type: 'hanzi-flashcard-group', exportedAt: new Date().toISOString(), groups: [group], decks, results }, `hanzi-group-${safeName}.json`);
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
    if(Date.now() < flashcardSuppressClickUntil && target.closest('[data-flashcard-deck-card]')){
      event.preventDefault();
      return;
    }
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
    if(target.closest('[data-flashcard-curriculum-open]')){ await openFlashcardCurriculumBrowser(); return; }
    if(target.closest('[data-flashcard-ai-open]')){
      flashcardLibraryState.aiPromptBuilderOpen = true;
      flashcardLibraryState.aiPromptCopied = false;
      await renderFlashcardLibrary();
      return;
    }
    if(target.closest('[data-flashcard-ai-paste-open]')){ await openFlashcardAiPaste(); return; }
    if(target.closest('[data-flashcard-ai-paste-close]')){ flashcardLibraryState.aiPasteOpen=false; flashcardLibraryState.aiPasteAnalysis=null; flashcardLibraryState.aiPasteSelectedIds=new Set(); await renderFlashcardLibrary(); return; }
    const aiPasteMode=target.closest('[data-flashcard-ai-paste-mode]');
    if(aiPasteMode){ flashcardLibraryState.aiPasteMode=aiPasteMode.dataset.flashcardAiPasteMode==='quick'?'quick':'full'; flashcardLibraryState.aiPasteAnalysis=null; flashcardLibraryState.aiPasteSelectedIds=new Set(); flashcardLibraryState.aiPasteFlashcardMode='new'; flashcardLibraryState.aiPasteListeningMode='new'; await renderFlashcardLibrary(); return; }
    const aiPasteType=target.closest('[data-flashcard-ai-paste-type]');
    if(aiPasteType){ flashcardLibraryState.aiPasteExpectedType=aiPasteType.dataset.flashcardAiPasteType||'vocabulary'; flashcardLibraryState.aiPasteAnalysis=null; flashcardLibraryState.aiPasteSelectedIds=new Set(); await renderFlashcardLibrary(); return; }
    if(target.closest('[data-flashcard-ai-paste-analyze]')){ analyzeFlashcardAiPaste(); return; }
    const aiPasteFcMode=target.closest('[data-flashcard-ai-paste-fc-mode]');
    if(aiPasteFcMode){ flashcardLibraryState.aiPasteFlashcardMode=aiPasteFcMode.dataset.flashcardAiPasteFcMode==='existing'?'existing':'new'; if(flashcardLibraryState.aiPasteFlashcardMode==='existing'){ if(flashcardLibraryState.aiPasteMode==='full'){if(!flashcardLibraryState.aiPasteFlashcardGroupId)flashcardLibraryState.aiPasteFlashcardGroupId=flashcardLibraryState.groups[0]?.id||'';}else if(!flashcardLibraryState.aiPasteFlashcardDeckId)flashcardLibraryState.aiPasteFlashcardDeckId=flashcardLibraryState.decks[0]?.id||'';} await renderFlashcardLibrary(); return; }
    const aiPasteListenMode=target.closest('[data-flashcard-ai-paste-listen-mode]');
    if(aiPasteListenMode){ flashcardLibraryState.aiPasteListeningMode=aiPasteListenMode.dataset.flashcardAiPasteListenMode==='existing'?'existing':'new'; if(flashcardLibraryState.aiPasteListeningMode==='existing'){ if(flashcardLibraryState.aiPasteMode==='full'){if(!flashcardLibraryState.aiPasteListeningGroupId)flashcardLibraryState.aiPasteListeningGroupId=flashcardLibraryState.listeningGroups[0]?.id||'';}else if(!flashcardLibraryState.aiPasteListeningDeckId)flashcardLibraryState.aiPasteListeningDeckId=flashcardLibraryState.listeningDecks[0]?.id||'';} await renderFlashcardLibrary(); return; }
    if(target.closest('[data-flashcard-ai-paste-import]')){ await importFlashcardAiPaste(); return; }
    if(target.closest('[data-flashcard-ai-close]')){
      syncAiPromptFieldsFromView();
      flashcardLibraryState.aiPromptBuilderOpen = false;
      flashcardLibraryState.aiPromptCopied = false;
      await renderFlashcardLibrary();
      return;
    }
    const aiType = target.closest('[data-flashcard-ai-type]');
    if(aiType){
      syncAiPromptFieldsFromView();
      flashcardLibraryState.aiPromptType = aiType.dataset.flashcardAiType || 'vocabulary';
      flashcardLibraryState.aiPromptCopied = false;
      await renderFlashcardLibrary();
      return;
    }
    if(target.closest('[data-flashcard-ai-copy]')){ await copyAiPrompt(); return; }
    if(target.closest('[data-flashcard-curriculum-close]')){
      flashcardLibraryState.curriculumBrowserOpen = false;
      flashcardLibraryState.curriculumLesson = null;
      flashcardLibraryState.curriculumLessonKey = '';
      flashcardLibraryState.curriculumQuery = '';
      flashcardLibraryState.curriculumScrollTop = 0;
      await renderFlashcardLibrary();
      return;
    }
    if(target.closest('[data-flashcard-curriculum-lesson-back]')){
      flashcardLibraryState.curriculumLesson = null;
      flashcardLibraryState.curriculumLessonKey = '';
      flashcardLibraryState.curriculumQuery = '';
      await renderFlashcardLibrary();
      return;
    }
    const curriculumSource = target.closest('[data-flashcard-curriculum-source]');
    if(curriculumSource){ await selectFlashcardCurriculumSource(curriculumSource.dataset.flashcardCurriculumSource || 'new_hsk'); return; }
    const curriculumLevel = target.closest('[data-flashcard-curriculum-level]');
    if(curriculumLevel){ await selectFlashcardCurriculumLevel(curriculumLevel.dataset.flashcardCurriculumLevel); return; }
    const curriculumLesson = target.closest('[data-flashcard-curriculum-lesson]');
    if(curriculumLesson){ await openFlashcardCurriculumLesson(curriculumLesson.dataset.flashcardCurriculumLesson || ''); return; }
    const curriculumContent = target.closest('[data-flashcard-curriculum-content]');
    if(curriculumContent){
      const type = curriculumContent.dataset.flashcardCurriculumContent || 'vocabulary';
      if(curriculumContentTypes(flashcardLibraryState.curriculumLesson).some(row => row.id === type)){
        flashcardLibraryState.curriculumContentType = type;
        const cards = currentFlashcardCurriculumCards();
        flashcardLibraryState.curriculumCountMode = cards.length > 10 ? '10' : 'all';
        flashcardLibraryState.curriculumCustomCount = Math.min(10, cards.length || 10);
        flashcardLibraryState.curriculumSelectedIds = new Set(cards.map(card => card.id));
        flashcardLibraryState.curriculumQuery = '';
        await renderFlashcardLibrary();
      }
      return;
    }
    const curriculumCount = target.closest('[data-flashcard-curriculum-count]');
    if(curriculumCount && !curriculumCount.disabled){
      flashcardLibraryState.curriculumCountMode = curriculumCount.dataset.flashcardCurriculumCount || 'all';
      await renderFlashcardLibrary();
      return;
    }
    if(target.closest('[data-flashcard-curriculum-select-all]')){
      const cards = currentFlashcardCurriculumCards();
      const query = normalizeLibrarySearch(flashcardLibraryState.curriculumQuery || '');
      const visible = cards.filter(card => !query || normalizeLibrarySearch(curriculumCardSearchText(card)).includes(query));
      const allSelected = visible.length && visible.every(card => flashcardLibraryState.curriculumSelectedIds.has(card.id));
      visible.forEach(card => allSelected ? flashcardLibraryState.curriculumSelectedIds.delete(card.id) : flashcardLibraryState.curriculumSelectedIds.add(card.id));
      await renderFlashcardLibrary();
      return;
    }
    if(target.closest('[data-flashcard-curriculum-start]')){ startFlashcardCurriculumSession(); return; }
    if(target.closest('[data-flashcard-tools-open]')){
      flashcardLibraryState.dataManagerOpen = true;
      flashcardLibraryState.message = '';
      await renderFlashcardLibrary(); return;
    }
    if(target.closest('[data-flashcard-tools-back]')){
      flashcardLibraryState.dataManagerOpen = false;
      flashcardLibraryState.message = '';
      await renderFlashcardLibrary(); return;
    }
    if(target.closest('[data-flashcard-sort-open]')){
      flashcardLibraryState.sortSheetOpen = true;
      await renderFlashcardLibrary(); return;
    }
    if(target.closest('[data-flashcard-sort-close]') || target.matches('[data-flashcard-sort-backdrop]')){
      flashcardLibraryState.sortSheetOpen = false;
      await renderFlashcardLibrary(); return;
    }
    const sortOption = target.closest('[data-flashcard-sort-option]');
    if(sortOption){
      flashcardLibraryState.sortMode = sortOption.dataset.flashcardSortOption || 'updated-desc';
      flashcardLibraryState.sortSheetOpen = false;
      saveFlashcardLibrarySort(flashcardLibraryState.sortMode);
      await renderFlashcardLibrary(); return;
    }
    if(target.closest('[data-flashcard-custom-open]')){
      flashcardLibraryState.customDecksOpen = true;
      flashcardLibraryState.activeGroupId = '';
      clearFlashcardDeckSelection();
      clearPendingMovingDecks();
      flashcardLibraryState.message = '';
      await renderFlashcardLibrary(); return;
    }
    if(target.closest('[data-flashcard-custom-back]')){
      flashcardLibraryState.customDecksOpen = false;
      flashcardLibraryState.activeGroupId = '';
      flashcardLibraryState.editingGroup = null;
      clearPendingMovingDecks();
      clearFlashcardDeckSelection();
      flashcardLibraryState.sortSheetOpen = false;
      flashcardLibraryState.searchQuery = '';
      flashcardLibraryState.message = '';
      await renderFlashcardLibrary(); return;
    }
    if(target.closest('[data-flashcard-group-back]')){
      flashcardLibraryState.activeGroupId = '';
      clearFlashcardDeckSelection();
      clearPendingMovingDecks();
      flashcardLibraryState.searchQuery = '';
      flashcardLibraryState.message = '';
      await renderFlashcardLibrary(); return;
    }
    const groupOpen = target.closest('[data-flashcard-group-open]');
    if(groupOpen){
      flashcardLibraryState.activeGroupId = groupOpen.dataset.flashcardGroupOpen || '';
      clearFlashcardDeckSelection();
      clearPendingMovingDecks();
      flashcardLibraryState.searchQuery = '';
      flashcardLibraryState.message = '';
      await renderFlashcardLibrary(); return;
    }
    if(target.closest('[data-flashcard-group-new]')){
      flashcardLibraryState.editingGroup = { id: makeLocalId('group'), name: '', description: '', isNew: true };
      await renderFlashcardLibrary(); return;
    }
    const groupEdit = target.closest('[data-flashcard-group-edit]');
    if(groupEdit){
      const group = flashcardLibraryState.groups.find(item => item.id === groupEdit.dataset.flashcardGroupEdit);
      if(group) flashcardLibraryState.editingGroup = { ...group, isNew: false };
      await renderFlashcardLibrary(); return;
    }
    if(target.closest('[data-flashcard-group-edit-active]')){
      const group = getActiveFlashcardGroup();
      if(group) flashcardLibraryState.editingGroup = { ...group, isNew: false };
      await renderFlashcardLibrary(); return;
    }
    if(target.closest('[data-flashcard-group-editor-cancel]') || target.matches('[data-flashcard-group-editor-backdrop]')){
      flashcardLibraryState.editingGroup = null;
      await renderFlashcardLibrary(); return;
    }
    if(target.closest('[data-flashcard-group-save]')){
      const editor = flashcardLibraryState.editingGroup;
      if(!editor) return;
      const name = flashcardLibraryView.querySelector('[data-flashcard-group-name]')?.value.trim() || '';
      const description = flashcardLibraryView.querySelector('[data-flashcard-group-description]')?.value.trim() || '';
      if(!name){ window.alert('Vui lòng nhập tên nhóm.'); return; }
      const duplicate = flashcardLibraryState.groups.find(group => group.id !== editor.id && normalizeLibrarySearch(group.name) === normalizeLibrarySearch(name));
      if(duplicate){ window.alert('Đã có nhóm cùng tên.'); return; }
      const savedGroup = await saveFlashcardGroup({ ...editor, name, description });
      const movingIds = getPendingMovingDeckIds();
      if(movingIds.length){
        await moveFlashcardDecksToGroup(movingIds, savedGroup.id);
        clearPendingMovingDecks();
        clearFlashcardDeckSelection();
      }
      flashcardLibraryState.editingGroup = null;
      flashcardLibraryState.message = movingIds.length
        ? `Đã tạo nhóm “${name}” và chuyển ${movingIds.length} bộ vào nhóm.`
        : (editor.isNew ? `Đã tạo nhóm “${name}”.` : `Đã cập nhật nhóm “${name}”.`);
      await renderFlashcardLibrary(); return;
    }
    const groupExport = target.closest('[data-flashcard-group-export]');
    if(groupExport){
      const group = flashcardLibraryState.groups.find(item => item.id === groupExport.dataset.flashcardGroupExport);
      if(group) exportFlashcardGroup(group);
      return;
    }
    const groupDelete = target.closest('[data-flashcard-group-delete]');
    if(groupDelete){
      const groupId = groupDelete.dataset.flashcardGroupDelete || '';
      const group = flashcardLibraryState.groups.find(item => item.id === groupId);
      if(!group) return;
      const decks = flashcardLibraryState.decks.filter(deck => deck.groupId === groupId);
      const choice = await chooseFlashcardGroupDeletion(group, decks.length);
      if(choice === 'ungroup'){
        await moveGroupDecksToUngrouped(groupId);
        if(flashcardLibraryState.activeGroupId === groupId) flashcardLibraryState.activeGroupId = '';
        flashcardLibraryState.message = `Đã xóa nhóm “${group.name}” và đưa ${decks.length} bộ về Chưa phân nhóm.`;
        await renderFlashcardLibrary();
      }else if(choice === 'trash'){
        const trashItem = await moveGroupBundleToTrash(groupId);
        if(flashcardLibraryState.activeGroupId === groupId) flashcardLibraryState.activeGroupId = '';
        flashcardLibraryState.message = `Đã chuyển nhóm “${group.name}” và ${decks.length} bộ vào Thùng rác.`;
        await renderFlashcardLibrary();
        if(trashItem) showFlashcardUndoToast(`Đã chuyển nhóm “${group.name}” vào Thùng rác.`, trashItem.id);
      }
      return;
    }
    if(target.closest('[data-flashcard-deck-selection-start]')){
      flashcardLibraryState.deckSelectionMode = true;
      flashcardLibraryState.selectedDeckIds.clear();
      flashcardLibraryState.message = '';
      await renderFlashcardLibrary(); return;
    }
    if(target.closest('[data-flashcard-deck-selection-cancel]')){
      clearFlashcardDeckSelection();
      clearPendingMovingDecks();
      await renderFlashcardLibrary(); return;
    }
    const selectedDeckToggle = target.closest('[data-flashcard-deck-select]');
    if(selectedDeckToggle){
      toggleFlashcardDeckSelection(selectedDeckToggle.dataset.flashcardDeckSelect || '');
      await renderFlashcardLibrary(); return;
    }
    const selectionCard = target.closest('[data-flashcard-deck-card]');
    if(flashcardLibraryState.deckSelectionMode && selectionCard){
      toggleFlashcardDeckSelection(selectionCard.dataset.flashcardDeckCard || '');
      await renderFlashcardLibrary(); return;
    }
    if(target.closest('[data-flashcard-deck-select-all]')){
      const visibleIds = [...flashcardLibraryView.querySelectorAll('[data-flashcard-deck-card]')]
        .map(card => card.dataset.flashcardDeckCard || '')
        .filter(Boolean);
      const allSelected = visibleIds.length > 0 && visibleIds.every(id => flashcardLibraryState.selectedDeckIds.has(id));
      visibleIds.forEach(id => toggleFlashcardDeckSelection(id, !allSelected));
      await renderFlashcardLibrary(); return;
    }
    if(target.closest('[data-flashcard-deck-move-selected]')){
      const ids = [...flashcardLibraryState.selectedDeckIds];
      if(ids.length){
        flashcardLibraryState.movingDeckId = '';
        flashcardLibraryState.movingDeckIds = ids;
        await renderFlashcardLibrary();
      }
      return;
    }
    const moveDeck = target.closest('[data-flashcard-deck-move]');
    if(moveDeck){
      flashcardLibraryState.movingDeckId = moveDeck.dataset.flashcardDeckMove || '';
      flashcardLibraryState.movingDeckIds = [];
      await renderFlashcardLibrary(); return;
    }
    if(target.closest('[data-flashcard-deck-move-cancel]') || target.matches('[data-flashcard-deck-move-backdrop]')){
      clearPendingMovingDecks();
      await renderFlashcardLibrary(); return;
    }
    const groupTarget = target.closest('[data-flashcard-deck-group-target]');
    if(groupTarget){
      const movingIds = getPendingMovingDeckIds();
      if(movingIds.length){
        const groupId = groupTarget.dataset.flashcardDeckGroupTarget || null;
        const movedDecks = await moveFlashcardDecksToGroup(movingIds, groupId);
        const group = flashcardLibraryState.groups.find(item => item.id === groupId);
        flashcardLibraryState.message = groupId
          ? `Đã chuyển ${movedDecks.length} bộ vào nhóm “${group?.name || 'đã chọn'}”.`
          : `Đã đưa ${movedDecks.length} bộ về Chưa phân nhóm.`;
        clearFlashcardDeckSelection();
      }
      clearPendingMovingDecks();
      await renderFlashcardLibrary(); return;
    }
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
      flashcardLibraryState.editingDeck = { id: makeLocalId('deck'), name: '', description: '', groupId: flashcardLibraryState.activeGroupId || null, cards: [], isNew: true, entryMode: 'manual', quickImportText: '', quickImportRows: [], quickSegmentTokens: [], quickNewToken: '' };
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
    if(target.closest('[data-flashcard-content-import-trigger]')){ flashcardLibraryView.querySelector('[data-flashcard-content-import-file]')?.click(); return; }
    if(target.closest('[data-flashcard-template-toggle]')){ flashcardLibraryState.templateMenuOpen = !flashcardLibraryState.templateMenuOpen; await renderFlashcardLibrary(); return; }
    if(target.closest('[data-flashcard-import-trigger]')){ flashcardLibraryView.querySelector('[data-flashcard-import-file]')?.click(); return; }
    if(target.closest('[data-flashcard-import-confirm]')){ try{ await confirmFlashcardImport(); }catch(err){ window.alert(err.message || 'Không nhập được nội dung.'); } return; }
    if(target.closest('[data-flashcard-import-cancel]')){ cancelFlashcardImport(); return; }
    if(target.closest('[data-flashcard-reset-history]')){ resetFlashcardHistory(); return; }
    if(target.closest('[data-flashcard-reset-session]')){ resetActiveFlashcardSession(); return; }
  }

  async function handleFlashcardLibraryChange(event){
    const aiPasteBlock = event.target.closest('[data-flashcard-ai-paste-block]');
    if(aiPasteBlock){
      const id=aiPasteBlock.dataset.flashcardAiPasteBlock || '';
      if(aiPasteBlock.checked) flashcardLibraryState.aiPasteSelectedIds.add(id); else flashcardLibraryState.aiPasteSelectedIds.delete(id);
      await renderFlashcardLibrary(); return;
    }
    const aiPasteTo = event.target.closest('[data-flashcard-ai-paste-to]');
    if(aiPasteTo){
      if(aiPasteTo.dataset.flashcardAiPasteTo==='flashcards') flashcardLibraryState.aiPasteToFlashcards=aiPasteTo.checked;
      else flashcardLibraryState.aiPasteToListening=aiPasteTo.checked;
      await renderFlashcardLibrary(); return;
    }
    const aiPasteFcDeck=event.target.closest('[data-flashcard-ai-paste-fc-deck]');
    if(aiPasteFcDeck){ flashcardLibraryState.aiPasteFlashcardDeckId=aiPasteFcDeck.value; return; }
    const aiPasteFcGroup=event.target.closest('[data-flashcard-ai-paste-fc-group]');
    if(aiPasteFcGroup){ flashcardLibraryState.aiPasteFlashcardGroupId=aiPasteFcGroup.value; return; }
    const aiPasteListenDeck=event.target.closest('[data-flashcard-ai-paste-listen-deck]');
    if(aiPasteListenDeck){ flashcardLibraryState.aiPasteListeningDeckId=aiPasteListenDeck.value; return; }
    const aiPasteListenGroup=event.target.closest('[data-flashcard-ai-paste-listen-group]');
    if(aiPasteListenGroup){ flashcardLibraryState.aiPasteListeningGroupId=aiPasteListenGroup.value; return; }
    const curriculumCard = event.target.closest('[data-flashcard-curriculum-card]');
    if(curriculumCard){
      const id = curriculumCard.dataset.flashcardCurriculumCard || '';
      if(curriculumCard.checked) flashcardLibraryState.curriculumSelectedIds.add(id);
      else flashcardLibraryState.curriculumSelectedIds.delete(id);
      await renderFlashcardLibrary();
      return;
    }
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
    const contentInput = event.target.closest('[data-flashcard-content-import-file]');
    if(contentInput?.files?.[0]){
      try{ await prepareFlashcardImport(contentInput.files[0], 'content'); }
      catch(err){ window.alert(err.message || 'Không đọc được file nội dung.'); }
      contentInput.value = '';
      return;
    }
    const input = event.target.closest('[data-flashcard-import-file]');
    if(!input?.files?.[0]) return;
    try{ await prepareFlashcardImport(input.files[0], 'restore'); }
    catch(err){ window.alert(err.message || 'Không đọc được file backup JSON.'); }
    input.value = '';
  }

  let flashcardLibrarySearchTimer = 0;
  function handleFlashcardLibraryInput(event){
    const aiPasteText=event.target.closest('[data-flashcard-ai-paste-text]');
    if(aiPasteText){ flashcardLibraryState.aiPasteText=aiPasteText.value; return; }
    const aiPasteTitle=event.target.closest('[data-flashcard-ai-paste-title]');
    if(aiPasteTitle){ flashcardLibraryState.aiPasteTitle=aiPasteTitle.value; return; }
    const aiField = event.target.closest('[data-flashcard-ai-field]');
    if(aiField){
      const key = aiField.dataset.flashcardAiField;
      if(key){
        flashcardLibraryState.aiPromptFields = { ...(flashcardLibraryState.aiPromptFields || {}), [key]: key === 'count' ? Math.max(1, Number(aiField.value) || 1) : key === 'maxOutOfScopeWords' ? Math.max(0, Number(aiField.value) || 0) : aiField.value };
        flashcardLibraryState.aiPromptCopied = false;
        const output = flashcardLibraryView?.querySelector('[data-flashcard-ai-output]');
        if(output) output.value = getAiPromptOutput();
      }
      return;
    }
    const curriculumCountInput = event.target.closest('[data-flashcard-curriculum-custom-count]');
    if(curriculumCountInput){
      const max = currentFlashcardCurriculumCards().length || 1;
      flashcardLibraryState.curriculumCustomCount = Math.max(1, Math.min(max, Number(curriculumCountInput.value) || 1));
      window.clearTimeout(flashcardLibrarySearchTimer);
      flashcardLibrarySearchTimer = window.setTimeout(() => renderFlashcardLibrary(), 120);
      return;
    }
    const curriculumSearch = event.target.closest('[data-flashcard-curriculum-search]');
    if(curriculumSearch){
      flashcardLibraryState.curriculumQuery = curriculumSearch.value;
      window.clearTimeout(flashcardLibrarySearchTimer);
      flashcardLibrarySearchTimer = window.setTimeout(() => renderFlashcardLibrary(), 160);
      return;
    }
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

  function readStoredHskPinyinVisibility(){
    try{
      return window.localStorage?.getItem(HSK_PINYIN_VISIBILITY_STORAGE_KEY) !== 'false';
    }catch(_err){
      return true;
    }
  }

  function saveStoredHskPinyinVisibility(visible){
    hskState.showPinyin = visible !== false;
    try{
      window.localStorage?.setItem(HSK_PINYIN_VISIBILITY_STORAGE_KEY, String(hskState.showPinyin));
    }catch(_err){
      // localStorage có thể bị chặn; state trong phiên vẫn hoạt động bình thường.
    }
  }

  function hskSourceSupportsPinyinToggle(sourceKey = hskState.sourceKey){
    return ['hsk', 'new_hsk', 'yct', 'boya'].includes(String(sourceKey || ''));
  }

  function applyHskPinyinVisibility(){
    const visible = hskState.showPinyin !== false;
    hskList?.classList.toggle('is-pinyin-hidden', !visible);
    hskGroupModes?.querySelectorAll('[data-hsk-toggle-pinyin]').forEach(button => {
      button.classList.toggle('is-active', visible);
      button.setAttribute('aria-pressed', String(visible));
      button.setAttribute('aria-label', visible ? 'Ẩn pinyin' : 'Hiện pinyin');
      button.setAttribute('title', visible ? 'Ẩn pinyin' : 'Hiện pinyin');
    });
  }

  hskState.showPinyin = readStoredHskPinyinVisibility();

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
      const radicalLoader = window.HanziRadicals;
      if(radicalLoader?.ensureLoaded){
        radicalLoader.ensureLoaded({ reason: 'setStudyTab' }).catch(error => console.error('[Bộ thủ] Tải trực tiếp thất bại:', error));
      }else{
        window.dispatchEvent(new CustomEvent('hanzi:radicals-tab-open'));
      }
      window.setTimeout(() => {
        if(!radicalsView?.hidden && !window.HanziRadicals?.isLoaded?.()){
          window.HanziRadicals?.ensureLoaded?.({ reason: 'route-visible-recheck' });
        }
      }, 350);
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
    const primary = selected || routes[0] || null;
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
    const showingVocabularyTools = showingSelectedVocabulary && hskSourceSupportsPinyinToggle();
    const viewTools = showingVocabularyTools ? `
      <span class="hsk-route-inline-tools">
        <button type="button" class="hsk-route-icon-button ${hskState.vocabViewMode === 'list' ? 'active' : ''}" data-hsk-vocab-view="list" aria-pressed="${hskState.vocabViewMode === 'list'}" aria-label="Hiển thị dạng danh sách" title="Danh sách">☰</button>
        <button type="button" class="hsk-route-icon-button ${hskState.vocabViewMode === 'grid' ? 'active' : ''}" data-hsk-vocab-view="grid" aria-pressed="${hskState.vocabViewMode === 'grid'}" aria-label="Hiển thị dạng lưới" title="Lưới">▦</button>
        <button type="button" class="hsk-route-icon-button ui-pinyin-toggle ${hskState.showPinyin !== false ? 'is-active' : ''}" data-hsk-toggle-pinyin aria-pressed="${hskState.showPinyin !== false}" aria-label="${hskState.showPinyin !== false ? 'Ẩn' : 'Hiện'} pinyin" title="${hskState.showPinyin !== false ? 'Ẩn' : 'Hiện'} pinyin"><span class="ui-pinyin-toggle__mark" aria-hidden="true"></span></button>
      </span>
    ` : '';

    hskGroupModes.classList.toggle('has-back', showingSelectedVocabulary);
    hskGroupModes.classList.toggle('has-view-tools', showingVocabularyTools);
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
    applyHskPinyinVisibility();
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
    const fullLessonEntry = renderNewHskCourseLessonEntry(selected);
    return `
      <section class="hsk-section-word-view hsk-section-word-view--${modeClass}">
        ${fullLessonEntry}
        <div class="hsk-section-word-list">
          ${filtered.map((item, index) => renderHskItem(item, index)).join('')}
        </div>
      </section>
    `;
  }

  function renderNewHskCourseLessonEntry(selected){
    const route = selected?.route;
    const level = Number(route?.levelNo || 0);
    const lesson = Number(route?.sectionOrder || 0);
    const isReadyLesson = String(route?.libraryId || '') === 'new_hsk'
      && String(route?.sectionType || '') === 'lesson'
      && level >= 1 && level <= 3
      && lesson > 0;
    if(!isReadyLesson) return '';
    const url = new URL('../new-hsk-course/index.html', window.location.href);
    url.searchParams.set('level', String(level));
    url.searchParams.set('lesson', String(lesson));
    url.searchParams.set('view', 'book');
    return `
      <a class="hsk-full-course-entry" href="${escapeHtml(url.href)}">
        <span class="hsk-full-course-entry__icon" aria-hidden="true">课</span>
        <span class="hsk-full-course-entry__copy">
          <strong>Học toàn bộ bài theo sách</strong>
          <small>Bài khóa · hội thoại · từ mới · hoạt động · bài vè</small>
        </span>
        <span class="hsk-full-course-entry__arrow" aria-hidden="true">›</span>
      </a>
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
    const initialLimit = 3;
    const expanded = Boolean(hskState.popupSentencesExpanded);
    const visible = expanded ? rows : rows.slice(0, initialLimit);
    const hiddenCount = Math.max(0, rows.length - initialLimit);
    return `
      <section class="hsk-popup-section hsk-popup-sentences">
        <h4>Câu mẫu</h4>
        <div class="hsk-popup-sentence-list">
          ${visible.map(row => `
            <button type="button" class="hsk-popup-sentence-item" data-copy-text="${escapeHtml(row.zh)}" data-hsk-speak="${escapeHtml(row.zh)}">
              <strong>${escapeHtml(row.zh)}</strong>
              ${row.pinyin ? `<em>${escapeHtml(formatPinyin(row.pinyin))}</em>` : ''}
              ${row.vi ? `<span>${escapeHtml(row.vi)}</span>` : ''}
              <b aria-hidden="true">🔊</b>
            </button>
          `).join('')}
        </div>
        ${rows.length > initialLimit ? `<button type="button" class="hsk-popup-more-btn" data-hsk-sentences-toggle>${expanded ? 'Thu gọn' : `Xem thêm ${hiddenCount} câu`}</button>` : ''}
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
      });
  }

  async function enrichHskPopupItem(item, loadId){
    const chars = normalizePopupCharRows(item);
    const word = getHskWordKey(item);
    const [infos, sentenceIndex] = await Promise.all([
      Promise.all(chars.map(row => loadLocalCharInfo(row.char))),
      loadHsk1VocabularySentenceIndex()
    ]);
    if(loadId !== hskState.popupLoadId || word !== hskState.popupWord) return;

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
    const indexedSentences = sentenceIndex[word]?.sentences || [];
    if(indexedSentences.length){
      current.sampleSentences = normalizePopupSentences([
        ...collectPopupSentenceRows(current),
        ...indexedSentences.map(row => ({ zh: row.chinese, pinyin: row.pinyin, vi: row.meaningVi }))
      ]);
    }
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
    hskState.popupSentencesExpanded = false;
    hskState.popupActiveChar = '';
    const item = mergePopupSeed(findHskItem(target) || getFallbackItem(target, options.seed || {}), options.seed || {});
    renderHskPopup(item);
  }

  function closeHskPopup(){
    if(new URLSearchParams(window.location.search).get('embedPopup') === '1' && window.parent !== window){
      window.parent.postMessage({ type: 'tiengtrung:hsk-popup-close' }, window.location.origin);
    }
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
    hskState.popupSentencesExpanded = false;
  }

  function goBackHskPopup(){
    if(hskState.popupStack.length){
      const previous = hskState.popupStack.pop();
      const previousWord = typeof previous === 'string' ? previous : previous?.word;
      const previousSeed = typeof previous === 'string' ? {} : (previous?.seed || {});
      hskState.popupWord = previousWord;
      hskState.popupSeed = previousSeed;
      hskState.popupRelatedExpanded = false;
      hskState.popupSentencesExpanded = false;
      hskState.popupActiveChar = '';
      const item = mergePopupSeed(findHskItem(previousWord) || getFallbackItem(previousWord, previousSeed), previousSeed);
      renderHskPopup(item);
      return;
    }
    const returnContext = hskState.popupReturnContext;
    closeHskPopup();
    if(returnContext?.type === 'external' && window.parent !== window){
      window.parent.postMessage({ type: 'tiengtrung:hsk-popup-close' }, window.location.origin);
    }else if(returnContext?.type === 'radical' && returnContext.id && window.openRadicalLearningPopup){
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
            ${pinyin ? `<span class="hsk-pinyin" data-pinyin>${escapeHtml(pinyin)}</span>` : ''}
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

  const FLASHCARD_SESSION_DEFAULTS = { origin: 'library' };

  function createFlashcardSessionFromCards(cards, title, options = {}){
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
      origin: options.origin || FLASHCARD_SESSION_DEFAULTS.origin,
      contextKey: String(options.contextKey || `library:${String(title || 'flashcards')}`),
      contextLabel: String(options.contextLabel || title || 'Ôn Flashcard'),
      returnUrl: String(options.returnUrl || ''),
      typing: null,
      typingPromptTypes: [],
      sentenceOrdering: null,
      radicalSort: null
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
      phase: session.phase === 'preparing' ? 'setup' : session.phase,
      title: String(session.title || ''),
      cards: (session.cards || []).map(card => ({
        id: String(card.id || ''),
        word: String(card.word || ''),
        pinyin: String(card.pinyin || ''),
        meaningVi: String(card.meaningVi || ''),
        cardType: String(card.cardType || 'vocabulary'),
        title: String(card.title || ''),
        grammar: card.grammar && typeof card.grammar === 'object' ? card.grammar : null,
        structureUrl: String(card.structureUrl || ''),
        structurePracticeUrl: String(card.structurePracticeUrl || ''),
        tokens: Array.isArray(card.tokens) ? card.tokens : [],
        sourceWord: String(card.sourceWord || ''),
        characterData: Array.isArray(card.characterData) ? card.characterData : [],
        wordGlossary: Array.isArray(card.wordGlossary) ? card.wordGlossary : []
      })).filter(card => card.id && card.word),
      settings: {
        mode: session.settings?.mode || 'flashcard',
        showPinyin: session.settings?.showPinyin !== false,
        tapHanziSpeak: session.settings?.tapHanziSpeak !== false,
        autoPlay: Boolean(session.settings?.autoPlay),
        shuffle: Boolean(session.settings?.shuffle),
        showStroke: Boolean(session.settings?.showStroke),
        typingPromptType: session.settings?.typingPromptType || 'hanzi-to-pinyin',
        typingAutoAdvanceEnabled: session.settings?.typingAutoAdvanceEnabled !== false,
        typingAutoAdvanceMode: session.settings?.typingAutoAdvanceMode === 'custom' ? 'custom' : 'default',
        typingAutoAdvanceSeconds: normalizeFlashcardTypingAutoAdvanceSeconds(
          session.settings?.typingAutoAdvanceSeconds,
          HSK_FLASHCARD_TYPING_CUSTOM_DELAY_DEFAULT_SECONDS
        ),
        sentenceOrderingAutoAdvanceEnabled: session.settings?.sentenceOrderingAutoAdvanceEnabled !== false,
        sentenceOrderingAutoAdvanceSeconds: normalizeFlashcardOrderingDelay(session.settings?.sentenceOrderingAutoAdvanceSeconds, 1.2),
        sentenceOrderingDisplayCount: [1, 2, 3].includes(Number(session.settings?.sentenceOrderingDisplayCount)) ? Number(session.settings.sentenceOrderingDisplayCount) : 1,
        sentenceOrderingVocabularyList: session.settings?.sentenceOrderingVocabularyList === true,
        radicalSortDisplayMode: ['hanzi', 'pinyin', 'meaning'].includes(session.settings?.radicalSortDisplayMode) ? session.settings.radicalSortDisplayMode : 'hanzi',
        radicalSortMeaningList: session.settings?.radicalSortMeaningList === true
      },
      index: Number(session.index || 0),
      flipped: Boolean(session.flipped),
      ratings: session.ratings && typeof session.ratings === 'object' ? session.ratings : {},
      mixedTypes: Array.isArray(session.mixedTypes) ? session.mixedTypes : [],
      origin: session.origin || 'lesson',
      contextKey: String(session.contextKey || ''),
      contextLabel: String(session.contextLabel || ''),
      returnUrl: String(session.returnUrl || ''),
      typingPromptTypes: Array.isArray(session.typingPromptTypes) ? session.typingPromptTypes : [],
      typing: session.typing && typeof session.typing === 'object' ? session.typing : null,
      matching: session.matching && typeof session.matching === 'object' ? session.matching : null,
      sentenceOrdering: session.sentenceOrdering && typeof session.sentenceOrdering === 'object' ? session.sentenceOrdering : null,
      radicalSort: session.radicalSort && typeof session.radicalSort === 'object' ? session.radicalSort : null
    };
  }

  function recordFlashcardLearningHistory(session){
    const api = window.TiengTrungLearningHistory;
    if(!api?.record || !session?.cards?.length || session.phase !== 'study') return;
    const index = Math.max(0, Math.min(Number(session.index || 0), session.cards.length - 1));
    const signature = [session.contextKey || session.title || 'active', session.settings?.mode || '', index, session.cards.length].join('|');
    if(signature === flashcardLearningHistorySignature) return;
    flashcardLearningHistorySignature = signature;
    const url = new URL(window.location.href);
    url.hash = '';
    url.searchParams.set('study', 'flashcards');
    url.searchParams.set('resume', 'flashcard');
    api.record({
      id: `flashcard-session:${String(session.contextKey || session.title || 'active')}`,
      type: 'flashcards',
      icon: '卡',
      title: String(session.title || 'Phiên Flashcard'),
      subtitle: `${getFlashcardModeLabel(session.settings?.mode)} · Thẻ ${index + 1}/${session.cards.length}`,
      url: `${url.pathname}${url.search}`,
      updatedAt: new Date().toISOString()
    });
  }

  function persistFlashcardSession(){
    const payload = serializeFlashcardSession(hskState.flashcardSession);
    try{
      if(payload?.cards?.length){
        window.localStorage?.setItem(HSK_FLASHCARD_ACTIVE_SESSION_KEY, JSON.stringify(payload));
        recordFlashcardLearningHistory(hskState.flashcardSession);
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
          mode: ['flashcard', 'reverse', 'listen', 'typing', 'matching', 'sentence-ordering', 'radical-sort', 'mixed'].includes(settings.mode) ? settings.mode : 'flashcard',
          showPinyin: settings.showPinyin !== false,
          tapHanziSpeak: settings.tapHanziSpeak == null ? (Matching ? Matching.readSettings().tapHanziSpeak : true) : settings.tapHanziSpeak !== false,
          autoPlay: Boolean(settings.autoPlay),
          shuffle: Boolean(settings.shuffle),
          showStroke: Boolean(settings.showStroke),
          typingPromptType: ['hanzi-to-pinyin', 'hanzi-meaning-to-pinyin', 'meaning-to-pinyin', 'mixed'].includes(settings.typingPromptType) ? settings.typingPromptType : 'hanzi-to-pinyin',
          typingAutoAdvanceEnabled: settings.typingAutoAdvanceEnabled !== false,
          typingAutoAdvanceMode: settings.typingAutoAdvanceMode === 'custom' ? 'custom' : 'default',
          typingAutoAdvanceSeconds: normalizeFlashcardTypingAutoAdvanceSeconds(
            settings.typingAutoAdvanceSeconds,
            HSK_FLASHCARD_TYPING_CUSTOM_DELAY_DEFAULT_SECONDS
          ),
          sentenceOrderingAutoAdvanceEnabled: settings.sentenceOrderingAutoAdvanceEnabled !== false,
          sentenceOrderingAutoAdvanceSeconds: normalizeFlashcardOrderingDelay(settings.sentenceOrderingAutoAdvanceSeconds, 1.2),
          sentenceOrderingDisplayCount: [1, 2, 3].includes(Number(settings.sentenceOrderingDisplayCount)) ? Number(settings.sentenceOrderingDisplayCount) : 1,
          sentenceOrderingVocabularyList: settings.sentenceOrderingVocabularyList === true,
          radicalSortDisplayMode: ['hanzi', 'pinyin', 'meaning'].includes(settings.radicalSortDisplayMode) ? settings.radicalSortDisplayMode : 'hanzi',
          radicalSortMeaningList: settings.radicalSortMeaningList === true
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
        returnUrl: String(saved.returnUrl || ''),
        typingPromptTypes: Array.isArray(saved.typingPromptTypes) ? saved.typingPromptTypes : [],
        typing: saved.typing && typeof saved.typing === 'object' ? saved.typing : null,
        matching: null,
        sentenceOrdering: saved.sentenceOrdering && typeof saved.sentenceOrdering === 'object' ? saved.sentenceOrdering : null,
        radicalSort: saved.radicalSort && typeof saved.radicalSort === 'object' ? saved.radicalSort : null
      };
      if(hskState.flashcardSession.settings.mode === 'matching' && Matching){
        const pairs = cards.filter(card => card.word && card.meaningVi).map(card => ({ id:card.id, canonicalItemId:card.id, leftText:card.word, pinyin:card.pinyin || '', rightText:card.meaningVi, speechText:card.word, meta:{cardId:card.id} }));
        hskState.flashcardSession.matching = saved.matching
          ? Matching.hydrateSession(saved.matching, pairs, { title:'Nối thẻ', subtitle:hskState.flashcardSession.title, contentKind:flashcardMatchingContentKind(cards), showPinyin:hskState.flashcardSession.settings.showPinyin, tapToSpeak:hskState.flashcardSession.settings.tapHanziSpeak })
          : Matching.createSession(pairs, { title:'Nối thẻ', subtitle:hskState.flashcardSession.title, contentKind:flashcardMatchingContentKind(cards), showPinyin:hskState.flashcardSession.settings.showPinyin, tapToSpeak:hskState.flashcardSession.settings.tapHanziSpeak });
      }
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

  const FLASHCARD_PINYIN_SYLLABLE_SET = new Set('a|o|e|er|ai|ei|ao|ou|an|en|ang|eng|yi|ya|ye|yao|you|yan|yin|yang|ying|yong|wu|wa|wo|wai|wei|wan|wen|wang|weng|yu|yue|yuan|yun|ba|bo|bai|bei|bao|ban|ben|bang|beng|bi|bie|biao|bian|bin|bing|bu|pa|po|pai|pei|pao|pou|pan|pen|pang|peng|pi|pie|piao|pian|pin|ping|pu|ma|mo|me|mai|mei|mao|mou|man|men|mang|meng|mi|mie|miao|miu|mian|min|ming|mu|fa|fo|fei|fou|fan|fen|fang|feng|fu|da|de|dai|dei|dao|dou|dan|den|dang|deng|dong|di|dia|die|diao|diu|dian|ding|du|duo|dui|duan|dun|ta|te|tai|tei|tao|tou|tan|tang|teng|tong|ti|tie|tiao|tian|ting|tu|tuo|tui|tuan|tun|na|ne|nai|nei|nao|nou|nan|nen|nang|neng|nong|ni|nie|niao|niu|nian|nin|niang|ning|nu|nuo|nuan|nv|nve|la|le|lai|lei|lao|lou|lan|lang|leng|long|li|lia|lie|liao|liu|lian|lin|liang|ling|lu|luo|luan|lun|lv|lve|ga|ge|gai|gei|gao|gou|gan|gen|gang|geng|gong|gu|gua|guo|guai|gui|guan|gun|guang|ka|ke|kai|kei|kao|kou|kan|ken|kang|keng|kong|ku|kua|kuo|kuai|kui|kuan|kun|kuang|ha|he|hai|hei|hao|hou|han|hen|hang|heng|hong|hu|hua|huo|huai|hui|huan|hun|huang|ji|jia|jie|jiao|jiu|jian|jin|jiang|jing|jiong|ju|jue|juan|jun|qi|qia|qie|qiao|qiu|qian|qin|qiang|qing|qiong|qu|que|quan|qun|xi|xia|xie|xiao|xiu|xian|xin|xiang|xing|xiong|xu|xue|xuan|xun|zha|zhe|zhi|zhai|zhei|zhao|zhou|zhan|zhen|zhang|zheng|zhong|zhu|zhua|zhuo|zhuai|zhui|zhuan|zhun|zhuang|cha|che|chi|chai|chao|chou|chan|chen|chang|cheng|chong|chu|chua|chuo|chuai|chui|chuan|chun|chuang|sha|she|shi|shai|shei|shao|shou|shan|shen|shang|sheng|shu|shua|shuo|shuai|shui|shuan|shun|shuang|re|ri|rao|rou|ran|ren|rang|reng|rong|ru|rua|ruo|rui|ruan|run|za|ze|zi|zai|zei|zao|zou|zan|zen|zang|zeng|zong|zu|zuo|zui|zuan|zun|ca|ce|ci|cai|cao|cou|can|cen|cang|ceng|cong|cu|cuo|cui|cuan|cun|sa|se|si|sai|sao|sou|san|sen|sang|seng|song|su|suo|sui|suan|sun'.split('|'));

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

  function tokenizeFlashcardPinyinSyllables(value){
    return String(value || '')
      .trim()
      .split(/\s+/u)
      .map(part => part.trim())
      .filter(Boolean);
  }

  function formatFlashcardTypingDisplayFromTokens(tokens){
    return (tokens || []).map(token => token === 'u:' || token === 'ü' ? 'v' : token).join('');
  }

  function sanitizeFlashcardTypingDisplayValue(rawValue){
    return formatFlashcardTypingDisplayFromTokens(tokenizeFlashcardPinyin(rawValue));
  }

  function getFlashcardTypingExpectedLetterTokens(syllable){
    return tokenizeFlashcardPinyin(syllable);
  }

  function splitFlashcardPinyinGroupIntoSyllables(value){
    const normalized = sanitizeFlashcardTypingDisplayValue(value);
    if(!normalized) return [];
    const memo = new Map();
    const solve = index => {
      if(index >= normalized.length) return [];
      if(memo.has(index)) return memo.get(index);
      let best = null;
      for(let end = normalized.length; end > index; end -= 1){
        const part = normalized.slice(index, end);
        if(!FLASHCARD_PINYIN_SYLLABLE_SET.has(part)) continue;
        const rest = solve(end);
        if(rest === null) continue;
        const candidate = [part, ...rest];
        if(!best || candidate.length < best.length || (candidate.length === best.length && part.length > best[0].length)){
          best = candidate;
        }
      }
      memo.set(index, best);
      return best;
    };
    return solve(0) || [normalized];
  }

  function buildFlashcardTypingAnswerTokens(card){
    const groups = tokenizeFlashcardPinyinSyllables(card?.pinyin || '');
    if(!groups.length) return [];
    const flattened = groups.flatMap(group => {
      const syllables = splitFlashcardPinyinGroupIntoSyllables(group);
      return syllables.length ? syllables : [sanitizeFlashcardTypingDisplayValue(group)];
    }).filter(Boolean);
    const hanCount = countFlashcardHanCharacters(card?.word || '');
    if(!hanCount || flattened.length === hanCount) return flattened;
    if(flattened.length > hanCount){
      return flattened.slice(0, hanCount - 1).concat([flattened.slice(hanCount - 1).join('')]).filter(Boolean);
    }
    return flattened.concat(groups.slice(flattened.length)).slice(0, hanCount);
  }

  function getFlashcardTypingAnswerTokenHanCounts(card, answerTokens){
    const tokens = Array.isArray(answerTokens) ? answerTokens : [];
    if(!tokens.length) return [];
    return tokens.map(() => 1);
  }

  function trimFlashcardTypingTokensToValidPrefix(expectedTokens, inputTokens){
    let trimmed = Array.isArray(inputTokens) ? inputTokens.slice() : [];
    while(trimmed.length && !isFlashcardTypingPrefixAccepted(expectedTokens, trimmed)){
      trimmed = trimmed.slice(0, -1);
    }
    return trimmed;
  }

  function isFlashcardTypingTokenAccepted(expected, actual){
    if(expected === 'ü') return ['ü', 'u', 'v', 'u:'].includes(actual);
    return expected === actual;
  }

  function getTypingEligibleCards(cards, promptType){
    return (cards || []).filter(card => {
      if(!String(card?.pinyin || '').trim()) return false;
      if(['meaning-to-pinyin', 'hanzi-meaning-to-pinyin'].includes(promptType)){
        return Boolean(String(card?.meaningVi || '').trim());
      }
      return true;
    });
  }

  function resolveTypingPromptType(session, index){
    const configured = session.settings?.typingPromptType || 'hanzi-to-pinyin';
    if(configured !== 'mixed') return configured;
    const stored = session.typingPromptTypes?.[index];
    if(stored) return stored;
    const card = session.cards[index];
    if(!String(card?.meaningVi || '').trim()) return 'hanzi-to-pinyin';
    return ['hanzi-to-pinyin', 'hanzi-meaning-to-pinyin', 'meaning-to-pinyin'][index % 3];
  }

  function createFlashcardTypingState(session, card){
    const answerTokens = buildFlashcardTypingAnswerTokens(card);
    return {
      cardId: String(card?.id || ''),
      promptType: resolveTypingPromptType(session, session.index),
      answerTokens,
      answerTokenHanCounts: getFlashcardTypingAnswerTokenHanCounts(card, answerTokens),
      currentIndex: 0,
      committedTokens: [],
      typedValue: '',
      currentWrongToken: '',
      inputResetPending: false,
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
    const state = session.typing;
    if(typeof state.typedValue !== 'string'){
      state.typedValue = Array.isArray(state.committedTokens) ? state.committedTokens.join(' ') : '';
    }
    if(!Array.isArray(state.committedTokens)) state.committedTokens = [];
    if(!Array.isArray(state.answerTokens) || !state.answerTokens.length){
      state.answerTokens = buildFlashcardTypingAnswerTokens(card);
    }
    if(!Array.isArray(state.answerTokenHanCounts) || state.answerTokenHanCounts.length !== state.answerTokens.length){
      state.answerTokenHanCounts = getFlashcardTypingAnswerTokenHanCounts(card, state.answerTokens);
    }
    if(state.inputResetPending && !flashcardTypingErrorTimer){
      state.inputResetPending = false;
      state.currentWrongToken = '';
    }
    return state;
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

  function normalizeFlashcardTypingAutoAdvanceSeconds(value, fallback = HSK_FLASHCARD_TYPING_CUSTOM_DELAY_DEFAULT_SECONDS){
    const numeric = Number(value);
    const resolved = Number.isFinite(numeric) ? numeric : Number(fallback);
    return Math.max(0, Math.min(HSK_FLASHCARD_TYPING_CUSTOM_DELAY_MAX_SECONDS, Math.round(resolved * 10) / 10));
  }

  function normalizeFlashcardOrderingDelay(value, fallback = 1.2){
    const numeric = Number(value);
    const resolved = Number.isFinite(numeric) ? numeric : Number(fallback);
    return Math.max(0, Math.min(5, Math.round(resolved * 10) / 10));
  }

  function getFlashcardTypingPromptLayout(card, promptType = 'hanzi-to-pinyin'){
    if(promptType === 'meaning-to-pinyin') return 'meaning';
    const word = String(card?.word || '').trim();
    const hanCount = countFlashcardHanCharacters(word);
    const visibleLength = Array.from(word.replace(/\s+/gu, '')).length;
    const looksLikeSentence = /[。！？!?；;，,]/u.test(word) || /\s/u.test(word);
    if(hanCount <= 1 && visibleLength <= 2) return 'single';
    if(hanCount <= 4 && visibleLength <= 6 && !looksLikeSentence) return 'short';
    if(looksLikeSentence && hanCount >= 4) return 'sentence';
    if(hanCount <= 10 && visibleLength <= 14) return 'phrase';
    return 'sentence';
  }

  function getFlashcardTypingHanziLengthClass(card){
    return countFlashcardHanCharacters(card?.word || '') > 10
      ? 'is-hanzi-wrap'
      : 'is-hanzi-single-line';
  }

  function renderFlashcardTypingPromptHanzi(card, state){
    const currentTokenIndex = Math.max(0, Number(state?.currentIndex || 0));
    let hanIndex = 0;
    return Array.from(String(card?.word || '')).map(character => {
      if(/\p{Script=Han}/u.test(character)){
        const isDone = state?.isCompleting || hanIndex < currentTokenIndex;
        const isCurrent = !state?.isCompleting && hanIndex === currentTokenIndex;
        const className = [
          'hsk-flashcard-typing-prompt-char',
          isDone ? 'is-done' : '',
          isCurrent ? 'is-current' : ''
        ].filter(Boolean).join(' ');
        hanIndex += 1;
        return `<span class="${className}">${escapeHtml(character)}</span>`;
      }
      return `<span class="hsk-flashcard-typing-prompt-char is-separator">${escapeHtml(character)}</span>`;
    }).join('');
  }

  function renderFlashcardTypingPrompt(card, state){
    if(state.promptType === 'meaning-to-pinyin'){
      return `<small>NGHĨA VIỆT → PINYIN</small><strong class="hsk-flashcard-typing-prompt-text">${escapeHtml(card.meaningVi)}</strong>`;
    }
    const showMeaning = state.promptType === 'hanzi-meaning-to-pinyin' && card.meaningVi;
    return `
      <small>${showMeaning ? 'CHỮ TRUNG + NGHĨA VIỆT → PINYIN' : 'CHỮ TRUNG → PINYIN'}</small>
      <strong class="hsk-flashcard-typing-prompt-hanzi" lang="zh-Hans">${renderFlashcardTypingPromptHanzi(card, state)}</strong>
      ${showMeaning ? `<p class="hsk-flashcard-typing-context-meaning">${escapeHtml(card.meaningVi)}</p>` : ''}
    `;
  }

  function getFlashcardTypingInputPlaceholder(){
    return 'Nhập pinyin không dấu';
  }

  function renderFlashcardTypingSlots(){
    return '';
  }

  function renderFlashcardTypingStudy(session, card){
    const state = ensureFlashcardTypingState(session);
    const stats = getFlashcardTypingStats(state);
    const hintIndex = state.currentIndex;
    const hintVisible = Boolean(state.hintShownByIndex?.[hintIndex]);
    const promptLayout = getFlashcardTypingPromptLayout(card, state.promptType);
    const prompt = renderFlashcardTypingPrompt(card, state);
    const autoAdvanceLabel = getFlashcardTypingAutoAdvanceLabel(session, card);
    return `
      <header class="hsk-flashcard-header">
        <button type="button" class="hsk-flashcard-back" data-hsk-flashcard-to-setup>← Thiết lập</button>
        <span class="hsk-flashcard-progress" data-hsk-flashcard-typing-progress>${session.index + 1} / ${session.cards.length}</span>
        <button type="button" class="hsk-flashcard-close" data-hsk-flashcard-close aria-label="Đóng">×</button>
      </header>
      <div class="hsk-flashcard-study hsk-flashcard-typing-study">
        <div class="hsk-flashcard-study-meta"><b>Gõ Pinyin</b><span>${escapeHtml(session.title)}</span></div>
        <section class="hsk-flashcard-typing-card is-prompt-${promptLayout} ${getFlashcardTypingHanziLengthClass(card)} ${state.isCompleting ? 'is-complete' : ''}" data-hsk-flashcard-typing-card>
          <div class="hsk-flashcard-typing-prompt" data-hsk-flashcard-typing-prompt>${prompt}</div>
          <div class="hsk-flashcard-typing-slots" data-hsk-flashcard-typing-slots aria-hidden="true" hidden>${renderFlashcardTypingSlots(state)}</div>
          <input class="hsk-flashcard-typing-input ${state.inputResetPending ? 'is-wrong' : ''} ${state.isCompleting ? 'is-correct' : ''}" data-hsk-flashcard-typing-input type="text" inputmode="text" autocapitalize="none" autocomplete="off" autocorrect="off" spellcheck="false" value="${escapeHtml(state.typedValue || '')}" placeholder="${escapeHtml(getFlashcardTypingInputPlaceholder())}" aria-label="Nhập pinyin" ${state.isCompleting ? 'readonly' : ''}>
          <div class="hsk-flashcard-typing-feedback" data-hsk-flashcard-typing-feedback aria-live="polite">
            ${state.inputResetPending ? '<span class="is-error">Chưa đúng, nhập lại</span>' : ''}
            ${hintVisible ? `<span class="is-hint">Gợi ý: ${escapeHtml(state.answerTokens[hintIndex] || '')}</span>` : ''}
            ${state.isCompleting ? '<span class="is-success">✓ Chính xác</span>' : ''}
          </div>
          <div class="hsk-flashcard-typing-result" data-hsk-flashcard-typing-result data-hsk-flashcard-typing-complete aria-live="polite" ${state.isCompleting ? '' : 'hidden'}>
            <span class="hsk-flashcard-typing-result-word" data-hsk-flashcard-typing-result-word>${escapeHtml(card.word)}</span>
            <strong class="hsk-flashcard-typing-result-pinyin" data-hsk-flashcard-typing-result-pinyin>${escapeHtml(card.pinyin)}</strong>
            <p class="hsk-flashcard-typing-result-meaning" data-hsk-flashcard-typing-result-meaning ${card.meaningVi ? '' : 'hidden'}>${escapeHtml(card.meaningVi || '')}</p>
            <p class="hsk-flashcard-typing-auto-status" data-hsk-flashcard-typing-auto-status>${escapeHtml(autoAdvanceLabel)}</p>
            <p class="hsk-flashcard-typing-continue-hint" data-hsk-flashcard-typing-continue-hint ${state.completionTapArmed ? '' : 'hidden'}>Chạm vào đáp án để tiếp tục</p>
            <button type="button" class="hsk-flashcard-typing-continue" data-hsk-flashcard-typing-continue>Tiếp tục ngay →</button>
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

  function cancelFlashcardTypingErrorTimer(){
    if(flashcardTypingErrorTimer){
      window.clearTimeout(flashcardTypingErrorTimer);
      flashcardTypingErrorTimer = 0;
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

  function placeFlashcardTypingCaretAtEnd(input){
    if(!input) return;
    try{
      const end = input.value.length;
      input.setSelectionRange(end, end);
    }catch(_err){
      // Một số trình duyệt không hỗ trợ setSelectionRange cho trạng thái hiện tại.
    }
    input.scrollLeft = input.scrollWidth;
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
    if(prompt){
      prompt.innerHTML = renderFlashcardTypingPrompt(card, state);
    }
    const progress = body.querySelector('[data-hsk-flashcard-typing-progress]');
    if(progress) progress.textContent = `${session.index + 1} / ${session.cards.length}`;

    const slots = body.querySelector('[data-hsk-flashcard-typing-slots]');
    if(slots) slots.innerHTML = '';

    const hintIndex = Math.min(state.currentIndex, Math.max(0, state.answerTokens.length - 1));
    const hintVisible = Boolean(state.hintShownByIndex?.[hintIndex]);
    const feedback = body.querySelector('[data-hsk-flashcard-typing-feedback]');
    if(feedback){
      feedback.innerHTML = [
        state.inputResetPending ? '<span class="is-error">Chưa đúng, nhập lại</span>' : '',
        hintVisible && !state.inputResetPending ? `<span class="is-hint">Gợi ý: ${escapeHtml(state.answerTokens[hintIndex] || '')}</span>` : '',
        state.isCompleting ? '<span class="is-success">✓ Chính xác</span>' : ''
      ].filter(Boolean).join('');
    }

    const typingCard = body.querySelector('[data-hsk-flashcard-typing-card]');
    if(typingCard){
      typingCard.classList.toggle('is-complete', Boolean(state.isCompleting));
      ['single', 'short', 'phrase', 'sentence', 'meaning'].forEach(layout => {
        typingCard.classList.toggle(`is-prompt-${layout}`, getFlashcardTypingPromptLayout(card, state.promptType) === layout);
      });
      typingCard.classList.toggle('is-hanzi-wrap', countFlashcardHanCharacters(card?.word || '') > 10);
      typingCard.classList.toggle('is-hanzi-single-line', countFlashcardHanCharacters(card?.word || '') <= 10);
    }
    const result = body.querySelector('[data-hsk-flashcard-typing-result]');
    const controls = body.querySelector('[data-hsk-flashcard-typing-controls]');
    const continueHint = body.querySelector('[data-hsk-flashcard-typing-continue-hint]');
    const autoStatus = body.querySelector('[data-hsk-flashcard-typing-auto-status]');
    if(result) result.hidden = !state.isCompleting;
    if(controls) controls.hidden = Boolean(state.isCompleting);
    if(continueHint) continueHint.hidden = !state.completionTapArmed;
    if(autoStatus) autoStatus.textContent = getFlashcardTypingAutoAdvanceLabel(session, card);

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
    if(input.value !== state.typedValue) input.value = state.typedValue;
    input.placeholder = getFlashcardTypingInputPlaceholder();
    input.readOnly = Boolean(state.isCompleting);
    input.setAttribute('aria-disabled', String(Boolean(state.isCompleting)));
    input.classList.toggle('is-wrong', Boolean(state.inputResetPending));
    input.classList.toggle('is-correct', Boolean(state.isCompleting));
    if(options.keepFocus !== false && !state.isCompleting && document.activeElement !== input){
      try{ input.focus({ preventScroll: true }); }catch(_err){ input.focus(); }
    }
    if(document.activeElement === input || options.scrollToLatest){
      placeFlashcardTypingCaretAtEnd(input);
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

  function getFlashcardTypingCompletionDelayMs(session, card){
    const settings = session?.settings || getFlashcardSettings();
    if(settings.typingAutoAdvanceEnabled === false) return null;
    if(settings.typingAutoAdvanceMode === 'custom')
      return normalizeFlashcardTypingAutoAdvanceSeconds(settings.typingAutoAdvanceSeconds) * 1000;
    return countFlashcardHanCharacters(card?.word) > 5
      ? HSK_FLASHCARD_TYPING_LONG_COMPLETION_DELAY_MS
      : HSK_FLASHCARD_TYPING_SHORT_COMPLETION_DELAY_MS;
  }

  function formatFlashcardTypingAutoAdvanceSeconds(milliseconds){
    const seconds = Math.max(0, Number(milliseconds || 0) / 1000);
    return Number.isInteger(seconds) ? String(seconds) : String(Math.round(seconds * 10) / 10);
  }

  function getFlashcardTypingAutoAdvanceLabel(session, card){
    if(session?.settings?.typingAutoAdvanceEnabled === false) return 'Tự chuyển đang tắt';
    const delay = getFlashcardTypingCompletionDelayMs(session, card);
    if(delay === null) return 'Tự chuyển đang tắt';
    if(delay === 0) return 'Tự chuyển ngay sau khi đúng';
    return `Tự chuyển sau ${formatFlashcardTypingAutoAdvanceSeconds(delay)} giây`;
  }

  function resetFlashcardTypingCompletionTimer(session, state){
    if(!session || !state?.isCompleting) return;
    const delay = getFlashcardTypingCompletionDelayMs(session, session.cards?.[session.index]);
    cancelFlashcardTypingCompletionTimer();
    if(delay === null){
      state.completionDelayMs = 0;
      state.completionDueAt = 0;
      return;
    }
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
    if(session?.settings?.typingAutoAdvanceEnabled === false || delayMs === null) return;
    const numericDelay = Number(delayMs);
    const delay = Number.isFinite(numericDelay) ? Math.max(0, numericDelay) : HSK_FLASHCARD_TYPING_SHORT_COMPLETION_DELAY_MS;
    flashcardTypingCompletionTimer = window.setTimeout(() => {
      flashcardTypingCompletionTimer = 0;
      const state = session?.typing;
      if(hskState.flashcardSession !== session || state?.cardId !== cardId || !state?.completionPending) return;
      completeFlashcardTypingTransitionNow();
    }, delay);
  }

  function isFlashcardTypingPrefixAccepted(answerTokens, inputTokens){
    if(inputTokens.length > answerTokens.length) return false;
    return inputTokens.every((token, index) => isFlashcardTypingTokenAccepted(answerTokens[index], token));
  }

  function scheduleFlashcardTypingWrongReset(session, state){
    cancelFlashcardTypingErrorTimer();
    const cardId = state.cardId;
    flashcardTypingErrorTimer = window.setTimeout(() => {
      flashcardTypingErrorTimer = 0;
      const currentSession = hskState.flashcardSession;
      const currentState = currentSession && getCurrentFlashcardType(currentSession) === 'typing'
        ? ensureFlashcardTypingState(currentSession)
        : null;
      if(currentSession !== session || !currentState || currentState.cardId !== cardId || currentState.isCompleting) return;
      currentState.currentWrongToken = '';
      currentState.inputResetPending = false;
      persistFlashcardSession();
      patchFlashcardTypingView(currentSession, { keepFocus: true, scrollToLatest: true });
    }, 360);
  }

  function submitFlashcardTypingInput(rawValue, inputElement = null){
    const session = hskState.flashcardSession;
    if(!session || session.phase !== 'study' || getCurrentFlashcardType(session) !== 'typing') return;
    const state = ensureFlashcardTypingState(session);
    if(!state || state.isCompleting) return;

    const expectedSyllable = state.answerTokens[state.currentIndex] || '';
    const expectedLetterTokens = getFlashcardTypingExpectedLetterTokens(expectedSyllable);
    const rawTokens = tokenizeFlashcardPinyin(rawValue);
    const displayValue = sanitizeFlashcardTypingDisplayValue(rawValue);
    state.typedValue = displayValue;

    if(!expectedLetterTokens.length){
      state.isCompleting = true;
      patchFlashcardTypingView(session, { keepFocus: false, scrollToLatest: true });
      return;
    }

    if(!rawTokens.length){
      state.currentWrongToken = '';
      state.inputResetPending = false;
      persistFlashcardSession();
      patchFlashcardTypingView(session, { keepFocus: true, scrollToLatest: true });
      return;
    }

    if(!isFlashcardTypingPrefixAccepted(expectedLetterTokens, rawTokens)){
      const trimmedTokens = trimFlashcardTypingTokensToValidPrefix(expectedLetterTokens, rawTokens);
      state.currentWrongToken = rawTokens[rawTokens.length - 1] || displayValue.slice(-1);
      state.inputResetPending = true;
      state.totalMistakes += 1;
      const errorIndex = Math.min(state.currentIndex, Math.max(0, state.answerTokens.length - 1));
      state.mistakesByIndex[errorIndex] = Number(state.mistakesByIndex[errorIndex] || 0) + 1;
      if(state.mistakesByIndex[errorIndex] >= 5) state.hintShownByIndex[errorIndex] = true;
      state.typedValue = formatFlashcardTypingDisplayFromTokens(trimmedTokens);
      if(inputElement) inputElement.value = state.typedValue;
      scheduleFlashcardTypingWrongReset(session, state);
      persistFlashcardSession();
      patchFlashcardTypingView(session, { keepFocus: true, scrollToLatest: true });
      return;
    }

    cancelFlashcardTypingErrorTimer();
    state.currentWrongToken = '';
    state.inputResetPending = false;
    state.typedValue = displayValue;

    if(rawTokens.length >= expectedLetterTokens.length){
      state.committedTokens = [...state.committedTokens, expectedSyllable];
      state.currentIndex += 1;
      state.correctInputs += 1;
      state.typedValue = '';

      if(state.currentIndex >= state.answerTokens.length){
        state.isCompleting = true;
        state.completedAt = Date.now();
        state.completionPending = true;
        state.completionTapArmed = false;
        state.keyboardDismissedAfterComplete = false;
        const card = session.cards[session.index];
        const completionDelay = getFlashcardTypingCompletionDelayMs(session, card);
        state.completionDelayMs = completionDelay === null ? 0 : completionDelay;
        state.completionDueAt = completionDelay === null ? 0 : Date.now() + completionDelay;
        state.completionCardKey = String(card?.id || state.cardId || '');
        const rating = state.answerRevealUsed ? 'hard' : (state.totalMistakes > 0 ? 'review' : 'easy');
        const previousRating = session.ratings[card.id] || '';
        session.ratings[card.id] = rating;
        saveFlashcardRatingResult(card, rating, previousRating);
        persistFlashcardSession();
        patchFlashcardTypingView(session, { keepFocus: false, scrollToLatest: true });
        if(completionDelay !== null) scheduleFlashcardTypingNextCard(session, card.id, completionDelay);
        return;
      }
    }

    persistFlashcardSession();
    patchFlashcardTypingView(session, { keepFocus: true, scrollToLatest: true });
  }

  function deleteFlashcardTypingToken(){
    const session = hskState.flashcardSession;
    if(!session || getCurrentFlashcardType(session) !== 'typing') return;
    const state = ensureFlashcardTypingState(session);
    if(!state || state.isCompleting) return;
    state.typedValue = state.typedValue.slice(0, -1);
    state.currentWrongToken = '';
    state.inputResetPending = false;
    persistFlashcardSession();
    patchFlashcardTypingView(session, { keepFocus: true, scrollToLatest: true });
  }


  let flashcardRadicalLookupPromise = null;
  const flashcardCharacterInfoPromises = new Map();
  const flashcardRadicalStatePromises = new Map();
  let flashcardRadicalPersistTimer = null;

  function normalizeFlashcardSentenceAnswer(value){
    return String(value || '').replace(/[\s，,。.!！?？；;：:“”"'‘’、]/gu, '');
  }

  function getSentenceOrderingEligibleCards(cards){
    const vocabularyHints = (cards || []).filter(card => card.cardType === 'vocabulary' || card.cardType === 'proper-noun').map(card => card.word);
    return (cards || []).map(card => {
      const tokens = Array.isArray(card.tokens) && card.tokens.length ? card.tokens.map(String).filter(Boolean) : segmentFlashcardSentence(card.word, [...vocabularyHints, card.sourceWord]);
      return { ...card, tokens };
    }).filter(card => card.cardType === 'sentence' && card.tokens.length >= 2 && normalizeFlashcardSentenceAnswer(card.tokens.join('')) === normalizeFlashcardSentenceAnswer(card.word));
  }

  function createFlashcardSentenceOrderingState(cards){
    const items = getSentenceOrderingEligibleCards(cards).map((card,index)=>({
      id:card.id, card, tokens:card.tokens.slice(), bank:shuffleCards(card.tokens.map((text,tokenIndex)=>({id:`${card.id}:token:${tokenIndex}`,text}))), selected:[], complete:false, feedback:'', mistakes:0, order:index
    }));
    return { items, index:0, correct:0, wrong:0 };
  }

  async function loadFlashcardRadicalLookup(){
    if(!flashcardRadicalLookupPromise){
      flashcardRadicalLookupPromise = Promise.all([fetchJson(FLASHCARD_RADICAL_INDEX_URL), fetchJson(FLASHCARD_RADICAL_CATALOG_URL)]).then(([index,catalog])=>{
        const catalogItems=Array.isArray(catalog?.items)?catalog.items:[];
        const byId=new Map(catalogItems.map(item=>[item.id,item]));
        const glyphToItem=new Map();
        catalogItems.forEach(item=>[item.key,item.mainForm,item.sideForm,...(item.variants||[])].filter(Boolean).forEach(glyph=>glyphToItem.set(glyph,item)));
        const byChar=new Map();
        Object.entries(index || {}).forEach(([radicalId,rows])=>{
          (rows || []).forEach(row=>{
            const word=String(row?.word || '').trim();
            if(Array.from(word).length !== 1 || byChar.has(word)) return;
            const radical=byId.get(radicalId);
            if(radical) byChar.set(word,radical);
          });
        });
        return {byId,glyphToItem,byChar};
      });
    }
    return flashcardRadicalLookupPromise;
  }

  async function loadFlashcardCharacterInfo(char, lookup){
    if(!char || !lookup) return {radical:null,pinyin:'',meaningVi:''};
    if(flashcardCharacterInfoPromises.has(char)) return flashcardCharacterInfoPromises.get(char);
    const code=char.codePointAt(0).toString(16).toUpperCase().padStart(4,'0');
    const promise=fetchJson(`data/chars/${code}.json`).then(data=>{
      const glyph=String(data?.radical || '').trim();
      return {
        radical:glyph ? (lookup.glyphToItem.get(glyph) || null) : null,
        pinyin:formatPinyin(data?.pinyin || ''),
        meaningVi:String(data?.meaningVi || data?.meaning || '').trim()
      };
    }).catch(()=>({radical:null,pinyin:'',meaningVi:''}));
    flashcardCharacterInfoPromises.set(char,promise);
    return promise;
  }


  async function loadFlashcardCharacterRadical(char, lookup){
    return (await loadFlashcardCharacterInfo(char, lookup)).radical;
  }

  function sourceItemDictionaryRadical(sourceItem, lookup){
    const components=Array.isArray(sourceItem?.components)?sourceItem.components:[];
    const component=components.find(row=>row?.isDictionaryRadical===true || row?.role==='radical' || row?.radical?.isDictionaryRadical===true);
    if(!component) return null;
    return lookup.byId.get(component.radicalId || component.radical?.id) || lookup.glyphToItem.get(component.radical?.character || component.glyph) || null;
  }

  function cardCharacterCandidates(card){
    return Array.from(new Set(Array.from(String(card?.word || '')).filter(char=>/\p{Script=Han}/u.test(char))));
  }

  function mergeRadicalLearningAnalysis(char, character, learning, resolvedRadical){
    const lessonComponents=Array.isArray(character?.components) ? character.components : [];
    const learningComponents=Array.isArray(learning?.components) ? learning.components : [];
    const componentMap=new Map();
    [...lessonComponents.map(row=>({
      glyph:String(row?.glyph || row?.char || '').trim(),
      pinyin:String(row?.pinyin || '').trim(),
      hanViet:String(row?.hanViet || '').trim(),
      meaningVi:String(row?.meaningVi || '').trim(),
      roleVi:String(row?.roleVi || '').trim(),
      positionVi:String(row?.positionVi || '').trim()
    })),...learningComponents].forEach(row=>{
      const glyph=String(row?.glyph || '').trim();
      if(!glyph) return;
      const previous=componentMap.get(glyph) || {glyph};
      componentMap.set(glyph,{
        ...previous,
        glyph,
        pinyin:String(previous.pinyin || row?.pinyin || '').trim(),
        hanViet:String(previous.hanViet || row?.hanViet || '').trim(),
        meaningVi:String(previous.meaningVi || row?.meaningVi || '').trim(),
        roleVi:String(previous.roleVi || row?.roleVi || '').trim(),
        positionVi:String(previous.positionVi || row?.positionVi || '').trim()
      });
    });
    const radicalSource=learning?.radical || character?.dictionaryRadical || {};
    const radical={
      glyph:String(radicalSource.glyph || resolvedRadical?.sideForm || resolvedRadical?.key || resolvedRadical?.mainForm || '').trim(),
      nameVi:String(radicalSource.nameVi || resolvedRadical?.displayNameVi || '').trim(),
      pinyin:String(radicalSource.pinyin || resolvedRadical?.pinyin || '').trim(),
      hanViet:String(radicalSource.hanViet || resolvedRadical?.hanViet || '').trim(),
      meaningVi:String(radicalSource.meaningVi || '').trim()
    };
    return {
      char,
      radical,
      structureLabel:String(character?.structure?.labelVi || learning?.structure?.labelVi || '').trim(),
      components:Array.from(componentMap.values()),
      explanationVi:String(learning?.explanationVi || '').trim(),
      memoryVi:String(learning?.memoryVi || '').trim(),
      commonErrors:Array.isArray(character?.pedagogy?.commonErrors) ? character.pedagogy.commonErrors.filter(Boolean) : (Array.isArray(learning?.commonErrors) ? learning.commonErrors.filter(Boolean) : [])
    };
  }

  function buildFlashcardRadicalRounds(entries){
    const grouped=new Map();
    (entries || []).forEach(entry=>{
      const id=entry?.radical?.id;
      if(!id) return;
      if(!grouped.has(id)) grouped.set(id,{
        id,
        glyph:entry.radical.sideForm || entry.radical.key || entry.radical.mainForm,
        name:entry.radical.displayNameVi || '',
        pinyin:entry.radical.pinyin || '',
        hanViet:entry.radical.hanViet || '',
        queue:[]
      });
      grouped.get(id).queue.push(entry);
    });
    grouped.forEach(group=>{ group.queue=shuffleCards(group.queue); });
    const rounds=[];
    while(Array.from(grouped.values()).some(group=>group.queue.length)){
      const active=Array.from(grouped.values()).filter(group=>group.queue.length).sort((a,b)=>b.queue.length-a.queue.length || a.name.localeCompare(b.name,'vi'));
      const selected=active.slice(0,4);
      const roundEntries=[];
      while(roundEntries.length<12 && selected.some(group=>group.queue.length)){
        for(const group of selected){
          if(roundEntries.length>=12) break;
          const entry=group.queue.shift();
          if(entry) roundEntries.push(entry);
        }
      }
      const present=new Set(roundEntries.map(entry=>entry.radical.id));
      const groups=selected.filter(group=>present.has(group.id)).map(group=>({
        id:group.id,glyph:group.glyph,name:group.name,pinyin:group.pinyin,hanViet:group.hanViet,items:[]
      }));
      const items=roundEntries.map((item,index)=>({
        id:`radical-sort:${rounds.length}:${item.char}:${index}`,
        hanzi:item.char,
        pinyin:item.pinyin || '',
        meaningVi:item.meaningVi || '',
        groupId:item.radical.id,
        sourceCardId:item.sourceCardId,
        analysis:item.analysis || null,
        done:false
      }));
      if(items.length) rounds.push({groups,items});
    }
    return rounds;
  }

  async function createFlashcardRadicalSortState(cards){
    const lookup=await loadFlashcardRadicalLookup();
    const candidates=new Map();
    for(const card of cards || []){
      const explicit=new Map((card.characterData || []).map(row=>[row.hanzi,row]));
      for(const char of cardCharacterCandidates(card)){
        if(!candidates.has(char)) candidates.set(char,{char,card,character:explicit.get(char) || null});
      }
    }
    const resolved=await Promise.all(Array.from(candidates.values()).map(async entry=>{
      const {char,card,character}=entry;
      const learning=await loadCharacterLearningInfo(char);
      let radical=null;
      if(character?.dictionaryRadical?.radicalId) radical=lookup.byId.get(character.dictionaryRadical.radicalId) || lookup.glyphToItem.get(character.dictionaryRadical.glyph);
      if(!radical) radical=lookup.byChar.get(char) || null;
      if(!radical) radical=sourceItemDictionaryRadical(card?.sourceItem,lookup);
      let pinyin=formatPinyin(Array.isArray(character?.pinyin) ? character.pinyin.join(' / ') : character?.pinyin || '');
      let meaningVi=Array.isArray(character?.meaningsVi) ? character.meaningsVi.join('; ') : String(character?.meaningVi || '').trim();
      if(!pinyin) pinyin=formatPinyin(learning?.pinyin || '');
      if(!meaningVi) meaningVi=String(learning?.meaningVi || '').trim();
      if(!radical || !pinyin || !meaningVi){
        const fallbackInfo=await loadFlashcardCharacterInfo(char,lookup);
        if(!radical) radical=fallbackInfo.radical;
        if(!pinyin) pinyin=fallbackInfo.pinyin || '';
        if(!meaningVi) meaningVi=fallbackInfo.meaningVi || '';
      }
      return radical?.id ? {char,radical,sourceCardId:card.id,pinyin,meaningVi,analysis:mergeRadicalLearningAnalysis(char,character,learning,radical)} : null;
    }));
    const assignments=Array.from(new Map(resolved.filter(Boolean).map(entry=>[entry.char,entry])).values());
    const rounds=buildFlashcardRadicalRounds(assignments);
    const first=rounds[0] || {groups:[],items:[]};
    return {
      rounds,
      roundIndex:0,
      totalItems:assignments.length,
      groups:first.groups,
      items:first.items,
      selectedItemId:'',selectedGroupId:'',focusedItemId:'',selectionLead:'',correct:0,wrong:0,feedback:''
    };
  }

  function flashcardRadicalStateKey(cards){
    return (cards || []).map(card=>`${card?.id || ''}:${card?.word || ''}`).join('|');
  }

  function cloneFlashcardRadicalSortState(state){
    if(!state) return null;
    const rounds=(state.rounds || []).map(round=>({
      groups:(round.groups || []).map(group=>({...group,items:[]})),
      items:(round.items || []).map(item=>({...item,done:false}))
    }));
    const first=rounds[0] || {groups:[],items:[]};
    return {
      ...state,
      rounds,
      roundIndex:0,
      groups:first.groups,
      items:first.items,
      totalItems:Number(state.totalItems || rounds.reduce((sum,round)=>sum+round.items.length,0)),
      selectedItemId:'',selectedGroupId:'',focusedItemId:'',selectionLead:'',correct:0,wrong:0,feedback:''
    };
  }

  function advanceFlashcardRadicalRound(state){
    if(!state || state.roundIndex >= (state.rounds || []).length - 1) return false;
    state.roundIndex += 1;
    const round=state.rounds[state.roundIndex] || {groups:[],items:[]};
    state.groups=(round.groups || []).map(group=>({...group,items:[]}));
    state.items=(round.items || []).map(item=>({...item,done:false}));
    state.selectedItemId='';
    state.selectedGroupId='';
    state.focusedItemId='';
    state.selectionLead='';
    state.feedback='';
    return true;
  }

  function prepareFlashcardRadicalSortState(cards){
    const key=flashcardRadicalStateKey(cards);
    if(!flashcardRadicalStatePromises.has(key)){
      const promise=createFlashcardRadicalSortState(cards).catch(error=>{
        flashcardRadicalStatePromises.delete(key);
        throw error;
      });
      flashcardRadicalStatePromises.set(key,promise);
      if(flashcardRadicalStatePromises.size>6){
        const oldest=flashcardRadicalStatePromises.keys().next().value;
        if(oldest!==key) flashcardRadicalStatePromises.delete(oldest);
      }
    }
    return flashcardRadicalStatePromises.get(key);
  }

  function scheduleFlashcardRadicalPersist(){
    window.clearTimeout(flashcardRadicalPersistTimer);
    flashcardRadicalPersistTimer=window.setTimeout(()=>{
      flashcardRadicalPersistTimer=null;
      persistFlashcardSession();
    },120);
  }

  function flashcardSentenceOrderingCount(cards){ return getSentenceOrderingEligibleCards(cards).length; }
  function flashcardRadicalCandidateCount(cards){ return Array.from(new Set((cards || []).flatMap(cardCharacterCandidates))).length; }

  function getFlashcardSettings(){
    const defaults = {
      mode: 'flashcard',
      showPinyin: true,
      tapHanziSpeak: Matching ? Matching.readSettings().tapHanziSpeak : true,
      autoPlay: false,
      shuffle: false,
      showStroke: false,
      typingPromptType: 'hanzi-to-pinyin',
      typingAutoAdvanceEnabled: true,
      typingAutoAdvanceMode: 'default',
      typingAutoAdvanceSeconds: HSK_FLASHCARD_TYPING_CUSTOM_DELAY_DEFAULT_SECONDS,
      sentenceOrderingAutoAdvanceEnabled: true,
      sentenceOrderingAutoAdvanceSeconds: 1.2,
      sentenceOrderingDisplayCount: 1,
      sentenceOrderingVocabularyList: false,
      radicalSortDisplayMode: 'hanzi',
      radicalSortMeaningList: false
    };
    try{
      const saved = JSON.parse(window.localStorage?.getItem(HSK_FLASHCARD_SETTINGS_KEY) || '{}');
      return {
        mode: ['flashcard', 'reverse', 'listen', 'typing', 'matching', 'sentence-ordering', 'radical-sort', 'mixed'].includes(saved.mode) ? saved.mode : defaults.mode,
        showPinyin: saved.showPinyin !== false,
        tapHanziSpeak: saved.tapHanziSpeak == null ? defaults.tapHanziSpeak : saved.tapHanziSpeak !== false,
        autoPlay: Boolean(saved.autoPlay),
        shuffle: Boolean(saved.shuffle),
        showStroke: Boolean(saved.showStroke),
        typingPromptType: ['hanzi-to-pinyin', 'hanzi-meaning-to-pinyin', 'meaning-to-pinyin', 'mixed'].includes(saved.typingPromptType) ? saved.typingPromptType : defaults.typingPromptType,
        typingAutoAdvanceEnabled: saved.typingAutoAdvanceEnabled !== false,
        typingAutoAdvanceMode: saved.typingAutoAdvanceMode === 'custom' ? 'custom' : defaults.typingAutoAdvanceMode,
        typingAutoAdvanceSeconds: normalizeFlashcardTypingAutoAdvanceSeconds(
          saved.typingAutoAdvanceSeconds,
          defaults.typingAutoAdvanceSeconds
        ),
        sentenceOrderingAutoAdvanceEnabled: saved.sentenceOrderingAutoAdvanceEnabled !== false,
        sentenceOrderingAutoAdvanceSeconds: normalizeFlashcardOrderingDelay(saved.sentenceOrderingAutoAdvanceSeconds, defaults.sentenceOrderingAutoAdvanceSeconds),
        sentenceOrderingDisplayCount: [1, 2, 3].includes(Number(saved.sentenceOrderingDisplayCount)) ? Number(saved.sentenceOrderingDisplayCount) : defaults.sentenceOrderingDisplayCount,
        sentenceOrderingVocabularyList: saved.sentenceOrderingVocabularyList === true,
        radicalSortDisplayMode: ['hanzi', 'pinyin', 'meaning'].includes(saved.radicalSortDisplayMode) ? saved.radicalSortDisplayMode : defaults.radicalSortDisplayMode,
        radicalSortMeaningList: saved.radicalSortMeaningList === true
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
        ${cards.filter(card => card.word && card.meaningVi).length >= 2 ? `<button type="button" class="hsk-flashcard-launch hsk-flashcard-launch--matching" data-hsk-flashcard-open-matching>
          <span aria-hidden="true">连</span>
          <span>Luyện nối</span>
          <small>${cards.filter(card => card.word && card.meaningVi).length.toLocaleString('vi-VN')} mục</small>
        </button>` : ''}
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
    overlay.innerHTML = '<section class="hsk-flashcard-shell hsk-flashcard-shell--dialog" role="dialog" aria-modal="true" aria-label="Học Flashcard"><div id="hskFlashcardBody" class="hsk-flashcard-body"></div></section>';
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
      submitFlashcardTypingInput(input.value, input);
    });
    overlay.addEventListener('change', event => {
      const customDelay = event.target.closest('[data-hsk-flashcard-typing-custom-seconds]');
      const session = hskState.flashcardSession;
      if(!session || session.phase !== 'setup') return;
      if(customDelay){
        session.settings.typingAutoAdvanceMode = 'custom';
        session.settings.typingAutoAdvanceSeconds = normalizeFlashcardTypingAutoAdvanceSeconds(
          customDelay.value,
          HSK_FLASHCARD_TYPING_CUSTOM_DELAY_DEFAULT_SECONDS
        );
        saveFlashcardSettings(session.settings);
        renderFlashcardOverlay();
        return;
      }
      const orderingDisplay = event.target.closest('[data-hsk-ordering-display-count]');
      if(orderingDisplay){
        const value = Number(orderingDisplay.value);
        session.settings.sentenceOrderingDisplayCount = [1,2,3].includes(value) ? value : 1;
        saveFlashcardSettings(session.settings);
        renderFlashcardOverlay();
      }
    });
    overlay.addEventListener('keydown', event => {
      const input = event.target.closest('[data-hsk-flashcard-typing-input]');
      if(!input) return;
      if(event.key === 'Enter' && input.value){
        event.preventDefault();
        submitFlashcardTypingInput(input.value, input);
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

  function setFlashcardHostMode(overlay, isActivity){
    if(!overlay) return;
    const shell = overlay.querySelector('.hsk-flashcard-shell');
    const body = overlay.querySelector('#hskFlashcardBody');
    overlay.classList.toggle('hsk-flashcard-overlay--activity', Boolean(isActivity));
    overlay.classList.toggle('hsk-flashcard-overlay--dialog', !isActivity);
    shell?.classList.toggle('hsk-flashcard-shell--activity', Boolean(isActivity));
    shell?.classList.toggle('hsk-flashcard-shell--dialog', !isActivity);
    body?.classList.toggle('hsk-flashcard-body--activity', Boolean(isActivity));
    body?.classList.toggle('hsk-flashcard-body--dialog', !isActivity);
    shell?.setAttribute('aria-label', isActivity ? 'Phiên học Flashcard' : 'Thiết lập Flashcard');
  }

  function closeFlashcardOverlay(){
    const externalReturnUrl = hskState.flashcardSession?.origin === 'external'
      ? String(hskState.flashcardSession?.returnUrl || '')
      : '';
    cancelFlashcardTypingCompletionTimer();
    cancelFlashcardTypingErrorTimer();
    clearFlashcardOrderingAdvanceTimer();
    window.clearTimeout(flashcardRadicalPersistTimer);
    flashcardRadicalPersistTimer=null;
    stopFlashcardTypingClock();
    Matching?.cancelScheduledNextRound?.(hskState.flashcardSession?.matching);
    const overlay = document.getElementById('hskFlashcardOverlay');
    if(!overlay) return;
    overlay.hidden = true;
    document.body.classList.remove('hsk-flashcard-open');
    window.speechSynthesis?.cancel?.();
    cleanupFlashcardStrokeWriters();
    hskState.flashcardStatsOpen = false;
    if(hskState.flashcardSession){
      hskState.flashcardSession.prepareToken=(Number(hskState.flashcardSession.prepareToken)||0)+1;
      clearPersistedFlashcardSession();
    }
    const selectedCards = (hskState.topicKey && hskState.topicKey !== 'all') ? getSelectedFlashcardItems() : [];
    renderFlashcardLaunchButton(selectedCards);
    if(externalReturnUrl){
      window.location.href = new URL(externalReturnUrl, window.location.href).href;
    }
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
      typingPromptTypes: [],
      sentenceOrdering: null,
      radicalSort: null
    };
    renderFlashcardOverlay();
  }

  function openFlashcardMatchingSetup(){
    openFlashcardSetup();
    if(!hskState.flashcardSession) return;
    hskState.flashcardSession.settings.mode = 'matching';
    saveFlashcardSettings(hskState.flashcardSession.settings);
    renderFlashcardOverlay();
  }

  function getFlashcardModeLabel(mode){
    return ({
      flashcard: 'Flashcard',
      reverse: 'Đảo ngược',
      listen: 'Nghe',
      typing: 'Gõ Pinyin',
      matching: 'Nối thẻ',
      'sentence-ordering': 'Sắp xếp câu',
      'radical-sort': 'Xếp chữ vào bộ thủ',
      mixed: 'Hỗn hợp'
    })[mode] || 'Flashcard';
  }

  function renderFlashcardSetup(session){
    const settings = session.settings;
    const contextNoun = session.origin === 'topic' ? 'chủ đề' : (['lesson', 'curriculum-library'].includes(session.origin) ? 'bài' : 'bộ thẻ');
    const backLabel = session.origin === 'topic' ? '← Quay lại chủ đề' : ((['lesson', 'external', 'curriculum-library'].includes(session.origin)) ? '← Quay lại bài' : '← Quay lại Thẻ');
    const modes = [
      ['flashcard', 'Flashcard', 'Hán tự → lật xem pinyin và nghĩa'],
      ['reverse', 'Đảo ngược', 'Nghĩa Việt → đoán chữ Hán'],
      ['listen', 'Nghe', 'Nghe phát âm → nhớ lại từ và nghĩa'],
      ['typing', 'Gõ Pinyin', 'Nhập đầy đủ pinyin không dấu trong một ô'],
      ['matching', 'Nối thẻ', 'Chạm ghép chữ Hán với nghĩa; số cặp tự thích ứng hoặc tự nhập'],
      ['sentence-ordering', 'Sắp xếp câu', 'Xếp các từ hoặc cụm từ thành câu hoàn chỉnh'],
      ['radical-sort', 'Xếp chữ vào bộ thủ', 'Dùng chữ trong bộ thẻ và dữ liệu bộ thủ đã kiểm duyệt'],
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
                ['hanzi-meaning-to-pinyin', 'Chữ Trung + Nghĩa Việt → Pinyin'],
                ['meaning-to-pinyin', 'Nghĩa Việt → Pinyin'],
                ['mixed', 'Hỗn hợp ba kiểu']
              ].map(([key, label]) => `<button type="button" class="${settings.typingPromptType === key ? 'active' : ''}" data-hsk-flashcard-typing-prompt="${key}">${label}</button>`).join('')}
            </div>
            <p class="hsk-flashcard-typing-eligible">${getTypingEligibleCards(session.cards, settings.typingPromptType).length.toLocaleString('vi-VN')} thẻ đủ pinyin để luyện.</p>
          </section>
        ` : ''}
        ${settings.mode === 'typing' ? `
          <section class="hsk-flashcard-panel hsk-flashcard-typing-timing">
            <div class="hsk-flashcard-typing-timing-head">
              <span><b>Tự chuyển sau khi đúng</b><small>Ghi nhớ lựa chọn gần nhất cho lần học sau.</small></span>
              <input type="checkbox" data-hsk-flashcard-option="typingAutoAdvanceEnabled" ${settings.typingAutoAdvanceEnabled ? 'checked' : ''} aria-label="Bật tự chuyển">
            </div>
            <div class="hsk-flashcard-typing-delay-grid" ${settings.typingAutoAdvanceEnabled ? '' : 'aria-disabled="true"'}>
              <button type="button" class="${settings.typingAutoAdvanceMode === 'default' ? 'active' : ''}" data-hsk-flashcard-typing-delay="default" ${settings.typingAutoAdvanceEnabled ? '' : 'disabled'}>Mặc định</button>
              ${HSK_FLASHCARD_TYPING_DELAY_PRESETS.map(seconds => `<button type="button" class="${settings.typingAutoAdvanceMode === 'custom' && Number(settings.typingAutoAdvanceSeconds) === seconds ? 'active' : ''}" data-hsk-flashcard-typing-delay="${seconds}" ${settings.typingAutoAdvanceEnabled ? '' : 'disabled'}>${seconds} giây</button>`).join('')}
            </div>
            <label class="hsk-flashcard-typing-custom-delay">
              <span>Tùy chỉnh</span>
              <input type="number" min="0" max="${HSK_FLASHCARD_TYPING_CUSTOM_DELAY_MAX_SECONDS}" step="0.5" value="${escapeHtml(settings.typingAutoAdvanceSeconds)}" data-hsk-flashcard-typing-custom-seconds ${settings.typingAutoAdvanceEnabled ? '' : 'disabled'}>
              <em>giây</em>
            </label>
            <p class="hsk-flashcard-typing-timing-note">Mặc định hiện tại: 30 giây cho từ ngắn, 120 giây cho nội dung dài. Nhập 0 để chuyển ngay.</p>
          </section>
        ` : ''}
        ${settings.mode === 'sentence-ordering' ? `
          <section class="hsk-flashcard-panel hsk-flashcard-ordering-setup">
            <div class="hsk-flashcard-typing-timing-head">
              <span><b>Tự chuyển sau khi xếp đúng</b><small>Chờ đủ thời gian rồi chuyển sang câu hoặc nhóm tiếp theo.</small></span>
              <input type="checkbox" data-hsk-flashcard-option="sentenceOrderingAutoAdvanceEnabled" ${settings.sentenceOrderingAutoAdvanceEnabled ? 'checked' : ''} aria-label="Bật tự chuyển câu sắp xếp">
            </div>
            <div class="hsk-flashcard-typing-delay-grid" ${settings.sentenceOrderingAutoAdvanceEnabled ? '' : 'aria-disabled="true"'}>
              ${HSK_FLASHCARD_ORDERING_DELAY_PRESETS.map(seconds => `<button type="button" class="${Number(settings.sentenceOrderingAutoAdvanceSeconds) === seconds ? 'active' : ''}" data-hsk-ordering-delay="${seconds}" ${settings.sentenceOrderingAutoAdvanceEnabled ? '' : 'disabled'}>${seconds === 0 ? 'Ngay' : `${seconds} giây`}</button>`).join('')}
            </div>
            <label class="hsk-flashcard-ordering-display-count">
              <span><b>Số câu hiển thị</b><small>Mobile nên dùng 1 câu; có thể chọn 2–3 câu để luyện theo nhóm.</small></span>
              <select data-hsk-ordering-display-count>
                ${[1,2,3].map(value => `<option value="${value}" ${Number(settings.sentenceOrderingDisplayCount) === value ? 'selected' : ''}>${value} câu</option>`).join('')}
              </select>
            </label>
          </section>
        ` : ''}
        <section class="hsk-flashcard-panel hsk-flashcard-options">
          <label><span><b>Hiện pinyin</b><small>Hiển thị pinyin sau khi mở đáp án.</small></span><input type="checkbox" data-hsk-flashcard-option="showPinyin" ${settings.showPinyin ? 'checked' : ''}></label>
          <label><span><b>🔊 Chạm chữ Hán để nghe</b><small>Áp dụng trong Nối thẻ và các lựa chọn chữ Hán.</small></span><input type="checkbox" data-hsk-flashcard-option="tapHanziSpeak" ${settings.tapHanziSpeak ? 'checked' : ''}></label>
          <label><span><b>Tự phát âm</b><small>Tự đọc theo chế độ học hiện tại.</small></span><input type="checkbox" data-hsk-flashcard-option="autoPlay" ${settings.autoPlay ? 'checked' : ''}></label>
          <label><span><b>Xáo trộn thứ tự</b><small>Trộn bộ thẻ một lần khi bắt đầu.</small></span><input type="checkbox" data-hsk-flashcard-option="shuffle" ${settings.shuffle ? 'checked' : ''}></label>
          <label><span><b>Hiện cách viết từng chữ</b><small>Hiển thị ô thứ tự nét ở mặt đáp án.</small></span><input type="checkbox" data-hsk-flashcard-option="showStroke" ${settings.showStroke ? 'checked' : ''}></label>
        </section>
        <button type="button" class="hsk-flashcard-start" data-hsk-flashcard-start>Bắt đầu học · ${(settings.mode === 'typing' ? getTypingEligibleCards(session.cards, settings.typingPromptType).length : settings.mode === 'matching' ? session.cards.filter(card => card.word && card.meaningVi).length : settings.mode === 'sentence-ordering' ? flashcardSentenceOrderingCount(session.cards) : settings.mode === 'radical-sort' ? flashcardRadicalCandidateCount(session.cards) : session.cards.length).toLocaleString('vi-VN')} mục</button>
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

  function flashcardMatchingContentKind(cards){
    const valid = (cards || []).filter(card => card && card.word && card.meaningVi);
    const types = new Set(valid.map(card => String(card.cardType || 'vocabulary')));
    if(types.size === 1 && types.has('grammar')) return 'grammar';
    if(types.size === 1 && types.has('sentence')) return 'sentence';
    const hasLongContent = valid.some(card => Array.from(String(card.word || '')).length > 8 || String(card.meaningVi || '').length > 44);
    return hasLongContent ? 'sentence' : 'word';
  }

  async function startFlashcardSession(){
    const session = hskState.flashcardSession;
    if(!session) return;
    const prepareToken=(Number(session.prepareToken)||0)+1;
    session.prepareToken=prepareToken;
    clearFlashcardOrderingAdvanceTimer();
    saveFlashcardSettings(session.settings);
    const preparingRadicalSort = session.settings.mode === 'radical-sort';
    session.phase = preparingRadicalSort ? 'preparing' : 'study';
    if(preparingRadicalSort) renderFlashcardOverlay();
    if(session.settings.mode === 'typing'){
      session.cards = getTypingEligibleCards(session.cards, session.settings.typingPromptType);
      if(!session.cards.length){ session.phase = 'setup'; session.typing = null; renderFlashcardOverlay(); return; }
    }
    if(session.settings.mode === 'matching'){
      session.cards = session.cards.filter(card => card.word && card.meaningVi);
      if(session.cards.length < 2){ session.phase = 'setup'; renderFlashcardOverlay(); return; }
    }
    if(session.settings.mode === 'sentence-ordering'){
      session.cards = getSentenceOrderingEligibleCards(session.cards);
      if(!session.cards.length){ session.phase = 'setup'; renderFlashcardOverlay(); return; }
    }
    if(session.settings.mode === 'radical-sort'){
      try{
        const prepared=await prepareFlashcardRadicalSortState(session.cards);
        if(session.prepareToken!==prepareToken || session.phase!=='preparing') return;
        session.radicalSort = cloneFlashcardRadicalSortState(prepared);
      }catch(error){
        if(session.prepareToken!==prepareToken || session.phase!=='preparing') return;
        console.warn('Cannot prepare radical sort:', error);
        session.radicalSort = null;
      }
      if(!session.radicalSort || session.radicalSort.groups.length < 2 || session.radicalSort.items.length < 2){ session.phase = 'setup'; renderFlashcardOverlay(); return; }
      session.phase = 'study';
    }
    session.cards = session.settings.shuffle && !['radical-sort'].includes(session.settings.mode) ? shuffleCards(session.cards) : [...session.cards];
    session.index = 0;
    session.flipped = false;
    session.strokeExpanded = false;
    session.ratings = {};
    session.mixedTypes = session.cards.map((_, index) => ['flashcard', 'reverse', 'listen'][index % 3]);
    session.typingPromptTypes = session.cards.map((card, index) => {
      if(session.settings.typingPromptType !== 'mixed') return session.settings.typingPromptType;
      if(!card.meaningVi) return 'hanzi-to-pinyin';
      return ['hanzi-to-pinyin', 'hanzi-meaning-to-pinyin', 'meaning-to-pinyin'][index % 3];
    });
    session.typing = session.settings.mode === 'typing' ? createFlashcardTypingState(session, session.cards[0]) : null;
    session.sentenceOrdering = session.settings.mode === 'sentence-ordering' ? createFlashcardSentenceOrderingState(session.cards) : null;
    session.matching = session.settings.mode === 'matching' && Matching ? Matching.createSession(session.cards.map(card => ({
      id: card.id, canonicalItemId: card.id, leftText: card.word, pinyin: card.pinyin || '', rightText: card.meaningVi, speechText: card.word, sourceType: card.cardType || 'flashcard', meta: { cardId: card.id }
    })), { title: 'Nối thẻ', subtitle: session.title, contentKind: flashcardMatchingContentKind(session.cards), showPinyin: session.settings.showPinyin, tapToSpeak: session.settings.tapHanziSpeak }) : null;
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
    if(card?.cardType === 'grammar'){
      const grammar = card.grammar || {};
      const examples = Array.isArray(grammar.examples) ? grammar.examples : [];
      if(!answerVisible){
        return `<div class="hsk-flashcard-front hsk-flashcard-front--grammar"><small>NGỮ PHÁP</small><h3>${escapeHtml(card.title || grammar.topic || 'Ngữ pháp')}</h3><strong>${escapeHtml(grammar.pattern || card.word || '')}</strong><p>Bấm để xem giải thích và ví dụ</p></div>`;
      }
      return `<div class="hsk-flashcard-answer hsk-flashcard-answer--grammar"><small>NGỮ PHÁP</small><h3>${escapeHtml(card.title || grammar.topic || 'Ngữ pháp')}</h3><strong>${escapeHtml(grammar.pattern || card.word || '')}</strong>${grammar.explanation || card.meaningVi ? `<p>${escapeHtml(grammar.explanation || card.meaningVi)}</p>` : ''}${grammar.tips ? `<div class="grammar-card-note"><b>Mẹo</b><span>${escapeHtml(grammar.tips)}</span></div>` : ''}${grammar.attentions ? `<div class="grammar-card-note is-attention"><b>Lưu ý</b><span>${escapeHtml(grammar.attentions)}</span></div>` : ''}${examples.length ? `<div class="grammar-card-examples">${examples.slice(0,3).map(example => `<article><b>${escapeHtml(example.hanzi || '')}</b>${session.settings.showPinyin && example.pinyin ? `<i>${escapeHtml(example.pinyin)}</i>` : ''}<span>${escapeHtml(example.meaning || '')}</span></article>`).join('')}</div>` : ''}</div>`;
    }
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

  function renderFlashcardMatchingStudy(session){
    if(!Matching || !session.matching) return '<p>Không thể mở Nối thẻ.</p>';
    const complete = Matching.isComplete(session.matching);
    return `
      <header class="hsk-flashcard-header">
        <button type="button" class="hsk-flashcard-back" data-hsk-flashcard-to-setup>← Thiết lập</button>
        <span class="hsk-flashcard-progress">${session.matching.completedIds.length} / ${session.matching.pairs.length}</span>
        <button type="button" class="hsk-flashcard-close" data-hsk-flashcard-close aria-label="Đóng">×</button>
      </header>
      <div class="hsk-flashcard-study hsk-flashcard-study--matching">
        ${Matching.render(session.matching, { eyebrow: 'NỐI THẺ' })}
        ${complete ? `<div class="hsk-flashcard-nav"><button type="button" data-hsk-flashcard-matching-restart>Học lại</button><button type="button" data-hsk-flashcard-matching-complete>Hoàn thành →</button></div>` : ''}
      </div>`;
  }

  function saveFlashcardMatchingResult(session, pairId){
    if(!Matching || !session?.matching) return;
    const card = session.cards.find(item => item.id === pairId);
    if(!card) return;
    const rating = Matching.ratingFor(session.matching, pairId);
    const previousRating = session.ratings[card.id] || '';
    session.ratings[card.id] = rating;
    saveFlashcardRatingResult(card, rating, previousRating);
  }

  function scheduleFlashcardMatchingRoundAdvance(session){
    if(!session?.matching || !Matching) return;
    Matching.scheduleNextRound(session.matching, () => {
      persistFlashcardSession();
      renderFlashcardOverlay();
    });
  }

  function handleFlashcardMatchingSelection(side, pairId){
    const session = hskState.flashcardSession;
    if(!session?.matching || !Matching) return;
    const result = Matching.select(session.matching, side, pairId);
    if(result.speechText && session.settings.tapHanziSpeak) speakChar(result.speechText);
    if(result.status === 'correct') saveFlashcardMatchingResult(session, result.pairId);
    persistFlashcardSession();
    renderFlashcardOverlay();
    if(result.status === 'wrong'){
      Matching.scheduleFeedbackClear(session.matching, () => {
        persistFlashcardSession();
        renderFlashcardOverlay();
      });
    }else if(result.status === 'correct' && result.roundComplete && !result.complete){
      scheduleFlashcardMatchingRoundAdvance(session);
    }
  }

  function flashcardOrderingSuggestedRating(item){
    if(Number(item?.mistakes || 0) >= 3) return 'hard';
    if(Number(item?.mistakes || 0) > 0) return 'review';
    return 'easy';
  }

  function clearFlashcardOrderingAdvanceTimer(){
    if(flashcardOrderingAdvanceTimer) window.clearTimeout(flashcardOrderingAdvanceTimer);
    flashcardOrderingAdvanceTimer = 0;
  }

  function flashcardOrderingPageSize(session){
    const value = Number(session?.settings?.sentenceOrderingDisplayCount || 1);
    return [1,2,3].includes(value) ? value : 1;
  }

  function flashcardOrderingVisibleItems(session){
    const state = session?.sentenceOrdering;
    if(!state) return [];
    return state.items.slice(state.index, state.index + flashcardOrderingPageSize(session));
  }

  function flashcardOrderingPageComplete(session){
    const page = flashcardOrderingVisibleItems(session);
    return page.length > 0 && page.every(item=>item.complete);
  }

  function advanceFlashcardSentenceOrdering(session){
    clearFlashcardOrderingAdvanceTimer();
    const state = session?.sentenceOrdering;
    if(!state || !flashcardOrderingPageComplete(session)) return;
    const nextIndex = state.index + flashcardOrderingPageSize(session);
    if(nextIndex >= state.items.length) return;
    state.index = nextIndex;
    persistFlashcardSession();
    renderFlashcardOverlay();
  }

  function scheduleFlashcardOrderingAdvance(session){
    clearFlashcardOrderingAdvanceTimer();
    const state = session?.sentenceOrdering;
    if(!state || !session.settings.sentenceOrderingAutoAdvanceEnabled || !flashcardOrderingPageComplete(session)) return;
    if(state.index + flashcardOrderingPageSize(session) >= state.items.length) return;
    const delay = normalizeFlashcardOrderingDelay(session.settings.sentenceOrderingAutoAdvanceSeconds, 1.2) * 1000;
    flashcardOrderingAdvanceTimer = window.setTimeout(()=>{
      if(hskState.flashcardSession !== session || !flashcardOrderingPageComplete(session)) return;
      advanceFlashcardSentenceOrdering(session);
    }, delay);
  }

  function evaluateFlashcardSentenceOrdering(session,item){
    if(!session || !item || item.complete || item.selected.length !== item.tokens.length) return false;
    const answer=normalizeFlashcardSentenceAnswer(item.selected.map(row=>row.text).join(''));
    const expected=normalizeFlashcardSentenceAnswer(item.card.word);
    if(answer===expected){
      item.complete=true;
      item.feedback=`Đúng: ${item.card.word}`;
      const rating=flashcardOrderingSuggestedRating(item);
      item.rating=rating;
      session.sentenceOrdering.correct+=1;
      const previous=session.ratings[item.card.id]||'';
      session.ratings[item.card.id]=rating;
      saveFlashcardRatingResult(item.card,rating,previous);
      return true;
    }
    item.mistakes+=1;
    session.sentenceOrdering.wrong+=1;
    item.feedback='Chưa đúng, chạm từ trong câu để sửa lại.';
    return false;
  }

  function attemptFlashcardRadicalMatch(session,itemId,groupId){
    const state=session?.radicalSort;
    const item=state?.items?.find(row=>row.id===itemId&&!row.done);
    const group=state?.groups?.find(row=>row.id===groupId);
    if(!state || !item || !group) return false;
    const keepSelectedGroup = state.selectionLead === 'group';
    const keepSelectedItem = state.selectionLead === 'item';
    const correct = item.groupId===groupId;
    if(correct){ item.done=true; state.correct+=1; state.feedback=`Đúng: ${item.hanzi}`; }
    else{ state.wrong+=1; state.feedback=`${item.hanzi} chưa thuộc ${group.name}. Hãy thử lại.`; }
    state.selectedItemId = keepSelectedItem && !item.done ? itemId : '';
    state.selectedGroupId = keepSelectedGroup ? groupId : '';
    if(!state.selectedItemId && !state.selectedGroupId) state.selectionLead='';
    return correct;
  }

  function cleanupFlashcardPointerDrag(){
    const drag=flashcardPointerDrag;
    drag?.ghost?.remove?.();
    document.querySelectorAll('.is-hsk-drag-over,.is-hsk-drop-before,.is-hsk-drop-after').forEach(node=>{
      node.classList.remove('is-hsk-drag-over','is-hsk-drop-before','is-hsk-drop-after');
    });
    document.body?.classList?.remove('hsk-flashcard-pointer-dragging');
    flashcardPointerDrag=null;
  }

  function flashcardDragPointTarget(event){
    return document.elementFromPoint(event.clientX,event.clientY);
  }

  function flashcardOrderingDropTarget(event,drag){
    const point=flashcardDragPointTarget(event);
    const itemRoot=point?.closest?.('[data-hsk-order-item-id]');
    if(!itemRoot || itemRoot.dataset.hskOrderItemId!==drag.itemId) return null;
    const zoneNode=point.closest?.('[data-hsk-order-drop-zone]');
    if(!zoneNode) return null;
    const zone=zoneNode.dataset.hskOrderDropZone || '';
    if(zone==='bank') return {zone:'bank',index:-1,node:zoneNode};
    if(zone!=='answer') return null;
    const tokenButton=point.closest?.('[data-hsk-order-token][data-hsk-order-zone="answer"]');
    if(!tokenButton) return {zone:'answer',index:itemRoot.querySelectorAll('[data-hsk-order-zone="answer"]').length,node:zoneNode};
    const rect=tokenButton.getBoundingClientRect();
    const before=event.clientY < rect.top + rect.height/2 || (Math.abs(event.clientY-(rect.top+rect.height/2)) < rect.height*.35 && event.clientX < rect.left + rect.width/2);
    const base=Number(tokenButton.dataset.hskOrderIndex || 0);
    return {zone:'answer',index:base+(before?0:1),node:tokenButton,before};
  }

  function flashcardRadicalDropTarget(event){
    const point=flashcardDragPointTarget(event);
    const group=point?.closest?.('[data-hsk-radical-group]');
    return group ? {groupId:group.dataset.hskRadicalGroup || '',node:group} : null;
  }

  function moveFlashcardPointerDrag(event){
    const drag=flashcardPointerDrag;
    if(!drag || event.pointerId!==drag.pointerId) return;
    const dx=event.clientX-drag.startX;
    const dy=event.clientY-drag.startY;
    if(!drag.dragging && Math.hypot(dx,dy)<7) return;
    if(!drag.dragging){
      drag.dragging=true;
      drag.ghost=drag.source.cloneNode(true);
      drag.ghost.classList.add('hsk-flashcard-drag-ghost');
      drag.ghost.removeAttribute('data-hsk-order-token');
      drag.ghost.removeAttribute('data-hsk-radical-item');
      document.body.appendChild(drag.ghost);
      document.body.classList.add('hsk-flashcard-pointer-dragging');
    }
    event.preventDefault();
    drag.ghost.style.transform=`translate3d(${event.clientX-24}px,${event.clientY-22}px,0)`;
    document.querySelectorAll('.is-hsk-drag-over,.is-hsk-drop-before,.is-hsk-drop-after').forEach(node=>node.classList.remove('is-hsk-drag-over','is-hsk-drop-before','is-hsk-drop-after'));
    if(drag.kind==='ordering'){
      const target=flashcardOrderingDropTarget(event,drag);
      if(target){
        target.node.classList.add('is-hsk-drag-over');
        if(target.zone==='answer' && target.node.matches('[data-hsk-order-token]')) target.node.classList.add(target.before?'is-hsk-drop-before':'is-hsk-drop-after');
      }
    }else if(drag.kind==='radical'){
      flashcardRadicalDropTarget(event)?.node?.classList.add('is-hsk-drag-over');
    }
    const overlay=document.getElementById('hskFlashcardOverlay');
    const scrollHost=overlay?.querySelector('.hsk-flashcard-body') || overlay;
    if(scrollHost){
      const bounds=scrollHost.getBoundingClientRect();
      if(event.clientY<bounds.top+46) scrollHost.scrollBy({top:-18,behavior:'auto'});
      else if(event.clientY>bounds.bottom-46) scrollHost.scrollBy({top:18,behavior:'auto'});
    }
  }

  function applyFlashcardOrderingDrop(session,drag,target){
    const state=session?.sentenceOrdering;
    const item=state?.items?.find(row=>row.id===drag.itemId);
    if(!item || item.complete || !target) return false;
    const token=[...(item.bank || []),...(item.selected || [])].find(row=>row.id===drag.tokenId);
    if(!token) return false;
    const oldIndex=item.selected.findIndex(row=>row.id===drag.tokenId);
    item.selected=item.selected.filter(row=>row.id!==drag.tokenId);
    if(target.zone==='answer'){
      let requestedIndex=Number(target.index || 0);
      if(oldIndex>=0 && oldIndex<requestedIndex) requestedIndex-=1;
      const index=Math.max(0,Math.min(requestedIndex,item.selected.length));
      item.selected.splice(index,0,token);
    }
    item.feedback='';
    const correct=evaluateFlashcardSentenceOrdering(session,item);
    persistFlashcardSession();
    renderFlashcardOverlay();
    if(correct) scheduleFlashcardOrderingAdvance(session);
    return true;
  }

  function applyFlashcardRadicalDrop(session,drag,target){
    const state=session?.radicalSort;
    const item=state?.items?.find(row=>row.id===drag.itemId && !row.done);
    if(!state || !item || !target?.groupId) return false;
    state.focusedItemId=item.id;
    state.selectedItemId=item.id;
    state.selectedGroupId=target.groupId;
    state.selectionLead='item';
    attemptFlashcardRadicalMatch(session,item.id,target.groupId);
    scheduleFlashcardRadicalPersist();
    renderFlashcardOverlay();
    return true;
  }

  function endFlashcardPointerDrag(event){
    const drag=flashcardPointerDrag;
    if(!drag || event.pointerId!==drag.pointerId) return;
    if(!drag.dragging){ cleanupFlashcardPointerDrag(); return; }
    const target=drag.kind==='ordering' ? flashcardOrderingDropTarget(event,drag) : flashcardRadicalDropTarget(event);
    cleanupFlashcardPointerDrag();
    flashcardPointerDragSuppressClickUntil=Date.now()+400;
    const session=hskState.flashcardSession;
    if(!session) return;
    if(drag.kind==='ordering') applyFlashcardOrderingDrop(session,drag,target);
    else applyFlashcardRadicalDrop(session,drag,target);
  }

  function beginFlashcardPointerDrag(event){
    if(event.button>0 || flashcardPointerDrag) return;
    const session=hskState.flashcardSession;
    if(!session || session.phase!=='study') return;
    const orderToken=event.target.closest?.('[data-hsk-order-token]');
    if(orderToken && getCurrentFlashcardType(session)==='sentence-ordering'){
      const itemRoot=orderToken.closest('[data-hsk-order-item-id]');
      const item=session.sentenceOrdering?.items?.find(row=>row.id===itemRoot?.dataset.hskOrderItemId);
      if(!item || item.complete) return;
      flashcardPointerDrag={kind:'ordering',pointerId:event.pointerId,itemId:item.id,tokenId:orderToken.dataset.hskOrderToken || '',source:orderToken,startX:event.clientX,startY:event.clientY,dragging:false,ghost:null};
      orderToken.setPointerCapture?.(event.pointerId);
      return;
    }
    const radicalItem=event.target.closest?.('[data-hsk-radical-item]');
    if(radicalItem && getCurrentFlashcardType(session)==='radical-sort'){
      const itemId=radicalItem.dataset.hskRadicalItem || '';
      const item=session.radicalSort?.items?.find(row=>row.id===itemId&&!row.done);
      if(!item) return;
      flashcardPointerDrag={kind:'radical',pointerId:event.pointerId,itemId,source:radicalItem,startX:event.clientX,startY:event.clientY,dragging:false,ghost:null};
      radicalItem.setPointerCapture?.(event.pointerId);
    }
  }

  function renderFlashcardOrderingVocabularyPanel(page,state){
    const sections=(page || []).map((item,offset)=>{
      const glossary=Array.isArray(item?.card?.wordGlossary) ? item.card.wordGlossary.filter(row=>row?.word) : [];
      if(!glossary.length) return '';
      const absoluteIndex=Number(state?.index || 0)+offset+1;
      return `<section class="hsk-flashcard-ordering-vocab-section"><h3>Câu ${absoluteIndex}</h3><div class="hsk-flashcard-ordering-vocab-list">${glossary.map(row=>`<button type="button" data-hsk-order-vocab-speak="${escapeHtml(row.word)}"><b>${escapeHtml(row.word)}</b><span><strong>${escapeHtml(row.pinyin || 'Chưa có pinyin')}</strong><small>${escapeHtml(row.meaningVi || 'Chưa có nghĩa Việt')}</small></span><i aria-hidden="true">🔊</i></button>`).join('')}</div></section>`;
    }).filter(Boolean);
    return `<div class="hsk-flashcard-ordering-vocab-panel" data-hsk-order-vocab-panel>${sections.join('') || '<p>Chưa có mục từ vựng khớp với câu này trong dữ liệu bài.</p>'}</div>`;
  }

  function renderFlashcardSentenceOrderingItem(session,item,absoluteIndex,total){
    const selectedIds=new Set((item.selected || []).map(token=>token.id));
    const bank=(item.bank || []).filter(token=>!selectedIds.has(token.id));
    const rating=item.rating || session.ratings[item.card.id] || '';
    return `<article class="hsk-flashcard-order-item" data-hsk-order-item-id="${escapeHtml(item.id)}">
      <div class="hsk-flashcard-ordering-toolbar"><span>Câu ${absoluteIndex+1}/${total}</span><div class="hsk-flashcard-ordering-toolbar-actions"><button type="button" class="${session.settings.sentenceOrderingVocabularyList ? 'active' : ''}" data-hsk-order-vocab-toggle aria-pressed="${session.settings.sentenceOrderingVocabularyList === true}" aria-label="${session.settings.sentenceOrderingVocabularyList ? 'Ẩn nghĩa từ' : 'Hiện nghĩa từ'}">词义</button><button type="button" class="${session.settings.showPinyin ? 'active' : ''}" data-hsk-order-pinyin aria-pressed="${session.settings.showPinyin}" aria-label="${session.settings.showPinyin ? 'Ẩn pinyin' : 'Hiện pinyin'}">拼</button><button type="button" data-hsk-order-speak="${escapeHtml(item.card.word || '')}" aria-label="Nghe cả câu">🔊</button><button type="button" data-hsk-order-reset aria-label="Đặt lại">↺</button></div></div>
      <div class="hsk-flashcard-ordering-prompt">${item.card.meaningVi ? `<strong>${escapeHtml(item.card.meaningVi)}</strong>` : '<strong>Xếp thành câu đúng</strong>'}${session.settings.showPinyin && item.card.pinyin ? `<small>${escapeHtml(item.card.pinyin)}</small>` : ''}</div>
      <div class="hsk-flashcard-ordering-answer" data-hsk-order-drop-zone="answer" aria-label="Câu đang xếp">${item.selected.length ? item.selected.map((token,index)=>`<button type="button" data-hsk-order-token="${escapeHtml(token.id)}" data-hsk-order-zone="answer" data-hsk-order-index="${index}">${escapeHtml(token.text)}</button>`).join('') : '<span>Chạm hoặc kéo các từ theo đúng thứ tự</span>'}</div>
      <div class="hsk-flashcard-ordering-bank" data-hsk-order-drop-zone="bank">${bank.map(token=>`<button type="button" data-hsk-order-token="${escapeHtml(token.id)}" data-hsk-order-zone="bank">${escapeHtml(token.text)}</button>`).join('')}</div>
      <output class="hsk-flashcard-ordering-feedback ${item.complete?'is-correct':item.feedback?'is-wrong':''}">${escapeHtml(item.feedback || '')}</output>
      ${item.complete ? `<div class="hsk-flashcard-order-rating"><span>Tự phân loại:</span>${[['easy','Dễ'],['review','Ôn'],['hard','Khó']].map(([key,label])=>`<button type="button" class="${rating===key?'active':''}" data-hsk-order-rating="${key}">${label}</button>`).join('')}</div>` : ''}
    </article>`;
  }

  function renderFlashcardSentenceOrderingStudy(session){
    const state = session.sentenceOrdering;
    const page = flashcardOrderingVisibleItems(session);
    if(!state || !page.length) return '<p>Không có câu đủ token để sắp xếp.</p>';
    const complete = flashcardOrderingPageComplete(session);
    const hasNext = state.index + page.length < state.items.length;
    const progressEnd = Math.min(state.items.length, state.index + page.length);
    const autoNote = complete && hasNext && session.settings.sentenceOrderingAutoAdvanceEnabled
      ? `<small class="hsk-flashcard-order-auto-note">Tự chuyển sau ${normalizeFlashcardOrderingDelay(session.settings.sentenceOrderingAutoAdvanceSeconds,1.2)} giây</small>`
      : '';
    return `<header class="hsk-flashcard-header"><button type="button" class="hsk-flashcard-back" data-hsk-flashcard-to-setup>← Thiết lập</button><span class="hsk-flashcard-progress">${progressEnd} / ${state.items.length}</span><button type="button" class="hsk-flashcard-close" data-hsk-flashcard-close aria-label="Đóng">×</button></header>
      <div class="hsk-flashcard-study hsk-flashcard-study--ordering is-compact">
        <div class="hsk-flashcard-study-meta"><b>Sắp xếp câu</b><span>${escapeHtml(session.title)}</span></div>
        ${session.settings.sentenceOrderingVocabularyList ? renderFlashcardOrderingVocabularyPanel(page,state) : '<div class="hsk-flashcard-ordering-spacer" aria-hidden="true"></div>'}
        <div class="hsk-flashcard-ordering-controls">
          <div class="hsk-flashcard-order-items">${page.map((item,offset)=>renderFlashcardSentenceOrderingItem(session,item,state.index+offset,state.items.length)).join('')}</div>
          ${complete ? `<div class="hsk-flashcard-order-page-actions">${autoNote}<button type="button" class="hsk-flashcard-start" data-hsk-order-next>${hasNext?(page.length>1?'Nhóm tiếp →':'Câu tiếp →'):'Hoàn thành'}</button></div>` : ''}
        </div>
      </div>`;
  }

  function renderFlashcardRadicalAnalysis(item){
    if(!item) return '';
    const analysis=item.analysis || {};
    const radical=analysis.radical || {};
    const components=Array.isArray(analysis.components) ? analysis.components.filter(row=>row?.glyph) : [];
    const radicalMeta=[radical.nameVi,radical.pinyin,radical.hanViet].filter(Boolean).join(' · ');
    return `<article class="hsk-flashcard-radical-analysis">
      <header><b>${escapeHtml(item.hanzi)}</b><div><strong>${escapeHtml(item.pinyin || 'Chưa có pinyin')}</strong><span>${escapeHtml(item.meaningVi || 'Chưa có nghĩa Việt')}</span></div></header>
      ${radical.glyph ? `<section><h4>Bộ thủ</h4><div class="hsk-flashcard-radical-analysis-radical"><b>${escapeHtml(radical.glyph)}</b><div><strong>${escapeHtml(radicalMeta || 'Bộ thủ của chữ')}</strong>${radical.meaningVi ? `<span>${escapeHtml(radical.meaningVi)}</span>` : ''}</div></div></section>` : ''}
      ${components.length ? `<section><h4>Thành phần chữ</h4><div class="hsk-flashcard-radical-component-list">${components.map(component=>{
        const meta=[component.pinyin,component.hanViet].filter(Boolean).join(' · ');
        const role=[component.roleVi,component.positionVi].filter(Boolean).join(' · ');
        return `<div><b>${escapeHtml(component.glyph)}</b><span><strong>${escapeHtml(meta || 'Chưa có pinyin')}</strong>${component.meaningVi ? `<em>${escapeHtml(component.meaningVi)}</em>` : ''}${role ? `<small>${escapeHtml(role)}</small>` : ''}</span></div>`;
      }).join('')}</div></section>` : ''}
      ${analysis.structureLabel ? `<section><h4>Loại cấu tạo</h4><p>${escapeHtml(analysis.structureLabel)}</p></section>` : ''}
      ${analysis.explanationVi ? `<section><h4>Giải thích</h4><p>${escapeHtml(analysis.explanationVi)}</p></section>` : ''}
      ${analysis.memoryVi ? `<section><h4>Gợi nhớ</h4><p>${escapeHtml(analysis.memoryVi)}</p></section>` : ''}
      ${Array.isArray(analysis.commonErrors) && analysis.commonErrors.length ? `<section><h4>Lưu ý khi viết</h4><ul>${analysis.commonErrors.map(row=>`<li>${escapeHtml(row)}</li>`).join('')}</ul></section>` : ''}
    </article>`;
  }

  function renderFlashcardRadicalSortStudy(session){
    const state=session.radicalSort;
    if(!state) return '<p>Không có đủ dữ liệu bộ thủ đã kiểm duyệt.</p>';
    const remaining=state.items.filter(item=>!item.done);
    const complete=!remaining.length;
    const finalRound=Number(state.roundIndex || 0) >= (state.rounds || []).length - 1;
    const displayMode=['hanzi','pinyin','meaning'].includes(session.settings.radicalSortDisplayMode) ? session.settings.radicalSortDisplayMode : 'hanzi';
    const showMeaningList=session.settings.radicalSortMeaningList === true;
    const focusedItem=state.items.find(item=>item.id===(state.focusedItemId || state.selectedItemId));
    const renderItem=item=>{
      const extra=displayMode==='pinyin' ? item.pinyin : displayMode==='meaning' ? item.meaningVi : '';
      return `<button type="button" class="hsk-flashcard-radical-token ${state.selectedItemId===item.id?'active':''}" data-hsk-radical-item="${escapeHtml(item.id)}"><b>${escapeHtml(item.hanzi)}</b>${extra ? `<small>${escapeHtml(extra)}</small>` : ''}</button>`;
    };
    const selectedHelp=focusedItem && !complete
      ? `<div class="hsk-flashcard-radical-selected-help" data-hsk-radical-selected-help>${renderFlashcardRadicalAnalysis(focusedItem)}</div>`
      : '<div class="hsk-flashcard-radical-selected-help" data-hsk-radical-selected-help hidden></div>';
    const meaningList=`<div class="hsk-flashcard-radical-meaning-list" data-hsk-radical-meaning-list>${state.items.map(item=>`<article class="${item.done?'is-done':''} ${state.selectedItemId===item.id?'is-active':''}" data-hsk-radical-meaning-item="${escapeHtml(item.id)}"><b>${escapeHtml(item.hanzi)}</b><div><strong>${escapeHtml(item.pinyin || 'Chưa có pinyin')}</strong><span>${escapeHtml(item.meaningVi || 'Chưa có nghĩa Việt')}</span></div>${item.done?'<i>✓</i>':''}</article>`).join('')}</div>`;
    return `<header class="hsk-flashcard-header"><button type="button" class="hsk-flashcard-back" data-hsk-flashcard-to-setup>← Thiết lập</button><span class="hsk-flashcard-progress">${state.correct} / ${Number(state.totalItems || state.items.length)}</span><button type="button" class="hsk-flashcard-close" data-hsk-flashcard-close aria-label="Đóng">×</button></header>
      <div class="hsk-flashcard-study hsk-flashcard-study--radical-sort is-compact ${complete ? 'is-complete' : ''}">
        <div class="hsk-flashcard-radical-topbar"><div class="hsk-flashcard-study-meta"><b>Xếp chữ vào bộ thủ</b><span>Lượt ${Number(state.roundIndex || 0)+1}/${Math.max(1,(state.rounds || []).length)} · Chọn chữ → bộ thủ hoặc bộ thủ → chữ</span></div><div class="hsk-flashcard-radical-display" role="group" aria-label="Cách hiển thị chữ">${[['hanzi','汉'],['pinyin','汉+拼'],['meaning','汉+义']].map(([key,label])=>`<button type="button" class="${displayMode===key?'active':''}" data-hsk-radical-display-mode="${key}" aria-pressed="${displayMode===key}">${label}</button>`).join('')}<button type="button" class="${showMeaningList?'active':''}" data-hsk-radical-meaning-toggle aria-pressed="${showMeaningList}" title="${showMeaningList?'Ẩn danh sách nghĩa':'Hiện danh sách nghĩa'}">义表</button></div></div>
        <div class="hsk-flashcard-radical-scroll-region ${showMeaningList?'is-list-mode':''}" data-hsk-radical-scroll-region>
          ${showMeaningList ? meaningList : `<p class="hsk-flashcard-radical-placeholder" data-hsk-radical-placeholder ${focusedItem && !complete ? 'hidden' : ''}>Chọn một chữ để xem pinyin và nghĩa đầy đủ.</p>${selectedHelp}`}
        </div>
        <div class="hsk-flashcard-radical-controls">
          <div class="hsk-flashcard-radical-groups">${state.groups.map(group=>`<button type="button" class="${state.selectedGroupId===group.id?'active':''}" data-hsk-radical-group="${escapeHtml(group.id)}"><span class="hsk-flashcard-radical-group-head"><b>${escapeHtml(group.glyph)}</b><span><strong>${escapeHtml(group.name)}</strong><small>${escapeHtml([group.pinyin,group.hanViet].filter(Boolean).join(' · '))}</small></span></span><i>${state.items.filter(item=>item.done&&item.groupId===group.id).map(item=>item.hanzi).join(' ')}</i></button>`).join('')}</div>
          <div class="hsk-flashcard-radical-bank display-${displayMode} ${complete ? 'is-complete' : ''}">${remaining.map(renderItem).join('') || '<strong>Đã xếp xong tất cả chữ</strong>'}</div>
          <output class="hsk-flashcard-ordering-feedback ${String(state.feedback).startsWith('Đúng')?'is-correct':state.feedback&&!String(state.feedback).startsWith('Đã chọn')?'is-wrong':''}">${escapeHtml(state.feedback || '')}</output>
          ${complete ? (finalRound ? '<button type="button" class="hsk-flashcard-start" data-hsk-radical-complete>Hoàn thành</button>' : '<button type="button" class="hsk-flashcard-start" data-hsk-radical-next-round>Lượt tiếp →</button>') : ''}
        </div>
      </div>`;
  }

  function patchFlashcardRadicalSelection(session){
    const state=session?.radicalSort;
    const overlay=document.getElementById('hskFlashcardOverlay');
    if(!state || !overlay || overlay.hidden) return false;
    const study=overlay.querySelector('.hsk-flashcard-study--radical-sort');
    if(!study) return false;
    study.querySelectorAll('[data-hsk-radical-item]').forEach(button=>button.classList.toggle('active',button.dataset.hskRadicalItem===state.selectedItemId));
    study.querySelectorAll('[data-hsk-radical-group]').forEach(button=>button.classList.toggle('active',button.dataset.hskRadicalGroup===state.selectedGroupId));
    const focused=state.items.find(item=>item.id===(state.focusedItemId || state.selectedItemId) && !item.done);
    study.querySelectorAll('[data-hsk-radical-meaning-item]').forEach(row=>{
      const item=state.items.find(entry=>entry.id===row.dataset.hskRadicalMeaningItem);
      row.classList.toggle('is-active',row.dataset.hskRadicalMeaningItem===state.selectedItemId);
      row.classList.toggle('is-done',Boolean(item?.done));
    });
    const help=study.querySelector('[data-hsk-radical-selected-help]');
    if(help){
      help.hidden=!focused;
      help.innerHTML=focused ? renderFlashcardRadicalAnalysis(focused) : '';
    }
    const placeholder=study.querySelector('[data-hsk-radical-placeholder]');
    if(placeholder) placeholder.hidden=Boolean(focused);
    const scrollRegion=study.querySelector('[data-hsk-radical-scroll-region]');
    if(scrollRegion && focused){
      const activeMeaning=scrollRegion.querySelector(`[data-hsk-radical-meaning-item="${CSS.escape(focused.id)}"]`);
      if(activeMeaning) activeMeaning.scrollIntoView({block:'nearest',behavior:'auto'});
      else scrollRegion.scrollTop=scrollRegion.scrollHeight;
    }
    const feedback=study.querySelector('.hsk-flashcard-ordering-feedback');
    if(feedback){
      feedback.textContent=state.feedback || '';
      feedback.classList.toggle('is-correct',String(state.feedback).startsWith('Đúng'));
      feedback.classList.toggle('is-wrong',Boolean(state.feedback) && !String(state.feedback).startsWith('Đúng') && !String(state.feedback).startsWith('Đã chọn'));
    }
    return true;
  }

  function renderFlashcardPreparing(session){
    return `<header class="hsk-flashcard-header"><button type="button" class="hsk-flashcard-back" data-hsk-flashcard-to-setup>← Thiết lập</button><span class="hsk-flashcard-progress">Đang tải</span><button type="button" class="hsk-flashcard-close" data-hsk-flashcard-close aria-label="Đóng">×</button></header>
      <div class="hsk-flashcard-preparing" role="status" aria-live="polite"><span class="hsk-flashcard-preparing-spinner" aria-hidden="true"></span><h2>Đang chuẩn bị chữ và bộ thủ…</h2><p>Lần mở đầu có thể cần tải dữ liệu. Các lần sau sẽ nhanh hơn.</p></div>`;
  }

  function renderFlashcardStudy(session){
    const card = session.cards[session.index];
    const type = getCurrentFlashcardType(session);
    if(type === 'typing') return renderFlashcardTypingStudy(session, card);
    if(type === 'matching') return renderFlashcardMatchingStudy(session);
    if(type === 'sentence-ordering') return renderFlashcardSentenceOrderingStudy(session);
    if(type === 'radical-sort') return renderFlashcardRadicalSortStudy(session);
    const rating = session.ratings[card.id] || '';
    return `
      <header class="hsk-flashcard-header">
        <button type="button" class="hsk-flashcard-back" data-hsk-flashcard-to-setup>← Thiết lập</button>
        <span class="hsk-flashcard-progress">${session.index + 1} / ${session.cards.length}</span>
        <button type="button" class="hsk-flashcard-close" data-hsk-flashcard-close aria-label="Đóng">×</button>
      </header>
      <div class="hsk-flashcard-study hsk-flashcard-study--cards">
        <div class="hsk-flashcard-study-meta"><b>${escapeHtml(getFlashcardModeLabel(type))}</b><span>${escapeHtml(session.title)}</span></div>
        <div class="hsk-flashcard-card-area">
          <div class="hsk-flashcard-card ${session.flipped ? 'is-flipped' : ''}" data-hsk-flashcard-flip role="button" tabindex="0" aria-label="Thẻ flashcard, bấm để lật">
            ${renderFlashcardFace(session, card, type)}
          </div>
        </div>
        <footer class="hsk-flashcard-study-footer">
          ${session.flipped ? `
            <div class="hsk-flashcard-rating" role="group" aria-label="Tự đánh giá">
              ${[['easy','Dễ'],['review','Ôn'],['hard','Khó']].map(([key,label]) => `<button type="button" class="${rating === key ? 'active' : ''}" data-hsk-flashcard-rate="${key}">${label}</button>`).join('')}
            </div>
          ` : `<button type="button" class="hsk-flashcard-reveal" data-hsk-flashcard-flip>Xem đáp án</button>`}
          <div class="hsk-flashcard-nav">
            <button type="button" data-hsk-flashcard-prev ${session.index === 0 ? 'disabled' : ''}>← Trước</button>
            <button type="button" data-hsk-flashcard-next>${session.index === session.cards.length - 1 ? 'Hoàn thành' : 'Tiếp →'}</button>
          </div>
        </footer>
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
        ${session.cards.find(card => card.structurePracticeUrl)?.structurePracticeUrl ? `<a class="hsk-flashcard-secondary hsk-flashcard-structure-practice" href="${escapeHtml(session.cards.find(card => card.structurePracticeUrl).structurePracticeUrl)}">构 Luyện cấu tạo các chữ trong bộ thẻ</a>` : ''}
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
      setFlashcardHostMode(overlay, false);
      body.innerHTML = renderFlashcardStats();
      overlay.hidden = false;
      document.body.classList.add('hsk-flashcard-open');
      return;
    }
    const session = hskState.flashcardSession;
    if(!session) return;
    const isActivity = session.phase === 'preparing' || session.phase === 'study' || session.phase === 'complete';
    setFlashcardHostMode(overlay, isActivity);
    body.innerHTML = session.phase === 'setup'
      ? renderFlashcardSetup(session)
      : (session.phase === 'preparing' ? renderFlashcardPreparing(session) : (session.phase === 'complete' ? renderFlashcardComplete(session) : renderFlashcardStudy(session)));
    overlay.hidden = false;
    document.body.classList.add('hsk-flashcard-open');
    persistFlashcardSession();
    window.requestAnimationFrame(() => {
      mountFlashcardStrokeWriters();
      const typingInput = body.querySelector('[data-hsk-flashcard-typing-input]');
      if(typingInput && !typingInput.readOnly){
        try{ typingInput.focus({ preventScroll: true }); }catch(_err){ typingInput.focus(); }
        placeFlashcardTypingCaretAtEnd(typingInput);
      }
      if(session.phase === 'study' && getCurrentFlashcardType(session) === 'typing') startFlashcardTypingClock(session);
      else stopFlashcardTypingClock();
    });
  }

  function moveFlashcard(step){
    const session = hskState.flashcardSession;
    if(!session || session.phase !== 'study') return;
    cancelFlashcardTypingCompletionTimer();
    cancelFlashcardTypingErrorTimer();
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

  function launchExternalFlashcardsFromStorage(){
    const params = new URLSearchParams(window.location.search);
    if(params.get('externalFlashcards') !== '1') return false;
    try{
      const payload = JSON.parse(window.sessionStorage?.getItem('tiengTrung.hsk.externalFlashcard.v1') || 'null');
      if(!payload?.cards?.length) return false;
      window.sessionStorage?.removeItem('tiengTrung.hsk.externalFlashcard.v1');
      return createFlashcardSessionFromCards(payload.cards, payload.title, {
        origin: 'external',
        contextKey: payload.contextKey,
        contextLabel: payload.contextLabel,
        returnUrl: payload.returnUrl
      });
    }catch(_err){
      return false;
    }
  }

  function launchEmbeddedPopupFromStorage(){
    const params = new URLSearchParams(window.location.search);
    if(params.get('embedPopup') !== '1') return false;
    document.documentElement.classList.add('hsk-popup-embed');
    const token = params.get('popupToken') || '';
    if(!token) return false;
    try{
      const key = `tiengTrung.hsk.popupSeed.${token}`;
      const payload = JSON.parse(window.sessionStorage?.getItem(key) || 'null');
      window.sessionStorage?.removeItem(key);
      if(!payload?.word) return false;
      openHskPopup(payload.word, {
        pushHistory: false,
        seed: payload.seed || {},
        returnContext: payload.returnContext || { type: 'external' }
      });
      return true;
    }catch(_err){
      return false;
    }
  }

  window.addEventListener('message', event => {
    if(event.origin !== window.location.origin) return;
    if(new URLSearchParams(window.location.search).get('embedPopup') !== '1') return;
    if(event.data?.type !== 'tiengtrung:hsk-popup-open') return;
    const payload = event.data.payload || {};
    if(!payload.word) return;
    openHskPopup(payload.word, {
      pushHistory: false,
      seed: payload.seed || {},
      returnContext: payload.returnContext || { type: 'external' }
    });
    window.requestAnimationFrame(() => {
      window.parent.postMessage({
        type: 'tiengtrung:hsk-popup-ready',
        word: payload.word
      }, window.location.origin);
    });
  });

  ensureFlashcardLibraryUi();
  (function applyInitialStudyRoute(){
    if(new URLSearchParams(window.location.search).get('embedPopup') === '1') return;
    const route=new URLSearchParams(window.location.search).get('study') || 'hub';
    if(route==='writing' || route==='lookup') setStudyTab('lookup');
    else if(route==='hsk') setStudyTab('hsk');
    else if(route==='radical' || route==='radicals') setStudyTab('radicals');
    else if(route==='flashcards') setStudyTab('flashcards');
    else setStudyTab('hub');
  })();
  window.setTimeout(() => {
    if(!launchEmbeddedPopupFromStorage()) launchExternalFlashcardsFromStorage();
  }, 0);

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
    const pinyinButton = event.target.closest('[data-hsk-toggle-pinyin]');
    if(pinyinButton){
      event.preventDefault();
      saveStoredHskPinyinVisibility(hskState.showPinyin === false);
      applyHskPinyinVisibility();
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

  document.addEventListener('pointerdown',beginFlashcardPointerDrag);
  document.addEventListener('pointermove',moveFlashcardPointerDrag,{passive:false});
  document.addEventListener('pointerup',endFlashcardPointerDrag);
  document.addEventListener('pointercancel',cleanupFlashcardPointerDrag);

  document.addEventListener('click', event => {
    if(Date.now()<flashcardPointerDragSuppressClickUntil && event.target.closest('[data-hsk-order-token],[data-hsk-radical-item]')){
      event.preventDefault();
      return;
    }
    const flashOpen = event.target.closest('[data-hsk-flashcard-open]');
    if(flashOpen){
      event.preventDefault();
      openFlashcardSetup();
      return;
    }
    const flashMatchingOpen = event.target.closest('[data-hsk-flashcard-open-matching]');
    if(flashMatchingOpen){
      event.preventDefault();
      openFlashcardMatchingSetup();
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
        clearFlashcardOrderingAdvanceTimer();
        session.settings.mode = modeButton.dataset.hskFlashcardMode || 'flashcard';
        saveFlashcardSettings(session.settings);
        if(session.settings.mode==='radical-sort') prepareFlashcardRadicalSortState(session.cards).catch(()=>{});
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
      const typingDelayButton = event.target.closest('[data-hsk-flashcard-typing-delay]');
      if(typingDelayButton && session.phase === 'setup'){
        const value = typingDelayButton.dataset.hskFlashcardTypingDelay || 'default';
        if(value === 'default'){
          session.settings.typingAutoAdvanceMode = 'default';
        }else{
          session.settings.typingAutoAdvanceMode = 'custom';
          session.settings.typingAutoAdvanceSeconds = normalizeFlashcardTypingAutoAdvanceSeconds(value);
        }
        saveFlashcardSettings(session.settings);
        renderFlashcardOverlay();
        return;
      }
      const orderingDelayButton = event.target.closest('[data-hsk-ordering-delay]');
      if(orderingDelayButton && session.phase === 'setup'){
        session.settings.sentenceOrderingAutoAdvanceSeconds = normalizeFlashcardOrderingDelay(orderingDelayButton.dataset.hskOrderingDelay, 1.2);
        saveFlashcardSettings(session.settings);
        renderFlashcardOverlay();
        return;
      }
      const option = event.target.closest('[data-hsk-flashcard-option]');
      if(option && session.phase === 'setup'){
        session.settings[option.dataset.hskFlashcardOption] = Boolean(option.checked);
        if(option.dataset.hskFlashcardOption === 'tapHanziSpeak' && Matching) Matching.setSetting('tapHanziSpeak', option.checked);
        if(option.dataset.hskFlashcardOption === 'showPinyin' && Matching) Matching.setSetting('matchingShowPinyin', option.checked);
        saveFlashcardSettings(session.settings);
        if(['typingAutoAdvanceEnabled','sentenceOrderingAutoAdvanceEnabled'].includes(option.dataset.hskFlashcardOption)) renderFlashcardOverlay();
        return;
      }
      if(event.target.closest('[data-hsk-flashcard-start]')){
        startFlashcardSession();
        return;
      }
      if(event.target.closest('[data-hsk-flashcard-to-setup]')){
        Matching?.cancelScheduledNextRound?.(session.matching);
        cancelFlashcardTypingCompletionTimer();
        cancelFlashcardTypingErrorTimer();
        stopFlashcardTypingClock();
        clearFlashcardOrderingAdvanceTimer();
        session.prepareToken=(Number(session.prepareToken)||0)+1;
        session.phase = 'setup';
        renderFlashcardOverlay();
        return;
      }
      const matchCard = event.target.closest('[data-match-side][data-match-id]');
      if(matchCard && session.phase === 'study' && getCurrentFlashcardType(session) === 'matching'){
        event.preventDefault();
        handleFlashcardMatchingSelection(matchCard.dataset.matchSide, matchCard.dataset.matchId);
        return;
      }
      const matchAction = event.target.closest('[data-match-action]');
      if(matchAction && session.phase === 'study' && getCurrentFlashcardType(session) === 'matching'){
        event.preventDefault();
        const matching = session.matching;
        const action = matchAction.dataset.matchAction;
        if(action === 'toggle-pinyin'){
          const value = Matching.togglePinyin(matching);
          session.settings.showPinyin = value;
          saveFlashcardSettings(session.settings);
        }else if(action === 'toggle-speak'){
          const value = Matching.toggleTapSpeak(matching);
          session.settings.tapHanziSpeak = value;
          saveFlashcardSettings(session.settings);
        }else if(action === 'toggle-settings') Matching.toggleSettings(matching);
        else if(action === 'close-settings') Matching.toggleSettings(matching, false);
        else if(action === 'set-round-limit') Matching.setRoundLimit(matching, matchAction.dataset.matchValue || 'auto');
        else if(action === 'apply-custom-limit'){
          const input = matchAction.closest('[data-matching-root]')?.querySelector('[data-match-custom-limit]');
          Matching.setRoundLimit(matching, input?.value || '');
        }else if(action === 'toggle-auto-next') Matching.setAutoNext(matching, !matching.autoNext);
        else if(action === 'set-auto-next-delay') Matching.setAutoNextDelay(matching, matchAction.dataset.matchValue);
        else if(action === 'apply-custom-delay'){
          const input = matchAction.closest('[data-matching-root]')?.querySelector('[data-match-custom-delay]');
          Matching.setAutoNextDelay(matching, input?.value);
        }else if(action === 'manual-next') Matching.nextRound(matching);
        persistFlashcardSession();
        renderFlashcardOverlay();
        if(Matching.isRoundComplete(matching) && !Matching.isComplete(matching) && matching.autoNext && !matching.settingsOpen){
          scheduleFlashcardMatchingRoundAdvance(session);
        }
        return;
      }
      if(event.target.closest('[data-hsk-flashcard-matching-restart]')){
        session.matching = Matching.createSession(session.cards.map(card => ({ id:card.id, canonicalItemId:card.id, leftText:card.word, pinyin:card.pinyin || '', rightText:card.meaningVi, speechText:card.word, meta:{cardId:card.id,cardType:card.cardType} })), { title:'Nối thẻ', subtitle:session.title, contentKind:flashcardMatchingContentKind(session.cards), showPinyin:session.settings.showPinyin, tapToSpeak:session.settings.tapHanziSpeak });
        session.ratings = {};
        persistFlashcardSession();
        renderFlashcardOverlay();
        return;
      }
      if(event.target.closest('[data-hsk-flashcard-matching-complete]')){
        session.phase = 'complete';
        persistFlashcardSession();
        renderFlashcardOverlay();
        return;
      }
      const orderVocabToggle=event.target.closest('[data-hsk-order-vocab-toggle]');
      if(orderVocabToggle && getCurrentFlashcardType(session)==='sentence-ordering'){
        session.settings.sentenceOrderingVocabularyList=session.settings.sentenceOrderingVocabularyList !== true;
        saveFlashcardSettings(session.settings);
        persistFlashcardSession();
        renderFlashcardOverlay();
        return;
      }
      const orderVocabSpeak=event.target.closest('[data-hsk-order-vocab-speak]');
      if(orderVocabSpeak && getCurrentFlashcardType(session)==='sentence-ordering'){
        event.preventDefault();
        speakChar(orderVocabSpeak.dataset.hskOrderVocabSpeak || '');
        return;
      }
      const orderPinyinButton=event.target.closest('[data-hsk-order-pinyin]');
      if(orderPinyinButton && getCurrentFlashcardType(session)==='sentence-ordering'){
        session.settings.showPinyin=!session.settings.showPinyin;
        saveFlashcardSettings(session.settings);
        persistFlashcardSession();
        renderFlashcardOverlay();
        return;
      }
      const orderSpeakButton=event.target.closest('[data-hsk-order-speak]');
      if(orderSpeakButton && getCurrentFlashcardType(session)==='sentence-ordering'){
        event.preventDefault();
        speakChar(orderSpeakButton.dataset.hskOrderSpeak || '');
        return;
      }
      const orderTokenButton = event.target.closest('[data-hsk-order-token]');
      if(orderTokenButton && getCurrentFlashcardType(session) === 'sentence-ordering'){
        const orderState=session.sentenceOrdering;
        const itemId=orderTokenButton.closest('[data-hsk-order-item-id]')?.dataset.hskOrderItemId || '';
        const item=orderState?.items?.find(row=>row.id===itemId);
        if(!item || item.complete) return;
        const tokenId=orderTokenButton.dataset.hskOrderToken;
        const zone=orderTokenButton.dataset.hskOrderZone;
        const token=[...(item.bank || []),...(item.selected || [])].find(row=>row.id===tokenId);
        if(token && session.settings.tapHanziSpeak) speakChar(token.text);
        if(zone === 'bank'){
          if(token && !item.selected.some(row=>row.id===tokenId)) item.selected.push(token);
        }else item.selected=item.selected.filter(row=>row.id!==tokenId);
        item.feedback='';
        const correct=evaluateFlashcardSentenceOrdering(session,item);
        persistFlashcardSession(); renderFlashcardOverlay();
        if(correct) scheduleFlashcardOrderingAdvance(session);
        return;
      }
      if(event.target.closest('[data-hsk-order-reset]') && getCurrentFlashcardType(session) === 'sentence-ordering'){
        clearFlashcardOrderingAdvanceTimer();
        const state=session.sentenceOrdering; const resetButton=event.target.closest('[data-hsk-order-reset]');
        const itemId=resetButton?.closest('[data-hsk-order-item-id]')?.dataset.hskOrderItemId || '';
        const item=state?.items?.find(row=>row.id===itemId);
        if(item){ item.selected=[]; item.complete=false; item.feedback=''; item.rating=''; persistFlashcardSession(); renderFlashcardOverlay(); }
        return;
      }
      const orderRatingButton=event.target.closest('[data-hsk-order-rating]');
      if(orderRatingButton && getCurrentFlashcardType(session)==='sentence-ordering'){
        const state=session.sentenceOrdering;
        const itemId=orderRatingButton.closest('[data-hsk-order-item-id]')?.dataset.hskOrderItemId || '';
        const item=state?.items?.find(row=>row.id===itemId); const rating=orderRatingButton.dataset.hskOrderRating;
        if(item?.complete && ['easy','review','hard'].includes(rating)){ const previous=session.ratings[item.card.id]||''; item.rating=rating; session.ratings[item.card.id]=rating; saveFlashcardRatingResult(item.card,rating,previous); persistFlashcardSession(); renderFlashcardOverlay(); }
        return;
      }
      if(event.target.closest('[data-hsk-order-next]') && getCurrentFlashcardType(session) === 'sentence-ordering'){
        const state=session.sentenceOrdering;
        if(state.index + flashcardOrderingPageSize(session) >= state.items.length) session.phase='complete';
        else { advanceFlashcardSentenceOrdering(session); return; }
        persistFlashcardSession(); renderFlashcardOverlay(); return;
      }
      const radicalDisplayButton=event.target.closest('[data-hsk-radical-display-mode]');
      if(radicalDisplayButton && getCurrentFlashcardType(session)==='radical-sort'){
        const mode=radicalDisplayButton.dataset.hskRadicalDisplayMode;
        if(['hanzi','pinyin','meaning'].includes(mode)){ session.settings.radicalSortDisplayMode=mode; saveFlashcardSettings(session.settings); persistFlashcardSession(); renderFlashcardOverlay(); }
        return;
      }
      const radicalMeaningToggle=event.target.closest('[data-hsk-radical-meaning-toggle]');
      if(radicalMeaningToggle && getCurrentFlashcardType(session)==='radical-sort'){
        session.settings.radicalSortMeaningList=session.settings.radicalSortMeaningList !== true;
        saveFlashcardSettings(session.settings);
        persistFlashcardSession();
        renderFlashcardOverlay();
        return;
      }
      const radicalItemButton=event.target.closest('[data-hsk-radical-item]');
      if(radicalItemButton && getCurrentFlashcardType(session)==='radical-sort'){
        const state=session.radicalSort; const itemId=radicalItemButton.dataset.hskRadicalItem||'';
        state.focusedItemId=itemId;
        const wasEmpty=!state.selectedItemId&&!state.selectedGroupId;
        state.selectedItemId=state.selectedItemId===itemId?'':itemId;
        if(wasEmpty&&state.selectedItemId) state.selectionLead='item';
        if(!state.selectedItemId&&!state.selectedGroupId) state.selectionLead='';
        const matched=state.selectedItemId && state.selectedGroupId ? attemptFlashcardRadicalMatch(session,state.selectedItemId,state.selectedGroupId) : false;
        if(!state.selectedItemId || !state.selectedGroupId) state.feedback=state.selectedItemId?'Đã chọn chữ. Hãy chọn bộ thủ.':state.selectedGroupId?'Đã chọn bộ thủ. Hãy chọn chữ.':'';
        scheduleFlashcardRadicalPersist();
        if(matched) renderFlashcardOverlay(); else patchFlashcardRadicalSelection(session);
        return;
      }
      const radicalGroupButton=event.target.closest('[data-hsk-radical-group]');
      if(radicalGroupButton && getCurrentFlashcardType(session)==='radical-sort'){
        const state=session.radicalSort; const groupId=radicalGroupButton.dataset.hskRadicalGroup||'';
        const wasEmpty=!state.selectedItemId&&!state.selectedGroupId;
        state.selectedGroupId=state.selectedGroupId===groupId?'':groupId;
        if(wasEmpty&&state.selectedGroupId) state.selectionLead='group';
        if(!state.selectedItemId&&!state.selectedGroupId) state.selectionLead='';
        const matched=state.selectedItemId && state.selectedGroupId ? attemptFlashcardRadicalMatch(session,state.selectedItemId,state.selectedGroupId) : false;
        if(!state.selectedItemId || !state.selectedGroupId) state.feedback=state.selectedGroupId?'Đã chọn bộ thủ. Hãy chọn chữ.':state.selectedItemId?'Đã chọn chữ. Hãy chọn bộ thủ.':'';
        scheduleFlashcardRadicalPersist();
        if(matched) renderFlashcardOverlay(); else patchFlashcardRadicalSelection(session);
        return;
      }
      if(event.target.closest('[data-hsk-radical-next-round]') && getCurrentFlashcardType(session)==='radical-sort'){
        if(advanceFlashcardRadicalRound(session.radicalSort)){ persistFlashcardSession(); renderFlashcardOverlay(); }
        return;
      }
      if(event.target.closest('[data-hsk-radical-complete]') && getCurrentFlashcardType(session)==='radical-sort'){
        session.phase='complete'; persistFlashcardSession(); renderFlashcardOverlay(); return;
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
        if(getCurrentFlashcardType(session) === 'matching' && Matching){
          session.matching = Matching.createSession(session.cards.filter(card => card.word && card.meaningVi).map(card => ({ id:card.id, canonicalItemId:card.id, leftText:card.word, pinyin:card.pinyin || '', rightText:card.meaningVi, speechText:card.word, meta:{cardId:card.id,cardType:card.cardType} })), { title:'Nối thẻ', subtitle:session.title, contentKind:flashcardMatchingContentKind(session.cards), showPinyin:session.settings.showPinyin, tapToSpeak:session.settings.tapHanziSpeak });
        }
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
        if(getCurrentFlashcardType(session) === 'matching' && Matching){
          session.matching = Matching.createSession(selected.filter(card => card.word && card.meaningVi).map(card => ({ id:card.id, canonicalItemId:card.id, leftText:card.word, pinyin:card.pinyin || '', rightText:card.meaningVi, speechText:card.word, meta:{cardId:card.id,cardType:card.cardType} })), { title:'Nối thẻ', subtitle:session.title, contentKind:flashcardMatchingContentKind(selected), showPinyin:session.settings.showPinyin, tapToSpeak:session.settings.tapHanziSpeak });
        }
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

    const sentencesToggle = event.target.closest('[data-hsk-sentences-toggle]');
    if(sentencesToggle){
      event.preventDefault();
      hskState.popupSentencesExpanded = !hskState.popupSentencesExpanded;
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

  window.addEventListener('popstate', restoreHskRouteFromLocation);

  window.setTimeout(() => {
    if(new URLSearchParams(window.location.search).get('embedPopup') === '1') return;
    const restored = restorePersistedFlashcardSession();
    const shouldResume = new URLSearchParams(window.location.search).get('resume') === 'flashcard';
    if(restored && shouldResume){
      setStudyTab('flashcards');
      renderFlashcardOverlay();
    }
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

})();

(function installNewHskExternalReturn(){
  const params = new URLSearchParams(window.location.search);
  const returnUrl = params.get('return');
  if(!returnUrl || params.get('embedPopup') === '1' || (params.get('study') === 'radicals' && params.get('radicalId'))) return;
  const link = document.createElement('a');
  link.className = 'new-hsk-external-return';
  link.href = returnUrl;
  const returnLabel = params.get('returnLabel') || 'Quay lại New 3.0';
  link.textContent = `← ${returnLabel}`;
  link.setAttribute('aria-label', returnLabel);
  document.body.appendChild(link);
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
  const radicalQuery = new URLSearchParams(window.location.search);
  const requestedRadicalId = radicalQuery.get('radicalId') || '';
  const externalReturnUrl = radicalQuery.get('return') || '';
  const externalReturnLabel = radicalQuery.get('returnLabel') || 'Quay lại New 3.0';
  const COMMON_RADICAL_IDS = [
    'thuy_085','nhan_009','khau_030','nu_038','nhat_072','moc_075','tam_061','thu_064','thao_140','ngon_149','suoc_162','mien_040','muc_109','nguyet_074','kim_167','boi_154','thuc_184','ma_187','vu_173','hoa_086','ap_163','phu_170'
  ];
  const MODE_IDS = {
    water: ['thuy_085','bang_015','vu_173'],
    person: ['nhan_009','nu_038','tu_039','tam_061','thu_064'],
    speech: ['khau_030','ngon_149']
  };

  const state = {
    notes: {},
    items: [],
    groups: [],
    groupId: 'all',
    query: '',
    activeId: '',
    popupExpanded: {},
    catalogLoaded: false,
    loadingPromise: null,
    requestedRadicalOpened: false,
    fullNotesPromise: null,
    loadAttempt: 0,
    loadStartedAt: 0
  };

  async function fetchJsonLocal(path, options = {}){
    const timeoutMs = Number(options.timeoutMs) || 12000;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try{
      const response = await fetch(path, { signal: controller.signal });
      if(!response.ok){
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return await response.json();
    }catch(error){
      if(error?.name === 'AbortError'){
        throw new Error('Quá thời gian tải dữ liệu. Vui lòng thử lại.');
      }
      throw error;
    }finally{
      window.clearTimeout(timer);
    }
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
      Array.isArray(note.variants) ? note.variants.join(' ') : '',
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

  function renderRadicalLoadError(error){
    console.error('[Bộ thủ] Không tải được danh mục:', error);
    if(status) status.textContent = 'Không tải được dữ liệu bộ thủ.';
    list.innerHTML = `
      <div class="radical-load-error" role="alert">
        <strong>Không tải được danh sách bộ thủ.</strong>
        <p>${escapeHtml(error?.message || 'Vui lòng kiểm tra kết nối rồi thử lại.')}</p>
        <button type="button" class="radical-retry-btn" data-radical-retry>Thử lại</button>
      </div>
    `;
  }

  function normalizeRadicalCatalog(payload){
    const rows = Array.isArray(payload) ? payload : payload?.items;
    if(!Array.isArray(rows) || !rows.length){
      throw new Error('Danh mục bộ thủ không hợp lệ hoặc đang trống.');
    }
    return rows.filter(note => note && note.id).sort((a, b) => {
      const ar = getRadicalSortRank(a);
      const br = getRadicalSortRank(b);
      if(ar !== br) return ar - br;
      return String(a.displayNameVi || '').localeCompare(String(b.displayNameVi || ''), 'vi');
    });
  }

  async function loadLegacyRadicalNotes(){
    if(state.fullNotesPromise){
      return state.fullNotesPromise;
    }
    state.fullNotesPromise = fetchJsonLocal(`${RADICAL_DATA_BASE}radical_learning_notes.json`, { timeoutMs: 20000 })
      .then(notes => {
        const rows = notes && typeof notes === 'object' ? notes : {};
        Object.assign(state.notes, rows);
        return rows;
      })
      .finally(() => {
        state.fullNotesPromise = null;
      });
    return state.fullNotesPromise;
  }

  async function loadRadicalDetail(id){
    if(!id){
      throw new Error('Thiếu mã bộ thủ.');
    }
    if(state.notes[id]?.detailForRadicalPopup){
      return state.notes[id];
    }
    try{
      const note = await fetchJsonLocal(`${RADICAL_DATA_BASE}details/${encodeURIComponent(id)}.json`, { timeoutMs: 12000 });
      if(!note || !note.id){
        throw new Error('Chi tiết bộ thủ không hợp lệ.');
      }
      state.notes[id] = note;
      return note;
    }catch(detailError){
      console.warn(`Cannot load radical detail ${id}, fallback to legacy file:`, detailError);
      const notes = await loadLegacyRadicalNotes();
      const note = notes?.[id];
      if(!note){
        throw detailError;
      }
      return note;
    }
  }

  function radicalPopupBackControl(){
    const allRadicals = '<button type="button" class="radical-popup-back" data-radical-popup-close>← Tất cả bộ thủ</button>';
    if(externalReturnUrl){
      return `<div class="radical-popup-nav">${allRadicals}<a class="radical-popup-back radical-popup-back--external" href="${escapeHtml(externalReturnUrl)}">← ${escapeHtml(externalReturnLabel)}</a></div>`;
    }
    return allRadicals;
  }

  function openRequestedRadicalOnce(){
    if(!requestedRadicalId || state.requestedRadicalOpened || !state.catalogLoaded) return;
    if(!state.items.some(row => row.id === requestedRadicalId)) return;
    state.requestedRadicalOpened = true;
    window.setTimeout(() => openRadicalPopup(requestedRadicalId), 0);
  }

  async function loadRadicals(options = {}){
    const force = Boolean(options.force);
    const reason = String(options.reason || 'unknown');
    if(state.catalogLoaded && !force){
      renderRadicalGroupDropdown();
      renderRadicals();
      openRequestedRadicalOnce();
      return state.items;
    }
    if(state.loadingPromise && !force){
      return state.loadingPromise;
    }

    const attempt = ++state.loadAttempt;
    state.loadStartedAt = Date.now();
    if(force){
      state.catalogLoaded = false;
      state.items = [];
      state.groups = [];
    }
    if(status) status.textContent = 'Đang tải dữ liệu bộ thủ...';
    list.innerHTML = '<p class="radical-empty radical-loading-state">Đang tải danh mục 214 bộ thủ...</p>';
    console.info(`[Bộ thủ] Bắt đầu tải (${reason}, lượt ${attempt}).`);

    let watchdog = 0;
    const task = (async () => {
      try{
        watchdog = window.setTimeout(() => {
          if(attempt !== state.loadAttempt || state.catalogLoaded) return;
          state.loadAttempt += 1;
          state.loadingPromise = null;
          const timeoutError = new Error('Quá thời gian tải toàn bộ dữ liệu bộ thủ. Vui lòng thử lại.');
          console.error('[Bộ thủ] Watchdog timeout:', timeoutError);
          renderRadicalLoadError(timeoutError);
        }, 32000);

        let catalog;
        try{
          catalog = await fetchJsonLocal(`${RADICAL_DATA_BASE}radical_catalog.json`, { timeoutMs: 10000 });
          if(attempt !== state.loadAttempt) return [];
          state.items = normalizeRadicalCatalog(catalog);
          console.info(`[Bộ thủ] Đã tải catalog nhẹ: ${state.items.length} mục.`);
        }catch(catalogError){
          console.warn('[Bộ thủ] Catalog nhẹ lỗi, chuyển sang dữ liệu đầy đủ:', catalogError);
          const notes = await loadLegacyRadicalNotes();
          if(attempt !== state.loadAttempt) return [];
          state.items = normalizeRadicalCatalog(Object.values(notes || {}));
          console.info(`[Bộ thủ] Fallback dữ liệu đầy đủ thành công: ${state.items.length} mục.`);
        }

        try{
          const groups = await fetchJsonLocal(`${RADICAL_DATA_BASE}radical_groups.json`, { timeoutMs: 10000 });
          if(attempt !== state.loadAttempt) return [];
          state.groups = normalizeRadicalGroups(groups);
        }catch(groupErr){
          console.warn('[Bộ thủ] Không tải được nhóm, dùng nhóm dự phòng:', groupErr);
          state.groups = normalizeRadicalGroups(getFallbackRadicalGroups());
        }
        if(attempt !== state.loadAttempt) return [];
        state.catalogLoaded = true;
        renderRadicalGroupDropdown();
        renderRadicals();
        openRequestedRadicalOnce();
        console.info(`[Bộ thủ] Hoàn tất ${state.items.length} bộ sau ${Date.now() - state.loadStartedAt} ms.`);
        return state.items;
      }catch(err){
        if(attempt !== state.loadAttempt) return [];
        state.catalogLoaded = false;
        renderRadicalLoadError(err);
        return [];
      }finally{
        if(watchdog) window.clearTimeout(watchdog);
        if(attempt === state.loadAttempt) state.loadingPromise = null;
      }
    })();
    state.loadingPromise = task;
    return task;
  }

  function isRadicalRoute(){
    const study = new URLSearchParams(window.location.search).get('study');
    return study === 'radical' || study === 'radicals';
  }

  function ensureRadicalsLoaded(options = {}){
    if(!options.force && !isRadicalRoute() && view.hidden){
      return Promise.resolve(state.items);
    }
    return loadRadicals(options);
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
        ${radicalPopupBackControl()}
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

  async function openRadicalPopup(id){
    const summary = state.items.find(row => row.id === id) || state.notes?.[id];
    if(!summary){
      return;
    }
    state.activeId = id;
    state.popupExpanded = {};
    const popup = ensureRadicalPopup();
    const body = document.getElementById('radicalDetailBody');
    body.innerHTML = `
      <div class="radical-popup-topbar">
        ${radicalPopupBackControl()}
        <button type="button" class="radical-popup-close" data-radical-popup-close aria-label="Đóng">×</button>
      </div>
      <div class="radical-detail-loading" role="status">
        <strong>${escapeHtml(summary.key || summary.mainForm || '')} · ${escapeHtml(summary.displayNameVi || 'Bộ thủ')}</strong>
        <span>Đang tải chi tiết...</span>
      </div>
    `;
    popup.hidden = false;
    document.body.classList.add('radical-popup-open');
    try{
      const note = await loadRadicalDetail(id);
      if(state.activeId !== id){
        return;
      }
      renderRadicalPopup(note);
    }catch(error){
      console.warn('Cannot open radical detail:', error);
      if(state.activeId !== id){
        return;
      }
      body.innerHTML = `
        <div class="radical-popup-topbar">
          ${radicalPopupBackControl()}
          <button type="button" class="radical-popup-close" data-radical-popup-close aria-label="Đóng">×</button>
        </div>
        <div class="radical-load-error" role="alert">
          <strong>Không tải được chi tiết ${escapeHtml(summary.displayNameVi || 'bộ thủ')}.</strong>
          <p>${escapeHtml(error?.message || 'Vui lòng thử lại.')}</p>
          <button type="button" class="radical-retry-btn" data-radical-detail-retry="${escapeHtml(id)}">Thử lại</button>
        </div>
      `;
    }
  }

  window.openRadicalLearningPopup = openRadicalPopup;
  window.HanziRadicals = Object.freeze({
    ensureLoaded: ensureRadicalsLoaded,
    retry: () => ensureRadicalsLoaded({ force: true, reason: 'manual-retry' }),
    isLoaded: () => state.catalogLoaded,
    isLoading: () => Boolean(state.loadingPromise)
  });

  window.addEventListener('hanzi:radicals-tab-open', () => {
    ensureRadicalsLoaded({ reason: 'legacy-event' });
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
    const retry = event.target.closest('[data-radical-retry]');
    if(retry && list.contains(retry)){
      event.preventDefault();
      event.stopPropagation();
      ensureRadicalsLoaded({ force: true, reason: 'retry-button' });
      return;
    }
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
    const detailRetry = event.target.closest('[data-radical-detail-retry]');
    if(detailRetry){
      event.preventDefault();
      openRadicalPopup(detailRetry.dataset.radicalDetailRetry || '');
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

  const routeCheck = reason => {
    if(isRadicalRoute() || !view.hidden){
      ensureRadicalsLoaded({ reason });
    }
  };

  const visibilityObserver = new MutationObserver(() => {
    if(!view.hidden) routeCheck('view-visible');
  });
  visibilityObserver.observe(view, { attributes: true, attributeFilter: ['hidden'] });

  window.addEventListener('popstate', () => routeCheck('popstate'));
  window.addEventListener('tiengtrung:navigationchange', () => routeCheck('navigationchange'));
  routeCheck('module-init');
  window.setTimeout(() => routeCheck('route-recheck-250ms'), 250);
  window.setTimeout(() => routeCheck('route-recheck-1200ms'), 1200);
})();


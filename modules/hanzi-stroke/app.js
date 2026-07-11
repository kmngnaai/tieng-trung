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
  const size = params.get('size');

  if(chars){
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
  const GRAMMAR_DATA_BASE = 'data/learning/grammar/';
  const hskCache = new Map();
  const grammarCache = new Map();
  const hskState = {
    summary: null,
    grammarSummary: null,
    currentLevel: 1,
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
    groupMode: 'lessons',
    topicKey: 'all',
    wordFilter: 'all',
    sourceKey: 'hsk',
    levelLoading: false
  };

  const HSK_MODE_STORAGE_KEY = 'hanziStroke.hskLastModeBySourceLevel.v1';

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
    const isLookup = tabName === 'lookup';
    const isHsk = tabName === 'hsk';
    const isRadicals = tabName === 'radicals';
    lookupView.hidden = !isLookup;
    hskView.hidden = !isHsk;
    if(radicalsView){
      radicalsView.hidden = !isRadicals;
    }
    tabLookup.classList.toggle('active', isLookup);
    tabHsk.classList.toggle('active', isHsk);
    tabRadicals?.classList.toggle('active', isRadicals);
    tabLookup.setAttribute('aria-selected', String(isLookup));
    tabHsk.setAttribute('aria-selected', String(isHsk));
    tabRadicals?.setAttribute('aria-selected', String(isRadicals));

    if(isHsk){
      stopAutoplayLoop();
      loadHskSummary();
      loadGrammarSummary();
      window.setTimeout(() => hskSearch?.focus(), 80);
    }else if(isRadicals){
      stopAutoplayLoop();
      window.dispatchEvent(new CustomEvent('hanzi:radicals-tab-open'));
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

  async function loadHskSummary(){
    if(!hskState.currentItems.length){
      hskState.levelLoading = true;
    }
    if(hskState.summary){
      normalizeHskSourceAndLevel();
      renderHskSourceTabs();
      renderHskLevelTabs();
      loadGrammarSummary();
      if(!hskState.currentItems.length){
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
      await loadHskLevel(hskState.currentLevel);
    }catch(err){
      console.warn('Cannot load HSK summary:', err);
      hskState.levelLoading = false;
      hskStatus.textContent = 'Không tải được dữ liệu HSK. Kiểm tra thư mục data/learning/hsk.';
    }
  }

  function renderHskLevelTabs(){
    normalizeHskSourceAndLevel();
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

  async function loadHskLevel(level){
    const normalizedLevel = Number(level) || 1;
    hskState.currentLevel = normalizedLevel;
    hskState.levelLoading = true;
    hskState.topicKey = 'all';
    hskState.wordFilter = 'all';
    normalizeHskSourceAndLevel();
    renderHskSourceTabs();
    renderHskLevelTabs();

    if(hskCache.has(normalizedLevel)){
      const data = hskCache.get(normalizedLevel);
      hskState.currentItems = Array.isArray(data?.items) ? data.items : [];
      normalizeHskSourceAndLevel();
      hskState.levelLoading = false;
      restoreHskModeForCurrentSourceLevel();
      renderHskSourceTabs();
      renderHskLevelTabs();
      renderHskFilters();
      renderHskList();
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
      renderHskSourceTabs();
      renderHskLevelTabs();
      renderHskFilters();
      renderHskList();
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


  const HSK_LIBRARY_PRIORITY = ['hsk', 'new_hsk', 'yct', 'boya'];
  const HSK_LIBRARY_LABELS = {
    new_hsk: 'New HSK 9 cấp',
    hsk: 'HSK 6 cấp',
    yct: 'YCT',
    boya: 'Boya'
  };
  const HSK_LEVEL_LABEL_PREFIX = {
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
    const sourceSet = new Set();
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
      return `
        <button type="button" class="hsk-source-btn ${active ? 'active' : ''} ${partialCount ? 'is-partial' : ''}" data-hsk-source="${escapeHtml(key)}" aria-pressed="${active}" title="${escapeHtml(partialCount ? 'Có cấp dữ liệu chưa đủ' : '')}">
          <strong>${escapeHtml(getHskSourceLabel(key))}</strong>
          <small>${levelCount ? `${levelCount} ${unit}` : 'Đang tải'}${grammarCount ? ` · ${grammarCount} có ngữ pháp` : ''}</small>
        </button>
      `;
    }).join('');
  }

  function getHskSourceLevelUnit(sourceKey = hskState.sourceKey){
    if(sourceKey === 'boya') return 'quyển';
    return 'cấp';
  }

  function getHskLevelCountText(levelRow, meta = null){
    const count = Number(levelRow?.count || meta?.uniqueItemCount || 0);
    if(count > 0){
      return `${count.toLocaleString('vi-VN')} từ`;
    }
    const grammarTotal = Number(levelRow?.grammarTotal || meta?.grammarTotal || 0);
    if(grammarTotal > 0){
      return `${grammarTotal.toLocaleString('vi-VN')} ngữ pháp`;
    }
    return '0 mục';
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
    hskGroupModes.innerHTML = rows.map(row => {
      const active = row.mode === hskState.groupMode;
      return `
        <button type="button" class="hsk-route-tab hsk-route-tab--${escapeHtml(row.tone)} ${active ? 'active' : ''}" data-hsk-group-mode="${escapeHtml(row.mode)}" aria-pressed="${active}">
          <span>${escapeHtml(row.label)}</span>
          <small>${Number(row.count || 0).toLocaleString('vi-VN')}</small>
        </button>
      `;
    }).join('');
  }

  function filterItemsByWordFilter(items){
    const filter = hskState.wordFilter || 'all';
    if(filter === 'char1') return items.filter(item => getItemCharCount(item) === 1);
    if(filter === 'char2') return items.filter(item => getItemCharCount(item) === 2);
    if(filter === 'char3plus') return items.filter(item => getItemCharCount(item) >= 3);
    return items;
  }

  function renderHskWordFilters(items = []){
    const rows = [
      ['all', 'Tất cả', items.length],
      ['char1', '1 chữ', items.filter(item => getItemCharCount(item) === 1).length],
      ['char2', '2 chữ', items.filter(item => getItemCharCount(item) === 2).length],
      ['char3plus', '3+ chữ', items.filter(item => getItemCharCount(item) >= 3).length]
    ];
    return `
      <div class="hsk-word-filter-row" role="group" aria-label="Lọc số chữ trong bài hoặc chủ đề">
        ${rows.map(([key, label, count]) => `
          <button type="button" class="${hskState.wordFilter === key ? 'active' : ''}" data-hsk-word-filter="${escapeHtml(key)}" aria-pressed="${hskState.wordFilter === key}">
            ${escapeHtml(label)} <small>${Number(count || 0).toLocaleString('vi-VN')}</small>
          </button>
        `).join('')}
      </div>
    `;
  }

  function renderHskSelectedSectionControls(){
    if(!hskTopicFilters){
      return;
    }
    const selected = getSelectedLearningSection();
    if(!selected || (hskState.groupMode !== 'lessons' && hskState.groupMode !== 'topics')){
      hskTopicFilters.hidden = true;
      hskTopicFilters.innerHTML = '';
      return;
    }
    hskTopicFilters.hidden = false;
    const sectionType = selected.route?.sectionType === 'topic' ? 'chủ đề' : 'bài học';
    hskTopicFilters.innerHTML = `
      <div class="hsk-selected-section-bar">
        <button type="button" class="hsk-section-back" data-hsk-section-back>← Danh sách ${escapeHtml(sectionType)}</button>
        <div class="hsk-selected-section-title">
          <strong>${escapeHtml(selected.label)}</strong>
          <span>${selected.items.length.toLocaleString('vi-VN')} từ</span>
        </div>
      </div>
      ${renderHskWordFilters(selected.items)}
    `;
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
      return filtered.map(renderHskItem).join('');
    }
    if(!filtered.length){
      return '<p class="hsk-empty">Không tìm thấy từ phù hợp trong mục này.</p>';
    }
    const modeClass = sectionType === 'topic' ? 'topic' : 'lesson';
    return `
      <section class="hsk-section-word-view hsk-section-word-view--${modeClass}">
        <div class="hsk-section-word-list">
          ${filtered.map(renderHskItem).join('')}
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
      <section class="hsk-popup-section">
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
      ${renderPopupDictionaryInfo(item)}
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

  function renderHskItem(item){
    const word = String(item?.word || item?.simplified || '').trim();
    const pinyin = formatPinyin(item?.pinyin);
    const meaning = String(item?.meaningVi || '').trim();
    const route = getPrimarySection(item);
    const charCount = Number(item?.charCount) || getHanziChars(word).length;

    return `
      <article class="hsk-item hsk-item-compact" data-hsk-popup-word="${escapeHtml(word)}" data-copy-text="${escapeHtml(word)}" tabindex="0" role="button" aria-label="Mở chi tiết ${escapeHtml(word)}">
        <div class="hsk-item-main">
          <div class="hsk-word-row">
            <strong class="hsk-word">${escapeHtml(word)}</strong>
            ${pinyin ? `<span class="hsk-pinyin">${escapeHtml(pinyin)}</span>` : ''}
            <span class="hsk-card-actions">
              <button type="button" class="hsk-speak" data-hsk-speak="${escapeHtml(word)}" aria-label="Nghe ${escapeHtml(word)}">🔊</button>
            </span>
          </div>
          ${meaning ? `<p class="hsk-meaning">${escapeHtml(formatSlashMeaning(meaning, 3))}</p>` : '<p class="hsk-meaning is-muted">Chưa có nghĩa tiếng Việt.</p>'}
          <div class="hsk-meta-line">
            ${item?.hsk ? `<span>HSK ${escapeHtml(item.hsk)}</span>` : ''}
            <span>${charCount} chữ</span>
            ${route ? `<span>${escapeHtml(route)}</span>` : ''}
          </div>
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

  function renderGrammarCard(item){
    const grammar = normalizeGrammarItem(item);
    const chapterLabel = grammar.chapter
      ? `BÀI ${String(grammar.chapter).padStart(2, '0')}`
      : 'NGỮ PHÁP';
    const exampleLabel = `${grammar.examples.length.toLocaleString('vi-VN')} ví dụ`;
    return `
      <article class="hsk-item hsk-grammar-item" tabindex="0" data-hsk-grammar-id="${escapeHtml(grammar.id)}" data-copy-text="${escapeHtml(grammar.topic)}">
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
    hskList.innerHTML = items.map(renderGrammarCard).join('');
  }

  function renderGrammarList(){
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

  function renderHskList(){
    renderHskFilters();
    if(hskState.groupMode === 'grammar'){
      renderGrammarList();
      return;
    }
    hskList.classList.remove('hsk-list--grammar');
    const query = normalizeSearchText(hskState.query);
    const searched = hskState.currentItems.filter(item => itemMatchesQuery(item, query));
    const filtered = getFilteredByMode(searched);
    const level = Number(hskState.currentLevel) || 1;
    const groupLabel = getCharGroupLabel(hskState.groupMode);
    const selectedLearningLabel = hskState.topicKey && hskState.topicKey !== 'all' ? getSelectedLearningLabel() : '';
    const baseCount = hskState.currentItems.filter(itemBelongsToSelectedSource).length.toLocaleString('vi-VN');
    const foundCount = filtered.length.toLocaleString('vi-VN');
    const searchText = query ? ` · tìm thấy ${foundCount} / ${baseCount}` : ` · ${foundCount} / ${baseCount}`;
    hskStatus.textContent = `${escapeHtml(getHskSourceLabel())} · ${escapeHtml(getHskLevelLabel(level))}${selectedLearningLabel ? ` · ${escapeHtml(selectedLearningLabel)}` : ''} · ${groupLabel}${searchText} mục.`;

    if((hskState.groupMode === 'lessons' || hskState.groupMode === 'topics') && hskState.topicKey === 'all'){
      const sectionType = hskState.groupMode === 'topics' ? 'topic' : 'lesson';
      hskList.classList.add('hsk-list--topics', 'hsk-list--section-cards');
      hskList.innerHTML = renderHskSectionCards(searched, sectionType);
      return;
    }

    hskList.classList.remove('hsk-list--topics', 'hsk-list--section-cards');
    if(!filtered.length){
      hskList.innerHTML = '<p class="hsk-empty">Không tìm thấy mục phù hợp.</p>';
      return;
    }

    if(hskState.groupMode === 'lessons' || hskState.groupMode === 'topics'){
      hskList.innerHTML = renderSelectedSectionWordList(filtered);
      return;
    }

    hskList.innerHTML = filtered.map(renderHskItem).join('');
  }


  function openHskWord(word){
    const target = getHanziChars(word).join('');
    if(!target){
      return;
    }
    closeHskPopup();
    stopAutoplayLoop();
    els.input.value = target;
    setStudyTab('lookup');
    renderWriters();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  window.openHanziLearningPopup = openHskPopup;
  window.openHanziLookupWord = openHskWord;

  tabLookup.addEventListener('click', () => setStudyTab('lookup'));
  tabHsk.addEventListener('click', () => setStudyTab('hsk'));
  tabRadicals?.addEventListener('click', () => setStudyTab('radicals'));

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
    hskState.topicKey = 'all';
    hskState.wordFilter = 'all';
    normalizeHskSourceAndLevel();
    renderHskSourceTabs();
    renderHskLevelTabs();
    loadHskLevel(hskState.currentLevel);
  });

  levelTabs.addEventListener('click', event => {
    const button = event.target.closest('[data-hsk-level]');
    if(!button){
      return;
    }
    loadHskLevel(button.dataset.hskLevel);
  });

  hskSearch?.addEventListener('input', () => {
    hskState.query = hskSearch.value || '';
    renderHskList();
  });


  hskGroupModes?.addEventListener('click', event => {
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
  });

  hskTopicFilters?.addEventListener('click', event => {
    const backButton = event.target.closest('[data-hsk-section-back]');
    if(backButton){
      event.preventDefault();
      hskState.topicKey = 'all';
      hskState.wordFilter = 'all';
      renderHskFilters();
      renderHskList();
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
    const popup = document.getElementById('hskDetailOverlay');
    if(event.key === 'Escape' && popup && !popup.hidden){
      closeHskPopup();
    }
  });
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


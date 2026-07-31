(() => {
  'use strict';

  const root = document.getElementById('ldsnApp');
  const DATA_URL = 'data/lessons.json?v=20260731-ldsn6';
  const HSK_LOOKUP_URL = '../hanzi-stroke/data/learning/hsk/hsk_flashcard_lookup.json?v=20260731-ldsn5';
  const HSK_EXTERNAL_FLASHCARD_KEY = 'tiengTrung.hsk.externalFlashcard.v1';
  const SETTINGS_KEY = 'tiengTrung.ldsn14.settings.v1';
  const PROGRESS_KEY = 'tiengTrung.ldsn14.progress.v1';
  const TABS = Object.freeze([
    { id: 'learn', label: 'Học' },
    { id: 'practice', label: 'Luyện' },
    { id: 'dialogue', label: 'Hội thoại' },
    { id: 'content', label: 'Nội dung' },
    { id: 'review', label: 'Ôn' }
  ]);
  const JOURNEY = Object.freeze([
    { id: 'warmup', label: 'Khởi động', tab: 'learn', anchor: 'warmup' },
    { id: 'vocabulary', label: 'Từ vựng', tab: 'learn', anchor: 'vocabulary' },
    { id: 'zhvi', label: 'Trung → Việt', tab: 'practice', anchor: 'zhvi' },
    { id: 'dialogue', label: 'Hội thoại', tab: 'dialogue', anchor: 'roleplay' },
    { id: 'grammar', label: 'Ngữ pháp', tab: 'learn', anchor: 'grammar' },
    { id: 'vizh', label: 'Việt → Trung', tab: 'practice', anchor: 'vizh' },
    { id: 'passage', label: 'Đoạn văn', tab: 'practice', anchor: 'passage' },
    { id: 'challenge', label: 'Thử thách', tab: 'practice', anchor: 'challenge' },
    { id: 'review', label: 'Ôn lại', tab: 'review', anchor: 'review' }
  ]);

  let payload = null;
  let currentLesson = null;
  let activeTab = 'learn';
  let contentFilter = 'all';
  let settings = readJson(SETTINGS_KEY, {
    roleplayMode: 'typing',
    vocabViewMode: 'cards',
    vocabPracticeMode: 'mixed',
    vocabModeByLesson: {},
    customVocabByLesson: {},
    roleByLesson: {},
    displayPinyin: true,
    vocabMatchShowPinyin: true,
    flashcard: { mode: 'flashcard', showPinyin: true, autoPlay: false, shuffle: false }
  });
  settings.roleplayMode = settings.roleplayMode === 'ordering' ? 'ordering' : 'typing';
  settings.vocabViewMode = settings.vocabViewMode === 'list' ? 'list' : 'cards';
  settings.vocabPracticeMode = ['mixed', 'hanzi', 'pinyin', 'vi'].includes(settings.vocabPracticeMode) ? settings.vocabPracticeMode : 'mixed';
  settings.vocabModeByLesson = settings.vocabModeByLesson || {};
  settings.customVocabByLesson = settings.customVocabByLesson || {};
  settings.roleByLesson = settings.roleByLesson || {};
  settings.displayPinyin = settings.displayPinyin !== false;
  settings.vocabMatchShowPinyin = settings.vocabMatchShowPinyin !== false;
  settings.flashcard = settings.flashcard && typeof settings.flashcard === 'object' ? settings.flashcard : {};
  settings.flashcard.mode = ['flashcard', 'reverse', 'listening', 'typing', 'mixed'].includes(settings.flashcard.mode) ? settings.flashcard.mode : 'flashcard';
  settings.flashcard.showPinyin = settings.flashcard.showPinyin !== false;
  settings.flashcard.autoPlay = Boolean(settings.flashcard.autoPlay);
  settings.flashcard.shuffle = Boolean(settings.flashcard.shuffle);
  let progress = readJson(PROGRESS_KEY, {});
  let wordDetailLookupPromise = null;
  let activeWordDetail = null;
  let sharedWordDetailFrameReady = false;
  let pendingWordDetailPayload = null;
  let flashcardSession = null;
  let vocabMatchSession = null;

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value && typeof value === 'object' ? value : fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_error) {}
  }

  function saveSettings() { writeJson(SETTINGS_KEY, settings); }
  function saveProgress() { writeJson(PROGRESS_KEY, progress); }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function attr(value) { return esc(value).replace(/\n/g, '&#10;'); }
  function lessonUrl(number, tab = '') {
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('lesson', String(number));
    if (tab) url.searchParams.set('tab', tab);
    return url.pathname + url.search;
  }

  function courseUrl() {
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    return url.pathname;
  }


  function lookupUrl(word) {
    const lookup = new URL('../lookup/index.html', location.href);
    lookup.searchParams.set('q', word.hanzi || '');
    const returnUrl = new URL(lessonUrl(currentLesson.lessonNumber, activeTab), location.href);
    returnUrl.searchParams.set('focusVocab', word.id || '');
    if (activeTab === 'content') returnUrl.searchParams.set('content', 'vocabulary');
    lookup.searchParams.set('return', `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`);
    lookup.searchParams.set('returnLabel', `Từ vựng · Bài ${currentLesson.lessonNumber}`);
    return `${lookup.pathname}${lookup.search}`;
  }

  function restoreVocabularyFocus() {
    const params = new URLSearchParams(location.search);
    const wordId = params.get('focusVocab');
    if (!wordId || typeof document.querySelectorAll !== 'function') return;
    requestAnimationFrame(() => {
      const items = Array.from(document.querySelectorAll('[data-vocab-id]') || []);
      const target = items.find(item => item.dataset?.vocabId === wordId);
      if (!target) return;
      target.classList?.add('is-returned');
      target.scrollIntoView?.({ behavior: 'smooth', block: 'center', inline: 'center' });
      window.setTimeout?.(() => target.classList?.remove('is-returned'), 1800);
      try {
        const cleanUrl = new URL(location.href);
        cleanUrl.searchParams.delete('focusVocab');
        history.replaceState(history.state, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
      } catch (_error) {}
    });
  }

  function getLessonState(lessonId) {
    if (!progress[lessonId]) progress[lessonId] = { journey: {}, ratings: {}, updatedAt: '' };
    return progress[lessonId];
  }

  function markJourney(stepId, done = true) {
    if (!currentLesson) return;
    const state = getLessonState(currentLesson.id);
    state.journey[stepId] = done ? 'done' : '';
    state.updatedAt = new Date().toISOString();
    saveProgress();
  }

  function itemMeta(type, item, extra = {}) {
    return {
      type,
      lessonId: currentLesson.id,
      lessonNumber: currentLesson.lessonNumber,
      lessonTitle: currentLesson.title.vi,
      hanzi: item.hanzi || '',
      pinyin: item.pinyin || '',
      vi: item.vi || '',
      title: extra.title || item.label || item.title || '',
      ...extra
    };
  }

  function rateItem(itemKey, rating, meta) {
    const state = getLessonState(currentLesson.id);
    state.ratings[itemKey] = {
      rating,
      meta,
      updatedAt: new Date().toISOString()
    };
    state.updatedAt = new Date().toISOString();
    if (rating === 'easy' && itemKey.startsWith('vocab:')) {
      const session = getSessionVocabulary(currentLesson);
      const rated = session.filter(word => state.ratings[`vocab:${word.id}`]).length;
      if (rated >= Math.min(session.length, 5)) state.journey.vocabulary = 'done';
    }
    saveProgress();
  }

  function lessonPercent(lesson) {
    const state = getLessonState(lesson.id);
    const done = JOURNEY.filter(step => state.journey[step.id] === 'done').length;
    return Math.round((done / JOURNEY.length) * 100);
  }

  function nextJourneyStep(lesson) {
    const state = getLessonState(lesson.id);
    return JOURNEY.find(step => state.journey[step.id] !== 'done') || JOURNEY[JOURNEY.length - 1];
  }

  function audioButton(text, label = 'Nghe phát âm') {
    if (!text) return '';
    return `<button class="ldsn-icon-btn" type="button" data-speak="${attr(text)}" aria-label="${esc(label)}" title="${esc(label)}">🔊</button>`;
  }

  function pinyinHtml(value, tag = 'div', extraClass = '') {
    if (!value) return '';
    const className = ['ldsn-pinyin', extraClass].filter(Boolean).join(' ');
    return `<${tag} class="${className}" data-pinyin>${esc(value)}</${tag}>`;
  }

  function pinyinStatusLabel() {
    return settings.displayPinyin !== false ? 'Hiện pinyin' : 'Ẩn pinyin';
  }

  function pinyinStatusHtml() {
    return `<span data-pinyin-status>${pinyinStatusLabel()}</span>`;
  }

  function pinyinToggleButton(label = 'Pinyin') {
    const visible = settings.displayPinyin !== false;
    return `<button class="ldsn-pinyin-toggle ui-pinyin-toggle${visible ? ' is-active' : ''}" type="button" data-toggle-pinyin aria-pressed="${visible}" title="${visible ? 'Ẩn' : 'Hiện'} pinyin"><span class="ldsn-pinyin-toggle-mark ui-pinyin-toggle__mark" aria-hidden="true"></span><span class="ldsn-sr-only" data-pinyin-label>${visible ? 'Ẩn' : 'Hiện'} ${esc(label)}</span></button>`;
  }

  function applyPinyinVisibility() {
    const visible = settings.displayPinyin !== false;
    root.classList?.toggle('is-pinyin-hidden', !visible);
    root.querySelectorAll?.('[data-toggle-pinyin]').forEach(button => {
      button.classList?.toggle('is-active', visible);
      button.setAttribute?.('aria-pressed', String(visible));
      button.setAttribute?.('title', `${visible ? 'Ẩn' : 'Hiện'} pinyin`);
      const label = button.querySelector?.('[data-pinyin-label]');
      if (label) label.textContent = `${visible ? 'Ẩn' : 'Hiện'} Pinyin`;
    });
    root.querySelectorAll?.('[data-pinyin-status]').forEach(status => {
      status.textContent = pinyinStatusLabel();
    });
  }

  function ratingButtons(itemKey, meta) {
    const current = getLessonState(currentLesson.id).ratings[itemKey]?.rating || '';
    const encoded = encodeURIComponent(JSON.stringify(meta));
    return `<div class="ldsn-rating-row" data-rating-group="${attr(itemKey)}">
      <button class="ldsn-rating${current === 'easy' ? ' is-active' : ''}" type="button" data-rate="easy" data-item-key="${attr(itemKey)}" data-item-meta="${encoded}">Dễ</button>
      <button class="ldsn-rating${current === 'review' ? ' is-active' : ''}" type="button" data-rate="review" data-item-key="${attr(itemKey)}" data-item-meta="${encoded}">Ôn</button>
      <button class="ldsn-rating${current === 'hard' ? ' is-active' : ''}" type="button" data-rate="hard" data-item-key="${attr(itemKey)}" data-item-meta="${encoded}">Khó</button>
    </div>`;
  }

  function getWordById(wordId) {
    return currentLesson?.vocabulary?.find(word => word.id === wordId) || null;
  }

  function ensureWordDetailOverlay() {
    let overlay = document.getElementById('ldsnWordDetailOverlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'ldsnWordDetailOverlay';
    overlay.className = 'ldsn-word-popup-overlay';
    overlay.hidden = true;
    overlay.innerHTML = '<section class="ldsn-word-popup" role="dialog" aria-modal="true" aria-label="Chi tiết từ vựng"><div id="ldsnWordDetailBody"></div></section>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target.closest('[data-word-popup-close], [data-word-popup-back]')) {
        closeWordDetail();
        return;
      }
      const speakButton = event.target.closest('[data-word-popup-speak]');
      if (speakButton) {
        speak(speakButton.dataset.wordPopupSpeak || '', speakButton);
      }
    });
    return overlay;
  }

  function loadWordDetailLookup() {
    if (!wordDetailLookupPromise) {
      wordDetailLookupPromise = fetch(HSK_LOOKUP_URL, { cache: 'force-cache' })
        .then(response => response.ok ? response.json() : null)
        .then(data => data?.items || {})
        .catch(() => ({}));
    }
    return wordDetailLookupPromise;
  }

  function lessonSentenceRows(word) {
    if (!currentLesson || !word?.hanzi) return [];
    const rows = [
      ...currentLesson.translation.zhVi.questions,
      ...currentLesson.translation.zhVi.answers,
      ...currentLesson.translation.viZh.questions,
      ...currentLesson.translation.viZh.answers,
      ...currentLesson.dialogue,
      ...currentLesson.passage.sentences
    ];
    const seen = new Set();
    return rows.filter(row => {
      if (!row?.hanzi || !row.hanzi.includes(word.hanzi) || seen.has(row.hanzi)) return false;
      seen.add(row.hanzi);
      return true;
    }).slice(0, 5);
  }

  function lessonRelatedWords(word) {
    const chars = new Set(Array.from(word?.hanzi || ''));
    return (currentLesson?.vocabulary || [])
      .filter(row => row.id !== word.id && Array.from(row.hanzi || '').some(char => chars.has(char)))
      .slice(0, 8);
  }

  function renderWordDetailPopup(word, lookupItems = {}) {
    const overlay = ensureWordDetailOverlay();
    const body = overlay.querySelector('#ldsnWordDetailBody');
    const exact = lookupItems[word.hanzi] || {};
    const chars = Array.from(word.hanzi || '').map(char => {
      const local = currentLesson?.vocabulary?.find(row => row.hanzi === char) || {};
      const found = lookupItems[char] || {};
      return {
        hanzi: char,
        pinyin: found.pinyin || local.pinyin || '',
        vi: found.meaningVi || local.vi || 'Chưa có nghĩa riêng trong dữ liệu local.',
        hanViet: local.hanViet || ''
      };
    });
    const sentences = lessonSentenceRows(word);
    const related = lessonRelatedWords(word);
    const pinyin = word.pinyin || exact.pinyin || '';
    const meaning = word.vi || exact.meaningVi || '';
    body.innerHTML = `
      <div class="ldsn-word-popup-topbar">
        <button type="button" class="ldsn-word-popup-back" data-word-popup-back>← Quay lại bài</button>
        <button type="button" class="ldsn-word-popup-close" data-word-popup-close aria-label="Đóng">×</button>
      </div>
      <section class="ldsn-word-popup-hero">
        <div><h2>${esc(word.hanzi)}</h2><strong>${esc(pinyin)}</strong><p>${esc(meaning)}</p>${word.wordClass || word.hanViet ? `<small>${esc(word.wordClass || 'từ vựng')}${word.hanViet ? ` · Hán Việt: ${esc(word.hanViet)}` : ''}</small>` : ''}</div>
        <button type="button" class="ldsn-word-popup-speaker" data-word-popup-speak="${attr(word.hanzi)}" aria-label="Nghe ${esc(word.hanzi)}">🔊</button>
      </section>
      ${chars.length > 1 ? `<section class="ldsn-word-popup-section ldsn-word-popup-chars"><h3>Từng chữ trong từ</h3><div class="ldsn-word-char-grid">${chars.map(row => `<article><b>${esc(row.hanzi)}</b><strong>${esc(row.pinyin)}</strong><p>${esc(row.vi)}</p>${row.hanViet ? `<small>Hán Việt: ${esc(row.hanViet)}</small>` : ''}</article>`).join('')}</div></section>` : ''}
      ${sentences.length ? `<section class="ldsn-word-popup-section"><h3>Câu trong bài</h3><div class="ldsn-word-popup-list">${sentences.map(row => `<article><div><b>${esc(row.hanzi)}</b><small>${esc(row.pinyin || '')}</small><p>${esc(row.vi || '')}</p></div><button type="button" data-word-popup-speak="${attr(row.hanzi)}" aria-label="Nghe câu">🔊</button></article>`).join('')}</div></section>` : ''}
      ${related.length ? `<section class="ldsn-word-popup-section ldsn-word-popup-related"><h3>Từ liên quan trong bài</h3><div class="ldsn-word-popup-list">${related.map(row => `<article><div><b>${esc(row.hanzi)} <em>${esc(row.pinyin)}</em></b><p>${esc(row.vi)}</p></div><button type="button" data-word-popup-speak="${attr(row.hanzi)}" aria-label="Nghe ${esc(row.hanzi)}">🔊</button></article>`).join('')}</div></section>` : ''}
    `;
    overlay.hidden = false;
    document.body.classList.add('ldsn-modal-open');
  }

  function buildWordDetailSeed(word) {
    return {
      pinyin: word.pinyin || '',
      meaningVi: word.vi || '',
      sampleSentences: lessonSentenceRows(word).map(row => ({ zh: row.hanzi || '', pinyin: row.pinyin || '', vi: row.vi || '' })),
      relatedWords: lessonRelatedWords(word).map(row => ({ word: row.hanzi || '', pinyin: row.pinyin || '', meaningVi: row.vi || '' }))
    };
  }

  function renderSharedWordPreview(word) {
    const sentences = lessonSentenceRows(word);
    const related = lessonRelatedWords(word);
    return `
      <div class="ldsn-word-popup-topbar">
        <button type="button" class="ldsn-word-popup-back" data-word-popup-back>← Quay lại bài</button>
        <button type="button" class="ldsn-word-popup-close" data-word-popup-close aria-label="Đóng">×</button>
      </div>
      <section class="ldsn-word-popup-hero">
        <div><h2>${esc(word.hanzi)}</h2><strong>${esc(word.pinyin || '')}</strong><p>${esc(word.vi || '')}</p>${word.wordClass || word.hanViet ? `<small>${esc(word.wordClass || 'từ vựng')}${word.hanViet ? ` · Hán Việt: ${esc(word.hanViet)}` : ''}</small>` : ''}</div>
        <button type="button" class="ldsn-word-popup-speaker" data-word-popup-speak="${attr(word.hanzi)}" aria-label="Nghe ${esc(word.hanzi)}">🔊</button>
      </section>
      ${sentences.length ? `<section class="ldsn-word-popup-section"><h3>Câu trong bài</h3><div class="ldsn-word-popup-list">${sentences.slice(0, 2).map(row => `<article><div><b>${esc(row.hanzi)}</b><small>${esc(row.pinyin || '')}</small><p>${esc(row.vi || '')}</p></div><button type="button" data-word-popup-speak="${attr(row.hanzi)}" aria-label="Nghe câu">🔊</button></article>`).join('')}</div></section>` : ''}
      ${related.length ? `<section class="ldsn-word-popup-section ldsn-word-popup-related"><h3>Từ liên quan trong bài</h3><div class="ldsn-word-popup-list">${related.slice(0, 3).map(row => `<article><div><b>${esc(row.hanzi)} <em>${esc(row.pinyin)}</em></b><p>${esc(row.vi)}</p></div><button type="button" data-word-popup-speak="${attr(row.hanzi)}" aria-label="Nghe ${esc(row.hanzi)}">🔊</button></article>`).join('')}</div></section>` : ''}
      <div class="ldsn-shared-detail-loading" role="status"><span class="ldsn-spinner" aria-hidden="true"></span><span>Đang mở tra cứu và cách viết…</span></div>`;
  }

  function ensureSharedWordDetailFrame() {
    let overlay = document.getElementById('ldsnSharedWordDetail');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'ldsnSharedWordDetail';
    overlay.className = 'ldsn-shared-detail-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `<section class="ldsn-shared-detail-shell" role="dialog" aria-modal="true" aria-label="Chi tiết từ vựng">
      <div id="ldsnSharedWordPreview" class="ldsn-shared-detail-preview"></div>
      <div class="ldsn-shared-detail-frame-host">
        <iframe id="ldsnSharedWordDetailFrame" class="ldsn-shared-detail-frame" title="Chi tiết từ vựng" allow="clipboard-write" hidden></iframe>
      </div>
    </section>`;
    document.body.appendChild(overlay);
    const frame = overlay.querySelector('#ldsnSharedWordDetailFrame');
    frame.addEventListener('load', () => {
      sharedWordDetailFrameReady = true;
      sendSharedWordDetailOpen();
    });
    frame.addEventListener('error', () => {
      if (!activeWordDetail) return;
      overlay.hidden = true;
      renderWordDetailPopup(activeWordDetail, {});
      loadWordDetailLookup().then(items => {
        if (activeWordDetail) renderWordDetailPopup(activeWordDetail, items);
      });
    });
    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target.closest('[data-word-popup-close], [data-word-popup-back]')) {
        closeWordDetail();
        return;
      }
      const speakButton = event.target.closest('[data-word-popup-speak]');
      if (speakButton) speak(speakButton.dataset.wordPopupSpeak || '', speakButton);
    });
    return overlay;
  }

  function sendSharedWordDetailOpen() {
    if (!sharedWordDetailFrameReady || !pendingWordDetailPayload) return;
    const frame = document.getElementById('ldsnSharedWordDetailFrame');
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage({
      type: 'tiengtrung:hsk-popup-open',
      payload: pendingWordDetailPayload
    }, location.origin);
  }

  function openWordDetail(wordId) {
    const word = getWordById(wordId);
    if (!word) return;
    activeWordDetail = word;
    pendingWordDetailPayload = {
      word: word.hanzi,
      seed: buildWordDetailSeed(word),
      returnContext: { type: 'external', label: `Quay lại Bài ${currentLesson.lessonNumber}` }
    };

    const overlay = ensureSharedWordDetailFrame();
    const preview = overlay.querySelector('#ldsnSharedWordPreview');
    const frame = overlay.querySelector('#ldsnSharedWordDetailFrame');
    if (preview) {
      preview.hidden = false;
      preview.innerHTML = renderSharedWordPreview(word);
    }
    if (frame) frame.hidden = true;
    overlay.hidden = false;
    document.body.classList.add('ldsn-modal-open');

    if (frame && frame.dataset.initialized !== 'true') {
      frame.dataset.initialized = 'true';
      frame.src = '../hanzi-stroke/index.html?embedPopup=1&popupHost=1';
      return;
    }
    sendSharedWordDetailOpen();
  }

  function revealSharedWordDetail(word) {
    if (!activeWordDetail || (word && word !== activeWordDetail.hanzi)) return;
    const overlay = document.getElementById('ldsnSharedWordDetail');
    if (!overlay || overlay.hidden) return;
    const preview = overlay.querySelector('#ldsnSharedWordPreview');
    const frame = overlay.querySelector('#ldsnSharedWordDetailFrame');
    if (preview) preview.hidden = true;
    if (frame) frame.hidden = false;
  }

  function closeWordDetail() {
    const shared = document.getElementById('ldsnSharedWordDetail');
    if (shared) {
      shared.hidden = true;
      const frame = shared.querySelector('#ldsnSharedWordDetailFrame');
      if (frame) frame.hidden = true;
    }
    const overlay = document.getElementById('ldsnWordDetailOverlay');
    if (overlay) overlay.hidden = true;
    activeWordDetail = null;
    pendingWordDetailPayload = null;
    document.body.classList.remove('ldsn-modal-open');
  }

  function ensureFlashcardOverlay() {
    let overlay = document.getElementById('ldsnFlashcardOverlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'ldsnFlashcardOverlay';
    overlay.className = 'ldsn-flashcard-overlay';
    overlay.hidden = true;
    overlay.innerHTML = '<section class="ldsn-flashcard-sheet" role="dialog" aria-modal="true" aria-label="Học Flashcard"><div id="ldsnFlashcardBody"></div></section>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', handleFlashcardClick);
    overlay.addEventListener('change', handleFlashcardChange);
    return overlay;
  }

  function getFlashcardStudyMode(session) {
    if (session.mode !== 'mixed') return session.mode;
    return ['flashcard', 'reverse', 'listening'][session.index % 3];
  }

  function shuffledCards(cards) {
    const rows = cards.slice();
    for (let i = rows.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [rows[i], rows[j]] = [rows[j], rows[i]];
    }
    return rows;
  }

  function openFlashcards() {
    const cards = getSessionVocabulary(currentLesson).map(word => ({
      id: `${currentLesson.id}:${word.id}`,
      word: word.hanzi,
      pinyin: word.pinyin,
      meaningVi: word.vi,
      source: 'ldsn14',
      lessonId: currentLesson.id
    }));
    if (!cards.length) return;
    const returnUrl = new URL(lessonUrl(currentLesson.lessonNumber, activeTab), location.href);
    returnUrl.searchParams.set('focus', 'vocabulary');
    const payload = {
      version: 1,
      title: `Bài ${currentLesson.lessonNumber} · ${currentLesson.title.vi}`,
      cards,
      origin: 'external',
      contextKey: `ldsn14:${currentLesson.id}`,
      contextLabel: `LDSN1-4 · Bài ${currentLesson.lessonNumber}`,
      returnUrl: `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`
    };
    try {
      sessionStorage.setItem(HSK_EXTERNAL_FLASHCARD_KEY, JSON.stringify(payload));
      const target = new URL('../hanzi-stroke/index.html', location.href);
      target.searchParams.set('externalFlashcards', '1');
      location.href = target.href;
    } catch (_error) {
      // Fallback to the legacy LDSN overlay only when sessionStorage is unavailable.
      flashcardSession = {
        phase: 'setup', cards: getSessionVocabulary(currentLesson), index: 0, revealed: false,
        mode: settings.flashcard.mode, showPinyin: settings.flashcard.showPinyin,
        autoPlay: settings.flashcard.autoPlay, shuffle: settings.flashcard.shuffle,
        results: {}, feedback: ''
      };
      ensureFlashcardOverlay().hidden = false;
      document.body.classList.add('ldsn-modal-open');
      renderFlashcardOverlay();
    }
  }

  function closeFlashcards() {
    const overlay = document.getElementById('ldsnFlashcardOverlay');
    if (overlay) overlay.hidden = true;
    flashcardSession = null;
    document.body.classList.remove('ldsn-modal-open');
  }

  function renderFlashcardSetup(session) {
    const modes = [
      ['flashcard', 'Flashcard', 'Hán tự → lật xem pinyin và nghĩa'],
      ['reverse', 'Đảo ngược', 'Nghĩa Việt → đoán chữ Hán'],
      ['listening', 'Nghe', 'Nghe phát âm → nhớ lại từ và nghĩa'],
      ['typing', 'Gõ Pinyin', 'Nhập đầy đủ pinyin trong một ô'],
      ['mixed', 'Hỗn hợp', 'Flashcard → Đảo ngược → Nghe']
    ];
    return `<div class="ldsn-flashcard-topbar"><button type="button" data-ldsn-flashcard-close>← Quay lại bài</button><button type="button" data-ldsn-flashcard-close aria-label="Đóng">×</button></div>
      <section class="ldsn-flashcard-intro"><small>HỌC FLASHCARD</small><h2>Bài ${currentLesson.lessonNumber} · ${esc(currentLesson.title.vi)}</h2><p>${session.cards.length} thẻ trong phiên</p></section>
      <section class="ldsn-flashcard-setup"><h3>Chọn cách học</h3><div class="ldsn-flashcard-mode-list">${modes.map(([value, title, desc]) => `<button type="button" class="${session.mode === value ? 'is-active' : ''}" data-ldsn-flashcard-mode="${value}"><b>${title}</b><small>${desc}</small></button>`).join('')}</div></section>
      <section class="ldsn-flashcard-options"><label><span><b>Hiện pinyin</b><small>Hiện pinyin sau khi mở đáp án.</small></span><input type="checkbox" data-ldsn-flashcard-option="showPinyin"${session.showPinyin ? ' checked' : ''}></label><label><span><b>Tự phát âm</b><small>Tự đọc từ khi chuyển sang thẻ mới.</small></span><input type="checkbox" data-ldsn-flashcard-option="autoPlay"${session.autoPlay ? ' checked' : ''}></label><label><span><b>Xáo trộn thứ tự</b><small>Trộn bộ thẻ một lần khi bắt đầu.</small></span><input type="checkbox" data-ldsn-flashcard-option="shuffle"${session.shuffle ? ' checked' : ''}></label></section>
      <button type="button" class="ldsn-flashcard-start" data-ldsn-flashcard-start>Bắt đầu học · ${session.cards.length} thẻ</button>`;
  }

  function renderFlashcardStudy(session) {
    const card = session.cards[session.index];
    if (!card) return renderFlashcardComplete(session);
    const mode = getFlashcardStudyMode(session);
    const rating = session.results[card.id] || '';
    let prompt = '';
    let answer = '';
    if (mode === 'reverse') {
      prompt = `<p class="ldsn-flashcard-prompt-label">Nghĩa tiếng Việt</p><h2 class="ldsn-flashcard-meaning-prompt">${esc(card.vi)}</h2>`;
      answer = `<div class="ldsn-flashcard-answer"><strong>${esc(card.hanzi)}</strong>${session.showPinyin ? `<b>${esc(card.pinyin)}</b>` : ''}</div>`;
    } else if (mode === 'listening') {
      prompt = `<p class="ldsn-flashcard-prompt-label">Nghe và nhớ lại</p><button type="button" class="ldsn-flashcard-listen" data-ldsn-flashcard-speak>🔊</button>`;
      answer = `<div class="ldsn-flashcard-answer"><strong>${esc(card.hanzi)}</strong>${session.showPinyin ? `<b>${esc(card.pinyin)}</b>` : ''}<p>${esc(card.vi)}</p></div>`;
    } else if (mode === 'typing') {
      prompt = `<p class="ldsn-flashcard-prompt-label">Gõ pinyin của từ</p><h2>${esc(card.hanzi)}</h2><input class="ldsn-flashcard-typing-input" type="text" data-ldsn-flashcard-typing placeholder="Nhập pinyin..." autocomplete="off"><button type="button" class="ldsn-flashcard-start" data-ldsn-flashcard-check-pinyin>Kiểm tra</button>${session.feedback ? `<div class="ldsn-flashcard-feedback">${esc(session.feedback)}</div>` : ''}`;
      answer = session.revealed ? `<div class="ldsn-flashcard-answer"><b>${esc(card.pinyin)}</b><p>${esc(card.vi)}</p></div>` : '';
    } else {
      prompt = `<p class="ldsn-flashcard-prompt-label">Chữ Hán</p><h2>${esc(card.hanzi)}</h2>`;
      answer = `<div class="ldsn-flashcard-answer">${session.showPinyin ? `<b>${esc(card.pinyin)}</b>` : ''}<p>${esc(card.vi)}</p></div>`;
    }
    return `<div class="ldsn-flashcard-topbar"><button type="button" data-ldsn-flashcard-setup>← Thiết lập</button><span>${session.index + 1}/${session.cards.length}</span><button type="button" data-ldsn-flashcard-close aria-label="Đóng">×</button></div>
      <section class="ldsn-flashcard-study-card ${session.revealed ? 'is-revealed' : ''}">${prompt}${session.revealed ? answer : ''}</section>
      ${mode !== 'typing' && !session.revealed ? '<button type="button" class="ldsn-flashcard-start" data-ldsn-flashcard-reveal>Xem đáp án</button>' : ''}
      ${session.revealed ? `<div class="ldsn-flashcard-rating"><button type="button" class="${rating === 'easy' ? 'is-active' : ''}" data-ldsn-flashcard-rate="easy">Dễ</button><button type="button" class="${rating === 'review' ? 'is-active' : ''}" data-ldsn-flashcard-rate="review">Ôn</button><button type="button" class="${rating === 'hard' ? 'is-active' : ''}" data-ldsn-flashcard-rate="hard">Khó</button></div><div class="ldsn-flashcard-nav"><button type="button" data-ldsn-flashcard-prev${session.index === 0 ? ' disabled' : ''}>← Trước</button><button type="button" data-ldsn-flashcard-next>${session.index === session.cards.length - 1 ? 'Hoàn thành' : 'Tiếp →'}</button></div>` : ''}`;
  }

  function renderFlashcardComplete(session) {
    const values = Object.values(session.results);
    const count = value => values.filter(row => row === value).length;
    return `<div class="ldsn-flashcard-topbar"><button type="button" data-ldsn-flashcard-close>← Quay lại bài</button><button type="button" data-ldsn-flashcard-close aria-label="Đóng">×</button></div><section class="ldsn-flashcard-complete"><small>HOÀN THÀNH</small><h2>${session.cards.length} thẻ</h2><div><span><b>${count('easy')}</b>Dễ</span><span><b>${count('review')}</b>Ôn</span><span><b>${count('hard')}</b>Khó</span></div><button type="button" class="ldsn-flashcard-start" data-ldsn-flashcard-restart>Học lại</button></section>`;
  }

  function renderFlashcardOverlay() {
    const overlay = ensureFlashcardOverlay();
    const body = overlay.querySelector('#ldsnFlashcardBody');
    if (!flashcardSession) return;
    body.innerHTML = flashcardSession.phase === 'setup' ? renderFlashcardSetup(flashcardSession) : flashcardSession.phase === 'complete' ? renderFlashcardComplete(flashcardSession) : renderFlashcardStudy(flashcardSession);
    if (flashcardSession.phase === 'study' && flashcardSession.autoPlay) {
      const card = flashcardSession.cards[flashcardSession.index];
      window.setTimeout(() => speak(card?.hanzi || ''), 120);
    }
  }

  function handleFlashcardChange(event) {
    const option = event.target.closest('[data-ldsn-flashcard-option]');
    if (!option || !flashcardSession) return;
    flashcardSession[option.dataset.ldsnFlashcardOption] = option.checked;
    settings.flashcard[option.dataset.ldsnFlashcardOption] = option.checked;
    saveSettings();
  }

  function handleFlashcardClick(event) {
    if (!flashcardSession) return;
    if (event.target.closest('[data-ldsn-flashcard-close]')) { closeFlashcards(); return; }
    const mode = event.target.closest('[data-ldsn-flashcard-mode]');
    if (mode) {
      flashcardSession.mode = mode.dataset.ldsnFlashcardMode;
      settings.flashcard.mode = flashcardSession.mode;
      saveSettings();
      renderFlashcardOverlay();
      return;
    }
    if (event.target.closest('[data-ldsn-flashcard-restart]')) { flashcardSession.phase = 'setup'; flashcardSession.index = 0; flashcardSession.revealed = false; flashcardSession.results = {}; flashcardSession.feedback = ''; renderFlashcardOverlay(); return; }
    if (event.target.closest('[data-ldsn-flashcard-start]')) {
      flashcardSession.cards = flashcardSession.shuffle ? shuffledCards(flashcardSession.cards) : flashcardSession.cards.slice();
      flashcardSession.phase = 'study'; flashcardSession.index = 0; flashcardSession.revealed = false;
      renderFlashcardOverlay(); return;
    }
    if (event.target.closest('[data-ldsn-flashcard-setup]')) { flashcardSession.phase = 'setup'; flashcardSession.revealed = false; renderFlashcardOverlay(); return; }
    if (event.target.closest('[data-ldsn-flashcard-speak]')) { speak(flashcardSession.cards[flashcardSession.index]?.hanzi || '', event.target.closest('button')); return; }
    if (event.target.closest('[data-ldsn-flashcard-reveal]')) { flashcardSession.revealed = true; renderFlashcardOverlay(); return; }
    if (event.target.closest('[data-ldsn-flashcard-check-pinyin]')) {
      const input = event.currentTarget.querySelector('[data-ldsn-flashcard-typing]');
      const card = flashcardSession.cards[flashcardSession.index];
      const correct = normalizeLatin(input?.value || '') === normalizeLatin(card?.pinyin || '');
      flashcardSession.feedback = correct ? 'Chính xác.' : `Đáp án: ${card.pinyin}`;
      flashcardSession.revealed = true;
      renderFlashcardOverlay();
      return;
    }
    const rate = event.target.closest('[data-ldsn-flashcard-rate]');
    if (rate) {
      const card = flashcardSession.cards[flashcardSession.index];
      flashcardSession.results[card.id] = rate.dataset.ldsnFlashcardRate;
      rateItem(`vocab:${card.id}`, rate.dataset.ldsnFlashcardRate, itemMeta('vocabulary', card));
      renderFlashcardOverlay(); return;
    }
    if (event.target.closest('[data-ldsn-flashcard-prev]')) { flashcardSession.index = Math.max(0, flashcardSession.index - 1); flashcardSession.revealed = false; flashcardSession.feedback = ''; renderFlashcardOverlay(); return; }
    if (event.target.closest('[data-ldsn-flashcard-next]')) {
      if (flashcardSession.index >= flashcardSession.cards.length - 1) flashcardSession.phase = 'complete';
      else { flashcardSession.index += 1; flashcardSession.revealed = false; flashcardSession.feedback = ''; }
      renderFlashcardOverlay(); return;
    }
  }

  function setBreadcrumb() {
    if (!window.TiengTrungAppShell) return;
    if (!currentLesson) {
      window.TiengTrungAppShell.setBreadcrumb([
        { label: 'Học', href: window.TiengTrungAppShell.routes.learn },
        { label: 'LDSN1-4', current: true }
      ]);
      return;
    }
    window.TiengTrungAppShell.setBreadcrumb([
      { label: 'Học', href: window.TiengTrungAppShell.routes.learn },
      { label: 'LDSN1-4', href: courseUrl() },
      { label: `Bài ${currentLesson.lessonNumber}`, current: true }
    ]);
  }

  function recordLocation() {
    if (!window.TiengTrungLearningHistory) return;
    const item = currentLesson
      ? {
          id: `ldsn14|${currentLesson.id}`,
          type: 'curriculum',
          icon: '译',
          title: `LDSN1-4 · Bài ${currentLesson.lessonNumber}`,
          subtitle: currentLesson.title.vi,
          url: lessonUrl(currentLesson.lessonNumber, activeTab),
          updatedAt: new Date().toISOString()
        }
      : {
          id: 'ldsn14',
          type: 'curriculum',
          icon: '译',
          title: 'LDSN1-4',
          subtitle: '10 bài luyện dịch song ngữ',
          url: courseUrl(),
          updatedAt: new Date().toISOString()
        };
    window.TiengTrungLearningHistory.record(item);
  }

  function renderCourse() {
    currentLesson = null;
    document.title = 'LDSN1-4 · Luyện dịch song ngữ';
    const totalVocab = payload.lessons.reduce((sum, lesson) => sum + lesson.counts.vocabulary, 0);
    const totalDialogue = payload.lessons.reduce((sum, lesson) => sum + lesson.counts.dialogue, 0);
    root.innerHTML = `<div class="ldsn-stack">
      <section class="ldsn-card ldsn-course-hero">
        <p class="ldsn-kicker">Giáo trình luyện dịch</p>
        <h1 class="ldsn-title">LDSN1-4</h1>
        <p class="ldsn-subtitle">Nhìn → Nhớ → Dùng → Nghe → Phản xạ → Tự diễn đạt → Ôn lại.</p>
        <div class="ldsn-course-stats" aria-label="Thống kê khóa học">
          <div class="ldsn-stat"><strong>${payload.lessons.length}</strong><small>Bài học</small></div>
          <div class="ldsn-stat"><strong>${totalVocab}</strong><small>Từ vựng</small></div>
          <div class="ldsn-stat"><strong>${totalDialogue}</strong><small>Lượt thoại</small></div>
        </div>
      </section>
      <section>
        <div class="ldsn-section-head"><div><h2>10 bài học</h2><p>Mỗi bài có Học · Luyện · Hội thoại · Nội dung · Ôn.</p></div></div>
        <div class="ldsn-lesson-grid">${payload.lessons.map(renderLessonCard).join('')}</div>
      </section>
    </div>`;
    applyPinyinVisibility();
    setBreadcrumb();
    recordLocation();
  }

  function renderLessonCard(lesson) {
    const percent = lessonPercent(lesson);
    const state = getLessonState(lesson.id);
    const reviewCount = Object.values(state.ratings || {}).filter(row => ['review', 'hard'].includes(row.rating)).length;
    return `<a class="ldsn-lesson-card" href="${lessonUrl(lesson.lessonNumber)}">
      <span class="ldsn-lesson-no">${lesson.lessonNumber}</span>
      <span class="ldsn-lesson-copy">
        <strong>${esc(lesson.title.vi)}</strong>
        <span class="ldsn-hanzi">${esc(lesson.title.hanzi)}</span>
        <small>${lesson.counts.vocabulary} từ · ${lesson.counts.dialogue} lượt thoại${reviewCount ? ` · ${reviewCount} cần ôn` : ''}</small>
        <span class="ldsn-progress-line"><span style="width:${percent}%"></span></span>
      </span>
      <span class="ldsn-arrow" aria-hidden="true">›</span>
    </a>`;
  }

  function renderLesson() {
    document.title = `Bài ${currentLesson.lessonNumber} · ${currentLesson.title.vi} · LDSN1-4`;
    const percent = lessonPercent(currentLesson);
    const next = nextJourneyStep(currentLesson);
    const state = getLessonState(currentLesson.id);
    state.updatedAt = new Date().toISOString();
    saveProgress();
    root.innerHTML = `<div class="ldsn-stack">
      <section class="ldsn-card ldsn-lesson-hero ldsn-lesson-hero--compact">
        <div class="ldsn-lesson-meta-row"><a class="ldsn-back-link" href="${courseUrl()}">‹ 10 bài</a><span>Bài ${currentLesson.lessonNumber} · ${percent}%</span>${audioButton(currentLesson.title.hanzi, 'Nghe tên bài')}</div>
        <div class="ldsn-lesson-heading ldsn-lesson-heading--compact">
          <div><h1>${esc(currentLesson.title.vi)}</h1><p class="ldsn-lesson-language"><span class="ldsn-hanzi">${esc(currentLesson.title.hanzi)}</span>${pinyinHtml(currentLesson.title.pinyin, 'span')}</p></div>
        </div>
        <div class="ldsn-next-row"><span><small>Tiếp theo</small><strong>${esc(next.label)}</strong></span><button class="ldsn-primary-btn" type="button" data-journey="${next.id}">Tiếp tục</button></div>
      </section>
      <section class="ldsn-card ldsn-pad ldsn-journey-card" aria-label="Hành trình bài học">
        <div class="ldsn-journey-heading"><strong>Hành trình</strong><small>Chạm để mở nhanh</small></div>
        <div class="ldsn-journey">${renderJourney()}</div>
      </section>
      <div class="ldsn-tabs-wrap">
        <nav class="ldsn-tabs" aria-label="Nội dung bài học">${TABS.map(tab => `<button class="ldsn-tab${tab.id === activeTab ? ' is-active' : ''}" type="button" data-tab="${tab.id}" aria-current="${tab.id === activeTab ? 'page' : 'false'}">${tab.label}</button>`).join('')}</nav>
      </div>
      <section id="ldsnPanel" class="ldsn-panel" data-active-tab="${activeTab}">${renderActivePanel()}</section>
    </div>`;
    applyPinyinVisibility();
    setBreadcrumb();
    recordLocation();
  }

  function renderJourney() {
    const state = getLessonState(currentLesson.id);
    const next = nextJourneyStep(currentLesson).id;
    return JOURNEY.map((step, index) => {
      const done = state.journey[step.id] === 'done';
      const current = step.id === next;
      return `<button class="ldsn-journey-step${done ? ' is-done' : ''}${current ? ' is-current' : ''}" type="button" data-journey="${step.id}"><span>${done ? '✓' : index + 1}</span><strong>${esc(step.label)}</strong></button>`;
    }).join('');
  }

  function renderActivePanel() {
    if (activeTab === 'practice') return renderPractice();
    if (activeTab === 'dialogue') return renderDialogue();
    if (activeTab === 'content') return renderContent();
    if (activeTab === 'review') return renderReview();
    return renderLearn();
  }

  function renderLearn() {
    const sampleWords = currentLesson.vocabulary.slice(0, 3);
    const firstDialogue = currentLesson.dialogue[0] || {};
    const session = getSessionVocabulary(currentLesson);
    const viewMode = settings.vocabViewMode === 'list' ? 'list' : 'cards';
    return `<section id="vocabulary" class="ldsn-card ldsn-pad ldsn-section ldsn-section--vocab">
      <div class="ldsn-compact-section-head">
        <div><p class="ldsn-kicker">Vườn từ vựng</p><h2>Từ vựng · ${session.length}/${currentLesson.vocabulary.length}</h2><p>Chạm vào từ để xem chi tiết.</p></div>
        <div class="ldsn-compact-actions">${pinyinToggleButton()}<button class="ldsn-settings-shortcut" type="button" data-open-nearest-settings aria-label="Mở cài đặt từ vựng">⚙</button></div>
      </div>
      <div class="ldsn-vocab-toolbar"><div class="ldsn-view-switch" aria-label="Kiểu hiển thị từ vựng"><button class="ldsn-view-btn${viewMode === 'cards' ? ' is-active' : ''}" type="button" data-vocab-view="cards" aria-pressed="${viewMode === 'cards'}">Thẻ</button><button class="ldsn-view-btn${viewMode === 'list' ? ' is-active' : ''}" type="button" data-vocab-view="list" aria-pressed="${viewMode === 'list'}">Danh sách</button></div><button class="ldsn-flashcard-launch ldsn-flashcard-launch--compact" type="button" data-open-flashcards><span>🎓</span><strong>Flashcard</strong><small>${session.length} thẻ</small></button></div>
      ${renderVocabularySettings()}
      ${viewMode === 'list' ? renderVocabularyList(session) : `<div class="ldsn-vocab-grid">${session.map(renderVocabularyCard).join('')}</div>`}
    </section>
    <section id="warmup" class="ldsn-card ldsn-pad ldsn-section ldsn-section--warmup">
      <div class="ldsn-inline-head"><div><p class="ldsn-kicker">Khởi động</p><h2>Nhìn chủ đề trước khi học</h2></div></div>
      <div class="ldsn-meta">${sampleWords.map(word => `<span class="ldsn-hanzi">${esc(word.hanzi)}</span>`).join('')}</div>
      ${firstDialogue.hanzi ? `<div class="ldsn-layer ldsn-layer--mint"><div class="ldsn-inline-head"><span class="ldsn-hanzi">${esc(firstDialogue.hanzi)}</span>${audioButton(firstDialogue.hanzi)}</div><small>Nghe trước, sau đó mới xem nghĩa trong tab Nội dung.</small></div>` : ''}
      <div class="ldsn-actions"><button class="ldsn-secondary-btn" type="button" data-mark-step="warmup">Đã khởi động</button></div>
    </section>
    <section id="grammar" class="ldsn-card ldsn-pad ldsn-section ldsn-section--grammar">
      <div class="ldsn-compact-section-head"><div><p class="ldsn-kicker">Khám phá ngữ pháp</p><h2>Ngữ pháp từ câu thật</h2><p>Mỗi cách dùng đi cùng đúng ví dụ.</p></div>${pinyinToggleButton('pinyin ngữ pháp')}</div>
      <div class="ldsn-grammar-list">${currentLesson.grammar.slice(0, 5).map(renderGrammarCard).join('')}</div>
      <div class="ldsn-actions"><button class="ldsn-secondary-btn" type="button" data-tab-target="content" data-content-target="grammar">Xem toàn bộ ${currentLesson.grammar.length} điểm ngữ pháp</button><button class="ldsn-ghost-btn" type="button" data-mark-step="grammar">Đã học phần ngữ pháp</button></div>
    </section>`;
  }

  function vocabMode(lesson) {
    return settings.vocabModeByLesson[lesson.id] || 'auto';
  }

  function getSessionVocabulary(lesson) {
    const mode = vocabMode(lesson);
    if (mode === 'all') return lesson.vocabulary;
    if (mode === 'custom') {
      const selected = new Set(settings.customVocabByLesson[lesson.id] || []);
      const list = lesson.vocabulary.filter(word => selected.has(word.id));
      return list.length ? list : lesson.vocabulary.slice(0, Math.min(10, lesson.vocabulary.length));
    }
    const parsed = Number(mode);
    const count = mode === 'auto'
      ? Math.min(10, lesson.vocabulary.length)
      : Math.min(Math.max(Number.isFinite(parsed) ? parsed : 10, 1), lesson.vocabulary.length);
    const state = getLessonState(lesson.id);
    return [...lesson.vocabulary].sort((a, b) => {
      const ar = state.ratings[`vocab:${a.id}`]?.rating || '';
      const br = state.ratings[`vocab:${b.id}`]?.rating || '';
      const rank = { review: 0, '': 1, hard: 2, easy: 3 };
      return rank[ar] - rank[br] || a.order - b.order;
    }).slice(0, count);
  }

  function renderVocabularySettings() {
    const mode = vocabMode(currentLesson);
    const options = [
      ['auto', 'Tự động'], ['5', '5 từ'], ['10', '10 từ'], ['15', '15 từ'], ['20', '20 từ'], ['all', 'Tất cả'], ['custom', 'Tự chọn']
    ];
    const selected = new Set(settings.customVocabByLesson[currentLesson.id] || []);
    const numericMode = /^\d+$/.test(mode) ? Number(mode) : 10;
    const modeLabel = mode === 'auto' ? 'Tự động' : mode === 'all' ? 'Tất cả' : mode === 'custom' ? `${selected.size || 0} từ` : `${mode} từ`;
    return `<details class="ldsn-settings ldsn-compact-settings" data-vocab-settings${mode === 'custom' ? ' open' : ''}>
      <summary><span>⚙ Cài đặt từ vựng</span><small>${modeLabel} · ${pinyinStatusHtml()}</small></summary>
      <div class="ldsn-settings-body">
        <div class="ldsn-setting-block"><strong>Số từ trong phiên</strong><div class="ldsn-choice-grid">${options.map(([value, label]) => `<label class="ldsn-choice"><input type="radio" name="vocabMode" value="${value}" data-vocab-mode${mode === value ? ' checked' : ''}><span>${label}</span></label>`).join('')}</div></div>
        <div class="ldsn-number-setting"><label for="ldsnCustomCount"><strong>Số lượng khác</strong><small>1–${currentLesson.vocabulary.length}</small></label><div class="ldsn-number-control"><input id="ldsnCustomCount" class="ldsn-number-input" type="number" min="1" max="${currentLesson.vocabulary.length}" value="${numericMode}" data-vocab-count-input inputmode="numeric"><button class="ldsn-secondary-btn" type="button" data-apply-vocab-count>Áp dụng</button></div></div>
        <div class="ldsn-setting-row"><span><strong>Hiện pinyin</strong><small>Dùng chung toàn bộ LDSN1-4</small></span>${pinyinToggleButton()}</div>
        <div class="${mode === 'custom' ? '' : 'ldsn-hidden'}" data-custom-vocab-wrap><div class="ldsn-actions"><button class="ldsn-ghost-btn" type="button" data-custom-action="all">Chọn tất cả</button><button class="ldsn-ghost-btn" type="button" data-custom-action="none">Bỏ chọn</button><button class="ldsn-ghost-btn" type="button" data-custom-action="ten">Chọn 10 từ</button><button class="ldsn-ghost-btn" type="button" data-custom-action="weak">Chọn từ yếu</button></div><div class="ldsn-custom-list">${currentLesson.vocabulary.map(word => `<label class="ldsn-custom-word"><input type="checkbox" data-custom-vocab="${word.id}"${selected.has(word.id) ? ' checked' : ''}><span><strong class="ldsn-hanzi">${esc(word.hanzi)}</strong><small>${pinyinHtml(`${word.pinyin} ·`, 'span', 'ldsn-inline-pinyin')}${esc(word.vi)}</small></span></label>`).join('')}</div><button class="ldsn-primary-btn" type="button" data-apply-custom>Áp dụng danh sách đã chọn</button></div>
      </div>
    </details>`;
  }

  function renderVocabularyCard(word) {
    const key = `vocab:${word.id}`;
    return `<article class="ldsn-card ldsn-vocab-card" data-vocab-id="${attr(word.id)}">
      <div class="ldsn-flashcard-top"><span class="ldsn-vocab-kind">Từ vựng</span>${audioButton(word.hanzi, `Nghe ${word.hanzi}`)}</div>
      <button class="ldsn-flashcard-face ldsn-vocab-lookup-link" type="button" data-open-word-detail="${attr(word.id)}" aria-label="Mở chi tiết ${esc(word.hanzi)}">
        <h3>${esc(word.hanzi)}</h3>
        ${pinyinHtml(word.pinyin)}
        <div class="ldsn-meaning">${esc(word.vi)}</div>
        <small class="ldsn-open-detail">Xem chi tiết →</small>
      </button>
      <div class="ldsn-meta"><span>${esc(word.wordClass || 'từ vựng')}</span>${word.hanViet ? `<span>Hán Việt: ${esc(word.hanViet)}</span>` : ''}</div>
      ${ratingButtons(key, itemMeta('vocabulary', word))}
    </article>`;
  }

  function renderVocabularyList(words) {
    return `<div class="ldsn-vocab-list">${words.map(word => {
      const key = `vocab:${word.id}`;
      return `<article class="ldsn-vocab-list-item" data-vocab-id="${attr(word.id)}">
        <div class="ldsn-vocab-list-main">
          <button class="ldsn-vocab-list-link" type="button" data-open-word-detail="${attr(word.id)}" aria-label="Mở chi tiết ${esc(word.hanzi)}">
            <span class="ldsn-vocab-list-hanzi">${esc(word.hanzi)}</span>
            <span class="ldsn-vocab-list-copy">${pinyinHtml(word.pinyin, 'strong')}<span>${esc(word.vi)}</span><small>${esc(word.wordClass || 'từ vựng')}${word.hanViet ? ` · Hán Việt: ${esc(word.hanViet)}` : ''}</small></span>
            <span class="ldsn-vocab-list-arrow" aria-hidden="true">›</span>
          </button>
          ${audioButton(word.hanzi, `Nghe ${word.hanzi}`)}
        </div>
        ${ratingButtons(key, itemMeta('vocabulary', word))}
      </article>`;
    }).join('')}</div>`;
  }
  function renderGrammarExample(example) {
    if (!example?.hanzi) return '';
    return `<article class="ldsn-grammar-example-inline"><div class="ldsn-grammar-example-copy"><div class="ldsn-hanzi">${esc(example.hanzi)}</div>${pinyinHtml(example.pinyin)}<div class="ldsn-meaning">${esc(example.vi || '')}</div></div>${audioButton(example.hanzi, `Nghe ${example.hanzi}`)}</article>`;
  }

  function renderGrammarGroup(group, grammar, groupIndex) {
    const title = String(group?.title || '').trim();
    const notes = (group?.notes || []).filter(Boolean);
    const examples = (group?.examples || []).filter(row => row?.hanzi);
    const normalizedGrammarTitle = String(grammar.title || '').replace(/^\s*\d+(?:\.\d+)*[.)]?\s*/, '').trim();
    const showTitle = title && title !== normalizedGrammarTitle;
    return `<section class="ldsn-grammar-group" data-grammar-group="${groupIndex + 1}">
      ${showTitle ? `<h4>${esc(title)}</h4>` : ''}
      ${group?.structure ? `<div class="ldsn-grammar-structure"><span>Cấu trúc</span><strong>${esc(group.structure)}</strong></div>` : ''}
      ${notes.length ? `<div class="ldsn-grammar-prose">${notes.map(note => `<p>${esc(note)}</p>`).join('')}</div>` : ''}
      ${examples.length ? `<div class="ldsn-grammar-example-list">${examples.map(renderGrammarExample).join('')}</div>` : ''}
    </section>`;
  }

  function renderGrammarCard(grammar) {
    const legacyExamples = (grammar.examples || []).filter(row => row?.hanzi);
    const groups = Array.isArray(grammar.groups) && grammar.groups.length ? grammar.groups : [{ title: grammar.title, notes: grammar.notes || [], structure: grammar.structure || '', examples: legacyExamples }];
    const ratingExample = groups.flatMap(group => group.examples || []).find(row => row?.hanzi) || legacyExamples[0] || {};
    const sourceLabel = grammar.source === 'passage' ? 'Ngữ pháp đoạn văn' : grammar.source === 'dialogue' ? 'Ngữ pháp câu và hội thoại' : 'Ngữ pháp';
    return `<details class="ldsn-card ldsn-grammar-card" data-grammar-id="${attr(grammar.id)}"><summary><span class="ldsn-grammar-icon">法</span><span class="ldsn-grammar-summary"><strong>${esc(grammar.title)}</strong><small>${sourceLabel}</small></span><span class="ldsn-chevron">⌄</span></summary><div class="ldsn-grammar-body">${groups.map((group, index) => renderGrammarGroup(group, grammar, index)).join('')}${ratingButtons(`grammar:${grammar.id}`, itemMeta('grammar', ratingExample, { title: grammar.title }))}</div></details>`;
  }

  function renderPracticeSettings(mode, practiceMode) {
    const practiceModes = [['mixed', 'Hỗn hợp'], ['hanzi', 'Chữ Hán'], ['pinyin', 'Pinyin'], ['vi', 'Tiếng Việt']];
    return `<details class="ldsn-settings ldsn-compact-settings" data-practice-settings><summary><span>⚙ Cài đặt luyện tập</span><small>${mode === 'ordering' ? 'Xếp từ' : 'Gõ câu'} · ${practiceModes.find(row => row[0] === practiceMode)?.[1] || 'Hỗn hợp'} · ${pinyinStatusHtml()}</small></summary><div class="ldsn-settings-body"><div class="ldsn-setting-block"><strong>Cách trả lời tiếng Trung</strong><div class="ldsn-mode-switch"><button class="ldsn-mode-btn${mode === 'typing' ? ' is-active' : ''}" type="button" data-role-mode="typing">Gõ câu</button><button class="ldsn-mode-btn${mode === 'ordering' ? ' is-active' : ''}" type="button" data-role-mode="ordering">Xếp từ</button></div></div><div class="ldsn-setting-block"><strong>Luyện từ vựng</strong><div class="ldsn-mode-switch"><button class="ldsn-mode-btn" type="button" data-start-vocab-match>Nối Hán tự ↔ Nghĩa</button><button class="ldsn-mode-btn${settings.vocabMatchShowPinyin ? ' is-active' : ''}" type="button" data-toggle-match-pinyin>${settings.vocabMatchShowPinyin ? 'Đang hiện pinyin' : 'Đang ẩn pinyin'}</button></div></div><div class="ldsn-setting-block"><strong>Phần cần điền</strong><div class="ldsn-mode-switch ldsn-mode-switch--four">${practiceModes.map(([value, label]) => `<button class="ldsn-mode-btn${practiceMode === value ? ' is-active' : ''}" type="button" data-vocab-practice-mode="${value}">${label}</button>`).join('')}</div></div><div class="ldsn-setting-row"><span><strong>Hiện pinyin</strong><small>Dùng chung toàn bộ LDSN1-4</small></span>${pinyinToggleButton()}</div></div></details>`;
  }

  function shuffledCopy(list) {
    const result = [...(list || [])];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
  }

  function startVocabMatching() {
    const words = getSessionVocabulary(currentLesson).slice(0, Math.min(8, getSessionVocabulary(currentLesson).length));
    vocabMatchSession = {
      words,
      left: shuffledCopy(words),
      right: shuffledCopy(words),
      selectedLeft: '',
      selectedRight: '',
      matched: [],
      wrongPair: []
    };
    renderLesson();
    requestAnimationFrame(() => document.querySelector('[data-vocab-match]')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));
  }

  function renderVocabMatching() {
    const session = vocabMatchSession;
    if (!session) return '';
    const matched = new Set(session.matched);
    return `<section class="ldsn-card ldsn-pad ldsn-section ldsn-vocab-match" data-vocab-match>
      <div class="ldsn-section-head"><div><p class="ldsn-kicker">Nối từ vựng</p><h2>Hán tự ↔ Nghĩa</h2><p>${matched.size}/${session.words.length} cặp đúng</p></div><button class="ldsn-pinyin-toggle ${settings.vocabMatchShowPinyin ? 'is-active' : ''}" type="button" data-toggle-match-pinyin><span class="ldsn-pinyin-toggle-mark"></span><span>Pinyin</span></button></div>
      <div class="ldsn-match-grid">
        <div class="ldsn-match-column">${session.left.map((word) => `<button type="button" class="ldsn-match-card ldsn-match-card--word${session.selectedLeft === word.id ? ' is-selected' : ''}${matched.has(word.id) ? ' is-matched' : ''}${session.wrongPair.includes(word.id) ? ' is-wrong' : ''}" data-match-left="${attr(word.id)}"${matched.has(word.id) ? ' disabled' : ''}><strong class="ldsn-hanzi">${esc(word.hanzi)}</strong>${settings.vocabMatchShowPinyin ? `<small>${esc(word.pinyin)}</small>` : ''}</button>`).join('')}</div>
        <div class="ldsn-match-column">${session.right.map((word) => `<button type="button" class="ldsn-match-card ldsn-match-card--meaning${session.selectedRight === word.id ? ' is-selected' : ''}${matched.has(word.id) ? ' is-matched' : ''}${session.wrongPair.includes(word.id) ? ' is-wrong' : ''}" data-match-right="${attr(word.id)}"${matched.has(word.id) ? ' disabled' : ''}><span>${esc(word.vi)}</span></button>`).join('')}</div>
      </div>
      ${matched.size === session.words.length ? `<div class="ldsn-feedback is-correct">Hoàn thành ${matched.size} cặp. Kết quả đã được lưu.</div>` : ''}
      <button class="ldsn-ghost-btn" type="button" data-restart-vocab-match>Làm lại và xáo trộn</button>
    </section>`;
  }

  function chooseMatch(side, id) {
    if (!vocabMatchSession) return;
    vocabMatchSession.wrongPair = [];
    if (side === 'left') vocabMatchSession.selectedLeft = id;
    else vocabMatchSession.selectedRight = id;
    const left = vocabMatchSession.selectedLeft;
    const right = vocabMatchSession.selectedRight;
    if (!left || !right) { renderLesson(); return; }
    if (left === right) {
      vocabMatchSession.matched.push(left);
      const word = vocabMatchSession.words.find((entry) => entry.id === left);
      rateItem(`vocab:${left}`, 'easy', itemMeta('vocabulary', word || {}));
    } else {
      vocabMatchSession.wrongPair = [left, right];
      const leftWord = vocabMatchSession.words.find((entry) => entry.id === left);
      rateItem(`vocab:${left}`, 'review', itemMeta('vocabulary', leftWord || {}));
    }
    vocabMatchSession.selectedLeft = '';
    vocabMatchSession.selectedRight = '';
    renderLesson();
  }

  function renderPractice() {
    const session = getSessionVocabulary(currentLesson);
    const zhvi = [...currentLesson.translation.zhVi.questions, ...currentLesson.translation.zhVi.answers];
    const vizh = [...currentLesson.translation.viZh.questions, ...currentLesson.translation.viZh.answers];
    const mode = settings.roleplayMode === 'ordering' ? 'ordering' : 'typing';
    const practiceMode = settings.vocabPracticeMode || 'mixed';
    return `<section class="ldsn-card ldsn-pad ldsn-section ldsn-section--practice"><div class="ldsn-compact-section-head"><div><p class="ldsn-kicker">Luyện tập</p><h2>Luyện theo bài</h2><p>Điền từ · dịch câu · đoạn văn</p></div><div class="ldsn-compact-actions">${pinyinToggleButton()}<button class="ldsn-settings-shortcut" type="button" data-open-nearest-settings aria-label="Mở cài đặt luyện tập">⚙</button></div></div>${renderPracticeSettings(mode, practiceMode)}<button class="ldsn-match-launch" type="button" data-start-vocab-match><span>↔</span><strong>Nối từ vựng</strong><small>Hán tự${settings.vocabMatchShowPinyin ? ' + pinyin' : ''} ↔ Nghĩa</small></button></section>
    ${renderVocabMatching()}
    <section id="vocab-fill" class="ldsn-card ldsn-pad ldsn-section ldsn-section--fill"><div class="ldsn-section-head"><div><h2>Điền từ vựng</h2><p>${Math.min(6, session.length)} từ trong nhóm đã chọn.</p></div></div><div class="ldsn-exercise-list">${session.slice(0, 6).map(renderVocabFill).join('')}</div></section>
    <section id="zhvi" class="ldsn-card ldsn-pad ldsn-section ldsn-section--sentence"><div class="ldsn-section-head"><div><h2>Dịch Trung → Việt</h2><p>3 câu hỏi và 3 câu trả lời.</p></div>${pinyinToggleButton()}</div><div class="ldsn-exercise-list">${zhvi.map((item, index) => renderTranslationExercise(item, 'zhvi', index)).join('')}</div><button class="ldsn-ghost-btn" type="button" data-mark-step="zhvi">Đã hoàn thành phần Trung → Việt</button></section>
    <section id="vizh" class="ldsn-card ldsn-pad ldsn-section ldsn-section--reverse"><div class="ldsn-section-head"><div><h2>Dịch Việt → Trung</h2><p>${mode === 'ordering' ? 'Chọn các từ theo đúng thứ tự.' : 'Tự gõ chữ Hán, sau đó so sánh đáp án.'}</p></div>${pinyinToggleButton()}</div><div class="ldsn-exercise-list">${vizh.map((item, index) => renderTranslationExercise(item, 'vizh', index)).join('')}</div><button class="ldsn-ghost-btn" type="button" data-mark-step="vizh">Đã hoàn thành phần Việt → Trung</button></section>
    <section id="passage" class="ldsn-card ldsn-pad ldsn-section ldsn-section--passage"><div class="ldsn-section-head"><div><p class="ldsn-kicker">Chinh phục đoạn văn</p><h2>${esc(currentLesson.passage.title.vi || 'Đoạn văn')}</h2><p>${mode === 'ordering' ? 'Xếp từ' : 'Gõ chữ Hán'} theo từng câu.</p></div><div class="ldsn-compact-actions">${pinyinToggleButton()}${audioButton(currentLesson.passage.hanzi, 'Nghe toàn bộ đoạn văn')}</div></div>${renderPassagePractice(mode)}<div class="ldsn-actions"><button class="ldsn-secondary-btn" type="button" data-tab-target="content" data-content-target="passage">Xem đầy đủ ba lớp</button><button class="ldsn-ghost-btn" type="button" data-mark-step="passage">Đã học đoạn văn</button></div></section>
    <section id="challenge" class="ldsn-card ldsn-pad ldsn-section ldsn-section--challenge"><div class="ldsn-section-head"><div><p class="ldsn-kicker">Thử thách cuối bài</p><h2>Trộn nhiều kỹ năng</h2></div></div><div class="ldsn-meta"><span>3 từ vựng</span><span>2 nghe</span><span>4 câu dịch</span><span>2 hội thoại</span><span>2 ngữ pháp</span><span>1 đoạn văn</span></div><div class="ldsn-actions"><button class="ldsn-primary-btn" type="button" data-mark-step="challenge">Hoàn thành thử thách</button></div></section>`;
  }

  function renderVocabFill(word, index) {
    const fields = ['pinyin', 'hanzi', 'vi'];
    const selectedMode = settings.vocabPracticeMode || 'mixed';
    const missing = selectedMode === 'mixed' ? fields[index % fields.length] : selectedMode;
    const labels = { pinyin: 'Pinyin', hanzi: 'Chữ Hán', vi: 'Nghĩa tiếng Việt' };
    return `<article class="ldsn-card ldsn-exercise ldsn-vocab-fill-card">
      <div class="ldsn-exercise-head ldsn-exercise-head--audio-only">${audioButton(word.hanzi)}</div>
      <div class="ldsn-layer">
        <span class="ldsn-hanzi">${missing === 'hanzi' ? '＿＿＿' : esc(word.hanzi)}</span>
        ${missing === 'pinyin' ? '<small>＿＿＿</small>' : pinyinHtml(word.pinyin, 'small')}
        <small>${esc(word.wordClass)} · ${missing === 'vi' ? '＿＿＿' : esc(word.vi)}</small>
      </div>
      <label><small>Điền ${labels[missing]}</small><input class="ldsn-input" type="text" data-vocab-answer data-expected="${attr(word[missing])}" data-kind="${missing}" autocomplete="off" inputmode="text"></label>
      <button class="ldsn-secondary-btn" type="button" data-check-vocab>Kiểm tra</button>
      <div class="ldsn-feedback" data-feedback></div>
    </article>`;
  }
  function renderTranslationExercise(item, direction, index) {
    const prompt = direction === 'zhvi' ? item.hanzi : item.vi;
    const answer = direction === 'zhvi' ? item.vi : item.hanzi;
    const key = `sentence:${item.id}:${direction}`;
    const mode = settings.roleplayMode === 'ordering' ? 'ordering' : 'typing';
    const response = direction === 'vizh' && mode === 'ordering'
      ? renderOrderingAnswer(item.hanzi, item.pinyin, index + 101, item.answerTokens)
      : `<textarea class="ldsn-textarea" placeholder="Nhập bản dịch của bạn..." data-translation-input></textarea>
         <button class="ldsn-secondary-btn" type="button" data-show-reference data-answer="${attr(answer)}" data-pinyin="${attr(item.pinyin)}">So sánh đáp án</button>
         <div class="ldsn-feedback" data-feedback></div>`;
    return `<article class="ldsn-card ldsn-exercise${direction === 'vizh' ? ' ldsn-exercise--reverse' : ''}"${direction === 'vizh' && mode === 'ordering' ? ' data-order-exercise' : ''}>
      <div class="ldsn-exercise-head ldsn-exercise-head--audio-only">${audioButton(item.hanzi)}</div>
      <div class="${direction === 'zhvi' ? 'ldsn-prompt-hanzi' : 'ldsn-meaning ldsn-prompt-vi'}">${esc(prompt)}</div>
      ${direction === 'zhvi'
        ? pinyinHtml(item.pinyin, 'div', 'ldsn-prompt-pinyin')
        : mode === 'typing'
          ? pinyinHtml(`Gợi ý pinyin: ${item.pinyin.split(/\s+/).map(part => part.slice(0, 1)).join(' · ')}`, 'small', 'ldsn-pinyin-hint')
          : ''}
      ${response}
      ${ratingButtons(key, itemMeta('sentence', item, { title: direction === 'zhvi' ? 'Dịch Trung → Việt' : 'Dịch Việt → Trung' }))}
    </article>`;
  }
  function renderOrderingAnswer(expected, pinyin, seed, answerTokens = []) {
    const tokens = Array.isArray(answerTokens) && answerTokens.length ? answerTokens : tokeniseSentence(expected, currentLesson.vocabulary);
    const shuffled = deterministicShuffle(tokens, seed);
    return `<div class="ldsn-order-workspace">
      <div><small>Câu của bạn</small><div class="ldsn-token-answer" data-token-answer><span class="ldsn-order-placeholder">Chọn từ ở dưới</span></div></div>
      <div><small>Từ cho sẵn</small><div class="ldsn-token-bank" data-token-bank>${shuffled.map((token, index) => `<button class="ldsn-token" type="button" data-token="${attr(token)}" data-token-index="${index}">${esc(token)}</button>`).join('')}</div></div>
      ${pinyinHtml(pinyin, 'small')}
      <div class="ldsn-actions"><button class="ldsn-secondary-btn" type="button" data-check-order data-expected="${attr(expected)}">Kiểm tra</button><button class="ldsn-ghost-btn" type="button" data-reset-order>Đặt lại</button>${audioButton(expected, 'Nghe câu mẫu')}</div>
      <div class="ldsn-feedback" data-feedback></div>
    </div>`;
  }

  function renderPassagePractice(mode) {
    const p = currentLesson.passage;
    return `<div class="ldsn-passage-practice">
      <div class="ldsn-passage-title ldsn-passage-title--compact"><h3>${esc(p.title.hanzi || '')}</h3>${pinyinHtml(p.title.pinyin || '', 'span')}<span class="ldsn-meaning">${esc(p.title.vi || '')}</span></div>
      <div class="ldsn-passage-sentences">${p.sentences.filter(row => row.hanzi).map((row, index) => `<details class="ldsn-passage-sentence"${index === 0 ? ' open' : ''} data-order-exercise>
        <summary><span class="ldsn-sentence-number">${index + 1}</span><span><strong>${esc(row.vi)}</strong><small>${mode === 'ordering' ? 'Xếp từ thành câu tiếng Trung' : 'Gõ câu tiếng Trung'}</small></span><span class="ldsn-chevron">⌄</span></summary>
        <div class="ldsn-passage-sentence-body">
          ${mode === 'ordering' ? renderOrderingAnswer(row.hanzi, row.pinyin, index + 501, row.answerTokens) : `<input class="ldsn-input" type="text" placeholder="Gõ câu tiếng Trung..." data-role-input autocomplete="off" lang="zh-CN"><div class="ldsn-actions"><button class="ldsn-secondary-btn" type="button" data-check-role data-expected="${attr(row.hanzi)}">Kiểm tra</button>${audioButton(row.hanzi, `Nghe câu ${index + 1}`)}</div><div class="ldsn-feedback" data-feedback></div>`}
        </div>
      </details>`).join('')}</div>
    </div>`;
  }

  function renderPassage(full) {
    const p = currentLesson.passage;
    const sentenceAudio = p.sentences.filter(row => row.hanzi).map((row, index) => `<div class="ldsn-layer"><div class="ldsn-inline-head"><span><strong>Câu ${index + 1}</strong></span>${audioButton(row.hanzi, `Nghe câu ${index + 1}`)}</div><span class="ldsn-hanzi">${esc(row.hanzi)}</span>${full ? pinyinHtml(row.pinyin, 'small') : ''}</div>`).join('');
    return `<div class="ldsn-passage">
      <div class="ldsn-passage-title"><h3>${esc(p.title.hanzi || '')}</h3>${pinyinHtml(p.title.pinyin || '', 'span')}<span class="ldsn-meaning">${esc(p.title.vi || '')}</span></div>
      ${full ? `<div class="ldsn-passage-layer"><h4>Chữ Hán</h4><p class="ldsn-hanzi">${esc(p.hanzi)}</p></div><div class="ldsn-passage-layer" data-pinyin><h4>Pinyin</h4><p>${esc(p.pinyin)}</p></div><div class="ldsn-passage-layer"><h4>Tiếng Việt</h4><p>${esc(p.vi)}</p></div>` : sentenceAudio}
    </div>`;
  }

  function renderDialogueSettings(speakers, selectedRole, mode) {
    return `<details class="ldsn-settings ldsn-compact-settings" data-dialogue-settings><summary><span>⚙ Cài đặt hội thoại</span><small>${esc(selectedRole)} · ${mode === 'ordering' ? 'Xếp từ' : 'Gõ câu'} · ${pinyinStatusHtml()}</small></summary><div class="ldsn-settings-body"><label class="ldsn-setting-block"><strong>Vai của bạn</strong><select class="ldsn-role-select" data-role-select>${speakers.map(speaker => `<option value="${attr(speaker)}"${speaker === selectedRole ? ' selected' : ''}>${esc(speaker)}</option>`).join('')}</select></label><div class="ldsn-setting-block"><strong>Cách trả lời</strong><div class="ldsn-mode-switch"><button class="ldsn-mode-btn${mode === 'typing' ? ' is-active' : ''}" type="button" data-role-mode="typing">Gõ câu</button><button class="ldsn-mode-btn${mode === 'ordering' ? ' is-active' : ''}" type="button" data-role-mode="ordering">Xếp từ</button></div></div><div class="ldsn-setting-row"><span><strong>Hiện pinyin</strong><small>Dùng chung toàn bộ LDSN1-4</small></span>${pinyinToggleButton()}</div></div></details>`;
  }

  function renderDialogue() {
    const speakers = [...new Set(currentLesson.dialogue.map(turn => turn.speaker).filter(Boolean))];
    const selectedRole = settings.roleByLesson[currentLesson.id] || speakers[0] || '';
    const mode = settings.roleplayMode === 'ordering' ? 'ordering' : 'typing';
    return `<section id="roleplay" class="ldsn-card ldsn-pad ldsn-section ldsn-section--dialogue"><div class="ldsn-compact-section-head"><div><p class="ldsn-kicker">Hội thoại nhập vai</p><h2>Nghe · phản xạ · trả lời</h2></div><div class="ldsn-compact-actions">${pinyinToggleButton()}${audioButton(currentLesson.dialogue.map(turn => turn.hanzi).join(' '), 'Nghe toàn bộ hội thoại')}<button class="ldsn-settings-shortcut" type="button" data-open-nearest-settings aria-label="Mở cài đặt hội thoại">⚙</button></div></div>${renderDialogueSettings(speakers, selectedRole, mode)}</section><section class="ldsn-dialogue-list">${currentLesson.dialogue.map(turn => renderDialogueTurn(turn, selectedRole, mode)).join('')}</section><section class="ldsn-card ldsn-pad"><button class="ldsn-ghost-btn" type="button" data-mark-step="dialogue">Đã hoàn thành lượt nhập vai</button></section>`;
  }

  function renderDialogueTurn(turn, selectedRole, mode) {
    const isUser = turn.speaker === selectedRole;
    const speakers = [...new Set(currentLesson.dialogue.map(row => row.speaker).filter(Boolean))];
    const speakerIndex = Math.max(0, speakers.indexOf(turn.speaker));
    const speakerClass = speakerIndex % 2 === 0 ? 'speaker-a' : 'speaker-b';
    const key = `dialogue:${turn.id}`;
    return `<article class="ldsn-card ldsn-dialogue-turn ${speakerClass}${isUser ? ' is-user' : ' is-other'}" data-turn-id="${turn.id}"${isUser && mode === 'ordering' ? ' data-order-exercise' : ''}>
      <div class="ldsn-dialogue-speaker-row"><span class="ldsn-speaker-avatar">${esc((turn.speaker || '?').slice(0, 1))}</span><div class="ldsn-speaker">${esc(turn.speaker || `Lượt ${turn.turn}`)}${isUser ? ' · Lượt của bạn' : ''}</div></div>
      ${isUser ? renderRoleAnswer(turn, mode) : `<div class="ldsn-turn-copy"><div><div class="ldsn-hanzi">${esc(turn.hanzi)}</div>${pinyinHtml(turn.pinyin)}<div class="ldsn-meaning">${esc(turn.vi)}</div></div>${audioButton(turn.hanzi)}</div>`}
      ${ratingButtons(key, itemMeta('dialogue', turn, { title: turn.speaker }))}
    </article>`;
  }
  function renderRoleAnswer(turn, mode) {
    if (mode === 'ordering') {
      return `<div class="ldsn-layer ldsn-layer--dialogue"><span class="ldsn-meaning">${esc(turn.vi)}</span>${pinyinHtml(turn.pinyin, 'small')}</div>${renderOrderingAnswer(turn.hanzi, '', turn.turn, turn.answerTokens)}`;
    }
    return `<div class="ldsn-layer ldsn-layer--dialogue"><span class="ldsn-meaning">${esc(turn.vi)}</span>${pinyinHtml(turn.pinyin, 'small')}</div>
      <input class="ldsn-input" type="text" placeholder="Gõ câu tiếng Trung..." data-role-input autocomplete="off" lang="zh-CN">
      <div class="ldsn-actions"><button class="ldsn-secondary-btn" type="button" data-check-role data-expected="${attr(turn.hanzi)}">Kiểm tra</button>${audioButton(turn.hanzi, 'Nghe câu mẫu')}</div>
      <div class="ldsn-feedback" data-feedback></div>`;
  }

  function tokeniseSentence(sentence, vocabulary) {
    const clean = normalizeHanzi(sentence);
    const words = [...new Set((vocabulary || []).map(row => row.hanzi).filter(Boolean))].sort((a, b) => b.length - a.length);
    const tokens = [];
    let index = 0;
    while (index < clean.length) {
      const match = words.find(word => word.length > 1 && clean.startsWith(word, index));
      if (match) {
        tokens.push(match);
        index += match.length;
        continue;
      }
      const latin = clean.slice(index).match(/^[A-Za-z0-9]+/);
      if (latin) {
        tokens.push(latin[0]);
        index += latin[0].length;
        continue;
      }
      tokens.push(clean[index]);
      index += 1;
    }
    return tokens;
  }

  function deterministicShuffle(tokens, seed) {
    const list = [...tokens];
    let value = seed * 997 + tokens.length * 37;
    for (let i = list.length - 1; i > 0; i -= 1) {
      value = (value * 9301 + 49297) % 233280;
      const j = Math.floor((value / 233280) * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    if (list.join('') === tokens.join('') && list.length > 1) [list[0], list[1]] = [list[1], list[0]];
    return list;
  }

  function renderContentSentenceGroup(title, items, open = false) {
    return `<details class="ldsn-card ldsn-content-accordion"${open ? ' open' : ''}><summary><span><strong>${esc(title)}</strong><small>Chữ Hán · Pinyin · Tiếng Việt</small></span><span class="ldsn-chevron">⌄</span></summary><div class="ldsn-content-accordion-body"><div class="ldsn-content-group">${items.map(item => `<article class="ldsn-content-sentence-row"><div><div class="ldsn-hanzi">${esc(item.hanzi)}</div>${pinyinHtml(item.pinyin)}<div class="ldsn-meaning">${esc(item.vi)}</div></div>${audioButton(item.hanzi)}</article>`).join('')}</div></div></details>`;
  }

  function renderContentGrammar(source, title, open = false) {
    const items = currentLesson.grammar.filter(item => item.source === source);
    return `<details class="ldsn-card ldsn-content-accordion"${open ? ' open' : ''}><summary><span><strong>${esc(title)}</strong><small>${items.length} điểm · Theo đúng thứ tự nguồn</small></span><span class="ldsn-chevron">⌄</span></summary><div class="ldsn-content-accordion-body"><div class="ldsn-grammar-list">${items.map(renderGrammarCard).join('')}</div></div></details>`;
  }

  function renderContentFlowItem(step, index) {
    const open = contentFilter !== 'all' || index === 0;
    switch (step.type) {
      case 'vocabulary': return renderFullVocabulary(open);
      case 'zhViQuestions': return renderContentSentenceGroup('Phần 2 · Dịch Trung → Việt · Câu hỏi', currentLesson.translation.zhVi.questions, open);
      case 'zhViAnswers': return renderContentSentenceGroup('Phần 2 · Dịch Trung → Việt · Câu trả lời', currentLesson.translation.zhVi.answers, open);
      case 'dialogue': return renderFullDialogue(open);
      case 'dialogueGrammar': return renderContentGrammar('dialogue', 'Phân tích ngữ pháp · Câu và hội thoại', open);
      case 'viZhQuestions': return renderContentSentenceGroup('Phần 3 · Dịch Việt → Trung · Câu hỏi', currentLesson.translation.viZh.questions, open);
      case 'viZhAnswers': return renderContentSentenceGroup('Phần 3 · Dịch Việt → Trung · Câu trả lời', currentLesson.translation.viZh.answers, open);
      case 'passage': return `<details class="ldsn-card ldsn-content-accordion"${open ? ' open' : ''}><summary><span><strong>Phần 3 · Đoạn văn</strong><small>Chữ Hán · Pinyin · Tiếng Việt</small></span><span class="ldsn-chevron">⌄</span></summary><div class="ldsn-content-accordion-body"><div class="ldsn-section-head"><div><h2>${esc(currentLesson.passage.title.vi || 'Đoạn văn')}</h2></div>${audioButton(currentLesson.passage.hanzi, 'Nghe toàn bộ đoạn văn')}</div>${renderPassage(true)}</div></details>`;
      case 'passageGrammar': return renderContentGrammar('passage', 'Phân tích ngữ pháp · Đoạn văn', open);
      default: return '';
    }
  }

  function contentStepMatchesFilter(stepType) {
    if (contentFilter === 'all') return true;
    const map = {
      vocabulary: ['vocabulary'],
      zhvi: ['zhViQuestions', 'zhViAnswers', 'dialogue', 'dialogueGrammar'],
      dialogue: ['dialogue', 'dialogueGrammar'],
      grammar: ['dialogueGrammar', 'passageGrammar'],
      vizh: ['viZhQuestions', 'viZhAnswers', 'passage', 'passageGrammar'],
      passage: ['passage', 'passageGrammar']
    };
    return (map[contentFilter] || []).includes(stepType);
  }

  function renderContent() {
    const filters = [['all', 'Tất cả'], ['vocabulary', 'Từ vựng'], ['zhvi', 'Trung → Việt'], ['dialogue', 'Hội thoại'], ['grammar', 'Ngữ pháp'], ['vizh', 'Việt → Trung'], ['passage', 'Đoạn văn']];
    const flow = (currentLesson.contentFlow || []).filter(step => contentStepMatchesFilter(step.type));
    return `<section class="ldsn-card ldsn-pad ldsn-section ldsn-section--content">
      <div class="ldsn-compact-section-head"><div><p class="ldsn-kicker">Nội dung đầy đủ</p><h2>Toàn bộ Bài ${currentLesson.lessonNumber}</h2><p>Theo đúng trình tự PDF và Markdown.</p></div>${pinyinToggleButton()}</div>
      <div class="ldsn-filter-row">${filters.map(([id, label]) => `<button class="ldsn-chip${contentFilter === id ? ' is-active' : ''}" type="button" data-content-filter="${id}">${label}</button>`).join('')}</div>
    </section>${flow.map(renderContentFlowItem).join('')}`;
  }

  function renderFullVocabulary(open = false) {
    return `<details class="ldsn-card ldsn-content-accordion"${open ? ' open' : ''}><summary><span><strong>Phần 1 · Toàn bộ ${currentLesson.vocabulary.length} từ vựng</strong><small>Chạm vào từ để xem chi tiết chung với HSK</small></span><span class="ldsn-chevron">⌄</span></summary>
      <div class="ldsn-content-accordion-body"><div class="ldsn-content-vocab-list">${currentLesson.vocabulary.map(word => `<article class="ldsn-content-vocab-row" data-vocab-id="${attr(word.id)}"><button class="ldsn-content-vocab-link" type="button" data-open-word-detail="${attr(word.id)}" aria-label="Mở chi tiết ${esc(word.hanzi)}"><div class="ldsn-content-vocab-hanzi">${esc(word.hanzi)}</div><div class="ldsn-content-vocab-copy">${pinyinHtml(word.pinyin, 'strong')}<span>${esc(word.vi)}</span><small>${esc(word.wordClass || 'từ vựng')}${word.hanViet ? ` · Hán Việt: ${esc(word.hanViet)}` : ''}</small></div><span class="ldsn-vocab-list-arrow" aria-hidden="true">›</span></button>${audioButton(word.hanzi)}</article>`).join('')}</div></div>
    </details>`;
  }

  function renderFullDialogue(open = false) {
    const speakers = [...new Set(currentLesson.dialogue.map(row => row.speaker).filter(Boolean))];
    return `<details class="ldsn-card ldsn-content-accordion"${open ? ' open' : ''}><summary><span><strong>Phần 2 · Hội thoại và đáp án</strong><small>${currentLesson.dialogue.length} lượt · Hai vai được phân màu</small></span><span class="ldsn-chevron">⌄</span></summary><div class="ldsn-content-accordion-body"><div class="ldsn-section-head"><div></div>${audioButton(currentLesson.dialogue.map(turn => turn.hanzi).join(' '), 'Nghe toàn bộ hội thoại')}</div><div class="ldsn-dialogue-list">${currentLesson.dialogue.map(turn => { const speakerIndex = Math.max(0, speakers.indexOf(turn.speaker)); const speakerClass = speakerIndex % 2 === 0 ? 'speaker-a' : 'speaker-b'; return `<article class="ldsn-dialogue-turn ${speakerClass} is-other"><div class="ldsn-dialogue-speaker-row"><span class="ldsn-speaker-avatar">${esc((turn.speaker || '?').slice(0, 1))}</span><div class="ldsn-speaker">${esc(turn.speaker)}</div></div><div class="ldsn-turn-copy"><div><div class="ldsn-hanzi">${esc(turn.hanzi)}</div>${pinyinHtml(turn.pinyin)}<div class="ldsn-meaning">${esc(turn.vi)}</div></div>${audioButton(turn.hanzi)}</div></article>`; }).join('')}</div></div></details>`;
  }

  function renderReview() {
    const state = getLessonState(currentLesson.id);
    const rows = Object.entries(state.ratings || {})
      .filter(([, row]) => ['review', 'hard'].includes(row.rating))
      .sort((a, b) => String(b[1].updatedAt).localeCompare(String(a[1].updatedAt)));
    return `<section id="review" class="ldsn-card ldsn-pad ldsn-section ldsn-section--review">
      <div class="ldsn-section-head"><div><p class="ldsn-kicker">Ôn cách quãng</p><h2>${rows.length} mục cần ôn</h2><p>Từ, câu, hội thoại và ngữ pháp dùng chung một lịch sử.</p></div></div>
      ${rows.length ? `<div class="ldsn-exercise-list">${rows.map(([key, row]) => renderReviewItem(key, row)).join('')}</div>` : `<div class="ldsn-review-empty"><strong>Chưa có mục cần ôn</strong>Trong lúc học, chọn Ôn hoặc Khó để đưa nội dung vào đây.</div>`}
      <div class="ldsn-actions"><button class="ldsn-secondary-btn" type="button" data-mark-step="review">Đã ôn hôm nay</button></div>
    </section>`;
  }

  function renderReviewItem(key, row) {
    const meta = row.meta || {};
    return `<article class="ldsn-card ldsn-exercise">
      <div class="ldsn-exercise-head"><div><small>${esc(meta.type || 'Nội dung')}</small><h3>${esc(meta.title || meta.lessonTitle || '')}</h3></div>${audioButton(meta.hanzi || '')}</div>
      ${meta.hanzi ? `<div class="ldsn-hanzi ldsn-prompt-hanzi">${esc(meta.hanzi)}</div>` : ''}
      ${pinyinHtml(meta.pinyin)}
      ${meta.vi ? `<div class="ldsn-meaning">${esc(meta.vi)}</div>` : ''}
      ${ratingButtons(key, meta)}
    </article>`;
  }

  function normalizeHanzi(value) { return String(value || '').replace(/[\s，。！？；：、“”‘’…,.!?;:'"()（）]/g, ''); }
  function normalizeLatin(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '').toLowerCase();
  }

  function showFeedback(container, message, kind) {
    const feedback = container.querySelector('[data-feedback]');
    if (!feedback) return;
    feedback.className = `ldsn-feedback is-visible ${kind}`;
    feedback.innerHTML = message;
  }

  function switchTab(tab, push = true) {
    if (!TABS.some(item => item.id === tab)) tab = 'learn';
    activeTab = tab;
    if (push && currentLesson) {
      const url = new URL(location.href);
      url.searchParams.set('tab', tab);
      history.replaceState({}, '', url);
    }
    renderLesson();
  }

  function goJourney(stepId) {
    const step = JOURNEY.find(item => item.id === stepId);
    if (!step) return;
    activeTab = step.tab;
    renderLesson();
    requestAnimationFrame(() => document.getElementById(step.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function rerenderPanel() {
    const panel = document.getElementById('ldsnPanel');
    if (panel) panel.innerHTML = renderActivePanel();
  }

  function speak(text, button) {
    if (!('speechSynthesis' in window) || !text) return;
    speechSynthesis.cancel();
    document.querySelectorAll('.ldsn-icon-btn.is-speaking').forEach(node => node.classList.remove('is-speaking'));
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = .88;
    const voices = speechSynthesis.getVoices();
    const voice = voices.find(item => /^zh-CN/i.test(item.lang)) || voices.find(item => /^zh/i.test(item.lang));
    if (voice) utterance.voice = voice;
    if (button) button.classList.add('is-speaking');
    utterance.onend = utterance.onerror = () => button?.classList.remove('is-speaking');
    speechSynthesis.speak(utterance);
  }

  function handleClick(event) {
    const speakButton = event.target.closest('[data-speak]');
    if (speakButton) { speak(speakButton.dataset.speak, speakButton); return; }

    const wordDetail = event.target.closest('[data-open-word-detail]');
    if (wordDetail) { openWordDetail(wordDetail.dataset.openWordDetail); return; }

    if (event.target.closest('[data-open-flashcards]')) { openFlashcards(); return; }

    const togglePinyin = event.target.closest('[data-toggle-pinyin]');
    if (togglePinyin) {
      settings.displayPinyin = settings.displayPinyin === false;
      saveSettings();
      applyPinyinVisibility();
      return;
    }

    const openSettings = event.target.closest('[data-open-nearest-settings]');
    if (openSettings) {
      const section = openSettings.closest('.ldsn-section');
      const details = section?.querySelector?.('.ldsn-compact-settings');
      if (details) { details.open = true; details.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }); }
      return;
    }

    const startMatch = event.target.closest('[data-start-vocab-match]');
    if (startMatch) { startVocabMatching(); return; }

    const toggleMatchPinyin = event.target.closest('[data-toggle-match-pinyin]');
    if (toggleMatchPinyin) { settings.vocabMatchShowPinyin = !settings.vocabMatchShowPinyin; saveSettings(); renderLesson(); return; }

    const matchLeft = event.target.closest('[data-match-left]');
    if (matchLeft) { chooseMatch('left', matchLeft.dataset.matchLeft); return; }

    const matchRight = event.target.closest('[data-match-right]');
    if (matchRight) { chooseMatch('right', matchRight.dataset.matchRight); return; }

    const restartMatch = event.target.closest('[data-restart-vocab-match]');
    if (restartMatch) { startVocabMatching(); return; }

    const tab = event.target.closest('[data-tab]');
    if (tab) { switchTab(tab.dataset.tab); return; }

    const targetTab = event.target.closest('[data-tab-target]');
    if (targetTab) {
      contentFilter = targetTab.dataset.contentTarget || 'all';
      switchTab(targetTab.dataset.tabTarget);
      return;
    }

    const journey = event.target.closest('[data-journey]');
    if (journey) { goJourney(journey.dataset.journey); return; }

    const mark = event.target.closest('[data-mark-step]');
    if (mark) {
      markJourney(mark.dataset.markStep, true);
      renderLesson();
      return;
    }

    const rate = event.target.closest('[data-rate]');
    if (rate) {
      let meta = {};
      try { meta = JSON.parse(decodeURIComponent(rate.dataset.itemMeta || '')); } catch (_error) {}
      rateItem(rate.dataset.itemKey, rate.dataset.rate, meta);
      const group = rate.closest('[data-rating-group]');
      group?.querySelectorAll('[data-rate]').forEach(button => button.classList.toggle('is-active', button === rate));
      return;
    }

    const applyCount = event.target.closest('[data-apply-vocab-count]');
    if (applyCount) {
      const input = applyCount.closest('.ldsn-number-control')?.querySelector('[data-vocab-count-input]');
      const value = Math.min(Math.max(Number(input?.value) || 1, 1), currentLesson.vocabulary.length);
      settings.vocabModeByLesson[currentLesson.id] = String(value);
      saveSettings();
      rerenderPanel();
      return;
    }

    const applyCustom = event.target.closest('[data-apply-custom]');
    if (applyCustom) {
      rerenderPanel();
      return;
    }

    const customAction = event.target.closest('[data-custom-action]');
    if (customAction) {
      const state = getLessonState(currentLesson.id);
      let ids = [];
      if (customAction.dataset.customAction === 'all') ids = currentLesson.vocabulary.map(word => word.id);
      if (customAction.dataset.customAction === 'ten') ids = currentLesson.vocabulary.slice(0, 10).map(word => word.id);
      if (customAction.dataset.customAction === 'weak') ids = currentLesson.vocabulary.filter(word => ['review', 'hard'].includes(state.ratings[`vocab:${word.id}`]?.rating)).map(word => word.id);
      settings.customVocabByLesson[currentLesson.id] = ids;
      saveSettings();
      rerenderPanel();
      return;
    }

    const checkVocab = event.target.closest('[data-check-vocab]');
    if (checkVocab) {
      const card = checkVocab.closest('.ldsn-exercise');
      const input = card.querySelector('[data-vocab-answer]');
      const expected = input.dataset.expected || '';
      const correct = input.dataset.kind === 'hanzi' ? normalizeHanzi(input.value) === normalizeHanzi(expected) : normalizeLatin(input.value) === normalizeLatin(expected);
      showFeedback(card, correct ? 'Chính xác. Từ này đã được ghi nhận.' : `Chưa đúng. Đáp án: <strong>${esc(expected)}</strong>`, correct ? 'is-correct' : 'is-wrong');
      return;
    }

    const reference = event.target.closest('[data-show-reference]');
    if (reference) {
      const card = reference.closest('.ldsn-exercise');
      const answer = reference.dataset.answer || '';
      const pinyin = reference.dataset.pinyin || '';
      showFeedback(card, `<strong>Đáp án tham khảo:</strong><br>${esc(answer)}${pinyin ? `<br><small class="ldsn-pinyin" data-pinyin>${esc(pinyin)}</small>` : ''}`, 'is-partial');
      return;
    }

    const vocabView = event.target.closest('[data-vocab-view]');
    if (vocabView) {
      settings.vocabViewMode = vocabView.dataset.vocabView === 'list' ? 'list' : 'cards';
      saveSettings();
      rerenderPanel();
      restoreVocabularyFocus();
      return;
    }

    const vocabPracticeMode = event.target.closest('[data-vocab-practice-mode]');
    if (vocabPracticeMode) {
      const value = vocabPracticeMode.dataset.vocabPracticeMode;
      settings.vocabPracticeMode = ['mixed', 'hanzi', 'pinyin', 'vi'].includes(value) ? value : 'mixed';
      saveSettings();
      rerenderPanel();
      return;
    }

    const mode = event.target.closest('[data-role-mode]');
    if (mode) {
      settings.roleplayMode = mode.dataset.roleMode;
      saveSettings();
      rerenderPanel();
      return;
    }

    const token = event.target.closest('[data-token]');
    if (token) {
      const turn = token.closest('[data-order-exercise]') || token.closest('.ldsn-dialogue-turn') || token.closest('.ldsn-exercise');
      const bank = turn?.querySelector('[data-token-bank]');
      const answer = turn?.querySelector('[data-token-answer]');
      if (!bank || !answer) return;
      answer.querySelector('.ldsn-order-placeholder')?.remove();
      (token.parentElement === bank ? answer : bank).appendChild(token);
      if (!answer.querySelector('[data-token]')) answer.insertAdjacentHTML('afterbegin', '<span class="ldsn-order-placeholder">Chọn từ ở dưới</span>');
      return;
    }

    const resetOrder = event.target.closest('[data-reset-order]');
    if (resetOrder) {
      const turn = resetOrder.closest('[data-order-exercise]') || resetOrder.closest('.ldsn-dialogue-turn') || resetOrder.closest('.ldsn-exercise');
      const bank = turn.querySelector('[data-token-bank]');
      const answer = turn.querySelector('[data-token-answer]');
      [...answer.querySelectorAll('[data-token]')].forEach(tokenButton => bank.appendChild(tokenButton));
      if (!answer.querySelector('.ldsn-order-placeholder')) answer.insertAdjacentHTML('afterbegin', '<span class="ldsn-order-placeholder">Chọn từ ở dưới</span>');
      showFeedback(turn, '', '');
      turn.querySelector('[data-feedback]').className = 'ldsn-feedback';
      return;
    }

    const checkOrder = event.target.closest('[data-check-order]');
    if (checkOrder) {
      const turn = checkOrder.closest('[data-order-exercise]') || checkOrder.closest('.ldsn-dialogue-turn') || checkOrder.closest('.ldsn-exercise');
      const answer = [...turn.querySelectorAll('[data-token-answer] [data-token]')].map(button => button.dataset.token).join('');
      const correct = normalizeHanzi(answer) === normalizeHanzi(checkOrder.dataset.expected);
      showFeedback(turn, correct ? 'Đúng thứ tự. Hãy nghe và đọc lại câu hoàn chỉnh.' : `Chưa đúng thứ tự. Câu mẫu: <strong>${esc(checkOrder.dataset.expected)}</strong>`, correct ? 'is-correct' : 'is-wrong');
      return;
    }

    const checkRole = event.target.closest('[data-check-role]');
    if (checkRole) {
      const turn = checkRole.closest('.ldsn-dialogue-turn') || checkRole.closest('.ldsn-passage-sentence') || checkRole.closest('.ldsn-exercise');
      const input = turn.querySelector('[data-role-input]');
      const expected = checkRole.dataset.expected || '';
      const correct = normalizeHanzi(input.value) === normalizeHanzi(expected);
      let message = '';
      let kind = 'is-wrong';
      if (correct) { message = 'Chính xác. Hãy nghe và đọc lại câu.'; kind = 'is-correct'; }
      else {
        const actual = normalizeHanzi(input.value);
        const target = normalizeHanzi(expected);
        let same = 0;
        for (let i = 0; i < Math.min(actual.length, target.length); i += 1) if (actual[i] === target[i]) same += 1;
        message = `Đúng ${same}/${target.length} chữ. Câu mẫu: <strong>${esc(expected)}</strong>`;
      }
      showFeedback(turn, message, kind);
      return;
    }

    const filter = event.target.closest('[data-content-filter]');
    if (filter) { contentFilter = filter.dataset.contentFilter; rerenderPanel(); return; }
  }

  function handleChange(event) {
    const mode = event.target.closest('[data-vocab-mode]');
    if (mode) {
      settings.vocabModeByLesson[currentLesson.id] = mode.value;
      saveSettings();
      rerenderPanel();
      return;
    }
    const custom = event.target.closest('[data-custom-vocab]');
    if (custom) {
      const selected = new Set(settings.customVocabByLesson[currentLesson.id] || []);
      if (custom.checked) selected.add(custom.dataset.customVocab); else selected.delete(custom.dataset.customVocab);
      settings.customVocabByLesson[currentLesson.id] = [...selected];
      saveSettings();
      const summary = custom.closest('.ldsn-settings')?.querySelector('summary small');
      if (summary) summary.textContent = `${selected.size} từ đã chọn`;
      return;
    }
    const role = event.target.closest('[data-role-select]');
    if (role) {
      settings.roleByLesson[currentLesson.id] = role.value;
      saveSettings();
      rerenderPanel();
    }
  }


  window.addEventListener?.('message', event => {
    if (event.origin !== location.origin) return;
    if (event.data?.type === 'tiengtrung:hsk-popup-close') {
      closeWordDetail();
      return;
    }
    if (event.data?.type === 'tiengtrung:hsk-popup-ready') {
      revealSharedWordDetail(event.data.word || '');
    }
  });

  async function init() {
    try {
      const response = await fetch(DATA_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      payload = await response.json();
      const params = new URLSearchParams(location.search);
      const lessonNo = Number(params.get('lesson'));
      currentLesson = payload.lessons.find(lesson => lesson.lessonNumber === lessonNo) || null;
      activeTab = TABS.some(tab => tab.id === params.get('tab')) ? params.get('tab') : 'learn';
      const requestedContent = params.get('content');
      contentFilter = ['all', 'vocabulary', 'zhvi', 'dialogue', 'grammar', 'vizh', 'passage'].includes(requestedContent) ? requestedContent : 'all';
      if (currentLesson) renderLesson(); else renderCourse();
      root.addEventListener('click', handleClick);
      root.addEventListener('change', handleChange);
      window.setTimeout(() => { setBreadcrumb(); recordLocation(); restoreVocabularyFocus(); }, 50);
    } catch (error) {
      root.innerHTML = `<section class="ldsn-card ldsn-pad"><h1>Không mở được LDSN1-4</h1><p class="ldsn-subtitle">${esc(error.message)}</p><p>Hãy chạy website bằng local server, không mở trực tiếp file HTML.</p></section>`;
    }
  }

  init();
})();

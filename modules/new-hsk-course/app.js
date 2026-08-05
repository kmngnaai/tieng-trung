(() => {
  'use strict';

  const SETTINGS_KEY = 'tiengTrung.newHskCourse.settings.v1';
  const SETTINGS_VERSION = 8;
  const Matching = window.TiengTrungMatching;
  const LAST_LOCATION_KEY = 'tiengTrung.newHskCourse.lastLocation.v1';
  const PROGRESS_KEY = 'tiengTrung.newHskCourse.progress.v1';
  const EXTERNAL_LISTENING_KEY = 'tiengTrung.listening.externalPractice.v1';
  const RETURN_PREFIX = 'tiengTrung.newHskCourse.return.';
  const HSK_EXTERNAL_FLASHCARD_KEY = 'tiengTrung.hsk.externalFlashcard.v1';
  const HSK1_SENTENCE_INDEX_URL = '../hanzi-stroke/data/learning/hsk1-vocabulary-sentence-index.json';
  const PRACTICE_ACTIVITY_IDS = new Set(['flashcards', 'listening', 'fill', 'matching', 'ordering', 'typing', 'translateZhVi', 'translateViZh', 'roleplay', 'characters']);
  const PRACTICE_SOURCE_IDS = ['vocabulary', 'properNouns', 'sentences', 'dialogues', 'passages', 'grammar'];
  const LEGACY_PRACTICE_ACTIVITY_MAP = Object.freeze({
    vocabulary: 'flashcards', sentences: 'ordering', dialogues: 'roleplay', passages: 'typing', grammar: 'fill', radicals: 'characters'
  });
  const root = document.getElementById('newHskCourseApp');
  const params = new URLSearchParams(window.location.search);
  const state = {
    manifest: null,
    lesson: null,
    level: Math.max(1, Number(params.get('level')) || 1),
    lessonNumber: Math.max(1, Number(params.get('lesson')) || 1),
    view: ['book', 'grouped', 'practice'].includes(params.get('view')) ? params.get('view') : 'book',
    catalog: ['topics', 'grammar'].includes(params.get('catalog')) ? params.get('catalog') : '',
    topicId: params.get('topic') || '',
    grammarId: params.get('grammar') || '',
    focusWord: params.get('focusWord') || '',
    catalogData: null,
    catalogLoading: false,
    catalogError: '',
    filter: params.get('filter') || 'all',
    grammarPlusId: params.get('grammarPlus') || '',
    dialogueLayers: { hanzi: true, pinyin: true, vi: true },
    passageLayers: { hanzi: true, pinyin: true, vi: true },
    practiceActivity: params.get('practice') || 'flashcards',
    practiceSourceSelections: {},
    practiceActivityStarted: false,
    practiceOrderMode: 'ordered',
    practiceCountMode: 'all',
    practiceFlashcardFilter: 'all',
    practiceListeningMode: 'all',
    practiceListeningTranscript: false,
    practiceFillMode: 'vocabulary',
    practiceFillStrategy: 'default',
    practiceMatchingType: 'hanzi-vi',
    practiceTypingMode: 'hanzi',
    practiceOrderingAutoNext: true,
    practiceOrderingAutoNextDelay: 1.2,
    practiceOrderingDisplayCount: 1,
    practiceRoleSpeaker: '',
    practiceCharacterMode: ['learn', 'sort', 'build', 'write'].includes(params.get('characterMode')) ? params.get('characterMode') : 'learn',
    practiceCharacterScope: 'all',
    practiceCharacterGlyphs: String(params.get('chars') || '').split(',').map(value => value.trim()).filter(Boolean),
    practiceLayers: {},
    practiceSessionRows: [],
    practiceSessionKey: '',
    vocabShowPinyin: true,
    vocabViewMode: 'list',
    loading: true,
    error: ''
  };

  let activeWordDetail = null;
  let activeWordSource = null;
  let pendingWordDetailPayload = null;
  let sharedWordDetailFrameReady = false;
  let activeAudio = null;
  let activeAudioButton = null;
  let practiceMatchingSession = null;
  let practiceOrderingSession = null;
  let practiceOrderingAutoNextTimer = 0;
  let radicalSortSession = null;
  let radicalPointerDrag = null;
  let suppressRadicalClickUntil = 0;
  let practiceProgress = readProgress();
  const catalogCache = new Map();
  const lessonDataCache = new Map();
  let hsk1SentenceIndexPromise = null;

  Object.assign(state, readSettings());
  if (params.get('view')) state.view = ['book', 'grouped', 'practice'].includes(params.get('view')) ? params.get('view') : 'book';
  if (params.get('practice')) state.practiceActivity = normalizePracticeActivity(params.get('practice'));
  if (params.get('characterMode') && ['learn', 'sort', 'build', 'write'].includes(params.get('characterMode'))) state.practiceCharacterMode = params.get('characterMode');

  const escapeHtml = (value = '') => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
  const attr = (value = '') => escapeHtml(value).replaceAll('\n', '&#10;');
  const sortByOrder = (items = []) => [...items].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  const entityMap = (items = []) => new Map(items.map(item => [item.id, item]));

  function seededShuffle(items, seedValue = '') {
    const result = [...items];
    let seed = 2166136261;
    for (const char of String(seedValue)) {
      seed ^= char.charCodeAt(0);
      seed = Math.imul(seed, 16777619) >>> 0;
    }
    const random = () => {
      seed += 0x6D2B79F5;
      let value = seed;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
  }

  function normalizeLayers(value, fallback) {
    const source = value && typeof value === 'object' ? value : fallback;
    const normalized = {
      hanzi: source.hanzi === true,
      pinyin: source.pinyin === true,
      vi: source.vi === true
    };
    if (!normalized.hanzi && !normalized.pinyin && !normalized.vi) normalized.hanzi = true;
    return normalized;
  }

  function normalizePracticeDelay(value, fallback = 1.2) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(5, Math.max(0, Math.round(parsed * 10) / 10));
  }

  function readSettings() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || '{}');
      const keepSavedLayers = Number(saved.settingsVersion) >= SETTINGS_VERSION;
      return {
        view: ['book', 'grouped', 'practice'].includes(saved.view) ? saved.view : state.view,
        dialogueLayers: keepSavedLayers ? normalizeLayers(saved.dialogueLayers, state.dialogueLayers) : { hanzi: true, pinyin: true, vi: true },
        passageLayers: keepSavedLayers ? normalizeLayers(saved.passageLayers, state.passageLayers) : { hanzi: true, pinyin: true, vi: true },
        practiceActivity: normalizePracticeActivity(String(saved.practiceActivity || state.practiceActivity)),
        practiceSourceSelections: saved.practiceSourceSelections && typeof saved.practiceSourceSelections === 'object' ? saved.practiceSourceSelections : {},
        practiceOrderMode: saved.practiceOrderMode === 'random' ? 'random' : 'ordered',
        practiceCountMode: ['5', '10', 'all'].includes(String(saved.practiceCountMode)) ? String(saved.practiceCountMode) : 'all',
        practiceFlashcardFilter: ['all', 'unseen', 'review', 'hard'].includes(saved.practiceFlashcardFilter) ? saved.practiceFlashcardFilter : 'all',
        practiceListeningMode: saved.practiceListeningMode === 'single' ? 'single' : 'all',
        practiceFillMode: saved.practiceFillMode === 'sentence' ? 'sentence' : 'vocabulary',
        practiceFillStrategy: saved.practiceFillStrategy === 'random' ? 'random' : 'default',
        practiceMatchingType: ['hanzi-vi', 'hanzi-pinyin', 'pinyin-vi', 'question-answer', 'speaker-line', 'grammar'].includes(saved.practiceMatchingType) ? saved.practiceMatchingType : 'hanzi-vi',
        practiceTypingMode: ['hanzi', 'pinyin', 'listen'].includes(saved.practiceTypingMode) ? saved.practiceTypingMode : 'hanzi',
        practiceOrderingAutoNext: saved.practiceOrderingAutoNext !== false,
        practiceOrderingAutoNextDelay: normalizePracticeDelay(saved.practiceOrderingAutoNextDelay, 1.2),
        practiceOrderingDisplayCount: [1, 2, 3].includes(Number(saved.practiceOrderingDisplayCount)) ? Number(saved.practiceOrderingDisplayCount) : 1,
        practiceRoleSpeaker: String(saved.practiceRoleSpeaker || ''),
        practiceCharacterMode: ['learn', 'sort', 'build', 'write'].includes(saved.practiceCharacterMode) ? saved.practiceCharacterMode : 'learn',
        practiceCharacterScope: saved.practiceCharacterScope === 'core' ? 'core' : 'all',
        practiceLayers: saved.practiceLayers && typeof saved.practiceLayers === 'object'
          ? { ...saved.practiceLayers, ...(Number(saved.settingsVersion) >= SETTINGS_VERSION ? {} : { typingListen: undefined }) }
          : {},
        vocabShowPinyin: saved.vocabShowPinyin !== false,
        vocabViewMode: saved.vocabViewMode === 'grid' ? 'grid' : 'list'
      };
    } catch (_error) {
      return {};
    }
  }

  function saveSettings() {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        settingsVersion: SETTINGS_VERSION,
        view: state.view,
        dialogueLayers: state.dialogueLayers,
        passageLayers: state.passageLayers,
        practiceActivity: state.practiceActivity,
        practiceSourceSelections: state.practiceSourceSelections,
        practiceOrderMode: state.practiceOrderMode,
        practiceCountMode: state.practiceCountMode,
        practiceFlashcardFilter: state.practiceFlashcardFilter,
        practiceListeningMode: state.practiceListeningMode,
        practiceFillMode: state.practiceFillMode,
        practiceFillStrategy: state.practiceFillStrategy,
        practiceMatchingType: state.practiceMatchingType,
        practiceTypingMode: state.practiceTypingMode,
        practiceOrderingAutoNext: state.practiceOrderingAutoNext,
        practiceOrderingAutoNextDelay: state.practiceOrderingAutoNextDelay,
        practiceOrderingDisplayCount: state.practiceOrderingDisplayCount,
        practiceRoleSpeaker: state.practiceRoleSpeaker,
        practiceCharacterMode: state.practiceCharacterMode,
        practiceCharacterScope: state.practiceCharacterScope,
        practiceLayers: state.practiceLayers,
        vocabShowPinyin: state.vocabShowPinyin,
        vocabViewMode: state.vocabViewMode
      }));
      window.localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify({
        level: state.level,
        lesson: state.lessonNumber,
        view: state.view,
        filter: state.filter,
        practiceActivity: state.practiceActivity,
        updatedAt: new Date().toISOString()
      }));
    } catch (_error) {}
  }

  function syncUrl(replace = true) {
    if (!/^https?:/i.test(window.location.href)) return;
    const url = new URL(window.location.href);
    url.searchParams.set('level', String(state.level));
    url.searchParams.set('lesson', String(state.lessonNumber));
    url.searchParams.set('view', state.view);
    if (state.catalog) {
      url.searchParams.set('catalog', state.catalog);
      if (state.catalog === 'topics' && state.topicId) url.searchParams.set('topic', state.topicId);
      else url.searchParams.delete('topic');
      if (state.catalog === 'grammar' && state.grammarId) url.searchParams.set('grammar', state.grammarId);
      else url.searchParams.delete('grammar');
    } else {
      url.searchParams.delete('catalog');
      url.searchParams.delete('topic');
      url.searchParams.delete('grammar');
    }
    if (state.focusWord) url.searchParams.set('focusWord', state.focusWord);
    else url.searchParams.delete('focusWord');
    if (!state.catalog && state.grammarPlusId) url.searchParams.set('grammarPlus', state.grammarPlusId);
    else url.searchParams.delete('grammarPlus');
    if (!state.catalog && state.view === 'grouped' && state.filter !== 'all') url.searchParams.set('filter', state.filter);
    else url.searchParams.delete('filter');
    if (!state.catalog && state.view === 'practice' && state.practiceActivity !== 'flashcards') url.searchParams.set('practice', state.practiceActivity);
    else url.searchParams.delete('practice');
    window.history[replace ? 'replaceState' : 'pushState'](window.history.state, '', `${url.pathname}${url.search}`);
  }

  function indexes(lesson) {
    return Object.fromEntries(Object.entries(lesson.entities).map(([key, items]) => [key, entityMap(items)]));
  }

  function allWords() {
    if (!state.lesson) return [];
    return [
      ...(state.lesson.entities.vocabulary || []).map(item => ({ ...item, itemType: 'vocabulary' })),
      ...(state.lesson.entities.properNouns || []).map(item => ({ ...item, wordClass: item.kind || 'danh từ riêng', itemType: 'properNoun' }))
    ];
  }

  function getWordById(id) {
    return allWords().find(item => item.id === id) || null;
  }

  function preferredChineseVoice() {
    if (!('speechSynthesis' in window) || typeof window.speechSynthesis.getVoices !== 'function') return null;
    const voices = window.speechSynthesis.getVoices() || [];
    return voices.find(voice => /^zh-CN$/i.test(String(voice.lang || '')))
      || voices.find(voice => /^zh(?:-|_)/i.test(String(voice.lang || '')))
      || null;
  }

  function speak(text, button = null) {
    const value = String(text || '').trim();
    if (!value || !('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') return false;
    window.speechSynthesis.cancel();
    document.querySelectorAll('[data-nhsk-speak].is-playing').forEach(node => node.classList.remove('is-playing'));
    const utterance = new window.SpeechSynthesisUtterance(value);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.9;
    const voice = preferredChineseVoice();
    if (voice) utterance.voice = voice;
    if (button) button.classList.add('is-playing');
    const cleanup = () => button?.classList.remove('is-playing');
    utterance.onend = cleanup;
    utterance.onerror = cleanup;
    try {
      window.speechSynthesis.speak(utterance);
      return true;
    } catch (_error) {
      cleanup();
      return false;
    }
  }

  function audioUrl(ref) {
    const lesson = String(state.lessonNumber).padStart(2, '0');
    return `assets/audio/hsk${state.level}/lesson-${lesson}/${encodeURIComponent(ref)}.mp3`;
  }

  function stopTrackAudio() {
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.currentTime = 0;
    }
    if (activeAudioButton) activeAudioButton.classList.remove('is-playing');
    activeAudio = null;
    activeAudioButton = null;
  }

  function playTrack(ref, button) {
    if (!ref) return;
    if (activeAudioButton === button && activeAudio && !activeAudio.paused) {
      activeAudio.pause();
      button.classList.remove('is-playing');
      return;
    }
    stopTrackAudio();
    const audio = new Audio(audioUrl(ref));
    audio.preload = 'metadata';
    audio.setAttribute('playsinline', '');
    activeAudio = audio;
    activeAudioButton = button;
    button.classList.add('is-playing');
    audio.onended = stopTrackAudio;
    audio.onerror = () => {
      button.classList.remove('is-playing');
      button.title = 'Không mở được audio này';
      activeAudio = null;
      activeAudioButton = null;
    };
    audio.play().catch(() => {
      button.classList.remove('is-playing');
      activeAudio = null;
      activeAudioButton = null;
    });
  }

  function mediaBadge(kind, ref) {
    if (!ref) return '';
    if (String(kind).startsWith('Audio')) {
      const label = kind === 'Audio' ? ref : `${kind.replace(/^Audio\s*/u, '')} · ${ref}`;
      return `<button type="button" class="nhsk-media-badge nhsk-media-button" data-nhsk-audio-ref="${attr(ref)}" aria-label="Phát ${attr(kind)} ${attr(ref)}">🔊 ${escapeHtml(label)}</button>`;
    }
    return `<span class="nhsk-media-badge" title="Mã ${escapeHtml(kind)} trong sách">▶ ${escapeHtml(ref)}</span>`;
  }

  function courseLessons(level = state.level) {
    return (state.manifest?.lessons || [])
      .filter(item => Number(item.level) === Number(level) && String(item.status || '').includes('ready'))
      .sort((a, b) => Number(a.lessonNumber || 0) - Number(b.lessonNumber || 0));
  }

  function currentCoursePosition() {
    const all = (state.manifest?.lessons || [])
      .filter(item => String(item.status || '').includes('ready'))
      .sort((a, b) => Number(a.level || 0) - Number(b.level || 0) || Number(a.lessonNumber || 0) - Number(b.lessonNumber || 0));
    const index = all.findIndex(item => Number(item.level) === state.level && Number(item.lessonNumber) === state.lessonNumber);
    return { all, index };
  }

  function renderCourseNav() {
    const levels = state.manifest?.course?.levels || [];
    const lessons = courseLessons();
    const position = currentCoursePosition();
    const current = lessons.find(item => Number(item.lessonNumber) === state.lessonNumber);
    return `<section class="nhsk-course-nav" aria-label="Chọn bài New 3.0">
      <button type="button" class="nhsk-course-nav__step" data-nhsk-course-step="-1" ${position.index <= 0 ? 'disabled' : ''} aria-label="Bài trước">‹</button>
      <label><span>Cấp</span><select data-nhsk-level-select>${levels.map(row => `<option value="${Number(row.level)}" ${Number(row.level) === state.level ? 'selected' : ''}>HSK ${Number(row.level)}</option>`).join('')}</select></label>
      <label class="nhsk-course-nav__lesson"><span>Bài</span><select data-nhsk-lesson-select>${lessons.map(row => `<option value="${Number(row.lessonNumber)}" ${Number(row.lessonNumber) === state.lessonNumber ? 'selected' : ''}>${Number(row.lessonNumber)} · ${escapeHtml(row.title?.vi || row.title?.hanzi || '')}</option>`).join('')}</select></label>
      <button type="button" class="nhsk-course-nav__step" data-nhsk-course-step="1" ${position.index < 0 || position.index >= position.all.length - 1 ? 'disabled' : ''} aria-label="Bài tiếp">›</button>
      <span class="nhsk-course-nav__count">${position.index >= 0 ? position.index + 1 : 0}/${position.all.length}${current ? ` · HSK ${current.level}` : ''}</span>
    </section>`;
  }

  function renderHero(lesson) {
    return `
      <section class="nhsk-hero">
        <div class="nhsk-hero__eyebrow">NEW 3.0 · HSK ${lesson.level} · BÀI ${lesson.lessonNumber}</div>
        <h1 class="nhsk-hero__hanzi">${escapeHtml(lesson.title.hanzi)}</h1>
        <p class="nhsk-hero__pinyin">${escapeHtml(lesson.title.pinyin)}</p>
        <p class="nhsk-hero__vi">${escapeHtml(lesson.title.vi)}</p>
        <div class="nhsk-hero__meta">
          <span>${lesson.stats.vocabulary} từ mới</span>
          <span>${lesson.stats.dialogues} hội thoại</span>
          <span>${lesson.stats.dialogueTurns} câu thoại</span>
          <span>Trang ${escapeHtml(lesson.source.bookPages)}</span>
        </div>
      </section>`;
  }

  function renderToolbar() {
    return `
      <div class="nhsk-toolbar" role="toolbar" aria-label="Chế độ xem bài học">
        <div class="nhsk-tabs" role="tablist" aria-label="Cách trình bày">
          <button type="button" class="nhsk-tab ${state.view === 'book' ? 'is-active' : ''}" data-nhsk-view="book" role="tab" aria-selected="${state.view === 'book'}">Bài học</button>
          <button type="button" class="nhsk-tab ${state.view === 'grouped' ? 'is-active' : ''}" data-nhsk-view="grouped" role="tab" aria-selected="${state.view === 'grouped'}">Nội dung</button>
          <button type="button" class="nhsk-tab ${state.view === 'practice' ? 'is-active' : ''}" data-nhsk-view="practice" role="tab" aria-selected="${state.view === 'practice'}">Luyện tập</button>
        </div>
      </div>`;
  }


  function renderCatalogSwitch() {
    const rows = [
      ['', 'Bài hiện tại'],
      ['topics', 'Chủ đề'],
      ['grammar', 'Ngữ pháp']
    ];
    return `<nav class="nhsk-catalog-switch" aria-label="Danh mục New 3.0">${rows.map(([key, label]) => `<button type="button" class="${state.catalog === key ? 'is-active' : ''}" data-nhsk-catalog="${key}" aria-pressed="${state.catalog === key}">${label}</button>`).join('')}</nav>`;
  }

  function renderCatalogLevelNav() {
    const levels = state.manifest?.course?.levels || [];
    return `<section class="nhsk-catalog-level-nav">
      <label><span>Cấp độ</span><select data-nhsk-catalog-level-select>${levels.map(row => `<option value="${Number(row.level)}" ${Number(row.level) === state.level ? 'selected' : ''}>HSK ${Number(row.level)}</option>`).join('')}</select></label>
      <button type="button" data-nhsk-catalog="">← Về HSK ${state.level} · Bài ${state.lessonNumber}</button>
    </section>`;
  }

  function renderCatalogHero() {
    const grammar = state.catalog === 'grammar';
    return `<section class="nhsk-hero nhsk-catalog-hero">
      <div class="nhsk-hero__eyebrow">NEW 3.0 · HSK ${state.level}</div>
      <h1>${grammar ? 'Ngữ pháp' : 'Chủ đề'}</h1>
      <p>${grammar ? 'Cấu trúc · giải thích · mẹo nhớ · ví dụ theo đúng cấp độ.' : 'Chọn một chủ đề để xem toàn bộ từ, sau đó mở đúng bài nguồn trong New 3.0.'}</p>
    </section>`;
  }

  async function loadCatalogData(level = state.level) {
    const normalizedLevel = Math.max(1, Number(level) || 1);
    if (catalogCache.has(normalizedLevel)) {
      state.catalogData = catalogCache.get(normalizedLevel);
      state.catalogLoading = false;
      state.catalogError = '';
      return state.catalogData;
    }
    state.catalogLoading = true;
    state.catalogError = '';
    render();
    try {
      const response = await fetch(`data/catalog/hsk${normalizedLevel}.json`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Không tải được danh mục HSK ${normalizedLevel} (${response.status}).`);
      const data = await response.json();
      catalogCache.set(normalizedLevel, data);
      if (Number(state.level) === normalizedLevel) state.catalogData = data;
      state.catalogLoading = false;
      render();
      return data;
    } catch (error) {
      state.catalogLoading = false;
      state.catalogError = error instanceof Error ? error.message : String(error);
      render();
      return null;
    }
  }

  async function openCatalog(mode, options = {}) {
    state.catalog = ['topics', 'grammar'].includes(mode) ? mode : '';
    state.grammarPlusId = '';
    state.topicId = state.catalog === 'topics' ? String(options.topicId || '') : '';
    state.grammarId = state.catalog === 'grammar' ? String(options.grammarId || '') : '';
    state.focusWord = '';
    if (options.push !== false) syncUrl(false);
    if (!state.catalog) {
      render();
      return;
    }
    state.catalogData = catalogCache.get(Number(state.level)) || null;
    render();
    if (!state.catalogData) await loadCatalogData(state.level);
  }

  async function navigateCatalogLevel(level) {
    const normalizedLevel = Math.max(1, Number(level) || 1);
    const first = courseLessons(normalizedLevel)[0];
    if (!first) return;
    state.topicId = '';
    state.grammarId = '';
    state.catalogData = catalogCache.get(normalizedLevel) || null;
    await loadLessonData(normalizedLevel, Number(first.lessonNumber), { push: true });
    if (!state.catalogData) await loadCatalogData(normalizedLevel);
  }

  function catalogLessonUrl(lessonNumber, word = '') {
    const url = new URL(window.location.href);
    url.searchParams.set('level', String(state.level));
    url.searchParams.set('lesson', String(lessonNumber));
    url.searchParams.set('view', 'grouped');
    url.searchParams.set('filter', 'vocabulary');
    if (word) url.searchParams.set('focusWord', word);
    else url.searchParams.delete('focusWord');
    url.searchParams.delete('catalog');
    url.searchParams.delete('topic');
    url.searchParams.delete('grammar');
    url.searchParams.delete('practice');
    return `${url.pathname}${url.search}`;
  }

  function renderCatalogLoading() {
    if (state.catalogError) return `<section class="nhsk-error"><h2>Chưa mở được danh mục</h2><p>${escapeHtml(state.catalogError)}</p><button type="button" data-nhsk-catalog-retry>Thử lại</button></section>`;
    return '<section class="nhsk-loading"><span class="nhsk-spinner" aria-hidden="true"></span><span>Đang tải danh mục...</span></section>';
  }

  function selectedCatalogTopic() {
    return (state.catalogData?.topics || []).find(item => item.id === state.topicId) || null;
  }

  function selectedCatalogWord(wordText) {
    const target = String(wordText || '').trim();
    if (!target) return null;
    return (selectedCatalogTopic()?.words || []).find(item => String(item.word || '').trim() === target) || null;
  }

  function topicFlashcardCards(topic = selectedCatalogTopic()) {
    if (!topic) return [];
    return (topic.words || []).map((word, index) => ({
      id: `new-hsk-topic:${state.level}:${topic.id}:${word.word}:${index}`,
      word: String(word.word || '').trim(),
      pinyin: String(word.pinyin || '').trim(),
      meaningVi: String(word.meaningVi || '').trim(),
      cardType: 'vocabulary',
      source: 'new-hsk-topic',
      sourceWord: String(word.word || '').trim(),
      sourceItem: word,
      lessonNumbers: Array.isArray(word.lessonNumbers) ? word.lessonNumbers : []
    })).filter(card => card.word);
  }

  const HSK_CATALOG_ACCENTS = ['#6f9fe8', '#68b982', '#62b9c8', '#9a7fd1', '#e79a62', '#df7fa8', '#7f8fd8', '#68a99f'];

  function hskCatalogAccent(index) {
    const safeIndex = Number.isFinite(Number(index)) ? Number(index) : 0;
    return HSK_CATALOG_ACCENTS[Math.abs(safeIndex) % HSK_CATALOG_ACCENTS.length];
  }

  function formatCatalogMeaning(value, limit = 3) {
    const parts = String(value || '').split(/\s*\/\s*/).map(part => part.trim()).filter(Boolean);
    return parts.length ? parts.slice(0, limit).join(' / ') : '';
  }

  function renderTopicWord(word, index) {
    const lessons = Array.isArray(word.lessons) ? word.lessons : [];
    const hanzi = String(word.word || '').trim();
    const pinyin = String(word.pinyin || '').trim();
    const meaning = formatCatalogMeaning(word.meaningVi || '', 3);
    return `<article class="hsk-item hsk-item-compact hsk-vocab-item hsk-item--accented nhsk-topic-word" style="--hsk-card-accent:${hskCatalogAccent(index)}" data-nhsk-catalog-word="${attr(hanzi)}" tabindex="0" role="button" aria-label="Mở chi tiết ${attr(hanzi)}">
      <div class="hsk-item-main">
        <div class="hsk-word-row">
          <strong class="hsk-word">${escapeHtml(hanzi)}</strong>
          ${pinyin ? `<span class="hsk-pinyin nhsk-pinyin">${escapeHtml(pinyin)}</span>` : ''}
          <span class="hsk-card-actions"><button type="button" class="hsk-speak nhsk-speak" data-nhsk-speak="${attr(hanzi)}" aria-label="Nghe ${attr(hanzi)}">🔊</button></span>
        </div>
        ${meaning ? `<p class="hsk-meaning">${escapeHtml(meaning)}</p>` : '<p class="hsk-meaning is-muted">Chưa có nghĩa tiếng Việt.</p>'}
        <div class="nhsk-hsk-source-links" aria-label="Bài nguồn">
          ${lessons.length ? lessons.map(lesson => `<a href="${attr(catalogLessonUrl(lesson.number, hanzi))}" title="${attr(lesson.title || `Bài ${lesson.number}`)}">Bài ${lesson.number}<span>›</span></a>`).join('') : '<span>Chưa xác định bài nguồn</span>'}
        </div>
      </div>
    </article>`;
  }

  function renderTopicCatalog() {
    if (state.catalogLoading || !state.catalogData) return renderCatalogLoading();
    const topic = selectedCatalogTopic();
    if (state.topicId && !topic) {
      return `<section class="nhsk-card"><div class="nhsk-card__body"><button type="button" class="nhsk-catalog-back" data-nhsk-topic-id="">← Danh sách chủ đề</button><p>Không tìm thấy chủ đề này.</p></div></section>`;
    }
    if (topic) {
      return `<section class="nhsk-topic-detail nhsk-hsk-parity">
        <button type="button" class="nhsk-catalog-back" data-nhsk-topic-id="">← Danh sách chủ đề</button>
        <header class="nhsk-hsk-topic-heading"><span>CHỦ ĐỀ ${String(topic.order || '').padStart(2, '0')}</span><h2>${escapeHtml(topic.title)}</h2><p>${Number(topic.wordCount || topic.words?.length || 0).toLocaleString('vi-VN')} từ · chạm Bài nguồn để mở đúng bài trong New 3.0.</p></header>
        ${renderVocabularyControls({ grouped: true, showFlashcard: true })}
        <div class="nhsk-topic-word-list nhsk-topic-word-list--${state.vocabViewMode} ${state.vocabShowPinyin ? '' : 'is-pinyin-hidden'}">${(topic.words || []).map(renderTopicWord).join('')}</div>
      </section>`;
    }
    const topics = state.catalogData.topics || [];
    return `<section class="hsk-section-library hsk-section-library--topic nhsk-topic-library nhsk-hsk-parity">
      <div class="hsk-section-library-head"><div><h3>Danh sách chủ đề</h3><p>${topics.length.toLocaleString('vi-VN')} / ${topics.length.toLocaleString('vi-VN')} chủ đề</p></div></div>
      <div class="hsk-section-card-list">${topics.map((topicItem, index) => {
        const no = String(topicItem.order || index + 1).padStart(2, '0');
        return `<button type="button" class="hsk-section-card hsk-section-card--topic" data-nhsk-topic-id="${attr(topicItem.id)}">
          <span class="hsk-section-card-badge">CHỦ ĐỀ ${no}</span>
          <strong>${escapeHtml(topicItem.title)}</strong>
          <span class="hsk-section-card-meta">${Number(topicItem.wordCount || 0).toLocaleString('vi-VN')} từ</span>
          <span class="hsk-section-practice">◎ Luyện tập</span>
          <b aria-hidden="true">${no}</b><i aria-hidden="true">›</i>
        </button>`;
      }).join('')}</div>
    </section>`;
  }

  function selectedCatalogGrammar() {
    return (state.catalogData?.grammar || []).find(item => item.id === state.grammarId) || null;
  }

  function renderGrammarCard(item, index = 0, options = {}) {
    const chapterLabel = item.chapter ? `BÀI ${String(item.chapter).padStart(2, '0')}` : 'NGỮ PHÁP';
    const examples = Array.isArray(item.examples) ? item.examples : [];
    const trigger = options.plus === true ? `data-nhsk-grammar-plus-id="${attr(item.id)}"` : `data-nhsk-grammar-id="${attr(item.id)}"`;
    return `<article class="hsk-item hsk-grammar-item hsk-item--accented" style="--hsk-card-accent:${hskCatalogAccent(index)}" tabindex="0" role="button" ${trigger} aria-label="Mở ngữ pháp ${attr(item.topic || '')}">
      <div class="hsk-item-main hsk-grammar-card-main">
        <div class="hsk-grammar-card-meta"><span class="hsk-grammar-chapter-badge">${escapeHtml(chapterLabel)}</span><span class="hsk-grammar-example-count">${examples.length.toLocaleString('vi-VN')} ví dụ</span></div>
        <h3 class="hsk-grammar-topic">${escapeHtml(item.topic || 'Ngữ pháp')}</h3>
        ${item.syntax ? `<p class="hsk-grammar-syntax">${escapeHtml(item.syntax)}</p>` : ''}
        ${item.explanation ? `<p class="hsk-grammar-preview">${escapeHtml(item.explanation)}</p>` : ''}
      </div>
    </article>`;
  }

  function renderGrammarCatalog() {
    if (state.catalogLoading || !state.catalogData) return renderCatalogLoading();
    const items = state.catalogData.grammar || [];
    return `<section class="nhsk-grammar-library nhsk-hsk-parity">
      <div class="nhsk-catalog-heading"><div><span>NEW 3.0</span><h2>Danh sách ngữ pháp</h2></div><p>${items.length} mục</p></div>
      <div class="nhsk-grammar-card-list hsk-list hsk-list--grammar">${items.map(renderGrammarCard).join('')}</div>
    </section>`;
  }

  function renderGrammarPopupBlock(type, label, text, icon = '') {
    if (!text) return '';
    return `<section class="hsk-popup-section hsk-grammar-detail-block hsk-grammar-detail-${type}"><div class="hsk-grammar-detail-head">${icon ? `<span class="hsk-grammar-detail-icon" aria-hidden="true">${escapeHtml(icon)}</span>` : ''}<h4>${escapeHtml(label)}</h4></div><p class="hsk-grammar-text">${escapeHtml(text)}</p></section>`;
  }

  function renderGrammarPopupContent(item, options = {}) {
    const examples = Array.isArray(item?.examples) ? item.examples : [];
    const meta = [`New 3.0`, `HSK ${state.level}`, item?.chapter ? `Bài ${item.chapter}` : '', `${examples.length.toLocaleString('vi-VN')} ví dụ`].filter(Boolean);
    const backLabel = options.plus === true ? 'Quay về NP+' : 'Quay về Ngữ pháp';
    return `<div class="hsk-popup-topbar"><button type="button" class="hsk-popup-back" data-nhsk-grammar-close>← ${backLabel}</button><button type="button" class="hsk-popup-close" data-nhsk-grammar-close aria-label="Đóng">×</button></div>
      <section class="hsk-popup-hero hsk-grammar-hero hsk-grammar-detail-hero"><div><div class="hsk-grammar-hero-kicker">NGỮ PHÁP</div><h3>${escapeHtml(item?.topic || 'Ngữ pháp')}</h3><div class="hsk-grammar-hero-meta">${meta.map(value => `<span>${escapeHtml(value)}</span>`).join('')}</div></div></section>
      <div class="hsk-grammar-detail-stack">
        ${renderGrammarPopupBlock('syntax', 'Cấu trúc', item?.syntax)}
        ${renderGrammarPopupBlock('explanation', 'Giải thích', item?.explanation)}
        ${renderGrammarPopupBlock('tips', 'Mẹo nhớ', item?.tips, '💡')}
        ${renderGrammarPopupBlock('attention', 'Lưu ý', item?.attentions, '!')}
        ${examples.length ? `<section class="hsk-popup-section hsk-grammar-examples hsk-grammar-detail-examples"><div class="hsk-grammar-examples-head"><h4>Ví dụ</h4><span>${examples.length.toLocaleString('vi-VN')} ví dụ</span></div><div class="hsk-grammar-example-list">${examples.map((row, index) => `<article class="hsk-grammar-example-card"><span class="hsk-grammar-example-index">${String(index + 1).padStart(2, '0')}</span><div class="hsk-grammar-example-main"><strong>${escapeHtml(row.chinese || '')}</strong>${row.pinyin ? `<em>${escapeHtml(row.pinyin)}</em>` : ''}${row.vietnamese ? `<span>${escapeHtml(row.vietnamese)}</span>` : ''}</div>${row.chinese ? `<button type="button" class="hsk-grammar-example-speaker nhsk-catalog-grammar-example-speak nhsk-speak" data-nhsk-speak="${attr(row.chinese)}" aria-label="Nghe ${attr(row.chinese)}">🔊</button>` : ''}</article>`).join('')}</div></section>` : ''}
        ${item?.chapter && options.plus !== true ? `<a class="nhsk-catalog-source-lesson" href="${attr(catalogLessonUrl(item.chapter))}">Mở HSK ${state.level} · Bài ${item.chapter} theo sách <span>›</span></a>` : ''}
      </div>`;
  }

  function ensureGrammarPopup() {
    let overlay = document.getElementById('nhskGrammarPopup');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'nhskGrammarPopup';
    overlay.className = 'nhsk-hsk-popup-overlay';
    overlay.hidden = true;
    overlay.innerHTML = '<section class="nhsk-hsk-popup-card" role="dialog" aria-modal="true" aria-label="Chi tiết ngữ pháp"><div class="nhsk-hsk-popup-body"></div></section>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target.closest('[data-nhsk-grammar-close]')) {
        event.preventDefault();
        state.grammarId = '';
        state.grammarPlusId = '';
        overlay.hidden = true;
        document.body.classList.remove('nhsk-modal-open');
        syncUrl(true);
        return;
      }
      const speaker = event.target.closest('[data-nhsk-speak]');
      if (speaker) {
        event.preventDefault();
        event.stopPropagation();
        speak(speaker.dataset.nhskSpeak || '', speaker);
      }
    });
    return overlay;
  }

  function syncGrammarPopup() {
    const overlay = document.getElementById('nhskGrammarPopup');
    const plusMode = !state.catalog && Boolean(state.grammarPlusId);
    const catalogMode = state.catalog === 'grammar' && Boolean(state.grammarId);
    if (!catalogMode && !plusMode) {
      if (overlay) overlay.hidden = true;
      document.body.classList.remove('nhsk-modal-open');
      return;
    }
    const item = plusMode
      ? (state.catalogData?.grammar || []).find(row => row.id === state.grammarPlusId && Number(row.chapter) === Number(state.lessonNumber))
      : selectedCatalogGrammar();
    if (!item) return;
    const target = ensureGrammarPopup();
    target.querySelector('.nhsk-hsk-popup-body').innerHTML = renderGrammarPopupContent(item, { plus: plusMode });
    target.hidden = false;
    document.body.classList.add('nhsk-modal-open');
  }


  function renderCatalog() {
    return state.catalog === 'grammar' ? renderGrammarCatalog() : renderTopicCatalog();
  }

  function focusLessonWord() {
    const word = String(state.focusWord || '').trim();
    if (!word || state.catalog) return;
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const target = Array.from(root.querySelectorAll('[data-vocab-word]')).find(item => item.dataset.vocabWord === word);
      if (!target) return;
      target.classList.add('is-focused-word');
      target.scrollIntoView({ block: 'center', behavior: 'auto' });
      window.setTimeout(() => target.classList.remove('is-focused-word'), 2400);
    }));
  }

  function renderLayerToggle(scope, label) {
    const layers = scope === 'passage' ? state.passageLayers : state.dialogueLayers;
    const buttons = [
      ['hanzi', '汉', 'Hán ngữ'],
      ['pinyin', '拼', 'Pinyin'],
      ['vi', 'Vi', 'Tiếng Việt']
    ];
    return `<div class="nhsk-layer-control">
      <span>${escapeHtml(label)}</span>
      <div class="nhsk-layer-toggle" role="group" aria-label="Chọn ngôn ngữ ${escapeHtml(label)}">
        ${buttons.map(([key, icon, title]) => `<button type="button" class="${layers[key] ? 'is-active' : ''}" data-nhsk-layer-scope="${scope}" data-nhsk-layer="${key}" aria-pressed="${layers[key]}" title="${title}">${icon}</button>`).join('')}
      </div>
    </div>`;
  }

  function renderObjectives(items) {
    return sectionCard('Mục tiêu', `<ol class="nhsk-objectives">${sortByOrder(items).map(item => `<li>${escapeHtml(item.vi)}</li>`).join('')}</ol>`, '目标');
  }

  function renderContext(context) {
    if (!context?.hanzi && !context?.vi) return '';
    return `<blockquote class="nhsk-context"><p class="nhsk-hanzi">${escapeHtml(context.hanzi)}</p><p>${escapeHtml(context.vi)}</p></blockquote>`;
  }

  function selectedSpeakerNames(turn, layers) {
    const names = [];
    if (layers.hanzi && turn.speaker?.hanzi) names.push(turn.speaker.hanzi);
    if (layers.pinyin && turn.speaker?.pinyin) names.push(turn.speaker.pinyin);
    if (layers.vi && turn.speaker?.vi) names.push(turn.speaker.vi);
    return names;
  }

  function renderDialogue(dialogue) {
    const layers = state.dialogueLayers;
    return `<div class="nhsk-dialogue">
      ${sortByOrder(dialogue.turns).map(turn => {
        const speakers = selectedSpeakerNames(turn, layers);
        return `<article class="nhsk-dialogue-turn" data-dialogue-turn-id="${attr(turn.id)}">
          <header><strong>${speakers.map(escapeHtml).join(' · ')}</strong><button type="button" class="nhsk-speak" data-nhsk-speak="${attr(turn.hanzi)}" aria-label="Nghe câu ${attr(turn.hanzi)}">🔊</button></header>
          <div class="nhsk-dialogue-lines">
            ${layers.hanzi ? `<p class="nhsk-dialogue-line nhsk-dialogue-line--hanzi">${escapeHtml(turn.hanzi)}</p>` : ''}
            ${layers.pinyin ? `<p class="nhsk-dialogue-line nhsk-dialogue-line--pinyin">${escapeHtml(turn.pinyin)}</p>` : ''}
            ${layers.vi ? `<p class="nhsk-dialogue-line nhsk-dialogue-line--vi">${escapeHtml(turn.vi)}</p>` : ''}
          </div>
        </article>`;
      }).join('')}
    </div>`;
  }

  function sourceKey(prefix, item, index) {
    return `${prefix}:${item.id}:${index}`;
  }

  function renderVocabularyControls(options = {}) {
    const grouped = options.grouped === true;
    const showFlashcard = options.showFlashcard !== false;
    return `<div class="nhsk-vocab-controls" role="toolbar" aria-label="Hiển thị và học từ vựng">
      ${grouped ? `<div class="nhsk-vocab-view-switch" role="group" aria-label="Kiểu hiển thị từ vựng">
        <button type="button" class="${state.vocabViewMode === 'list' ? 'is-active' : ''}" data-nhsk-vocab-view="list" aria-pressed="${state.vocabViewMode === 'list'}" title="Danh sách">☰</button>
        <button type="button" class="${state.vocabViewMode === 'grid' ? 'is-active' : ''}" data-nhsk-vocab-view="grid" aria-pressed="${state.vocabViewMode === 'grid'}" title="Lưới">▦</button>
      </div>` : ''}
      <button type="button" class="nhsk-icon-toggle ${state.vocabShowPinyin ? 'is-active' : ''}" data-nhsk-vocab-pinyin aria-pressed="${state.vocabShowPinyin}" title="${state.vocabShowPinyin ? 'Ẩn pinyin từ mới' : 'Hiện pinyin từ mới'}">拼</button>
      ${showFlashcard ? '<button type="button" class="nhsk-icon-toggle nhsk-flashcard-button" data-nhsk-open-flashcards title="Học Flashcard" aria-label="Học Flashcard">🎓 <span>Flashcard</span></button>' : ''}
    </div>`;
  }

  function renderVocabulary(items, options = {}) {
    if (!items.length) return '';
    const mode = options.grouped && state.vocabViewMode === 'grid' ? 'grid' : 'list';
    const prefix = options.sourcePrefix || `${state.view}:vocabulary`;
    return `
      ${options.audioRef ? `<div class="nhsk-section-meta">${mediaBadge('Audio từ mới', options.audioRef)}</div>` : ''}
      ${options.showControls ? renderVocabularyControls({ grouped: options.grouped }) : ''}
      <div class="nhsk-vocab-list nhsk-vocab-list--${mode} ${state.vocabShowPinyin ? '' : 'is-pinyin-hidden'}">
        ${sortByOrder(items).map((item, index) => `
          <article class="nhsk-vocab-item" data-vocab-id="${attr(item.id)}" data-vocab-source-key="${attr(sourceKey(prefix, item, index))}" data-vocab-word="${attr(item.hanzi)}">
            <span class="nhsk-vocab-item__order">${item.order}</span>
            <button type="button" class="nhsk-vocab-item__open" data-open-word-detail="${attr(item.id)}" aria-label="Mở tra cứu ${attr(item.hanzi)}">
              <span class="nhsk-vocab-item__word">${escapeHtml(item.hanzi)}</span>
              <span class="nhsk-vocab-item__pinyin">${escapeHtml(item.pinyin)}</span>
              <span class="nhsk-vocab-item__meaning">${escapeHtml(item.vi)}</span>
              <span class="nhsk-vocab-item__meta">${escapeHtml(item.wordClass)}${item.hanViet ? ` · ${escapeHtml(item.hanViet)}` : ''}</span>
              ${item.note ? `<small>${escapeHtml(item.note)}</small>` : ''}
            </button>
            <button type="button" class="nhsk-speak" data-nhsk-speak="${attr(item.hanzi)}" aria-label="Nghe ${attr(item.hanzi)}">🔊</button>
          </article>`).join('')}
      </div>`;
  }

  function renderProperNouns(items, options = {}) {
    if (!items.length) return '';
    const prefix = options.sourcePrefix || `${state.view}:proper-nouns`;
    return `<div class="nhsk-vocab-list nhsk-vocab-list--list ${state.vocabShowPinyin ? '' : 'is-pinyin-hidden'}">${sortByOrder(items).map((item, index) => `
      <article class="nhsk-vocab-item" data-vocab-id="${attr(item.id)}" data-vocab-source-key="${attr(sourceKey(prefix, item, index))}" data-vocab-word="${attr(item.hanzi)}">
        <span class="nhsk-vocab-item__order">${item.order}</span>
        <button type="button" class="nhsk-vocab-item__open" data-open-word-detail="${attr(item.id)}" aria-label="Mở tra cứu ${attr(item.hanzi)}">
          <span class="nhsk-vocab-item__word">${escapeHtml(item.hanzi)}</span>
          <span class="nhsk-vocab-item__pinyin">${escapeHtml(item.pinyin)}</span>
          <span class="nhsk-vocab-item__meaning">${escapeHtml(item.vi)}</span>
          <span class="nhsk-vocab-item__meta">${escapeHtml(item.kind)} · ${escapeHtml(item.hanViet)}</span>
        </button>
        <button type="button" class="nhsk-speak" data-nhsk-speak="${attr(item.hanzi)}" aria-label="Nghe ${attr(item.hanzi)}">🔊</button>
      </article>`).join('')}</div>`;
  }

  function renderNotes(items) {
    return sortByOrder(items).map(item => `<aside class="nhsk-note"><strong>${escapeHtml(item.title)}</strong>${item.hanzi ? `<p class="nhsk-hanzi">${escapeHtml(item.hanzi)}</p>` : ''}<p>${escapeHtml(item.vi)}</p></aside>`).join('');
  }

  function renderActivities(items) {
    return sortByOrder(items).map((item, index) => `<article class="nhsk-activity"><span>${index + 1}</span><div><p class="nhsk-hanzi">${escapeHtml(item.hanzi)}</p><p>${escapeHtml(item.vi)}</p></div></article>`).join('');
  }

  function splitAlignedLines(item) {
    const hanzi = String(item?.hanzi || '').split(/\n+/).map(row => row.trim()).filter(Boolean);
    const pinyin = String(item?.pinyin || '').split(/\n+/).map(row => row.trim()).filter(Boolean);
    const vi = String(item?.vi || '').split(/\n+/).map(row => row.trim()).filter(Boolean);
    const count = Math.max(hanzi.length, pinyin.length, vi.length, 1);
    return Array.from({ length: count }, (_value, index) => ({ hanzi: hanzi[index] || '', pinyin: pinyin[index] || '', vi: vi[index] || '' }));
  }

  function renderPassage(item) {
    const layers = state.passageLayers;
    return `<div class="nhsk-passage">
      ${splitAlignedLines(item).map((row, index) => `<article class="nhsk-dialogue-turn nhsk-passage-turn" data-passage-line="${index + 1}">
        <header><strong>Câu ${index + 1}</strong><button type="button" class="nhsk-speak" data-nhsk-speak="${attr(row.hanzi)}" aria-label="Nghe câu ${index + 1}">🔊</button></header>
        <div class="nhsk-dialogue-lines">
          ${layers.hanzi && row.hanzi ? `<p class="nhsk-dialogue-line nhsk-dialogue-line--hanzi">${escapeHtml(row.hanzi)}</p>` : ''}
          ${layers.pinyin && row.pinyin ? `<p class="nhsk-dialogue-line nhsk-dialogue-line--pinyin">${escapeHtml(row.pinyin)}</p>` : ''}
          ${layers.vi && row.vi ? `<p class="nhsk-dialogue-line nhsk-dialogue-line--vi">${escapeHtml(row.vi)}</p>` : ''}
        </div>
      </article>`).join('')}
    </div>`;
  }

  function renderExtension(item) {
    if (item.markdown) return `<div class="nhsk-extension">${renderMarkdown(item.markdown)}</div>`;
    return `<div class="nhsk-extension">
      ${item.prompt ? `<p class="nhsk-extension__prompt">${escapeHtml(item.prompt)}</p>` : ''}
      ${item.topic ? `<p class="nhsk-extension__topic">${escapeHtml(item.topic)}</p>` : ''}
      ${item.vi ? `<p>${escapeHtml(item.vi)}</p>` : ''}
      ${item.visualDescription ? `<p class="nhsk-visual-description"><strong>Nội dung hình:</strong> ${escapeHtml(item.visualDescription)}</p>` : ''}
      ${mediaBadge('Video', item.videoRef)}
    </div>`;
  }

  function inlineMarkdown(value = '') {
    let html = escapeHtml(value);
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    return html;
  }

  function renderMarkdown(markdown = '') {
    const lines = String(markdown || '').replace(/\r/g, '').split('\n');
    const parts = [];
    let index = 0;
    while (index < lines.length) {
      const raw = lines[index];
      const line = raw.trim();
      if (!line) { index += 1; continue; }
      if (/^\|/.test(line) && index + 1 < lines.length && /^\|?\s*:?-{3,}/.test(lines[index + 1].trim().replace(/^\|/, ''))) {
        const rows = [];
        while (index < lines.length && /^\|/.test(lines[index].trim())) {
          rows.push(lines[index].trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim()));
          index += 1;
        }
        const headers = rows[0] || [];
        const bodyRows = rows.slice(2);
        parts.push(`<div class="nhsk-markdown-table-wrap"><table class="nhsk-markdown-table"><thead><tr>${headers.map(cell => `<th>${inlineMarkdown(cell)}</th>`).join('')}</tr></thead><tbody>${bodyRows.map(row => `<tr>${headers.map((_cell, cellIndex) => `<td>${inlineMarkdown(row[cellIndex] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      const heading = line.match(/^(#{3,6})\s+(.+)$/);
      if (heading) {
        const level = Math.min(5, Math.max(3, heading[1].length));
        parts.push(`<h${level} class="nhsk-markdown-heading">${inlineMarkdown(heading[2].replace(/^\d+(?:\.\d+)*\.\s*/, ''))}</h${level}>`);
        index += 1; continue;
      }
      if (/^>\s?/.test(line)) {
        const rows = [];
        while (index < lines.length && /^>\s?/.test(lines[index].trim())) rows.push(lines[index++].trim().replace(/^>\s?/, ''));
        parts.push(`<blockquote class="nhsk-markdown-quote">${rows.map(row => `<p>${inlineMarkdown(row)}</p>`).join('')}</blockquote>`);
        continue;
      }
      if (/^[-*]\s+/.test(line)) {
        const rows = [];
        while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) rows.push(lines[index++].trim().replace(/^[-*]\s+/, ''));
        parts.push(`<ul class="nhsk-markdown-list">${rows.map(row => `<li>${inlineMarkdown(row)}</li>`).join('')}</ul>`);
        continue;
      }
      if (/^\d+\.\s+/.test(line)) {
        const rows = [];
        while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) rows.push(lines[index++].trim().replace(/^\d+\.\s+/, ''));
        parts.push(`<ol class="nhsk-markdown-list">${rows.map(row => `<li>${inlineMarkdown(row)}</li>`).join('')}</ol>`);
        continue;
      }
      const paragraph = [line];
      index += 1;
      while (index < lines.length) {
        const next = lines[index].trim();
        if (!next || /^(#{3,6})\s+|^\||^>\s?|^[-*]\s+|^\d+\.\s+/.test(next)) break;
        paragraph.push(next); index += 1;
      }
      parts.push(`<p>${paragraph.map(inlineMarkdown).join('<br>')}</p>`);
    }
    return `<div class="nhsk-markdown">${parts.join('')}</div>`;
  }

  function normalizedSectionTitle(value = '') {
    return String(value).replace(/^\s*\d+(?:\.\d+)*\.?\s*/, '').replace(/[—–-]\s*$/u, '').trim().toLowerCase();
  }

  function renderGrammarItems(items = []) {
    return sortByOrder(items).map(item => `<article class="nhsk-group-block nhsk-grammar-item"><h3>${escapeHtml(item.title || 'Ngữ pháp')}</h3>${item.structure ? `<p class="nhsk-grammar-structure"><strong>Cấu trúc:</strong> ${escapeHtml(item.structure)}</p>` : ''}${item.markdown ? renderMarkdown(item.markdown) : `<p>${escapeHtml(item.explanationVi || '')}</p>`}</article>`).join('');
  }

  function renderExampleItems(items = []) {
    return sortByOrder(items).map(item => `<article class="nhsk-group-block"><h3>${escapeHtml(item.title || 'Ví dụ & bài luyện')}</h3>${renderMarkdown(item.markdown || '')}</article>`).join('');
  }

  function renderExerciseItems(items = []) {
    return sortByOrder(items).map(item => `<article class="nhsk-group-block nhsk-exercise-item"><h3>${escapeHtml(item.title || 'Bài tập')}</h3>${item.markdown ? renderMarkdown(item.markdown) : renderActivities([item])}</article>`).join('');
  }

  function renderContentSection(section, lesson, idx) {
    if (!section || section.kind === 'report') return '';
    const title = normalizedSectionTitle(section.title);
    if (section.kind === 'objectives') return renderObjectives(lesson.entities.objectives || []);
    const lessonText = (lesson.entities.lessonTexts || []).find(item => normalizedSectionTitle(item.title) === title);
    const passage = (lesson.entities.passages || []).find(item => normalizedSectionTitle(item.sourceSection || item.title) === title || normalizedSectionTitle(item.title) === title);
    if (passage) return sectionCard(passage.title, `<div class="nhsk-subsection-head">${mediaBadge('Audio bài đọc', passage.audioRef)}${mediaBadge('Audio từ mới', passage.vocabularyAudioRef)}${renderLayerToggle('passage', 'Bài đọc')}</div>${renderPassage(passage)}`, '跟读');
    if (lessonText) return renderLessonText(lessonText, idx);
    if (section.kind === 'grammar') {
      const items = (lesson.entities.grammar || []).filter(item => normalizedSectionTitle(item.sourceSection) === title);
      return sectionCard(section.title, items.length ? renderGrammarItems(items) : renderMarkdown(section.markdown), '语法');
    }
    if (section.kind === 'extension') {
      const item = (lesson.entities.extensions || []).find(row => normalizedSectionTitle(row.title) === title);
      return sectionCard(section.title, item ? renderExtension(item) : renderMarkdown(section.markdown), '彩蛋');
    }
    const eyebrow = section.kind === 'warmup' ? '热身' : section.kind === 'exercise' ? '练习' : section.kind === 'activity' ? '活动' : '';
    return sectionCard(section.title, renderMarkdown(section.markdown), eyebrow, `nhsk-card--content-${escapeHtml(section.kind || 'section')}`);
  }

  function sectionCard(title, body, eyebrow = '', extra = '') {
    return `<section class="nhsk-card ${extra}"><header class="nhsk-card__head">${eyebrow ? `<span>${escapeHtml(eyebrow)}</span>` : ''}<h2>${escapeHtml(title)}</h2></header><div class="nhsk-card__body">${body}</div></section>`;
  }

  function renderLessonText(item, idx) {
    const dialogue = idx.dialogues.get(item.dialogueId);
    const vocab = item.vocabularyIds.map(id => idx.vocabulary.get(id)).filter(Boolean);
    const nouns = item.properNounIds.map(id => idx.properNouns.get(id)).filter(Boolean);
    const notes = item.languageNoteIds.map(id => idx.languageNotes.get(id)).filter(Boolean);
    const activities = item.activityIds.map(id => idx.activities.get(id)).filter(Boolean);
    const body = `
      ${renderContext(item.context)}
      <div class="nhsk-instruction"><span><strong>${escapeHtml(item.instruction.hanzi)}</strong> ${escapeHtml(item.instruction.vi)}</span>${mediaBadge('Audio hội thoại', item.instruction.audioRef)}</div>
      ${item.visualDescription ? `<details class="nhsk-visual"><summary>Nội dung hình trong sách</summary><p>${escapeHtml(item.visualDescription)}</p></details>` : ''}
      ${dialogue ? `<div class="nhsk-subsection-head"><h3>Hội thoại</h3>${renderLayerToggle('dialogue', 'Hội thoại')}</div>${renderDialogue(dialogue)}` : ''}
      ${vocab.length ? `<div class="nhsk-subsection-head"><h3>Từ mới</h3>${renderVocabularyControls({ grouped: false })}</div>${renderVocabulary(vocab, { audioRef: item.vocabularyAudioRef, sourcePrefix: `book:${item.id}`, showControls: false })}` : ''}
      ${nouns.length ? `<h3>Danh từ riêng</h3>${renderProperNouns(nouns, { sourcePrefix: `book:${item.id}:proper` })}` : ''}
      ${notes.length ? `<h3>Gợi ý của Tiểu Ngữ</h3>${renderNotes(notes)}` : ''}
      ${activities.length ? `<h3>Hoạt động</h3>${renderActivities(activities)}` : ''}`;
    return sectionCard(item.title, body, `课文 ${item.order}`);
  }

  function renderBook(lesson) {
    const idx = indexes(lesson);
    return lesson.views.bookFlow.map(ref => {
      if (ref === 'objectives') return renderObjectives(lesson.entities.objectives || []);
      if (idx.contentSections?.has(ref)) return renderContentSection(idx.contentSections.get(ref), lesson, idx);
      if (idx.lessonTexts?.has(ref)) return renderLessonText(idx.lessonTexts.get(ref), idx);
      if (idx.passages?.has(ref)) {
        const item = idx.passages.get(ref);
        return sectionCard(item.title, `<div class="nhsk-subsection-head">${mediaBadge('Audio bài đọc', item.audioRef)}${mediaBadge('Audio từ mới', item.vocabularyAudioRef)}${renderLayerToggle('passage', 'Bài đọc')}</div>${renderPassage(item)}`, '跟读');
      }
      if (idx.extensions?.has(ref)) return sectionCard(idx.extensions.get(ref).title, renderExtension(idx.extensions.get(ref)), '彩蛋');
      return '';
    }).join('');
  }

  const GROUPS = [
    ['vocabulary', 'Từ vựng'],
    ['properNouns', 'Danh từ riêng'],
    ['dialogues', 'Hội thoại'],
    ['languageNotes', 'Ghi chú'],
    ['grammar', 'Ngữ pháp'],
    ['grammarPlus', 'NP+'],
    ['examplesPractice', 'Ví dụ & bài luyện'],
    ['passages', 'Bài đọc / bài vè'],
    ['exercisesActivities', 'Bài tập & hoạt động'],
    ['extensions', 'Nội dung mở rộng']
  ];

  function availableGroups(lesson) {
    const grammarPlus = (state.catalogData?.grammar || []).some(item => Number(item.chapter) === Number(lesson.lessonNumber));
    return GROUPS.filter(([key]) => key === 'grammarPlus' ? grammarPlus : (lesson.views.groupedIndex[key] || []).length > 0);
  }

  function renderGroupFilters(lesson) {
    const groups = availableGroups(lesson);
    if (!groups.some(([key]) => key === state.filter)) state.filter = 'all';
    return `<nav class="nhsk-filters" aria-label="Lọc nội dung">
      <button type="button" class="${state.filter === 'all' ? 'is-active' : ''}" data-nhsk-filter="all">Tất cả</button>
      ${groups.map(([key, label]) => `<button type="button" class="${state.filter === key ? 'is-active' : ''}" data-nhsk-filter="${key}">${label}</button>`).join('')}
    </nav>`;
  }

  function renderGroupedSection(key, label, lesson, idx) {
    const ids = lesson.views.groupedIndex[key] || [];
    const grammarPlusItems = key === 'grammarPlus'
      ? (state.catalogData?.grammar || []).filter(item => Number(item.chapter) === Number(lesson.lessonNumber))
      : [];
    if (!ids.length && !grammarPlusItems.length) return '';
    let body = '';
    if (key === 'vocabulary') body = renderVocabulary(ids.map(id => idx.vocabulary.get(id)).filter(Boolean), { grouped: true, sourcePrefix: 'grouped:vocabulary', showControls: true });
    if (key === 'properNouns') body = `<div class="nhsk-subsection-head">${renderVocabularyControls({ grouped: false })}</div>${renderProperNouns(ids.map(id => idx.properNouns.get(id)).filter(Boolean), { sourcePrefix: 'grouped:proper' })}`;
    if (key === 'dialogues') body = `${renderLayerToggle('dialogue', 'Hội thoại')}${ids.map(id => {
      const item = idx.dialogues.get(id);
      return item ? `<article class="nhsk-group-block"><h3>${escapeHtml(item.sourceHeading.replace(/^\d+(?:\.\d+)*\.\s*/, ''))}</h3>${renderContext(item.context)}${renderDialogue(item)}</article>` : '';
    }).join('')}`;
    if (key === 'languageNotes') body = renderNotes(ids.map(id => idx.languageNotes.get(id)).filter(Boolean));
    if (key === 'passages') body = `${renderLayerToggle('passage', 'Bài đọc')}${ids.map(id => idx.passages.get(id)).filter(Boolean).map(item => `<article class="nhsk-group-block"><h3>${escapeHtml(item.title)}</h3>${mediaBadge('Audio bài đọc', item.audioRef)}${mediaBadge('Audio từ mới', item.vocabularyAudioRef)}${renderPassage(item)}</article>`).join('')}`;
    if (key === 'exercisesActivities') body = renderExerciseItems(ids.map(id => idx.exercises.get(id) || idx.activities.get(id)).filter(Boolean));
    if (key === 'extensions') body = ids.map(id => idx.extensions.get(id)).filter(Boolean).map(renderExtension).join('');
    if (key === 'grammar') body = renderGrammarItems(ids.map(id => idx.grammar.get(id)).filter(Boolean));
    if (key === 'grammarPlus') body = `<div class="nhsk-hsk-parity nhsk-grammar-plus-parity"><div class="nhsk-grammar-plus-intro"><span>NP+</span><p>Ngữ pháp bổ sung theo đúng bài hiện tại; ngữ pháp gốc của sách vẫn nằm ở tab Ngữ pháp.</p></div><div class="nhsk-grammar-card-list hsk-list hsk-list--grammar">${grammarPlusItems.map((item, index) => renderGrammarCard(item, index, { plus: true })).join('')}</div></div>`;
    if (key === 'examplesPractice') body = renderExampleItems(ids.map(id => idx.examplesPractice.get(id)).filter(Boolean));
    return sectionCard(label, body, '', `nhsk-card--${key}`);
  }

  function renderGrouped(lesson) {
    const idx = indexes(lesson);
    return `${renderGroupFilters(lesson)}${availableGroups(lesson)
      .filter(([key]) => state.filter === 'all' || state.filter === key)
      .map(([key, label]) => renderGroupedSection(key, label, lesson, idx))
      .join('')}`;
  }


  const PRACTICE_ACTIVITIES = Object.freeze([
    ['flashcards', '🎓 Flashcard', 'Ôn tổng hợp từ, câu, hội thoại, đoạn và ngữ pháp'],
    ['listening', 'Nghe', 'Xem tất cả câu nghe hoặc luyện từng câu'],
    ['fill', 'Điền từ', 'Điền từ vựng hoặc từ còn thiếu trong câu'],
    ['matching', 'Nối', 'Nối Hán – Pinyin – Việt, câu và ngữ pháp'],
    ['ordering', 'Sắp xếp câu', 'Xếp lại câu bằng cụm từ đã kiểm duyệt'],
    ['typing', 'Gõ câu / đoạn', 'Gõ chữ Hán, pinyin hoặc nghe rồi gõ'],
    ['translateZhVi', 'Dịch Trung → Việt', 'Ôn nghĩa của câu, hội thoại và đoạn'],
    ['translateViZh', 'Dịch Việt → Trung', 'Tái tạo câu tiếng Trung từ nghĩa Việt'],
    ['roleplay', 'Hội thoại', 'Chọn vai, nghe và nhập lời thoại'],
    ['characters', 'Cấu tạo & Bộ thủ', 'Học chữ, xếp bộ thủ, ghép chữ và bút thuận']
  ]);

  const PRACTICE_SOURCE_LABELS = Object.freeze({
    vocabulary: 'Từ vựng',
    properNouns: 'Danh từ riêng',
    sentences: 'Câu',
    dialogues: 'Hội thoại',
    passages: 'Đoạn / bài vè',
    grammar: 'Ngữ pháp'
  });

  function normalizePracticeActivity(value) {
    if (PRACTICE_ACTIVITY_IDS.has(value)) return value;
    return LEGACY_PRACTICE_ACTIVITY_MAP[value] || 'flashcards';
  }

  function readProgress() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(PROGRESS_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_error) {
      return {};
    }
  }

  function saveProgress() {
    try { window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(practiceProgress)); } catch (_error) {}
  }

  function progressFor(id) {
    return practiceProgress[String(id || '')] || {};
  }

  function updatePracticeProgress(id, correct) {
    if (!id) return;
    const current = progressFor(id);
    practiceProgress[id] = {
      ...current,
      correctCount: Number(current.correctCount || 0) + (correct ? 1 : 0),
      wrongCount: Number(current.wrongCount || 0) + (correct ? 0 : 1),
      lastPracticedAt: new Date().toISOString(),
      lastResult: correct ? 'correct' : 'wrong'
    };
    saveProgress();
  }

  function updatePracticeRating(id, rating) {
    if (!id || !['easy', 'review', 'hard'].includes(rating)) return;
    const current = progressFor(id);
    practiceProgress[id] = {
      ...current,
      rating,
      lastPracticedAt: new Date().toISOString()
    };
    saveProgress();
  }


  function normalizePracticeAnswer(value) {
    return String(value || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\s，。！？；：、,.!?;:'"“”‘’（）()\[\]【】—-]+/gu, '');
  }

  function normalizePinyinAnswer(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[1-5]/g, '')
      .toLowerCase()
      .replace(/[^a-züv]/g, '')
      .replace(/v/g, 'ü');
  }

  function acceptedAnswerMatches(value, accepted, mode = 'hanzi') {
    const list = Array.isArray(accepted) ? accepted : [accepted];
    const normalize = mode === 'pinyin' ? normalizePinyinAnswer : normalizePracticeAnswer;
    const input = normalize(value);
    return list.some(answer => normalize(answer) === input);
  }

  function ratingFromProgress(entry = {}) {
    if (entry.rating) return entry.rating;
    const correct = Number(entry.correctCount || 0);
    const wrong = Number(entry.wrongCount || 0);
    if (!entry.lastPracticedAt) return 'unseen';
    if (wrong > correct) return 'hard';
    if (wrong > 0) return 'review';
    return 'easy';
  }

  function practicePlan() {
    return state.lesson?.practicePlan || {};
  }

  function practiceActivityConfig(activity = state.practiceActivity) {
    return practicePlan().activities?.[activity] || { supportedSources: PRACTICE_SOURCE_IDS, defaultSources: PRACTICE_SOURCE_IDS };
  }

  function practiceSourceGroup(id) {
    return practicePlan().sourceGroups?.[id] || { label: PRACTICE_SOURCE_LABELS[id] || id, ids: [] };
  }

  function practiceSourceCount(id) {
    return Array.isArray(practiceSourceGroup(id).ids) ? practiceSourceGroup(id).ids.length : 0;
  }

  function supportedPracticeSources(activity = state.practiceActivity) {
    const config = practiceActivityConfig(activity);
    return (config.supportedSources || PRACTICE_SOURCE_IDS).filter(id => PRACTICE_SOURCE_IDS.includes(id) && practiceSourceCount(id) > 0);
  }

  function selectedPracticeSources(activity = state.practiceActivity) {
    const supported = supportedPracticeSources(activity);
    const saved = Array.isArray(state.practiceSourceSelections?.[activity]) ? state.practiceSourceSelections[activity] : null;
    const defaults = practiceActivityConfig(activity).defaultSources || supported;
    const selected = (saved || defaults).filter(id => supported.includes(id));
    if (selected.length) return selected;
    return supported.slice(0, 1);
  }

  function setSelectedPracticeSources(activity, ids) {
    state.practiceSourceSelections = {
      ...state.practiceSourceSelections,
      [activity]: Array.from(new Set(ids)).filter(id => supportedPracticeSources(activity).includes(id))
    };
    state.practiceActivityStarted = false;
    state.practiceSessionRows = [];
    state.practiceSessionKey = '';
    state.grammarPlusId = '';
    practiceMatchingSession = null;
    clearOrderingAutoNext();
    practiceOrderingSession = null;
    saveSettings();
  }

  function togglePracticeSource(sourceId) {
    const activity = state.practiceActivity;
    const supported = supportedPracticeSources(activity);
    if (sourceId === 'all') {
      setSelectedPracticeSources(activity, supported);
      return;
    }
    const current = selectedPracticeSources(activity);
    const next = current.includes(sourceId) ? current.filter(id => id !== sourceId) : [...current, sourceId];
    if (!next.length) return;
    setSelectedPracticeSources(activity, next);
  }

  function practiceLayerState(activity, fallback = { hanzi: true, pinyin: true, vi: true }, allowEmpty = false) {
    const saved = state.practiceLayers?.[activity];
    if (allowEmpty) {
      const source = saved && typeof saved === 'object' ? saved : fallback;
      return { hanzi: source.hanzi === true, pinyin: source.pinyin === true, vi: source.vi === true };
    }
    return normalizeLayers(saved, fallback);
  }

  function togglePracticeLayer(activity, key) {
    const allowEmpty = activity === 'typingListen';
    const fallback = allowEmpty ? { hanzi: false, pinyin: false, vi: false } : { hanzi: true, pinyin: true, vi: true };
    const current = practiceLayerState(activity, fallback, allowEmpty);
    if (!Object.prototype.hasOwnProperty.call(current, key)) return;
    const activeCount = Object.values(current).filter(Boolean).length;
    if (!allowEmpty && current[key] && activeCount === 1) return;
    state.practiceLayers = { ...state.practiceLayers, [activity]: { ...current, [key]: !current[key] } };
    saveSettings();
    rerenderCurrentContent();
  }

  function renderPracticeLayerToggle(activity, label = 'Hiển thị', options = {}) {
    const allowEmpty = options.allowEmpty === true;
    const fallback = allowEmpty ? { hanzi: false, pinyin: false, vi: false } : { hanzi: true, pinyin: true, vi: true };
    const layers = practiceLayerState(activity, fallback, allowEmpty);
    return `<div class="nhsk-layer-control nhsk-practice-layer-control"><span>${escapeHtml(label)}</span><div class="nhsk-layer-toggle" role="group" aria-label="${escapeHtml(label)}">${[
      ['hanzi', '汉', 'Hán ngữ'], ['pinyin', '拼', 'Pinyin'], ['vi', 'Vi', 'Tiếng Việt']
    ].map(([key, icon, title]) => `<button type="button" class="${layers[key] ? 'is-active' : ''}" data-nhsk-practice-layer-activity="${activity}" data-nhsk-practice-layer="${key}" aria-pressed="${layers[key]}" title="${title}">${icon}</button>`).join('')}</div></div>`;
  }

  function allDialogueTurns() {
    return sortByOrder(state.lesson?.entities?.dialogues || []).flatMap(dialogue => sortByOrder(dialogue.turns || []).map(turn => ({ ...turn, dialogueId: dialogue.id, dialogueTitle: dialogue.sourceHeading, context: dialogue.context })));
  }

  function dialogueTurnById(id) {
    return allDialogueTurns().find(turn => turn.id === id) || null;
  }

  function grammarRows() {
    const idx = indexes(state.lesson);
    const group = practiceSourceGroup('grammar');
    return (group.ids || []).map(id => {
      const grammar = idx.grammar?.get(id);
      if (grammar) return { id, source: 'grammar', kind: 'grammar', hanzi: grammar.structure || grammar.title, pinyin: '', vi: grammar.explanationVi || '', title: grammar.title || 'Ngữ pháp', grammar: { topic: grammar.title || 'Ngữ pháp', pattern: grammar.structure || '', explanation: grammar.explanationVi || '', examples: [] } };
      const note = idx.languageNotes?.get(id);
      if (note) return { id, source: 'grammar', kind: 'grammar', hanzi: note.hanzi || note.title, pinyin: '', vi: note.vi || '', title: note.title || 'Ngữ pháp', grammar: { topic: note.title || 'Ngữ pháp', pattern: note.hanzi || '', explanation: note.vi || '', examples: [] } };
      const word = idx.vocabulary?.get(id);
      if (word) return { id, source: 'grammar', kind: 'grammar', hanzi: word.hanzi, pinyin: word.pinyin, vi: word.note || word.vi, title: `${word.hanzi} · ${word.pinyin}`, grammar: { topic: word.hanzi, pattern: word.hanzi, explanation: word.note || word.vi, examples: lessonSentenceRows(word).map(row => ({ hanzi: row.hanzi, pinyin: row.pinyin, meaning: row.vi })) } };
      return null;
    }).filter(Boolean);
  }

  function practiceRowsForSource(sourceId, activity) {
    const idx = indexes(state.lesson);
    const ids = practiceSourceGroup(sourceId).ids || [];
    if (sourceId === 'vocabulary') return ids.map(id => idx.vocabulary?.get(id)).filter(Boolean).map(item => ({ ...item, source: sourceId, kind: 'word', textId: item.id, hanzi: item.hanzi, pinyin: item.pinyin || '', vi: item.vi || '' }));
    if (sourceId === 'properNouns') return ids.map(id => idx.properNouns?.get(id)).filter(Boolean).map(item => ({ ...item, source: sourceId, kind: 'word', textId: item.id, hanzi: item.hanzi, pinyin: item.pinyin || '', vi: item.vi || '' }));
    if (sourceId === 'sentences') return ids.map(dialogueTurnById).filter(Boolean).map(item => ({ ...item, source: sourceId, kind: 'sentence', textId: item.id }));
    if (sourceId === 'dialogues') {
      const dialogues = ids.map(id => idx.dialogues?.get(id)).filter(Boolean);
      if (activity === 'flashcards') return dialogues.map(item => ({ id: item.id, textId: item.id, source: sourceId, kind: 'dialogue', title: item.sourceHeading.replace(/^\d+(?:\.\d+)*\.\s*/, ''), hanzi: sortByOrder(item.turns || []).map(turn => `${turn.speaker?.hanzi || ''}：${turn.hanzi}`).join('\n'), pinyin: sortByOrder(item.turns || []).map(turn => `${turn.speaker?.pinyin || ''}: ${turn.pinyin}`).join('\n'), vi: sortByOrder(item.turns || []).map(turn => `${turn.speaker?.vi || ''}: ${turn.vi}`).join('\n'), turns: item.turns || [] }));
      return dialogues.flatMap(item => sortByOrder(item.turns || []).map(turn => ({ ...turn, source: sourceId, kind: 'dialogue-turn', textId: turn.id, dialogueId: item.id, dialogueTitle: item.sourceHeading })));
    }
    if (sourceId === 'passages') {
      const passages = ids.map(id => idx.passages?.get(id)).filter(Boolean);
      if (activity === 'flashcards') return passages.map(item => ({ ...item, source: sourceId, kind: 'passage', textId: item.id }));
      return passages.flatMap(item => splitAlignedLines(item).map((row, index) => ({ ...row, id: `${item.id}-line-${index + 1}`, textId: `${item.id}-line-${index + 1}`, source: sourceId, kind: 'passage-line', passageId: item.id, title: item.title, audioRef: item.audioRef })));
    }
    if (sourceId === 'grammar') return grammarRows();
    return [];
  }

  function uniquePracticeRows(rows) {
    const seen = new Set();
    return rows.filter(row => {
      const key = row.textId || row.id || `${row.source}:${row.hanzi}:${row.vi}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function buildPracticeRows(activity = state.practiceActivity) {
    const rows = uniquePracticeRows(selectedPracticeSources(activity).flatMap(source => practiceRowsForSource(source, activity)));
    const ordered = state.practiceOrderMode === 'random' ? seededShuffle(rows, `${state.lesson?.id}:${activity}:${Date.now()}`) : rows;
    const limit = state.practiceCountMode === 'all' ? ordered.length : Math.max(1, Number(state.practiceCountMode) || ordered.length);
    return ordered.slice(0, limit);
  }

  function practicePassages() {
    const ids = new Set(practiceSourceGroup('passages').ids || []);
    return sortByOrder(state.lesson?.entities?.passages || []).filter(item => !ids.size || ids.has(item.id));
  }

  function vocabularyAudioTracks() {
    return sortByOrder(state.lesson?.entities?.lessonTexts || []).filter(item => item.vocabularyAudioRef).map(item => ({ id: item.vocabularyAudioRef, title: `${item.title} · Từ mới`, subtitle: 'Audio từ mới theo sách' }));
  }

  function dialogueAudioTracks() {
    return sortByOrder(state.lesson?.entities?.lessonTexts || []).filter(item => item.instruction?.audioRef).map(item => ({ id: item.instruction.audioRef, title: `${item.title} · Hội thoại`, subtitle: item.context?.vi || '' }));
  }

  function renderTrackList(tracks) {
    return `<div class="nhsk-practice-track-list">${tracks.map(track => `<article><div><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.subtitle || '')}</small></div>${mediaBadge('Audio', track.id)}</article>`).join('')}</div>`;
  }

  function renderCurrentViewContent() {
    if (!state.lesson) return '';
    if (state.catalog) return renderCatalog();
    if (state.view === 'book') return renderBook(state.lesson);
    if (state.view === 'grouped') return renderGrouped(state.lesson);
    return renderPractice(state.lesson);
  }

  function rerenderCurrentContent(options = {}) {
    const container = root.querySelector?.('[data-nhsk-content]');
    if (!container) { render(); return; }
    const anchor = options.anchorElement || container.querySelector?.('.nhsk-filters, .nhsk-practice-subtabs, [data-practice-panel]');
    const anchorTop = Number(anchor?.getBoundingClientRect?.().top);
    const horizontalScroll = Number(anchor?.scrollLeft || 0);
    const oldScrollY = Number(window.scrollY || document.documentElement.scrollTop || 0);
    const preserveAnchor = options.preserveFilter !== false && Number.isFinite(anchorTop);
    container.innerHTML = renderCurrentViewContent();
    saveSettings();
    syncUrl(true);
    if (!preserveAnchor) return;
    const restore = () => {
      const next = container.querySelector?.('.nhsk-filters, .nhsk-practice-subtabs, [data-practice-panel]');
      if (!next) { window.scrollTo({ top: oldScrollY, behavior: 'auto' }); return; }
      next.scrollLeft = horizontalScroll;
      const delta = next.getBoundingClientRect().top - anchorTop;
      if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: 'auto' });
    };
    restore();
    requestAnimationFrame(restore);
  }

  function listeningItemFromRow(row) {
    return {
      id: String(row.textId || row.id || ''),
      text: String(row.hanzi || ''),
      pinyin: String(row.pinyin || ''),
      meaning: String(row.vi || ''),
      speaker: String(row.speaker?.vi || row.title || ''),
      sourceType: 'new-hsk-course',
      sourceId: state.lesson.id,
      sourceTitle: `New 3.0 · HSK ${state.level} · Bài ${state.lessonNumber}`,
      lessonId: state.lesson.id,
      lessonTitle: state.lesson.title.vi,
      sentenceType: row.kind === 'grammar' ? 'grammar-example' : row.kind === 'word' ? 'vocabulary-example' : 'lesson-sentence'
    };
  }

  function openListeningPractice(rows, sourceElement) {
    const items = rows.map(listeningItemFromRow).filter(item => item.id && item.text);
    if (!items.length) return;
    const snapshot = sourceDescriptor(sourceElement?.closest?.('[data-practice-panel]')) || {
      scrollY: window.scrollY || 0,
      view: 'practice',
      filter: state.filter,
      practiceActivity: 'listening'
    };
    snapshot.practiceSourceSelections = state.practiceSourceSelections;
    const token = saveReturnSnapshot(snapshot);
    const returnUrl = new URL(location.href);
    returnUrl.searchParams.set('restoreToken', token);
    const payload = {
      version: 1,
      title: `New 3.0 · HSK ${state.level} · Bài ${state.lessonNumber} · Nghe`,
      items,
      mode: 'dictation',
      shuffle: state.practiceOrderMode === 'random',
      returnUrl: `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`
    };
    try {
      sessionStorage.setItem(EXTERNAL_LISTENING_KEY, JSON.stringify(payload));
      const target = new URL('../listening/index.html', location.href);
      target.searchParams.set('externalPractice', '1');
      location.href = target.href;
    } catch (_error) {}
  }

  function startPracticeSession() {
    const activity = state.practiceActivity;
    const rows = buildPracticeRows(activity);
    if (!rows.length) return;
    if (activity === 'flashcards') { openFlashcards(document.querySelector('[data-nhsk-start-practice]'), buildFlashcardCards(rows)); return; }
    if (activity === 'listening' && state.practiceListeningMode === 'single') { openListeningPractice(rows, document.querySelector('[data-nhsk-start-practice]')); return; }
    state.practiceSessionRows = rows;
    state.practiceSessionKey = `${activity}:${Date.now()}`;
    state.practiceActivityStarted = true;
    practiceMatchingSession = null;
    clearOrderingAutoNext();
    practiceOrderingSession = null;
    rerenderCurrentContent();
  }

  function practiceSourceSelector() {
    const activity = state.practiceActivity;
    const supported = supportedPracticeSources(activity);
    const selected = selectedPracticeSources(activity);
    const allSelected = supported.length > 0 && supported.every(id => selected.includes(id));
    return `<section class="nhsk-practice-source-box"><div class="nhsk-practice-config-head"><div><strong>Nguồn ôn tập</strong><small>Chọn tất cả hoặc từng phần của bài</small></div><span>${selected.length}/${supported.length}</span></div><div class="nhsk-practice-source-chips"><button type="button" class="${allSelected ? 'is-active' : ''}" data-nhsk-practice-source="all">Tất cả</button>${supported.map(id => `<button type="button" class="${selected.includes(id) ? 'is-active' : ''}" data-nhsk-practice-source="${id}">${escapeHtml(PRACTICE_SOURCE_LABELS[id] || id)} <small>${practiceSourceCount(id)}</small></button>`).join('')}</div></section>`;
  }

  function practiceCommonSettings() {
    return `<div class="nhsk-practice-options"><label><span>Thứ tự</span><select data-nhsk-practice-setting="order"><option value="ordered" ${state.practiceOrderMode === 'ordered' ? 'selected' : ''}>Theo bài</option><option value="random" ${state.practiceOrderMode === 'random' ? 'selected' : ''}>Xáo trộn</option></select></label><label><span>Số lượng</span><select data-nhsk-practice-setting="count"><option value="5" ${state.practiceCountMode === '5' ? 'selected' : ''}>5 mục</option><option value="10" ${state.practiceCountMode === '10' ? 'selected' : ''}>10 mục</option><option value="all" ${state.practiceCountMode === 'all' ? 'selected' : ''}>Tất cả</option></select></label></div>`;
  }

  function renderActivitySpecificSettings(activity) {
    if (activity === 'flashcards') return `<div class="nhsk-practice-subtabs"><button type="button" class="${state.practiceFlashcardFilter === 'all' ? 'is-active' : ''}" data-nhsk-flashcard-filter="all">Tất cả</button><button type="button" class="${state.practiceFlashcardFilter === 'unseen' ? 'is-active' : ''}" data-nhsk-flashcard-filter="unseen">Chưa học</button><button type="button" class="${state.practiceFlashcardFilter === 'review' ? 'is-active' : ''}" data-nhsk-flashcard-filter="review">Cần ôn</button><button type="button" class="${state.practiceFlashcardFilter === 'hard' ? 'is-active' : ''}" data-nhsk-flashcard-filter="hard">Khó</button></div>${renderPracticeLayerToggle('flashcards', 'Mặt thẻ')}`;
    if (activity === 'listening') return `<div class="nhsk-practice-subtabs"><button type="button" class="${state.practiceListeningMode === 'all' ? 'is-active' : ''}" data-nhsk-listening-mode="all">Xem tất cả câu nghe</button><button type="button" class="${state.practiceListeningMode === 'single' ? 'is-active' : ''}" data-nhsk-listening-mode="single">Luyện nghe từng câu</button></div>${renderPracticeLayerToggle('listening', 'Transcript')}`;
    if (activity === 'fill') return `<div class="nhsk-practice-options"><label><span>Dạng bài</span><select data-nhsk-practice-setting="fill-mode"><option value="vocabulary" ${state.practiceFillMode === 'vocabulary' ? 'selected' : ''}>Điền từ vựng</option><option value="sentence" ${state.practiceFillMode === 'sentence' ? 'selected' : ''}>Điền từ trong câu</option></select></label>${state.practiceFillMode === 'sentence' ? `<label><span>Vị trí trống</span><select data-nhsk-practice-setting="fill-strategy"><option value="default" ${state.practiceFillStrategy === 'default' ? 'selected' : ''}>Đã biên tập</option><option value="random" ${state.practiceFillStrategy === 'random' ? 'selected' : ''}>Random có ưu tiên ôn/khó</option></select></label>` : ''}</div>${renderPracticeLayerToggle('fill', 'Gợi ý')}`;
    if (activity === 'matching') return `<div class="nhsk-practice-options"><label><span>Kiểu nối</span><select data-nhsk-practice-setting="matching-type"><option value="hanzi-vi" ${state.practiceMatchingType === 'hanzi-vi' ? 'selected' : ''}>Hán ↔ Việt</option><option value="hanzi-pinyin" ${state.practiceMatchingType === 'hanzi-pinyin' ? 'selected' : ''}>Hán ↔ Pinyin</option><option value="pinyin-vi" ${state.practiceMatchingType === 'pinyin-vi' ? 'selected' : ''}>Pinyin ↔ Việt</option><option value="question-answer" ${state.practiceMatchingType === 'question-answer' ? 'selected' : ''}>Câu hỏi ↔ câu trả lời</option><option value="speaker-line" ${state.practiceMatchingType === 'speaker-line' ? 'selected' : ''}>Người nói ↔ câu</option><option value="grammar" ${state.practiceMatchingType === 'grammar' ? 'selected' : ''}>Ngữ pháp ↔ giải thích</option></select></label></div>`;
    if (activity === 'typing') return `<div class="nhsk-practice-subtabs"><button type="button" class="${state.practiceTypingMode === 'hanzi' ? 'is-active' : ''}" data-nhsk-typing-mode="hanzi">Gõ chữ Hán</button><button type="button" class="${state.practiceTypingMode === 'pinyin' ? 'is-active' : ''}" data-nhsk-typing-mode="pinyin">Gõ pinyin</button><button type="button" class="${state.practiceTypingMode === 'listen' ? 'is-active' : ''}" data-nhsk-typing-mode="listen">Nghe rồi gõ</button></div>${state.practiceTypingMode === 'listen' ? renderPracticeLayerToggle('typingListen', 'Gợi ý', { allowEmpty: true }) : renderPracticeLayerToggle('typing', 'Gợi ý')}`;
    if (activity === 'ordering') return `<div class="nhsk-practice-options nhsk-ordering-settings"><label><span>Tự chuyển</span><select data-nhsk-practice-setting="ordering-auto-next"><option value="on" ${state.practiceOrderingAutoNext ? 'selected' : ''}>Bật</option><option value="off" ${!state.practiceOrderingAutoNext ? 'selected' : ''}>Tắt</option></select></label><label><span>Chờ sau khi đúng</span><select data-nhsk-practice-setting="ordering-auto-next-delay" ${state.practiceOrderingAutoNext ? '' : 'disabled'}>${[0, 0.8, 1.2, 2, 3].map(value => `<option value="${value}" ${Number(state.practiceOrderingAutoNextDelay) === value ? 'selected' : ''}>${value === 0 ? 'Ngay' : `${value} giây`}</option>`).join('')}</select></label><label><span>Số câu hiển thị</span><select data-nhsk-practice-setting="ordering-display-count">${[1, 2, 3].map(value => `<option value="${value}" ${Number(state.practiceOrderingDisplayCount) === value ? 'selected' : ''}>${value} câu</option>`).join('')}</select></label></div>${renderPracticeLayerToggle(activity, 'Hiển thị')}`;
    if (activity === 'translateZhVi' || activity === 'translateViZh' || activity === 'roleplay') return renderPracticeLayerToggle(activity, 'Hiển thị');
    if (activity === 'characters') return `<div class="nhsk-practice-subtabs"><button type="button" class="${state.practiceCharacterMode === 'learn' ? 'is-active' : ''}" data-nhsk-character-mode="learn">Học cấu tạo chữ</button><button type="button" class="${state.practiceCharacterMode === 'sort' ? 'is-active' : ''}" data-nhsk-character-mode="sort">Xếp chữ vào thành phần</button><button type="button" class="${state.practiceCharacterMode === 'build' ? 'is-active' : ''}" data-nhsk-character-mode="build">Ghép thành phần thành chữ</button><button type="button" class="${state.practiceCharacterMode === 'write' ? 'is-active' : ''}" data-nhsk-character-mode="write">Cấu tạo và bút thuận</button></div>`;
    return '';
  }

  function renderPracticeMenu() {
    return `<nav class="nhsk-practice-menu" aria-label="Hoạt động luyện tập">${PRACTICE_ACTIVITIES.map(([id, label, description]) => `<button type="button" class="${state.practiceActivity === id ? 'is-active' : ''}" data-nhsk-practice="${id}" aria-pressed="${state.practiceActivity === id}"><strong>${label}</strong><small>${description}</small></button>`).join('')}</nav>`;
  }

  function renderPracticeSetup() {
    const selected = selectedPracticeSources();
    return `<div class="nhsk-practice-setup">${practiceSourceSelector()}${practiceCommonSettings()}${renderActivitySpecificSettings(state.practiceActivity)}<button type="button" class="nhsk-practice-primary" data-nhsk-start-practice ${selected.length ? '' : 'disabled'}>Bắt đầu</button></div>`;
  }

  function buildCharacterPracticeUrl(rows) {
    const glyphs = Array.from(new Set(rows.flatMap(row => Array.from(String(row.hanzi || '')).filter(char => /[\u3400-\u9fff]/u.test(char)))));
    const target = new URL(document.baseURI || location.href);
    target.searchParams.set('level', String(state.level));
    target.searchParams.set('lesson', String(state.lessonNumber));
    target.searchParams.set('view', 'practice');
    target.searchParams.set('practice', 'characters');
    target.searchParams.set('characterMode', 'learn');
    if (glyphs.length) target.searchParams.set('chars', glyphs.join(','));
    return target.href;
  }

  function flashcardSentenceGlossary(text) {
    const sentence = String(text || '').trim();
    if (!sentence) return [];
    const lessonCandidates = [
      ...(state.lesson?.entities?.vocabulary || []),
      ...(state.lesson?.entities?.properNouns || [])
    ].map((item, index) => ({
      word: String(item?.hanzi || '').trim(),
      pinyin: String(item?.pinyin || '').trim(),
      meaningVi: String(item?.vi || '').trim(),
      order: Number(item?.order || index),
      sourcePriority: 0
    }));
    const catalogCandidates = Number(state.level) === 1
      ? (state.catalogData?.topics || []).flatMap(topic => topic?.words || []).map((item, index) => ({
          word: String(item?.word || '').trim(),
          pinyin: String(item?.pinyin || '').trim(),
          meaningVi: String(item?.meaningVi || '').trim(),
          order: Number(item?.order || index),
          sourcePriority: 1
        }))
      : [];
    const candidates = [...lessonCandidates, ...catalogCandidates]
      .filter(item => item.word && sentence.includes(item.word));
    candidates.sort((a, b) => a.sourcePriority - b.sourcePriority || Array.from(b.word).length - Array.from(a.word).length || a.order - b.order);
    const seen = new Set();
    return candidates.filter(item => !seen.has(item.word) && seen.add(item.word)).map(({ word, pinyin, meaningVi }) => ({ word, pinyin, meaningVi }));
  }

  function buildFlashcardCards(rows) {
    const layers = practiceLayerState('flashcards');
    const structurePracticeUrl = buildCharacterPracticeUrl(rows);
    return rows.map(row => {
      const cardType = row.kind === 'grammar' ? 'grammar' : row.kind === 'word' ? 'vocabulary' : 'sentence';
      const card = {
        id: `${state.lesson.id}:${row.textId || row.id}`,
        word: layers.hanzi ? row.hanzi || row.title || row.vi : layers.pinyin ? row.pinyin || row.hanzi : row.vi || row.hanzi,
        pinyin: layers.pinyin ? row.pinyin || '' : '',
        meaningVi: layers.vi ? row.vi || '' : '',
        cardType,
        title: row.title || '',
        source: 'new-hsk-course',
        lessonId: state.lesson.id,
        tokens: Array.isArray(row.orderingTokens) ? row.orderingTokens : (Array.isArray(row.answerTokens) ? row.answerTokens : []),
        wordGlossary: cardType === 'sentence' ? flashcardSentenceGlossary(row.hanzi || '') : []
      };
      if (row.kind === 'grammar') card.grammar = row.grammar;
      card.structurePracticeUrl = structurePracticeUrl;
      return card;
    }).filter(card => card.word);
  }

  function filterFlashcardsByProgress(cards) {
    if (state.practiceFlashcardFilter === 'all') return cards;
    return cards.filter(card => {
      const entityId = card.id.replace(`${state.lesson.id}:`, '');
      return ratingFromProgress(progressFor(entityId)) === state.practiceFlashcardFilter;
    });
  }

  function renderListeningRow(row, activity = 'listening') {
    const layers = practiceLayerState(activity);
    return `<article class="nhsk-practice-listening-row"><div>${layers.hanzi && row.hanzi ? `<b>${escapeHtml(row.hanzi)}</b>` : ''}${layers.pinyin && row.pinyin ? `<small>${escapeHtml(row.pinyin)}</small>` : ''}${layers.vi && row.vi ? `<p>${escapeHtml(row.vi)}</p>` : ''}</div><button type="button" class="nhsk-speak" data-nhsk-speak="${attr(row.hanzi)}" aria-label="Nghe ${attr(row.hanzi)}">🔊</button></article>`;
  }

  function renderListeningSession(rows) {
    if (state.practiceListeningMode === 'single') return sectionCard('Luyện nghe từng câu', '<p>Đang chuyển sang tab Nghe chung để dùng chép chính tả, xáo trộn, câu cần ôn và giữ bàn phím khi phát.</p>', 'NGHE');
    return `${sectionCard('Audio theo sách', renderTrackList([...dialogueAudioTracks(), ...vocabularyAudioTracks(), ...practicePassages().flatMap(item => [item.audioRef ? { id: item.audioRef, title: item.title, subtitle: 'Bài đọc / bài vè' } : null, item.vocabularyAudioRef ? { id: item.vocabularyAudioRef, title: `${item.title} · Từ mới`, subtitle: 'Audio từ mới theo sách' } : null].filter(Boolean))]), 'MP3')}${sectionCard('Tất cả câu nghe', `${renderPracticeLayerToggle('listening', 'Transcript')}<div class="nhsk-practice-sentence-list">${rows.map(row => renderListeningRow(row)).join('')}</div>`, 'NGHE CÂU')}`;
  }

  function curatedFillExercises() {
    const ids = state.practiceFillMode === 'sentence' ? (practicePlan().curatedExerciseIds?.fillSentence || []) : [];
    const index = indexes(state.lesson);
    return ids.map(id => index.exercises?.get(id)).filter(Boolean);
  }

  function candidateWeight(token, sourceId) {
    const entry = progressFor(sourceId || token);
    let weight = entry.rating === 'hard' ? 5 : entry.rating === 'review' ? 3 : entry.rating === 'easy' ? 1 : 2;
    if (Number(entry.wrongCount || 0) > Number(entry.correctCount || 0)) weight += 2;
    const grammarAnswers = new Set((practicePlan().curatedExerciseIds?.fillGrammar || []).map(id => indexes(state.lesson).exercises?.get(id)?.answer).filter(Boolean));
    if (grammarAnswers.has(token)) weight += 3;
    if (token.length > 1) weight += 2;
    return weight;
  }

  function randomBlankFromRow(row, index) {
    const vocabByHanzi = new Map([...(state.lesson.entities.vocabulary || []), ...(state.lesson.entities.properNouns || [])].map(item => [item.hanzi, item.id]));
    const tokens = (row.answerTokens || []).filter(token => token && !/^[，。！？；：、,.!?;:'"“”‘’（）()\[\]【】—-]+$/u.test(token));
    const grammarAnswers = new Set((practicePlan().curatedExerciseIds?.fillGrammar || []).map(id => indexes(state.lesson).exercises?.get(id)?.answer).filter(Boolean));
    const candidates = tokens.filter(token => vocabByHanzi.has(token) || grammarAnswers.has(token));
    if (!candidates.length) return null;
    const weighted = candidates.map(token => ({ token, weight: candidateWeight(token, vocabByHanzi.get(token)) }));
    const seed = `${row.id}:${state.practiceSessionKey}:${index}`;
    const pool = weighted.flatMap(item => Array(Math.max(1, item.weight)).fill(item.token));
    const answer = seededShuffle(pool, seed)[0];
    if (!answer) return null;
    return {
      id: `${row.id}-random-blank`, sourceId: row.id, answer, acceptedAnswers: [answer],
      prompt: { hanzi: String(row.hanzi || '').replace(answer, '___'), pinyin: row.pinyin || '', vi: row.vi || '' },
      hint: 'Từ được ưu tiên theo trạng thái Ôn/Khó và từ mang nghĩa chính.'
    };
  }

  function renderFillCard(item) {
    const layers = practiceLayerState('fill');
    const prompt = item.prompt || item;
    const accepted = item.acceptedAnswers || [item.answer || item.hanzi];
    return `<article class="nhsk-practice-exercise" data-nhsk-fill-card data-entity-id="${attr(item.sourceId || item.id)}"><div class="nhsk-practice-prompt">${layers.hanzi && prompt.hanzi ? `<strong>${escapeHtml(prompt.hanzi)}</strong>` : ''}${layers.pinyin && prompt.pinyin ? `<span>${escapeHtml(prompt.pinyin)}</span>` : ''}${layers.vi && prompt.vi ? `<span>${escapeHtml(prompt.vi)}</span>` : ''}</div><label><span>${state.practiceFillMode === 'vocabulary' ? 'Chữ Hán' : 'Điền phần còn thiếu'}</span><input type="text" lang="zh-CN" autocomplete="off" data-nhsk-fill-input data-accepted="${attr(JSON.stringify(accepted))}" placeholder="Nhập đáp án"></label>${item.hint ? `<small class="nhsk-practice-hint">Gợi ý: ${escapeHtml(item.hint)}</small>` : ''}<button type="button" data-nhsk-check-fill>Kiểm tra</button><output data-nhsk-feedback></output></article>`;
  }

  function renderFillSession(rows) {
    let items = [];
    if (state.practiceFillMode === 'vocabulary') items = rows.filter(row => row.kind === 'word').map(row => ({ id: row.id, sourceId: row.id, prompt: { pinyin: row.pinyin, vi: row.vi }, answer: row.hanzi, acceptedAnswers: [row.hanzi] }));
    else if (state.practiceFillStrategy === 'default') items = curatedFillExercises();
    else items = rows.filter(row => row.hanzi && row.answerTokens).map(randomBlankFromRow).filter(Boolean);
    return sectionCard(state.practiceFillMode === 'vocabulary' ? 'Điền từ vựng' : 'Điền từ trong câu', `<div class="nhsk-practice-exercises">${items.map(renderFillCard).join('') || '<p>Chưa có mục phù hợp với nguồn đã chọn.</p>'}</div>`, 'ĐIỀN');
  }

  function matchingPairsFromRows(rows) {
    if (state.practiceMatchingType === 'question-answer') {
      const turns = rows.filter(row => row.kind === 'sentence' || row.kind === 'dialogue-turn');
      return turns.slice(0, -1).map((row, index) => {
        const next = turns[index + 1];
        if (!next || row.dialogueId !== next.dialogueId) return null;
        return { id: `${row.id}-qa`, leftText: row.hanzi, pinyin: row.pinyin, rightText: next.hanzi || next.vi || '', speechText: row.hanzi };
      }).filter(Boolean);
    }
    if (state.practiceMatchingType === 'speaker-line') return rows.filter(row => row.speaker?.vi).map(row => ({ id: `${row.id}-speaker`, leftText: row.speaker.vi, pinyin: row.speaker.pinyin || '', rightText: row.hanzi, speechText: row.hanzi }));
    if (state.practiceMatchingType === 'grammar') return rows.filter(row => row.kind === 'grammar').map(row => ({ id: row.id, leftText: row.title || row.hanzi, pinyin: row.pinyin || '', rightText: row.vi, speechText: row.hanzi || '' }));
    return rows.filter(row => row.hanzi && (row.pinyin || row.vi)).map(row => {
      if (state.practiceMatchingType === 'hanzi-pinyin') return { id: row.id, leftText: row.hanzi, pinyin: '', rightText: row.pinyin, speechText: row.hanzi };
      if (state.practiceMatchingType === 'pinyin-vi') return { id: row.id, leftText: row.pinyin, pinyin: '', rightText: row.vi, speechText: row.hanzi };
      return { id: row.id, leftText: row.hanzi, pinyin: row.pinyin, rightText: row.vi, speechText: row.hanzi };
    });
  }

  function ensurePracticeMatchingSession(force = false) {
    if (!Matching) return null;
    const rows = state.practiceSessionRows.length ? state.practiceSessionRows : buildPracticeRows('matching');
    const items = matchingPairsFromRows(rows);
    const sourceKind = `${state.lesson?.id || ''}:${state.practiceMatchingType}:${selectedPracticeSources('matching').join(',')}:${state.practiceSessionKey}`;
    if (!force && practiceMatchingSession && practiceMatchingSession.sourceKind === sourceKind) return practiceMatchingSession;
    practiceMatchingSession = Matching.createSession(items, { title: 'Nối nội dung', subtitle: `New 3.0 · HSK ${state.level} · Bài ${state.lessonNumber}`, sourceKind, contentKind: items.some(item => item.leftText?.length > 6) ? 'sentence' : 'word' });
    return practiceMatchingSession;
  }

  function renderPracticeMatching() {
    const session = ensurePracticeMatchingSession();
    return `<section class="nhsk-card nhsk-practice-matching"><div class="nhsk-card__body">${session && session.pairs.length >= 2 ? Matching.render(session, { eyebrow: 'NEW 3.0' }) : '<p>Chưa đủ dữ liệu không mơ hồ để luyện nối.</p>'}</div></section>`;
  }

  function clearOrderingAutoNext() {
    if (practiceOrderingAutoNextTimer) window.clearTimeout(practiceOrderingAutoNextTimer);
    practiceOrderingAutoNextTimer = 0;
  }

  function orderingPageSize() {
    const value = Number(state.practiceOrderingDisplayCount || 1);
    return [1, 2, 3].includes(value) ? value : 1;
  }

  function orderingTokensForRow(row) {
    const reviewed = Array.isArray(row?.orderingTokens) ? row.orderingTokens : [];
    const fallback = Array.isArray(row?.answerTokens) ? row.answerTokens : [];
    const tokens = reviewed.length >= 2 ? reviewed : fallback;
    return tokens.filter(token => token && !/^[，。！？；：、,.!?;:'"“”‘’（）()\[\]【】《》—-]+$/u.test(token));
  }

  function ensurePracticeOrderingSession(rows, force = false) {
    const key = `${state.practiceSessionKey}:${rows.map(row => row.id).join(',')}`;
    if (!force && practiceOrderingSession?.key === key) return practiceOrderingSession;
    clearOrderingAutoNext();
    const items = rows.map(row => ({ row, tokens: orderingTokensForRow(row) })).filter(item => item.tokens.length >= 2).map(({ row, tokens }, index) => ({
      id: row.id,
      row,
      tokens,
      order: index,
      bank: seededShuffle(tokens.map((token, tokenIndex) => ({ id: `${row.id}:token:${tokenIndex}`, token })), `${key}:${index}`),
      selected: [],
      mistakes: 0,
      complete: false,
      feedback: '',
      rating: ''
    }));
    practiceOrderingSession = { key, items, index: 0 };
    return practiceOrderingSession;
  }

  function orderingSuggestedRating(item) {
    if (item.mistakes >= 3) return 'hard';
    if (item.mistakes > 0) return 'review';
    return 'easy';
  }

  function visibleOrderingItems(session) {
    if (!session) return [];
    return session.items.slice(session.index, session.index + orderingPageSize());
  }

  function orderingPageComplete(session) {
    const page = visibleOrderingItems(session);
    return page.length > 0 && page.every(item => item.complete);
  }

  function evaluatePracticeOrderingItem(item) {
    if (!item || item.complete || item.selected.length !== item.tokens.length) return false;
    const answer = item.selected.map(token => token.token).join('');
    if (acceptedAnswerMatches(answer, [item.row.hanzi])) {
      item.complete = true;
      item.rating = orderingSuggestedRating(item);
      item.feedback = `Đúng: ${item.row.hanzi}`;
      updatePracticeProgress(item.id, true);
      updatePracticeRating(item.id, item.rating);
      return true;
    }
    item.mistakes += 1;
    item.feedback = 'Chưa đúng, chạm từ trong câu để đưa xuống và sửa lại.';
    updatePracticeProgress(item.id, false);
    return false;
  }

  function advanceOrderingSession(session) {
    clearOrderingAutoNext();
    if (!session || !orderingPageComplete(session)) return;
    const nextIndex = session.index + orderingPageSize();
    if (nextIndex >= session.items.length) return;
    session.index = nextIndex;
    rerenderCurrentContent({ preserveFilter: true });
  }

  function scheduleOrderingAutoNext(session) {
    clearOrderingAutoNext();
    if (!state.practiceOrderingAutoNext || !orderingPageComplete(session)) return;
    if (session.index + orderingPageSize() >= session.items.length) return;
    const delay = normalizePracticeDelay(state.practiceOrderingAutoNextDelay, 1.2) * 1000;
    practiceOrderingAutoNextTimer = window.setTimeout(() => {
      if (practiceOrderingSession !== session || !orderingPageComplete(session)) return;
      advanceOrderingSession(session);
    }, delay);
  }

  function renderOrderingItem(item, absoluteIndex, total, layers) {
    const selectedIds = new Set(item.selected.map(token => token.id));
    const bank = item.bank.filter(token => !selectedIds.has(token.id));
    const ratingButtons = item.complete ? `<div class="nhsk-auto-rating"><span>Tự phân loại:</span>${[['easy','Dễ'],['review','Ôn'],['hard','Khó']].map(([key,label]) => `<button type="button" class="${item.rating === key ? 'is-active' : ''}" data-nhsk-order-rating="${key}">${label}</button>`).join('')}</div>` : '';
    return `<article class="nhsk-practice-exercise nhsk-order-exercise is-compact" data-nhsk-order-exercise data-nhsk-order-item-id="${attr(item.id)}" data-entity-id="${attr(item.id)}"><div class="nhsk-order-card-head"><span>Câu ${absoluteIndex + 1}/${total}</span><div><button type="button" class="nhsk-speak" data-nhsk-speak="${attr(item.row.hanzi)}" aria-label="Nghe câu">🔊</button><button type="button" class="nhsk-icon-reset" data-nhsk-reset-order aria-label="Đặt lại câu">↺</button></div></div><div class="nhsk-practice-prompt">${layers.vi && item.row.vi ? `<strong>${escapeHtml(item.row.vi)}</strong>` : ''}${layers.pinyin && item.row.pinyin ? `<span>${escapeHtml(item.row.pinyin)}</span>` : ''}${layers.hanzi ? '<small>Sắp xếp các từ/cụm từ thành câu đúng</small>' : ''}</div><div class="nhsk-order-answer" data-nhsk-order-answer>${item.selected.length ? item.selected.map(token => `<button type="button" data-nhsk-order-token="${attr(token.id)}" data-token="${attr(token.token)}" data-token-zone="answer">${escapeHtml(token.token)}</button>`).join('') : '<span>Chạm các từ theo đúng thứ tự</span>'}</div><div class="nhsk-order-bank" data-nhsk-order-bank>${bank.map(token => `<button type="button" data-nhsk-order-token="${attr(token.id)}" data-token="${attr(token.token)}" data-token-zone="bank">${escapeHtml(token.token)}</button>`).join('')}</div><output class="${item.complete ? 'is-correct' : item.feedback ? 'is-wrong' : ''}" data-nhsk-feedback>${escapeHtml(item.feedback)}</output>${ratingButtons}</article>`;
  }

  function renderOrderingSession(rows) {
    const session = ensurePracticeOrderingSession(rows);
    const page = visibleOrderingItems(session);
    if (!page.length) return sectionCard('Sắp xếp câu', '<p>Không có câu đã kiểm duyệt trong nguồn đã chọn.</p>', 'XẾP CÂU');
    const layers = practiceLayerState('ordering');
    const pageComplete = orderingPageComplete(session);
    const hasNext = session.index + page.length < session.items.length;
    const autoNote = pageComplete && hasNext && state.practiceOrderingAutoNext
      ? `<small class="nhsk-order-auto-note">Tự chuyển sau ${normalizePracticeDelay(state.practiceOrderingAutoNextDelay, 1.2)} giây</small>`
      : '';
    const cards = page.map((item, offset) => renderOrderingItem(item, session.index + offset, session.items.length, layers)).join('');
    const footer = pageComplete ? `<div class="nhsk-order-page-actions">${autoNote}<button type="button" data-nhsk-order-next>${hasNext ? (page.length > 1 ? 'Nhóm tiếp →' : 'Câu tiếp →') : 'Hoàn thành'}</button></div>` : '';
    return sectionCard('Sắp xếp câu', `<div class="nhsk-order-page-summary"><span>Hiển thị ${page.length} câu</span><span>${session.items.filter(item => item.complete).length}/${session.items.length} hoàn thành</span></div><div class="nhsk-order-card-list">${cards}</div>${footer}`, 'XẾP CÂU');
  }

  function renderTypingCard(row, direction = 'typing') {
    const typingPinyin = direction === 'typing' && state.practiceTypingMode === 'pinyin';
    const listenOnly = direction === 'typing' && state.practiceTypingMode === 'listen';
    const layers = listenOnly
      ? practiceLayerState('typingListen', { hanzi: false, pinyin: false, vi: false }, true)
      : practiceLayerState(direction === 'typing' ? 'typing' : direction);
    const translateViZh = direction === 'translateViZh';
    const translateZhVi = direction === 'translateZhVi';
    const prompt = translateViZh ? row.vi : translateZhVi ? row.hanzi : listenOnly ? '' : row.vi;
    const expected = typingPinyin ? row.pinyin : translateZhVi ? row.vi : row.hanzi;
    const label = translateZhVi ? 'Nhập nghĩa Việt hoặc tự đối chiếu' : typingPinyin ? 'Gõ pinyin' : 'Gõ chữ Hán';
    const hintLevel = listenOnly ? (layers.hanzi || layers.pinyin ? 'hard' : layers.vi ? 'review' : 'easy') : '';
    return `<article class="nhsk-practice-exercise" data-nhsk-typing-card data-entity-id="${attr(row.id)}" data-mistakes="0" data-hint-level="${hintLevel}"><div class="nhsk-practice-prompt">${listenOnly ? `<button type="button" class="nhsk-practice-listen-big" data-nhsk-speak="${attr(row.hanzi)}">▶ Nghe câu</button>${layers.hanzi && row.hanzi ? `<strong class="nhsk-hanzi">${escapeHtml(row.hanzi)}</strong>` : ''}` : `<strong>${escapeHtml(prompt || '')}</strong>`}${layers.pinyin && !typingPinyin && row.pinyin && !translateViZh ? `<span>${escapeHtml(row.pinyin)}</span>` : ''}${layers.vi && row.vi && !translateViZh && !translateZhVi ? `<span>${escapeHtml(row.vi)}</span>` : ''}</div><label><span>${label}</span><textarea rows="2" lang="${typingPinyin || translateZhVi ? 'vi' : 'zh-CN'}" autocomplete="off" data-nhsk-typing-input placeholder="Nhập đáp án"></textarea></label><div class="nhsk-practice-actions"><button type="button" data-nhsk-check-typing data-accepted="${attr(JSON.stringify([expected]))}" data-self-check="${translateZhVi ? 'true' : 'false'}">Kiểm tra</button>${row.hanzi ? `<button type="button" class="nhsk-speak" data-nhsk-speak="${attr(row.hanzi)}">🔊</button>` : ''}</div><output data-nhsk-feedback></output></article>`;
  }

  function renderTypingSession(rows, direction = 'typing') {
    const eligible = rows.filter(row => row.hanzi && row.vi && row.kind !== 'word');
    const title = direction === 'translateZhVi' ? 'Dịch Trung → Việt' : direction === 'translateViZh' ? 'Dịch Việt → Trung' : state.practiceTypingMode === 'pinyin' ? 'Gõ pinyin' : state.practiceTypingMode === 'listen' ? 'Nghe rồi gõ' : 'Gõ câu / đoạn';
    return sectionCard(title, `<div class="nhsk-practice-exercises">${eligible.map(row => renderTypingCard(row, direction)).join('') || '<p>Chưa có câu phù hợp với nguồn đã chọn.</p>'}</div>`, 'GÕ');
  }

  function practiceSpeakers(rows) {
    const seen = new Set();
    return rows.map(row => row.speaker).filter(speaker => speaker?.hanzi && !seen.has(speaker.hanzi) && seen.add(speaker.hanzi));
  }

  function renderRoleplaySession(rows) {
    const speakers = practiceSpeakers(rows);
    if (!state.practiceRoleSpeaker || !speakers.some(speaker => speaker.hanzi === state.practiceRoleSpeaker)) state.practiceRoleSpeaker = speakers[0]?.hanzi || '';
    const layers = practiceLayerState('roleplay');
    const dialogues = selectedPracticeSources('roleplay').includes('dialogues') ? (practiceSourceGroup('dialogues').ids || []).map(id => indexes(state.lesson).dialogues?.get(id)).filter(Boolean) : [];
    return sectionCard('Nhập vai hội thoại', `<div class="nhsk-role-picker">${speakers.map(speaker => `<button type="button" class="${state.practiceRoleSpeaker === speaker.hanzi ? 'is-active' : ''}" data-nhsk-role-speaker="${attr(speaker.hanzi)}"><strong>${escapeHtml(speaker.vi)}</strong><small>${escapeHtml(speaker.hanzi)} · ${escapeHtml(speaker.pinyin)}</small></button>`).join('')}</div>${dialogues.map(dialogue => `<section class="nhsk-role-dialogue"><h3>${escapeHtml(dialogue.sourceHeading.replace(/^\d+(?:\.\d+)*\.\s*/, ''))}</h3>${sortByOrder(dialogue.turns || []).map(turn => turn.speaker?.hanzi === state.practiceRoleSpeaker ? `<article class="nhsk-practice-exercise nhsk-role-turn" data-nhsk-typing-card data-entity-id="${attr(turn.id)}"><div class="nhsk-role-label">Đến lượt <strong>${escapeHtml(turn.speaker.vi)}</strong></div><div class="nhsk-practice-prompt">${layers.vi ? `<strong>${escapeHtml(turn.vi)}</strong>` : ''}${layers.pinyin ? `<span>${escapeHtml(turn.pinyin)}</span>` : ''}</div><textarea rows="2" lang="zh-CN" data-nhsk-typing-input placeholder="Gõ lời thoại"></textarea><div class="nhsk-practice-actions"><button type="button" data-nhsk-check-typing data-accepted="${attr(JSON.stringify([turn.hanzi]))}">Kiểm tra</button><button type="button" class="nhsk-speak" data-nhsk-speak="${attr(turn.hanzi)}">🔊</button></div><output data-nhsk-feedback></output></article>` : `<article class="nhsk-role-turn nhsk-role-turn--given"><header><strong>${escapeHtml(turn.speaker?.vi || '')}</strong><button type="button" class="nhsk-speak" data-nhsk-speak="${attr(turn.hanzi)}">🔊</button></header>${layers.hanzi ? `<p class="nhsk-hanzi">${escapeHtml(turn.hanzi)}</p>` : ''}${layers.pinyin ? `<small>${escapeHtml(turn.pinyin)}</small>` : ''}${layers.vi ? `<p>${escapeHtml(turn.vi)}</p>` : ''}</article>`).join('')}</section>`).join('')}`, 'NHẬP VAI');
  }

  function characterIndex() {
    return new Map((state.lesson?.entities?.characters || []).map(item => [item.id, item]));
  }

  function characterReturnSnapshot(character, mode = state.practiceCharacterMode) {
    const charId = typeof character === 'object' ? character.id : '';
    const hanzi = typeof character === 'object' ? character.hanzi : String(character || '');
    const card = charId ? document.querySelector(`[data-character-id="${CSS.escape(charId)}"]`) : null;
    return {
      scrollY: window.scrollY || 0,
      sourceViewportTop: Number(card?.getBoundingClientRect?.().top) || 0,
      view: 'practice',
      filter: state.filter,
      practiceActivity: 'characters',
      practiceActivityStarted: true,
      practiceCharacterMode: mode,
      practiceCharacterScope: state.practiceCharacterScope,
      practiceCharacterGlyphs: [...state.practiceCharacterGlyphs],
      characterId: charId,
      characterHanzi: hanzi,
      radicalSession: serializeRadicalSession()
    };
  }

  function buildCharacterReturnUrl(character) {
    const char = typeof character === 'object' ? character.hanzi : String(character || '');
    const snapshot = characterReturnSnapshot(character, state.practiceCharacterMode);
    const token = saveReturnSnapshot(snapshot);
    const returnUrl = new URL(location.href);
    returnUrl.searchParams.set('restoreToken', token);
    const target = new URL('../hanzi-stroke/index.html', document.baseURI || location.href);
    target.searchParams.set('study', 'lookup');
    target.searchParams.set('chars', char);
    target.searchParams.set('return', `${returnUrl.pathname}${returnUrl.search}`);
    target.searchParams.set('returnLabel', `Quay lại chữ ${char}`);
    return target.href;
  }

  function radicalDetailUrl(group, returnCharacter = null) {
    const returnChar = returnCharacter && typeof returnCharacter === 'object' ? returnCharacter.hanzi : String(returnCharacter || '');
    const snapshot = returnChar ? characterReturnSnapshot(returnCharacter, 'learn') : { scrollY: window.scrollY || 0, view: 'practice', filter: state.filter, practiceActivity: 'characters', practiceActivityStarted: true, practiceCharacterMode: 'sort', practiceCharacterScope: state.practiceCharacterScope, practiceCharacterGlyphs: [...state.practiceCharacterGlyphs], radicalSession: serializeRadicalSession() };
    const token = saveReturnSnapshot(snapshot);
    const returnUrl = new URL(location.href);
    returnUrl.searchParams.set('restoreToken', token);
    const target = new URL('../hanzi-stroke/index.html', document.baseURI || location.href);
    target.searchParams.set('study', 'radicals');
    target.searchParams.set('radicalId', group.radicalId);
    target.searchParams.set('return', `${returnUrl.pathname}${returnUrl.search}`);
    target.searchParams.set('returnLabel', returnChar ? `Quay lại chữ ${returnChar}` : 'Quay lại bài xếp chữ');
    if (returnChar) target.searchParams.set('returnChar', returnChar);
    return target.href;
  }

  function vocabularyCharacterEntities() {
    const characters = state.lesson?.entities?.characters || [];
    return characters.filter(item => Array.isArray(item?.sourceRefs?.vocabularyIds) && item.sourceRefs.vocabularyIds.length);
  }

  function effectiveCharacterScope() {
    if (state.practiceCharacterGlyphs.length) return 'selected';
    return Number(state.level) === 1 && state.practiceCharacterScope !== 'core' ? 'all' : 'core';
  }

  function characterEntitiesForScope() {
    const characters = selectedCharacterEntities();
    if (state.practiceCharacterGlyphs.length) return characters;
    if (effectiveCharacterScope() === 'all') {
      const vocabIds = new Set(vocabularyCharacterEntities().map(item => item.id));
      return characters.filter(item => vocabIds.has(item.id));
    }
    const coreIds = new Set(practicePlan().characters?.coreCharacterIds || []);
    return characters.filter(item => coreIds.has(item.id));
  }

  function selectedCharacterEntities() {
    const characters = state.lesson?.entities?.characters || [];
    if (!state.practiceCharacterGlyphs.length) return characters;
    const selected = new Set(state.practiceCharacterGlyphs);
    return characters.filter(item => selected.has(item.hanzi));
  }

  function componentDisplayName(component) {
    const name = String(component?.nameVi || component?.hanViet || '').trim();
    return name ? `${component.glyph} — ${name}` : String(component?.glyph || '');
  }

  function componentMeta(component) {
    const positionMap = { left: 'bên trái', right: 'bên phải', top: 'phía trên', bottom: 'phía dưới', inside: 'bên trong', outside: 'bao ngoài', center: 'ở giữa' };
    return component?.positionVi || positionMap[component?.position] || '';
  }

  function renderCharacterLearn() {
    const charIdx = characterIndex();
    const entityIdx = indexes(state.lesson);
    const scopedCharacters = characterEntitiesForScope();
    const ids = scopedCharacters.map(item => item.id);
    const coreCount = (practicePlan().characters?.coreCharacterIds || []).length;
    const allCount = vocabularyCharacterEntities().length;
    const scope = effectiveCharacterScope();
    const scopeControls = Number(state.level) === 1 && !state.practiceCharacterGlyphs.length
      ? `<div class="nhsk-character-scope-toggle" role="group" aria-label="Phạm vi chữ học"><button type="button" class="${scope === 'all' ? 'is-active' : ''}" data-nhsk-character-scope="all">Tất cả chữ <small>${allCount}</small></button><button type="button" class="${scope === 'core' ? 'is-active' : ''}" data-nhsk-character-scope="core">Chữ trọng tâm <small>${coreCount}</small></button></div>`
      : '';
    const cards = ids.map(id => charIdx.get(id)).filter(Boolean).map(char => {
      const words = (char.sourceRefs?.vocabularyIds || []).map(ref => entityIdx.vocabulary?.get(ref) || entityIdx.properNouns?.get(ref)).filter(Boolean);
      const radical = char.dictionaryRadical || {};
      const radicalLink = radical.radicalId ? radicalDetailUrl(radical, char) : '';
      return `<article class="nhsk-character-learning-card" data-character-id="${attr(char.id)}">
        <header class="nhsk-character-learn-head"><button type="button" class="nhsk-character-detail-trigger" data-nhsk-character-detail="${attr(char.id)}"><strong>${escapeHtml(char.hanzi)}</strong><span><b>${escapeHtml((char.pinyin || []).join(' / '))}</b><small>${escapeHtml((char.meaningsVi || []).join('; '))}</small></span></button><div class="nhsk-practice-actions"><button type="button" class="nhsk-speak" data-nhsk-speak="${attr(char.hanzi)}">🔊</button><a class="nhsk-practice-link" href="${attr(buildCharacterReturnUrl(char))}">✍ Nét</a></div></header>
        <div class="nhsk-character-facts"><article><b>字形 · Hình</b><span>${escapeHtml(char.structure?.labelVi || 'Chưa phân loại')} · ${Number(char.strokes?.count || 0)} nét</span></article><article><b>字音 · Âm</b><span>${escapeHtml((char.pinyin || []).join(' / '))}</span></article><article><b>字义 · Nghĩa</b><span>${escapeHtml((char.meaningsVi || []).join('; '))}</span></article><article><b>Bộ thủ từ điển</b><span>${radicalLink ? `<a href="${attr(radicalLink)}">${escapeHtml(radical.glyph || '')} · ${escapeHtml(radical.nameVi || '')}</a>` : escapeHtml(radical.nameVi || '')}</span></article></div>
        <div><b>Thành phần</b><div class="nhsk-character-components">${(char.components || []).map(component => `<span><b>${escapeHtml(componentDisplayName(component))}</b><small>${escapeHtml(componentMeta(component))}</small></span>`).join('')}</div></div>
        ${words.length ? `<div><b>Từ trong bài</b><div class="nhsk-character-components">${words.map(word => `<button type="button" data-nhsk-word-ref="${attr(word.id)}"><b>${escapeHtml(word.hanzi)}</b><small>${escapeHtml(word.pinyin || '')} · ${escapeHtml(word.vi || '')}</small></button>`).join('')}</div></div>` : ''}
        ${char.pedagogy?.mnemonic?.text ? `<p class="nhsk-practice-hint nhsk-character-mnemonic"><b>Mẹo nhớ:</b> ${escapeHtml(char.pedagogy.mnemonic.text)}</p>` : ''}
        ${char.pedagogy?.commonErrors?.length ? `<p class="nhsk-practice-hint"><b>Lỗi thường gặp:</b> ${escapeHtml(char.pedagogy.commonErrors.join(' '))}</p>` : ''}
      </article>`;
    }).join('');
    return sectionCard('Học cấu tạo chữ', `${scopeControls}<p class="nhsk-practice-help">${scope === 'all' ? 'Học toàn bộ chữ xuất hiện trong từ vựng và danh từ riêng của bài. Chọn Chữ trọng tâm khi muốn ôn nhanh.' : 'Ôn nhóm chữ trọng tâm đã được biên tập cho bài.'}</p><div class="nhsk-character-learning-list">${cards}</div>`, '字');
  }

  function radicalExercise() {
    const id = practicePlan().curatedExerciseIds?.radicalSort?.[0];
    return (state.lesson?.entities?.radicalSortExercises || []).find(item => item.id === id) || null;
  }

  function ensureRadicalSortSession(force = false) {
    const exercise = radicalExercise();
    if (!exercise) return null;
    if (!force && radicalSortSession?.exerciseId === exercise.id) return radicalSortSession;
    radicalSortSession = { exerciseId: exercise.id, roundIndex: 0, completed: new Set(), mistakes: 0, selectedItemId: '', selectedGroupId: '', selectionLead: '', feedback: '', wrongItemId: '', wrongGroupId: '' };
    return radicalSortSession;
  }

  function serializeRadicalSession() {
    if (!radicalSortSession) return null;
    return { ...radicalSortSession, completed: Array.from(radicalSortSession.completed || []) };
  }

  function restoreRadicalSession(snapshot) {
    if (!snapshot?.radicalSession) return;
    radicalSortSession = { ...snapshot.radicalSession, completed: new Set(snapshot.radicalSession.completed || []) };
  }

  function currentRadicalRound(exercise, session) {
    return sortByOrder(exercise.rounds || [])[session.roundIndex] || null;
  }

  function radicalRoundComplete(exercise, session, round) {
    return Boolean(round) && (round.itemIds || []).every(id => session.completed.has(id));
  }

  function handleRadicalAssign(itemId, groupId) {
    const exercise = radicalExercise();
    const session = ensureRadicalSortSession();
    const round = currentRadicalRound(exercise, session);
    if (!exercise || !session || !round || !round.itemIds.includes(itemId) || !round.groupIds.includes(groupId) || session.completed.has(itemId)) return;
    const item = exercise.items.find(row => row.id === itemId);
    const group = exercise.groups.find(row => row.id === groupId);
    if (!item || !group) return;
    const keepSelectedGroup = session.selectionLead === 'group';
    const keepSelectedItem = session.selectionLead === 'item';
    if (item.groupId === groupId) {
      session.completed.add(itemId);
      session.feedback = `Đúng: ${item.hanzi} thuộc ${group.nameVi}.`;
      session.wrongItemId = '';
      session.wrongGroupId = '';
      updatePracticeProgress(item.id, true);
    } else {
      session.mistakes += 1;
      session.feedback = `${item.hanzi} chưa thuộc ${group.nameVi}. Hãy thử lại.`;
      session.wrongItemId = itemId;
      session.wrongGroupId = groupId;
      updatePracticeProgress(item.id, false);
    }
    session.selectedItemId = keepSelectedItem && !session.completed.has(itemId) ? itemId : '';
    session.selectedGroupId = keepSelectedGroup ? groupId : '';
    if (!session.selectedItemId && !session.selectedGroupId) session.selectionLead = '';
    rerenderCurrentContent();
  }

  function selectRadicalItem(itemId) {
    const exercise = radicalExercise();
    const session = ensureRadicalSortSession();
    const round = currentRadicalRound(exercise, session);
    if (!exercise || !session || !round || !round.itemIds.includes(itemId) || session.completed.has(itemId)) return;
    const wasEmpty = !session.selectedItemId && !session.selectedGroupId;
    session.selectedItemId = session.selectedItemId === itemId ? '' : itemId;
    if (wasEmpty && session.selectedItemId) session.selectionLead = 'item';
    if (!session.selectedItemId && !session.selectedGroupId) session.selectionLead = '';
    if (session.selectedItemId && session.selectedGroupId) { handleRadicalAssign(session.selectedItemId, session.selectedGroupId); return; }
    session.feedback = session.selectedItemId ? 'Đã chọn chữ. Hãy chọn bộ thủ.' : session.selectedGroupId ? 'Đã chọn bộ thủ. Hãy chọn chữ.' : '';
    session.wrongItemId = '';
    session.wrongGroupId = '';
    rerenderCurrentContent();
  }

  function selectRadicalGroup(groupId) {
    const exercise = radicalExercise();
    const session = ensureRadicalSortSession();
    const round = currentRadicalRound(exercise, session);
    if (!exercise || !session || !round || !round.groupIds.includes(groupId)) return;
    const wasEmpty = !session.selectedItemId && !session.selectedGroupId;
    session.selectedGroupId = session.selectedGroupId === groupId ? '' : groupId;
    if (wasEmpty && session.selectedGroupId) session.selectionLead = 'group';
    if (!session.selectedItemId && !session.selectedGroupId) session.selectionLead = '';
    if (session.selectedGroupId && session.selectedItemId) { handleRadicalAssign(session.selectedItemId, session.selectedGroupId); return; }
    session.feedback = session.selectedGroupId ? 'Đã chọn bộ thủ. Hãy chọn chữ.' : session.selectedItemId ? 'Đã chọn chữ. Hãy chọn bộ thủ.' : '';
    session.wrongItemId = '';
    session.wrongGroupId = '';
    rerenderCurrentContent();
  }

  function nextRadicalRound() {
    const exercise = radicalExercise();
    const session = ensureRadicalSortSession();
    const round = currentRadicalRound(exercise, session);
    if (!exercise || !session || !radicalRoundComplete(exercise, session, round)) return;
    if (session.roundIndex < exercise.rounds.length - 1) session.roundIndex += 1;
    session.selectedItemId = '';
    session.selectedGroupId = '';
    session.selectionLead = '';
    session.feedback = '';
    session.wrongItemId = '';
    session.wrongGroupId = '';
    rerenderCurrentContent();
  }

  function resetRadicalSort() {
    ensureRadicalSortSession(true);
    rerenderCurrentContent();
  }

  function cleanupRadicalPointerDrag() {
    radicalPointerDrag?.ghost?.remove?.();
    radicalPointerDrag = null;
    document.body?.classList?.remove('nhsk-radical-dragging');
  }

  function moveRadicalPointerDrag(event) {
    if (!radicalPointerDrag || event.pointerId !== radicalPointerDrag.pointerId) return;
    const dx = event.clientX - radicalPointerDrag.startX;
    const dy = event.clientY - radicalPointerDrag.startY;
    if (!radicalPointerDrag.dragging && Math.hypot(dx, dy) < 7) return;
    if (!radicalPointerDrag.dragging) {
      radicalPointerDrag.dragging = true;
      radicalPointerDrag.ghost = radicalPointerDrag.source.cloneNode(true);
      radicalPointerDrag.ghost.classList.add('nhsk-radical-ghost');
      radicalPointerDrag.ghost.removeAttribute('draggable');
      document.body.appendChild(radicalPointerDrag.ghost);
      document.body.classList.add('nhsk-radical-dragging');
    }
    event.preventDefault();
    radicalPointerDrag.ghost.style.transform = `translate3d(${event.clientX - 22}px, ${event.clientY - 22}px, 0)`;
    document.querySelectorAll('[data-radical-drop].is-drag-over').forEach(node => node.classList.remove('is-drag-over'));
    document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-radical-drop]')?.classList?.add('is-drag-over');
  }

  function endRadicalPointerDrag(event) {
    if (!radicalPointerDrag || event.pointerId !== radicalPointerDrag.pointerId) return;
    const payload = radicalPointerDrag;
    const drop = payload.dragging ? document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-radical-drop]') : null;
    document.querySelectorAll('[data-radical-drop].is-drag-over').forEach(node => node.classList.remove('is-drag-over'));
    cleanupRadicalPointerDrag();
    if (payload.dragging) {
      suppressRadicalClickUntil = Date.now() + 350;
      if (drop) handleRadicalAssign(payload.itemId, drop.dataset.radicalDrop || '');
      return;
    }
    selectRadicalItem(payload.itemId);
  }

  function renderRadicalSort() {
    const exercise = radicalExercise();
    const session = ensureRadicalSortSession();
    if (!exercise || !session) return sectionCard('Xếp chữ vào thành phần', '<p>Chưa có dữ liệu đã kiểm duyệt.</p>', '部');
    const round = currentRadicalRound(exercise, session);
    const groups = (round?.groupIds || []).map(id => exercise.groups.find(row => row.id === id)).filter(Boolean);
    const items = (round?.itemIds || []).map(id => exercise.items.find(row => row.id === id)).filter(Boolean);
    const complete = radicalRoundComplete(exercise, session, round);
    const finalRound = session.roundIndex >= exercise.rounds.length - 1;
    return sectionCard('Xếp chữ vào đúng bộ thủ', `<p class="nhsk-practice-help">Chọn theo một trong hai chiều: chữ → bộ thủ hoặc bộ thủ → chữ. Có thể kéo thả.</p><div class="nhsk-radical-status"><strong>Vòng ${session.roundIndex + 1}/${exercise.rounds.length}</strong><span>${session.completed.size}/${exercise.items.length} đúng</span><span>Sai ${session.mistakes}</span></div><div class="nhsk-radical-bank">${items.filter(item => !session.completed.has(item.id)).map(item => `<button type="button" draggable="true" class="nhsk-radical-item ${session.selectedItemId === item.id ? 'is-selected' : ''} ${session.wrongItemId === item.id ? 'is-wrong' : ''}" data-radical-item="${attr(item.id)}">${escapeHtml(item.hanzi)}</button>`).join('') || '<span class="nhsk-radical-bank-empty">Đã xếp hết chữ trong vòng này.</span>'}</div><div class="nhsk-radical-groups">${groups.map(group => `<section class="nhsk-radical-group ${session.selectedGroupId === group.id ? 'is-selected' : ''} ${session.wrongGroupId === group.id ? 'is-wrong' : ''}" data-radical-drop="${attr(group.id)}"><button type="button" class="nhsk-radical-group-select" data-radical-group-select="${attr(group.id)}"><strong>${escapeHtml(group.glyph)}</strong><span><b>${escapeHtml(group.nameVi)}</b><small>${escapeHtml(group.pinyin)} · ${escapeHtml(group.hanViet)}</small></span></button><a class="nhsk-radical-detail-link" href="${attr(radicalDetailUrl(group))}" aria-label="Xem chi tiết ${attr(group.nameVi)}">Chi tiết</a><div class="nhsk-radical-placed">${items.filter(item => session.completed.has(item.id) && item.groupId === group.id).map(item => `<span>${escapeHtml(item.hanzi)}</span>`).join('') || '<small>Chọn hoặc thả chữ</small>'}</div></section>`).join('')}</div><output class="nhsk-radical-feedback ${session.feedback.startsWith('Đúng') ? 'is-correct' : session.feedback && !session.feedback.startsWith('Đã chọn') ? 'is-wrong' : ''}">${escapeHtml(session.feedback)}</output><div class="nhsk-practice-actions">${complete ? finalRound ? '<button type="button" data-nhsk-radical-reset>Làm lại</button>' : '<button type="button" data-nhsk-radical-next>Tiếp tục</button>' : ''}</div>`, '部');
  }

  function renderCharacterBuild() {
    const idx = characterIndex();
    const selectedIds = new Set(selectedCharacterEntities().map(item => item.id));
    const exercises = (state.lesson?.entities?.characterBuildExercises || []).filter(item => !state.practiceCharacterGlyphs.length || selectedIds.has(item.characterId));
    return sectionCard('Ghép thành phần thành chữ', `<div class="nhsk-character-build-list">${exercises.map(item => { const char = idx.get(item.characterId); return `<article class="nhsk-character-build-card" data-character-build="${attr(item.id)}" data-expected="${attr((item.answerComponents || []).join('|'))}"><div class="nhsk-character-build-result"><span>${escapeHtml((char?.pinyin || []).join(' / '))}</span><strong>${escapeHtml((char?.meaningsVi || []).join('; '))}</strong></div><div class="nhsk-character-build-answer" data-character-build-answer><small>Chọn thành phần</small></div><div class="nhsk-character-build-bank">${seededShuffle(item.componentChoices || [], item.id).map(component => `<button type="button" data-character-component="${attr(component)}">${escapeHtml(component)}</button>`).join('')}</div><div class="nhsk-practice-actions"><button type="button" data-character-build-check>Kiểm tra</button><button type="button" data-character-build-reset>Đặt lại</button></div><output data-nhsk-feedback></output></article>`; }).join('')}</div>`, '构');
  }

  function renderCharacterWriting() {
    const chars = characterEntitiesForScope();
    return sectionCard('Cấu tạo và bút thuận', `<div class="nhsk-character-grid">${chars.map(char => `<a href="${attr(buildCharacterReturnUrl(char))}"><span>${escapeHtml(char.hanzi)}</span><small>${escapeHtml((char.pinyin || []).join(' / '))}</small><em>${Number(char.strokes?.count || 0)} nét</em></a>`).join('')}</div>`, '✍');
  }

  function renderCharacterSession() {
    if (state.practiceCharacterMode === 'sort') return renderRadicalSort();
    if (state.practiceCharacterMode === 'build') return renderCharacterBuild();
    if (state.practiceCharacterMode === 'write') return renderCharacterWriting();
    return renderCharacterLearn();
  }

  function renderPracticeSession() {
    const rows = state.practiceSessionRows;
    if (state.practiceActivity === 'listening') return renderListeningSession(rows);
    if (state.practiceActivity === 'fill') return renderFillSession(rows);
    if (state.practiceActivity === 'matching') return renderPracticeMatching();
    if (state.practiceActivity === 'ordering') return renderOrderingSession(rows);
    if (state.practiceActivity === 'typing') return renderTypingSession(rows, 'typing');
    if (state.practiceActivity === 'translateZhVi') return renderTypingSession(rows, 'translateZhVi');
    if (state.practiceActivity === 'translateViZh') return renderTypingSession(rows, 'translateViZh');
    if (state.practiceActivity === 'roleplay') return renderRoleplaySession(rows);
    if (state.practiceActivity === 'characters') return renderCharacterSession();
    return '';
  }

  function renderPractice(lesson) {
    state.practiceActivity = normalizePracticeActivity(state.practiceActivity || lesson.practicePlan?.defaultActivity);
    const setup = state.practiceActivityStarted ? '' : renderPracticeSetup();
    const content = state.practiceActivityStarted ? renderPracticeSession() : '';
    const selectedLabels = selectedPracticeSources().map(id => PRACTICE_SOURCE_LABELS[id] || id).join(' · ');
    const summary = state.practiceActivityStarted ? `<div class="nhsk-practice-session-summary"><span>${escapeHtml(selectedLabels)}</span><span>${state.practiceSessionRows.length || '—'} mục</span></div>` : '';
    return `${renderPracticeMenu()}<section class="nhsk-practice-panel" data-practice-panel="${attr(state.practiceActivity)}"><div class="nhsk-practice-panel-head"><h2>${escapeHtml(PRACTICE_ACTIVITIES.find(row => row[0] === state.practiceActivity)?.[1] || '')}</h2><button type="button" data-nhsk-practice-reset-settings>${state.practiceActivityStarted ? 'Đổi lựa chọn' : 'Cài đặt'}</button></div>${summary}${setup}${content}</section>`;
  }


  function renderSourceAudit(lesson) {
    return `<details class="nhsk-source-audit">
      <summary>Truy vết nguồn và độ phủ</summary>
      <div class="nhsk-source-audit__body">
        <p><strong>Nguồn:</strong> ${escapeHtml(lesson.source.book)}</p>
        <p><strong>Trang PDF:</strong> ${escapeHtml(lesson.source.pdfPages)} · <strong>Trang sách:</strong> ${escapeHtml(lesson.source.bookPages)}</p>
        <div class="nhsk-trace-list">${lesson.source.pageTrace.map(row => `<article><strong>PDF ${row.pdfPage} · Trang ${escapeHtml(row.bookPage)}</strong><span>${escapeHtml(row.content)}</span><small>${escapeHtml(row.status)}</small></article>`).join('')}</div>
      </div>
    </details>`;
  }

  function sourceDescriptor(element) {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const sameWord = Array.from(document.querySelectorAll('[data-vocab-word]')).filter(item => item.dataset.vocabWord === (element.dataset.vocabWord || ''));
    return {
      sourceKey: element.dataset.vocabSourceKey || '',
      sourceWord: element.dataset.vocabWord || '',
      sourceId: element.dataset.vocabId || '',
      sourceOccurrence: Math.max(0, sameWord.indexOf(element)),
      sourceViewportTop: Number(rect.top) || 0,
      scrollY: Number(window.scrollY || document.documentElement.scrollTop || 0),
      view: state.view,
      filter: state.filter,
      practiceActivity: state.practiceActivity
    };
  }

  function findSourceElement(snapshot) {
    if (!snapshot) return null;
    if (snapshot.sourceKey) {
      const exact = Array.from(document.querySelectorAll('[data-vocab-source-key]')).find(item => item.dataset.vocabSourceKey === snapshot.sourceKey);
      if (exact) return exact;
    }
    const candidates = Array.from(document.querySelectorAll('[data-vocab-word]')).filter(item => item.dataset.vocabWord === snapshot.sourceWord);
    return candidates[Number(snapshot.sourceOccurrence) || 0] || candidates[0] || null;
  }

  function restoreWordSourcePosition(snapshot) {
    if (!snapshot) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const characterTarget = snapshot.characterId ? document.querySelector(`[data-character-id="${CSS.escape(snapshot.characterId)}"]`) : null;
      const target = characterTarget || findSourceElement(snapshot);
      if (target && Number.isFinite(Number(snapshot.sourceViewportTop))) {
        const delta = target.getBoundingClientRect().top - Number(snapshot.sourceViewportTop);
        window.scrollBy({ top: delta, behavior: 'auto' });
        target.classList.add('is-returned');
        window.setTimeout(() => target.classList.remove('is-returned'), 1600);
        return;
      }
      window.scrollTo({ top: Math.max(0, Number(snapshot.scrollY) || 0), behavior: 'auto' });
    }));
  }

  function saveReturnSnapshot(snapshot) {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    try { sessionStorage.setItem(`${RETURN_PREFIX}${token}`, JSON.stringify(snapshot)); } catch (_error) {}
    return token;
  }

  function restoreReturnSnapshotFromUrl() {
    const token = params.get('restoreToken');
    if (!token) return;
    let snapshot = null;
    try {
      snapshot = JSON.parse(sessionStorage.getItem(`${RETURN_PREFIX}${token}`) || 'null');
      sessionStorage.removeItem(`${RETURN_PREFIX}${token}`);
    } catch (_error) {}
    if (snapshot) {
      state.view = ['book', 'grouped', 'practice'].includes(snapshot.view) ? snapshot.view : 'book';
      state.filter = snapshot.filter || 'all';
      state.practiceActivity = normalizePracticeActivity(snapshot.practiceActivity || state.practiceActivity);
      if (snapshot.practiceSourceSelections && typeof snapshot.practiceSourceSelections === 'object') state.practiceSourceSelections = snapshot.practiceSourceSelections;
      if (snapshot.practiceCharacterMode) state.practiceCharacterMode = snapshot.practiceCharacterMode;
      if (snapshot.practiceCharacterScope) state.practiceCharacterScope = snapshot.practiceCharacterScope === 'core' ? 'core' : 'all';
      if (Array.isArray(snapshot.practiceCharacterGlyphs)) state.practiceCharacterGlyphs = snapshot.practiceCharacterGlyphs;
      state.practiceActivityStarted = snapshot.practiceActivityStarted === true;
      restoreRadicalSession(snapshot);
      render();
      restoreWordSourcePosition(snapshot);
    }
    try {
      const url = new URL(location.href);
      url.searchParams.delete('restoreToken');
      history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch (_error) {}
  }

  function lessonCacheKey(level, lessonNumber) {
    return `${Number(level)}:${Number(lessonNumber)}`;
  }

  async function loadCatalogLessonData(level, lessonNumber) {
    const key = lessonCacheKey(level, lessonNumber);
    if (Number(state.lesson?.level) === Number(level) && Number(state.lesson?.lessonNumber) === Number(lessonNumber)) {
      lessonDataCache.set(key, state.lesson);
      return state.lesson;
    }
    if (lessonDataCache.has(key)) return lessonDataCache.get(key);
    const lessonInfo = state.manifest?.lessons?.find(item => Number(item.level) === Number(level) && Number(item.lessonNumber) === Number(lessonNumber) && String(item.status || '').includes('ready'));
    if (!lessonInfo) return null;
    const response = await fetch(`data/${lessonInfo.path}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const lesson = await response.json();
    lessonDataCache.set(key, lesson);
    return lesson;
  }

  function lessonRowsContainingWord(lesson, wordText, lessonNumber) {
    const target = String(wordText || '').trim();
    if (!target || !lesson?.entities) return [];
    const rows = [];
    const append = (hanzi, pinyin, vi) => {
      const text = String(hanzi || '').trim();
      if (!text || !text.includes(target)) return;
      rows.push({ hanzi: text, pinyin: String(pinyin || '').trim(), vi: String(vi || '').trim(), lessonNumber: Number(lessonNumber) });
    };
    for (const dialogue of lesson.entities.dialogues || []) {
      for (const turn of dialogue.turns || []) append(turn.hanzi, turn.pinyin, turn.vi);
    }
    for (const passage of lesson.entities.passages || []) {
      for (const row of splitAlignedLines(passage)) append(row.hanzi, row.pinyin, row.vi);
    }
    for (const activity of lesson.entities.activities || []) append(activity.hanzi, activity.pinyin, activity.vi);
    const seen = new Set();
    return rows.filter(row => {
      const key = `${row.hanzi}\u0000${row.pinyin}\u0000${row.vi}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function loadHsk1SentenceIndex() {
    if (!hsk1SentenceIndexPromise) {
      hsk1SentenceIndexPromise = fetch(HSK1_SENTENCE_INDEX_URL)
        .then(response => {
          if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
          return response.json();
        })
        .then(payload => payload?.items && typeof payload.items === 'object' ? payload.items : {})
        .catch(error => {
          console.warn('Không tải được chỉ mục câu HSK 1:', error);
          return {};
        });
    }
    return hsk1SentenceIndexPromise;
  }

  async function catalogWordSentenceRows(catalogWord) {
    const lessonNumbers = Array.from(new Set([
      ...(Array.isArray(catalogWord?.lessonNumbers) ? catalogWord.lessonNumbers : []),
      ...(Array.isArray(catalogWord?.lessons) ? catalogWord.lessons.map(item => item?.number) : [])
    ].map(Number).filter(Number.isFinite)));
    const lessons = await Promise.all(lessonNumbers.map(async lessonNumber => ({
      lessonNumber,
      lesson: await loadCatalogLessonData(state.level, lessonNumber)
    })));
    const rows = lessons.flatMap(entry => lessonRowsContainingWord(entry.lesson, catalogWord?.word, entry.lessonNumber));
    if (Number(state.level) === 1) {
      const sentenceIndex = await loadHsk1SentenceIndex();
      const indexed = sentenceIndex[String(catalogWord?.word || '').trim()]?.sentences || [];
      rows.push(...indexed.map(row => ({
        hanzi: row.chinese || '',
        pinyin: row.pinyin || '',
        vi: row.meaningVi || '',
        lessonNumber: row.lessonNumber || null,
        sourceLabel: row.sourceLabel || ''
      })));
    }
    const seen = new Set();
    return rows.filter(row => {
      const key = String(row.hanzi || '').replace(/\s+/g, '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return row.pinyin && row.vi;
    });
  }

  function lessonSentenceRows(word) {
    const target = String(word?.hanzi || '');
    const rows = [];
    for (const dialogue of state.lesson?.entities?.dialogues || []) {
      for (const turn of dialogue.turns || []) {
        if (turn.hanzi?.includes(target)) rows.push({ hanzi: turn.hanzi, pinyin: turn.pinyin, vi: turn.vi });
      }
    }
    for (const passage of state.lesson?.entities?.passages || []) {
      if (passage.hanzi?.includes(target)) rows.push({ hanzi: passage.hanzi, pinyin: passage.pinyin, vi: passage.vi });
    }
    const seen = new Set();
    return rows.filter(row => !seen.has(row.hanzi) && seen.add(row.hanzi));
  }

  function relatedWords(word) {
    const chars = new Set(Array.from(word?.hanzi || ''));
    return allWords().filter(item => item.id !== word.id && Array.from(item.hanzi || '').some(char => chars.has(char))).slice(0, 6);
  }

  function buildWordDetailSeed(word) {
    return {
      pinyin: word.pinyin || '',
      meaningVi: word.vi || '',
      sampleSentences: lessonSentenceRows(word).map(row => ({ zh: row.hanzi, pinyin: row.pinyin, vi: row.vi })),
      relatedWords: relatedWords(word).map(row => ({ word: row.hanzi, pinyin: row.pinyin, meaningVi: row.vi }))
    };
  }

  function renderWordPreview(word) {
    const sentences = Array.isArray(word.previewSentences) ? word.previewSentences : lessonSentenceRows(word);
    const returnLabel = String(word.returnLabel || 'Quay lại bài').trim();
    return `<div class="nhsk-word-preview-topbar"><button type="button" data-word-popup-back>← ${escapeHtml(returnLabel)}</button><button type="button" data-word-popup-close aria-label="Đóng">×</button></div>
      <section class="nhsk-word-preview-hero"><div><h2>${escapeHtml(word.hanzi)}</h2><strong>${escapeHtml(word.pinyin || '')}</strong><p>${escapeHtml(word.vi || '')}</p><small>${escapeHtml(word.wordClass || word.kind || 'từ vựng')}${word.hanViet ? ` · Hán Việt: ${escapeHtml(word.hanViet)}` : ''}</small></div><button type="button" data-word-popup-speak="${attr(word.hanzi)}">🔊</button></section>
      ${sentences.length ? `<section class="nhsk-word-preview-section"><h3>Câu trong bài</h3>${sentences.slice(0, 3).map(row => `<article><b>${escapeHtml(row.hanzi)}</b><small>${escapeHtml(row.pinyin)}</small><p>${escapeHtml(row.vi)}</p></article>`).join('')}${sentences.length > 3 ? `<p class="nhsk-word-preview-more">Còn ${sentences.length - 3} câu trong phần Xem thêm.</p>` : ''}</section>` : ''}
      <div class="nhsk-word-preview-loading"><span class="nhsk-spinner"></span><span>${word.catalogSentencesLoading ? 'Đang tìm câu liên quan trong các bài nguồn…' : 'Đang mở tra cứu và cách viết…'}</span></div>`;
  }

  function ensureWordDetailFrame() {
    let overlay = document.getElementById('nhskSharedWordDetail');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'nhskSharedWordDetail';
    overlay.className = 'nhsk-shared-detail-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `<section class="nhsk-shared-detail-shell" role="dialog" aria-modal="true" aria-label="Chi tiết từ vựng"><div id="nhskSharedWordPreview" class="nhsk-shared-detail-preview"></div><iframe id="nhskSharedWordDetailFrame" class="nhsk-shared-detail-frame" title="Chi tiết từ vựng" allow="clipboard-write" hidden></iframe></section>`;
    document.body.appendChild(overlay);
    const frame = overlay.querySelector('#nhskSharedWordDetailFrame');
    frame.addEventListener('load', () => { sharedWordDetailFrameReady = true; sendWordDetailOpen(); });
    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target.closest('[data-word-popup-close], [data-word-popup-back]')) { closeWordDetail(); return; }
      const speakButton = event.target.closest('[data-word-popup-speak]');
      if (speakButton) speak(speakButton.dataset.wordPopupSpeak || '');
    });
    return overlay;
  }

  function sendWordDetailOpen() {
    if (!sharedWordDetailFrameReady || !pendingWordDetailPayload) return;
    const frame = document.getElementById('nhskSharedWordDetailFrame');
    const targetOrigin = location.origin && location.origin !== 'null' ? location.origin : '*';
    frame?.contentWindow?.postMessage({ type: 'tiengtrung:hsk-popup-open', payload: pendingWordDetailPayload }, targetOrigin);
  }

  function openWordDetail(wordId, sourceElement) {
    const word = getWordById(wordId);
    if (!word) return;
    activeWordDetail = word;
    activeWordSource = sourceDescriptor(sourceElement);
    pendingWordDetailPayload = {
      word: word.hanzi,
      seed: buildWordDetailSeed(word),
      returnContext: { type: 'external', label: `Quay lại HSK ${state.level} · Bài ${state.lessonNumber}` }
    };
    const overlay = ensureWordDetailFrame();
    const preview = overlay.querySelector('#nhskSharedWordPreview');
    const frame = overlay.querySelector('#nhskSharedWordDetailFrame');
    preview.hidden = false;
    preview.innerHTML = renderWordPreview(word);
    frame.hidden = true;
    overlay.hidden = false;
    document.body.classList.add('nhsk-modal-open');
    if (frame.dataset.initialized !== 'true') {
      frame.dataset.initialized = 'true';
      frame.src = '../hanzi-stroke/index.html?embedPopup=1&popupHost=1';
      return;
    }
    sendWordDetailOpen();
  }

  async function openCatalogWordDetail(wordText, sourceElement) {
    const catalogWord = selectedCatalogWord(wordText);
    const topic = selectedCatalogTopic();
    if (!catalogWord || !topic) return;
    const related = (topic.words || [])
      .filter(item => item !== catalogWord)
      .slice(0, 6)
      .map(item => ({ word: item.word, pinyin: item.pinyin || '', meaningVi: item.meaningVi || '' }));
    const word = {
      id: `catalog:${state.level}:${topic.id}:${catalogWord.word}`,
      hanzi: catalogWord.word,
      pinyin: catalogWord.pinyin || '',
      vi: catalogWord.meaningVi || '',
      wordClass: catalogWord.wordType || 'từ vựng',
      previewSentences: [],
      catalogSentencesLoading: true,
      returnLabel: `Quay lại Chủ đề ${String(topic.order || '').padStart(2, '0')}`
    };
    activeWordDetail = word;
    activeWordSource = sourceDescriptor(sourceElement);
    // Keep the lightweight preview visible while related lesson sentences load.
    // The embedded HSK popup receives one complete payload afterwards, avoiding
    // an empty first render followed by a second navigation of the same word.
    pendingWordDetailPayload = null;
    const overlay = ensureWordDetailFrame();
    const preview = overlay.querySelector('#nhskSharedWordPreview');
    const frame = overlay.querySelector('#nhskSharedWordDetailFrame');
    preview.hidden = false;
    preview.innerHTML = renderWordPreview(word);
    frame.hidden = true;
    overlay.hidden = false;
    document.body.classList.add('nhsk-modal-open');
    if (frame.dataset.initialized !== 'true') {
      frame.dataset.initialized = 'true';
      frame.src = '../hanzi-stroke/index.html?embedPopup=1&popupHost=1';
    }
    const sentences = await catalogWordSentenceRows(catalogWord);
    if (activeWordDetail?.id !== word.id) return;
    word.previewSentences = sentences;
    word.catalogSentencesLoading = false;
    pendingWordDetailPayload = {
      word: word.hanzi,
      seed: {
        pinyin: word.pinyin,
        meaningVi: word.vi,
        sampleSentences: sentences.map(row => ({ zh: row.hanzi, pinyin: row.pinyin, vi: row.vi, lessonNumber: row.lessonNumber })),
        relatedWords: related
      },
      returnContext: { type: 'external', label: word.returnLabel }
    };
    if (!preview.hidden) preview.innerHTML = renderWordPreview(word);
    sendWordDetailOpen();
  }

  function openCharacterDetail(characterId, sourceElement) {
    const char = characterIndex().get(characterId);
    if (!char) return;
    activeWordDetail = {
      id: char.id,
      hanzi: char.hanzi,
      pinyin: (char.pinyin || []).join(' / '),
      hanViet: char.dictionaryRadical?.hanViet || '',
      vi: (char.meaningsVi || []).join('; '),
      note: [char.structure?.labelVi, char.dictionaryRadical?.nameVi].filter(Boolean).join(' · ')
    };
    activeWordSource = sourceDescriptor(sourceElement);
    pendingWordDetailPayload = {
      word: char.hanzi,
      seed: buildWordDetailSeed(activeWordDetail),
      returnContext: { type: 'external', label: `Quay lại chữ ${char.hanzi}` }
    };
    const overlay = ensureWordDetailFrame();
    const preview = overlay.querySelector('#nhskSharedWordPreview');
    const frame = overlay.querySelector('#nhskSharedWordDetailFrame');
    preview.hidden = false;
    preview.innerHTML = renderWordPreview(activeWordDetail);
    frame.hidden = true;
    overlay.hidden = false;
    document.body.classList.add('nhsk-modal-open');
    if (frame.dataset.initialized !== 'true') {
      frame.dataset.initialized = 'true';
      frame.src = '../hanzi-stroke/index.html?embedPopup=1&popupHost=1';
      return;
    }
    sendWordDetailOpen();
  }

  function revealWordDetail(word) {
    if (!activeWordDetail || (word && word !== activeWordDetail.hanzi)) return;
    const overlay = document.getElementById('nhskSharedWordDetail');
    if (!overlay || overlay.hidden) return;
    overlay.querySelector('#nhskSharedWordPreview').hidden = true;
    overlay.querySelector('#nhskSharedWordDetailFrame').hidden = false;
  }

  function closeWordDetail() {
    const overlay = document.getElementById('nhskSharedWordDetail');
    if (overlay) {
      overlay.hidden = true;
      const frame = overlay.querySelector('#nhskSharedWordDetailFrame');
      if (frame) frame.hidden = true;
    }
    const source = activeWordSource;
    activeWordDetail = null;
    activeWordSource = null;
    pendingWordDetailPayload = null;
    document.body.classList.remove('nhsk-modal-open');
    restoreWordSourcePosition(source);
  }

  function openFlashcards(sourceElement, cardsOverride, options = {}) {
    let cards = Array.isArray(cardsOverride) && cardsOverride.length
      ? cardsOverride
      : (state.lesson?.entities?.vocabulary || []).map(word => ({
          id: `${state.lesson.id}:${word.id}`,
          word: word.hanzi,
          pinyin: word.pinyin,
          meaningVi: word.vi,
          cardType: 'vocabulary',
          source: 'new-hsk-course',
          lessonId: state.lesson.id
        }));
    cards = filterFlashcardsByProgress(cards);
    if (!cards.length) return;
    const snapshot = sourceDescriptor(sourceElement?.closest?.('[data-vocab-source-key]') || document.querySelector('[data-vocab-source-key]')) || {
      scrollY: window.scrollY || 0,
      view: state.view,
      filter: state.filter,
      practiceActivity: state.practiceActivity
    };
    snapshot.practiceSourceSelections = state.practiceSourceSelections;
    const token = saveReturnSnapshot(snapshot);
    const returnUrl = new URL(location.href);
    returnUrl.searchParams.set('restoreToken', token);
    const payload = {
      version: 1,
      title: options.title || `New 3.0 · HSK ${state.level} · Bài ${state.lessonNumber} · Ôn tổng hợp`,
      cards,
      origin: 'external',
      contextKey: options.contextKey || `new-hsk-course:${state.lesson.id}:${selectedPracticeSources('flashcards').join(',')}`,
      contextLabel: options.contextLabel || `New 3.0 · HSK ${state.level} · Bài ${state.lessonNumber}`,
      returnUrl: `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`
    };
    try {
      sessionStorage.setItem(HSK_EXTERNAL_FLASHCARD_KEY, JSON.stringify(payload));
      const target = new URL('../hanzi-stroke/index.html', document.baseURI || location.href);
      target.searchParams.set('externalFlashcards', '1');
      location.href = target.href;
    } catch (_error) {}
  }

  function render() {
    if (state.loading) {
      root.innerHTML = '<section class="nhsk-loading"><span class="nhsk-spinner" aria-hidden="true"></span><span>Đang mở bài học...</span></section>';
      return;
    }
    if (state.error || !state.lesson) {
      root.innerHTML = `<section class="nhsk-error"><h1>Chưa mở được bài học</h1><p>${escapeHtml(state.error || 'Không tìm thấy dữ liệu.')}</p><a href="../hanzi-stroke/index.html?study=hsk&curriculum=new_hsk&level=1">Quay lại New 3.0</a></section>`;
      return;
    }
    const content = renderCurrentViewContent();
    const navigation = state.catalog ? renderCatalogLevelNav() : renderCourseNav();
    const hero = state.catalog ? renderCatalogHero() : renderHero(state.lesson);
    const toolbar = state.catalog ? '' : renderToolbar();
    root.innerHTML = `<div class="nhsk-page">${navigation}${renderCatalogSwitch()}${hero}${toolbar}<div class="nhsk-content" data-nhsk-content>${content}</div>${state.catalog ? '' : renderSourceAudit(state.lesson)}</div>`;
    saveSettings();
    syncUrl(true);
    focusLessonWord();
    syncGrammarPopup();
  }

  function toggleLayer(scope, key) {
    const target = scope === 'passage' ? state.passageLayers : state.dialogueLayers;
    if (!Object.prototype.hasOwnProperty.call(target, key)) return;
    const activeCount = Object.values(target).filter(Boolean).length;
    if (target[key] && activeCount === 1) return;
    target[key] = !target[key];
    rerenderCurrentContent({ preserveFilter: true });
  }

  function bindEvents() {
    root.addEventListener('change', event => {
      const catalogLevelSelect = event.target.closest?.('[data-nhsk-catalog-level-select]');
      if (catalogLevelSelect) {
        navigateCatalogLevel(Number(catalogLevelSelect.value || 1));
        return;
      }
      const levelSelect = event.target.closest?.('[data-nhsk-level-select]');
      if (levelSelect) {
        const level = Number(levelSelect.value || 1);
        const first = courseLessons(level)[0];
        if (first) navigateLesson(level, Number(first.lessonNumber));
        return;
      }
      const lessonSelect = event.target.closest?.('[data-nhsk-lesson-select]');
      if (lessonSelect) { navigateLesson(state.level, Number(lessonSelect.value || 1)); return; }
    });
    root.addEventListener('click', event => {
      const catalogButton = event.target.closest('[data-nhsk-catalog]');
      if (catalogButton) {
        event.preventDefault();
        openCatalog(catalogButton.dataset.nhskCatalog || '');
        return;
      }
      const topicButton = event.target.closest('[data-nhsk-topic-id]');
      if (topicButton) {
        event.preventDefault();
        state.topicId = topicButton.dataset.nhskTopicId || '';
        state.grammarId = '';
        syncUrl(false);
        render();
        return;
      }
      const grammarButton = event.target.closest('[data-nhsk-grammar-id]');
      if (grammarButton && state.catalog === 'grammar') {
        event.preventDefault();
        state.grammarId = grammarButton.dataset.nhskGrammarId || '';
        state.topicId = '';
        syncUrl(false);
        syncGrammarPopup();
        return;
      }
      const grammarPlusButton = event.target.closest('[data-nhsk-grammar-plus-id]');
      if (grammarPlusButton && !state.catalog) {
        event.preventDefault();
        state.grammarPlusId = grammarPlusButton.dataset.nhskGrammarPlusId || '';
        syncUrl(false);
        syncGrammarPopup();
        return;
      }
      const catalogRetry = event.target.closest('[data-nhsk-catalog-retry]');
      if (catalogRetry) {
        event.preventDefault();
        catalogCache.delete(Number(state.level));
        state.catalogData = null;
        loadCatalogData(state.level);
        return;
      }
      const courseStep = event.target.closest('[data-nhsk-course-step]');
      if (courseStep) {
        const position = currentCoursePosition();
        const target = position.all[position.index + Number(courseStep.dataset.nhskCourseStep || 0)];
        if (target) navigateLesson(Number(target.level), Number(target.lessonNumber));
        return;
      }
      const view = event.target.closest('[data-nhsk-view]');
      if (view) { state.view = ['book', 'grouped', 'practice'].includes(view.dataset.nhskView) ? view.dataset.nhskView : 'book'; state.filter = 'all'; state.grammarPlusId = ''; render(); return; }
      const layer = event.target.closest('[data-nhsk-layer-scope][data-nhsk-layer]');
      if (layer) { toggleLayer(layer.dataset.nhskLayerScope, layer.dataset.nhskLayer); return; }
      const vocabPinyin = event.target.closest('[data-nhsk-vocab-pinyin]');
      if (vocabPinyin) { state.vocabShowPinyin = !state.vocabShowPinyin; render(); return; }
      const vocabView = event.target.closest('[data-nhsk-vocab-view]');
      if (vocabView) { state.vocabViewMode = vocabView.dataset.nhskVocabView === 'grid' ? 'grid' : 'list'; render(); return; }
      const filter = event.target.closest('[data-nhsk-filter]');
      if (filter) { state.filter = filter.dataset.nhskFilter || 'all'; state.grammarPlusId = ''; rerenderCurrentContent({ preserveFilter: true }); return; }
      const practice = event.target.closest('[data-nhsk-practice]');
      if (practice) {
        state.practiceActivity = normalizePracticeActivity(practice.dataset.nhskPractice || 'flashcards');
        state.practiceActivityStarted = false;
        state.practiceSessionRows = [];
        state.practiceSessionKey = '';
        practiceMatchingSession = null;
        clearOrderingAutoNext();
        practiceOrderingSession = null;
        rerenderCurrentContent({ preserveFilter: true });
        return;
      }
      const sourceChip = event.target.closest('[data-nhsk-practice-source]');
      if (sourceChip) { togglePracticeSource(sourceChip.dataset.nhskPracticeSource || ''); rerenderCurrentContent({ preserveFilter: true }); return; }
      const practiceLayer = event.target.closest('[data-nhsk-practice-layer-activity][data-nhsk-practice-layer]');
      if (practiceLayer) { togglePracticeLayer(practiceLayer.dataset.nhskPracticeLayerActivity || state.practiceActivity, practiceLayer.dataset.nhskPracticeLayer || 'hanzi'); return; }
      const startPractice = event.target.closest('[data-nhsk-start-practice]');
      if (startPractice) { startPracticeSession(); return; }
      const resetPractice = event.target.closest('[data-nhsk-practice-reset-settings]');
      if (resetPractice) { state.practiceActivityStarted = false; state.practiceSessionRows = []; state.practiceSessionKey = ''; practiceMatchingSession = null; clearOrderingAutoNext(); practiceOrderingSession = null; rerenderCurrentContent({ preserveFilter: true }); return; }
      const flashcardFilter = event.target.closest('[data-nhsk-flashcard-filter]');
      if (flashcardFilter) { state.practiceFlashcardFilter = flashcardFilter.dataset.nhskFlashcardFilter || 'all'; saveSettings(); rerenderCurrentContent({ preserveFilter: true }); return; }
      const listeningMode = event.target.closest('[data-nhsk-listening-mode]');
      if (listeningMode) { state.practiceListeningMode = listeningMode.dataset.nhskListeningMode === 'single' ? 'single' : 'all'; state.practiceActivityStarted = false; saveSettings(); rerenderCurrentContent({ preserveFilter: true }); return; }
      const typingMode = event.target.closest('[data-nhsk-typing-mode]');
      if (typingMode) { state.practiceTypingMode = ['hanzi', 'pinyin', 'listen'].includes(typingMode.dataset.nhskTypingMode) ? typingMode.dataset.nhskTypingMode : 'hanzi'; state.practiceActivityStarted = false; saveSettings(); rerenderCurrentContent({ preserveFilter: true }); return; }
      const characterScope = event.target.closest('[data-nhsk-character-scope]');
      if (characterScope) { state.practiceCharacterScope = characterScope.dataset.nhskCharacterScope === 'core' ? 'core' : 'all'; saveSettings(); rerenderCurrentContent({ preserveFilter: true }); return; }
      const characterMode = event.target.closest('[data-nhsk-character-mode]');
      if (characterMode) { state.practiceCharacterMode = ['learn', 'sort', 'build', 'write'].includes(characterMode.dataset.nhskCharacterMode) ? characterMode.dataset.nhskCharacterMode : 'learn'; state.practiceActivityStarted = false; saveSettings(); rerenderCurrentContent({ preserveFilter: true }); return; }
      const roleSpeaker = event.target.closest('[data-nhsk-role-speaker]');
      if (roleSpeaker) { state.practiceRoleSpeaker = roleSpeaker.dataset.nhskRoleSpeaker || ''; rerenderCurrentContent({ preserveFilter: true }); return; }
      const radicalNext = event.target.closest('[data-nhsk-radical-next]');
      if (radicalNext) { nextRadicalRound(); return; }
      const radicalReset = event.target.closest('[data-nhsk-radical-reset]');
      if (radicalReset) { resetRadicalSort(); return; }
      const radicalItem = event.target.closest('[data-radical-item]');
      if (radicalItem && Date.now() >= suppressRadicalClickUntil) { selectRadicalItem(radicalItem.dataset.radicalItem || ''); return; }
      const radicalGroupSelect = event.target.closest('[data-radical-group-select]');
      if (radicalGroupSelect) { selectRadicalGroup(radicalGroupSelect.dataset.radicalGroupSelect || ''); return; }
      const radicalDrop = event.target.closest('[data-radical-drop]');
      if (radicalDrop && !event.target.closest?.('a[href]')) {
        const session = ensureRadicalSortSession();
        if (session?.selectedItemId) handleRadicalAssign(session.selectedItemId, radicalDrop.dataset.radicalDrop || '');
        else selectRadicalGroup(radicalDrop.dataset.radicalDrop || '');
        return;
      }
      const matchCard = event.target.closest('[data-match-side][data-match-id]');
      if (matchCard && Matching) {
        const session = ensurePracticeMatchingSession();
        const result = Matching.select(session, matchCard.dataset.matchSide, matchCard.dataset.matchId);
        if (result.speechText && session.tapToSpeak) speak(result.speechText);
        rerenderCurrentContent({ preserveFilter: true });
        if (result.status === 'wrong') Matching.scheduleFeedbackClear(session, () => rerenderCurrentContent({ preserveFilter: true }));
        if (result.status === 'correct' && result.roundComplete && !result.complete) {
          Matching.scheduleNextRound(session, () => rerenderCurrentContent({ preserveFilter: true }));
        }
        return;
      }
      const matchAction = event.target.closest('[data-match-action]');
      if (matchAction && Matching) {
        const session = ensurePracticeMatchingSession();
        const action = matchAction.dataset.matchAction;
        if (action === 'toggle-pinyin') Matching.togglePinyin(session);
        else if (action === 'toggle-speak') Matching.toggleTapSpeak(session);
        else if (action === 'toggle-settings' || action === 'close-settings') Matching.toggleSettings(session);
        else if (action === 'manual-next') Matching.nextRound(session);
        else if (action === 'toggle-auto-next') Matching.setAutoNext(session, !session.autoNext);
        else if (action === 'set-round-limit') Matching.setRoundLimit(session, matchAction.dataset.matchValue || 'auto');
        else if (action === 'set-auto-next-delay') Matching.setAutoNextDelay(session, matchAction.dataset.matchValue || 0);
        else if (action === 'apply-custom-limit') Matching.setRoundLimit(session, root.querySelector('[data-match-custom-limit]')?.value || 'auto');
        else if (action === 'apply-custom-delay') Matching.setAutoNextDelay(session, root.querySelector('[data-match-custom-delay]')?.value || 0);
        rerenderCurrentContent({ preserveFilter: true });
        return;
      }
      const orderToken = event.target.closest('[data-nhsk-order-token]');
      if (orderToken) {
        const session = ensurePracticeOrderingSession(state.practiceSessionRows);
        const itemId = orderToken.closest('[data-nhsk-order-item-id]')?.dataset.nhskOrderItemId || '';
        const item = session?.items?.find(row => row.id === itemId);
        if (!item || item.complete) return;
        const tokenId = orderToken.dataset.nhskOrderToken || '';
        if (orderToken.dataset.tokenZone === 'answer') item.selected = item.selected.filter(token => token.id !== tokenId);
        else {
          const token = item.bank.find(row => row.id === tokenId);
          if (token && !item.selected.some(row => row.id === tokenId)) item.selected.push(token);
        }
        item.feedback = '';
        const correct = evaluatePracticeOrderingItem(item);
        rerenderCurrentContent({ preserveFilter: true });
        if (correct) scheduleOrderingAutoNext(session);
        return;
      }
      const resetOrder = event.target.closest('[data-nhsk-reset-order]');
      if (resetOrder) {
        const session = ensurePracticeOrderingSession(state.practiceSessionRows);
        const itemId = resetOrder.closest('[data-nhsk-order-item-id]')?.dataset.nhskOrderItemId || '';
        const item = session?.items?.find(row => row.id === itemId);
        if (item) { item.selected = []; item.complete = false; item.feedback = ''; item.rating = ''; rerenderCurrentContent({ preserveFilter: true }); }
        return;
      }
      const orderNext = event.target.closest('[data-nhsk-order-next]');
      if (orderNext) {
        const session = ensurePracticeOrderingSession(state.practiceSessionRows);
        if (session && session.index + orderingPageSize() < session.items.length) advanceOrderingSession(session);
        else { state.practiceActivityStarted = false; clearOrderingAutoNext(); practiceOrderingSession = null; rerenderCurrentContent({ preserveFilter: true }); }
        return;
      }
      const orderRating = event.target.closest('[data-nhsk-order-rating]');
      if (orderRating) {
        const session = ensurePracticeOrderingSession(state.practiceSessionRows);
        const itemId = orderRating.closest('[data-nhsk-order-item-id]')?.dataset.nhskOrderItemId || '';
        const item = session?.items?.find(row => row.id === itemId);
        const rating = orderRating.dataset.nhskOrderRating || '';
        if (item?.complete && ['easy','review','hard'].includes(rating)) { item.rating = rating; updatePracticeRating(item.id, rating); rerenderCurrentContent({ preserveFilter: true }); }
        return;
      }
      const checkFill = event.target.closest('[data-nhsk-check-fill]');
      if (checkFill) {
        const card = checkFill.closest('[data-nhsk-fill-card]');
        const input = card?.querySelector('[data-nhsk-fill-input]');
        const feedback = card?.querySelector('[data-nhsk-feedback]');
        let accepted = [];
        try { accepted = JSON.parse(input?.dataset.accepted || '[]'); } catch (_error) {}
        const correct = acceptedAnswerMatches(input?.value, accepted, state.practiceTypingMode === 'pinyin' ? 'pinyin' : 'hanzi');
        updatePracticeProgress(card?.dataset.entityId || '', correct);
        if (feedback) { feedback.textContent = correct ? 'Chính xác.' : `Đáp án: ${accepted.join(' / ')}`; feedback.className = correct ? 'is-correct' : 'is-wrong'; }
        return;
      }
      const checkTyping = event.target.closest('[data-nhsk-check-typing]');
      if (checkTyping) {
        const card = checkTyping.closest('[data-nhsk-typing-card]');
        const input = card?.querySelector('[data-nhsk-typing-input]');
        const feedback = card?.querySelector('[data-nhsk-feedback]');
        let accepted = [];
        try { accepted = JSON.parse(checkTyping.dataset.accepted || '[]'); } catch (_error) {}
        if (checkTyping.dataset.selfCheck === 'true') {
          if (feedback) { feedback.textContent = `Đáp án tham khảo: ${accepted.join(' / ')}`; feedback.className = 'is-reference'; }
          updatePracticeProgress(card?.dataset.entityId || '', true);
          return;
        }
        const mode = state.practiceTypingMode === 'pinyin' ? 'pinyin' : 'hanzi';
        const correct = acceptedAnswerMatches(input?.value, accepted, mode);
        const entityId = card?.dataset.entityId || '';
        updatePracticeProgress(entityId, correct);
        if (!correct && card) card.dataset.mistakes = String(Number(card.dataset.mistakes || 0) + 1);
        if (correct && state.practiceTypingMode === 'listen') {
          const mistakes = Number(card?.dataset.mistakes || 0);
          const hint = card?.dataset.hintLevel || 'easy';
          const rating = hint === 'hard' || mistakes >= 3 ? 'hard' : hint === 'review' || mistakes > 0 ? 'review' : 'easy';
          updatePracticeRating(entityId, rating);
          if (feedback) { feedback.textContent = `Chính xác · ${rating === 'easy' ? 'Dễ' : rating === 'review' ? 'Ôn' : 'Khó'}`; feedback.className = 'is-correct'; }
        } else if (feedback) { feedback.textContent = correct ? 'Chính xác.' : `Đáp án: ${accepted.join(' / ')}`; feedback.className = correct ? 'is-correct' : 'is-wrong'; }
        return;
      }
      const characterComponent = event.target.closest('[data-character-component]');
      if (characterComponent) {
        const card = characterComponent.closest('[data-character-build]');
        const answer = card?.querySelector('[data-character-build-answer]');
        const bank = card?.querySelector('.nhsk-character-build-bank');
        if (answer && bank) {
          if (characterComponent.closest('[data-character-build-answer]')) bank.appendChild(characterComponent);
          else { answer.querySelector('small')?.remove(); answer.appendChild(characterComponent); }
          if (!answer.querySelector('[data-character-component]')) answer.innerHTML = '<small>Chọn thành phần</small>';
        }
        return;
      }
      const characterBuildCheck = event.target.closest('[data-character-build-check]');
      if (characterBuildCheck) {
        const card = characterBuildCheck.closest('[data-character-build]');
        const answer = Array.from(card?.querySelectorAll('[data-character-build-answer] [data-character-component]') || []).map(button => button.dataset.characterComponent || '').join('|');
        const expected = card?.dataset.expected || '';
        const correct = answer === expected;
        const feedback = card?.querySelector('[data-nhsk-feedback]');
        updatePracticeProgress(card?.dataset.characterBuild || '', correct);
        if (feedback) { feedback.textContent = correct ? 'Ghép đúng.' : 'Chưa đúng, hãy thử lại.'; feedback.className = correct ? 'is-correct' : 'is-wrong'; }
        return;
      }
      const characterBuildReset = event.target.closest('[data-character-build-reset]');
      if (characterBuildReset) {
        const card = characterBuildReset.closest('[data-character-build]');
        const answer = card?.querySelector('[data-character-build-answer]');
        const bank = card?.querySelector('.nhsk-character-build-bank');
        if (answer && bank) {
          Array.from(answer.querySelectorAll('[data-character-component]')).forEach(button => bank.appendChild(button));
          answer.innerHTML = '<small>Chọn thành phần</small>';
          const feedback = card.querySelector('[data-nhsk-feedback]');
          if (feedback) { feedback.textContent = ''; feedback.className = ''; }
        }
        return;
      }
      const characterDetail = event.target.closest('[data-nhsk-character-detail]');
      if (characterDetail) { openCharacterDetail(characterDetail.dataset.nhskCharacterDetail, characterDetail.closest('[data-character-id]')); return; }
      const wordReference = event.target.closest('[data-nhsk-word-ref]');
      if (wordReference) { openWordDetail(wordReference.dataset.nhskWordRef, wordReference.closest('[data-character-id]')); return; }
      const wordDetail = event.target.closest('[data-open-word-detail]');
      if (wordDetail) { openWordDetail(wordDetail.dataset.openWordDetail, wordDetail.closest('[data-vocab-source-key]')); return; }
      const flashcards = event.target.closest('[data-nhsk-open-flashcards]');
      if (flashcards) {
        const topic = state.catalog === 'topics' ? selectedCatalogTopic() : null;
        if (topic) {
          const no = String(topic.order || '').padStart(2, '0');
          openFlashcards(flashcards, topicFlashcardCards(topic), {
            title: `New 3.0 · HSK ${state.level} · Chủ đề ${no} · ${topic.title}`,
            contextKey: `new-hsk-course:topic:hsk${state.level}:${topic.id}`,
            contextLabel: `New 3.0 · HSK ${state.level} · Chủ đề ${no}`
          });
        } else {
          openFlashcards(flashcards);
        }
        return;
      }
      const speakButton = event.target.closest('[data-nhsk-speak]');
      if (speakButton) { event.preventDefault(); event.stopPropagation(); speak(speakButton.dataset.nhskSpeak || '', speakButton); return; }
      const catalogWord = event.target.closest('[data-nhsk-catalog-word]');
      if (catalogWord && !event.target.closest('a[href],button')) {
        event.preventDefault();
        openCatalogWordDetail(catalogWord.dataset.nhskCatalogWord || '', catalogWord);
        return;
      }
      const audioButton = event.target.closest('[data-nhsk-audio-ref]');
      if (audioButton) { event.preventDefault(); playTrack(audioButton.dataset.nhskAudioRef || '', audioButton); }
    });

    root.addEventListener('keydown', event => {
      if (!['Enter', ' '].includes(event.key)) return;
      const grammarCard = event.target.closest?.('[data-nhsk-grammar-id]');
      if (grammarCard && state.catalog === 'grammar') {
        event.preventDefault();
        state.grammarId = grammarCard.dataset.nhskGrammarId || '';
        state.topicId = '';
        syncUrl(false);
        syncGrammarPopup();
        return;
      }
      const grammarPlusCard = event.target.closest?.('[data-nhsk-grammar-plus-id]');
      if (grammarPlusCard && !state.catalog) {
        event.preventDefault();
        state.grammarPlusId = grammarPlusCard.dataset.nhskGrammarPlusId || '';
        syncUrl(false);
        syncGrammarPopup();
        return;
      }
      const catalogWord = event.target.closest?.('[data-nhsk-catalog-word]');
      if (!catalogWord || event.target.closest('a[href],button')) return;
      event.preventDefault();
      openCatalogWordDetail(catalogWord.dataset.nhskCatalogWord || '', catalogWord);
    });

    root.addEventListener('change', event => {
      const setting = event.target.closest?.('[data-nhsk-practice-setting]');
      if (!setting) return;
      const key = setting.dataset.nhskPracticeSetting;
      const value = setting.value;
      if (key === 'order') state.practiceOrderMode = value === 'random' ? 'random' : 'ordered';
      else if (key === 'count') state.practiceCountMode = ['5', '10', 'all'].includes(value) ? value : 'all';
      else if (key === 'fill-mode') state.practiceFillMode = value === 'sentence' ? 'sentence' : 'vocabulary';
      else if (key === 'fill-strategy') state.practiceFillStrategy = value === 'random' ? 'random' : 'default';
      else if (key === 'matching-type') state.practiceMatchingType = ['hanzi-vi', 'hanzi-pinyin', 'pinyin-vi', 'question-answer', 'speaker-line', 'grammar'].includes(value) ? value : 'hanzi-vi';
      else if (key === 'ordering-auto-next') state.practiceOrderingAutoNext = value !== 'off';
      else if (key === 'ordering-auto-next-delay') state.practiceOrderingAutoNextDelay = normalizePracticeDelay(value, 1.2);
      else if (key === 'ordering-display-count') state.practiceOrderingDisplayCount = [1, 2, 3].includes(Number(value)) ? Number(value) : 1;
      state.practiceActivityStarted = false;
      state.practiceSessionRows = [];
      state.practiceSessionKey = '';
      practiceMatchingSession = null;
      clearOrderingAutoNext();
      practiceOrderingSession = null;
      saveSettings();
      rerenderCurrentContent({ preserveFilter: true });
    });

    root.addEventListener('dragstart', event => {
      const item = event.target.closest?.('[data-radical-item]');
      if (!item || !event.dataTransfer) return;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', item.dataset.radicalItem || '');
      item.classList.add('is-dragging');
    });
    root.addEventListener('dragend', event => event.target.closest?.('[data-radical-item]')?.classList?.remove('is-dragging'));
    root.addEventListener('dragover', event => {
      const drop = event.target.closest?.('[data-radical-drop]');
      if (!drop) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    });
    root.addEventListener('drop', event => {
      const drop = event.target.closest?.('[data-radical-drop]');
      if (!drop || !event.dataTransfer) return;
      event.preventDefault();
      handleRadicalAssign(event.dataTransfer.getData('text/plain'), drop.dataset.radicalDrop || '');
    });
    root.addEventListener('pointerdown', event => {
      const item = event.target.closest?.('[data-radical-item]');
      if (!item || event.button > 0) return;
      radicalPointerDrag = { pointerId: event.pointerId, itemId: item.dataset.radicalItem || '', source: item, startX: event.clientX, startY: event.clientY, dragging: false, ghost: null };
      item.setPointerCapture?.(event.pointerId);
    });
    if (typeof document.addEventListener === 'function') {
      document.addEventListener('pointermove', moveRadicalPointerDrag, { passive: false });
      document.addEventListener('pointerup', endRadicalPointerDrag);
      document.addEventListener('pointercancel', cleanupRadicalPointerDrag);
    }
  }

  window.addEventListener('message', event => {
    if (event.origin !== location.origin) return;
    if (event.data?.type === 'tiengtrung:hsk-popup-close') { closeWordDetail(); return; }
    if (event.data?.type === 'tiengtrung:hsk-popup-ready') revealWordDetail(event.data.word || '');
  });

  async function loadLessonData(level, lessonNumber, options = {}) {
    const lessonInfo = state.manifest?.lessons?.find(item => Number(item.level) === Number(level) && Number(item.lessonNumber) === Number(lessonNumber) && String(item.status || '').includes('ready'));
    if (!lessonInfo) throw new Error(`Không tìm thấy HSK ${level} Bài ${lessonNumber}.`);
    stopTrackAudio();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    state.level = Number(level);
    state.lessonNumber = Number(lessonNumber);
    state.loading = true;
    state.error = '';
    state.lesson = null;
    state.filter = 'all';
    state.practiceActivityStarted = false;
    state.practiceSessionRows = [];
    state.practiceSessionKey = '';
    if (options.push !== false) syncUrl(false);
    render();
    const lessonResponse = await fetch(`data/${lessonInfo.path}`, { cache: 'no-store' });
    if (!lessonResponse.ok) throw new Error(`Không tải được dữ liệu HSK ${level} Bài ${lessonNumber} (${lessonResponse.status}).`);
    state.lesson = await lessonResponse.json();
    lessonDataCache.set(lessonCacheKey(level, lessonNumber), state.lesson);
    state.catalogData = catalogCache.get(Number(level)) || null;
    if (!state.catalogData) await loadCatalogData(level);
    state.loading = false;
    const currentParams = new URLSearchParams(window.location.search);
    if (!state.catalog) state.filter = currentParams.get('filter') || state.filter || 'all';
    state.focusWord = currentParams.get('focusWord') || state.focusWord || '';
    state.grammarPlusId = currentParams.get('grammarPlus') || '';
    document.title = `${state.lesson.title.vi} · New 3.0 · HSK ${state.lesson.level}`;
    render();
    if (typeof window.dispatchEvent === 'function' && typeof window.CustomEvent === 'function') window.dispatchEvent(new window.CustomEvent('tiengtrung:navigationchange'));
    window.setTimeout(() => window.TiengTrungLearningHistory?.recordCurrent?.(), 0);
  }

  async function navigateLesson(level, lessonNumber) {
    try {
      await loadLessonData(level, lessonNumber, { push: true });
      window.scrollTo({ top: 0, behavior: 'auto' });
    } catch (error) {
      state.loading = false;
      state.error = error instanceof Error ? error.message : String(error);
      render();
    }
  }

  async function load() {
    bindEvents();
    try {
      const manifestResponse = await fetch('data/manifest.json', { cache: 'no-store' });
      if (!manifestResponse.ok) throw new Error(`Không tải được manifest (${manifestResponse.status}).`);
      state.manifest = await manifestResponse.json();
      const requested = state.manifest.lessons.find(item => Number(item.level) === state.level && Number(item.lessonNumber) === state.lessonNumber && String(item.status || '').includes('ready'));
      const fallback = requested || state.manifest.lessons.find(item => String(item.status || '').includes('ready'));
      if (!fallback) throw new Error('Manifest New 3.0 chưa có bài app-ready.');
      await loadLessonData(Number(fallback.level), Number(fallback.lessonNumber), { push: false });
      if (state.catalog) await loadCatalogData(state.level);
      restoreReturnSnapshotFromUrl();
    } catch (error) {
      state.loading = false;
      state.error = error instanceof Error ? error.message : String(error);
      render();
    }
  }

  window.addEventListener('popstate', () => {
    if (!state.manifest) return;
    const next = new URLSearchParams(location.search);
    const level = Math.max(1, Number(next.get('level')) || 1);
    const lessonNumber = Math.max(1, Number(next.get('lesson')) || 1);
    state.view = ['book', 'grouped', 'practice'].includes(next.get('view')) ? next.get('view') : 'book';
    state.catalog = ['topics', 'grammar'].includes(next.get('catalog')) ? next.get('catalog') : '';
    state.topicId = state.catalog === 'topics' ? next.get('topic') || '' : '';
    state.grammarId = state.catalog === 'grammar' ? next.get('grammar') || '' : '';
    state.grammarPlusId = !state.catalog ? next.get('grammarPlus') || '' : '';
    state.filter = next.get('filter') || 'all';
    state.focusWord = next.get('focusWord') || '';
    if (level === state.level && lessonNumber === state.lessonNumber) {
      state.catalogData = catalogCache.get(level) || null;
      render();
      if (!state.catalogData) loadCatalogData(level);
      return;
    }
    state.catalogData = catalogCache.get(level) || null;
    loadLessonData(level, lessonNumber, { push: false }).then(() => {
      if (!state.catalogData) return loadCatalogData(level);
      return null;
    }).catch(error => {
      state.loading = false;
      state.error = error instanceof Error ? error.message : String(error);
      render();
    });
  });

  window.NewHskCourse = Object.freeze({ getState: () => ({ ...state }), render, restoreWordSourcePosition });
  load();
})();

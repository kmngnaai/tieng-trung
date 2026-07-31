(() => {
  'use strict';
  // Listening library v1.16 — groups/decks/trash replace the old flat custom list.

  const Core = window.ListeningCore;
  const SourceAdapters = window.ListeningSourceAdapters;
  const ActivityBuilders = window.ListeningActivityBuilders;
  const LibraryStore = window.ListeningLibraryStore;
  const app = document.getElementById('app');
  const SETTINGS_KEY = 'tieng-trung-listening-settings-v1';
  const PROGRESS_KEY = 'tieng-trung-listening-progress-v1';
  const LAST_SESSION_KEY = 'tieng-trung-listening-last-session-v1';
  const AudioStore = window.ListeningAudioStore;

  const DEFAULT_SETTINGS = {
    voiceSource: 'auto',
    voiceGender: 'auto',
    voiceURI: '',
    rate: 1,
    rewindSeconds: 3,
    showPinyin: true,
    showMeaning: true,
    autoCheck: true,
    autoRate: true,
    autoNext: true,
    autoNextSeconds: 2,
    sentenceCount: 'all'
  };

  const state = {
    screen: 'home',
    source: '',
    lessons301: [],
    lesson: null,
    lessonData: null,
    items: [],
    practiceItems: null,
    vocabulary: [],
    currentIndex: 0,
    mode: 'dictation',
    input: '',
    result: null,
    hint: null,
    showAnswer: false,
    usedHint: false,
    listenCount: 0,
    voices: [],
    voicesReady: false,
    speaking: false,
    paused: false,
    speechStartIndex: 0,
    speechCharIndex: 0,
    speechToken: 0,
    settingsOpen: false,
    menuOpen: false,
    settings: Object.assign({}, DEFAULT_SETTINGS, loadJson(SETTINGS_KEY, DEFAULT_SETTINGS)),
    progress: loadJson(PROGRESS_KEY, {}),
    libraryGroups: [],
    libraryDecks: [],
    libraryTrash: [],
    libraryReady: false,
    activeLibraryGroupId: '',
    libraryManagerDeckId: '',
    libraryDialog: null,
    libraryNotice: '',
    preparedNext: null,
    sessionWrongItems: [],
    sessionCheckedIds: [],
    sessionCorrectIds: [],
    sessionAnswerIds: [],
    sessionName: '',
    currentWrongChecks: 0,
    viewedAnswer: false,
    autoCheckSignature: '',
    autoSuggestedRating: '',
    autoAdvanceTimer: null,
    autoAdvanceDeadline: 0,
    error: '',
    audioPlayer: null,
    audioObjectUrl: '',
    audioLoading: false,
    audioEntry: null,
    audioCurrentTime: 0,
    audioDuration: 0,
    audioStats: { count: 0, bytes: 0, maxBytes: 300 * 1024 * 1024 },
    audioPreparedFingerprint: '',
    audioStatus: 'idle',
    audioMessage: '',
    audioLoadToken: 0,
    audioPrepareScheduled: false,
    audioPreparePromise: null,
    floatingAudioCollapsed: true,
    floatingAudioVisible: false,
    primaryAudioVisible: true,
    keyboardVisible: false,
    activeTargetAway: false,
    manualBrowseMode: false,
    dataset: null,
    newHskManifest: null,
    newHskLevelData: null,
    newHskGrammarData: null,
    newHskUnits: [],
    ldsnData: null,
    ldsnUnits: [],
    activitySelection: [],
    activityResult: null,
    activityDescriptor: null,
    sentenceFilter: 'all',
    dictationCaretIndex: 0,
    dictationSelectionLength: 0,
    dictationResumeIndex: null,
    groupContextExpanded: false,
    groupTranscriptOpen: false,
    groupPreviewSpeaking: false,
    modeScrollTop: 0
  };

  // Dùng một phần tử audio cố định ở ngoài #app. Safari/iPhone cấp quyền phát
  // theo từng media element; không tạo new Audio() sau một chuỗi await.
  const importedAudioElement = createImportedAudioElement();

  // Chỉ giữ các khóa cài đặt đang được module Nghe hỗ trợ.
  state.settings = Object.keys(DEFAULT_SETTINGS).reduce((settings, key) => {
    settings[key] = state.settings[key] ?? DEFAULT_SETTINGS[key];
    return settings;
  }, {});
  if (!['auto', 'import', 'device'].includes(state.settings.voiceSource)) state.settings.voiceSource = 'auto';
  saveJson(SETTINGS_KEY, state.settings);

  function loadJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      return parsed && typeof parsed === 'object' ? parsed : structuredCloneSafe(fallback);
    } catch (error) {
      return structuredCloneSafe(fallback);
    }
  }

  function structuredCloneSafe(value) {
    return JSON.parse(JSON.stringify(value));
  }


  function saveJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn('Không thể lưu dữ liệu Nghe:', error);
    }
  }

  function createImportedAudioElement() {
    let audio = document.getElementById('listeningImportedAudio');
    if (audio) return audio;
    audio = document.createElement('audio');
    audio.id = 'listeningImportedAudio';
    audio.preload = 'metadata';
    audio.setAttribute('playsinline', '');
    audio.setAttribute('webkit-playsinline', '');
    audio.setAttribute('aria-hidden', 'true');
    // Không dùng display:none để tránh các khác biệt tải metadata trên Safari.
    Object.assign(audio.style, {
      position: 'fixed',
      width: '1px',
      height: '1px',
      left: '-9999px',
      bottom: '0',
      opacity: '0',
      pointerEvents: 'none'
    });
    document.body.appendChild(audio);
    return audio;
  }

  function mediaErrorText(error) {
    const name = String(error && error.name || '');
    const message = String(error && error.message || error || '');
    if (name === 'NotAllowedError') return 'Safari đã chặn phát vì MP3 chưa sẵn sàng trong lần chạm này. Chờ hiện “MP3 đã sẵn sàng”, rồi chạm Phát lại.';
    if (name === 'NotSupportedError') return 'Safari không đọc được định dạng của MP3 này.';
    return message || 'Không phát được MP3.';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function formatHanziRuns(value) {
    return escapeHtml(value).replace(
      /([\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]+)/gu,
      '<span class="hanzi-text" lang="zh-Hans">$1</span>'
    );
  }

  function activeItems() {
    return Array.isArray(state.practiceItems) ? state.practiceItems : state.items;
  }

  function currentItem() {
    return activeItems()[state.currentIndex] || null;
  }

  function sessionTitle() {
    if (state.source === 'new-hsk') {
      const title = state.dataset && state.dataset.unit && (state.dataset.unit.titleZh || state.dataset.unit.title) || state.lesson && (state.lesson.title_zh || state.lesson.title) || 'New HSK 1';
      return `New HSK 1 · ${title}`;
    }
    if (state.source === 'ldsn14') {
      const order = state.dataset && state.dataset.unit && state.dataset.unit.sectionOrder;
      const title = state.dataset && state.dataset.unit && (state.dataset.unit.titleZh || state.dataset.unit.title) || state.lesson && (state.lesson.title_zh || state.lesson.title) || 'LDSN1-4';
      return [`LDSN ${order || ''}`.trim(), title].filter(Boolean).join(' · ');
    }
    if (state.source === '301') {
      const lessonNo = state.lesson && state.lesson.lesson_no ? `Bài ${state.lesson.lesson_no}` : '';
      const title = state.lessonData && (state.lessonData.title_zh || state.lessonData.title) || state.lesson && (state.lesson.title_zh || state.lesson.title) || '';
      return [lessonNo, title].filter(Boolean).join(' · ');
    }
    if (state.source === 'review') return 'Câu cần ôn';
    if (state.source === 'custom') return state.lesson && (state.lesson.name || state.lesson.title) || 'Bộ tự tạo';
    return 'Luyện nghe';
  }

  function progressKey(item, mode) {
    return `${item.sourceType || 'unknown'}:${item.sourceId || ''}:${item.lessonId || ''}:${item.id}:${mode}`;
  }


  function canonicalProgressRating(item) {
    const canonicalId = String(item && (item.canonicalItemId || item.id) || '');
    if (!canonicalId) return '';
    let latest = null;
    Object.values(state.progress || {}).forEach((entry) => {
      const stored = entry && entry.item;
      const storedId = String(stored && (stored.canonicalItemId || stored.id) || '');
      if (storedId !== canonicalId || !entry.rating) return;
      if (!latest || String(entry.lastReviewedAt || '') > String(latest.lastReviewedAt || '')) latest = entry;
    });
    return latest && latest.rating || '';
  }

  function prioritizeLearningItems(items) {
    const rank = { review: 0, '': 1, hard: 2, easy: 3 };
    return (items || []).map((item, index) => ({ item, index, rating: canonicalProgressRating(item) }))
      .sort((left, right) => (rank[left.rating] ?? 1) - (rank[right.rating] ?? 1) || left.index - right.index)
      .map((row) => row.item);
  }

  function normalizedSentenceCount(total) {
    if (state.settings.sentenceCount === 'all') return total;
    return Math.max(1, Math.min(Number(state.settings.sentenceCount) || total, total));
  }

  function limitedSentencePool(items) {
    const prioritized = prioritizeLearningItems(items || []);
    return prioritized.slice(0, normalizedSentenceCount(prioritized.length));
  }

  function restoreModeScroll() {
    const top = Math.max(0, Number(state.modeScrollTop) || 0);
    requestAnimationFrame(() => window.scrollTo({ top, behavior: 'instant' }));
  }

  function saveSettings() {
    saveJson(SETTINGS_KEY, state.settings);
  }

  function saveProgress() {
    saveJson(PROGRESS_KEY, state.progress);
  }


  function setScreen(screen) {
    stopSpeech();
    clearAutoAdvance();
    state.screen = screen;
    state.error = '';
    state.settingsOpen = false;
    state.menuOpen = false;
    window.scrollTo({ top: 0, behavior: 'instant' });
    render();
  }

  function loadVoices() {
    if (!('speechSynthesis' in window)) {
      state.voices = [];
      state.voicesReady = true;
      render();
      return;
    }
    const voices = window.speechSynthesis.getVoices();
    if (voices.length) {
      state.voices = voices;
      state.voicesReady = true;
      render();
    }
  }

  function chineseVoices() {
    const chinese = state.voices.filter((voice) => String(voice.lang || '').toLowerCase().startsWith('zh'));
    return chinese.length ? chinese : state.voices;
  }

  function selectedVoice() {
    return Core.chooseVoice(state.voices, state.settings);
  }

  function render() {
    if (!app) return;
    if (state.screen === 'home') renderHome();
    else if (state.screen === 'newHskUnits') renderNewHskUnits();
    else if (state.screen === 'ldsnUnits') renderLdsnUnits();
    else if (state.screen === 'lessons301') render301Lessons();
    else if (state.screen === 'custom') renderCustomLibrary();
    else if (state.screen === 'customGroup') renderCustomGroupScreen();
    else if (state.screen === 'customTrash') renderLibraryTrash();
    else if (state.screen === 'mode') renderModeChoice();
    else if (state.screen === 'preview') renderContentPreview();
    else if (state.screen === 'practice') renderPractice();
    else if (state.screen === 'complete') renderComplete();
    else renderHome();
    bindCommonEvents();
    syncOverlayState();
    requestAnimationFrame(setupPracticeFloatingAudio);
    if (state.screen === 'practice' && state.settings.voiceSource !== 'device' && !state.groupPreviewSpeaking) schedulePrepareCurrentAudio();
  }

  function renderHome() {
    const reviewCount = Object.values(state.progress).filter((entry) => ['review', 'hard'].includes(entry.rating)).length;
    app.innerHTML = `
      ${pageHeader('Nghe', '')}
      <main class="listen-main">
        ${state.error ? errorCard(state.error) : ''}

        <section class="section-block section-block--first">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Nghe theo bài</p>
              <h2>Chọn nguồn câu</h2>
            </div>
            <button class="icon-action" data-action="open-settings" aria-label="Cài đặt giọng đọc">⚙</button>
          </div>
          <div class="source-grid">
            <button class="source-card" type="button" data-action="open-new-hsk">
              <span class="source-icon">新</span>
              <strong>New HSK 1</strong>
              <small>Mẫu hoàn chỉnh · Từ → câu → hội thoại → đoạn</small>
            </button>
            <button class="source-card source-card--ldsn" type="button" data-action="open-ldsn">
              <span class="source-icon">旅</span>
              <strong>LDSN1–4</strong>
              <small>10 bài · Từ · câu · hội thoại · đoạn văn</small>
            </button>
            <button class="source-card" type="button" data-action="open-301">
              <span class="source-icon">301</span>
              <strong>Giáo trình 301</strong>
              <small>Câu mẫu · Hội thoại · Mở rộng</small>
            </button>
            <button class="source-card" type="button" data-action="open-custom">
              <span class="source-icon">自</span>
              <strong>Bộ tự tạo</strong>
              <small>Nhập JSON, nghe có hoặc không transcript</small>
            </button>
          </div>
        </section>

        <section class="section-block">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Luyện nhanh</p>
              <h2>Tiếp tục</h2>
            </div>
          </div>
          <div class="quick-grid">
            <button class="quick-card" data-action="resume-last">
              <span>▶</span><strong>Tiếp tục nghe</strong><small>Mở phiên gần nhất</small>
            </button>
            <button class="quick-card" data-action="open-review">
              <span>复</span><strong>Câu cần ôn</strong><small>${reviewCount} câu đã đánh dấu Ôn/Khó</small>
            </button>
          </div>
        </section>

        ${deviceVoiceStatus()}
      </main>
      ${bottomNav()}
      ${settingsSheet()}
    `;
  }

  function deviceVoiceStatus() {
    const voices = chineseVoices();
    const selected = selectedVoice();
    if (!('speechSynthesis' in window)) {
      return `<section class="notice-card is-error"><strong>Thiết bị không hỗ trợ giọng đọc trình duyệt.</strong><span>Hãy thử bằng Edge, Chrome hoặc Safari phiên bản mới.</span></section>`;
    }
    if (!state.voicesReady) {
      return `<section class="notice-card"><span class="spinner" aria-hidden="true"></span><span>Đang đọc danh sách giọng trên thiết bị...</span></section>`;
    }
    if (!voices.length) {
      return `<section class="notice-card is-warning"><strong>Chưa tìm thấy giọng Trung.</strong><span>Ứng dụng vẫn thử giọng mặc định của thiết bị, nhưng phát âm có thể chưa đúng.</span></section>`;
    }
    return `<section class="notice-card"><strong>Giọng hiện tại:</strong><span>${escapeHtml(selected && selected.name || voices[0].name)} · ${escapeHtml(selected && selected.lang || voices[0].lang || 'zh-CN')}</span></section>`;
  }

  async function openNewHskLibrary() {
    state.error = '';
    state.screen = 'newHskUnits';
    render();
    try {
      if (!SourceAdapters || !ActivityBuilders) throw new Error('Thiếu source-adapters.js hoặc activity-builders.js.');
      if (!state.newHskManifest) {
        const [manifestResponse, levelResponse, grammarResponse] = await Promise.all([
          fetch('./data/structures/new-hsk/manifest.json'),
          fetch('../hanzi-stroke/data/learning/hsk/hsk_1.json'),
          fetch('../hanzi-stroke/data/learning/grammar/new_hsk_1.json')
        ]);
        if (!manifestResponse.ok) throw new Error(`Manifest ${manifestResponse.status}`);
        if (!levelResponse.ok) throw new Error(`Dữ liệu HSK ${levelResponse.status}`);
        if (!grammarResponse.ok) throw new Error(`Ngữ pháp ${grammarResponse.status}`);
        state.newHskManifest = await manifestResponse.json();
        state.newHskLevelData = await levelResponse.json();
        state.newHskGrammarData = await grammarResponse.json();
        const allUnits = SourceAdapters.listNewHskUnits(state.newHskLevelData, { levelId: 'new-hsk-1', sectionType: 'lesson' });
        const manifestById = new Map((state.newHskManifest.units || []).map((entry) => [entry.unitId, entry]));
        state.newHskUnits = allUnits
          .filter((unit) => manifestById.has(unit.unitId))
          .map((unit) => Object.assign({}, unit, manifestById.get(unit.unitId)));
      }
    } catch (error) {
      state.error = `Không mở được New HSK: ${error.message || error}`;
    }
    render();
  }

  function renderNewHskUnits() {
    app.innerHTML = `
      ${pageHeader('New HSK 1', 'Chọn bài học', true)}
      <main class="listen-main">
        ${state.error ? errorCard(state.error) : ''}
        <div class="lesson-list">
          ${state.newHskUnits.length ? state.newHskUnits.map((unit) => `
            <button class="lesson-card" type="button" data-action="open-new-hsk-unit" data-unit-id="${escapeHtml(unit.unitId)}">
              <span class="lesson-number">${escapeHtml(unit.sectionOrder)}</span>
              <span>
                <strong class="lesson-card__title">${formatHanziRuns(unit.titleZh || unit.title)}</strong>
                <small>${escapeHtml(unit.title)} · ${unit.wordCount} từ · ${unit.exampleCount} câu nguồn</small>
              </span>
              <b aria-hidden="true">›</b>
            </button>
          `).join('') : state.error ? '' : loadingCard('Đang đọc dữ liệu New HSK 1...')}
        </div>
      </main>
      ${bottomNav()}
      ${settingsSheet()}
    `;
  }

  async function openNewHskUnit(unitId) {
    const unit = state.newHskUnits.find((entry) => entry.unitId === unitId);
    if (!unit) return;
    state.source = 'new-hsk';
    state.lesson = { id: unit.unitId, lesson_id: unit.unitId, title: unit.title, title_zh: unit.titleZh };
    state.lessonData = null;
    state.dataset = null;
    state.activityDescriptor = null;
    state.sentenceFilter = 'all';
    state.items = [];
    state.practiceItems = null;
    state.vocabulary = [];
    state.error = '';
    state.screen = 'mode';
    render();
    try {
      const structureResponse = await fetch(`./data/structures/new-hsk/${unit.structureFile}`);
      if (!structureResponse.ok) throw new Error(`Structure ${structureResponse.status}`);
      const structure = await structureResponse.json();
      const dataset = SourceAdapters.adaptNewHskUnit(
        state.newHskLevelData,
        state.newHskGrammarData,
        structure,
        unit.unitId,
        {
          structureFile: `modules/listening/data/structures/new-hsk/${unit.structureFile}`,
          sourceFile: 'modules/hanzi-stroke/data/learning/hsk/hsk_1.json',
          grammarFile: 'modules/hanzi-stroke/data/learning/grammar/new_hsk_1.json'
        }
      );
      const validation = SourceAdapters.validateDataset(dataset);
      if (!validation.ok) throw new Error(validation.errors.join(' · '));
      state.dataset = dataset;
      state.items = dataset.sentences.slice();
      state.vocabulary = dataset.words.slice();
      state.lessonData = dataset;
    } catch (error) {
      state.error = `Không mở được mẫu New HSK: ${error.message || error}`;
    }
    render();
  }

  async function openLdsnLibrary() {
    state.error = '';
    state.screen = 'ldsnUnits';
    render();
    try {
      if (!SourceAdapters || !ActivityBuilders) throw new Error('Thiếu source-adapters.js hoặc activity-builders.js.');
      if (!state.ldsnData) {
        const response = await fetch('../ldsn14/data/lessons.json');
        if (!response.ok) throw new Error(`Dữ liệu LDSN ${response.status}`);
        state.ldsnData = await response.json();
        state.ldsnUnits = SourceAdapters.listLdsnUnits(state.ldsnData);
      }
    } catch (error) {
      state.error = `Không mở được LDSN1-4: ${error.message || error}`;
    }
    render();
  }

  function renderLdsnUnits() {
    app.innerHTML = `
      ${pageHeader('LDSN1–4', 'Chọn bài học', true)}
      <main class="listen-main">
        ${state.error ? errorCard(state.error) : ''}
        <div class="lesson-list lesson-list--ldsn">
          ${state.ldsnUnits.length ? state.ldsnUnits.map((unit) => `
            <button class="lesson-card lesson-card--ldsn" type="button" data-action="open-ldsn-unit" data-unit-id="${escapeHtml(unit.unitId)}">
              <span class="lesson-number">${escapeHtml(unit.sectionOrder)}</span>
              <span>
                <strong class="lesson-card__title">${formatHanziRuns(unit.titleZh || unit.title)}</strong>
                <small>${escapeHtml(unit.title)} · ${unit.wordCount} từ · ${unit.dialogueCount} lượt thoại · ${unit.passageSentenceCount} câu đoạn</small>
              </span>
              <b aria-hidden="true">›</b>
            </button>
          `).join('') : state.error ? '' : loadingCard('Đang đọc dữ liệu LDSN1-4...')}
        </div>
      </main>
      ${bottomNav()}
      ${settingsSheet()}
    `;
  }

  async function openLdsnUnit(unitId) {
    const unit = state.ldsnUnits.find((entry) => entry.unitId === unitId);
    if (!unit || !state.ldsnData) return;
    state.source = 'ldsn14';
    state.lesson = { id: unit.unitId, lesson_id: unit.unitId, title: unit.title, title_zh: unit.titleZh };
    state.lessonData = null;
    state.dataset = null;
    state.activityDescriptor = null;
    state.sentenceFilter = 'all';
    state.items = [];
    state.practiceItems = null;
    state.vocabulary = [];
    state.error = '';
    state.screen = 'mode';
    render();
    try {
      const dataset = SourceAdapters.adaptLdsnUnit(state.ldsnData, unit.unitId, {
        sourceFile: 'modules/ldsn14/data/lessons.json'
      });
      const validation = SourceAdapters.validateDataset(dataset);
      if (!validation.ok) throw new Error(validation.errors.join(' · '));
      state.dataset = dataset;
      state.items = dataset.sentences.slice();
      state.vocabulary = dataset.words.slice();
      state.lessonData = dataset;
    } catch (error) {
      state.error = `Không mở được bài LDSN: ${error.message || error}`;
    }
    render();
  }

  async function open301Library() {
    state.dataset = null;
    state.activityDescriptor = null;
    state.sentenceFilter = 'all';
    state.error = '';
    state.screen = 'lessons301';
    render();
    if (state.lessons301.length) return;
    try {
      const response = await fetch('../../lessons-301-v2/lessons.json');
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const data = await response.json();
      state.lessons301 = Array.isArray(data) ? data : data.lessons || [];
    } catch (error) {
      state.error = `Không tải được danh sách 301: ${error.message}`;
    }
    render();
  }

  function render301Lessons() {
    app.innerHTML = `
      ${pageHeader('Giáo trình 301', 'Chọn bài để lấy câu mẫu, hội thoại và phần mở rộng', true)}
      <main class="listen-main">
        <div class="toolbar-row">
          <input class="search-input" id="lessonSearch" type="search" placeholder="Tìm bài 301..." autocomplete="off" />
          <button class="icon-action" data-action="open-settings" aria-label="Cài đặt">⚙</button>
        </div>
        ${state.error ? errorCard(state.error) : ''}
        <div id="lessonList" class="lesson-list">
          ${state.lessons301.length ? renderLessonCards(state.lessons301) : loadingCard('Đang tải 40 bài 301...')}
        </div>
      </main>
      ${bottomNav()}
      ${settingsSheet()}
    `;
  }

  function renderLessonCards(lessons) {
    return lessons.map((lesson) => `
      <button class="lesson-card" type="button" data-lesson-id="${escapeHtml(lesson.lesson_id)}">
        <span class="lesson-number">${escapeHtml(lesson.lesson_no)}</span>
        <span><strong class="lesson-card__title">${formatHanziRuns(lesson.title_zh || lesson.title || `Bài ${lesson.lesson_no}`)}</strong><small>Chép chính tả hoặc nghe có transcript</small></span>
        <b aria-hidden="true">›</b>
      </button>
    `).join('');
  }

  async function open301Lesson(lessonId) {
    const lesson = state.lessons301.find((entry) => entry.lesson_id === lessonId);
    if (!lesson) return;
    state.lesson = lesson;
    state.source = '301';
    state.dataset = null;
    state.activityDescriptor = null;
    state.sentenceFilter = 'all';
    state.error = '';
    state.screen = 'mode';
    state.items = [];
    state.practiceItems = null;
    state.vocabulary = [];
    render();
    try {
      const response = await fetch(`../../lessons-301-v2/${lesson.data}`);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const data = await response.json();
      state.lessonData = data;
      state.items = Core.extract301Items(data, lesson);
      state.vocabulary = Core.extractVocabularyItems(data);
      if (!state.items.length) throw new Error('Bài này chưa có câu phù hợp để luyện nghe.');
    } catch (error) {
      state.error = `Không mở được bài: ${error.message}`;
    }
    render();
  }


  async function refreshListeningLibrary() {
    if (!LibraryStore) throw new Error('Thiếu library-store.js.');
    await LibraryStore.init();
    const [groups, decks, trash] = await Promise.all([
      LibraryStore.listGroups(),
      LibraryStore.listDecks(),
      LibraryStore.listTrash()
    ]);
    state.libraryGroups = groups;
    state.libraryDecks = decks;
    state.libraryTrash = trash;
    state.libraryReady = true;
  }

  async function openCustomLibrary() {
    state.screen = 'custom';
    state.error = '';
    state.libraryNotice = '';
    render();
    try {
      await refreshListeningLibrary();
    } catch (error) {
      state.error = `Không mở được thư viện: ${error.message || error}`;
    }
    render();
  }

  function libraryGroupDecks(groupId) {
    return state.libraryDecks.filter((deck) => deck.groupId === groupId);
  }

  function ungroupedDecks() {
    return state.libraryDecks.filter((deck) => !deck.groupId || !state.libraryGroups.some((group) => group.id === deck.groupId));
  }

  function deckEnabledCount(deck) {
    return (deck.cards || []).filter((card) => card.listenEnabled !== false).length;
  }

  function libraryToolbar() {
    return `<div class="library-toolbar">
      <label class="library-action library-action--primary">Nhập JSON<input id="libraryFileInput" type="file" accept="application/json,.json" hidden /></label>
      <button class="library-action" data-action="export-library-all">Xuất tất cả</button>
      <button class="library-action" data-action="open-library-trash">Thùng rác${state.libraryTrash.length ? ` (${state.libraryTrash.length})` : ''}</button>
    </div>`;
  }

  function renderCustomLibrary() {
    const groups = state.libraryGroups || [];
    const decks = state.libraryDecks || [];
    const outside = ungroupedDecks();
    app.innerHTML = `
      ${pageHeader('Bộ tự tạo', `${groups.length} nhóm · ${decks.length} bộ`, true)}
      <main class="listen-main library-main">
        ${libraryToolbar()}
        ${state.libraryNotice ? `<section class="notice-card"><span>${escapeHtml(state.libraryNotice)}</span></section>` : ''}
        ${state.error ? errorCard(state.error) : ''}
        ${!state.libraryReady ? loadingCard('Đang mở thư viện bộ nghe...') : `
          <section class="section-block section-block--first">
            <div class="section-heading"><div><p class="eyebrow">Nhóm bộ</p><h2>Các nhóm đã nhập</h2></div></div>
            <div class="library-list">
              ${groups.length ? groups.map(renderLibraryGroupCard).join('') : emptyCard('Chưa có nhóm', 'File có groups/decks sẽ được giữ nguyên cấu trúc khi nhập.')}
            </div>
          </section>
          <section class="section-block">
            <div class="section-heading"><div><p class="eyebrow">Ngoài nhóm</p><h2>Chưa phân nhóm</h2></div><span class="library-count">${outside.length} bộ</span></div>
            <div class="library-list">
              ${outside.length ? outside.map(renderLibraryDeckCard).join('') : emptyCard('Không có bộ ngoài nhóm', 'Các bộ chưa gom sẽ xuất hiện tại đây.')}
            </div>
          </section>
        `}
      </main>
      ${bottomNav()}
      ${settingsSheet()}
      ${renderLibraryDialog()}
    `;
  }

  function renderLibraryGroupCard(group) {
    const decks = libraryGroupDecks(group.id);
    const cardCount = decks.reduce((sum, deck) => sum + (deck.cards || []).length, 0);
    return `<article class="library-card library-card--group">
      <button class="library-card__main" data-action="open-library-group" data-group-id="${escapeHtml(group.id)}">
        <span class="library-card__icon">组</span>
        <span class="library-card__copy"><strong>${escapeHtml(group.name)}</strong><small>${decks.length} bộ · ${cardCount} câu${group.description ? ` · ${escapeHtml(group.description)}` : ''}</small></span>
        <b aria-hidden="true">›</b>
      </button>
      <div class="library-card__actions">
        <button data-action="export-library-group" data-group-id="${escapeHtml(group.id)}">Xuất nhóm</button>
        <button class="danger-text" data-action="request-delete-library-group" data-group-id="${escapeHtml(group.id)}">Xóa nhóm</button>
      </div>
    </article>`;
  }

  function renderLibraryDeckCard(deck) {
    const enabledCount = deckEnabledCount(deck);
    const group = deck.groupId ? state.libraryGroups.find((entry) => entry.id === deck.groupId) : null;
    const isManaging = state.libraryManagerDeckId === deck.id;
    return `<article class="library-card library-card--deck">
      <button class="library-card__main" data-action="open-library-deck" data-deck-id="${escapeHtml(deck.id)}">
        <span class="library-card__icon">段</span>
        <span class="library-card__copy"><strong>${escapeHtml(deck.name)}</strong><small>${enabledCount}/${(deck.cards || []).length} câu luyện${group ? ` · ${escapeHtml(group.name)}` : ''}${deck.description ? ` · ${escapeHtml(deck.description)}` : ''}</small></span>
        <b aria-hidden="true">›</b>
      </button>
      <div class="library-card__actions">
        <button data-action="manage-library-deck" data-deck-id="${escapeHtml(deck.id)}">${isManaging ? 'Đóng danh sách' : 'Chọn câu'}</button>
        <button data-action="export-library-deck" data-deck-id="${escapeHtml(deck.id)}">Xuất bộ</button>
        <button class="danger-text" data-action="request-delete-library-deck" data-deck-id="${escapeHtml(deck.id)}">Xóa</button>
      </div>
      ${isManaging ? renderLibraryDeckManager(deck) : ''}
    </article>`;
  }

  function renderLibraryDeckManager(deck) {
    return `<div class="library-card-manager">
      ${(deck.cards || []).map((card) => `<label class="library-card-row">
        <input type="checkbox" data-action="toggle-library-card" data-deck-id="${escapeHtml(deck.id)}" data-card-id="${escapeHtml(card.id)}" ${card.listenEnabled === false ? '' : 'checked'} />
        <span><strong lang="zh-Hans">${escapeHtml(card.speaker ? `${card.speaker}：${card.word}` : card.word)}</strong><small>${escapeHtml(card.pinyin || card.meaningVi || '')}</small></span>
      </label>`).join('')}
    </div>`;
  }

  function renderCustomGroupScreen() {
    const group = state.libraryGroups.find((entry) => entry.id === state.activeLibraryGroupId);
    if (!group) {
      state.screen = 'custom';
      renderCustomLibrary();
      return;
    }
    const decks = libraryGroupDecks(group.id);
    const cardCount = decks.reduce((sum, deck) => sum + (deck.cards || []).length, 0);
    app.innerHTML = `
      ${pageHeader(group.name, `${decks.length} bộ · ${cardCount} câu`, true)}
      <main class="listen-main library-main">
        <div class="library-toolbar">
          <button class="library-action library-action--primary" data-action="export-library-group" data-group-id="${escapeHtml(group.id)}">Xuất nhóm</button>
          <button class="library-action library-action--danger" data-action="request-delete-library-group" data-group-id="${escapeHtml(group.id)}">Xóa nhóm</button>
        </div>
        ${group.description ? `<section class="notice-card"><span>${escapeHtml(group.description)}</span></section>` : ''}
        ${state.libraryNotice ? `<section class="notice-card"><span>${escapeHtml(state.libraryNotice)}</span></section>` : ''}
        ${state.error ? errorCard(state.error) : ''}
        <section class="section-block section-block--first">
          <div class="section-heading"><div><p class="eyebrow">Các đoạn</p><h2>Chọn bộ để luyện</h2></div></div>
          <div class="library-list">${decks.length ? decks.map(renderLibraryDeckCard).join('') : emptyCard('Nhóm chưa có bộ', 'Nhập lại file hoặc đưa bộ khác vào nhóm.')}</div>
        </section>
      </main>
      ${bottomNav()}
      ${settingsSheet()}
      ${renderLibraryDialog()}
    `;
  }

  function renderLibraryTrash() {
    const items = state.libraryTrash || [];
    app.innerHTML = `
      ${pageHeader('Thùng rác', `${items.length} mục · tự xóa sau 30 ngày`, true)}
      <main class="listen-main library-main">
        <div class="library-toolbar">
          <button class="library-action library-action--primary" data-action="restore-library-trash-all" ${items.length ? '' : 'disabled'}>Khôi phục tất cả</button>
          <button class="library-action library-action--danger" data-action="request-empty-library-trash" ${items.length ? '' : 'disabled'}>Dọn sạch</button>
        </div>
        ${state.libraryNotice ? `<section class="notice-card"><span>${escapeHtml(state.libraryNotice)}</span></section>` : ''}
        ${state.error ? errorCard(state.error) : ''}
        <div class="library-trash-list">
          ${items.length ? items.map(renderLibraryTrashItem).join('') : emptyCard('Thùng rác đang trống', 'Bộ hoặc nhóm bị xóa sẽ được giữ ở đây trong 30 ngày.')}
        </div>
      </main>
      ${bottomNav()}
      ${renderLibraryDialog()}
    `;
  }

  function renderLibraryTrashItem(item) {
    const expires = Math.max(0, Math.ceil((new Date(item.expiresAt).getTime() - Date.now()) / 86400000));
    const count = item.type === 'group'
      ? (item.payload.decks || []).reduce((sum, deck) => sum + (deck.cards || []).length, 0)
      : ((item.payload.deck && item.payload.deck.cards) || []).length;
    return `<article class="library-trash-card">
      <div><strong>${escapeHtml(item.name)}</strong><small>${item.type === 'group' ? 'Nhóm' : 'Bộ'} · ${count} câu · còn ${expires} ngày</small></div>
      <div class="library-card__actions">
        <button data-action="restore-library-trash" data-trash-id="${escapeHtml(item.id)}">Khôi phục</button>
        <button class="danger-text" data-action="request-delete-library-trash" data-trash-id="${escapeHtml(item.id)}">Xóa vĩnh viễn</button>
      </div>
    </article>`;
  }

  function renderLibraryDialog() {
    const dialog = state.libraryDialog;
    if (!dialog) return '';
    if (dialog.type === 'group') {
      const group = state.libraryGroups.find((entry) => entry.id === dialog.id);
      if (!group) return '';
      const decks = libraryGroupDecks(group.id);
      return `<div class="library-dialog-backdrop" data-action="close-library-dialog">
        <section class="library-dialog" role="dialog" aria-modal="true" aria-labelledby="libraryDialogTitle" onclick="event.stopPropagation()">
          <p class="eyebrow">Xóa nhóm</p><h2 id="libraryDialogTitle">${escapeHtml(group.name)}</h2>
          <p>Nhóm có ${decks.length} bộ. Chọn cách xử lý các bộ bên trong.</p>
          <button class="library-dialog-option" data-action="delete-library-group-ungroup" data-group-id="${escapeHtml(group.id)}"><strong>Đưa về Chưa phân nhóm</strong><small>Xóa nhóm nhưng giữ nguyên toàn bộ bộ và tiến độ.</small></button>
          <button class="library-dialog-option is-danger" data-action="delete-library-group-all" data-group-id="${escapeHtml(group.id)}"><strong>Xóa nhóm và các bộ</strong><small>Chuyển cả nhóm vào Thùng rác trong 30 ngày.</small></button>
          <button class="library-dialog-cancel" data-action="close-library-dialog">Hủy</button>
        </section>
      </div>`;
    }
    const title = dialog.type === 'deck' ? 'Xóa bộ?' : dialog.type === 'trash' ? 'Xóa vĩnh viễn?' : 'Dọn sạch Thùng rác?';
    const body = dialog.type === 'deck'
      ? 'Bộ sẽ được chuyển vào Thùng rác trong 30 ngày. Tiến độ học vẫn được giữ.'
      : dialog.type === 'trash'
        ? 'Mục này sẽ bị xóa vĩnh viễn và không thể khôi phục.'
        : 'Toàn bộ mục trong Thùng rác sẽ bị xóa vĩnh viễn.';
    const action = dialog.type === 'deck' ? 'confirm-delete-library-deck' : dialog.type === 'trash' ? 'confirm-delete-library-trash' : 'confirm-empty-library-trash';
    const attr = dialog.type === 'deck' ? `data-deck-id="${escapeHtml(dialog.id)}"` : dialog.type === 'trash' ? `data-trash-id="${escapeHtml(dialog.id)}"` : '';
    return `<div class="library-dialog-backdrop" data-action="close-library-dialog">
      <section class="library-dialog" role="dialog" aria-modal="true" aria-labelledby="libraryDialogTitle" onclick="event.stopPropagation()">
        <p class="eyebrow">Xác nhận</p><h2 id="libraryDialogTitle">${title}</h2><p>${body}</p>
        <div class="library-dialog-actions"><button data-action="close-library-dialog">Hủy</button><button class="is-danger" data-action="${action}" ${attr}>Xác nhận</button></div>
      </section>
    </div>`;
  }

  async function importCustomFile(file) {
    state.error = '';
    state.libraryNotice = '';
    try {
      const data = JSON.parse(await file.text());
      const summary = await LibraryStore.importData(data, file.name);
      await refreshListeningLibrary();
      state.libraryNotice = `Đã nhập ${summary.groupCount} nhóm, ${summary.deckCount} bộ và ${summary.cardCount} câu.`;
    } catch (error) {
      state.error = `Không nhập được JSON: ${error.message || error}`;
    }
    render();
  }

  async function openLibraryGroup(groupId) {
    state.activeLibraryGroupId = groupId;
    state.libraryManagerDeckId = '';
    state.libraryNotice = '';
    state.screen = 'customGroup';
    render();
  }

  async function openCustomDeck(deckId) {
    const deck = await LibraryStore.getDeck(deckId);
    if (!deck) {
      state.error = 'Bộ không còn tồn tại.';
      render();
      return;
    }
    const enabled = (deck.cards || []).filter((card) => card.listenEnabled !== false);
    if (!enabled.length) {
      state.error = 'Bộ này chưa có câu nào được bật cho luyện nghe.';
      render();
      return;
    }
    state.source = 'custom';
    state.dataset = null;
    state.activityDescriptor = null;
    state.sentenceFilter = 'all';
    state.lesson = { id: deck.id, title: deck.name, name: deck.name, groupId: deck.groupId, description: deck.description };
    state.lessonData = null;
    state.practiceItems = null;
    state.items = enabled.map((card) => ({
      id: card.id,
      text: card.word,
      pinyin: card.pinyin || '',
      meaning: card.meaningVi || '',
      speaker: card.speaker || '',
      sourceType: 'custom',
      sourceId: deck.id,
      sourceTitle: deck.name,
      lessonId: deck.id
    }));
    state.vocabulary = [];
    state.screen = 'mode';
    state.error = '';
    render();
  }

  async function exportLibrary(kind, id) {
    try {
      const payload = kind === 'all'
        ? await LibraryStore.exportAll()
        : kind === 'group'
          ? await LibraryStore.exportGroup(id)
          : await LibraryStore.exportDeck(id);
      const label = kind === 'all' ? 'tat-ca' : kind === 'group' ? `nhom-${id}` : `bo-${id}`;
      LibraryStore.downloadJson(payload, `nghe-${label}-${new Date().toISOString().slice(0, 10)}.json`);
      state.libraryNotice = 'Đã tạo file JSON để lưu hoặc chia sẻ.';
    } catch (error) {
      state.error = error.message || String(error);
    }
    render();
  }

  async function toggleLibraryCard(deckId, cardId, enabled) {
    try {
      await LibraryStore.toggleCard(deckId, cardId, enabled);
      await refreshListeningLibrary();
    } catch (error) {
      state.error = error.message || String(error);
    }
    render();
  }

  async function executeLibraryDelete(type, id, mode) {
    try {
      if (type === 'group') await LibraryStore.deleteGroup(id, mode);
      else if (type === 'deck') await LibraryStore.deleteDeck(id);
      else if (type === 'trash') await LibraryStore.deleteTrashPermanently(id);
      else if (type === 'empty') await LibraryStore.emptyTrash();
      state.libraryDialog = null;
      await refreshListeningLibrary();
      if (type === 'group' && state.screen === 'customGroup') state.screen = 'custom';
      state.libraryNotice = type === 'trash' || type === 'empty' ? 'Đã xóa vĩnh viễn.' : 'Đã chuyển dữ liệu vào Thùng rác.';
    } catch (error) {
      state.error = error.message || String(error);
    }
    render();
  }

  async function restoreLibraryTrash(id) {
    try {
      await LibraryStore.restoreTrash(id);
      await refreshListeningLibrary();
      state.libraryNotice = 'Đã khôi phục dữ liệu.';
    } catch (error) {
      state.error = error.message || String(error);
    }
    render();
  }

  async function restoreAllLibraryTrash() {
    try {
      await LibraryStore.restoreAllTrash();
      await refreshListeningLibrary();
      state.libraryNotice = 'Đã khôi phục toàn bộ.';
    } catch (error) {
      state.error = error.message || String(error);
    }
    render();
  }

  function renderModeChoice() {
    if (state.dataset) {
      renderDatasetModeChoice();
      return;
    }

    app.innerHTML = `
      ${pageHeader(sessionTitle(), state.items.length ? `${state.items.length} câu có thể luyện` : 'Đang đọc dữ liệu...', true)}
      <main class="listen-main">
        ${state.error ? errorCard(state.error) : ''}
        ${!state.error && !state.items.length ? loadingCard('Đang chuẩn bị câu luyện nghe...') : `
          <section class="mode-grid" aria-label="Chọn cách luyện nghe">
            <button class="mode-card" data-action="start-mode" data-mode="dictation">
              <span class="mode-icon" lang="zh-Hans">听写</span>
              <span class="mode-card__copy">
                <strong>Chép từng câu</strong>
                <small>Nghe và gõ lại từng câu.</small>
              </span>
              <span class="mode-arrow" aria-hidden="true">›</span>
            </button>
            <button class="mode-card" data-action="start-mode" data-mode="transcript">
              <span class="mode-icon" lang="zh-Hans">文</span>
              <span class="mode-card__copy">
                <strong>Có transcript</strong>
                <small>Nghe cùng chữ Hán, pinyin và nghĩa.</small>
              </span>
              <span class="mode-arrow" aria-hidden="true">›</span>
            </button>
            ${state.items.length > 1 ? `<button class="mode-card" data-action="start-mode" data-mode="passage">
              <span class="mode-icon" lang="zh-Hans">段</span>
              <span class="mode-card__copy">
                <strong>Chép đoạn văn / hội thoại</strong>
                <small>Chép nhiều câu trong cùng một đoạn.</small>
              </span>
              <span class="mode-arrow" aria-hidden="true">›</span>
            </button>` : ''}
            <button class="mode-card" data-action="open-content-preview">
              <span class="mode-icon" lang="zh-Hans">览</span>
              <span class="mode-card__copy">
                <strong>Xem trước nội dung</strong>
                <small>${state.items.length} câu với chữ Hán, pinyin và nghĩa.</small>
              </span>
              <span class="mode-arrow" aria-hidden="true">›</span>
            </button>
          </section>
        `}
      </main>
      ${bottomNav()}
      ${settingsSheet()}
    `;
  }

  function datasetSentenceFilters() {
    const dataset = state.dataset || {};
    if (Array.isArray(dataset.sentenceFilters) && dataset.sentenceFilters.length) return dataset.sentenceFilters;
    const stats = dataset.stats || {};
    return [
      { id: 'all', label: 'Toàn bộ', description: `${stats.sentenceCount || 0} câu phân biệt` },
      { id: 'vocabulary', label: 'Ví dụ từ vựng', description: `${stats.vocabularyExampleCount || 0} câu gốc` },
      { id: 'grammar', label: 'Ngữ pháp', description: `${stats.grammarExampleCount || 0} câu` },
      { id: 'authored', label: 'Biên soạn', description: `${stats.authoredSentenceCount || 0} câu luyện tập` }
    ];
  }

  function filteredDatasetSentences() {
    const sentences = state.dataset && state.dataset.sentences || [];
    if (state.sentenceFilter === 'all') return sentences.slice();
    const configured = datasetSentenceFilters().find((filter) => filter.id === state.sentenceFilter);
    if (configured && configured.tag) return sentences.filter((item) => Array.isArray(item.tags) && item.tags.includes(configured.tag));
    if (state.sentenceFilter === 'grammar') return sentences.filter((item) => item.sentenceType === 'grammar-example' || item.alsoGrammarExample);
    if (state.sentenceFilter === 'vocabulary') return sentences.filter((item) => item.sentenceType === 'vocabulary-example');
    if (state.sentenceFilter === 'authored') return sentences.filter((item) => item.originType === 'authored');
    return sentences.slice();
  }

  function setSentenceFilter(filter) {
    if (!datasetSentenceFilters().some((entry) => entry.id === filter)) return;
    state.sentenceFilter = filter;
    state.items = filteredDatasetSentences();
    render();
  }

  function renderDatasetModeChoice() {
    const dataset = state.dataset;
    const capabilities = dataset.capabilities || {};
    const groups = Array.isArray(dataset.groups) ? dataset.groups : [];
    const dialogue = groups.find((group) => group.kind === 'dialogue');
    const passage = groups.find((group) => group.kind === 'passage');
    const stats = dataset.stats || {};
    const modeCard = (action, icon, title, description, attrs) => `
      <button class="mode-card" data-action="${action}" ${attrs || ''}>
        <span class="mode-icon" lang="zh-Hans">${icon}</span>
        <span class="mode-card__copy"><strong>${title}</strong><small>${description}</small></span>
        <span class="mode-arrow" aria-hidden="true">›</span>
      </button>`;
    app.innerHTML = `
      ${pageHeader(sessionTitle(), `${stats.wordCount || 0} từ · ${stats.sentenceCount || 0} câu phân biệt`, true)}
      <main class="listen-main">
        ${state.error ? errorCard(state.error) : ''}
        <section class="dataset-summary dataset-summary--pastel">
          <div><strong>${formatHanziRuns(dataset.unit.titleZh || '')}</strong><span>${escapeHtml(dataset.unit.title || '')}</span></div>
          <div class="dataset-summary__stats"><span>${stats.wordCount} từ</span><span>${stats.sentenceCount} câu phân biệt</span><span>${stats.dialogueCount} hội thoại</span><span>${stats.passageCount} đoạn</span></div>
          <p class="dataset-source-breakdown">${state.source === 'ldsn14'
            ? `<strong>${stats.sentenceCount} câu</strong> gồm ${stats.translationSentenceCount || 0} câu dịch, ${stats.dialogueSentenceCount || 0} lượt thoại, ${stats.passageSentenceCount || 0} câu đoạn và ${stats.grammarExampleCount || 0} ví dụ ngữ pháp.`
            : `<strong>${stats.sentenceCount} câu</strong> = ${stats.vocabularyExampleCount || 0} ví dụ từ vựng gốc + ${stats.grammarOnlyCount || 0} ngữ pháp riêng + ${stats.authoredSentenceCount || 0} câu biên soạn.`}</p>
        </section>

        <section class="activity-section activity-section--word">
          <div class="section-heading"><div><p class="eyebrow">Từ</p><h2>Nghe và nhận diện</h2></div></div>
          <div class="mode-grid">
            ${capabilities.wordChoice ? modeCard('start-dataset-activity', '选', 'Chọn từ nghe được', 'Mức chuẩn với 4 lựa chọn.', 'data-activity="word-choice" data-choice-count="4"') : ''}
            ${capabilities.wordChoice ? modeCard('start-dataset-activity', '难', 'Chọn từ · Mức khó', '5 lựa chọn gây nhiễu trong cùng bài.', 'data-activity="word-choice" data-choice-count="5"') : ''}
            ${capabilities.wordTyping ? modeCard('start-dataset-activity', '写', 'Điền tay từ nghe được', 'Giữ cách nhập và chấm từng chữ hiện tại.', 'data-activity="word-dictation"') : ''}
          </div>
        </section>

        <section class="sentence-filter-card sentence-filter-card--pastel">
          <div><p class="eyebrow">Nội dung câu</p><strong>Chọn phạm vi luyện</strong></div>
          <div class="sentence-filter-options" role="group" aria-label="Lọc câu">
            ${datasetSentenceFilters().map((filter) => `<button data-action="set-sentence-filter" data-filter="${escapeHtml(filter.id)}" class="${state.sentenceFilter === filter.id ? 'active' : ''}">${escapeHtml(filter.label)} <small>${escapeHtml(filter.description || '')}</small></button>`).join('')}
          </div>
          <div class="sentence-count-setting">
            <span><strong>Số câu trong phiên</strong><small>Ưu tiên Ôn → Mới → Khó → Dễ</small></span>
            <div class="sentence-count-presets">
              ${['5','10','20','all'].map((value) => `<button type="button" data-action="set-sentence-count" data-count="${value}" class="${String(state.settings.sentenceCount) === value ? 'active' : ''}">${value === 'all' ? 'Tất cả' : value}</button>`).join('')}
            </div>
            <div class="sentence-count-custom"><input id="sentenceCountCustom" type="number" min="1" max="${filteredDatasetSentences().length}" inputmode="numeric" placeholder="Số khác"><button type="button" data-action="apply-sentence-count">Áp dụng</button></div>
          </div>
          <small class="sentence-filter-note">Đang dùng tối đa ${normalizedSentenceCount(filteredDatasetSentences().length)}/${stats.sentenceCount} câu. Các câu trùng nội dung chỉ giữ một bản và vẫn bảo toàn nhãn nguồn.</small>
        </section>

        <section class="activity-section activity-section--sentence">
          <div class="section-heading"><div><p class="eyebrow">Câu</p><h2>Xếp và chép câu</h2></div></div>
          <div class="mode-grid">
            ${capabilities.sentenceOrdering ? modeCard('start-dataset-activity', '序', 'Xếp từ thành câu', 'Nghe rồi chạm các từ theo đúng thứ tự.', 'data-activity="sentence-ordering"') : ''}
            ${capabilities.sentenceDictation ? modeCard('start-dataset-activity', '听写', 'Chép từng câu', 'Câu ví dụ và ví dụ ngữ pháp được trộn mặc định.', 'data-activity="sentence-dictation"') : ''}
            ${capabilities.sentenceTranscript ? modeCard('start-dataset-activity', '文', 'Có transcript', 'Nghe cùng chữ Hán, pinyin và nghĩa.', 'data-activity="sentence-transcript"') : ''}
            ${modeCard('open-content-preview', '览', 'Xem trước nội dung', `${stats.sentenceCount} câu đã chuẩn hóa.`, '')}
          </div>
        </section>

        ${dialogue ? `<section class="activity-section activity-section--dialogue">
          <div class="section-heading"><div><p class="eyebrow">Hội thoại</p><h2>${escapeHtml(dialogue.title)}</h2></div><span class="activity-count">${dialogue.items.length} lượt</span></div>
          <div class="mode-grid">
            ${capabilities.dialogueTurnOrdering ? modeCard('start-dataset-activity', '轮', 'Xếp thứ tự lượt thoại', 'Nghe toàn đoạn rồi sắp các lượt hội thoại.', `data-activity="dialogue-sequence" data-group-id="${escapeHtml(dialogue.id)}"`) : ''}
            ${capabilities.dialogueSentenceOrdering ? modeCard('start-dataset-activity', '句', 'Xếp từng câu hội thoại', 'Giữ ngữ cảnh A/B; chỉ xếp các câu có từ 3 cụm trở lên.', `data-activity="dialogue-token" data-group-id="${escapeHtml(dialogue.id)}"`) : ''}
            ${capabilities.dialogueDictation ? modeCard('start-dataset-activity', '录', 'Chép từng lượt', 'Nghe và gõ lần lượt từng câu, luôn có hội thoại làm ngữ cảnh.', `data-activity="dialogue-dictation" data-group-id="${escapeHtml(dialogue.id)}"`) : ''}
            ${capabilities.dialogueFullDictation ? modeCard('start-dataset-activity', '全', 'Chép nguyên hội thoại', 'Nghe toàn bộ rồi gõ liên tục tất cả các lượt trên cùng một màn hình.', `data-activity="dialogue-full-dictation" data-group-id="${escapeHtml(dialogue.id)}"`) : ''}
          </div>
        </section>` : ''}

        ${passage ? `<section class="activity-section activity-section--passage">
          <div class="section-heading"><div><p class="eyebrow">Đoạn văn</p><h2>${escapeHtml(passage.title)}</h2></div><span class="activity-count">${passage.items.length} câu</span></div>
          <div class="mode-grid">
            ${capabilities.passageSentenceOrdering ? modeCard('start-dataset-activity', '段', 'Xếp câu trong đoạn', 'Nghe toàn đoạn rồi sắp các câu theo trình tự.', `data-activity="passage-sequence" data-group-id="${escapeHtml(passage.id)}"`) : ''}
            ${capabilities.passageSentenceTokenOrdering ? modeCard('start-dataset-activity', '组', 'Xếp từng câu trong đoạn', 'Làm từng câu có từ 3 cụm trở lên; câu ngắn vẫn giữ làm ngữ cảnh.', `data-activity="passage-token" data-group-id="${escapeHtml(passage.id)}"`) : ''}
            ${capabilities.passageDictation ? modeCard('start-dataset-activity', '抄', 'Chép từng câu', 'Nghe và gõ lần lượt từng câu, luôn có toàn đoạn làm ngữ cảnh.', `data-activity="passage-dictation" data-group-id="${escapeHtml(passage.id)}"`) : ''}
            ${capabilities.passageFullDictation ? modeCard('start-dataset-activity', '全', 'Chép nguyên đoạn', 'Nghe toàn bộ rồi gõ liên tục tất cả các câu trên cùng một màn hình.', `data-activity="passage-full-dictation" data-group-id="${escapeHtml(passage.id)}"`) : ''}
          </div>
        </section>` : ''}
      </main>
      ${bottomNav()}
      ${settingsSheet()}
    `;
  }

  function randomShuffle(list) {
    const result = (list || []).slice();
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    if (result.length > 1 && result.every((entry, index) => entry === list[index])) [result[0], result[1]] = [result[1], result[0]];
    return result;
  }

  function randomizeSequenceItem(item) {
    return Object.assign({}, item, { shuffledCards: randomShuffle(item && item.cards || []) });
  }

  function datasetGroup(groupId) {
    return state.dataset && state.dataset.groups.find((group) => group.id === groupId) || null;
  }

  function startDatasetActivity(activity, groupId, options) {
    if (!state.dataset) return;
    const configured = options || {};
    const group = groupId ? datasetGroup(groupId) : null;
    const startIndex = Math.max(0, Number(configured.startIndex) || 0);
    const choiceCount = Number(configured.choiceCount) === 5 ? 5 : 4;
    const shuffleSeed = `${Date.now()}:${Math.random()}`;
    state.activityDescriptor = { activity, groupId: groupId || '', choiceCount, shuffleSeed };
    state.modeScrollTop = window.scrollY || 0;
    const sentencePool = limitedSentencePool(filteredDatasetSentences());
    if (activity === 'word-choice') {
      startPractice('word-choice', startIndex, { items: prioritizeLearningItems(ActivityBuilders.buildWordChoiceItems(state.dataset, { choiceCount, shuffleSeed })), sessionName: choiceCount === 5 ? 'Chọn từ · Mức khó' : 'Chọn từ nghe được' });
    } else if (activity === 'word-dictation') {
      startPractice('dictation', startIndex, { items: prioritizeLearningItems(state.dataset.words.slice()), sessionName: 'Điền tay từ nghe được' });
    } else if (activity === 'sentence-ordering') {
      startPractice('token-ordering', startIndex, { items: ActivityBuilders.buildSentenceOrderingItems(Object.assign({}, state.dataset, { sentences: sentencePool }), { shuffleSeed }), sessionName: 'Xếp từ thành câu' });
    } else if (activity === 'sentence-dictation') {
      startPractice('dictation', startIndex, { items: sentencePool, sessionName: 'Chép từng câu' });
    } else if (activity === 'sentence-transcript') {
      startPractice('transcript', startIndex, { items: sentencePool, sessionName: 'Nghe có transcript' });
    } else if (activity === 'dialogue-sequence' || activity === 'passage-sequence') {
      if (!group) return;
      startPractice('sequence-ordering', startIndex, { items: [randomizeSequenceItem(ActivityBuilders.buildGroupSequenceItem(group))], sessionName: group.title });
    } else if (activity === 'dialogue-token' || activity === 'passage-token') {
      if (!group) return;
      startPractice('token-ordering', startIndex, { items: prioritizeLearningItems(ActivityBuilders.buildGroupTokenItems(group).map((entry) => Object.assign({}, entry, { shuffledTokens: randomShuffle(entry.tokens || []) }))), sessionName: group.title });
    } else if (activity === 'dialogue-dictation' || activity === 'passage-dictation') {
      if (!group) return;
      startPractice('dictation', startIndex, { items: prioritizeLearningItems(ActivityBuilders.buildGroupDictationItems(group)), sessionName: group.title });
    } else if (activity === 'dialogue-full-dictation' || activity === 'passage-full-dictation') {
      if (!group) return;
      startPractice('passage', 0, { items: [ActivityBuilders.buildGroupFullDictationItem(group)], sessionName: group.title });
    }
  }

  function renderContentPreview() {
    const sourceBadges = (item) => {
      const badges = [];
      if (item.sentenceType === 'vocabulary-example') badges.push('Ví dụ từ vựng');
      if (item.sentenceType === 'grammar-example' || item.alsoGrammarExample) badges.push('Ngữ pháp');
      if (item.originType === 'authored') badges.push('Biên soạn');
      return badges.map((label) => `<span>${escapeHtml(label)}</span>`).join('');
    };
    app.innerHTML = `
      ${pageHeader(sessionTitle(), `${state.items.length} câu trong bài`, true)}
      <main class="listen-main content-preview-main">
        <div class="content-preview-heading">
          <div><p class="eyebrow">Nội dung bài</p><h2>Xem trước ${state.items.length} câu</h2></div>
          <button class="secondary-button" data-action="start-mode" data-mode="dictation">Bắt đầu chép</button>
        </div>
        <div class="content-preview-list">
          ${state.items.map((item, index) => `
            <button class="content-preview-card" data-action="open-preview-item" data-index="${index}" type="button">
              <span class="content-preview-number">${index + 1}</span>
              <span class="content-preview-copy">
                ${sourceBadges(item) ? `<span class="content-preview-source">${sourceBadges(item)}</span>` : ''}
                <strong lang="zh-Hans">${item.speaker ? `<span class="content-preview-speaker">${escapeHtml(item.speaker)}：</span>` : ''}${escapeHtml(item.text)}</strong>
                ${item.pinyin ? `<span class="content-preview-pinyin">${escapeHtml(item.pinyin)}</span>` : ''}
                ${item.meaning ? `<small>${escapeHtml(item.meaning)}</small>` : ''}
              </span>
              <span class="mode-arrow" aria-hidden="true">›</span>
            </button>
          `).join('')}
        </div>
      </main>
      ${bottomNav()}
      ${settingsSheet()}
    `;
  }

  function openContentPreview() {
    stopSpeech();
    state.screen = 'preview';
    state.error = '';
    render();
  }

  function startPractice(mode, index, options) {
    const configured = options || {};
    state.mode = mode;
    state.sessionName = configured.sessionName || '';
    if (configured.items) {
      state.practiceItems = configured.items.slice();
    } else if (mode === 'passage' || mode === 'passage-transcript') {
      const passage = Core.createPassageItem(state.items, {
        sourceType: state.source,
        sourceId: state.lesson && (state.lesson.lesson_id || state.lesson.id) || state.source,
        sourceTitle: sessionTitle(),
        lessonId: state.lesson && (state.lesson.lesson_id || state.lesson.id) || '',
        lessonTitle: sessionTitle()
      });
      state.practiceItems = passage ? [passage] : [];
    } else {
      state.practiceItems = state.items;
    }
    state.currentIndex = Math.max(0, Math.min(Number(index) || 0, Math.max(0, activeItems().length - 1)));
    state.sessionWrongItems = [];
    state.sessionCheckedIds = [];
    state.sessionCorrectIds = [];
    state.sessionAnswerIds = [];
    state.groupContextExpanded = false;
    resetCurrentAnswer();
    state.screen = 'practice';
    resetFloatingAudioContext();
    rememberSession();
    prepareNextItem();
    render();
    // startPractice được gọi trực tiếp từ cú chạm của người dùng. Focus ngay
    // trong cùng call stack để iOS cho phép mở bàn phím ảo.
    focusDictationInput({ immediate: true });
  }

  function resetCurrentAnswer() {
    stopSpeech();
    clearAutoAdvance();
    state.input = '';
    state.result = null;
    state.hint = null;
    state.showAnswer = false;
    state.usedHint = false;
    state.viewedAnswer = false;
    state.currentWrongChecks = 0;
    state.autoCheckSignature = '';
    state.autoSuggestedRating = '';
    state.listenCount = 0;
    state.speechStartIndex = 0;
    state.speechCharIndex = 0;
    state.manualBrowseMode = false;
    state.dictationCaretIndex = 0;
    state.dictationSelectionLength = 0;
    state.dictationResumeIndex = null;
    state.activitySelection = [];
    state.activityResult = null;
    state.groupTranscriptOpen = false;
    state.groupPreviewSpeaking = false;
  }

  function rememberSession() {
    const item = currentItem();
    if (!item) return;
    saveJson(LAST_SESSION_KEY, {
      schemaVersion: 2,
      source: state.source,
      lessonId: state.lesson && (state.lesson.lesson_id || state.lesson.id) || '',
      mode: state.mode,
      currentIndex: state.currentIndex,
      sessionName: state.sessionName || '',
      activitySelection: state.activitySelection.slice(),
      activityDescriptor: state.activityDescriptor ? structuredCloneSafe(state.activityDescriptor) : null,
      sentenceFilter: state.sentenceFilter,
      updatedAt: new Date().toISOString()
    });
  }

  function restoreDatasetSession(session) {
    if (!state.dataset) return false;
    const validFilters = datasetSentenceFilters().map((entry) => entry.id);
    state.sentenceFilter = validFilters.includes(session.sentenceFilter) ? session.sentenceFilter : 'all';
    state.items = filteredDatasetSentences();
    const descriptor = session.activityDescriptor;
    if (descriptor && descriptor.activity) {
      startDatasetActivity(descriptor.activity, descriptor.groupId || '', {
        choiceCount: descriptor.choiceCount,
        startIndex: session.currentIndex || 0
      });
    } else {
      const mode = session.mode || 'dictation';
      startPractice(mode, session.currentIndex || 0, { items: state.items.slice(), sessionName: session.sessionName || '' });
    }
    state.activitySelection = Array.isArray(session.activitySelection) ? session.activitySelection.slice() : [];
    render();
    return true;
  }

  async function resumeLastSession() {
    const session = loadJson(LAST_SESSION_KEY, null);
    if (!session) {
      state.error = 'Chưa có phiên nghe gần đây.';
      render();
      return;
    }
    if (session.source === 'new-hsk') {
      await openNewHskLibrary();
      const unit = state.newHskUnits.find((entry) => entry.unitId === session.lessonId);
      if (!unit) return;
      await openNewHskUnit(unit.unitId);
      restoreDatasetSession(session);
      return;
    }
    if (session.source === 'ldsn14') {
      await openLdsnLibrary();
      const unit = state.ldsnUnits.find((entry) => entry.unitId === session.lessonId);
      if (!unit) return;
      await openLdsnUnit(unit.unitId);
      restoreDatasetSession(session);
      return;
    }
    if (session.source === '301') {
      await open301Library();
      const lesson = state.lessons301.find((entry) => entry.lesson_id === session.lessonId);
      if (!lesson) return;
      await open301Lesson(lesson.lesson_id);
      if (state.items.length) startPractice(session.mode || 'dictation', session.currentIndex || 0);
      return;
    }
    if (session.source === 'custom') {
      await refreshListeningLibrary();
      const deck = state.libraryDecks.find((entry) => entry.id === session.lessonId);
      if (deck) {
        if (deck.groupId) state.activeLibraryGroupId = deck.groupId;
        await openCustomDeck(deck.id);
        startPractice(session.mode || 'dictation', session.currentIndex || 0);
      }
      return;
    }
    state.error = 'Phiên cũ không còn dữ liệu để mở.';
    render();
  }

  function openReview() {
    const entries = Object.values(state.progress)
      .filter((entry) => ['review', 'hard'].includes(entry.rating) && entry.item && Core.containsHan(entry.item.text))
      .sort((a, b) => String(b.lastReviewedAt || '').localeCompare(String(a.lastReviewedAt || '')));
    const deduped = [];
    const seen = new Set();
    entries.forEach((entry) => {
      const key = Core.answerUnits(entry.item.text).join('');
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(entry.item);
      }
    });
    if (!deduped.length) {
      state.error = 'Chưa có câu nào được đánh dấu Ôn hoặc Khó.';
      render();
      return;
    }
    state.source = 'review';
    state.dataset = null;
    state.activityDescriptor = null;
    state.sentenceFilter = 'all';
    state.lesson = { id: 'review', title: 'Câu cần ôn' };
    state.items = deduped;
    state.practiceItems = null;
    state.vocabulary = [];
    state.screen = 'mode';
    state.error = '';
    render();
  }

  function practiceModeLabel(item) {
    if (state.mode === 'word-choice') return 'Chọn từ';
    if (state.mode === 'token-ordering') return 'Xếp câu';
    if (state.mode === 'sequence-ordering') return 'Xếp thứ tự';
    if (state.mode === 'transcript') return 'Có transcript';
    if (item && item.fullGroupDictation) return item.groupKind === 'dialogue' ? 'Chép nguyên hội thoại' : 'Chép nguyên đoạn';
    if (state.mode === 'passage') return 'Chép đoạn';
    if (state.mode === 'passage-transcript') return 'Transcript đoạn';
    return 'Chép chính tả';
  }

  function speechTextFor(item) {
    return String(item && (item.speechText || item.text) || '');
  }

  function audioScopeFor(item) {
    return item && item.isPassage ? 'passage' : 'card';
  }

  function audioScopeLabel(item) {
    return item && item.isPassage ? 'toàn đoạn' : 'câu hiện tại';
  }

  function audioFingerprintFor(item) {
    if (!item) return '';
    return `${audioScopeFor(item)}|${String(item.canonicalItemId || item.id || '')}|${speechTextFor(item).trim()}`;
  }

  function currentAudioIsPrepared(item) {
    return Boolean(
      item &&
      state.audioPlayer === importedAudioElement &&
      state.audioEntry &&
      state.audioPreparedFingerprint === audioFingerprintFor(item) &&
      importedAudioElement.src
    );
  }

  function currentAudioStatusText(item) {
    if (state.audioLoading) return `Đang chuẩn bị MP3 ${audioScopeLabel(item)}...`;
    if (currentAudioIsPrepared(item)) {
      const duration = state.audioDuration || Number(state.audioEntry && state.audioEntry.duration) || 0;
      return `Đã nhập · ${formatAudioTime(duration)} · ${formatBytes(state.audioEntry && state.audioEntry.size || 0)}`;
    }
    return state.audioMessage || `Chưa có MP3 ${audioScopeLabel(item)}.`;
  }

  function formatAudioTime(seconds) {
    const value = Number(seconds);
    if (!Number.isFinite(value) || value < 0) return '--:--';
    const whole = Math.floor(value);
    const minutes = Math.floor(whole / 60);
    return `${String(minutes).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
  }

  function estimatedDeviceSpeechDuration(text) {
    const content = String(text || '');
    if (!content) return 0;
    const rate = Math.max(0.5, Number(state.settings.rate) || 1);
    const charsPerSecond = 3.6 * rate;
    return content.length / charsPerSecond;
  }

  function estimatedDeviceSpeechTime(text, charIndex) {
    const content = String(text || '');
    if (!content) return 0;
    const duration = estimatedDeviceSpeechDuration(content);
    const ratio = Math.max(0, Math.min(1, (Number(charIndex) || 0) / content.length));
    return duration * ratio;
  }

  function renderAudioControls(options = {}) {
    const showNext = Boolean(options.showNext);
    const nextLabel = options.nextLabel || 'Câu sau';
    const activeSpeaking = options.activeSpeaking !== undefined ? Boolean(options.activeSpeaking) : Boolean(state.speaking);
    const disabled = state.audioLoading ? 'disabled' : '';
    const controls = [
      `<button class="secondary-round" data-action="restart-speech" aria-label="Nghe từ đầu" ${disabled}><span aria-hidden="true">↺</span><small>Từ đầu</small></button>`,
      `<button class="secondary-round" data-action="rewind-speech" aria-label="Lùi ${state.settings.rewindSeconds} giây" ${disabled}><span aria-hidden="true">−${state.settings.rewindSeconds}s</span><small>Lùi</small></button>`,
      `<button class="play-button ${activeSpeaking ? 'is-speaking' : ''}" data-action="toggle-speech" aria-label="${activeSpeaking ? 'Tạm dừng' : 'Phát'}" ${disabled}>${state.audioLoading ? '◌' : activeSpeaking ? 'Ⅱ' : '▶'}</button>`,
      `<button class="secondary-round" data-action="forward-speech" aria-label="Tiến ${state.settings.rewindSeconds} giây" ${disabled}><span aria-hidden="true">+${state.settings.rewindSeconds}s</span><small>Tiến</small></button>`
    ];
    if (showNext) {
      controls.push(`<button class="secondary-round" data-action="next-item" aria-label="${escapeHtml(nextLabel)}"><span aria-hidden="true">›</span><small>${escapeHtml(nextLabel)}</small></button>`);
    }
    return `<div class="audio-controls audio-controls--${controls.length}">${controls.join('')}</div>`;
  }

  function resetFloatingAudioContext() {
    state.floatingAudioVisible = false;
    state.floatingAudioCollapsed = true;
    state.primaryAudioVisible = true;
    state.keyboardVisible = false;
    state.activeTargetAway = false;
  }

  function renderFloatingAudioControls() {
    const label = state.audioLoading
      ? 'Đang tải'
      : state.speaking
        ? 'Tạm dừng'
        : state.paused
          ? 'Phát tiếp'
          : 'Phát';
    const icon = state.audioLoading ? '◌' : state.speaking ? 'Ⅱ' : '▶';
    const disabled = state.audioLoading ? 'disabled' : '';
    return `
      <div
        class="practice-audio-float ${state.floatingAudioCollapsed ? 'is-collapsed' : ''}"
        data-floating-audio
        role="group"
        aria-label="Điều khiển nghe nhanh"
        ${state.floatingAudioVisible ? '' : 'hidden'}
      >
        <button
          type="button"
          class="practice-audio-collapse"
          data-action="toggle-floating-audio"
          tabindex="-1"
          aria-label="${state.floatingAudioCollapsed ? 'Mở rộng điều khiển nghe' : 'Thu gọn điều khiển nghe'}"
        >${state.floatingAudioCollapsed ? '›' : '‹'}</button>
        <div class="practice-audio-cluster">
          <button type="button" class="practice-audio-control practice-audio-skip" data-action="rewind-speech" tabindex="-1" aria-label="Lùi ${state.settings.rewindSeconds} giây" ${disabled}>−${state.settings.rewindSeconds}s</button>
          <button type="button" class="practice-audio-control practice-audio-toggle ${state.speaking ? 'is-speaking' : ''} ${state.paused ? 'is-paused' : ''}" data-action="toggle-speech" tabindex="-1" aria-label="${label}" ${disabled}><span aria-hidden="true">${icon}</span><small>${label}</small></button>
          <button type="button" class="practice-audio-control practice-audio-skip" data-action="forward-speech" tabindex="-1" aria-label="Tiến ${state.settings.rewindSeconds} giây" ${disabled}>+${state.settings.rewindSeconds}s</button>
        </div>
        <button type="button" class="practice-audio-return" data-action="return-to-active-target" tabindex="-1" aria-label="Quay về vị trí đang học" title="Về chỗ đang học" ${state.activeTargetAway ? '' : 'hidden'}><span aria-hidden="true">↳</span></button>
      </div>`;
  }

  function renderPractice() {
    if (state.mode === 'word-choice') { renderWordChoicePractice(); return; }
    if (state.mode === 'token-ordering') { renderTokenOrderingPractice(); return; }
    if (state.mode === 'sequence-ordering') { renderSequenceOrderingPractice(); return; }
    const item = currentItem();
    if (!item) {
      setScreen('home');
      return;
    }
    const items = activeItems();
    const units = Core.answerUnits(item.text);
    const isPassage = Boolean(item.isPassage);
    const isFullDialogue = Boolean(item.fullGroupDictation && item.groupKind === 'dialogue');
    const passageLabel = isFullDialogue ? 'Hội thoại' : 'Đoạn nghe';
    const listenLabel = isFullDialogue ? 'Nghe toàn hội thoại' : 'Nghe toàn đoạn';
    const isTranscript = state.mode === 'transcript' || state.mode === 'passage-transcript';
    const progress = isPassage ? `${item.segments.length} ${isFullDialogue ? 'lượt' : 'câu'}` : `${state.currentIndex + 1}/${items.length}`;
    const speechText = speechTextFor(item);
    const displayCurrentTime = state.audioPlayer
      ? state.audioCurrentTime
      : estimatedDeviceSpeechTime(speechText, state.speechCharIndex);
    const displayDuration = state.audioPlayer
      ? state.audioDuration
      : estimatedDeviceSpeechDuration(speechText);
    app.innerHTML = `
      ${pageHeader(state.sessionName || sessionTitle(), `${practiceModeLabel(item)} · ${progress}`, true)}
      <main class="listen-main practice-main">
        <section class="practice-progress" aria-label="Tiến độ">
          <span style="width:${isPassage ? 100 : ((state.currentIndex + 1) / items.length) * 100}%"></span>
        </section>

        <div class="practice-mode-switch" aria-label="Chế độ luyện">
          <button data-action="switch-current-mode" data-mode="${isPassage ? 'passage' : 'dictation'}" class="${!isTranscript ? 'active' : ''}">${item.fullGroupDictation ? 'Chép nguyên' : 'Chép chính tả'}</button>
          <button data-action="switch-current-mode" data-mode="${isPassage ? 'passage-transcript' : 'transcript'}" class="${isTranscript ? 'active' : ''}">Có transcript</button>
        </div>

        ${renderGroupContext(item)}

        <section class="audio-card" data-primary-audio>
          <div class="audio-head">
            <div><p class="eyebrow">${isPassage ? passageLabel : `Câu ${progress}`}</p><strong>${state.audioLoading ? 'Đang tải MP3...' : state.speaking ? (state.audioPlayer ? 'Đang phát...' : 'Đang đọc...') : state.paused ? 'Đã tạm dừng' : isPassage ? listenLabel : 'Nghe câu'}</strong></div>
            <button class="icon-action" data-action="open-settings" aria-label="Cài đặt giọng">⚙</button>
          </div>
          ${renderAudioControls({
            showNext: !isPassage,
            nextLabel: 'Câu sau',
            activeSpeaking: state.speaking
          })}
          <div class="audio-time" aria-live="polite">
            <span id="audioCurrentTime">${formatAudioTime(displayCurrentTime)}</span>
            <span>/</span>
            <span id="audioDuration">${displayDuration > 0 ? formatAudioTime(displayDuration) : '--:--'}</span>
            <small id="audioTimeKind" class="audio-time-kind">${state.audioPlayer ? '' : 'ước tính'}</small>
          </div>
          ${state.audioMessage && ['error', 'missing'].includes(state.audioStatus) ? `<div class="audio-runtime-status audio-runtime-status--${escapeHtml(state.audioStatus || 'info')}" role="alert">${escapeHtml(state.audioMessage)}</div>` : ''}
          <label class="speech-position">
            <span>${state.audioPlayer ? 'Vị trí trong file audio' : `Vị trí gần đúng ${isFullDialogue ? 'trong hội thoại' : isPassage ? 'trong đoạn' : 'trong câu'}`}</span>
            <input id="speechPosition" type="range" min="0" max="${state.audioPlayer && state.audioDuration > 0 ? state.audioDuration : Math.max(1, speechText.length)}" step="${state.audioPlayer ? '0.1' : '1'}" value="${state.audioPlayer ? Math.min(state.audioDuration || 0, state.audioCurrentTime) : Math.min(speechText.length, state.speechCharIndex)}" />
          </label>
          <div class="speed-row" aria-label="Tốc độ đọc">
            ${[0.5, 0.75, 1, 1.25, 1.5].map((rate) => `<button data-action="set-rate" data-rate="${rate}" class="${Number(state.settings.rate) === rate ? 'active' : ''}">${rate}×</button>`).join('')}
          </div>
        </section>

        ${isTranscript ? renderTranscript(item) : renderDictation(item, units)}

        ${!isPassage ? `<nav class="practice-nav">
          <button data-action="previous-item" ${state.currentIndex === 0 ? 'disabled' : ''}>← Câu trước</button>
          <button data-action="next-item">${state.currentIndex >= items.length - 1 ? 'Hoàn thành' : 'Câu sau →'}</button>
        </nav>` : `<nav class="practice-nav practice-nav--single"><button data-action="complete-session">${isFullDialogue ? 'Hoàn thành hội thoại' : 'Hoàn thành đoạn'}</button></nav>`}
      </main>
      ${renderFloatingAudioControls()}
      ${bottomNav()}
      ${settingsSheet()}
    `;
  }

  function compactAudioCard(item, label) {
    const speechText = speechTextFor(item);
    const displayCurrentTime = state.audioPlayer ? state.audioCurrentTime : estimatedDeviceSpeechTime(speechText, state.speechCharIndex);
    const displayDuration = state.audioPlayer ? state.audioDuration : estimatedDeviceSpeechDuration(speechText);
    const hasMultipleItems = activeItems().length > 1;
    const isLastItem = state.currentIndex >= activeItems().length - 1;
    const nextLabel = isLastItem ? 'Hoàn thành' : item && item.activityType === 'word-choice' ? 'Từ sau' : 'Câu sau';
    const statusText = state.groupPreviewSpeaking
      ? 'Đang nghe toàn bộ...'
      : state.audioLoading
        ? 'Đang tải MP3...'
        : state.speaking
          ? 'Đang phát...'
          : state.paused
            ? 'Đã tạm dừng'
            : 'Chạm để nghe';
    return `<section class="audio-card audio-card--compact" data-primary-audio>
      <div class="audio-head"><div><p class="eyebrow">${escapeHtml(label || 'Nghe')}</p><strong>${statusText}</strong></div><button class="icon-action" data-action="open-settings" aria-label="Cài đặt giọng">⚙</button></div>
      ${renderAudioControls({
        showNext: hasMultipleItems,
        nextLabel,
        activeSpeaking: state.speaking && !state.groupPreviewSpeaking
      })}
      <div class="audio-time"><span id="audioCurrentTime">${formatAudioTime(displayCurrentTime)}</span><span>/</span><span id="audioDuration">${displayDuration > 0 ? formatAudioTime(displayDuration) : '--:--'}</span><small id="audioTimeKind" class="audio-time-kind">${state.audioPlayer ? '' : 'ước tính'}</small></div>
      <div class="speed-row speed-row--compact">${[0.5, 0.75, 1, 1.25, 1.5].map((rate) => `<button data-action="set-rate" data-rate="${rate}" class="${Number(state.settings.rate) === rate ? 'active' : ''}">${rate}×</button>`).join('')}</div>
    </section>`;
  }

  function groupContextUnit(context) {
    return context.kind === 'dialogue' ? 'lượt' : 'câu';
  }

  function groupContextVisibleIndexes(context) {
    const total = context.items.length;
    if (state.groupContextExpanded || total <= 4) return context.items.map((entry, index) => index);
    const current = context.currentIndex;
    const indexes = new Set([Math.max(0, current - 1), current, Math.min(total - 1, current + 1)]);
    return Array.from(indexes).sort((left, right) => left - right);
  }

  function renderGroupContext(item) {
    const context = item && item.groupContext;
    if (!context) return '';
    const unit = groupContextUnit(context);
    const visibleIndexes = groupContextVisibleIndexes(context);
    const revealAll = state.groupTranscriptOpen || state.showAnswer || Boolean(state.activityResult && state.activityResult.isCorrect) || Boolean(state.result && state.result.isCorrect);
    const practiceIds = new Set(context.practiceItemIds || []);
    let previousIndex = -1;
    const lines = visibleIndexes.map((index) => {
      const entry = context.items[index];
      const isCurrent = index === context.currentIndex;
      const isCompleted = index < context.currentIndex;
      const isContextOnly = practiceIds.size > 0 && !practiceIds.has(entry.id);
      const canShowText = revealAll || isCompleted;
      const text = canShowText ? entry.text : isCurrent ? 'Đang nghe…' : 'Chưa mở';
      const gap = previousIndex >= 0 && index - previousIndex > 1
        ? `<div class="group-context-gap" aria-hidden="true">•••</div>`
        : '';
      previousIndex = index;
      const status = isCurrent ? 'is-current' : isCompleted ? 'is-done' : 'is-pending';
      return `${gap}<div class="group-context-line ${status} ${isContextOnly ? 'is-context-only' : ''}">
        <b>${entry.speaker ? escapeHtml(entry.speaker) : index + 1}</b>
        <span lang="zh-Hans">${escapeHtml(text)}</span>
        ${isContextOnly ? '<small>Ngữ cảnh</small>' : ''}
      </div>`;
    }).join('');
    const skippedCount = practiceIds.size ? context.items.length - practiceIds.size : 0;
    return `<section class="group-context-card">
      <div class="group-context-head">
        <div><p class="eyebrow">${context.kind === 'dialogue' ? 'Toàn bộ hội thoại' : 'Toàn bộ đoạn văn'}</p><h2>${escapeHtml(context.title)}</h2></div>
        <span class="group-context-progress">${context.currentIndex + 1}/${context.items.length}</span>
      </div>
      <div class="group-context-actions">
        <button type="button" data-action="play-group-overview" class="context-action ${state.groupPreviewSpeaking ? 'is-active' : ''}">${state.groupPreviewSpeaking ? '■ Dừng toàn bộ' : '▶ Nghe toàn bộ'}</button>
        <button type="button" data-action="toggle-group-transcript" class="context-action">${state.groupTranscriptOpen ? 'Ẩn nội dung' : 'Xem toàn bộ nội dung'}</button>
      </div>
      <div class="group-context-list">${lines}</div>
      ${context.items.length > 4 ? `<button type="button" class="group-context-expand" data-action="toggle-group-context">${state.groupContextExpanded ? 'Thu gọn' : `Xem đủ ${context.items.length} ${unit}`}</button>` : ''}
      ${skippedCount > 0 && item.activityType && item.activityType.includes('token-ordering') ? `<p class="group-context-note">${skippedCount} ${unit} quá ngắn để xếp từ, vẫn được giữ làm ngữ cảnh.</p>` : ''}
    </section>`;
  }

  function renderActivityFeedback(item) {
    if (!state.activityResult) return '';
    const correct = state.activityResult.isCorrect;
    return `<section class="activity-feedback ${correct ? 'is-correct' : 'is-wrong'}">
      <strong>${correct ? '✓ Chính xác' : 'Chưa đúng'}</strong>
      <span lang="zh-Hans">${escapeHtml(item.text)}</span>
      ${item.pinyin ? `<small>${escapeHtml(item.pinyin)}</small>` : ''}
      ${item.meaning ? `<small>${escapeHtml(item.meaning)}</small>` : ''}
      ${state.autoSuggestedRating ? `<small class="auto-rating-note">Đã tự gán: <strong>${ratingLabel(state.autoSuggestedRating)}</strong>${state.settings.autoNext && Number(state.settings.autoNextSeconds) > 0 && correct ? ` · Có ${state.settings.autoNextSeconds}s để đổi` : ''}</small>` : ''}
      <div class="rating-row"><button data-action="rate-item" data-rating="easy" class="${canonicalProgressRating(item) === 'easy' ? 'active' : ''}">Dễ</button><button data-action="rate-item" data-rating="review" class="${canonicalProgressRating(item) === 'review' ? 'active' : ''}">Ôn</button><button data-action="rate-item" data-rating="hard" class="${canonicalProgressRating(item) === 'hard' ? 'active' : ''}">Khó</button></div>
    </section>`;
  }

  function renderWordChoicePractice() {
    const item = currentItem();
    if (!item) { setScreen('home'); return; }
    const items = activeItems();
    app.innerHTML = `
      ${pageHeader(state.sessionName || sessionTitle(), `Chọn từ · ${state.currentIndex + 1}/${items.length}`, true)}
      <main class="listen-main practice-main">
        <section class="practice-progress"><span style="width:${((state.currentIndex + 1) / items.length) * 100}%"></span></section>
        ${compactAudioCard(item, 'Nghe từ')}
        <section class="choice-card" data-learning-target>
          <div class="dictation-heading"><div><p class="eyebrow">Chọn đáp án</p><h2>Từ nào vừa được đọc?</h2></div><span>${item.choiceCount} lựa chọn</span></div>
          <div class="word-choice-grid">${item.choices.map((choice) => {
            const selected = state.activitySelection[0] === choice.id;
            const isAnswer = state.activityResult && choice.id === item.answerId;
            const isWrong = state.activityResult && selected && choice.id !== item.answerId;
            return `<button class="word-choice-option ${selected ? 'is-selected' : ''} ${isAnswer ? 'is-answer' : ''} ${isWrong ? 'is-wrong' : ''}" data-action="choose-word" data-choice-id="${escapeHtml(choice.id)}" ${state.activityResult ? 'disabled' : ''}>
              <strong lang="zh-Hans">${escapeHtml(choice.text)}</strong>
              ${state.settings.showPinyin ? `<span>${escapeHtml(choice.pinyin || '')}</span>` : ''}
            </button>`;
          }).join('')}</div>
        </section>
        ${renderActivityFeedback(item)}
        <nav class="practice-nav"><button data-action="previous-item" ${state.currentIndex === 0 ? 'disabled' : ''}>← Trước</button><button data-action="next-item">${state.currentIndex >= items.length - 1 ? 'Hoàn thành' : 'Từ sau →'}</button></nav>
      </main>${renderFloatingAudioControls()}${bottomNav()}${settingsSheet()}`;
  }

  function selectedOrderingTokens(item) {
    const map = new Map((item.tokens || item.cards || []).map((entry) => [entry.id, entry]));
    return state.activitySelection.map((id) => map.get(id)).filter(Boolean);
  }

  function orderingStatus(item, token, index) {
    if (!state.activityResult) return '';
    const expected = item.tokens || item.cards || [];
    return expected[index] && expected[index].id === token.id ? 'is-correct' : 'is-wrong';
  }

  function renderTokenOrderingPractice() {
    const item = currentItem();
    if (!item) { setScreen('home'); return; }
    const items = activeItems();
    const selected = selectedOrderingTokens(item);
    const selectedIds = new Set(state.activitySelection);
    const context = item.groupContext;
    const contextLabel = context && context.kind === 'dialogue' ? 'Lượt thoại hiện tại' : context && context.kind === 'passage' ? 'Câu hiện tại trong đoạn' : 'Câu nghe';
    const title = context && context.kind === 'dialogue' ? 'Xếp từ trong lượt thoại' : context && context.kind === 'passage' ? 'Xếp từ trong câu hiện tại' : 'Xếp từ thành câu';
    const remainingSlots = Math.max(0, item.tokens.length - selected.length);
    app.innerHTML = `
      ${pageHeader(state.sessionName || sessionTitle(), `${title} · ${state.currentIndex + 1}/${items.length}`, true)}
      <main class="listen-main practice-main">
        <section class="practice-progress"><span style="width:${((state.currentIndex + 1) / items.length) * 100}%"></span></section>
        ${renderGroupContext(item)}
        ${compactAudioCard(item, contextLabel)}
        <section class="ordering-card ordering-card--tokens" data-learning-target>
          <div class="dictation-heading"><div><p class="eyebrow">Xếp từ</p><h2>Chạm các từ theo thứ tự nghe được</h2></div><span>${selected.length}/${item.tokens.length}</span></div>
          <p class="activity-instruction">Nghe trước, sau đó chọn từng thẻ. Chạm thẻ đã chọn để trả lại.</p>
          <div class="ordering-answer ${selected.length ? '' : 'is-empty'}">
            ${selected.map((token, index) => `<button data-action="remove-order-token" data-token-id="${escapeHtml(token.id)}" class="ordering-token ${orderingStatus(item, token, index)}"><span lang="zh-Hans">${escapeHtml(token.text)}</span></button>`).join('')}
            ${Array.from({ length: remainingSlots }, () => '<span class="ordering-slot-placeholder" aria-hidden="true"></span>').join('')}
            ${!selected.length ? '<span class="ordering-empty-label">Câu của bạn sẽ hiện ở đây</span>' : ''}
          </div>
          <div class="ordering-pool-label"><span>Các từ để chọn</span><small>${item.tokens.length} thẻ</small></div>
          <div class="ordering-pool">${item.shuffledTokens.map((token) => `<button data-action="add-order-token" data-token-id="${escapeHtml(token.id)}" class="ordering-token" ${selectedIds.has(token.id) || state.activityResult && state.activityResult.isCorrect ? 'disabled' : ''}><span lang="zh-Hans">${escapeHtml(token.text)}</span></button>`).join('')}</div>
          <div class="ordering-actions"><button data-action="undo-ordering" ${!selected.length ? 'disabled' : ''}>Hoàn tác</button><button data-action="reset-ordering" ${!selected.length ? 'disabled' : ''}>Làm lại</button><button class="primary-button" data-action="check-ordering" ${selected.length !== item.tokens.length ? 'disabled' : ''}>Kiểm tra</button></div>
          <button class="link-button" data-action="show-order-answer">Hiện đáp án</button>
        </section>
        ${renderActivityFeedback(item)}
        <nav class="practice-nav"><button data-action="previous-item" ${state.currentIndex === 0 ? 'disabled' : ''}>← Trước</button><button data-action="next-item">${state.currentIndex >= items.length - 1 ? 'Hoàn thành' : 'Câu sau →'}</button></nav>
      </main>${renderFloatingAudioControls()}${bottomNav()}${settingsSheet()}`;
  }

  function renderSequenceOrderingPractice() {
    const item = currentItem();
    if (!item) { setScreen('home'); return; }
    const sequenceItem = Object.assign({}, item, { tokens: item.cards });
    const selected = selectedOrderingTokens(sequenceItem);
    const selectedIds = new Set(state.activitySelection);
    const isDialogue = item.groupKind === 'dialogue';
    const unitLabel = isDialogue ? 'lượt thoại' : 'câu';
    const remaining = Math.max(0, item.cards.length - selected.length);
    const selectedCards = selected.map((card, index) => `<button data-action="remove-order-token" data-token-id="${escapeHtml(card.id)}" class="sequence-card sequence-card--answer ${orderingStatus(sequenceItem, card, index)}">
      <b>${index + 1}</b><span class="sequence-card__content">${card.speaker ? `<strong>${escapeHtml(card.speaker)}：</strong>` : ''}<span lang="zh-Hans">${escapeHtml(card.text)}</span></span>
    </button>`).join('');
    const emptySlots = remaining > 0 ? `<div class="sequence-slot sequence-slot--next"><b>${selected.length + 1}</b><span>Chọn ${unitLabel} tiếp theo ở phía dưới</span></div>` : '';
    app.innerHTML = `
      ${pageHeader(state.sessionName || item.groupTitle || sessionTitle(), isDialogue ? 'Xếp thứ tự lượt thoại' : 'Xếp thứ tự câu trong đoạn', true)}
      <main class="listen-main practice-main">
        <section class="practice-progress"><span style="width:${item.cards.length ? (selected.length / item.cards.length) * 100 : 0}%"></span></section>
        ${compactAudioCard(item, isDialogue ? 'Nghe toàn hội thoại' : 'Nghe toàn đoạn')}
        <section class="ordering-card ordering-card--sequence" data-learning-target>
          <div class="dictation-heading"><div><p class="eyebrow">${isDialogue ? 'Trình tự hội thoại' : 'Trình tự đoạn văn'}</p><h2>Chọn từng ${unitLabel} theo thứ tự nghe được</h2></div><span>${selected.length}/${item.cards.length}</span></div>
          <p class="activity-instruction">Ở hoạt động này bạn xếp các câu hoàn chỉnh. Xếp từ trong từng câu là một hoạt động riêng.</p>
          <div class="sequence-answer" aria-label="Thứ tự đã chọn">${selectedCards}${emptySlots}</div>
          <div class="ordering-pool-label"><span>${isDialogue ? 'Các lượt thoại đã xáo trộn' : 'Các câu đã xáo trộn'}</span><small>Chạm để đưa lên trên</small></div>
          <div class="sequence-pool">${item.shuffledCards.map((card) => `<button data-action="add-order-token" data-token-id="${escapeHtml(card.id)}" class="sequence-card sequence-card--pool" ${selectedIds.has(card.id) || state.activityResult && state.activityResult.isCorrect ? 'disabled' : ''}>
            <span class="sequence-card__content">${card.speaker ? `<strong class="speaker-badge">${escapeHtml(card.speaker)}</strong>` : ''}<span lang="zh-Hans">${escapeHtml(card.text)}</span></span>
          </button>`).join('')}</div>
          <div class="ordering-actions"><button data-action="undo-ordering" ${!selected.length ? 'disabled' : ''}>Hoàn tác</button><button data-action="reset-ordering" ${!selected.length ? 'disabled' : ''}>Làm lại</button><button class="primary-button" data-action="check-ordering" ${selected.length !== item.cards.length ? 'disabled' : ''}>Kiểm tra</button></div>
          <button class="link-button" data-action="show-order-answer">Hiện đáp án</button>
        </section>
        ${renderActivityFeedback(item)}
        <nav class="practice-nav practice-nav--single"><button data-action="complete-session">Hoàn thành</button></nav>
      </main>${renderFloatingAudioControls()}${bottomNav()}${settingsSheet()}`;
  }

  function clampDictationCaretIndex(item, index) {
    const total = Core.answerUnits(item && item.text || '').length;
    return Math.max(0, Math.min(Number.isFinite(index) ? index : 0, total));
  }

  function currentDictationCaretIndex(item) {
    return clampDictationCaretIndex(item, state.dictationCaretIndex);
  }

  function renderSlot(index, inputUnits, comparison, activeIndex, extraClass) {
    const actual = inputUnits[index] || '';
    let status = '';
    if (state.result) status = comparison.cells[index] && comparison.cells[index].correct ? 'is-correct' : actual ? 'is-wrong' : 'is-empty-wrong';
    const active = index === activeIndex ? 'is-active' : '';
    const selected = index === activeIndex && state.dictationSelectionLength > 0 ? 'is-selected' : '';
    return `<span class="dictation-slot ${extraClass || ''} ${status} ${active} ${selected}" lang="zh-Hans" data-slot-index="${index}" data-slot-filled="${actual ? 'true' : 'false'}">${escapeHtml(actual)}</span>`;
  }

  function renderShortSlots(item, comparison, inputUnits, activeIndex) {
    const rows = Core.splitIntoRows(Core.answerUnits(item.text), 10);
    let flatIndex = 0;
    return rows.map((row) => {
      const rowHtml = row.map(() => renderSlot(flatIndex++, inputUnits, comparison, activeIndex, '')).join('');
      return `<div class="dictation-row" style="--slot-count:${row.length}">${rowHtml}</div>`;
    }).join('');
  }

  function renderPassageSlots(item, comparison, inputUnits, activeIndex) {
    let offset = 0;
    return (item.segments || []).map((segment) => {
      const tokens = Core.layoutTokens(segment.text);
      const segmentUnitCount = Core.answerUnits(segment.text).length;
      const typedInSegment = Math.max(0, Math.min(segmentUnitCount, inputUnits.length - offset));
      let precedingUnits = 0;
      const flow = tokens.map((token) => {
        if (token.type === 'slot') {
          const slot = renderSlot(offset + token.unitIndex, inputUnits, comparison, activeIndex, 'dictation-slot--inline');
          precedingUnits += 1;
          return slot;
        }
        if (token.type === 'space') return '<span class="passage-space"> </span>';
        if (token.type === 'break') return '<br />';
        const punctuationAfterUnit = offset + precedingUnits - 1;
        const punctuationVisible = Boolean(state.showAnswer || state.result || (precedingUnits > 0 && typedInSegment >= precedingUnits));
        return `<span class="passage-punctuation ${punctuationVisible ? 'is-visible' : 'is-hidden'}" data-after-unit="${punctuationAfterUnit}">${escapeHtml(token.char)}</span>`;
      }).join('');
      offset += segmentUnitCount;
      return `<div class="passage-line" lang="zh-Hans">
        ${segment.speaker ? `<span class="passage-speaker">${escapeHtml(segment.speaker)}：</span>` : ''}
        <span class="passage-flow">${flow}</span>
      </div>`;
    }).join('');
  }

  function renderDictation(item, units) {
    const comparison = state.result || Core.compareAnswers(state.input, item.text);
    const inputUnits = Core.answerUnits(state.input);
    const caretIndex = currentDictationCaretIndex(item);
    const activeIndex = caretIndex < units.length ? caretIndex : -1;
    const slots = item.isPassage
      ? renderPassageSlots(item, comparison, inputUnits, activeIndex)
      : renderShortSlots(item, comparison, inputUnits, activeIndex);
    const hasNamedSpeakers = Boolean(item.isPassage && (item.segments || []).some((segment) => segment.speaker));

    return `
      <section class="dictation-card ${item.isPassage ? 'dictation-card--passage' : ''}" data-learning-target>
        <div class="dictation-heading">
          <div><p class="eyebrow">Nhập chữ Hán</p><h2>${item.fullGroupDictation ? (item.groupKind === 'dialogue' ? 'Chép nguyên hội thoại' : 'Chép nguyên đoạn') : item.isPassage ? 'Chép lại đoạn vừa nghe' : 'Gõ lại câu vừa nghe'}</h2></div>
          <div class="dictation-heading__tools">
            <span class="dictation-count">${inputUnits.length}/${units.length}</span>
          </div>
        </div>
        <div class="dictation-input-wrap ${item.isPassage ? 'dictation-input-wrap--passage' : ''}" data-action="focus-input">
          <div class="${item.isPassage ? 'passage-lines' : 'dictation-rows'}" aria-hidden="true">${slots}</div>
          <input id="dictationInput" class="dictation-ime-input" type="text" value="${escapeHtml(state.input)}" inputmode="text" enterkeyhint="done" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" lang="zh-Hans" aria-label="Nhập câu tiếng Trung" />
        </div>
        <p class="input-help">Gõ pinyin trên bàn phím Trung rồi chọn chữ. Chạm vào chữ đã gõ để thay trực tiếp; chọn chữ mới xong con trỏ tự quay lại vị trí đang gõ. Dấu câu${hasNamedSpeakers ? ' và tên người nói' : ''} không cần nhập.</p>

        <div class="dictation-actions">
          <button class="primary-button" data-action="check-answer">Kiểm tra</button>
          <button class="secondary-button" data-action="show-hint">Gợi ý</button>
          <button class="text-button" data-action="toggle-answer">${state.showAnswer ? 'Ẩn đáp án' : 'Xem đáp án'}</button>
        </div>

        ${state.hint ? renderHint(item) : ''}
        ${state.showAnswer ? renderAnswer(item) : ''}
        ${state.result ? renderResult(item, comparison) : ''}
      </section>
    `;
  }

  function renderHint(item) {
    const answer = Core.answerUnits(item.text);
    const index = Math.min(Core.answerUnits(state.input).length, Math.max(0, answer.length - 1));
    const hint = Core.buildHint(item, index, state.vocabulary);
    if (!hint || !hint.char) return '';
    const wordOpen = Boolean(state.hint && state.hint.wordOpen);
    const word = hint.word && Core.answerUnits(hint.word.text).length > 1 ? hint.word : null;
    const wordIndex = word ? Math.max(0, hint.index - Number(word.matchStart || 0)) : 0;
    const remainingWord = word ? Core.answerUnits(word.text).slice(wordIndex).join('') : '';
    return `
      <aside class="hint-card">
        <div class="hint-card__head">
          <p class="eyebrow">Gợi ý · ô ${hint.index + 1}</p>
          <button class="hint-close" data-action="hide-hint" aria-label="Ẩn gợi ý">×</button>
        </div>
        <div class="hint-card__body">
          <div class="hint-character">
            <strong lang="zh-Hans">${escapeHtml(hint.char)}</strong>
            <span>${hint.pinyin ? `Pinyin · ${escapeHtml(hint.pinyin)}` : 'Chưa có pinyin riêng cho chữ này'}</span>
          </div>
          <div class="hint-actions">
            <button data-action="fill-hint-char" data-char="${escapeHtml(hint.char)}">Điền chữ</button>
            ${word ? `<button data-action="toggle-word-hint">${wordOpen ? 'Ẩn gợi ý từ' : 'Gợi ý cả từ'}</button>` : ''}
          </div>
        </div>
        ${word && wordOpen ? `<div class="word-hint"><span class="word-hint__copy"><strong lang="zh-Hans">${escapeHtml(word.text)}</strong><span>${escapeHtml(word.pinyin || '')}${word.meaning ? ` · ${escapeHtml(word.meaning)}` : ''}</span></span><button data-action="fill-hint-word" data-word="${escapeHtml(remainingWord)}">Điền phần còn lại</button></div>` : ''}
      </aside>
    `;
  }

  function renderAnswer(item) {
    if (item.isPassage) {
      return `<aside class="answer-card"><p class="eyebrow">Transcript đoạn</p>${renderPassageTranscriptLines(item, false)}</aside>`;
    }
    return `<aside class="answer-card"><p class="eyebrow">Đáp án</p><strong lang="zh-Hans">${escapeHtml(item.text)}</strong>${item.pinyin ? `<span>${escapeHtml(item.pinyin)}</span>` : ''}${item.meaning ? `<small>${escapeHtml(item.meaning)}</small>` : ''}</aside>`;
  }

  function renderResult(item, comparison) {
    const ratingEntry = state.progress[progressKey(item, state.mode)];
    const activeRating = ratingEntry && ratingEntry.rating || state.autoSuggestedRating;
    const autoNextText = comparison.isCorrect && state.autoAdvanceDeadline
      ? `Tự chuyển sau ${Math.max(0, Math.ceil((state.autoAdvanceDeadline - Date.now()) / 1000))} giây.`
      : '';
    return `
      <section class="result-card ${comparison.isCorrect ? 'is-correct' : 'is-wrong'}">
        <div><strong>${comparison.isCorrect ? 'Chính xác' : `Đúng ${comparison.correctCount}/${comparison.total} chữ`}</strong><span>${comparison.isCorrect ? `${autoNextText || 'Bạn có thể nghe lại hoặc chuyển tiếp.'}${state.autoSuggestedRating ? ` · Tự xếp ${ratingLabel(state.autoSuggestedRating)}.` : ''}` : 'Các chữ sai đã được đánh dấu. Bạn có thể sửa trực tiếp.'}</span></div>
        ${!comparison.isCorrect ? `<button data-action="focus-input">Sửa tiếp</button>` : state.autoAdvanceDeadline ? `<button data-action="cancel-auto-next">Ở lại</button>` : ''}
      </section>
      ${!comparison.isCorrect && !item.isPassage ? `<div class="result-answer"><span>Đáp án</span><strong lang="zh-Hans">${escapeHtml(item.text)}</strong></div>` : ''}
      <div class="result-followup">
        <button data-action="restart-speech">Nghe lại</button>
        <button data-action="switch-current-mode" data-mode="${item.isPassage ? 'passage-transcript' : 'transcript'}">Xem transcript</button>
      </div>
      <div class="rating-row" aria-label="Tự đánh giá">
        <button data-action="rate-item" data-rating="easy" class="${activeRating === 'easy' ? 'active' : ''}">Dễ</button>
        <button data-action="rate-item" data-rating="review" class="${activeRating === 'review' ? 'active' : ''}">Ôn</button>
        <button data-action="rate-item" data-rating="hard" class="${activeRating === 'hard' ? 'active' : ''}">Khó</button>
      </div>
    `;
  }

  function renderPassageTranscriptLines(item, includeExtras) {
    return `<div class="passage-transcript-list">${(item.segments || []).map((segment) => `
      <article class="passage-transcript-line">
        <div class="passage-transcript-zh" lang="zh-Hans">${segment.speaker ? `<span>${escapeHtml(segment.speaker)}：</span>` : ''}${escapeHtml(segment.text)}</div>
        ${includeExtras && state.settings.showPinyin && segment.pinyin ? `<div class="passage-transcript-pinyin">${escapeHtml(segment.pinyin)}</div>` : ''}
        ${includeExtras && state.settings.showMeaning && segment.meaning ? `<div class="passage-transcript-meaning">${escapeHtml(segment.meaning)}</div>` : ''}
      </article>`).join('')}</div>`;
  }

  function renderTranscript(item) {
    const ratingEntry = state.progress[progressKey(item, state.mode)];
    return `
      <section class="transcript-card ${item.isPassage ? 'transcript-card--passage' : ''}" data-learning-target>
        <p class="eyebrow">Transcript</p>
        ${item.isPassage
          ? renderPassageTranscriptLines(item, true)
          : `<div class="transcript-zh" lang="zh-Hans">${escapeHtml(item.text)}</div>
             ${state.settings.showPinyin && item.pinyin ? `<div class="transcript-pinyin">${escapeHtml(item.pinyin)}</div>` : ''}
             ${state.settings.showMeaning && item.meaning ? `<div class="transcript-meaning">${escapeHtml(item.meaning)}</div>` : ''}`}
        <div class="transcript-toggles">
          <label><input type="checkbox" data-action="toggle-pinyin" ${state.settings.showPinyin ? 'checked' : ''} /> Pinyin</label>
          <label><input type="checkbox" data-action="toggle-meaning" ${state.settings.showMeaning ? 'checked' : ''} /> Nghĩa</label>
        </div>
        <button class="primary-button transcript-retry" data-action="switch-current-mode" data-mode="${item.isPassage ? 'passage' : 'dictation'}">${item.isPassage ? 'Chép lại đoạn này' : 'Chép lại câu này'}</button>
        <div class="rating-row" aria-label="Tự đánh giá">
          <button data-action="rate-item" data-rating="easy" class="${ratingEntry && ratingEntry.rating === 'easy' ? 'active' : ''}">Dễ</button>
          <button data-action="rate-item" data-rating="review" class="${ratingEntry && ratingEntry.rating === 'review' ? 'active' : ''}">Ôn</button>
          <button data-action="rate-item" data-rating="hard" class="${ratingEntry && ratingEntry.rating === 'hard' ? 'active' : ''}">Khó</button>
        </div>
      </section>
    `;
  }

  function renderComplete() {
    const checked = state.sessionCheckedIds.length;
    const correct = state.sessionCorrectIds.length;
    const wrong = state.sessionWrongItems.length;
    app.innerHTML = `
      ${pageHeader(state.sessionName || sessionTitle(), 'Hoàn thành', true)}
      <main class="listen-main">
        <section class="complete-card">
          <span class="complete-icon">✓</span>
          <p class="eyebrow">Hoàn thành bài nghe</p>
          <h1>${wrong ? 'Còn vài câu nên chép lại' : 'Bạn đã hoàn thành'}</h1>
          <div class="complete-stats">
            <div><strong>${correct}</strong><span>Đúng khi kiểm tra</span></div>
            <div><strong>${wrong}</strong><span>Cần luyện lại</span></div>
            <div><strong>${state.sessionAnswerIds.length}</strong><span>Đã xem đáp án</span></div>
          </div>
          <div class="complete-actions">
            ${wrong ? `<button class="primary-button" data-action="retry-wrong">Chép lại ${wrong === 1 ? 'câu sai' : `${wrong} câu sai`}</button>` : ''}
            <button class="secondary-button" data-action="return-mode">Chọn cách luyện khác</button>
            <button class="text-button" data-action="go-home">Kết thúc</button>
          </div>
        </section>
      </main>
      ${bottomNav()}
    `;
  }


  function bottomNav() {
    return `
      <nav class="listen-bottom-nav" aria-label="Điều hướng chính">
        <a href="../../index.html" class="listen-bottom-nav__item">
          <span aria-hidden="true">⌂</span><small>Trang chủ</small>
        </a>
        <a href="../lookup/index.html" class="listen-bottom-nav__item">
          <span aria-hidden="true">⌕</span><small>Tra</small>
        </a>
        <a href="../hanzi-stroke/index.html?study=hub" class="listen-bottom-nav__item">
          <span aria-hidden="true">学</span><small>Học</small>
        </a>
        <button type="button" class="listen-bottom-nav__item" data-action="open-menu" aria-controls="listeningMenuDrawer" aria-expanded="${state.menuOpen ? 'true' : 'false'}">
          <span aria-hidden="true">☰</span><small>Menu</small>
        </button>
      </nav>
      ${menuDrawer()}
    `;
  }

  function menuDrawer() {
    if (!state.menuOpen) return '';
    return `
      <div class="listen-menu-backdrop" data-action="close-menu"></div>
      <aside id="listeningMenuDrawer" class="listen-menu-drawer" role="dialog" aria-modal="true" aria-label="Menu">
        <div class="listen-menu-head"><div><p class="eyebrow">Tiếng Trung</p><h2>Menu</h2></div><button data-action="close-menu" aria-label="Đóng menu">×</button></div>
        <nav class="listen-menu-list" aria-label="Menu chính">
          <a href="../../index.html"><span>⌂</span><span><strong>Trang chủ</strong><small>Trang chính và học tiếp</small></span><b>›</b></a>
          <a href="../lookup/index.html"><span>⌕</span><span><strong>Tra</strong><small>Tra chữ, từ và pinyin</small></span><b>›</b></a>
          <a href="../hanzi-stroke/index.html?study=hub"><span>学</span><span><strong>Học</strong><small>Các công cụ học tiếng Trung</small></span><b>›</b></a>
        </nav>
        <p class="listen-menu-section">Học tập</p>
        <nav class="listen-menu-list" aria-label="Công cụ học">
          <a href="../pinyin/index.html"><span>拼</span><span><strong>Pinyin</strong><small>Học · Nghe · Quiz · Ôn</small></span><b>›</b></a>
          <a href="../hanzi-stroke/index.html?study=lookup"><span>写</span><span><strong>Bút thuận</strong><small>Luyện viết và thứ tự nét</small></span><b>›</b></a>
          <a href="../hanzi-stroke/index.html?study=hsk"><span>课</span><span><strong>HSK & Giáo trình</strong><small>Bài học, từ vựng và ngữ pháp</small></span><b>›</b></a>
          <a href="../hanzi-stroke/index.html?study=radicals"><span>部</span><span><strong>Bộ thủ</strong><small>214 bộ thủ và chữ liên quan</small></span><b>›</b></a>
          <a href="../hanzi-stroke/index.html?study=flashcards"><span>卡</span><span><strong>Thẻ</strong><small>Flashcard và ôn tập</small></span><b>›</b></a>
          <a href="./index.html" class="is-active"><span>听</span><span><strong>Nghe</strong><small>Chép chính tả và transcript</small></span><b>›</b></a>
          <a href="../../index.html#dialogue301"><span>301</span><span><strong>Giáo trình 301</strong><small>Đàm thoại theo bài</small></span><b>›</b></a>
        </nav>
      </aside>
    `;
  }

  function pageHeader(title, subtitle, back) {
    return `
      <header class="listen-header">
        <div class="listen-header-inner">
          ${back ? `<button class="back-button" data-action="go-back" aria-label="Quay lại">←</button>` : `<a class="brand-link" href="../../index.html" aria-label="Trang chủ"><span>中</span></a>`}
          <div class="listen-header-title"><strong>${formatHanziRuns(title)}</strong><small>${escapeHtml(subtitle || '')}</small></div>
          <a class="home-button" href="../../index.html" aria-label="Trang chủ">⌂</a>
        </div>
      </header>
    `;
  }

  function loadingCard(text) {
    return `<div class="loading-card"><span class="spinner"></span><span>${escapeHtml(text)}</span></div>`;
  }

  function errorCard(text) {
    return `<div class="notice-card is-error"><strong>Có lỗi</strong><span>${escapeHtml(text)}</span></div>`;
  }

  function emptyCard(title, text) {
    return `<div class="empty-card"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div>`;
  }

  function settingsSheet() {
    if (!state.settingsOpen) return '';
    const voices = chineseVoices();
    const item = currentItem();
    const isPassage = Boolean(item && item.isPassage);
    return `
      <div class="sheet-backdrop" data-action="close-settings"></div>
      <section class="settings-sheet" role="dialog" aria-modal="true" aria-label="Cài đặt giọng đọc">
        <div class="sheet-handle"></div>
        <div class="sheet-head"><div><p class="eyebrow">Âm thanh</p><h2>Cài đặt nghe</h2></div><button data-action="close-settings">×</button></div>
        <label class="setting-field"><span>Ngôn ngữ</span><select disabled><option>Phổ thông Trung Quốc · zh-CN</option></select></label>
        <fieldset class="setting-field"><legend>Nguồn phát</legend><div class="segmented segmented--three">
          ${[['auto', 'Tự động'], ['import', 'MP3 đã nhập'], ['device', 'Thiết bị']].map(([value, label]) => `<button data-action="set-voice-source" data-source="${value}" class="${state.settings.voiceSource === value ? 'active' : ''}">${label}</button>`).join('')}
        </div><small class="setting-note">Tự động: ${isPassage ? 'ưu tiên MP3 toàn đoạn, nếu chưa có thì dùng giọng thiết bị đọc toàn đoạn.' : 'ưu tiên MP3 của câu hiện tại, nếu chưa có thì dùng giọng thiết bị.'}</small></fieldset>
        ${isPassage ? `
          <div class="audio-scope-heading"><strong>Âm thanh toàn đoạn</strong><small>Chỉ cần một MP3 cho toàn bộ ${item.segments?.length || 0} câu.</small></div>
          <div class="current-audio-status ${currentAudioIsPrepared(item) ? 'is-ready' : ''}">${escapeHtml(currentAudioStatusText(item))}</div>
          <div class="audio-setting-actions audio-setting-actions--three">
            <button type="button" data-action="import-current-audio">${currentAudioIsPrepared(item) ? 'Thay MP3 toàn đoạn' : 'Nhập MP3 cho toàn đoạn'}</button>
            <input id="currentAudioFileInput" type="file" accept=".mp3,audio/mpeg,audio/mp3" hidden />
            <button type="button" data-action="export-current-audio">Xuất MP3</button>
            <button type="button" data-action="delete-current-audio" class="is-danger-soft">Xóa MP3</button>
          </div>
        ` : `
          <div class="audio-scope-heading"><strong>Âm thanh từng câu</strong><small>MP3 này chỉ gắn với câu đang mở.</small></div>
          <div class="current-audio-status ${currentAudioIsPrepared(item) ? 'is-ready' : ''}">${escapeHtml(currentAudioStatusText(item))}</div>
          <div class="audio-setting-actions audio-setting-actions--three">
            <button type="button" data-action="import-current-audio">${currentAudioIsPrepared(item) ? 'Thay MP3 câu này' : 'Nhập MP3 cho câu hiện tại'}</button>
            <input id="currentAudioFileInput" type="file" accept=".mp3,audio/mpeg,audio/mp3" hidden />
            <button type="button" data-action="export-current-audio">Xuất MP3</button>
            <button type="button" data-action="delete-current-audio" class="is-danger-soft">Xóa MP3</button>
          </div>
        `}
        <p class="audio-import-note">Điều kiện: file MP3 không DRM, tối đa 20 MB, thời lượng 0,3–300 giây. File được sao chép vào bộ nhớ app và vẫn tự dọn sau 30 ngày hoặc khi vượt 300 MB.</p>
        <div class="audio-cache-summary"><span>MP3 trong app</span><strong>${formatBytes(state.audioStats.bytes)} / ${formatBytes(state.audioStats.maxBytes)}</strong><small>${state.audioStats.count} file</small></div>
        <div class="audio-setting-actions audio-setting-actions--secondary"><button type="button" data-action="clear-expired-audio">Xóa audio đã quá hạn</button><button type="button" data-action="clear-all-audio">Xóa toàn bộ audio</button></div>
        <fieldset class="setting-field"><legend>Ưu tiên giọng thiết bị</legend><div class="segmented">
          ${[['auto', 'Tự động'], ['female', 'Nữ'], ['male', 'Nam']].map(([value, label]) => `<button data-action="set-gender" data-gender="${value}" class="${state.settings.voiceGender === value ? 'active' : ''}">${label}</button>`).join('')}
        </div></fieldset>
        <label class="setting-field"><span>Chọn giọng thiết bị cụ thể</span><select id="voiceSelect">
          <option value="">Tự chọn theo ưu tiên trên</option>
          ${voices.map((voice) => `<option value="${escapeHtml(voice.voiceURI || voice.name)}" ${state.settings.voiceURI === (voice.voiceURI || voice.name) ? 'selected' : ''}>${escapeHtml(voice.name)} · ${escapeHtml(voice.lang || '')}</option>`).join('')}
        </select></label>
        <fieldset class="setting-field"><legend>Lùi/tiến khi nghe lại</legend><div class="segmented">
          ${[3, 5].map((seconds) => `<button data-action="set-rewind" data-seconds="${seconds}" class="${Number(state.settings.rewindSeconds) === seconds ? 'active' : ''}">${seconds} giây</button>`).join('')}
        </div></fieldset>
        <fieldset class="setting-field"><legend>Tự động khi chép chính tả</legend><div class="automation-settings">
          <label><span><strong>Nhập đủ tự kiểm tra</strong><small>So sánh ngay khi đã nhập đủ số chữ.</small></span><input type="checkbox" data-action="toggle-auto-check" ${state.settings.autoCheck ? 'checked' : ''} /></label>
          <label><span><strong>Tự xếp Dễ / Ôn / Khó</strong><small>Đúng ngay: Dễ · sửa sai: Ôn · dùng gợi ý/đáp án: Khó.</small></span><input type="checkbox" data-action="toggle-auto-rate" ${state.settings.autoRate ? 'checked' : ''} /></label>
          <label><span><strong>Đúng tự sang câu sau</strong><small>Chỉ chuyển khi đáp án hoàn toàn chính xác.</small></span><input type="checkbox" data-action="toggle-auto-next" ${state.settings.autoNext ? 'checked' : ''} /></label>
        </div></fieldset>
        <fieldset class="setting-field"><legend>Thời gian chờ trước khi chuyển</legend>
          <div class="segmented segmented--five">
            ${[0, 1, 2, 3, 5].map((seconds) => `<button data-action="set-auto-next-seconds" data-seconds="${seconds}" class="${Number(state.settings.autoNextSeconds) === seconds ? 'active' : ''}">${seconds}s</button>`).join('')}
          </div>
          <div class="custom-seconds-row">
            <label for="autoNextCustomSeconds">Tùy chỉnh</label>
            <div class="custom-seconds-control">
              <input id="autoNextCustomSeconds" type="number" inputmode="decimal" min="0" max="60" step="0.5" value="${escapeHtml(String(state.settings.autoNextSeconds ?? 2))}" aria-label="Nhập thời gian chờ tùy chỉnh" />
              <span>giây</span><button type="button" data-action="apply-custom-auto-next">Áp dụng</button>
            </div>
            <small>Nhập từ 0 đến 60 giây. Có thể dùng số thập phân, ví dụ 1.5.</small>
          </div>
        </fieldset>
        <button class="primary-button full-width" data-action="close-settings">Xong</button>
      </section>
    `;
  }

  function bindCommonEvents() {
    app.querySelectorAll('[data-action]').forEach((element) => {
      const action = element.dataset.action;
      if (action === 'open-settings') element.onclick = () => { clearAutoAdvance(); state.settingsOpen = true; state.menuOpen = false; refreshAudioStats(); render(); };
      else if (action === 'close-settings') element.onclick = () => { state.settingsOpen = false; render(); schedulePrepareCurrentAudio(); };
      else if (action === 'open-menu') element.onclick = () => { clearAutoAdvance(); state.menuOpen = true; state.settingsOpen = false; render(); requestAnimationFrame(() => document.querySelector('.listen-menu-head button')?.focus()); };
      else if (action === 'close-menu') element.onclick = () => { state.menuOpen = false; render(); };
      else if (action === 'open-new-hsk') element.onclick = openNewHskLibrary;
      else if (action === 'open-new-hsk-unit') element.onclick = () => openNewHskUnit(element.dataset.unitId);
      else if (action === 'open-ldsn') element.onclick = openLdsnLibrary;
      else if (action === 'open-ldsn-unit') element.onclick = () => openLdsnUnit(element.dataset.unitId);
      else if (action === 'open-301') element.onclick = open301Library;
      else if (action === 'open-custom') element.onclick = openCustomLibrary;
      else if (action === 'open-review') element.onclick = openReview;
      else if (action === 'resume-last') element.onclick = resumeLastSession;
      else if (action === 'go-back') element.onclick = goBack;
      else if (action === 'start-mode') element.onclick = () => startPractice(element.dataset.mode, 0);
      else if (action === 'start-dataset-activity') element.onclick = () => startDatasetActivity(element.dataset.activity, element.dataset.groupId || '', { choiceCount: Number(element.dataset.choiceCount) || 4 });
      else if (action === 'set-sentence-filter') element.onclick = () => setSentenceFilter(element.dataset.filter);
      else if (action === 'set-sentence-count') element.onclick = () => { state.settings.sentenceCount = element.dataset.count === 'all' ? 'all' : String(Math.max(1, Number(element.dataset.count) || 1)); saveSettings(); render(); };
      else if (action === 'apply-sentence-count') element.onclick = () => { const input = document.getElementById('sentenceCountCustom'); const value = Math.max(1, Math.min(Number(input && input.value) || 1, filteredDatasetSentences().length)); state.settings.sentenceCount = String(value); saveSettings(); render(); };
      else if (action === 'open-content-preview') element.onclick = openContentPreview;
      else if (action === 'open-preview-item') element.onclick = () => startPractice('transcript', Number(element.dataset.index) || 0);
      else if (action === 'open-library-group') element.onclick = () => openLibraryGroup(element.dataset.groupId);
      else if (action === 'open-library-deck') element.onclick = () => openCustomDeck(element.dataset.deckId);
      else if (action === 'manage-library-deck') element.onclick = () => { state.libraryManagerDeckId = state.libraryManagerDeckId === element.dataset.deckId ? '' : element.dataset.deckId; render(); };
      else if (action === 'export-library-all') element.onclick = () => exportLibrary('all');
      else if (action === 'export-library-group') element.onclick = () => exportLibrary('group', element.dataset.groupId);
      else if (action === 'export-library-deck') element.onclick = () => exportLibrary('deck', element.dataset.deckId);
      else if (action === 'open-library-trash') element.onclick = async () => { state.screen = 'customTrash'; await refreshListeningLibrary(); render(); };
      else if (action === 'request-delete-library-group') element.onclick = () => { state.libraryDialog = { type: 'group', id: element.dataset.groupId }; render(); };
      else if (action === 'request-delete-library-deck') element.onclick = () => { state.libraryDialog = { type: 'deck', id: element.dataset.deckId }; render(); };
      else if (action === 'request-delete-library-trash') element.onclick = () => { state.libraryDialog = { type: 'trash', id: element.dataset.trashId }; render(); };
      else if (action === 'request-empty-library-trash') element.onclick = () => { state.libraryDialog = { type: 'empty' }; render(); };
      else if (action === 'close-library-dialog') element.onclick = () => { state.libraryDialog = null; render(); };
      else if (action === 'delete-library-group-ungroup') element.onclick = () => executeLibraryDelete('group', element.dataset.groupId, 'ungroup');
      else if (action === 'delete-library-group-all') element.onclick = () => executeLibraryDelete('group', element.dataset.groupId, 'delete');
      else if (action === 'confirm-delete-library-deck') element.onclick = () => executeLibraryDelete('deck', element.dataset.deckId);
      else if (action === 'confirm-delete-library-trash') element.onclick = () => executeLibraryDelete('trash', element.dataset.trashId);
      else if (action === 'confirm-empty-library-trash') element.onclick = () => executeLibraryDelete('empty');
      else if (action === 'restore-library-trash') element.onclick = () => restoreLibraryTrash(element.dataset.trashId);
      else if (action === 'restore-library-trash-all') element.onclick = restoreAllLibraryTrash;
      else if (action === 'return-to-active-target') {
        element.onpointerdown = (event) => event.preventDefault();
        element.onmousedown = (event) => event.preventDefault();
        element.onclick = returnToActiveLearningTarget;
      }
      else if (action === 'toggle-floating-audio') {
        element.onpointerdown = (event) => event.preventDefault();
        element.onmousedown = (event) => event.preventDefault();
        element.onclick = () => {
          state.floatingAudioCollapsed = !state.floatingAudioCollapsed;
          syncFloatingAudioDom();
        };
      }
      else if (action === 'toggle-speech') {
        if (element.classList.contains('practice-audio-control')) {
          // Không chuyển focus khỏi ô nhập: bàn phím iPhone tiếp tục mở khi điều khiển audio.
          element.onpointerdown = (event) => event.preventDefault();
          element.onmousedown = (event) => event.preventDefault();
        }
        element.onclick = toggleSpeech;
      }
      else if (action === 'restart-speech') element.onclick = () => {
        const item = currentItem();
        if (currentAudioIsPrepared(item)) {
          state.audioPlayer.currentTime = 0;
          updateAudioTimeUi();
          resumeFileAudio();
        } else if (state.settings.voiceSource !== 'device') {
          prepareImportedAudio(item, { force: true }).then((entry) => {
            if (entry) { state.audioMessage = 'MP3 đã sẵn sàng. Chạm Phát để nghe.'; state.audioStatus = 'ready'; render(); }
          }).catch(() => {});
        } else speakFrom(0);
      };
      else if (action === 'rewind-speech') {
        if (element.classList.contains('practice-audio-control')) {
          element.onpointerdown = (event) => event.preventDefault();
          element.onmousedown = (event) => event.preventDefault();
        }
        element.onclick = rewindSpeech;
      }
      else if (action === 'forward-speech') {
        if (element.classList.contains('practice-audio-control')) {
          element.onpointerdown = (event) => event.preventDefault();
          element.onmousedown = (event) => event.preventDefault();
        }
        element.onclick = forwardSpeech;
      }
      else if (action === 'previous-item') element.onclick = () => moveItem(-1);
      else if (action === 'next-item') element.onclick = () => moveItem(1);
      else if (action === 'toggle-group-context') element.onclick = toggleGroupContext;
      else if (action === 'toggle-group-transcript') element.onclick = toggleGroupTranscript;
      else if (action === 'play-group-overview') element.onclick = toggleGroupOverviewAudio;
      else if (action === 'set-rate') element.onclick = () => setRate(Number(element.dataset.rate));
      else if (action === 'switch-current-mode') element.onclick = () => switchCurrentMode(element.dataset.mode);
      else if (action === 'focus-input') {
        // Phân biệt chạm nhẹ với kéo. Không preventDefault ở pointerdown/touchstart,
        // để Safari vẫn cuộn trang tự nhiên khi bàn phím đang mở.
        bindDictationTapAndScroll(element);
      }
      else if (action === 'choose-word') element.onclick = () => chooseWord(element.dataset.choiceId);
      else if (action === 'add-order-token') element.onclick = () => addOrderingToken(element.dataset.tokenId);
      else if (action === 'remove-order-token') element.onclick = () => removeOrderingToken(element.dataset.tokenId);
      else if (action === 'undo-ordering') element.onclick = () => { if (state.activitySelection.length) state.activitySelection.pop(); state.activityResult = null; rememberSession(); render(); };
      else if (action === 'reset-ordering') element.onclick = resetOrdering;
      else if (action === 'check-ordering') element.onclick = checkOrdering;
      else if (action === 'show-order-answer') element.onclick = showOrderingAnswer;
      else if (action === 'check-answer') element.onclick = checkAnswer;
      else if (action === 'show-hint') element.onclick = showHint;
      else if (action === 'hide-hint') element.onclick = () => { state.hint = null; renderPractice(); bindCommonEvents(); focusDictationInput(); };
      else if (action === 'toggle-answer') element.onclick = toggleAnswer;
      else if (action === 'fill-hint-char') element.onclick = () => fillHintText(element.dataset.char || '');
      else if (action === 'fill-hint-word') element.onclick = () => fillHintText(element.dataset.word || '');
      else if (action === 'toggle-word-hint') element.onclick = () => { state.hint = Object.assign({}, state.hint, { wordOpen: !state.hint.wordOpen }); renderPractice(); bindCommonEvents(); };
      else if (action === 'rate-item') element.onclick = () => rateItem(element.dataset.rating);
      else if (action === 'set-gender') element.onclick = () => setGender(element.dataset.gender);
      else if (action === 'set-voice-source') element.onclick = () => setVoiceSource(element.dataset.source);
      else if (action === 'import-current-audio') element.onclick = () => document.getElementById('currentAudioFileInput')?.click();
      else if (action === 'export-current-audio') element.onclick = exportCurrentAudio;
      else if (action === 'delete-current-audio') element.onclick = deleteCurrentAudio;
      else if (action === 'clear-expired-audio') element.onclick = clearExpiredAudio;
      else if (action === 'clear-all-audio') element.onclick = clearAllAudio;
      else if (action === 'set-rewind') element.onclick = () => setRewind(Number(element.dataset.seconds));
      else if (action === 'set-auto-next-seconds') element.onclick = () => setAutoNextSeconds(Number(element.dataset.seconds));
      else if (action === 'apply-custom-auto-next') element.onclick = applyCustomAutoNextSeconds;
      else if (action === 'cancel-auto-next') element.onclick = cancelAutoAdvance;
      else if (action === 'complete-session') element.onclick = completePractice;
      else if (action === 'retry-wrong') element.onclick = retryWrongItems;
      else if (action === 'return-mode') element.onclick = returnToModeChoice;
      else if (action === 'go-home') element.onclick = () => setScreen('home');
    });

    const search = document.getElementById('lessonSearch');
    if (search) {
      search.oninput = () => {
        const query = search.value.trim().toLowerCase();
        const filtered = state.lessons301.filter((lesson) => `${lesson.lesson_no} ${lesson.title || ''} ${lesson.title_zh || ''}`.toLowerCase().includes(query));
        const list = document.getElementById('lessonList');
        if (list) list.innerHTML = filtered.length ? renderLessonCards(filtered) : emptyCard('Không tìm thấy bài', 'Thử từ khóa khác.');
        bindLessonCards();
      };
      bindLessonCards();
    } else {
      bindLessonCards();
    }

    const fileInput = document.getElementById('libraryFileInput');
    if (fileInput) fileInput.onchange = () => { if (fileInput.files && fileInput.files[0]) importCustomFile(fileInput.files[0]); };

    app.querySelectorAll('[data-action="toggle-library-card"]').forEach((input) => {
      input.onchange = () => toggleLibraryCard(input.dataset.deckId, input.dataset.cardId, input.checked);
    });

    const input = document.getElementById('dictationInput');
    if (input) bindDictationInput(input);

    const position = document.getElementById('speechPosition');
    if (position) {
      position.onchange = () => {
        if (state.audioPlayer) {
          state.audioPlayer.currentTime = Number(position.value) || 0;
          state.audioCurrentTime = state.audioPlayer.currentTime;
          updateAudioTimeUi();
        } else {
          speakFrom(Number(position.value));
        }
      };
      position.oninput = () => {
        if (state.audioPlayer) {
          state.audioCurrentTime = Number(position.value) || 0;
          updateAudioTimeUi();
        } else {
          state.speechCharIndex = Number(position.value);
          updateAudioTimeUi();
        }
      };
    }

    const voiceSelect = document.getElementById('voiceSelect');
    if (voiceSelect) {
      voiceSelect.onchange = () => {
        state.settings.voiceURI = voiceSelect.value;
        saveSettings();
        stopSpeech();
      };
    }

    const currentAudioFileInput = document.getElementById('currentAudioFileInput');
    if (currentAudioFileInput) currentAudioFileInput.onchange = () => {
      if (currentAudioFileInput.files && currentAudioFileInput.files[0]) importCurrentAudio(currentAudioFileInput.files[0]);
    };

    const pinyinToggle = app.querySelector('[data-action="toggle-pinyin"]');
    if (pinyinToggle) pinyinToggle.onchange = () => { state.settings.showPinyin = pinyinToggle.checked; saveSettings(); render(); };
    const meaningToggle = app.querySelector('[data-action="toggle-meaning"]');
    if (meaningToggle) meaningToggle.onchange = () => { state.settings.showMeaning = meaningToggle.checked; saveSettings(); render(); };
    const autoCheckToggle = app.querySelector('[data-action="toggle-auto-check"]');
    if (autoCheckToggle) autoCheckToggle.onchange = () => setAutomationSetting('autoCheck', autoCheckToggle.checked);
    const autoRateToggle = app.querySelector('[data-action="toggle-auto-rate"]');
    if (autoRateToggle) autoRateToggle.onchange = () => setAutomationSetting('autoRate', autoRateToggle.checked);
    const autoNextToggle = app.querySelector('[data-action="toggle-auto-next"]');
    if (autoNextToggle) autoNextToggle.onchange = () => setAutomationSetting('autoNext', autoNextToggle.checked);

    const customSecondsInput = document.getElementById('autoNextCustomSeconds');
    if (customSecondsInput) {
      customSecondsInput.onkeydown = (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        applyCustomAutoNextSeconds();
      };
      customSecondsInput.onfocus = () => customSecondsInput.select();
    }
  }

  function bindLessonCards() {
    app.querySelectorAll('[data-lesson-id]').forEach((button) => {
      button.onclick = () => open301Lesson(button.dataset.lessonId);
    });
  }

  function nativeOffsetForAnswerIndex(value, unitIndex) {
    return Array.from(String(value || '')).slice(0, Math.max(0, unitIndex)).join('').length;
  }

  function answerIndexFromNativeOffset(value, offset, item) {
    const max = Core.answerUnits(item && item.text || '').length;
    const prefix = String(value || '').slice(0, Math.max(0, Number(offset) || 0));
    return Core.answerUnits(Core.sanitizeDictationAnswer(prefix, item && item.text || '', max)).length;
  }

  function applyDictationSelection(input) {
    const item = currentItem();
    if (!input || !item || input.dataset.composing) return;
    const inputUnits = Core.answerUnits(state.input);
    const caretIndex = Math.max(0, Math.min(currentDictationCaretIndex(item), inputUnits.length));
    const selectionLength = Math.max(0, Math.min(Number(state.dictationSelectionLength) || 0, inputUnits.length - caretIndex));
    const start = nativeOffsetForAnswerIndex(state.input, caretIndex);
    const end = nativeOffsetForAnswerIndex(state.input, caretIndex + selectionLength);
    try {
      input.setSelectionRange(start, end);
    } catch (error) {
      // Một số bàn phím mobile chưa cho đổi vùng chọn trong lúc vừa mở IME.
    }
  }

  function setDictationCaret(index, options) {
    const item = currentItem();
    if (!item) return;
    const configured = options || {};
    const inputUnits = Core.answerUnits(state.input);
    const previousCaretIndex = Math.max(0, Math.min(currentDictationCaretIndex(item), inputUnits.length));
    const caretIndex = Math.max(0, Math.min(clampDictationCaretIndex(item, index), inputUnits.length));
    const willSelectUnit = configured.selectUnit && caretIndex < inputUnits.length;
    if (willSelectUnit) {
      if (!Number.isFinite(state.dictationResumeIndex) && caretIndex < previousCaretIndex) {
        state.dictationResumeIndex = previousCaretIndex;
      } else if (Number.isFinite(state.dictationResumeIndex) && caretIndex >= state.dictationResumeIndex) {
        state.dictationResumeIndex = null;
      }
    } else {
      state.dictationResumeIndex = null;
    }
    state.dictationCaretIndex = caretIndex;
    state.dictationSelectionLength = willSelectUnit ? 1 : 0;
    setManualBrowseMode(false);
    updateDictationDom({ preserveCaret: true });
    focusDictationInput({ immediate: configured.immediate === true });
    keepActiveDictationSlotVisible(caretIndex, { force: configured.forceScroll === true });
  }

  function bindDictationInput(input) {
    let composing = false;
    const syncTimers = new Set();

    const clearSyncTimers = () => {
      syncTimers.forEach((timer) => window.clearTimeout(timer));
      syncTimers.clear();
    };

    const syncFromNativeInput = () => {
      if (!input.isConnected || composing) return false;
      const item = currentItem();
      if (!item) return false;

      const max = Core.answerUnits(item.text).length;
      const previousLength = Core.answerUnits(state.input).length;
      const replacingSelectedUnit = state.dictationSelectionLength > 0;
      const resumeIndex = Number.isFinite(state.dictationResumeIndex) ? state.dictationResumeIndex : null;
      const nativeStart = Number.isFinite(input.selectionStart) ? input.selectionStart : input.value.length;
      const nativeEnd = Number.isFinite(input.selectionEnd) ? input.selectionEnd : nativeStart;
      const next = Core.sanitizeDictationAnswer(input.value, item.text, max);
      const nextLength = Core.answerUnits(next).length;
      const nextCaretIndex = Math.min(Core.answerUnits(next).length, answerIndexFromNativeOffset(input.value, nativeStart, item));
      const nextSelectionEnd = Math.min(Core.answerUnits(next).length, answerIndexFromNativeOffset(input.value, nativeEnd, item));
      const caretChanged = state.dictationCaretIndex !== nextCaretIndex || state.dictationSelectionLength !== Math.max(0, nextSelectionEnd - nextCaretIndex);
      state.dictationCaretIndex = nextCaretIndex;
      state.dictationSelectionLength = Math.max(0, nextSelectionEnd - nextCaretIndex);
      if (next === state.input) {
        if (caretChanged) updateDictationDom({ keepNativeValue: true, preserveNativeSelection: true });
        return false;
      }

      clearAutoAdvance();
      state.input = next;
      state.result = null;
      state.showAnswer = false;
      state.autoSuggestedRating = '';
      if (replacingSelectedUnit && resumeIndex !== null) {
        const delta = nextLength - previousLength;
        state.dictationCaretIndex = Math.max(0, Math.min(nextLength, resumeIndex + delta));
        state.dictationSelectionLength = 0;
        state.dictationResumeIndex = null;
        updateDictationDom();
      } else {
        state.dictationResumeIndex = null;
        updateDictationDom({ keepNativeValue: true, preserveNativeSelection: true });
      }
      maybeAutoCheckCompleteInput();
      return true;
    };

    const scheduleSync = () => {
      clearSyncTimers();
      [0, 30, 90, 180].forEach((delay) => {
        const timer = window.setTimeout(() => {
          syncTimers.delete(timer);
          syncFromNativeInput();
        }, delay);
        syncTimers.add(timer);
      });
    };

    // Giữ giá trị thật trong input. Cách này cho phép IME trên iPhone,
    // Android và Microsoft Pinyin tiếp tục ghép chữ sau mỗi lần chọn ứng viên.
    input.value = state.input;
    applyDictationSelection(input);

    input.oncompositionstart = () => {
      composing = true;
      input.dataset.composing = '1';
      clearSyncTimers();
    };

    input.oncompositionupdate = () => {
      composing = true;
      input.dataset.composing = '1';
    };

    input.oncompositionend = () => {
      composing = false;
      delete input.dataset.composing;
      scheduleSync();
    };

    input.oninput = (event) => {
      if (event.isComposing || composing) return;
      syncFromNativeInput();
    };

    input.onchange = scheduleSync;
    input.onblur = scheduleSync;
    input.onfocus = () => {
      applyDictationSelection(input);
      if (state.manualBrowseMode) return;
      const activeIndex = currentDictationCaretIndex(currentItem());
      window.setTimeout(() => keepActiveDictationSlotVisible(activeIndex), 80);
    };
    input.onselect = () => {
      if (composing) return;
      const item = currentItem();
      if (!item) return;
      const start = Number.isFinite(input.selectionStart) ? input.selectionStart : input.value.length;
      const end = Number.isFinite(input.selectionEnd) ? input.selectionEnd : start;
      state.dictationCaretIndex = answerIndexFromNativeOffset(input.value, start, item);
      state.dictationSelectionLength = Math.max(0, answerIndexFromNativeOffset(input.value, end, item) - state.dictationCaretIndex);
      updateDictationDom({ keepNativeValue: true, preserveNativeSelection: true });
    };

    input.onkeyup = (event) => {
      if ([' ', 'Spacebar', 'Enter'].includes(event.key) || /^Digit[0-9]$/.test(event.code || '')) {
        scheduleSync();
      }
    };

    input.onkeydown = (event) => {
      if (event.key === 'Enter' && !composing && !event.isComposing) {
        event.preventDefault();
        syncFromNativeInput();
        checkAnswer();
      }
    };
  }

  function commitDictationText(value) {
    const item = currentItem();
    if (!item || !value) return;
    const max = Core.answerUnits(item.text).length;
    const currentUnits = Core.answerUnits(state.input);
    const committedUnits = Core.answerUnits(Core.sanitizeDictationAnswer(value, item.text, max));
    const caretIndex = Math.max(0, Math.min(currentDictationCaretIndex(item), currentUnits.length));
    const deleteCount = Math.max(0, Math.min(Number(state.dictationSelectionLength) || 0, currentUnits.length - caretIndex));
    const resumeIndex = Number.isFinite(state.dictationResumeIndex) ? state.dictationResumeIndex : null;
    const nextUnits = currentUnits.slice();
    nextUnits.splice(caretIndex, deleteCount, ...committedUnits);
    const nextInput = Core.sanitizeDictationAnswer(nextUnits.join(''), item.text, max);
    if (nextInput === state.input) return;

    clearAutoAdvance();
    state.input = nextInput;
    state.result = null;
    state.showAnswer = false;
    state.autoSuggestedRating = '';
    const nextLength = Core.answerUnits(nextInput).length;
    state.dictationCaretIndex = resumeIndex !== null && deleteCount > 0
      ? Math.max(0, Math.min(nextLength, resumeIndex + (nextLength - currentUnits.length)))
      : Math.min(nextLength, caretIndex + committedUnits.length);
    state.dictationSelectionLength = 0;
    state.dictationResumeIndex = null;

    // Không render lại toàn bộ màn hình sau mỗi chữ. Việc thay input DOM làm
    // bàn phím iPhone mất focus, nên người dùng chỉ nhập được một chữ.
    updateDictationDom();
    maybeAutoCheckCompleteInput();
  }

  function deleteLastDictationUnit() {
    if (!state.input) return;
    const item = currentItem();
    if (!item) return;
    const units = Core.answerUnits(state.input);
    const previousLength = units.length;
    let caretIndex = Math.max(0, Math.min(currentDictationCaretIndex(item), units.length));
    const selectionLength = Math.max(0, Math.min(Number(state.dictationSelectionLength) || 0, units.length - caretIndex));
    const resumeIndex = Number.isFinite(state.dictationResumeIndex) ? state.dictationResumeIndex : null;
    if (selectionLength > 0) units.splice(caretIndex, selectionLength);
    else if (caretIndex > 0) {
      units.splice(caretIndex - 1, 1);
      caretIndex -= 1;
    } else return;
    clearAutoAdvance();
    state.input = units.join('');
    state.dictationCaretIndex = resumeIndex !== null && selectionLength > 0
      ? Math.max(0, Math.min(units.length, resumeIndex + (units.length - previousLength)))
      : caretIndex;
    state.dictationSelectionLength = 0;
    state.dictationResumeIndex = null;
    state.result = null;
    state.showAnswer = false;
    state.autoSuggestedRating = '';
    state.autoCheckSignature = '';
    updateDictationDom();
  }

  function updateDictationDom(options) {
    const item = currentItem();
    const container = document.querySelector(item && item.isPassage ? '.passage-lines' : '.dictation-rows');
    const countElement = document.querySelector('.dictation-count');
    const input = document.getElementById('dictationInput');
    if (!item || !container || !input) return;

    const units = Core.answerUnits(item.text);
    const inputUnits = Core.answerUnits(state.input);
    state.dictationCaretIndex = Math.max(0, Math.min(currentDictationCaretIndex(item), inputUnits.length));
    state.dictationSelectionLength = Math.max(0, Math.min(Number(state.dictationSelectionLength) || 0, inputUnits.length - state.dictationCaretIndex));
    const activeIndex = state.dictationCaretIndex < units.length ? state.dictationCaretIndex : -1;
    const comparison = Core.compareAnswers(state.input, item.text);
    const slotElements = Array.from(container.querySelectorAll('[data-slot-index]'));

    // Không dựng lại toàn bộ đoạn sau mỗi chữ. Trên iPhone, thay innerHTML của
    // một đoạn dài trong khi input đang focus khiến Safari tự cuộn tới vị trí
    // khác. Chỉ cập nhật chữ và class của từng ô đã có sẵn.
    if (slotElements.length !== units.length) {
      container.innerHTML = item.isPassage
        ? renderPassageSlots(item, comparison, inputUnits, activeIndex)
        : renderShortSlots(item, comparison, inputUnits, activeIndex);
    } else {
      slotElements.forEach((slot) => {
        const index = Number(slot.dataset.slotIndex);
        const actual = inputUnits[index] || '';
        slot.textContent = actual;
        slot.dataset.slotFilled = actual ? 'true' : 'false';
        slot.classList.toggle('is-active', index === activeIndex);
        slot.classList.toggle('is-selected', index === activeIndex && state.dictationSelectionLength > 0);
        slot.classList.remove('is-correct', 'is-wrong', 'is-empty-wrong');
        if (state.result) {
          const correct = Boolean(comparison.cells[index] && comparison.cells[index].correct);
          if (correct) slot.classList.add('is-correct');
          else slot.classList.add(actual ? 'is-wrong' : 'is-empty-wrong');
        }
      });

      if (item.isPassage) {
        container.querySelectorAll('[data-after-unit]').forEach((punctuation) => {
          const afterUnit = Number(punctuation.dataset.afterUnit);
          const visible = Boolean(state.showAnswer || state.result || inputUnits.length > afterUnit);
          punctuation.classList.toggle('is-visible', visible);
          punctuation.classList.toggle('is-hidden', !visible);
        });
      }
    }

    if (countElement) countElement.textContent = `${inputUnits.length}/${units.length}`;

    // Kết quả cũ không còn hợp lệ sau khi người dùng sửa đáp án.
    document.querySelector('.result-card')?.remove();
    document.querySelector('.result-answer')?.remove();
    document.querySelector('.result-followup')?.remove();
    document.querySelector('.rating-row')?.remove();
    document.querySelector('.answer-card')?.remove();

    const configured = options || {};
    if (!configured.keepNativeValue && !input.dataset.composing) input.value = state.input;
    if (!configured.preserveNativeSelection) applyDictationSelection(input);
    if (!state.manualBrowseMode) keepActiveDictationSlotVisible(activeIndex);
    updateManualBrowseUi();
  }

  let activeSlotScrollFrame = 0;
  let userIsScrolling = false;
  let userScrollReleaseTimer = 0;
  let globalScrollGuardsBound = false;
  let touchScrollTracking = false;
  let touchScrollStartY = 0;
  let touchScrollStartScrollY = 0;
  let touchScrollMaxDistance = 0;
  let userGestureScrollUntil = 0;
  let programmaticScrollUntil = 0;
  let primaryAudioObserver = null;
  let floatingAudioUpdateFrame = 0;
  let floatingAudioSettleTimer = 0;
  let practiceViewportMaxHeight = 0;
  const MANUAL_BROWSE_DISTANCE = 64;
  const MAX_AUTO_FOLLOW_SCROLL = 96;

  function activeLearningTargetElement() {
    const item = currentItem();
    const input = document.getElementById('dictationInput');
    if (input && item) {
      const units = Core.answerUnits(item.text);
      const caret = currentDictationCaretIndex(item);
      const activeIndex = caret < units.length ? caret : Math.max(0, units.length - 1);
      return document.querySelector(`[data-slot-index="${activeIndex}"]`) || document.querySelector('[data-learning-target]');
    }
    return document.querySelector('[data-learning-target]');
  }

  function practiceViewportBounds() {
    const viewport = window.visualViewport;
    const top = viewport ? viewport.offsetTop : 0;
    const height = viewport ? viewport.height : window.innerHeight;
    const bottomNav = document.querySelector('.listen-bottom-nav');
    const bottomNavRect = bottomNav ? bottomNav.getBoundingClientRect() : null;
    let bottom = top + height;
    if (bottomNavRect && bottomNavRect.top > top && bottomNavRect.top < bottom) bottom = bottomNavRect.top;
    return { top: top + 12, bottom: bottom - 12 };
  }

  function updateActiveTargetAway() {
    const target = activeLearningTargetElement();
    const bounds = practiceViewportBounds();
    let away = false;
    if (target) {
      const rect = target.getBoundingClientRect();
      away = rect.bottom <= bounds.top || rect.top >= bounds.bottom;
    }
    state.activeTargetAway = away;
    const button = document.querySelector('[data-action="return-to-active-target"]');
    if (button) button.hidden = !away;
    document.querySelector('.dictation-card')?.classList.toggle('is-manual-browse', state.manualBrowseMode);
  }

  function updateManualBrowseUi() {
    updateActiveTargetAway();
  }

  function setManualBrowseMode(enabled) {
    const next = Boolean(enabled);
    if (state.manualBrowseMode === next) {
      updateManualBrowseUi();
      return;
    }

    state.manualBrowseMode = next;
    if (next && activeSlotScrollFrame) {
      cancelAnimationFrame(activeSlotScrollFrame);
      activeSlotScrollFrame = 0;
    }
    updateManualBrowseUi();
  }

  function noteUserScrollActivity() {
    userIsScrolling = true;
    if (activeSlotScrollFrame) {
      cancelAnimationFrame(activeSlotScrollFrame);
      activeSlotScrollFrame = 0;
    }
    clearTimeout(userScrollReleaseTimer);
    userScrollReleaseTimer = window.setTimeout(() => {
      userIsScrolling = false;
    }, 240);
  }

  function updateTouchScrollDistance(clientY) {
    const touchDistance = Number.isFinite(clientY) ? Math.abs(clientY - touchScrollStartY) : 0;
    const pageDistance = Math.abs(window.scrollY - touchScrollStartScrollY);
    touchScrollMaxDistance = Math.max(touchScrollMaxDistance, touchDistance, pageDistance);
    if (touchScrollMaxDistance > 8) noteUserScrollActivity();
    if (touchScrollMaxDistance >= MANUAL_BROWSE_DISTANCE) setManualBrowseMode(true);
  }

  function handleDictationTouchStart(event) {
    if (!document.getElementById('dictationInput') || !event.touches?.length) return;
    touchScrollTracking = true;
    touchScrollStartY = event.touches[0].clientY;
    touchScrollStartScrollY = window.scrollY;
    touchScrollMaxDistance = 0;
    userGestureScrollUntil = 0;
  }

  function handleDictationTouchMove(event) {
    if (!touchScrollTracking) return;
    updateTouchScrollDistance(event.touches?.[0]?.clientY);
  }

  function handleDictationTouchEnd() {
    if (!touchScrollTracking) return;
    touchScrollTracking = false;
    userGestureScrollUntil = Date.now() + 700;
    updateTouchScrollDistance(NaN);
    noteUserScrollActivity();
  }

  function handleDictationWindowScroll() {
    if (Date.now() < programmaticScrollUntil) return;
    if (!document.getElementById('dictationInput')) return;
    if (!touchScrollTracking && Date.now() >= userGestureScrollUntil) return;
    updateTouchScrollDistance(NaN);
  }

  function updateFloatingAudioPosition() {
    const floating = document.querySelector('[data-floating-audio]');
    if (!floating) return;
    const viewport = window.visualViewport;
    const visibleTop = viewport ? viewport.offsetTop : 0;
    const visibleHeight = viewport ? viewport.height : window.innerHeight;
    const targetTop = visibleTop + Math.max(92, Math.min(visibleHeight - 92, visibleHeight * 0.48));
    floating.style.setProperty('--floating-audio-top', `${Math.round(targetTop)}px`);
  }

  function mobileFloatingAudioEnabled() {
    return window.matchMedia ? window.matchMedia('(max-width: 760px)').matches : window.innerWidth <= 760;
  }

  function elementIntersectsPracticeViewport(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const bounds = practiceViewportBounds();
    const visibleHeight = Math.max(0, Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, bounds.top));
    const usefulHeight = Math.min(96, Math.max(44, rect.height * 0.35));
    return visibleHeight >= usefulHeight;
  }

  function detectPracticeKeyboardVisible() {
    const viewport = window.visualViewport;
    const currentHeight = viewport ? viewport.height : window.innerHeight;
    const inputFocused = document.activeElement && document.activeElement.id === 'dictationInput';
    if (!inputFocused) practiceViewportMaxHeight = Math.max(practiceViewportMaxHeight, currentHeight);
    if (!practiceViewportMaxHeight) practiceViewportMaxHeight = currentHeight;
    const reduced = practiceViewportMaxHeight - currentHeight > 96;
    const coarse = window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : false;
    return Boolean(inputFocused && (reduced || coarse));
  }

  function syncFloatingAudioDom() {
    const floating = document.querySelector('[data-floating-audio]');
    if (!floating) return;
    floating.hidden = !state.floatingAudioVisible;
    floating.classList.toggle('is-collapsed', state.floatingAudioCollapsed);
    const collapse = floating.querySelector('[data-action="toggle-floating-audio"]');
    if (collapse) {
      collapse.textContent = state.floatingAudioCollapsed ? '›' : '‹';
      collapse.setAttribute('aria-label', state.floatingAudioCollapsed ? 'Mở rộng điều khiển nghe' : 'Thu gọn điều khiển nghe');
    }
    updateActiveTargetAway();
    updateFloatingAudioPosition();
  }

  function updatePracticeFloatingAudioState() {
    if (floatingAudioUpdateFrame) cancelAnimationFrame(floatingAudioUpdateFrame);
    floatingAudioUpdateFrame = requestAnimationFrame(() => {
      floatingAudioUpdateFrame = 0;
      const floating = document.querySelector('[data-floating-audio]');
      if (!floating || state.screen !== 'practice' || !mobileFloatingAudioEnabled()) {
        state.floatingAudioVisible = false;
        if (floating) floating.hidden = true;
        return;
      }

      const audioCard = document.querySelector('[data-primary-audio]');
      state.primaryAudioVisible = elementIntersectsPracticeViewport(audioCard);
      state.keyboardVisible = detectPracticeKeyboardVisible();
      const shouldShow = !state.primaryAudioVisible || state.keyboardVisible;
      if (shouldShow && !state.floatingAudioVisible) state.floatingAudioCollapsed = true;
      state.floatingAudioVisible = shouldShow;
      syncFloatingAudioDom();
    });
  }

  function setupPracticeFloatingAudio() {
    if (primaryAudioObserver) {
      primaryAudioObserver.disconnect();
      primaryAudioObserver = null;
    }
    if (state.screen !== 'practice') {
      state.floatingAudioVisible = false;
      state.keyboardVisible = false;
      return;
    }

    const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    if (!document.getElementById('dictationInput')) practiceViewportMaxHeight = Math.max(practiceViewportMaxHeight, viewportHeight);
    const audioCard = document.querySelector('[data-primary-audio]');
    if (audioCard && 'IntersectionObserver' in window) {
      primaryAudioObserver = new IntersectionObserver((entries) => {
        const entry = entries[0];
        state.primaryAudioVisible = Boolean(entry && entry.isIntersecting);
        updatePracticeFloatingAudioState();
      }, { threshold: [0, 0.01] });
      primaryAudioObserver.observe(audioCard);
    }
    updatePracticeFloatingAudioState();
    clearTimeout(floatingAudioSettleTimer);
    floatingAudioSettleTimer = window.setTimeout(updatePracticeFloatingAudioState, 140);
  }

  function handlePracticeFloatingAudioViewportChange() {
    updatePracticeFloatingAudioState();
    clearTimeout(floatingAudioSettleTimer);
    floatingAudioSettleTimer = window.setTimeout(updatePracticeFloatingAudioState, 140);
  }

  function ensureGlobalScrollGuards() {
    if (globalScrollGuardsBound) return;
    globalScrollGuardsBound = true;
    window.addEventListener('touchstart', handleDictationTouchStart, { passive: true });
    window.addEventListener('touchmove', handleDictationTouchMove, { passive: true });
    window.addEventListener('touchend', handleDictationTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleDictationTouchEnd, { passive: true });
    window.addEventListener('scroll', handleDictationWindowScroll, { passive: true });
  }

  function bindDictationTapAndScroll(element) {
    ensureGlobalScrollGuards();

    // Không chặn pointer/touch ở vùng đoạn văn. Vuốt vẫn do Safari xử lý;
    // click nhẹ vào một ô đã gõ sẽ chọn đúng chữ đó để thay thế trực tiếp.
    element.onclick = (event) => {
      if (Date.now() < userGestureScrollUntil && touchScrollMaxDistance > 8) return;
      const slot = event.target && event.target.closest ? event.target.closest('[data-slot-index]') : null;
      if (slot) {
        setDictationCaret(Number(slot.dataset.slotIndex), {
          selectUnit: slot.dataset.slotFilled === 'true',
          immediate: true,
          forceScroll: false
        });
        return;
      }
      focusDictationInput({ immediate: true });
    };
  }

  function returnToActiveLearningTarget() {
    setManualBrowseMode(false);
    userIsScrolling = false;
    touchScrollTracking = false;
    userGestureScrollUntil = 0;
    clearTimeout(userScrollReleaseTimer);

    const item = currentItem();
    const input = document.getElementById('dictationInput');
    if (input && item) {
      const units = Core.answerUnits(item.text);
      const caret = currentDictationCaretIndex(item);
      const activeIndex = caret < units.length ? caret : Math.max(0, units.length - 1);
      focusDictationInput({ immediate: true });
      keepActiveDictationSlotVisible(activeIndex, { force: true });
    } else {
      const target = activeLearningTargetElement();
      if (target) {
        programmaticScrollUntil = Date.now() + 400;
        target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
    }
    window.setTimeout(updatePracticeFloatingAudioState, 450);
  }

  function keepActiveDictationSlotVisible(activeIndex, options) {
    const configured = options || {};
    if (activeIndex < 0) return;
    if (state.manualBrowseMode && !configured.force) return;
    if (userIsScrolling && !configured.force) return;
    if (activeSlotScrollFrame) cancelAnimationFrame(activeSlotScrollFrame);

    activeSlotScrollFrame = requestAnimationFrame(() => {
      activeSlotScrollFrame = 0;
      if (state.manualBrowseMode && !configured.force) return;
      if (userIsScrolling && !configured.force) return;

      const slot = document.querySelector(`[data-slot-index="${activeIndex}"]`);
      if (!slot) return;

      const viewport = window.visualViewport;
      const viewportTop = viewport ? viewport.offsetTop : 0;
      const viewportBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
      const stickyHeading = document.querySelector('.dictation-heading');
      const headingRect = stickyHeading ? stickyHeading.getBoundingClientRect() : null;
      const bottomNav = document.querySelector('.listen-bottom-nav');
      const bottomNavRect = bottomNav ? bottomNav.getBoundingClientRect() : null;

      let safeTop = viewportTop + 14;
      if (headingRect && headingRect.bottom > viewportTop && headingRect.top < viewportBottom) {
        safeTop = Math.max(safeTop, headingRect.bottom + 12);
      }

      let safeBottom = viewportBottom - 22;
      if (bottomNavRect && bottomNavRect.top > viewportTop && bottomNavRect.top < viewportBottom) {
        safeBottom = Math.min(safeBottom, bottomNavRect.top - 12);
      }

      const usableHeight = Math.max(120, safeBottom - safeTop);
      const lowerTrigger = safeTop + usableHeight * 0.78;
      const followTarget = safeTop + usableHeight * 0.56;
      const upperTarget = safeTop + Math.min(48, usableHeight * 0.18);
      const rect = slot.getBoundingClientRect();
      let requiredScroll = 0;

      if (configured.force) {
        requiredScroll = (rect.top + rect.height / 2) - followTarget;
      } else if (rect.bottom > lowerTrigger) {
        requiredScroll = rect.bottom - followTarget;
      } else if (rect.top < safeTop) {
        requiredScroll = rect.top - upperTarget;
      }

      if (Math.abs(requiredScroll) < 2) return;
      if (!configured.force) {
        requiredScroll = Math.max(-MAX_AUTO_FOLLOW_SCROLL, Math.min(MAX_AUTO_FOLLOW_SCROLL, requiredScroll));
      }

      programmaticScrollUntil = Date.now() + 180;
      window.scrollBy({ top: requiredScroll, left: 0, behavior: 'auto' });
    });
  }

  function focusDictationInput(options) {
    const configured = options || {};

    const applyFocus = () => {
      const input = document.getElementById('dictationInput');
      if (!input || !input.isConnected) return false;
      if (!input.dataset.composing) input.value = state.input;

      try {
        input.focus({ preventScroll: true });
      } catch (error) {
        input.focus();
      }

      applyDictationSelection(input);
      return document.activeElement === input;
    };

    // immediate=true chỉ dùng trong sự kiện click/pointerdown thật. Đây là
    // điều kiện cần để Safari iPhone mở bàn phím thay vì chỉ đặt focus ảo.
    if (configured.immediate) return applyFocus();

    requestAnimationFrame(applyFocus);
    return false;
  }

  function itemSessionKey(item) {
    return `${item.sourceType || ''}:${item.sourceId || ''}:${item.lessonId || ''}:${item.id || Core.stableId(item.text, 'session')}`;
  }

  function pushUniqueValue(list, value) {
    if (!list.includes(value)) list.push(value);
  }

  function markSessionWrong(item) {
    const key = itemSessionKey(item);
    if (!state.sessionWrongItems.some((entry) => itemSessionKey(entry) === key)) {
      state.sessionWrongItems.push(snapshotItem(item));
    }
  }

  function markSessionAnswer(item) {
    pushUniqueValue(state.sessionAnswerIds, itemSessionKey(item));
    markSessionWrong(item);
  }

  function recordActivityResult(item, isCorrect, activity) {
    state.activityResult = { isCorrect };
    const key = progressKey(item, state.mode);
    const sessionKey = itemSessionKey(item);
    pushUniqueValue(state.sessionCheckedIds, sessionKey);
    if (isCorrect) pushUniqueValue(state.sessionCorrectIds, sessionKey);
    const previous = state.progress[key] || {};
    state.progress[key] = Object.assign({}, previous, {
      item: snapshotItem(item),
      activity,
      attempts: Number(previous.attempts || 0) + 1,
      lastResult: { isCorrect },
      lastReviewedAt: new Date().toISOString()
    });
    if (!isCorrect) {
      state.currentWrongChecks += 1;
      markSessionWrong(item);
    }
    if (state.settings.autoRate) {
      const rating = deriveAutomaticRating();
      state.autoSuggestedRating = rating;
      rateItem(rating, { render: false });
    }
    saveProgress();
    rememberSession();
    if (isCorrect && state.settings.autoNext && state.mode !== 'sequence-ordering') scheduleAutoAdvance();
    render();
  }

  function chooseWord(choiceId) {
    const item = currentItem();
    if (!item || state.activityResult) return;
    state.activitySelection = [choiceId];
    recordActivityResult(item, choiceId === item.answerId, 'listening-word-choice');
  }

  function orderingEntries(item) {
    return item && item.activityType && item.activityType.includes('sequence') ? item.cards : item.tokens;
  }

  function addOrderingToken(tokenId) {
    const item = currentItem();
    if (!item || state.activityResult && state.activityResult.isCorrect) return;
    if (!state.activitySelection.includes(tokenId)) state.activitySelection.push(tokenId);
    rememberSession();
    render();
  }

  function removeOrderingToken(tokenId) {
    if (state.activityResult && state.activityResult.isCorrect) return;
    const index = state.activitySelection.lastIndexOf(tokenId);
    if (index >= 0) state.activitySelection.splice(index, 1);
    state.activityResult = null;
    rememberSession();
    render();
  }

  function resetOrdering() {
    state.activitySelection = [];
    state.activityResult = null;
    rememberSession();
    render();
  }

  function checkOrdering() {
    const item = currentItem();
    if (!item) return;
    const expected = orderingEntries(item).map((entry) => entry.id);
    if (state.activitySelection.length !== expected.length) return;
    const isCorrect = expected.every((id, index) => state.activitySelection[index] === id);
    recordActivityResult(item, isCorrect, item.activityType || 'listening-ordering');
  }

  function showOrderingAnswer() {
    const item = currentItem();
    if (!item) return;
    state.viewedAnswer = true;
    state.showAnswer = true;
    state.activitySelection = orderingEntries(item).map((entry) => entry.id);
    markSessionAnswer(item);
    recordActivityResult(item, false, item.activityType || 'listening-ordering');
  }

  function checkAnswer(options) {
    const configured = options || {};
    const item = currentItem();
    if (!item) return;
    clearAutoAdvance();
    state.result = Core.compareAnswers(state.input, item.text);
    const key = itemSessionKey(item);
    pushUniqueValue(state.sessionCheckedIds, key);
    if (state.result.isCorrect) pushUniqueValue(state.sessionCorrectIds, key);
    else {
      state.currentWrongChecks += 1;
      markSessionWrong(item);
    }
    updateAttemptProgress(item);

    if (state.settings.autoRate) {
      const rating = deriveAutomaticRating();
      state.autoSuggestedRating = rating;
      rateItem(rating, { render: false });
    }

    if (state.result.isCorrect && state.settings.autoNext) {
      scheduleAutoAdvance();
    }

    render();
    if (!state.result.isCorrect || !state.settings.autoNext) focusDictationInput();
    if (!configured.auto) state.autoCheckSignature = Core.answerUnits(state.input).join('');
  }

  function deriveAutomaticRating() {
    return Core.deriveAutomaticRating({
      usedHint: state.usedHint,
      viewedAnswer: state.viewedAnswer,
      wrongChecks: state.currentWrongChecks
    });
  }

  function ratingLabel(rating) {
    if (rating === 'easy') return 'Dễ';
    if (rating === 'review') return 'Ôn';
    if (rating === 'hard') return 'Khó';
    return '';
  }

  function maybeAutoCheckCompleteInput() {
    if (!state.settings.autoCheck || state.result) return;
    if (state.mode === 'transcript' || state.mode === 'passage-transcript') return;
    const item = currentItem();
    if (!item) return;
    const inputUnits = Core.answerUnits(state.input);
    if (!Core.isCompleteDictation(state.input, item.text)) return;
    const signature = inputUnits.join('');
    if (signature === state.autoCheckSignature) return;
    state.autoCheckSignature = signature;
    window.setTimeout(() => {
      if (Core.answerUnits(state.input).join('') !== signature || state.result) return;
      checkAnswer({ auto: true });
    }, 120);
  }

  function scheduleAutoAdvance() {
    clearAutoAdvance();
    const seconds = Math.max(0, Number(state.settings.autoNextSeconds) || 0);
    state.autoAdvanceDeadline = Date.now() + seconds * 1000;
    if (seconds === 0) {
      state.autoAdvanceTimer = window.setTimeout(() => moveItem(1), 80);
      return;
    }
    state.autoAdvanceTimer = window.setTimeout(() => moveItem(1), seconds * 1000);
  }

  function clearAutoAdvance() {
    if (state.autoAdvanceTimer) window.clearTimeout(state.autoAdvanceTimer);
    state.autoAdvanceTimer = null;
    state.autoAdvanceDeadline = 0;
  }

  function cancelAutoAdvance() {
    clearAutoAdvance();
    render();
    focusDictationInput();
  }

  function updateAttemptProgress(item) {
    const key = progressKey(item, state.mode);
    const previous = state.progress[key] || {};
    const isTranscript = state.mode === 'transcript' || state.mode === 'passage-transcript';
    state.progress[key] = Object.assign({}, previous, {
      item: snapshotItem(item),
      activity: item.activityType || (isTranscript ? 'listening-transcript' : item.isPassage ? 'listening-passage-dictation' : 'listening-dictation'),
      attempts: Number(previous.attempts || 0) + 1,
      listenCount: Number(previous.listenCount || 0) + state.listenCount,
      usedHint: Boolean(previous.usedHint || state.usedHint),
      viewedAnswer: Boolean(previous.viewedAnswer || state.showAnswer),
      lastResult: state.result ? { correctCount: state.result.correctCount, total: state.result.total, isCorrect: state.result.isCorrect } : previous.lastResult,
      lastReviewedAt: new Date().toISOString()
    });
    saveProgress();
  }

  function snapshotItem(item) {
    const copy = structuredCloneSafe(item);
    delete copy.raw;
    return copy;
  }

  function showHint() {
    state.usedHint = true;
    state.hint = { wordOpen: false };
    render();
  }

  function toggleAnswer() {
    const item = currentItem();
    if (!item) return;
    clearAutoAdvance();
    state.showAnswer = !state.showAnswer;
    if (state.showAnswer) {
      state.viewedAnswer = true;
      markSessionAnswer(item);
    }
    render();
    if (!state.showAnswer) focusDictationInput();
  }

  function fillHintText(text) {
    if (!currentItem()) return;
    state.usedHint = true;
    commitDictationText(text);
    focusDictationInput();
  }

  function switchCurrentMode(mode) {
    clearAutoAdvance();
    const item = currentItem();
    if (!item || !mode) return;
    stopSpeech();
    const returningToDictation = mode === 'dictation' || mode === 'passage';
    state.mode = mode;
    if (returningToDictation) resetCurrentAnswer();
    else {
      state.result = null;
      state.hint = null;
      state.showAnswer = false;
    }
    rememberSession();
    render();
    if (returningToDictation) focusDictationInput();
  }

  function rateItem(rating, options) {
    const configured = options || {};
    const item = currentItem();
    if (!item) return;
    const key = progressKey(item, state.mode);
    const previous = state.progress[key] || {};
    const isTranscript = state.mode === 'transcript' || state.mode === 'passage-transcript';
    state.progress[key] = Object.assign({}, previous, {
      item: snapshotItem(item),
      activity: item.activityType || (isTranscript ? 'listening-transcript' : item.isPassage ? 'listening-passage-dictation' : 'listening-dictation'),
      rating,
      listenCount: Number(previous.listenCount || 0) + state.listenCount,
      usedHint: Boolean(previous.usedHint || state.usedHint),
      lastReviewedAt: new Date().toISOString()
    });
    if (rating === 'review' || rating === 'hard') markSessionWrong(item);
    state.listenCount = 0;
    saveProgress();
    if (configured.render !== false) render();
  }

  function toggleGroupContext() {
    state.groupContextExpanded = !state.groupContextExpanded;
    render();
  }

  function toggleGroupTranscript() {
    const item = currentItem();
    if (!item || !item.groupContext) return;
    state.groupTranscriptOpen = !state.groupTranscriptOpen;
    if (state.groupTranscriptOpen) {
      state.usedHint = true;
      markSessionAnswer(item);
    }
    rememberSession();
    render();
  }

  function toggleGroupOverviewAudio() {
    const item = currentItem();
    const context = item && item.groupContext;
    if (!context || !context.speechText) return;
    if (state.groupPreviewSpeaking) {
      stopSpeech();
      render();
      return;
    }
    if (!('speechSynthesis' in window)) {
      state.error = 'Thiết bị không hỗ trợ đọc toàn bộ hội thoại hoặc đoạn văn.';
      render();
      return;
    }
    stopSpeech();
    const token = ++state.speechToken;
    const utterance = new SpeechSynthesisUtterance(context.speechText);
    const voice = selectedVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = voice && voice.lang || 'zh-CN';
    utterance.rate = Number(state.settings.rate) || 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    state.groupPreviewSpeaking = true;
    state.speaking = true;
    state.paused = false;
    state.listenCount += 1;
    render();
    const finish = () => {
      if (token !== state.speechToken) return;
      state.groupPreviewSpeaking = false;
      state.speaking = false;
      state.paused = false;
      render();
    };
    utterance.onend = finish;
    utterance.onerror = (event) => {
      if (event.error === 'canceled' || event.error === 'interrupted') return;
      state.error = `Không đọc được toàn bộ nội dung (${event.error || 'unknown'}).`;
      finish();
    };
    window.setTimeout(() => {
      if (token === state.speechToken) window.speechSynthesis.speak(utterance);
    }, 40);
  }

  function autoplayCurrentItemAfterNavigation() {
    const item = currentItem();
    if (!item || state.screen !== 'practice') return;
    const expectedKey = itemSessionKey(item);
    window.setTimeout(async () => {
      const active = currentItem();
      if (!active || itemSessionKey(active) !== expectedKey || state.screen !== 'practice') return;
      if (state.settings.voiceSource === 'device' || !AudioStore) {
        speakFrom(0);
        return;
      }
      try {
        const entry = await prepareImportedAudio(active, { force: true, silent: true });
        const latest = currentItem();
        if (!latest || itemSessionKey(latest) !== expectedKey || state.screen !== 'practice') return;
        if (entry && state.audioPlayer) {
          state.audioPlayer.currentTime = 0;
          state.audioCurrentTime = 0;
          resumeFileAudio({ fallbackToDevice: state.settings.voiceSource === 'auto' });
          return;
        }
      } catch (error) {
        // Chế độ Tự động sẽ dùng TTS khi MP3 không sẵn sàng.
      }
      if (state.settings.voiceSource === 'auto') speakFrom(0);
      else {
        state.audioStatus = 'missing';
        state.audioMessage = 'Mục mới chưa có MP3. Hãy nhập MP3 hoặc đổi sang Tự động/TTS.';
        render();
      }
    }, 70);
  }

  function moveItem(delta) {
    clearAutoAdvance();
    const items = activeItems();
    const next = state.currentIndex + delta;
    if (next < 0) return;
    if (next >= items.length) {
      completePractice();
      return;
    }
    state.currentIndex = next;
    resetCurrentAnswer();
    resetFloatingAudioContext();
    rememberSession();
    prepareNextItem();
    render();
    focusDictationInput();
    if (delta > 0) autoplayCurrentItemAfterNavigation();
  }

  function prepareNextItem() {
    const next = activeItems()[state.currentIndex + 1];
    state.preparedNext = next ? {
      text: speechTextFor(next),
      voiceURI: selectedVoice() && (selectedVoice().voiceURI || selectedVoice().name) || '',
      rate: Number(state.settings.rate) || 1
    } : null;
  }

  function completePractice() {
    clearAutoAdvance();
    stopSpeech();
    state.screen = 'complete';
    render();
  }

  function retryWrongItems() {
    if (!state.sessionWrongItems.length) return;
    const retryItems = state.sessionWrongItems.map((item) => structuredCloneSafe(item));
    state.practiceItems = retryItems;
    const firstActivity = retryItems[0] && retryItems[0].activityType || '';
    if (firstActivity === 'word-choice') state.mode = 'word-choice';
    else if (firstActivity.includes('sequence-ordering')) state.mode = 'sequence-ordering';
    else if (firstActivity.includes('ordering')) state.mode = 'token-ordering';
    else state.mode = retryItems[0] && retryItems[0].isPassage ? 'passage' : 'dictation';
    state.currentIndex = 0;
    state.sessionName = state.mode === 'word-choice' ? 'Chọn lại từ sai' : state.mode.includes('ordering') ? 'Xếp lại mục sai' : retryItems[0] && retryItems[0].isPassage ? 'Chép lại đoạn' : 'Chép lại câu sai';
    state.sessionWrongItems = [];
    state.sessionCheckedIds = [];
    state.sessionCorrectIds = [];
    state.sessionAnswerIds = [];
    state.groupContextExpanded = false;
    resetCurrentAnswer();
    state.screen = 'practice';
    resetFloatingAudioContext();
    rememberSession();
    prepareNextItem();
    render();
    focusDictationInput();
  }

  function returnToModeChoice() {
    clearAutoAdvance();
    stopSpeech();
    state.practiceItems = null;
    state.sessionName = '';
    state.activityDescriptor = null;
    state.screen = 'mode';
    render();
  }

  function goBack() {
    if (state.menuOpen) {
      state.menuOpen = false;
      render();
      return;
    }
    if (state.settingsOpen) {
      state.settingsOpen = false;
      render();
      return;
    }
    if (state.screen === 'practice' || state.screen === 'complete') {
      state.practiceItems = null;
      state.sessionName = '';
      state.activitySelection = [];
      state.activityResult = null;
      state.screen = 'mode';
      stopSpeech();
      render();
      restoreModeScroll();
      return;
    }
    if (state.screen === 'newHskUnits' || state.screen === 'ldsnUnits') {
      state.screen = 'home';
      render();
      return;
    }
    if (state.screen === 'preview') {
      state.screen = 'mode';
      render();
      return;
    }
    if (state.screen === 'mode') {
      state.practiceItems = null;
      if (state.source === 'new-hsk') {
        state.dataset = null;
        state.items = [];
        state.screen = 'newHskUnits';
      } else if (state.source === 'ldsn14') {
        state.dataset = null;
        state.items = [];
        state.screen = 'ldsnUnits';
      } else if (state.source === '301') state.screen = 'lessons301';
      else if (state.source === 'custom') state.screen = state.lesson && state.lesson.groupId ? 'customGroup' : 'custom';
      else state.screen = 'home';
      render();
      return;
    }
    setScreen('home');
  }

  function syncOverlayState() {
    document.body.classList.toggle('listen-overlay-open', Boolean(state.menuOpen || state.settingsOpen));
  }

  function setAutomationSetting(name, value) {
    state.settings[name] = Boolean(value);
    if (name === 'autoNext' && !value) clearAutoAdvance();
    saveSettings();
    render();
  }

  function setAutoNextSeconds(seconds) {
    const normalized = Core.normalizeDelaySeconds(seconds, 60);
    if (normalized === null) return false;
    state.settings.autoNextSeconds = normalized;
    saveSettings();
    render();
    return true;
  }

  function applyCustomAutoNextSeconds() {
    const input = document.getElementById('autoNextCustomSeconds');
    if (!input) return;
    const normalized = Core.normalizeDelaySeconds(input.value, 60);
    if (normalized === null) {
      input.setCustomValidity('Nhập thời gian từ 0 đến 60 giây.');
      input.reportValidity();
      return;
    }
    input.setCustomValidity('');
    setAutoNextSeconds(normalized);
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }

  async function refreshAudioStats() {
    if (!AudioStore) return;
    try {
      state.audioStats = await AudioStore.stats();
      if (state.settingsOpen) render();
    } catch (error) {
      console.warn('Không đọc được cache audio:', error);
    }
  }

  function setVoiceSource(source) {
    if (!['auto', 'import', 'device'].includes(source)) return;
    state.settings.voiceSource = source;
    saveSettings();
    stopSpeech();
    render();
    if (source !== 'device') schedulePrepareCurrentAudio();
  }

  function readAudioDuration(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      const cleanup = () => URL.revokeObjectURL(url);
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        const duration = Number(audio.duration);
        cleanup();
        if (!Number.isFinite(duration) || duration <= 0) reject(new Error('Không đọc được thời lượng MP3.'));
        else resolve(duration);
      };
      audio.onerror = () => { cleanup(); reject(new Error('File MP3 bị lỗi hoặc trình duyệt không đọc được.')); };
      audio.src = url;
    });
  }

  async function validateMp3File(file) {
    if (!file) throw new Error('Chưa chọn file.');
    const name = String(file.name || '').toLowerCase();
    const type = String(file.type || '').toLowerCase();
    if (!name.endsWith('.mp3') || (type && !['audio/mpeg', 'audio/mp3'].includes(type))) {
      throw new Error('Chỉ hỗ trợ file .mp3 hợp lệ.');
    }
    if (file.size > 20 * 1024 * 1024) throw new Error('MP3 vượt quá 20 MB.');
    const duration = await readAudioDuration(file);
    if (duration < 0.3 || duration > 300) throw new Error('Thời lượng MP3 phải từ 0,3 đến 300 giây.');
    return duration;
  }

  async function importCurrentAudio(file) {
    const item = currentItem();
    if (!item || !AudioStore) return;
    try {
      const duration = await validateMp3File(file);
      await AudioStore.importForText({ file, text: speechTextFor(item), itemId: item.id || '', duration, scope: audioScopeFor(item) });
      state.settings.voiceSource = 'import';
      saveSettings();
      state.error = '';
      state.audioMessage = `Đang chuẩn bị MP3 ${audioScopeLabel(item)}...`;
      state.audioStatus = 'loading';
      await prepareImportedAudio(item, { force: true });
      await refreshAudioStats();
      state.audioMessage = `MP3 ${audioScopeLabel(item)} đã sẵn sàng · ${formatAudioTime(duration)}.`;
      state.audioStatus = 'ready';
      render();
      window.alert(`Đã nhập và chuẩn bị xong MP3 (${formatAudioTime(duration)}) cho ${audioScopeLabel(item)}.`);
    } catch (error) {
      state.error = `Không nhập được MP3: ${error.message || error}`;
      state.audioMessage = state.error;
      state.audioStatus = 'error';
      render();
    }
  }

  async function exportCurrentAudio() {
    const item = currentItem();
    if (!item || !AudioStore) return;
    try {
      const entry = await AudioStore.resolveImported({ text: speechTextFor(item), itemId: item.id || '', scope: audioScopeFor(item) });
      if (!entry?.blob) throw new Error(item.isPassage ? 'Đoạn này chưa có MP3 toàn đoạn.' : 'Câu này chưa có MP3 đã nhập.');
      const fallbackId = String(item.id || state.currentIndex + 1).replace(/[^a-zA-Z0-9_-]+/g, '-');
      AudioStore.downloadBlob(entry.blob, entry.originalName || `${fallbackId}${item.isPassage ? '-passage' : ''}.mp3`);
    } catch (error) {
      state.error = error.message || String(error);
      render();
    }
  }

  async function deleteCurrentAudio() {
    const item = currentItem();
    if (!item || !AudioStore) return;
    const label = audioScopeLabel(item);
    if (!window.confirm(`Xóa MP3 ${label}? Tiến độ học vẫn được giữ nguyên.`)) return;
    try {
      await AudioStore.removeImported({ text: speechTextFor(item), itemId: item.id || '', scope: audioScopeFor(item) });
      stopSpeech();
      state.audioStatus = 'missing';
      state.audioMessage = `Đã xóa MP3 ${label}.`;
      await refreshAudioStats();
      render();
    } catch (error) {
      state.audioStatus = 'error';
      state.audioMessage = `Không xóa được MP3: ${error.message || error}`;
      render();
    }
  }

  async function clearExpiredAudio() {
    if (!AudioStore) return;
    await AudioStore.clearExpired();
    await refreshAudioStats();
  }

  async function clearAllAudio() {
    if (!AudioStore || !window.confirm('Xóa toàn bộ MP3 trong app? Tiến độ học vẫn được giữ nguyên.')) return;
    stopSpeech();
    await AudioStore.clearAll();
    await refreshAudioStats();
  }

  function setGender(gender) {
    state.settings.voiceGender = gender;
    state.settings.voiceURI = '';
    saveSettings();
    stopSpeech();
    render();
  }

  function setRewind(seconds) {
    state.settings.rewindSeconds = seconds;
    saveSettings();
    render();
  }

  function setRate(rate) {
    state.settings.rate = rate;
    saveSettings();
    if (currentAudioIsPrepared(currentItem())) {
      state.audioPlayer.playbackRate = rate;
      render();
    } else if (state.speaking || state.paused) speakFrom(state.speechCharIndex || 0);
    else render();
  }

  function schedulePrepareCurrentAudio() {
    if (state.audioPrepareScheduled || state.screen !== 'practice' || state.settings.voiceSource === 'device') return;
    state.audioPrepareScheduled = true;
    window.setTimeout(() => {
      state.audioPrepareScheduled = false;
      const item = currentItem();
      if (!item || state.screen !== 'practice' || state.settings.voiceSource === 'device') return;
      prepareImportedAudio(item, { silent: false }).catch(() => {});
    }, 0);
  }

  function toggleSpeech() {
    const item = currentItem();
    if (!item) return;
    if (state.groupPreviewSpeaking) stopSpeech();

    if (currentAudioIsPrepared(item)) {
      if (state.speaking) pauseSpeech();
      else resumeFileAudio();
      return;
    }

    if (state.settings.voiceSource !== 'device') {
      if (state.audioLoading) return;
      state.audioMessage = `Đang chuẩn bị MP3 ${audioScopeLabel(item)}...`;
      state.audioStatus = 'loading';
      render();
      prepareImportedAudio(item, { force: true }).then((entry) => {
        if (!entry) {
          if (state.settings.voiceSource === 'auto') toggleDeviceSpeech();
          return;
        }
        // Không tự play sau await trên iOS. Lần chạm tiếp theo sẽ gọi play() trực tiếp.
        state.audioMessage = 'MP3 đã sẵn sàng. Chạm nút Phát một lần nữa.';
        state.audioStatus = 'ready';
        render();
      }).catch(() => {});
      return;
    }
    toggleDeviceSpeech();
  }

  function toggleDeviceSpeech() {
    if (!('speechSynthesis' in window)) {
      state.error = 'Thiết bị không hỗ trợ speechSynthesis.';
      state.audioMessage = state.error;
      state.audioStatus = 'error';
      render();
      return;
    }
    if (state.speaking) { pauseSpeech(); return; }
    if (state.paused) { speakFrom(state.speechCharIndex || state.speechStartIndex || 0); return; }
    const item = currentItem();
    const text = speechTextFor(item);
    speakFrom(item && state.speechCharIndex >= text.length ? 0 : (state.speechCharIndex || 0));
  }

  function pauseSpeech() {
    if (state.audioPlayer) {
      state.audioPlayer.pause();
      state.speaking = false;
      state.paused = true;
      state.audioStatus = 'paused';
      state.audioMessage = `Đã tạm dừng tại ${formatAudioTime(state.audioCurrentTime)}.`;
      updatePlaybackControlUi();
      updateAudioTimeUi();
      return;
    }
    if (!('speechSynthesis' in window) || !state.speaking) return;
    window.speechSynthesis.cancel();
    state.speaking = false;
    state.paused = true;
    state.speechToken += 1;
    render();
  }

  function releasePreparedFileAudio() {
    state.audioLoadToken += 1;
    try {
      importedAudioElement.pause();
      importedAudioElement.removeAttribute('src');
      importedAudioElement.load();
    } catch (error) {
      console.warn('Không thể đóng audio cũ:', error);
    }
    if (state.audioObjectUrl) URL.revokeObjectURL(state.audioObjectUrl);
    state.audioObjectUrl = '';
    state.audioPlayer = null;
    state.audioEntry = null;
    state.audioPreparedFingerprint = '';
    state.audioCurrentTime = 0;
    state.audioDuration = 0;
    state.audioPreparePromise = null;
  }

  function stopSpeech() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    releasePreparedFileAudio();
    state.audioLoading = false;
    state.audioStatus = 'idle';
    state.audioMessage = '';
    state.speaking = false;
    state.paused = false;
    state.groupPreviewSpeaking = false;
    state.speechToken += 1;
  }

  function rewindSpeech() {
    const item = currentItem();
    if (currentAudioIsPrepared(item)) {
      state.audioPlayer.currentTime = Math.max(0, state.audioPlayer.currentTime - Number(state.settings.rewindSeconds || 3));
      state.audioCurrentTime = state.audioPlayer.currentTime;
      updateAudioTimeUi();
      resumeFileAudio();
      return;
    }
    if (!item) return;
    const text = speechTextFor(item);
    const start = Core.findRewindStart(text, state.speechCharIndex || 0, state.settings.rewindSeconds, state.settings.rate);
    speakFrom(start);
  }

  function forwardSpeech() {
    const item = currentItem();
    if (currentAudioIsPrepared(item)) {
      state.audioPlayer.currentTime = Math.min(state.audioPlayer.duration || state.audioDuration || 0, state.audioPlayer.currentTime + Number(state.settings.rewindSeconds || 3));
      state.audioCurrentTime = state.audioPlayer.currentTime;
      updateAudioTimeUi();
      resumeFileAudio();
      return;
    }
    if (!item) return;
    const text = speechTextFor(item);
    const speed = Math.max(0.5, Number(state.settings.rate) || 1);
    const advance = Math.max(1, Math.round((Number(state.settings.rewindSeconds) || 3) * 3.6 * speed));
    speakFrom(Math.min(text.length - 1, (state.speechCharIndex || 0) + advance));
  }

  function updatePlaybackControlUi() {
    const label = state.audioLoading
      ? 'Đang tải'
      : state.speaking
        ? 'Tạm dừng'
        : state.paused
          ? 'Phát tiếp'
          : 'Phát';
    const icon = state.audioLoading ? '◌' : state.speaking ? 'Ⅱ' : '▶';

    document.querySelectorAll('[data-action="toggle-speech"]').forEach((button) => {
      button.disabled = Boolean(state.audioLoading);
      button.setAttribute('aria-label', label);
      button.classList.toggle('is-speaking', Boolean(state.speaking));
      button.classList.toggle('is-paused', Boolean(state.paused));
      if (button.classList.contains('practice-audio-toggle')) {
        button.innerHTML = `<span aria-hidden="true">${icon}</span><small>${label}</small>`;
      } else if (button.classList.contains('play-button')) {
        button.textContent = icon;
      }
    });

    const heading = document.querySelector('.audio-head strong');
    if (heading) {
      const item = currentItem();
      heading.textContent = state.audioLoading
        ? 'Đang tải MP3...'
        : state.speaking
          ? (state.audioPlayer ? 'Đang phát...' : 'Đang đọc...')
          : state.paused
            ? 'Đã tạm dừng'
            : item && item.isPassage
              ? 'Nghe toàn đoạn'
              : 'Nghe câu';
    }
  }

  function updateAudioTimeUi() {
    const current = document.getElementById('audioCurrentTime');
    const duration = document.getElementById('audioDuration');
    const kind = document.getElementById('audioTimeKind');
    const slider = document.getElementById('speechPosition');

    if (state.audioPlayer) {
      if (current) current.textContent = formatAudioTime(state.audioCurrentTime);
      if (duration) duration.textContent = state.audioDuration > 0 ? formatAudioTime(state.audioDuration) : '--:--';
      if (kind) kind.textContent = '';
      if (slider) {
        slider.max = String(state.audioDuration || 0);
        slider.step = '0.1';
        slider.value = String(state.audioCurrentTime || 0);
      }
      return;
    }

    const item = currentItem();
    const text = item ? speechTextFor(item) : '';
    const estimatedDuration = estimatedDeviceSpeechDuration(text);
    const estimatedCurrent = estimatedDeviceSpeechTime(text, state.speechCharIndex);
    if (current) current.textContent = formatAudioTime(estimatedCurrent);
    if (duration) duration.textContent = estimatedDuration > 0 ? formatAudioTime(estimatedDuration) : '--:--';
    if (kind) kind.textContent = estimatedDuration > 0 ? 'ước tính' : '';
    if (slider) {
      slider.max = String(Math.max(1, text.length));
      slider.step = '1';
      slider.value = String(Math.min(text.length, state.speechCharIndex || 0));
    }
  }

  function bindImportedAudioEvents(token) {
    const player = importedAudioElement;
    const isCurrent = () => token === state.audioLoadToken;
    const syncDuration = () => {
      if (!isCurrent()) return;
      const duration = Number(player.duration);
      state.audioDuration = Number.isFinite(duration) && duration > 0
        ? duration
        : Number(state.audioEntry && state.audioEntry.duration) || 0;
      state.audioCurrentTime = Number(player.currentTime) || 0;
      updateAudioTimeUi();
    };

    player.onloadedmetadata = syncDuration;
    player.ondurationchange = syncDuration;
    player.oncanplay = () => {
      if (!isCurrent()) return;
      syncDuration();
      state.audioLoading = false;
      state.audioStatus = 'ready';
      state.audioMessage = `MP3 đã sẵn sàng · ${formatAudioTime(state.audioDuration)}.`;
      updateAudioTimeUi();
    };
    player.ontimeupdate = () => {
      if (!isCurrent()) return;
      state.audioCurrentTime = Number(player.currentTime) || 0;
      syncDuration();
    };
    player.onplay = () => {
      if (!isCurrent()) return;
      state.speaking = true;
      state.paused = false;
      state.audioStatus = 'playing';
      state.audioMessage = `Đang phát · ${formatAudioTime(state.audioCurrentTime)} / ${formatAudioTime(state.audioDuration)}.`;
      updatePlaybackControlUi();
    };
    player.onpause = () => {
      if (!isCurrent() || player.ended || !player.src) return;
      state.speaking = false;
      state.paused = true;
      updatePlaybackControlUi();
    };
    player.onended = () => {
      if (!isCurrent()) return;
      state.speaking = false;
      state.paused = false;
      state.audioCurrentTime = state.audioDuration;
      state.audioStatus = 'ready';
      state.audioMessage = 'Đã phát xong MP3.';
      updateAudioTimeUi();
      updatePlaybackControlUi();
    };
    player.onerror = () => {
      if (!isCurrent()) return;
      const mediaError = player.error;
      state.audioLoading = false;
      state.speaking = false;
      state.paused = false;
      state.audioStatus = 'error';
      state.audioMessage = `MP3 không phát được${mediaError && mediaError.code ? ` (mã ${mediaError.code})` : ''}. Hãy thử xuất MP3 rồi mở kiểm tra hoặc nhập lại file.`;
      render();
    };
  }

  function waitForImportedAudioReady(token, timeoutMs = 10000) {
    const player = importedAudioElement;
    if (player.readyState >= 1 && (Number.isFinite(player.duration) || Number(state.audioEntry && state.audioEntry.duration) > 0)) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      let finished = false;
      const cleanup = () => {
        player.removeEventListener('loadedmetadata', onReady);
        player.removeEventListener('canplay', onReady);
        player.removeEventListener('error', onError);
        window.clearTimeout(timer);
      };
      const done = (callback) => {
        if (finished) return;
        finished = true;
        cleanup();
        callback();
      };
      const onReady = () => {
        if (token !== state.audioLoadToken) return done(() => reject(new Error('Đã đổi câu trước khi tải xong MP3.')));
        done(resolve);
      };
      const onError = () => done(() => reject(new Error('Safari không đọc được dữ liệu MP3 đã lưu.')));
      const timer = window.setTimeout(() => done(() => reject(new Error('Hết thời gian chuẩn bị MP3. Hãy nhập lại file.'))), timeoutMs);
      player.addEventListener('loadedmetadata', onReady);
      player.addEventListener('canplay', onReady);
      player.addEventListener('error', onError);
    });
  }

  async function normalizePlaybackBlob(entry) {
    const source = entry && entry.blob;
    if (!source) throw new Error('Bản ghi MP3 không còn dữ liệu.');
    if (typeof source.arrayBuffer !== 'function') throw new Error('Dữ liệu MP3 trong bộ nhớ không hợp lệ.');
    const bytes = await source.arrayBuffer();
    if (!bytes.byteLength) throw new Error('File MP3 trong bộ nhớ bị rỗng.');
    return new Blob([bytes], { type: entry.mimeType || source.type || 'audio/mpeg' });
  }

  async function prepareImportedAudio(item, options = {}) {
    if (!item || !AudioStore) return null;
    const fingerprint = audioFingerprintFor(item);
    if (!options.force && currentAudioIsPrepared(item)) return state.audioEntry;
    if (!options.force && state.audioPreparePromise && state.audioPreparedFingerprint === fingerprint) return state.audioPreparePromise;

    const token = ++state.audioLoadToken;
    state.audioLoading = true;
    state.audioStatus = 'loading';
    state.audioMessage = `Đang chuẩn bị MP3 ${audioScopeLabel(item)}...`;
    state.audioPreparedFingerprint = fingerprint;
    if (!options.silent) render();

    const task = (async () => {
      try {
        const entry = await AudioStore.resolveImported({
          text: speechTextFor(item),
          itemId: item.id || '',
          scope: audioScopeFor(item)
        });
        if (token !== state.audioLoadToken) return null;
        if (!entry || !entry.blob) {
          state.audioLoading = false;
          state.audioEntry = null;
          state.audioPlayer = null;
          state.audioStatus = 'missing';
          state.audioMessage = `Chưa có MP3 ${audioScopeLabel(item)}.`;
          if (!options.silent) render();
          return null;
        }

        const playbackBlob = await normalizePlaybackBlob(entry);
        if (token !== state.audioLoadToken) return null;

        try {
          importedAudioElement.pause();
          importedAudioElement.removeAttribute('src');
          importedAudioElement.load();
        } catch (error) {
          console.warn('Không thể làm mới audio element:', error);
        }
        if (state.audioObjectUrl) URL.revokeObjectURL(state.audioObjectUrl);

        state.audioEntry = entry;
        state.audioObjectUrl = URL.createObjectURL(playbackBlob);
        state.audioPlayer = importedAudioElement;
        state.audioCurrentTime = 0;
        state.audioDuration = Number(entry.duration) || 0;
        bindImportedAudioEvents(token);
        importedAudioElement.preload = 'metadata';
        importedAudioElement.src = state.audioObjectUrl;
        importedAudioElement.playbackRate = Number(state.settings.rate) || 1;
        importedAudioElement.load();

        await waitForImportedAudioReady(token);
        if (token !== state.audioLoadToken) return null;
        state.audioLoading = false;
        state.audioStatus = 'ready';
        state.audioDuration = Number(importedAudioElement.duration) || Number(entry.duration) || 0;
        state.audioMessage = `MP3 đã sẵn sàng · ${formatAudioTime(state.audioDuration)}.`;
        updateAudioTimeUi();
        if (!options.silent || state.settingsOpen) render();
        return entry;
      } catch (error) {
        if (token !== state.audioLoadToken) return null;
        state.audioLoading = false;
        state.audioStatus = 'error';
        state.audioMessage = `Không chuẩn bị được MP3: ${mediaErrorText(error)}`;
        if (!options.silent || state.settingsOpen) render();
        throw error;
      } finally {
        if (state.audioPreparePromise === task) state.audioPreparePromise = null;
      }
    })();

    state.audioPreparePromise = task;
    return task;
  }

  function resumeFileAudio(options) {
    const configured = options || {};
    const item = currentItem();
    if (!currentAudioIsPrepared(item)) {
      state.audioStatus = 'loading';
      state.audioMessage = 'MP3 chưa sẵn sàng. Đang chuẩn bị...';
      render();
      schedulePrepareCurrentAudio();
      return;
    }
    const player = state.audioPlayer;
    player.playbackRate = Number(state.settings.rate) || 1;
    // play() được gọi ngay trong sự kiện chạm; đây là điểm quan trọng trên Safari/iPhone.
    const playPromise = player.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.then(() => {
        state.speaking = true;
        state.paused = false;
        state.audioStatus = 'playing';
        state.audioMessage = `Đang phát · ${formatAudioTime(state.audioCurrentTime)} / ${formatAudioTime(state.audioDuration)}.`;
        updatePlaybackControlUi();
        updateAudioTimeUi();
      }).catch((error) => {
        state.speaking = false;
        state.paused = false;
        if (configured.fallbackToDevice) {
          releasePreparedFileAudio();
          state.audioStatus = 'idle';
          state.audioMessage = 'MP3 bị chặn tự phát; đang chuyển sang TTS thiết bị.';
          speakFrom(0);
          return;
        }
        state.audioStatus = 'error';
        state.audioMessage = `Không phát được MP3: ${mediaErrorText(error)}`;
        render();
      });
    }
    return playPromise;
  }

  async function playImportedAudio(item, options = {}) {
    // Giữ API cũ cho các vị trí khác trong app, nhưng không tự phát sau await trên iOS.
    const entry = await prepareImportedAudio(item, { force: Boolean(options.restart) });
    if (entry) {
      if (options.restart && state.audioPlayer) state.audioPlayer.currentTime = 0;
      state.audioStatus = 'ready';
      state.audioMessage = 'MP3 đã sẵn sàng. Chạm Phát để nghe.';
      render();
    }
    return entry;
  }

  function speakFrom(index) {
    const item = currentItem();
    if (!item || !('speechSynthesis' in window)) return;
    const text = speechTextFor(item);
    const startIndex = Math.max(0, Math.min(text.length - 1, Number(index) || 0));
    const speakingText = text.slice(startIndex).replace(/^\s+/, '');
    if (!speakingText) return;

    window.speechSynthesis.cancel();
    const token = ++state.speechToken;
    const utterance = new SpeechSynthesisUtterance(speakingText);
    const voice = selectedVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = voice && voice.lang || 'zh-CN';
    utterance.rate = Number(state.settings.rate) || 1;
    utterance.pitch = 1;
    utterance.volume = 1;

    state.speechStartIndex = startIndex;
    state.speechCharIndex = startIndex;
    state.speaking = true;
    state.paused = false;
    state.listenCount += 1;
    render();
    requestAnimationFrame(updateAudioTimeUi);

    utterance.onboundary = (event) => {
      if (token !== state.speechToken) return;
      if (Number.isFinite(event.charIndex)) {
        state.speechCharIndex = Math.min(text.length, startIndex + event.charIndex);
        updateAudioTimeUi();
      }
    };
    utterance.onend = () => {
      if (token !== state.speechToken) return;
      state.speaking = false;
      state.paused = false;
      state.speechCharIndex = text.length;
      render();
      requestAnimationFrame(updateAudioTimeUi);
    };
    utterance.onerror = (event) => {
      if (token !== state.speechToken || event.error === 'canceled' || event.error === 'interrupted') return;
      state.speaking = false;
      state.paused = false;
      state.error = `Không phát được giọng thiết bị (${event.error || 'unknown'}).`;
      render();
    };

    window.setTimeout(() => {
      if (token === state.speechToken) window.speechSynthesis.speak(utterance);
    }, 60);
  }

  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
    window.setTimeout(loadVoices, 250);
    window.setTimeout(loadVoices, 1000);
  } else {
    state.voicesReady = true;
  }

  if (LibraryStore) {
    LibraryStore.init().then(refreshListeningLibrary).catch((error) => console.warn('Không khởi tạo được thư viện Nghe:', error));
  }
  window.addEventListener('pagehide', () => { stopSpeech(); clearAutoAdvance(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && (state.menuOpen || state.settingsOpen)) {
      event.preventDefault();
      state.menuOpen = false;
      state.settingsOpen = false;
      render();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseSpeech();
  });
  window.addEventListener('scroll', handlePracticeFloatingAudioViewportChange, { passive: true });
  window.visualViewport?.addEventListener('resize', handlePracticeFloatingAudioViewportChange, { passive: true });
  window.visualViewport?.addEventListener('scroll', handlePracticeFloatingAudioViewportChange, { passive: true });
  window.addEventListener('resize', handlePracticeFloatingAudioViewportChange, { passive: true });
  window.addEventListener('orientationchange', () => {
    practiceViewportMaxHeight = 0;
    handlePracticeFloatingAudioViewportChange();
  }, { passive: true });
  document.addEventListener('focusin', (event) => {
    if (event.target && event.target.id === 'dictationInput') window.setTimeout(handlePracticeFloatingAudioViewportChange, 80);
  });
  document.addEventListener('focusout', (event) => {
    if (event.target && event.target.id === 'dictationInput') window.setTimeout(handlePracticeFloatingAudioViewportChange, 180);
  });

  window.ListeningAudioDebug = {
    state,
    currentItem,
    prepare: () => prepareImportedAudio(currentItem(), { force: true }),
    play: () => resumeFileAudio(),
    inspect: async () => ({
      item: currentItem(),
      fingerprint: audioFingerprintFor(currentItem()),
      prepared: currentAudioIsPrepared(currentItem()),
      status: state.audioStatus,
      message: state.audioMessage,
      duration: state.audioDuration,
      readyState: importedAudioElement.readyState,
      networkState: importedAudioElement.networkState,
      mediaError: importedAudioElement.error && { code: importedAudioElement.error.code, message: importedAudioElement.error.message }
    })
  };

  render();
})();

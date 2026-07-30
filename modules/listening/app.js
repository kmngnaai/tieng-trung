(() => {
  'use strict';
  // Listening library v1.16 — groups/decks/trash replace the old flat custom list.

  const Core = window.ListeningCore;
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
    autoNextSeconds: 2
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
    audioPreparePromise: null
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
    if (state.screen === 'practice' && state.settings.voiceSource !== 'device') schedulePrepareCurrentAudio();
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
            <button class="source-card is-disabled" type="button" disabled>
              <span class="source-icon">HSK</span>
              <strong>HSK</strong>
              <small>Sẽ nối dữ liệu HSK hiện có ở bước tiếp theo</small>
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

  async function open301Library() {
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

  function renderContentPreview() {
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
    if (mode === 'passage' || mode === 'passage-transcript') {
      const passage = Core.createPassageItem(state.items, {
        sourceType: state.source,
        sourceId: state.lesson && (state.lesson.lesson_id || state.lesson.id) || state.source,
        sourceTitle: sessionTitle(),
        lessonId: state.lesson && (state.lesson.lesson_id || state.lesson.id) || '',
        lessonTitle: sessionTitle()
      });
      state.practiceItems = passage ? [passage] : [];
    } else if (configured.items) {
      state.practiceItems = configured.items.slice();
    } else {
      state.practiceItems = state.items;
    }
    state.currentIndex = Math.max(0, Math.min(Number(index) || 0, Math.max(0, activeItems().length - 1)));
    state.sessionWrongItems = [];
    state.sessionCheckedIds = [];
    state.sessionCorrectIds = [];
    state.sessionAnswerIds = [];
    resetCurrentAnswer();
    state.screen = 'practice';
    rememberSession();
    prepareNextItem();
    render();
    focusDictationInput();
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
  }

  function rememberSession() {
    const item = currentItem();
    if (!item) return;
    saveJson(LAST_SESSION_KEY, {
      source: state.source,
      lessonId: state.lesson && (state.lesson.lesson_id || state.lesson.id) || '',
      mode: state.mode,
      currentIndex: state.currentIndex,
      updatedAt: new Date().toISOString()
    });
  }

  async function resumeLastSession() {
    const session = loadJson(LAST_SESSION_KEY, null);
    if (!session) {
      state.error = 'Chưa có phiên nghe gần đây.';
      render();
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
    state.lesson = { id: 'review', title: 'Câu cần ôn' };
    state.items = deduped;
    state.practiceItems = null;
    state.vocabulary = [];
    state.screen = 'mode';
    state.error = '';
    render();
  }

  function practiceModeLabel() {
    if (state.mode === 'transcript') return 'Có transcript';
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
    return `${audioScopeFor(item)}|${String(item.id || '')}|${speechTextFor(item).trim()}`;
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

  function renderPractice() {
    const item = currentItem();
    if (!item) {
      setScreen('home');
      return;
    }
    const items = activeItems();
    const units = Core.answerUnits(item.text);
    const isPassage = Boolean(item.isPassage);
    const isTranscript = state.mode === 'transcript' || state.mode === 'passage-transcript';
    const progress = isPassage ? `${item.segments.length} câu` : `${state.currentIndex + 1}/${items.length}`;
    const speechText = speechTextFor(item);
    app.innerHTML = `
      ${pageHeader(state.sessionName || sessionTitle(), `${practiceModeLabel()} · ${progress}`, true)}
      <main class="listen-main practice-main">
        <section class="practice-progress" aria-label="Tiến độ">
          <span style="width:${isPassage ? 100 : ((state.currentIndex + 1) / items.length) * 100}%"></span>
        </section>

        <div class="practice-mode-switch" aria-label="Chế độ luyện">
          <button data-action="switch-current-mode" data-mode="${isPassage ? 'passage' : 'dictation'}" class="${!isTranscript ? 'active' : ''}">Chép chính tả</button>
          <button data-action="switch-current-mode" data-mode="${isPassage ? 'passage-transcript' : 'transcript'}" class="${isTranscript ? 'active' : ''}">Có transcript</button>
        </div>

        <section class="audio-card">
          <div class="audio-head">
            <div><p class="eyebrow">${isPassage ? 'Đoạn nghe' : `Câu ${progress}`}</p><strong>${state.audioLoading ? 'Đang tải MP3...' : state.speaking ? (state.audioPlayer ? 'Đang phát...' : 'Đang đọc...') : state.paused ? 'Đã tạm dừng' : isPassage ? 'Nghe toàn đoạn' : 'Nghe câu'}</strong></div>
            <button class="icon-action" data-action="open-settings" aria-label="Cài đặt giọng">⚙</button>
          </div>
          <div class="audio-controls">
            <button class="secondary-round" data-action="restart-speech" aria-label="Nghe từ đầu">↺<small>Từ đầu</small></button>
            <button class="secondary-round" data-action="rewind-speech" aria-label="Lùi ${state.settings.rewindSeconds} giây">−${state.settings.rewindSeconds}s<small>Lùi</small></button>
            <button class="play-button ${state.speaking ? 'is-speaking' : ''}" data-action="toggle-speech" aria-label="${state.speaking ? 'Tạm dừng' : 'Phát'}" ${state.audioLoading ? 'disabled' : ''}>
              ${state.audioLoading ? '◌' : state.speaking ? 'Ⅱ' : '▶'}
            </button>
            <button class="secondary-round" data-action="forward-speech" aria-label="Tiến ${state.settings.rewindSeconds} giây">+${state.settings.rewindSeconds}s<small>Tiến</small></button>
            <button class="secondary-round" data-action="next-item" aria-label="Câu sau">›<small>Câu sau</small></button>
          </div>
          <div class="audio-time" aria-live="polite">
            <span id="audioCurrentTime">${formatAudioTime(state.audioCurrentTime)}</span>
            <span>/</span>
            <span id="audioDuration">${state.audioDuration > 0 ? formatAudioTime(state.audioDuration) : '--:--'}</span>
          </div>
          ${state.audioMessage && ['error', 'missing'].includes(state.audioStatus) ? `<div class="audio-runtime-status audio-runtime-status--${escapeHtml(state.audioStatus || 'info')}" role="alert">${escapeHtml(state.audioMessage)}</div>` : ''}
          <label class="speech-position">
            <span>${state.audioPlayer ? 'Vị trí trong file audio' : `Vị trí gần đúng ${isPassage ? 'trong đoạn' : 'trong câu'}`}</span>
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
        </nav>` : `<nav class="practice-nav practice-nav--single"><button data-action="complete-session">Hoàn thành đoạn</button></nav>`}
      </main>
      ${bottomNav()}
      ${settingsSheet()}
    `;
  }

  function renderSlot(index, inputUnits, comparison, activeIndex, extraClass) {
    const actual = inputUnits[index] || '';
    let status = '';
    if (state.result) status = comparison.cells[index] && comparison.cells[index].correct ? 'is-correct' : actual ? 'is-wrong' : 'is-empty-wrong';
    const active = index === activeIndex ? 'is-active' : '';
    return `<span class="dictation-slot ${extraClass || ''} ${status} ${active}" lang="zh-Hans" data-slot-index="${index}">${escapeHtml(actual)}</span>`;
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
        const punctuationVisible = Boolean(state.showAnswer || state.result || (precedingUnits > 0 && typedInSegment >= precedingUnits));
        return `<span class="passage-punctuation ${punctuationVisible ? 'is-visible' : 'is-hidden'}">${escapeHtml(token.char)}</span>`;
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
    const activeIndex = inputUnits.length < units.length ? inputUnits.length : -1;
    const slots = item.isPassage
      ? renderPassageSlots(item, comparison, inputUnits, activeIndex)
      : renderShortSlots(item, comparison, inputUnits, activeIndex);
    const miniAudioLabel = state.audioLoading
      ? 'Đang tải'
      : state.speaking
        ? 'Tạm dừng'
        : state.paused
          ? 'Phát tiếp'
          : 'Phát';
    const miniAudioIcon = state.audioLoading ? '◌' : state.speaking ? 'Ⅱ' : '▶';

    return `
      <section class="dictation-card ${item.isPassage ? 'dictation-card--passage' : ''}">
        <div class="dictation-heading">
          <div><p class="eyebrow">Nhập chữ Hán</p><h2>${item.isPassage ? 'Chép lại đoạn vừa nghe' : 'Gõ lại câu vừa nghe'}</h2></div>
          <div class="dictation-heading__tools">
            <span class="dictation-count">${inputUnits.length}/${units.length}</span>
            <button
              type="button"
              class="dictation-audio-toggle ${state.speaking ? 'is-speaking' : ''} ${state.paused ? 'is-paused' : ''}"
              data-action="toggle-speech"
              tabindex="-1"
              aria-label="${miniAudioLabel}"
              ${state.audioLoading ? 'disabled' : ''}
            ><span aria-hidden="true">${miniAudioIcon}</span><small>${miniAudioLabel}</small></button>
          </div>
        </div>
        <div class="dictation-input-wrap ${item.isPassage ? 'dictation-input-wrap--passage' : ''}" data-action="focus-input">
          <div class="${item.isPassage ? 'passage-lines' : 'dictation-rows'}" aria-hidden="true">${slots}</div>
          <input id="dictationInput" class="dictation-ime-input" type="text" value="${escapeHtml(state.input)}" inputmode="text" enterkeyhint="done" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" lang="zh-Hans" aria-label="Nhập câu tiếng Trung" />
        </div>
        <p class="input-help">Gõ pinyin trên bàn phím Trung rồi chọn chữ. Dấu câu${item.isPassage ? ' và tên người nói' : ''} không cần nhập.</p>

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
      <section class="transcript-card ${item.isPassage ? 'transcript-card--passage' : ''}">
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
      else if (action === 'open-301') element.onclick = open301Library;
      else if (action === 'open-custom') element.onclick = openCustomLibrary;
      else if (action === 'open-review') element.onclick = openReview;
      else if (action === 'resume-last') element.onclick = resumeLastSession;
      else if (action === 'go-back') element.onclick = goBack;
      else if (action === 'start-mode') element.onclick = () => startPractice(element.dataset.mode, 0);
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
      else if (action === 'toggle-speech') {
        if (element.classList.contains('dictation-audio-toggle')) {
          // Không chuyển focus khỏi ô nhập: bàn phím iPhone tiếp tục mở khi tạm dừng/phát tiếp.
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
      else if (action === 'rewind-speech') element.onclick = rewindSpeech;
      else if (action === 'forward-speech') element.onclick = forwardSpeech;
      else if (action === 'previous-item') element.onclick = () => moveItem(-1);
      else if (action === 'next-item') element.onclick = () => moveItem(1);
      else if (action === 'set-rate') element.onclick = () => setRate(Number(element.dataset.rate));
      else if (action === 'switch-current-mode') element.onclick = () => switchCurrentMode(element.dataset.mode);
      else if (action === 'focus-input') element.onclick = focusDictationInput;
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
      const next = Core.sanitizeDictationAnswer(input.value, item.text, max);
      if (next === state.input) {
        moveCaretToEnd(input);
        return false;
      }

      clearAutoAdvance();
      state.input = next;
      state.result = null;
      state.showAnswer = false;
      state.autoSuggestedRating = '';
      updateDictationDom({ keepNativeValue: true });
      moveCaretToEnd(input);
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
    moveCaretToEnd(input);

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
    input.onfocus = () => moveCaretToEnd(input);
    input.onclick = () => moveCaretToEnd(input);

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
    const nextInput = Core.appendDictationInput(state.input, value, item.text, max);
    if (nextInput === state.input) return;

    clearAutoAdvance();
    state.input = nextInput;
    state.result = null;
    state.showAnswer = false;
    state.autoSuggestedRating = '';

    // Không render lại toàn bộ màn hình sau mỗi chữ. Việc thay input DOM làm
    // bàn phím iPhone mất focus, nên người dùng chỉ nhập được một chữ.
    updateDictationDom();
    maybeAutoCheckCompleteInput();
  }

  function deleteLastDictationUnit() {
    if (!state.input) return;
    clearAutoAdvance();
    state.input = Core.removeLastAnswerUnit(state.input);
    state.result = null;
    state.showAnswer = false;
    state.autoSuggestedRating = '';
    state.autoCheckSignature = '';
    updateDictationDom();
  }

  function updateDictationDom(options) {
    const item = currentItem();
    const container = document.querySelector(item && item.isPassage ? '.passage-lines' : '.dictation-rows');
    const countElement = document.querySelector('.dictation-heading > span');
    const input = document.getElementById('dictationInput');
    if (!item || !container || !input) return;

    const units = Core.answerUnits(item.text);
    const inputUnits = Core.answerUnits(state.input);
    const activeIndex = inputUnits.length < units.length ? inputUnits.length : -1;
    const comparison = Core.compareAnswers(state.input, item.text);
    container.innerHTML = item.isPassage
      ? renderPassageSlots(item, comparison, inputUnits, activeIndex)
      : renderShortSlots(item, comparison, inputUnits, activeIndex);

    if (countElement) countElement.textContent = `${inputUnits.length}/${units.length}`;

    // Kết quả cũ không còn hợp lệ sau khi người dùng sửa đáp án.
    document.querySelector('.result-card')?.remove();
    document.querySelector('.result-answer')?.remove();
    document.querySelector('.result-followup')?.remove();
    document.querySelector('.rating-row')?.remove();
    document.querySelector('.answer-card')?.remove();

    const configured = options || {};
    if (!configured.keepNativeValue && !input.dataset.composing) input.value = state.input;
    moveCaretToEnd(input);
  }

  function focusDictationInput() {
    requestAnimationFrame(() => {
      const input = document.getElementById('dictationInput');
      if (!input) return;
      if (!input.dataset.composing) input.value = state.input;
      input.focus({ preventScroll: true });
      moveCaretToEnd(input);
    });
  }

  function moveCaretToEnd(input) {
    try {
      const length = input.value.length;
      input.setSelectionRange(length, length);
    } catch (error) {
      // Một số bàn phím mobile không hỗ trợ setSelectionRange trong lúc composition.
    }
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

    if (state.result.isCorrect && state.settings.autoRate) {
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
      activity: isTranscript ? 'listening-transcript' : item.isPassage ? 'listening-passage-dictation' : 'listening-dictation',
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
    const item = currentItem();
    if (!item) return;
    state.usedHint = true;
    const max = Core.answerUnits(item.text).length;
    clearAutoAdvance();
    state.input = Core.appendDictationInput(state.input, text, item.text, max);
    state.result = null;
    state.showAnswer = false;
    state.autoSuggestedRating = '';
    updateDictationDom();
    focusDictationInput();
    maybeAutoCheckCompleteInput();
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
      activity: isTranscript ? 'listening-transcript' : item.isPassage ? 'listening-passage-dictation' : 'listening-dictation',
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
    rememberSession();
    prepareNextItem();
    render();
    focusDictationInput();
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
    state.mode = retryItems[0] && retryItems[0].isPassage ? 'passage' : 'dictation';
    state.currentIndex = 0;
    state.sessionName = retryItems[0] && retryItems[0].isPassage ? 'Chép lại đoạn' : 'Chép lại câu sai';
    state.sessionWrongItems = [];
    state.sessionCheckedIds = [];
    state.sessionCorrectIds = [];
    state.sessionAnswerIds = [];
    resetCurrentAnswer();
    state.screen = 'practice';
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
      state.screen = 'mode';
      stopSpeech();
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
      if (state.source === '301') state.screen = 'lessons301';
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
      if (button.classList.contains('dictation-audio-toggle')) {
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
    const slider = document.getElementById('speechPosition');
    if (current) current.textContent = formatAudioTime(state.audioCurrentTime);
    if (duration) duration.textContent = state.audioDuration > 0 ? formatAudioTime(state.audioDuration) : '--:--';
    if (slider && state.audioPlayer) {
      slider.max = String(state.audioDuration || 0);
      slider.step = '0.1';
      slider.value = String(state.audioCurrentTime || 0);
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

  function resumeFileAudio() {
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
        state.audioStatus = 'error';
        state.audioMessage = `Không phát được MP3: ${mediaErrorText(error)}`;
        render();
      });
    }
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

    utterance.onboundary = (event) => {
      if (token !== state.speechToken) return;
      if (Number.isFinite(event.charIndex)) {
        state.speechCharIndex = Math.min(text.length, startIndex + event.charIndex);
        const slider = document.getElementById('speechPosition');
        if (slider) slider.value = String(state.speechCharIndex);
      }
    };
    utterance.onend = () => {
      if (token !== state.speechToken) return;
      state.speaking = false;
      state.paused = false;
      state.speechCharIndex = text.length;
      render();
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

(() => {
  'use strict';

  const Core = window.ListeningCore;
  const app = document.getElementById('app');
  const SETTINGS_KEY = 'tieng-trung-listening-settings-v1';
  const PROGRESS_KEY = 'tieng-trung-listening-progress-v1';
  const CUSTOM_KEY = 'tieng-trung-listening-custom-v1';
  const LAST_SESSION_KEY = 'tieng-trung-listening-last-session-v1';

  const DEFAULT_SETTINGS = {
    voiceSource: 'device',
    voiceGender: 'auto',
    voiceURI: '',
    rate: 1,
    rewindSeconds: 3,
    showPinyin: true,
    showMeaning: true
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
    settings: loadJson(SETTINGS_KEY, DEFAULT_SETTINGS),
    progress: loadJson(PROGRESS_KEY, {}),
    customGroups: loadJson(CUSTOM_KEY, []),
    preparedNext: null,
    sessionWrongItems: [],
    sessionCheckedIds: [],
    sessionCorrectIds: [],
    sessionAnswerIds: [],
    sessionName: '',
    error: ''
  };

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
    if (state.source === 'custom') return state.lesson && state.lesson.title || 'Bộ tự tạo';
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

  function saveCustomGroups() {
    saveJson(CUSTOM_KEY, state.customGroups);
  }

  function setScreen(screen) {
    stopSpeech();
    state.screen = screen;
    state.error = '';
    state.settingsOpen = false;
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
    else if (state.screen === 'mode') renderModeChoice();
    else if (state.screen === 'preview') renderContentPreview();
    else if (state.screen === 'practice') renderPractice();
    else if (state.screen === 'complete') renderComplete();
    else renderHome();
    bindCommonEvents();
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

  function renderCustomLibrary() {
    app.innerHTML = `
      ${pageHeader('Bộ tự tạo', 'Nhập JSON chứa chữ Hán, pinyin và nghĩa', true)}
      <main class="listen-main">
        <section class="import-card">
          <div>
            <p class="eyebrow">Nhập nhanh</p>
            <h2>Thêm bộ câu để luyện nghe</h2>
            <p>Hỗ trợ các trường thường gặp như <code>zh</code>, <code>text</code>, <code>chinese</code>, <code>pinyin</code>, <code>meaning</code> hoặc <code>vi</code>.</p>
          </div>
          <label class="primary-button file-button">
            Chọn file JSON
            <input id="customFileInput" type="file" accept="application/json,.json" hidden />
          </label>
        </section>

        ${state.error ? errorCard(state.error) : ''}
        <section class="section-block">
          <div class="section-heading"><div><p class="eyebrow">Đã nhập</p><h2>Các bộ tự tạo</h2></div></div>
          <div class="custom-list">
            ${state.customGroups.length ? state.customGroups.map(renderCustomGroup).join('') : emptyCard('Chưa có bộ tự tạo', 'Chọn một file JSON để bắt đầu.')}
          </div>
        </section>
      </main>
      ${bottomNav()}
      ${settingsSheet()}
    `;
  }

  function renderCustomGroup(group) {
    const enabledCount = (group.items || []).filter((item) => item.listenEnabled !== false).length;
    return `
      <article class="custom-card">
        <button class="custom-card-main" data-action="open-custom-group" data-group-id="${escapeHtml(group.id)}">
          <span class="source-icon">自</span>
          <span><strong>${escapeHtml(group.title)}</strong><small>${enabledCount}/${group.items.length} câu được dùng trong luyện nghe</small></span>
          <b>›</b>
        </button>
        <div class="custom-card-actions">
          <button data-action="manage-custom-group" data-group-id="${escapeHtml(group.id)}">Chọn câu</button>
          <button class="danger-text" data-action="delete-custom-group" data-group-id="${escapeHtml(group.id)}">Xóa</button>
        </div>
        ${group.manageOpen ? renderCustomItemManager(group) : ''}
      </article>
    `;
  }

  function renderCustomItemManager(group) {
    return `<div class="custom-item-manager">
      ${(group.items || []).map((item, index) => `
        <label class="custom-item-row">
          <input type="checkbox" data-action="toggle-custom-item" data-group-id="${escapeHtml(group.id)}" data-item-index="${index}" ${item.listenEnabled === false ? '' : 'checked'} />
          <span><strong lang="zh-Hans">${escapeHtml(item.text)}</strong><small>${escapeHtml(item.pinyin || item.meaning || '')}</small></span>
        </label>
      `).join('')}
    </div>`;
  }

  async function importCustomFile(file) {
    state.error = '';
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const id = `custom-${Date.now().toString(36)}`;
      const title = String(data.title || data.name || file.name.replace(/\.json$/i, '') || 'Bộ tự tạo');
      const items = Core.extractCustomItems(data, { sourceType: 'custom', sourceId: id, sourceTitle: title });
      if (!items.length) throw new Error('Không tìm thấy câu có chữ Hán trong file.');
      state.customGroups.unshift({ id, title, importedAt: new Date().toISOString(), items, manageOpen: false });
      saveCustomGroups();
    } catch (error) {
      state.error = `Không nhập được JSON: ${error.message}`;
    }
    render();
  }

  function openCustomGroup(groupId) {
    const group = state.customGroups.find((entry) => entry.id === groupId);
    if (!group) return;
    const enabled = (group.items || []).filter((item) => item.listenEnabled !== false);
    if (!enabled.length) {
      state.error = 'Bộ này chưa có câu nào được bật cho luyện nghe.';
      render();
      return;
    }
    state.source = 'custom';
    state.lesson = group;
    state.lessonData = null;
    state.practiceItems = null;
    state.items = enabled.map((item) => Object.assign({}, item, {
      sourceType: 'custom', sourceId: group.id, sourceTitle: group.title
    }));
    state.vocabulary = [];
    state.screen = 'mode';
    state.error = '';
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
    state.input = '';
    state.result = null;
    state.hint = null;
    state.showAnswer = false;
    state.usedHint = false;
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
      const group = state.customGroups.find((entry) => entry.id === session.lessonId);
      if (group) {
        openCustomGroup(group.id);
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
            <div><p class="eyebrow">${isPassage ? 'Đoạn nghe' : `Câu ${progress}`}</p><strong>${state.speaking ? 'Đang đọc...' : state.paused ? 'Đã tạm dừng' : isPassage ? 'Nghe toàn đoạn' : 'Nghe câu'}</strong></div>
            <button class="icon-action" data-action="open-settings" aria-label="Cài đặt giọng">⚙</button>
          </div>
          <div class="audio-controls">
            <button class="secondary-round" data-action="restart-speech" aria-label="Nghe từ đầu">↺<small>Từ đầu</small></button>
            <button class="secondary-round" data-action="rewind-speech" aria-label="Lùi ${state.settings.rewindSeconds} giây">−${state.settings.rewindSeconds}s<small>Lùi</small></button>
            <button class="play-button ${state.speaking ? 'is-speaking' : ''}" data-action="toggle-speech" aria-label="${state.speaking ? 'Tạm dừng' : 'Phát'}">
              ${state.speaking ? 'Ⅱ' : '▶'}
            </button>
            ${isPassage
              ? `<button class="secondary-round" data-action="forward-speech" aria-label="Tiến ${state.settings.rewindSeconds} giây">+${state.settings.rewindSeconds}s<small>Tiến</small></button>`
              : `<button class="secondary-round" data-action="next-item" aria-label="Câu sau">›<small>Câu sau</small></button>`}
          </div>
          <label class="speech-position">
            <span>Vị trí gần đúng ${isPassage ? 'trong đoạn' : 'trong câu'}</span>
            <input id="speechPosition" type="range" min="0" max="${Math.max(1, speechText.length)}" value="${Math.min(speechText.length, state.speechCharIndex)}" />
          </label>
          <div class="speed-row" aria-label="Tốc độ đọc">
            ${[0.75, 1, 1.25].map((rate) => `<button data-action="set-rate" data-rate="${rate}" class="${Number(state.settings.rate) === rate ? 'active' : ''}">${rate}×</button>`).join('')}
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

    return `
      <section class="dictation-card ${item.isPassage ? 'dictation-card--passage' : ''}">
        <div class="dictation-heading">
          <div><p class="eyebrow">Nhập chữ Hán</p><h2>${item.isPassage ? 'Chép lại đoạn vừa nghe' : 'Gõ lại câu vừa nghe'}</h2></div>
          <span>${inputUnits.length}/${units.length}</span>
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
    return `
      <section class="result-card ${comparison.isCorrect ? 'is-correct' : 'is-wrong'}">
        <div><strong>${comparison.isCorrect ? 'Chính xác' : `Đúng ${comparison.correctCount}/${comparison.total} chữ`}</strong><span>${comparison.isCorrect ? 'Bạn có thể nghe lại hoặc chuyển tiếp.' : 'Các chữ sai đã được đánh dấu. Bạn có thể sửa trực tiếp.'}</span></div>
        ${!comparison.isCorrect ? `<button data-action="focus-input">Sửa tiếp</button>` : ''}
      </section>
      ${!comparison.isCorrect && !item.isPassage ? `<div class="result-answer"><span>Đáp án</span><strong lang="zh-Hans">${escapeHtml(item.text)}</strong></div>` : ''}
      <div class="result-followup">
        <button data-action="restart-speech">Nghe lại</button>
        <button data-action="switch-current-mode" data-mode="${item.isPassage ? 'passage-transcript' : 'transcript'}">Xem transcript</button>
      </div>
      <div class="rating-row" aria-label="Tự đánh giá">
        <button data-action="rate-item" data-rating="easy" class="${ratingEntry && ratingEntry.rating === 'easy' ? 'active' : ''}">Dễ</button>
        <button data-action="rate-item" data-rating="review" class="${ratingEntry && ratingEntry.rating === 'review' ? 'active' : ''}">Ôn</button>
        <button data-action="rate-item" data-rating="hard" class="${ratingEntry && ratingEntry.rating === 'hard' ? 'active' : ''}">Khó</button>
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
        <a href="../../index.html#lookup" class="listen-bottom-nav__item">
          <span aria-hidden="true">⌕</span><small>Tra</small>
        </a>
        <a href="../../index.html#learn" class="listen-bottom-nav__item">
          <span aria-hidden="true">学</span><small>Học</small>
        </a>
        <a href="../../index.html#menu" class="listen-bottom-nav__item">
          <span aria-hidden="true">☰</span><small>Menu</small>
        </a>
      </nav>
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
    return `
      <div class="sheet-backdrop" data-action="close-settings"></div>
      <section class="settings-sheet" role="dialog" aria-modal="true" aria-label="Cài đặt giọng đọc">
        <div class="sheet-handle"></div>
        <div class="sheet-head"><div><p class="eyebrow">Giọng thiết bị</p><h2>Cài đặt nghe</h2></div><button data-action="close-settings">×</button></div>
        <label class="setting-field"><span>Ngôn ngữ</span><select disabled><option>Phổ thông Trung Quốc · zh-CN</option></select></label>
        <fieldset class="setting-field"><legend>Ưu tiên giọng</legend><div class="segmented">
          ${[['auto', 'Tự động'], ['female', 'Nữ'], ['male', 'Nam']].map(([value, label]) => `<button data-action="set-gender" data-gender="${value}" class="${state.settings.voiceGender === value ? 'active' : ''}">${label}</button>`).join('')}
        </div></fieldset>
        <label class="setting-field"><span>Chọn giọng cụ thể</span><select id="voiceSelect">
          <option value="">Tự chọn theo ưu tiên trên</option>
          ${voices.map((voice) => `<option value="${escapeHtml(voice.voiceURI || voice.name)}" ${state.settings.voiceURI === (voice.voiceURI || voice.name) ? 'selected' : ''}>${escapeHtml(voice.name)} · ${escapeHtml(voice.lang || '')}</option>`).join('')}
        </select></label>
        <fieldset class="setting-field"><legend>Lùi khi nghe lại đoạn</legend><div class="segmented">
          ${[3, 5].map((seconds) => `<button data-action="set-rewind" data-seconds="${seconds}" class="${Number(state.settings.rewindSeconds) === seconds ? 'active' : ''}">${seconds} giây</button>`).join('')}
        </div></fieldset>
        <button class="primary-button full-width" data-action="close-settings">Xong</button>
      </section>
    `;
  }

  function bindCommonEvents() {
    app.querySelectorAll('[data-action]').forEach((element) => {
      const action = element.dataset.action;
      if (action === 'open-settings') element.onclick = () => { state.settingsOpen = true; render(); };
      else if (action === 'close-settings') element.onclick = () => { state.settingsOpen = false; render(); };
      else if (action === 'open-301') element.onclick = open301Library;
      else if (action === 'open-custom') element.onclick = () => setScreen('custom');
      else if (action === 'open-review') element.onclick = openReview;
      else if (action === 'resume-last') element.onclick = resumeLastSession;
      else if (action === 'go-back') element.onclick = goBack;
      else if (action === 'start-mode') element.onclick = () => startPractice(element.dataset.mode, 0);
      else if (action === 'open-content-preview') element.onclick = openContentPreview;
      else if (action === 'open-preview-item') element.onclick = () => startPractice('transcript', Number(element.dataset.index) || 0);
      else if (action === 'open-custom-group') element.onclick = () => openCustomGroup(element.dataset.groupId);
      else if (action === 'manage-custom-group') element.onclick = () => toggleCustomManager(element.dataset.groupId);
      else if (action === 'delete-custom-group') element.onclick = () => deleteCustomGroup(element.dataset.groupId);
      else if (action === 'toggle-speech') element.onclick = toggleSpeech;
      else if (action === 'restart-speech') element.onclick = () => speakFrom(0);
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
      else if (action === 'set-rewind') element.onclick = () => setRewind(Number(element.dataset.seconds));
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

    const fileInput = document.getElementById('customFileInput');
    if (fileInput) fileInput.onchange = () => { if (fileInput.files && fileInput.files[0]) importCustomFile(fileInput.files[0]); };

    app.querySelectorAll('[data-action="toggle-custom-item"]').forEach((input) => {
      input.onchange = () => toggleCustomItem(input.dataset.groupId, Number(input.dataset.itemIndex), input.checked);
    });

    const input = document.getElementById('dictationInput');
    if (input) bindDictationInput(input);

    const position = document.getElementById('speechPosition');
    if (position) {
      position.onchange = () => speakFrom(Number(position.value));
      position.oninput = () => { state.speechCharIndex = Number(position.value); };
    }

    const voiceSelect = document.getElementById('voiceSelect');
    if (voiceSelect) {
      voiceSelect.onchange = () => {
        state.settings.voiceURI = voiceSelect.value;
        saveSettings();
        stopSpeech();
      };
    }

    const pinyinToggle = app.querySelector('[data-action="toggle-pinyin"]');
    if (pinyinToggle) pinyinToggle.onchange = () => { state.settings.showPinyin = pinyinToggle.checked; saveSettings(); render(); };
    const meaningToggle = app.querySelector('[data-action="toggle-meaning"]');
    if (meaningToggle) meaningToggle.onchange = () => { state.settings.showMeaning = meaningToggle.checked; saveSettings(); render(); };
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

      state.input = next;
      state.result = null;
      state.showAnswer = false;
      updateDictationDom({ keepNativeValue: true });
      moveCaretToEnd(input);
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

    state.input = nextInput;
    state.result = null;
    state.showAnswer = false;

    // Không render lại toàn bộ màn hình sau mỗi chữ. Việc thay input DOM làm
    // bàn phím iPhone mất focus, nên người dùng chỉ nhập được một chữ.
    updateDictationDom();
  }

  function deleteLastDictationUnit() {
    if (!state.input) return;
    state.input = Core.removeLastAnswerUnit(state.input);
    state.result = null;
    state.showAnswer = false;
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

  function checkAnswer() {
    const item = currentItem();
    if (!item) return;
    state.result = Core.compareAnswers(state.input, item.text);
    const key = itemSessionKey(item);
    pushUniqueValue(state.sessionCheckedIds, key);
    if (state.result.isCorrect) pushUniqueValue(state.sessionCorrectIds, key);
    else markSessionWrong(item);
    updateAttemptProgress(item);
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
    state.showAnswer = !state.showAnswer;
    if (state.showAnswer) markSessionAnswer(item);
    render();
    if (!state.showAnswer) focusDictationInput();
  }

  function fillHintText(text) {
    const item = currentItem();
    if (!item) return;
    state.usedHint = true;
    const max = Core.answerUnits(item.text).length;
    state.input = Core.appendDictationInput(state.input, text, item.text, max);
    state.result = null;
    state.showAnswer = false;
    updateDictationDom();
    focusDictationInput();
  }

  function switchCurrentMode(mode) {
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

  function rateItem(rating) {
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
    render();
  }

  function moveItem(delta) {
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
    stopSpeech();
    state.practiceItems = null;
    state.sessionName = '';
    state.screen = 'mode';
    render();
  }


  function toggleCustomManager(groupId) {
    const group = state.customGroups.find((entry) => entry.id === groupId);
    if (!group) return;
    group.manageOpen = !group.manageOpen;
    saveCustomGroups();
    render();
  }

  function toggleCustomItem(groupId, index, enabled) {
    const group = state.customGroups.find((entry) => entry.id === groupId);
    if (!group || !group.items[index]) return;
    group.items[index].listenEnabled = enabled;
    saveCustomGroups();
  }

  function deleteCustomGroup(groupId) {
    const group = state.customGroups.find((entry) => entry.id === groupId);
    if (!group) return;
    if (!window.confirm(`Xóa bộ “${group.title}” khỏi tab Nghe?`)) return;
    state.customGroups = state.customGroups.filter((entry) => entry.id !== groupId);
    saveCustomGroups();
    render();
  }

  function goBack() {
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
      state.screen = state.source === '301' ? 'lessons301' : state.source === 'custom' ? 'custom' : 'home';
      render();
      return;
    }
    setScreen('home');
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
    if (state.speaking || state.paused) speakFrom(state.speechCharIndex || 0);
    else render();
  }

  function toggleSpeech() {
    if (!('speechSynthesis' in window)) {
      state.error = 'Thiết bị không hỗ trợ speechSynthesis.';
      render();
      return;
    }
    if (state.speaking) {
      pauseSpeech();
      return;
    }
    if (state.paused) {
      speakFrom(state.speechCharIndex || state.speechStartIndex || 0);
      return;
    }
    const item = currentItem();
    const speechText = speechTextFor(item);
    const start = item && state.speechCharIndex >= speechText.length ? 0 : (state.speechCharIndex || 0);
    speakFrom(start);
  }

  function pauseSpeech() {
    if (!('speechSynthesis' in window) || !state.speaking) return;
    window.speechSynthesis.cancel();
    state.speaking = false;
    state.paused = true;
    state.speechToken += 1;
    render();
  }

  function stopSpeech() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    state.speaking = false;
    state.paused = false;
    state.speechToken += 1;
  }

  function rewindSpeech() {
    const item = currentItem();
    if (!item) return;
    const text = speechTextFor(item);
    const current = state.speechCharIndex > 0 ? state.speechCharIndex : 0;
    const start = Core.findRewindStart(text, current, state.settings.rewindSeconds, state.settings.rate);
    speakFrom(start);
  }

  function forwardSpeech() {
    const item = currentItem();
    if (!item) return;
    const text = speechTextFor(item);
    const speed = Math.max(0.5, Number(state.settings.rate) || 1);
    const advance = Math.max(1, Math.round((Number(state.settings.rewindSeconds) || 3) * 3.6 * speed));
    speakFrom(Math.min(text.length - 1, (state.speechCharIndex || 0) + advance));
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

  window.addEventListener('pagehide', stopSpeech);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseSpeech();
  });

  render();
})();

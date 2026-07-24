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

  function currentItem() {
    return state.items[state.currentIndex] || null;
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
    else if (state.screen === 'practice') renderPractice();
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
        <span><strong>${escapeHtml(lesson.title_zh || lesson.title || `Bài ${lesson.lesson_no}`)}</strong><small>Chép chính tả hoặc nghe có transcript</small></span>
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
    state.vocabulary = [];
    render();
    try {
      const response = await fetch(`../../lessons-301-v2/${lesson.data}`);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const data = await response.json();
      state.lessonData = data;
      state.items = Core.extract301Items(data, lesson);
      state.vocabulary = Array.isArray(data.vocabulary) ? data.vocabulary : [];
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
          <span><strong>${escapeHtml(item.text)}</strong><small>${escapeHtml(item.pinyin || item.meaning || '')}</small></span>
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
          <section class="mode-grid">
            <button class="mode-card" data-action="start-mode" data-mode="dictation">
              <span class="mode-icon">听写</span>
              <strong>Chép chính tả</strong>
              <small>Ẩn transcript, nghe rồi gõ lại từng chữ Hán.</small>
            </button>
            <button class="mode-card" data-action="start-mode" data-mode="transcript">
              <span class="mode-icon">文</span>
              <strong>Có transcript</strong>
              <small>Nghe cùng chữ Hán, pinyin và nghĩa tiếng Việt.</small>
            </button>
          </section>
          <section class="preview-card">
            <p class="eyebrow">Câu đầu tiên</p>
            <strong>${escapeHtml(state.items[0] && state.items[0].text || '')}</strong>
            <span>${escapeHtml(state.items[0] && state.items[0].pinyin || '')}</span>
          </section>
        `}
      </main>
      ${bottomNav()}
      ${settingsSheet()}
    `;
  }

  function startPractice(mode, index) {
    state.mode = mode;
    state.currentIndex = Math.max(0, Math.min(Number(index) || 0, state.items.length - 1));
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
    state.vocabulary = [];
    state.screen = 'mode';
    state.error = '';
    render();
  }

  function renderPractice() {
    const item = currentItem();
    if (!item) {
      setScreen('home');
      return;
    }
    const units = Core.answerUnits(item.text);
    const progress = `${state.currentIndex + 1}/${state.items.length}`;
    app.innerHTML = `
      ${pageHeader(sessionTitle(), `${state.mode === 'dictation' ? 'Chép chính tả' : 'Có transcript'} · ${progress}`, true)}
      <main class="listen-main practice-main">
        <section class="practice-progress" aria-label="Tiến độ">
          <span style="width:${((state.currentIndex + 1) / state.items.length) * 100}%"></span>
        </section>

        <section class="audio-card">
          <div class="audio-head">
            <div><p class="eyebrow">Câu ${progress}</p><strong>${state.speaking ? 'Đang đọc...' : state.paused ? 'Đã tạm dừng' : 'Nghe câu'}</strong></div>
            <button class="icon-action" data-action="open-settings" aria-label="Cài đặt giọng">⚙</button>
          </div>
          <div class="audio-controls">
            <button class="secondary-round" data-action="restart-speech" aria-label="Nghe từ đầu">↺<small>Từ đầu</small></button>
            <button class="secondary-round" data-action="rewind-speech" aria-label="Lùi ${state.settings.rewindSeconds} giây">−${state.settings.rewindSeconds}s<small>Lùi</small></button>
            <button class="play-button ${state.speaking ? 'is-speaking' : ''}" data-action="toggle-speech" aria-label="${state.speaking ? 'Tạm dừng' : 'Phát'}">
              ${state.speaking ? 'Ⅱ' : state.paused ? '▶' : '▶'}
            </button>
            <button class="secondary-round" data-action="next-item" aria-label="Câu sau">›<small>Câu sau</small></button>
          </div>
          <label class="speech-position">
            <span>Vị trí gần đúng trong câu</span>
            <input id="speechPosition" type="range" min="0" max="${Math.max(1, item.text.length)}" value="${Math.min(item.text.length, state.speechCharIndex)}" />
          </label>
          <div class="speed-row" aria-label="Tốc độ đọc">
            ${[0.75, 1, 1.25].map((rate) => `<button data-action="set-rate" data-rate="${rate}" class="${Number(state.settings.rate) === rate ? 'active' : ''}">${rate}×</button>`).join('')}
          </div>
          <p class="device-note">Giọng thiết bị không tạo file audio nên thanh tua và lùi 3/5 giây chỉ hoạt động gần đúng theo vị trí chữ.</p>
        </section>

        ${state.mode === 'dictation' ? renderDictation(item, units) : renderTranscript(item)}

        <nav class="practice-nav">
          <button data-action="previous-item" ${state.currentIndex === 0 ? 'disabled' : ''}>← Câu trước</button>
          <button data-action="next-item" ${state.currentIndex >= state.items.length - 1 ? 'disabled' : ''}>Câu sau →</button>
        </nav>
      </main>
      ${bottomNav()}
      ${settingsSheet()}
    `;
  }

  function renderDictation(item, units) {
    const comparison = state.result || Core.compareAnswers(state.input, item.text);
    const inputUnits = Core.answerUnits(state.input);
    const activeIndex = inputUnits.length < units.length ? inputUnits.length : -1;
    const rows = Core.splitIntoRows(units, 10);
    let flatIndex = 0;
    const slots = rows.map((row) => {
      const rowHtml = row.map(() => {
        const index = flatIndex++;
        const actual = inputUnits[index] || '';
        let status = '';
        if (state.result) status = comparison.cells[index] && comparison.cells[index].correct ? 'is-correct' : actual ? 'is-wrong' : 'is-empty-wrong';
        const active = index === activeIndex ? 'is-active' : '';
        return `<span class="dictation-slot ${status} ${active}" data-slot-index="${index}">${escapeHtml(actual)}</span>`;
      }).join('');
      return `<div class="dictation-row" style="--slot-count:${row.length}">${rowHtml}</div>`;
    }).join('');

    return `
      <section class="dictation-card">
        <div class="dictation-heading">
          <div><p class="eyebrow">Nhập chữ Hán</p><h2>Gõ lại câu vừa nghe</h2></div>
          <span>${Core.answerUnits(state.input).length}/${units.length}</span>
        </div>
        <div class="dictation-input-wrap" data-action="focus-input">
          <div class="dictation-rows" aria-hidden="true">${slots}</div>
          <input id="dictationInput" class="dictation-ime-input" type="text" value="" inputmode="text" enterkeyhint="done" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Nhập câu tiếng Trung" />
        </div>
        <p class="input-help">Gõ pinyin trên bàn phím Trung, chọn một hoặc nhiều chữ; ứng dụng tự đưa lần lượt vào các ô.</p>

        <div class="dictation-actions">
          <button class="primary-button" data-action="check-answer">Kiểm tra</button>
          <button class="secondary-button" data-action="show-hint">Gợi ý chữ đang nhập</button>
          <button class="text-button" data-action="toggle-answer">${state.showAnswer ? 'Ẩn đáp án' : 'Xem đáp án'}</button>
        </div>

        ${state.hint ? renderHint(item) : ''}
        ${state.showAnswer ? renderAnswer(item) : ''}
        ${state.result ? renderResult(item, comparison) : ''}
      </section>
    `;
  }

  function renderHint(item) {
    const index = Math.min(Core.answerUnits(state.input).length, Math.max(0, Core.answerUnits(item.text).length - 1));
    const char = Core.answerUnits(item.text)[index] || '';
    const pinyin = Core.getCharacterPinyin(item, index);
    const word = Core.findVocabularyHint(item, index, state.vocabulary);
    const wordOpen = state.hint && state.hint.wordOpen;
    return `
      <aside class="hint-card">
        <p class="eyebrow">Gợi ý vị trí ${index + 1}</p>
        <div class="hint-character"><strong>${escapeHtml(char)}</strong><span>${escapeHtml(pinyin || item.pinyin || 'Chưa có pinyin')}</span></div>
        <div class="hint-actions">
          <button data-action="fill-hint-char" data-char="${escapeHtml(char)}">Điền chữ này</button>
          ${word ? `<button data-action="toggle-word-hint">${wordOpen ? 'Ẩn cả từ' : 'Xem cả từ'}</button>` : ''}
        </div>
        ${word && wordOpen ? `<div class="word-hint"><strong>${escapeHtml(word.text)}</strong><span>${escapeHtml(word.pinyin || '')}</span><button data-action="fill-hint-word" data-word="${escapeHtml(word.text)}">Điền cả từ</button></div>` : ''}
      </aside>
    `;
  }

  function renderAnswer(item) {
    return `<aside class="answer-card"><p class="eyebrow">Đáp án</p><strong>${escapeHtml(item.text)}</strong>${item.pinyin ? `<span>${escapeHtml(item.pinyin)}</span>` : ''}${item.meaning ? `<small>${escapeHtml(item.meaning)}</small>` : ''}</aside>`;
  }

  function renderResult(item, comparison) {
    const ratingEntry = state.progress[progressKey(item, state.mode)];
    return `
      <section class="result-card ${comparison.isCorrect ? 'is-correct' : 'is-wrong'}">
        <div><strong>${comparison.isCorrect ? 'Đúng toàn bộ' : `Đúng ${comparison.correctCount}/${comparison.total} chữ`}</strong><span>${state.usedHint ? 'Đã dùng gợi ý trong lượt này' : 'Không dùng gợi ý'}</span></div>
        ${!comparison.isCorrect ? `<button data-action="focus-input">Sửa tiếp</button>` : ''}
      </section>
      <div class="rating-row" aria-label="Tự đánh giá">
        <button data-action="rate-item" data-rating="easy" class="${ratingEntry && ratingEntry.rating === 'easy' ? 'active' : ''}">Dễ</button>
        <button data-action="rate-item" data-rating="review" class="${ratingEntry && ratingEntry.rating === 'review' ? 'active' : ''}">Ôn</button>
        <button data-action="rate-item" data-rating="hard" class="${ratingEntry && ratingEntry.rating === 'hard' ? 'active' : ''}">Khó</button>
      </div>
    `;
  }

  function renderTranscript(item) {
    const ratingEntry = state.progress[progressKey(item, state.mode)];
    return `
      <section class="transcript-card">
        <p class="eyebrow">Transcript</p>
        <div class="transcript-zh">${escapeHtml(item.text)}</div>
        ${state.settings.showPinyin && item.pinyin ? `<div class="transcript-pinyin">${escapeHtml(item.pinyin)}</div>` : ''}
        ${state.settings.showMeaning && item.meaning ? `<div class="transcript-meaning">${escapeHtml(item.meaning)}</div>` : ''}
        <div class="transcript-toggles">
          <label><input type="checkbox" data-action="toggle-pinyin" ${state.settings.showPinyin ? 'checked' : ''} /> Pinyin</label>
          <label><input type="checkbox" data-action="toggle-meaning" ${state.settings.showMeaning ? 'checked' : ''} /> Nghĩa</label>
        </div>
        <div class="rating-row" aria-label="Tự đánh giá">
          <button data-action="rate-item" data-rating="easy" class="${ratingEntry && ratingEntry.rating === 'easy' ? 'active' : ''}">Dễ</button>
          <button data-action="rate-item" data-rating="review" class="${ratingEntry && ratingEntry.rating === 'review' ? 'active' : ''}">Ôn</button>
          <button data-action="rate-item" data-rating="hard" class="${ratingEntry && ratingEntry.rating === 'hard' ? 'active' : ''}">Khó</button>
        </div>
      </section>
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
          <div class="listen-header-title"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(subtitle || '')}</small></div>
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
      else if (action === 'open-custom-group') element.onclick = () => openCustomGroup(element.dataset.groupId);
      else if (action === 'manage-custom-group') element.onclick = () => toggleCustomManager(element.dataset.groupId);
      else if (action === 'delete-custom-group') element.onclick = () => deleteCustomGroup(element.dataset.groupId);
      else if (action === 'toggle-speech') element.onclick = toggleSpeech;
      else if (action === 'restart-speech') element.onclick = () => speakFrom(0);
      else if (action === 'rewind-speech') element.onclick = rewindSpeech;
      else if (action === 'previous-item') element.onclick = () => moveItem(-1);
      else if (action === 'next-item') element.onclick = () => moveItem(1);
      else if (action === 'set-rate') element.onclick = () => setRate(Number(element.dataset.rate));
      else if (action === 'focus-input') element.onclick = focusDictationInput;
      else if (action === 'check-answer') element.onclick = checkAnswer;
      else if (action === 'show-hint') element.onclick = showHint;
      else if (action === 'toggle-answer') element.onclick = () => { state.showAnswer = !state.showAnswer; renderPractice(); bindCommonEvents(); focusDictationInput(); };
      else if (action === 'fill-hint-char') element.onclick = () => fillHintText(element.dataset.char || '');
      else if (action === 'fill-hint-word') element.onclick = () => fillHintText(element.dataset.word || '');
      else if (action === 'toggle-word-hint') element.onclick = () => { state.hint = Object.assign({}, state.hint, { wordOpen: !state.hint.wordOpen }); renderPractice(); bindCommonEvents(); };
      else if (action === 'rate-item') element.onclick = () => rateItem(element.dataset.rating);
      else if (action === 'set-gender') element.onclick = () => setGender(element.dataset.gender);
      else if (action === 'set-rewind') element.onclick = () => setRewind(Number(element.dataset.seconds));
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
    let pendingComposition = null;
    let compositionTimer = 0;

    const commitBuffer = (value) => {
      window.clearTimeout(compositionTimer);
      pendingComposition = null;
      input.value = '';
      commitDictationText(value);
    };

    input.oncompositionstart = () => {
      composing = true;
      pendingComposition = null;
      window.clearTimeout(compositionTimer);
    };
    input.oncompositionupdate = () => { composing = true; };
    input.oncompositionend = (event) => {
      composing = false;
      pendingComposition = String(event.data || input.value || '');
      compositionTimer = window.setTimeout(() => {
        if (pendingComposition === null) return;
        commitBuffer(input.value || pendingComposition);
      }, 20);
    };
    input.oninput = (event) => {
      const compositionInput = composing || event.isComposing || event.inputType === 'insertCompositionText';
      if (compositionInput) return;

      if (pendingComposition !== null) {
        commitBuffer(input.value || pendingComposition);
        return;
      }

      if (input.value) commitBuffer(input.value);
    };
    input.onfocus = () => moveCaretToEnd(input);
    input.onclick = () => moveCaretToEnd(input);
    input.onkeydown = (event) => {
      if (event.key === 'Backspace' && !composing && !event.isComposing && !input.value) {
        event.preventDefault();
        deleteLastDictationUnit();
        return;
      }
      if (event.key === 'Enter' && !composing && !event.isComposing) {
        event.preventDefault();
        checkAnswer();
      }
    };
  }

  function commitDictationText(value) {
    const item = currentItem();
    if (!item || !value) return;
    const max = Core.answerUnits(item.text).length;
    const nextInput = Core.appendDictationInput(state.input, value, item.text, max);
    if (nextInput === state.input) {
      focusDictationInput();
      return;
    }
    state.input = nextInput;
    state.result = null;
    state.showAnswer = false;
    renderPractice();
    bindCommonEvents();
    focusDictationInput();
  }

  function deleteLastDictationUnit() {
    if (!state.input) return;
    state.input = Core.removeLastAnswerUnit(state.input);
    state.result = null;
    state.showAnswer = false;
    renderPractice();
    bindCommonEvents();
    focusDictationInput();
  }

  function focusDictationInput() {
    requestAnimationFrame(() => {
      const input = document.getElementById('dictationInput');
      if (!input) return;
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

  function checkAnswer() {
    const item = currentItem();
    if (!item) return;
    state.result = Core.compareAnswers(state.input, item.text);
    updateAttemptProgress(item);
    render();
    focusDictationInput();
  }

  function updateAttemptProgress(item) {
    const key = progressKey(item, state.mode);
    const previous = state.progress[key] || {};
    state.progress[key] = Object.assign({}, previous, {
      item: snapshotItem(item),
      activity: state.mode === 'dictation' ? 'listening-dictation' : 'listening-transcript',
      attempts: Number(previous.attempts || 0) + 1,
      listenCount: Number(previous.listenCount || 0) + state.listenCount,
      usedHint: Boolean(previous.usedHint || state.usedHint),
      lastResult: state.result ? { correctCount: state.result.correctCount, total: state.result.total, isCorrect: state.result.isCorrect } : previous.lastResult,
      lastReviewedAt: new Date().toISOString()
    });
    saveProgress();
  }

  function snapshotItem(item) {
    const copy = Object.assign({}, item);
    delete copy.raw;
    return copy;
  }

  function showHint() {
    state.usedHint = true;
    state.hint = { wordOpen: false };
    render();
  }

  function fillHintText(text) {
    const item = currentItem();
    if (!item) return;
    state.usedHint = true;
    const max = Core.answerUnits(item.text).length;
    state.input = Core.sanitizeAnswer(state.input + text, max);
    state.result = null;
    render();
    focusDictationInput();
  }

  function rateItem(rating) {
    const item = currentItem();
    if (!item) return;
    const key = progressKey(item, state.mode);
    const previous = state.progress[key] || {};
    state.progress[key] = Object.assign({}, previous, {
      item: snapshotItem(item),
      activity: state.mode === 'dictation' ? 'listening-dictation' : 'listening-transcript',
      rating,
      listenCount: Number(previous.listenCount || 0) + state.listenCount,
      usedHint: Boolean(previous.usedHint || state.usedHint),
      lastReviewedAt: new Date().toISOString()
    });
    state.listenCount = 0;
    saveProgress();
    render();
  }

  function moveItem(delta) {
    const next = state.currentIndex + delta;
    if (next < 0 || next >= state.items.length) return;
    state.currentIndex = next;
    resetCurrentAnswer();
    rememberSession();
    prepareNextItem();
    render();
    focusDictationInput();
  }

  function prepareNextItem() {
    const next = state.items[state.currentIndex + 1];
    state.preparedNext = next ? {
      text: next.text,
      voiceURI: selectedVoice() && (selectedVoice().voiceURI || selectedVoice().name) || '',
      rate: Number(state.settings.rate) || 1
    } : null;
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
    if (state.screen === 'practice') {
      state.screen = 'mode';
      stopSpeech();
      render();
      return;
    }
    if (state.screen === 'mode') {
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
    const start = item && state.speechCharIndex >= item.text.length ? 0 : (state.speechCharIndex || 0);
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
    const current = state.speechCharIndex > 0 ? state.speechCharIndex : 0;
    const start = Core.findRewindStart(item.text, current, state.settings.rewindSeconds, state.settings.rate);
    speakFrom(start);
  }

  function speakFrom(index) {
    const item = currentItem();
    if (!item || !('speechSynthesis' in window)) return;
    const text = String(item.text || '');
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

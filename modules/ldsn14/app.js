(() => {
  'use strict';

  const root = document.getElementById('ldsnApp');
  const DATA_URL = 'data/lessons.json?v=20260730-ldsn2';
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
    vocabModeByLesson: {},
    customVocabByLesson: {},
    roleByLesson: {}
  });
  settings.roleplayMode = settings.roleplayMode === 'ordering' ? 'ordering' : 'typing';
  settings.vocabModeByLesson = settings.vocabModeByLesson || {};
  settings.customVocabByLesson = settings.customVocabByLesson || {};
  settings.roleByLesson = settings.roleByLesson || {};
  let progress = readJson(PROGRESS_KEY, {});

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

  function ratingButtons(itemKey, meta) {
    const current = getLessonState(currentLesson.id).ratings[itemKey]?.rating || '';
    const encoded = encodeURIComponent(JSON.stringify(meta));
    return `<div class="ldsn-rating-row" data-rating-group="${attr(itemKey)}">
      <button class="ldsn-rating${current === 'easy' ? ' is-active' : ''}" type="button" data-rate="easy" data-item-key="${attr(itemKey)}" data-item-meta="${encoded}">Dễ</button>
      <button class="ldsn-rating${current === 'review' ? ' is-active' : ''}" type="button" data-rate="review" data-item-key="${attr(itemKey)}" data-item-meta="${encoded}">Ôn</button>
      <button class="ldsn-rating${current === 'hard' ? ' is-active' : ''}" type="button" data-rate="hard" data-item-key="${attr(itemKey)}" data-item-meta="${encoded}">Khó</button>
    </div>`;
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
      <section class="ldsn-card ldsn-lesson-hero">
        <a class="ldsn-back-link" href="${courseUrl()}">‹ LDSN1-4 · 10 bài</a>
        <div class="ldsn-lesson-heading">
          <div>
            <p class="ldsn-kicker">Bài ${currentLesson.lessonNumber}</p>
            <h1>${esc(currentLesson.title.vi)}<span class="ldsn-hanzi">${esc(currentLesson.title.hanzi)}</span></h1>
            <p class="ldsn-subtitle">${esc(currentLesson.title.pinyin)} · ${percent}% hoàn thành</p>
          </div>
          ${audioButton(currentLesson.title.hanzi, 'Nghe tên bài')}
        </div>
        <div class="ldsn-recommendation">
          <small>Hoạt động phù hợp tiếp theo</small>
          <strong>${esc(next.label)}</strong>
          <button class="ldsn-primary-btn" type="button" data-journey="${next.id}">Tiếp tục học</button>
        </div>
      </section>
      <section class="ldsn-card ldsn-pad" aria-label="Hành trình bài học">
        <div class="ldsn-section-head"><div><h2>Hành trình</h2><p>Có thể mở lại hoặc bỏ qua phần đã quen.</p></div></div>
        <div class="ldsn-journey">${renderJourney()}</div>
      </section>
      <div class="ldsn-tabs-wrap">
        <nav class="ldsn-tabs" aria-label="Nội dung bài học">${TABS.map(tab => `<button class="ldsn-tab${tab.id === activeTab ? ' is-active' : ''}" type="button" data-tab="${tab.id}" aria-current="${tab.id === activeTab ? 'page' : 'false'}">${tab.label}</button>`).join('')}</nav>
      </div>
      <section id="ldsnPanel" class="ldsn-panel">${renderActivePanel()}</section>
    </div>`;
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
    return `<section id="vocabulary" class="ldsn-card ldsn-pad ldsn-section ldsn-section--vocab">
      <div class="ldsn-section-head"><div><p class="ldsn-kicker">Vườn từ vựng</p><h2>Phiên này: ${session.length}/${currentLesson.vocabulary.length} từ</h2><p>Vuốt thẻ để học. Có thể đổi số lượng hoặc tự chọn từ.</p></div></div>
      ${renderVocabularySettings()}
      <div class="ldsn-vocab-session-head"><span>Thẻ 1–${session.length}</span><small>Vuốt ngang trên điện thoại</small></div>
      <div class="ldsn-vocab-grid">${session.map(renderVocabularyCard).join('')}</div>
    </section>
    <section id="warmup" class="ldsn-card ldsn-pad ldsn-section ldsn-section--warmup">
      <div class="ldsn-inline-head"><div><p class="ldsn-kicker">Khởi động 2–3 phút</p><h2>Nhìn chủ đề trước khi học</h2></div></div>
      <p class="ldsn-subtitle">Bạn đã biết từ nào? Nghe một câu và đoán tình huống của bài.</p>
      <div class="ldsn-meta">${sampleWords.map(word => `<span class="ldsn-hanzi">${esc(word.hanzi)}</span>`).join('')}</div>
      ${firstDialogue.hanzi ? `<div class="ldsn-layer ldsn-layer--mint"><div class="ldsn-inline-head"><span class="ldsn-hanzi">${esc(firstDialogue.hanzi)}</span>${audioButton(firstDialogue.hanzi)}</div><small>Nghe trước, sau đó mới xem nghĩa trong tab Nội dung.</small></div>` : ''}
      <div class="ldsn-actions"><button class="ldsn-secondary-btn" type="button" data-mark-step="warmup">Đã khởi động</button></div>
    </section>
    <section id="grammar" class="ldsn-card ldsn-pad ldsn-section ldsn-section--grammar">
      <div class="ldsn-section-head"><div><p class="ldsn-kicker">Khám phá ngữ pháp</p><h2>Ngữ pháp từ câu thật</h2><p>Mỗi thẻ gọn theo: cách dùng → câu thật → ví dụ.</p></div></div>
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
      const rank = { hard: 0, review: 1, '': 2, easy: 3 };
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
    return `<details class="ldsn-settings"${mode === 'custom' ? ' open' : ''}>
      <summary><span>Cài đặt số lượng từ</span><small>${mode === 'auto' ? 'Đề xuất thông minh' : mode === 'all' ? 'Toàn bộ bài' : mode === 'custom' ? `${selected.size || 0} từ đã chọn` : `${mode} từ`}</small></summary>
      <div class="ldsn-settings-body">
        <div class="ldsn-choice-grid">${options.map(([value, label]) => `<label class="ldsn-choice"><input type="radio" name="vocabMode" value="${value}" data-vocab-mode${mode === value ? ' checked' : ''}><span>${label}</span></label>`).join('')}</div>
        <div class="ldsn-number-setting">
          <label for="ldsnCustomCount"><strong>Số lượng khác</strong><small>Nhập từ 1 đến ${currentLesson.vocabulary.length}</small></label>
          <div class="ldsn-number-control"><input id="ldsnCustomCount" class="ldsn-number-input" type="number" min="1" max="${currentLesson.vocabulary.length}" value="${numericMode}" data-vocab-count-input inputmode="numeric"><button class="ldsn-secondary-btn" type="button" data-apply-vocab-count>Áp dụng</button></div>
        </div>
        <div class="${mode === 'custom' ? '' : 'ldsn-hidden'}" data-custom-vocab-wrap>
          <div class="ldsn-actions"><button class="ldsn-ghost-btn" type="button" data-custom-action="all">Chọn tất cả</button><button class="ldsn-ghost-btn" type="button" data-custom-action="none">Bỏ chọn</button><button class="ldsn-ghost-btn" type="button" data-custom-action="ten">Chọn 10 từ</button><button class="ldsn-ghost-btn" type="button" data-custom-action="weak">Chọn từ yếu</button></div>
          <div class="ldsn-custom-list">${currentLesson.vocabulary.map(word => `<label class="ldsn-custom-word"><input type="checkbox" data-custom-vocab="${word.id}"${selected.has(word.id) ? ' checked' : ''}><span><strong class="ldsn-hanzi">${esc(word.hanzi)}</strong><small>${esc(word.pinyin)} · ${esc(word.vi)}</small></span></label>`).join('')}</div>
          <button class="ldsn-primary-btn" type="button" data-apply-custom>Áp dụng danh sách đã chọn</button>
        </div>
      </div>
    </details>`;
  }

  function renderVocabularyCard(word, index) {
    const key = `vocab:${word.id}`;
    return `<article class="ldsn-card ldsn-vocab-card">
      <div class="ldsn-flashcard-top"><span class="ldsn-card-count">Từ ${index + 1}</span>${audioButton(word.hanzi, `Nghe ${word.hanzi}`)}</div>
      <div class="ldsn-flashcard-face">
        <h3>${esc(word.hanzi)}</h3>
        <div class="ldsn-pinyin">${esc(word.pinyin)}</div>
        <div class="ldsn-meaning">${esc(word.vi)}</div>
      </div>
      <div class="ldsn-meta"><span>${esc(word.wordClass || 'từ vựng')}</span>${word.hanViet ? `<span>Hán Việt: ${esc(word.hanViet)}</span>` : ''}</div>
      ${ratingButtons(key, itemMeta('vocabulary', word))}
    </article>`;
  }

  function renderGrammarCard(grammar) {
    const examples = grammar.examples.filter(row => row.hanzi);
    const ratingExample = examples[0] || {};
    const sourceLabel = grammar.source === 'passage' ? 'Đoạn văn' : grammar.source === 'dialogue' ? 'Hội thoại' : 'Câu';
    return `<details class="ldsn-card ldsn-grammar-card">
      <summary><span class="ldsn-grammar-icon">法</span><span class="ldsn-grammar-summary"><strong>${esc(grammar.title)}</strong><small>${sourceLabel} · ${grammar.notes.length} cách dùng · ${examples.length} ví dụ</small></span><span class="ldsn-chevron">⌄</span></summary>
      <div class="ldsn-grammar-body">
        ${grammar.structure ? `<div class="ldsn-grammar-structure"><span>Cấu trúc</span><strong>${esc(grammar.structure)}</strong></div>` : ''}
        ${grammar.notes.length ? `<ol class="ldsn-grammar-notes">${grammar.notes.map(note => `<li>${esc(note)}</li>`).join('')}</ol>` : ''}
        <div class="ldsn-grammar-examples">${examples.map((example, index) => `<article class="ldsn-example-card"><div class="ldsn-example-head"><span>Ví dụ ${index + 1}</span>${audioButton(example.hanzi, 'Nghe ví dụ ngữ pháp')}</div><div class="ldsn-hanzi">${esc(example.hanzi)}</div><div class="ldsn-pinyin">${esc(example.pinyin || '')}</div><div class="ldsn-meaning">${esc(example.vi || '')}</div></article>`).join('')}</div>
        ${ratingButtons(`grammar:${grammar.id}`, itemMeta('grammar', ratingExample, { title: grammar.title }))}
      </div>
    </details>`;
  }

  function renderPractice() {
    const session = getSessionVocabulary(currentLesson);
    const zhvi = [...currentLesson.translation.zhVi.questions, ...currentLesson.translation.zhVi.answers];
    const vizh = [...currentLesson.translation.viZh.questions, ...currentLesson.translation.viZh.answers];
    const mode = settings.roleplayMode === 'ordering' ? 'ordering' : 'typing';
    return `<section class="ldsn-card ldsn-pad ldsn-section ldsn-section--practice">
      <div class="ldsn-section-head"><div><p class="ldsn-kicker">Luyện tập</p><h2>Đổi dạng bài để không nhàm chán</h2><p>Điền từ → dịch câu → dịch ngược → chinh phục đoạn văn.</p></div></div>
      <div class="ldsn-answer-mode-bar"><div><strong>Cách trả lời tiếng Trung</strong><small>Ghi nhớ cho câu, hội thoại và đoạn văn.</small></div><div class="ldsn-mode-switch"><button class="ldsn-mode-btn${mode === 'typing' ? ' is-active' : ''}" type="button" data-role-mode="typing">Gõ câu</button><button class="ldsn-mode-btn${mode === 'ordering' ? ' is-active' : ''}" type="button" data-role-mode="ordering">Xếp từ</button></div></div>
    </section>
    <section id="vocab-fill" class="ldsn-card ldsn-pad ldsn-section ldsn-section--fill">
      <div class="ldsn-section-head"><div><h2>Điền bảng từ vựng</h2><p>Phiên này dùng ${Math.min(6, session.length)} từ trong nhóm đã chọn.</p></div></div>
      <div class="ldsn-exercise-list">${session.slice(0, 6).map(renderVocabFill).join('')}</div>
    </section>
    <section id="zhvi" class="ldsn-card ldsn-pad ldsn-section ldsn-section--sentence">
      <div class="ldsn-section-head"><div><h2>Dịch Trung → Việt</h2><p>3 câu hỏi và 3 câu trả lời.</p></div></div>
      <div class="ldsn-exercise-list">${zhvi.map((item, index) => renderTranslationExercise(item, 'zhvi', index)).join('')}</div>
      <button class="ldsn-ghost-btn" type="button" data-mark-step="zhvi">Đã hoàn thành phần Trung → Việt</button>
    </section>
    <section id="vizh" class="ldsn-card ldsn-pad ldsn-section ldsn-section--reverse">
      <div class="ldsn-section-head"><div><h2>Dịch Việt → Trung</h2><p>${mode === 'ordering' ? 'Chọn các từ theo đúng thứ tự.' : 'Tự gõ chữ Hán, sau đó so sánh đáp án.'}</p></div></div>
      <div class="ldsn-exercise-list">${vizh.map((item, index) => renderTranslationExercise(item, 'vizh', index)).join('')}</div>
      <button class="ldsn-ghost-btn" type="button" data-mark-step="vizh">Đã hoàn thành phần Việt → Trung</button>
    </section>
    <section id="passage" class="ldsn-card ldsn-pad ldsn-section ldsn-section--passage">
      <div class="ldsn-section-head"><div><p class="ldsn-kicker">Chinh phục đoạn văn</p><h2>${esc(currentLesson.passage.title.vi || 'Đoạn văn')}</h2><p>Làm từng câu bằng ${mode === 'ordering' ? 'xếp từ' : 'gõ chữ Hán'}, sau đó đọc toàn đoạn.</p></div>${audioButton(currentLesson.passage.hanzi, 'Nghe toàn bộ đoạn văn')}</div>
      ${renderPassagePractice(mode)}
      <div class="ldsn-actions"><button class="ldsn-secondary-btn" type="button" data-tab-target="content" data-content-target="passage">Xem đầy đủ ba lớp</button><button class="ldsn-ghost-btn" type="button" data-mark-step="passage">Đã học đoạn văn</button></div>
    </section>
    <section id="challenge" class="ldsn-card ldsn-pad ldsn-section ldsn-section--challenge">
      <div class="ldsn-section-head"><div><p class="ldsn-kicker">Thử thách cuối bài</p><h2>Trộn nhiều kỹ năng</h2><p>Điền từ, nghe, dịch hai chiều, hội thoại, ngữ pháp và đoạn văn.</p></div></div>
      <div class="ldsn-meta"><span>3 từ vựng</span><span>2 nghe</span><span>4 câu dịch</span><span>2 hội thoại</span><span>2 ngữ pháp</span><span>1 đoạn văn</span></div>
      <div class="ldsn-actions"><button class="ldsn-primary-btn" type="button" data-mark-step="challenge">Hoàn thành thử thách</button></div>
    </section>`;
  }

  function renderVocabFill(word, index) {
    const fields = ['pinyin', 'hanzi', 'vi'];
    const missing = fields[index % fields.length];
    const labels = { pinyin: 'Pinyin', hanzi: 'Chữ Hán', vi: 'Nghĩa tiếng Việt' };
    return `<article class="ldsn-card ldsn-exercise">
      <div class="ldsn-exercise-head"><h3>Từ ${index + 1}</h3>${audioButton(word.hanzi)}</div>
      <div class="ldsn-layer">
        <span class="ldsn-hanzi">${missing === 'hanzi' ? '＿＿＿' : esc(word.hanzi)}</span>
        <small>${missing === 'pinyin' ? '＿＿＿' : esc(word.pinyin)}</small>
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
      ? renderOrderingAnswer(item.hanzi, item.pinyin, index + 101)
      : `<textarea class="ldsn-textarea" placeholder="Nhập bản dịch của bạn..." data-translation-input></textarea>
         <button class="ldsn-secondary-btn" type="button" data-show-reference data-answer="${attr(answer)}" data-pinyin="${attr(item.pinyin)}">So sánh đáp án</button>
         <div class="ldsn-feedback" data-feedback></div>`;
    return `<article class="ldsn-card ldsn-exercise${direction === 'vizh' ? ' ldsn-exercise--reverse' : ''}"${direction === 'vizh' && mode === 'ordering' ? ' data-order-exercise' : ''}>
      <div class="ldsn-exercise-head"><h3>${direction === 'zhvi' ? 'Trung → Việt' : 'Việt → Trung'} · ${index + 1}</h3>${audioButton(item.hanzi)}</div>
      <div class="${direction === 'zhvi' ? 'ldsn-prompt-hanzi' : 'ldsn-meaning ldsn-prompt-vi'}">${esc(prompt)}</div>
      ${direction === 'vizh' && mode === 'typing' ? `<small class="ldsn-pinyin">Gợi ý pinyin: ${esc(item.pinyin.split(/\s+/).map(part => part.slice(0, 1)).join(' · '))}</small>` : ''}
      ${response}
      ${ratingButtons(key, itemMeta('sentence', item, { title: direction === 'zhvi' ? 'Dịch Trung → Việt' : 'Dịch Việt → Trung' }))}
    </article>`;
  }

  function renderOrderingAnswer(expected, pinyin, seed) {
    const tokens = tokeniseSentence(expected, currentLesson.vocabulary);
    const shuffled = deterministicShuffle(tokens, seed);
    return `<div class="ldsn-order-workspace">
      <div><small>Câu của bạn</small><div class="ldsn-token-answer" data-token-answer><span class="ldsn-order-placeholder">Chọn từ ở dưới</span></div></div>
      <div><small>Từ cho sẵn</small><div class="ldsn-token-bank" data-token-bank>${shuffled.map((token, index) => `<button class="ldsn-token" type="button" data-token="${attr(token)}" data-token-index="${index}">${esc(token)}</button>`).join('')}</div></div>
      ${pinyin ? `<small class="ldsn-pinyin">${esc(pinyin)}</small>` : ''}
      <div class="ldsn-actions"><button class="ldsn-secondary-btn" type="button" data-check-order data-expected="${attr(expected)}">Kiểm tra</button><button class="ldsn-ghost-btn" type="button" data-reset-order>Đặt lại</button>${audioButton(expected, 'Nghe câu mẫu')}</div>
      <div class="ldsn-feedback" data-feedback></div>
    </div>`;
  }

  function renderPassagePractice(mode) {
    const p = currentLesson.passage;
    return `<div class="ldsn-passage-practice">
      <div class="ldsn-passage-title ldsn-passage-title--compact"><h3>${esc(p.title.hanzi || '')}</h3><span class="ldsn-pinyin">${esc(p.title.pinyin || '')}</span><span class="ldsn-meaning">${esc(p.title.vi || '')}</span></div>
      <div class="ldsn-passage-sentences">${p.sentences.filter(row => row.hanzi).map((row, index) => `<details class="ldsn-passage-sentence"${index === 0 ? ' open' : ''} data-order-exercise>
        <summary><span class="ldsn-sentence-number">${index + 1}</span><span><strong>${esc(row.vi)}</strong><small>${mode === 'ordering' ? 'Xếp từ thành câu tiếng Trung' : 'Gõ câu tiếng Trung'}</small></span><span class="ldsn-chevron">⌄</span></summary>
        <div class="ldsn-passage-sentence-body">
          ${mode === 'ordering' ? renderOrderingAnswer(row.hanzi, row.pinyin, index + 501) : `<input class="ldsn-input" type="text" placeholder="Gõ câu tiếng Trung..." data-role-input autocomplete="off" lang="zh-CN"><div class="ldsn-actions"><button class="ldsn-secondary-btn" type="button" data-check-role data-expected="${attr(row.hanzi)}">Kiểm tra</button>${audioButton(row.hanzi, `Nghe câu ${index + 1}`)}</div><div class="ldsn-feedback" data-feedback></div>`}
        </div>
      </details>`).join('')}</div>
    </div>`;
  }

  function renderPassage(full) {
    const p = currentLesson.passage;
    const sentenceAudio = p.sentences.filter(row => row.hanzi).map((row, index) => `<div class="ldsn-layer"><div class="ldsn-inline-head"><span><strong>Câu ${index + 1}</strong></span>${audioButton(row.hanzi, `Nghe câu ${index + 1}`)}</div><span class="ldsn-hanzi">${esc(row.hanzi)}</span>${full && row.pinyin ? `<small>${esc(row.pinyin)}</small>` : ''}</div>`).join('');
    return `<div class="ldsn-passage">
      <div class="ldsn-passage-title"><h3>${esc(p.title.hanzi || '')}</h3><span class="ldsn-pinyin">${esc(p.title.pinyin || '')}</span><span class="ldsn-meaning">${esc(p.title.vi || '')}</span></div>
      ${full ? `<div class="ldsn-passage-layer"><h4>Chữ Hán</h4><p class="ldsn-hanzi">${esc(p.hanzi)}</p></div><div class="ldsn-passage-layer"><h4>Pinyin</h4><p>${esc(p.pinyin)}</p></div><div class="ldsn-passage-layer"><h4>Tiếng Việt</h4><p>${esc(p.vi)}</p></div>` : sentenceAudio}
    </div>`;
  }

  function renderDialogue() {
    const speakers = [...new Set(currentLesson.dialogue.map(turn => turn.speaker).filter(Boolean))];
    const selectedRole = settings.roleByLesson[currentLesson.id] || speakers[0] || '';
    const mode = settings.roleplayMode === 'ordering' ? 'ordering' : 'typing';
    return `<section id="roleplay" class="ldsn-card ldsn-pad ldsn-section ldsn-section--dialogue">
      <div class="ldsn-section-head"><div><p class="ldsn-kicker">Hội thoại nhập vai</p><h2>Nghe → phản xạ → tự trả lời</h2><p>Chế độ đã chọn dùng chung với câu và đoạn văn, đồng thời được ghi nhớ.</p></div>${audioButton(currentLesson.dialogue.map(turn => turn.hanzi).join(' '), 'Nghe toàn bộ hội thoại')}</div>
      <div class="ldsn-dialogue-toolbar">
        <label><small>Vai của bạn</small><select class="ldsn-role-select" data-role-select>${speakers.map(speaker => `<option value="${attr(speaker)}"${speaker === selectedRole ? ' selected' : ''}>${esc(speaker)}</option>`).join('')}</select></label>
        <div><small>Cách trả lời mặc định</small><div class="ldsn-mode-switch"><button class="ldsn-mode-btn${mode === 'typing' ? ' is-active' : ''}" type="button" data-role-mode="typing">Gõ câu</button><button class="ldsn-mode-btn${mode === 'ordering' ? ' is-active' : ''}" type="button" data-role-mode="ordering">Xếp từ</button></div></div>
      </div>
    </section>
    <section class="ldsn-dialogue-list">${currentLesson.dialogue.map(turn => renderDialogueTurn(turn, selectedRole, mode)).join('')}</section>
    <section class="ldsn-card ldsn-pad"><button class="ldsn-ghost-btn" type="button" data-mark-step="dialogue">Đã hoàn thành lượt nhập vai</button></section>`;
  }

  function renderDialogueTurn(turn, selectedRole, mode) {
    const isUser = turn.speaker === selectedRole;
    const key = `dialogue:${turn.id}`;
    return `<article class="ldsn-card ldsn-dialogue-turn${isUser ? ' is-user' : ' is-other'}" data-turn-id="${turn.id}"${isUser && mode === 'ordering' ? ' data-order-exercise' : ''}>
      <div class="ldsn-dialogue-speaker-row"><span class="ldsn-speaker-avatar">${esc((turn.speaker || '?').slice(0, 1))}</span><div class="ldsn-speaker">${esc(turn.speaker || `Lượt ${turn.turn}`)}${isUser ? ' · Lượt của bạn' : ''}</div></div>
      ${isUser ? renderRoleAnswer(turn, mode) : `<div class="ldsn-turn-copy"><div><div class="ldsn-hanzi">${esc(turn.hanzi)}</div><div class="ldsn-pinyin">${esc(turn.pinyin)}</div><div class="ldsn-meaning">${esc(turn.vi)}</div></div>${audioButton(turn.hanzi)}</div>`}
      ${ratingButtons(key, itemMeta('dialogue', turn, { title: turn.speaker }))}
    </article>`;
  }

  function renderRoleAnswer(turn, mode) {
    if (mode === 'ordering') {
      return `<div class="ldsn-layer ldsn-layer--dialogue"><span class="ldsn-meaning">${esc(turn.vi)}</span><small>${esc(turn.pinyin)}</small></div>${renderOrderingAnswer(turn.hanzi, '', turn.turn)}`;
    }
    return `<div class="ldsn-layer ldsn-layer--dialogue"><span class="ldsn-meaning">${esc(turn.vi)}</span><small>${esc(turn.pinyin)}</small></div>
      <input class="ldsn-input" type="text" placeholder="Gõ câu tiếng Trung..." data-role-input autocomplete="off" lang="zh-CN">
      <div class="ldsn-actions"><button class="ldsn-secondary-btn" type="button" data-check-role data-expected="${attr(turn.hanzi)}">Kiểm tra</button>${audioButton(turn.hanzi, 'Nghe câu mẫu')}</div>
      <div class="ldsn-feedback" data-feedback></div>`;
  }

  function tokeniseSentence(sentence, vocabulary) {
    const clean = String(sentence || '').replace(/[，。！？；：、“”‘’…,.!?;:\s]/g, '');
    const common = ['我们', '你们', '他们', '她们', '这里', '那里', '什么', '怎么', '可以', '因为', '所以', '但是', '然后', '已经', '还是', '一起', '一下', '一个', '我的', '你的', '他的', '她的', '我', '你', '他', '她', '叫', '是', '有', '在', '来', '去', '也', '很', '不', '没', '的', '了', '吗', '呢', '吧', '啊'];
    const words = [...new Set([...vocabulary.map(row => row.hanzi), ...common])]
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    const surnames = new Set('赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛范彭郎鲁韦昌马苗凤花方俞任袁柳唐罗薛伍余米贝姚孟顾尹江钟徐邱骆高夏蔡田樊胡凌霍虞万支柯管卢莫房裘缪干解应宗丁宣贲邓郁单杭洪包诸左石崔吉龚程嵇邢滑裴陆荣翁荀羊於惠甄曲家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘钭厉戎祖武符刘景詹束龙叶幸司韶郜黎蓟薄印宿白怀蒲台从鄂索咸籍赖卓蔺屠蒙池乔阴胥能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍郤璩桑桂濮牛寿通边扈燕冀郏浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公');
    const tokens = [];
    let index = 0;
    while (index < clean.length) {
      const match = words.find(word => clean.startsWith(word, index));
      if (match) { tokens.push(match); index += match.length; continue; }
      const latin = clean.slice(index).match(/^[A-Za-z0-9]+/);
      if (latin) { tokens.push(latin[0]); index += latin[0].length; continue; }
      const remaining = clean.slice(index);
      if (surnames.has(clean[index]) && /^[\u4e00-\u9fff]{3}/.test(remaining)) {
        tokens.push(clean[index]);
        tokens.push(clean.slice(index + 1, index + 3));
        index += 3;
        continue;
      }
      const pair = remaining.match(/^[\u4e00-\u9fff]{2}/);
      if (pair) { tokens.push(pair[0]); index += 2; continue; }
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

  function renderContent() {
    const filters = [
      ['all', 'Tất cả'], ['vocabulary', 'Từ vựng'], ['sentences', 'Câu'], ['dialogue', 'Hội thoại'], ['grammar', 'Ngữ pháp'], ['passage', 'Đoạn văn']
    ];
    return `<section class="ldsn-card ldsn-pad ldsn-section ldsn-section--content">
      <div class="ldsn-section-head"><div><p class="ldsn-kicker">Nội dung đầy đủ</p><h2>Toàn bộ Bài ${currentLesson.lessonNumber}</h2><p>Mỗi nhóm có thể thu gọn để dễ xem trên điện thoại.</p></div></div>
      <div class="ldsn-filter-row">${filters.map(([id, label]) => `<button class="ldsn-chip${contentFilter === id ? ' is-active' : ''}" type="button" data-content-filter="${id}">${label}</button>`).join('')}</div>
    </section>
    ${showContent('vocabulary') ? renderFullVocabulary() : ''}
    ${showContent('sentences') ? renderFullSentences() : ''}
    ${showContent('dialogue') ? renderFullDialogue() : ''}
    ${showContent('grammar') ? `<details class="ldsn-card ldsn-content-accordion"${contentFilter === 'grammar' ? ' open' : ''}><summary><span><strong>Toàn bộ ngữ pháp</strong><small>${currentLesson.grammar.length} điểm · Cấu trúc và ví dụ</small></span><span class="ldsn-chevron">⌄</span></summary><div class="ldsn-content-accordion-body"><div class="ldsn-grammar-list">${currentLesson.grammar.map(renderGrammarCard).join('')}</div></div></details>` : ''}
    ${showContent('passage') ? `<details class="ldsn-card ldsn-content-accordion"${contentFilter === 'passage' ? ' open' : ''}><summary><span><strong>Đoạn văn</strong><small>Chữ Hán · Pinyin · Tiếng Việt</small></span><span class="ldsn-chevron">⌄</span></summary><div class="ldsn-content-accordion-body"><div class="ldsn-section-head"><div><h2>${esc(currentLesson.passage.title.vi || 'Đoạn văn')}</h2></div>${audioButton(currentLesson.passage.hanzi, 'Nghe toàn bộ đoạn văn')}</div>${renderPassage(true)}</div></details>` : ''}`;
  }

  function showContent(id) { return contentFilter === 'all' || contentFilter === id; }

  function renderFullVocabulary() {
    return `<details class="ldsn-card ldsn-content-accordion"${contentFilter === 'vocabulary' || contentFilter === 'all' ? ' open' : ''}><summary><span><strong>Toàn bộ ${currentLesson.vocabulary.length} từ vựng</strong><small>Chữ Hán · Pinyin · Từ loại · Hán Việt · Nghĩa</small></span><span class="ldsn-chevron">⌄</span></summary>
      <div class="ldsn-content-accordion-body"><div class="ldsn-content-vocab-list">${currentLesson.vocabulary.map(word => `<article class="ldsn-content-vocab-row"><div class="ldsn-content-vocab-hanzi">${esc(word.hanzi)}</div><div class="ldsn-content-vocab-copy"><strong>${esc(word.pinyin)}</strong><span>${esc(word.vi)}</span><small>${esc(word.wordClass || 'từ vựng')}${word.hanViet ? ` · Hán Việt: ${esc(word.hanViet)}` : ''}</small></div>${audioButton(word.hanzi)}</article>`).join('')}</div></div>
    </details>`;
  }

  function renderFullSentences() {
    const groups = [
      ['Trung → Việt · Câu hỏi', currentLesson.translation.zhVi.questions],
      ['Trung → Việt · Câu trả lời', currentLesson.translation.zhVi.answers],
      ['Việt → Trung · Câu hỏi', currentLesson.translation.viZh.questions],
      ['Việt → Trung · Câu trả lời', currentLesson.translation.viZh.answers]
    ];
    return `<details class="ldsn-card ldsn-content-accordion"${contentFilter === 'sentences' ? ' open' : ''}><summary><span><strong>Toàn bộ câu</strong><small>12 câu · Chữ Hán · Pinyin · Tiếng Việt</small></span><span class="ldsn-chevron">⌄</span></summary><div class="ldsn-content-accordion-body"><div class="ldsn-exercise-list">${groups.map(([title, items]) => `<section class="ldsn-content-group"><h3>${title}</h3>${items.map((item, index) => `<article class="ldsn-content-sentence-row"><span class="ldsn-sentence-number">${index + 1}</span><div><div class="ldsn-hanzi">${esc(item.hanzi)}</div><div class="ldsn-pinyin">${esc(item.pinyin)}</div><div class="ldsn-meaning">${esc(item.vi)}</div></div>${audioButton(item.hanzi)}</article>`).join('')}</section>`).join('')}</div></div></details>`;
  }

  function renderFullDialogue() {
    return `<details class="ldsn-card ldsn-content-accordion"${contentFilter === 'dialogue' ? ' open' : ''}><summary><span><strong>Toàn bộ hội thoại</strong><small>${currentLesson.dialogue.length} lượt · Chữ Hán · Pinyin · Tiếng Việt</small></span><span class="ldsn-chevron">⌄</span></summary><div class="ldsn-content-accordion-body"><div class="ldsn-section-head"><div></div>${audioButton(currentLesson.dialogue.map(turn => turn.hanzi).join(' '), 'Nghe toàn bộ hội thoại')}</div><div class="ldsn-dialogue-list">${currentLesson.dialogue.map(turn => `<article class="ldsn-dialogue-turn is-other"><div class="ldsn-dialogue-speaker-row"><span class="ldsn-speaker-avatar">${esc((turn.speaker || '?').slice(0, 1))}</span><div class="ldsn-speaker">${esc(turn.speaker)}</div></div><div class="ldsn-turn-copy"><div><div class="ldsn-hanzi">${esc(turn.hanzi)}</div><div class="ldsn-pinyin">${esc(turn.pinyin)}</div><div class="ldsn-meaning">${esc(turn.vi)}</div></div>${audioButton(turn.hanzi)}</div></article>`).join('')}</div></div></details>`;
  }

  function renderReview() {
    const state = getLessonState(currentLesson.id);
    const rows = Object.entries(state.ratings || {})
      .filter(([, row]) => ['review', 'hard'].includes(row.rating))
      .sort((a, b) => String(b[1].updatedAt).localeCompare(String(a[1].updatedAt)));
    return `<section id="review" class="ldsn-card ldsn-pad">
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
      ${meta.pinyin ? `<div class="ldsn-pinyin">${esc(meta.pinyin)}</div>` : ''}
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
      showFeedback(card, `<strong>Đáp án tham khảo:</strong><br>${esc(answer)}${pinyin ? `<br><small>${esc(pinyin)}</small>` : ''}`, 'is-partial');
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

  async function init() {
    try {
      const response = await fetch(DATA_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      payload = await response.json();
      const params = new URLSearchParams(location.search);
      const lessonNo = Number(params.get('lesson'));
      currentLesson = payload.lessons.find(lesson => lesson.lessonNumber === lessonNo) || null;
      activeTab = TABS.some(tab => tab.id === params.get('tab')) ? params.get('tab') : 'learn';
      if (currentLesson) renderLesson(); else renderCourse();
      root.addEventListener('click', handleClick);
      root.addEventListener('change', handleChange);
      window.setTimeout(() => { setBreadcrumb(); recordLocation(); }, 50);
    } catch (error) {
      root.innerHTML = `<section class="ldsn-card ldsn-pad"><h1>Không mở được LDSN1-4</h1><p class="ldsn-subtitle">${esc(error.message)}</p><p>Hãy chạy website bằng local server, không mở trực tiếp file HTML.</p></section>`;
    }
  }

  init();
})();

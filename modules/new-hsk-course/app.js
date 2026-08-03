(() => {
  'use strict';

  const SETTINGS_KEY = 'tiengTrung.newHskCourse.settings.v1';
  const LAST_LOCATION_KEY = 'tiengTrung.newHskCourse.lastLocation.v1';
  const root = document.getElementById('newHskCourseApp');
  const params = new URLSearchParams(window.location.search);
  const state = {
    manifest: null,
    lesson: null,
    level: Math.max(1, Number(params.get('level')) || 1),
    lessonNumber: Math.max(1, Number(params.get('lesson')) || 1),
    view: params.get('view') === 'grouped' ? 'grouped' : 'book',
    filter: params.get('filter') || 'all',
    showPinyin: true,
    loading: true,
    error: ''
  };

  Object.assign(state, readSettings());
  if (params.get('view')) state.view = params.get('view') === 'grouped' ? 'grouped' : 'book';

  const escapeHtml = (value = '') => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const sortByOrder = (items = []) => [...items].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  const entityMap = (items = []) => new Map(items.map(item => [item.id, item]));

  function readSettings() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || '{}');
      return {
        showPinyin: saved.showPinyin !== false,
        view: saved.view === 'grouped' ? 'grouped' : state.view
      };
    } catch (_error) {
      return {};
    }
  }

  function saveSettings() {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ showPinyin: state.showPinyin, view: state.view }));
      window.localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify({
        level: state.level,
        lesson: state.lessonNumber,
        view: state.view,
        filter: state.filter,
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
    if (state.view === 'grouped' && state.filter !== 'all') url.searchParams.set('filter', state.filter);
    else url.searchParams.delete('filter');
    window.history[replace ? 'replaceState' : 'pushState'](window.history.state, '', `${url.pathname}${url.search}`);
  }

  function indexes(lesson) {
    const entities = lesson.entities;
    return Object.fromEntries(Object.entries(entities).map(([key, items]) => [key, entityMap(items)]));
  }

  function speak(text) {
    const value = String(text || '').trim();
    if (!value || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(value);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }

  function lookupUrl(word) {
    const url = new URL('../lookup/index.html', document.baseURI || window.location.href);
    url.searchParams.set('q', word);
    url.searchParams.set('return', `${window.location.pathname}${window.location.search}`);
    return url.href;
  }

  function mediaBadge(kind, ref) {
    if (!ref) return '';
    return `<span class="nhsk-media-badge" title="Mã ${kind} trong sách">${kind === 'Audio' ? '🔊' : '▶'} ${escapeHtml(ref)}</span>`;
  }

  function renderHero(lesson) {
    return `
      <section class="nhsk-hero">
        <div class="nhsk-hero__eyebrow">NEW HSK 3.0 · HSK ${lesson.level} · BÀI ${lesson.lessonNumber}</div>
        <h1 class="nhsk-hero__hanzi">${escapeHtml(lesson.title.hanzi)}</h1>
        <p class="nhsk-pinyin nhsk-hero__pinyin">${escapeHtml(lesson.title.pinyin)}</p>
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
        </div>
        <button type="button" class="nhsk-pinyin-toggle ${state.showPinyin ? 'is-active' : ''}" data-nhsk-pinyin aria-pressed="${state.showPinyin}">
          <span class="nhsk-pinyin-toggle__mark" aria-hidden="true">拼</span>
          <span>${state.showPinyin ? 'Ẩn pinyin' : 'Hiện pinyin'}</span>
        </button>
      </div>`;
  }

  function renderObjectives(items) {
    return sectionCard('Mục tiêu', `<ol class="nhsk-objectives">${sortByOrder(items).map(item => `<li>${escapeHtml(item.vi)}</li>`).join('')}</ol>`, '目标');
  }

  function renderContext(context) {
    if (!context?.hanzi && !context?.vi) return '';
    return `<blockquote class="nhsk-context"><p class="nhsk-hanzi">${escapeHtml(context.hanzi)}</p><p>${escapeHtml(context.vi)}</p></blockquote>`;
  }

  function renderDialogue(dialogue) {
    const layers = [
      { label: 'Chữ Hán', text: 'hanzi', speaker: 'hanzi', className: 'nhsk-dialogue-layer--hanzi' },
      { label: 'Pinyin', text: 'pinyin', speaker: 'pinyin', className: 'nhsk-dialogue-layer--pinyin nhsk-pinyin' },
      { label: 'Tiếng Việt', text: 'vi', speaker: 'vi', className: 'nhsk-dialogue-layer--vi' }
    ];
    return `<div class="nhsk-dialogue">${layers.map(layer => `
      <section class="nhsk-dialogue-layer ${layer.className}">
        <h4>${layer.label}</h4>
        ${sortByOrder(dialogue.turns).map(turn => `
          <p><strong>${escapeHtml(turn.speaker[layer.speaker])}:</strong> ${escapeHtml(turn[layer.text])}${layer.text === 'hanzi' ? `<button type="button" class="nhsk-speak" data-nhsk-speak="${escapeHtml(turn.hanzi)}" aria-label="Nghe câu ${escapeHtml(turn.hanzi)}">🔊</button>` : ''}</p>`).join('')}
      </section>`).join('')}</div>`;
  }

  function renderVocabulary(items, options = {}) {
    if (!items.length) return '';
    const audio = mediaBadge('Audio', options.audioRef);
    return `
      ${audio ? `<div class="nhsk-section-meta">${audio}</div>` : ''}
      <div class="nhsk-vocab-list">
        ${sortByOrder(items).map(item => `
          <article class="nhsk-vocab-item">
            <span class="nhsk-vocab-item__order">${item.order}</span>
            <a class="nhsk-vocab-item__word" href="${lookupUrl(item.hanzi)}" title="Tra ${escapeHtml(item.hanzi)}">${escapeHtml(item.hanzi)}</a>
            <button type="button" class="nhsk-speak" data-nhsk-speak="${escapeHtml(item.hanzi)}" aria-label="Nghe ${escapeHtml(item.hanzi)}">🔊</button>
            <span class="nhsk-pinyin nhsk-vocab-item__pinyin">${escapeHtml(item.pinyin)}</span>
            <span class="nhsk-vocab-item__meaning">${escapeHtml(item.vi)}</span>
            <span class="nhsk-vocab-item__meta">${escapeHtml(item.wordClass)}${item.hanViet ? ` · ${escapeHtml(item.hanViet)}` : ''}</span>
            ${item.note ? `<small>${escapeHtml(item.note)}</small>` : ''}
          </article>`).join('')}
      </div>`;
  }

  function renderProperNouns(items) {
    if (!items.length) return '';
    return `<div class="nhsk-vocab-list">${sortByOrder(items).map(item => `
      <article class="nhsk-vocab-item">
        <span class="nhsk-vocab-item__order">${item.order}</span>
        <span class="nhsk-vocab-item__word">${escapeHtml(item.hanzi)}</span>
        <span class="nhsk-pinyin nhsk-vocab-item__pinyin">${escapeHtml(item.pinyin)}</span>
        <span class="nhsk-vocab-item__meaning">${escapeHtml(item.vi)}</span>
        <span class="nhsk-vocab-item__meta">${escapeHtml(item.kind)} · ${escapeHtml(item.hanViet)}</span>
      </article>`).join('')}</div>`;
  }

  function renderNotes(items) {
    return sortByOrder(items).map(item => `<aside class="nhsk-note"><strong>${escapeHtml(item.title)}</strong>${item.hanzi ? `<p class="nhsk-hanzi">${escapeHtml(item.hanzi)}</p>` : ''}<p>${escapeHtml(item.vi)}</p></aside>`).join('');
  }

  function renderActivities(items) {
    return sortByOrder(items).map((item, index) => `<article class="nhsk-activity"><span>${index + 1}</span><div><p class="nhsk-hanzi">${escapeHtml(item.hanzi)}</p><p>${escapeHtml(item.vi)}</p></div></article>`).join('');
  }

  function renderPassage(item) {
    return `<div class="nhsk-passage">
      <section><h4>Chữ Hán</h4><p class="nhsk-hanzi">${escapeHtml(item.hanzi).replaceAll('\n', '<br>')}</p></section>
      <section class="nhsk-pinyin"><h4>Pinyin</h4><p>${escapeHtml(item.pinyin).replaceAll('\n', '<br>')}</p></section>
      <section><h4>Tiếng Việt</h4><p>${escapeHtml(item.vi).replaceAll('\n', '<br>')}</p></section>
    </div>`;
  }

  function renderExtension(item) {
    return `<div class="nhsk-extension">
      ${item.prompt ? `<p class="nhsk-extension__prompt">${escapeHtml(item.prompt)}</p>` : ''}
      <p class="nhsk-extension__topic">${escapeHtml(item.topic)}</p>
      <p>${escapeHtml(item.vi)}</p>
      <p class="nhsk-visual-description"><strong>Nội dung hình:</strong> ${escapeHtml(item.visualDescription)}</p>
      ${mediaBadge('Video', item.videoRef)}
    </div>`;
  }

  function sectionCard(title, body, eyebrow = '') {
    return `<section class="nhsk-card"><header class="nhsk-card__head">${eyebrow ? `<span>${escapeHtml(eyebrow)}</span>` : ''}<h2>${escapeHtml(title)}</h2></header><div class="nhsk-card__body">${body}</div></section>`;
  }

  function renderLessonText(item, idx) {
    const dialogue = idx.dialogues.get(item.dialogueId);
    const vocab = item.vocabularyIds.map(id => idx.vocabulary.get(id)).filter(Boolean);
    const nouns = item.properNounIds.map(id => idx.properNouns.get(id)).filter(Boolean);
    const notes = item.languageNoteIds.map(id => idx.languageNotes.get(id)).filter(Boolean);
    const activities = item.activityIds.map(id => idx.activities.get(id)).filter(Boolean);
    const body = `
      ${renderContext(item.context)}
      <div class="nhsk-instruction"><span><strong>${escapeHtml(item.instruction.hanzi)}</strong> ${escapeHtml(item.instruction.vi)}</span>${mediaBadge('Audio', item.instruction.audioRef)}</div>
      ${item.visualDescription ? `<details class="nhsk-visual"><summary>Nội dung hình trong sách</summary><p>${escapeHtml(item.visualDescription)}</p></details>` : ''}
      ${dialogue ? `<h3>Hội thoại</h3>${renderDialogue(dialogue)}` : ''}
      ${vocab.length ? `<h3>Từ mới</h3>${renderVocabulary(vocab, { audioRef: item.vocabularyAudioRef })}` : ''}
      ${nouns.length ? `<h3>Danh từ riêng</h3>${renderProperNouns(nouns)}` : ''}
      ${notes.length ? `<h3>Gợi ý của Tiểu Ngữ</h3>${renderNotes(notes)}` : ''}
      ${activities.length ? `<h3>Hoạt động</h3>${renderActivities(activities)}` : ''}`;
    return sectionCard(item.title, body, `课文 ${item.order}`);
  }

  function renderBook(lesson) {
    const idx = indexes(lesson);
    return lesson.views.bookFlow.map(ref => {
      if (ref === 'objectives') return renderObjectives(lesson.entities.objectives);
      if (idx.lessonTexts.has(ref)) return renderLessonText(idx.lessonTexts.get(ref), idx);
      if (idx.passages.has(ref)) {
        const item = idx.passages.get(ref);
        return sectionCard(item.title, `${mediaBadge('Audio', item.audioRef)}${renderPassage(item)}`, '跟读');
      }
      if (idx.extensions.has(ref)) {
        const item = idx.extensions.get(ref);
        return sectionCard(item.title, renderExtension(item), '彩蛋');
      }
      return '';
    }).join('');
  }

  const GROUPS = [
    ['vocabulary', 'Từ vựng'],
    ['properNouns', 'Danh từ riêng'],
    ['dialogues', 'Hội thoại'],
    ['languageNotes', 'Ghi chú'],
    ['grammar', 'Ngữ pháp'],
    ['examplesPractice', 'Ví dụ & bài luyện'],
    ['passages', 'Bài đọc / bài vè'],
    ['exercisesActivities', 'Bài tập & hoạt động'],
    ['extensions', 'Nội dung mở rộng']
  ];

  function availableGroups(lesson) {
    return GROUPS.filter(([key]) => (lesson.views.groupedIndex[key] || []).length > 0);
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
    if (!ids.length) return '';
    let body = '';
    if (key === 'vocabulary') body = renderVocabulary(ids.map(id => idx.vocabulary.get(id)).filter(Boolean));
    if (key === 'properNouns') body = renderProperNouns(ids.map(id => idx.properNouns.get(id)).filter(Boolean));
    if (key === 'dialogues') body = ids.map(id => {
      const item = idx.dialogues.get(id);
      return item ? `<article class="nhsk-group-block"><h3>${escapeHtml(item.sourceHeading.replace(/^\d+(?:\.\d+)*\.\s*/, ''))}</h3>${renderContext(item.context)}${renderDialogue(item)}</article>` : '';
    }).join('');
    if (key === 'languageNotes') body = renderNotes(ids.map(id => idx.languageNotes.get(id)).filter(Boolean));
    if (key === 'passages') body = ids.map(id => idx.passages.get(id)).filter(Boolean).map(item => `<article class="nhsk-group-block"><h3>${escapeHtml(item.title)}</h3>${mediaBadge('Audio', item.audioRef)}${renderPassage(item)}</article>`).join('');
    if (key === 'exercisesActivities') body = renderActivities(ids.map(id => idx.activities.get(id)).filter(Boolean));
    if (key === 'extensions') body = ids.map(id => idx.extensions.get(id)).filter(Boolean).map(renderExtension).join('');
    if (key === 'grammar') body = '<p>Không có mục ngữ pháp riêng trong Bài 1.</p>';
    if (key === 'examplesPractice') body = '<p>Không có mục ví dụ và bài luyện riêng trong Bài 1.</p>';
    return sectionCard(label, body);
  }

  function renderGrouped(lesson) {
    const idx = indexes(lesson);
    const sections = availableGroups(lesson)
      .filter(([key]) => state.filter === 'all' || state.filter === key)
      .map(([key, label]) => renderGroupedSection(key, label, lesson, idx))
      .join('');
    return `${renderGroupFilters(lesson)}${sections}`;
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

  function render() {
    if (state.loading) {
      root.innerHTML = '<section class="nhsk-loading"><span class="nhsk-spinner" aria-hidden="true"></span><span>Đang mở bài học...</span></section>';
      return;
    }
    if (state.error || !state.lesson) {
      root.innerHTML = `<section class="nhsk-error"><h1>Chưa mở được bài học</h1><p>${escapeHtml(state.error || 'Không tìm thấy dữ liệu.')}</p><a href="../hanzi-stroke/index.html?study=hsk&curriculum=new_hsk&level=1">Quay lại New HSK</a></section>`;
      return;
    }
    const lesson = state.lesson;
    root.classList.toggle('is-pinyin-hidden', !state.showPinyin);
    root.innerHTML = `
      <div class="nhsk-page">
        ${renderHero(lesson)}
        ${renderToolbar()}
        <div class="nhsk-content" data-nhsk-content>${state.view === 'book' ? renderBook(lesson) : renderGrouped(lesson)}</div>
        ${renderSourceAudit(lesson)}
      </div>`;
    saveSettings();
    syncUrl(true);
  }

  function bindEvents() {
    root.addEventListener('click', event => {
      const view = event.target.closest('[data-nhsk-view]');
      if (view) {
        state.view = view.dataset.nhskView === 'grouped' ? 'grouped' : 'book';
        state.filter = 'all';
        render();
        return;
      }
      const pinyin = event.target.closest('[data-nhsk-pinyin]');
      if (pinyin) {
        state.showPinyin = !state.showPinyin;
        render();
        return;
      }
      const filter = event.target.closest('[data-nhsk-filter]');
      if (filter) {
        state.filter = filter.dataset.nhskFilter || 'all';
        render();
        return;
      }
      const speakButton = event.target.closest('[data-nhsk-speak]');
      if (speakButton) {
        event.preventDefault();
        speak(speakButton.dataset.nhskSpeak || '');
      }
    });
  }

  async function load() {
    bindEvents();
    try {
      const manifestResponse = await fetch('data/manifest.json', { cache: 'no-store' });
      if (!manifestResponse.ok) throw new Error(`Không tải được manifest (${manifestResponse.status}).`);
      state.manifest = await manifestResponse.json();
      const lessonInfo = state.manifest.lessons.find(item => item.level === state.level && item.lessonNumber === state.lessonNumber);
      if (!lessonInfo) throw new Error(`Bản thử nghiệm hiện mới có HSK ${state.level} Bài ${state.lessonNumber}.`);
      const lessonResponse = await fetch(`data/${lessonInfo.path}`, { cache: 'no-store' });
      if (!lessonResponse.ok) throw new Error(`Không tải được dữ liệu bài học (${lessonResponse.status}).`);
      state.lesson = await lessonResponse.json();
      document.title = `${state.lesson.title.vi} · New HSK ${state.lesson.level}`;
      state.loading = false;
      render();
      window.setTimeout(() => window.TiengTrungLearningHistory?.recordCurrent?.(), 0);
    } catch (error) {
      state.loading = false;
      state.error = error instanceof Error ? error.message : String(error);
      render();
    }
  }

  window.NewHskCourse = Object.freeze({ getState: () => ({ ...state }), render });
  load();
})();

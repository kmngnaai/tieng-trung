(function (root) {
  'use strict';

  const App = root.PinyinApp = root.PinyinApp || {};
  App.assets = Object.freeze({ mascot: '../../assets/brand/mascot.png', mascotFallback: '../../assets/brand/mascot.png' });
  App.tabLabels = Object.freeze(['Học', 'Nghe', 'Quiz', 'Ôn', 'Tiến độ']);
  const rootNode = document.getElementById('app');
  let restoringView = false;
  let persistTimer = 0;
  let pendingDetailsAnchor = null;

  function currentViewKey() {
    const tab = App.state && App.state.tab || 'learn';
    if (tab === 'listen') return `listen:${App.state.ui.listenMode || 'lookup'}`;
    if (tab === 'learn') return `learn:${App.state.activeGroup || 'intro'}`;
    if (tab === 'review') return `review:${App.state.activeReviewGroup || 'not_started'}`;
    return tab;
  }

  function ensureViewPositions() {
    App.state.ui.viewPositions = App.state.ui.viewPositions && typeof App.state.ui.viewPositions === 'object'
      ? App.state.ui.viewPositions : {};
    return App.state.ui.viewPositions;
  }

  function captureViewState(key) {
    if (restoringView || !App.state || !rootNode.querySelector('.pinyin-module')) return null;
    const positions = ensureViewPositions();
    const record = {
      windowY: Math.max(0, Number(root.scrollY || root.pageYOffset || 0)),
      tabsScrollLeft: Number(document.querySelector('.pinyin-tabs')?.scrollLeft || 0),
      matrixScrollLeft: Number(document.querySelector('[data-pinyin-matrix-scroll]')?.scrollLeft || 0),
      miniTableScrollLeft: {}
    };
    document.querySelectorAll('[data-mini-table-scroll]').forEach(function (node) {
      const id = String(node.dataset.miniTableScroll || '');
      if (id) record.miniTableScrollLeft[id] = Number(node.scrollLeft || 0);
    });
    positions[key || currentViewKey()] = record;
    return record;
  }

  function centerActiveTabWithoutPageScroll() {
    const nav = document.querySelector('.pinyin-tabs');
    const active = nav && nav.querySelector('.pinyin-tab.is-active');
    if (!nav || !active) return;
    const target = active.offsetLeft - Math.max(0, (nav.clientWidth - active.offsetWidth) / 2);
    nav.scrollLeft = Math.max(0, target);
  }

  function restoreViewState(key, topIfMissing) {
    const positions = ensureViewPositions();
    const record = positions[key] || null;
    restoringView = true;

    const apply = function () {
      const nav = document.querySelector('.pinyin-tabs');
      if (nav) {
        if (record) nav.scrollLeft = Number(record.tabsScrollLeft || 0);
        else centerActiveTabWithoutPageScroll();
      }
      const matrix = document.querySelector('[data-pinyin-matrix-scroll]');
      if (matrix && record) matrix.scrollLeft = Number(record.matrixScrollLeft || 0);
      document.querySelectorAll('[data-mini-table-scroll]').forEach(function (node) {
        const id = String(node.dataset.miniTableScroll || '');
        if (record && id) node.scrollLeft = Number((record.miniTableScrollLeft || {})[id] || 0);
      });
      if (record) root.scrollTo({ top: Number(record.windowY || 0), left: 0, behavior: 'auto' });
      else if (topIfMissing) root.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    };

    root.requestAnimationFrame(function () {
      root.requestAnimationFrame(function () {
        apply();
        root.setTimeout(function () {
          apply();
          restoringView = false;
        }, 70);
      });
    });
  }

  function prepareVisibleAudio() {
    root.requestAnimationFrame(function () {
      const controls = Array.from(document.querySelectorAll('[data-action="play-syllable"], [data-action="play-inline-syllable"], [data-action="play-chart-syllable"], [data-action="play-table-syllable"]'));
      let prepared = 0;
      controls.some(function (button) {
        const rect = button.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > root.innerHeight) return false;
        App.audio.prepareSyllable(button.dataset.safe, Number(button.dataset.tone || App.state.tone || 2));
        prepared += 1;
        return prepared >= 8;
      });
    });
  }

  function render(options) {
    const opts = options || {};
    const screen = App.screens[App.state.tab] || App.screens.learn;
    rootNode.innerHTML = App.ui.shell(screen.render());
    restoreViewState(opts.restoreKey || currentViewKey(), !!opts.topIfMissing);
    prepareVisibleAudio();
  }

  function rerender() {
    const key = currentViewKey();
    captureViewState(key);
    App.store.save();
    render({ restoreKey: key });
  }

  function transition(mutator, options) {
    const fromKey = currentViewKey();
    captureViewState(fromKey);
    mutator();
    App.store.save();
    render({ restoreKey: currentViewKey(), topIfMissing: !options || options.topIfMissing !== false });
  }

  function chooseRandom(array) { return array[Math.floor(Math.random() * array.length)]; }

  function startQuiz(groupId) {
    const pool = App.screens.quiz.quizPool(groupId || App.state.activeGroup);
    if (!pool.length) { App.ui.toast('Nhóm này chưa có audio để tạo quiz.', 'warning'); return; }
    const item = chooseRandom(pool);
    const tones = [1,2,3,4].filter(tone => App.audio.exactSource(item, tone));
    const tone = chooseRandom(tones);
    transition(function () {
      App.state.activeGroup = groupId || App.state.activeGroup;
      App.state.quiz = { safe: item.safe, tone, answered: false, correct: false, feedback: '', groupId: App.state.activeGroup, heard: false };
      App.state.tab = 'quiz';
    });
  }

  function answerQuiz(tone) {
    const quiz = App.state.quiz;
    if (!quiz || quiz.answered) return;
    const correct = Number(tone) === Number(quiz.tone);
    const item = App.data.syllable(quiz.safe);
    const p = App.store.progress('syllable', quiz.safe);
    App.store.patchProgress('syllable', quiz.safe, {
      quizAttempts: Number(p.quizAttempts || 0) + 1,
      quizCorrect: Number(p.quizCorrect || 0) + (correct ? 1 : 0),
      wrong: Number(p.wrong || 0) + (correct ? 0 : 1),
      lastReviewedAt: App.store.nowIso()
    });
    quiz.answered = true;
    quiz.correct = correct;
    quiz.feedback = correct ? `Đúng: ${App.utils.markTone(item.pinyin, quiz.tone)}` : `Sai. Đáp án đúng là thanh ${quiz.tone}: ${App.utils.markTone(item.pinyin, quiz.tone)}`;
    rerender();
  }

  function getShadowing(id) { return (App.model.shadowing.sentences || []).find(item => item.id === id); }

  function selectionKeyFor(button) {
    return button && (button.dataset.audioKey || button.dataset.selectionKey || '');
  }

  function updateSelectionDom() {
    const selectedKey = String(App.state.ui.selectedAudioKey || '');
    document.querySelectorAll('[data-audio-key], [data-selection-key]').forEach(function (node) {
      node.classList.toggle('is-selected', selectionKeyFor(node) === selectedKey);
    });
    document.querySelectorAll('[data-matrix-safe]').forEach(function (cell) {
      const button = cell.querySelector('[data-audio-key]');
      cell.classList.toggle('is-selected', !!button && selectionKeyFor(button) === selectedKey);
    });
    document.querySelectorAll('[data-select-safe]').forEach(function (node) {
      node.classList.toggle('is-selected', node.dataset.selectSafe === App.state.selected);
    });
  }

  function selectInteraction(button) {
    const safe = button && button.dataset.safe;
    const tone = Number(button && button.dataset.tone || 0);
    const key = selectionKeyFor(button) || (safe && tone ? App.ui.audioKey(safe, tone) : '');
    if (safe) App.state.selected = safe;
    if (tone) App.state.tone = tone;
    App.state.ui.selectedAudioKey = key;
    App.state.ui.selectedAudioContext = String(button && button.dataset.selectionContext || '');
    App.store.save();
    updateSelectionDom();
    try { button.focus({ preventScroll: true }); } catch (_error) {}
  }

  async function playSyllableButton(button) {
    selectInteraction(button);
    await App.audio.playSyllable(button.dataset.safe, Number(button.dataset.tone || App.state.tone || 2), button);
    renderStatusOnly();
  }

  async function playMiniTable(button) {
    const tableNo = Number(button.dataset.tableNo || 0);
    const table = (App.model.pinyin.miniTables || []).find(row => Number(row.no) === tableNo);
    if (!table) return;
    selectInteraction(button);
    const safes = App.screens.listen.tableSafes(table);
    await App.audio.playExactSequence(safes, Number(App.state.tone || 2), button);
    renderStatusOnly();
  }

  async function handleClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const audioActions = ['play-syllable', 'play-inline-syllable', 'play-chart-syllable', 'play-table-syllable', 'play-mini-table', 'play-shadowing'];
    if (audioActions.includes(action)) event.preventDefault();

    if (action === 'set-tab') {
      transition(function () { App.audio.stop(); App.state.tab = button.dataset.tab; });
    } else if (action === 'set-listen-mode') {
      transition(function () { App.audio.stop(); App.state.ui.listenMode = button.dataset.mode; });
    } else if (action === 'select-syllable') {
      const key = currentViewKey();
      captureViewState(key);
      App.state.selected = button.dataset.safe;
      App.state.ui.selectedAudioKey = '';
      App.store.save();
      render({ restoreKey: key });
    } else if (action === 'set-tone') {
      const key = currentViewKey();
      captureViewState(key);
      App.state.tone = Number(button.dataset.tone);
      App.state.ui.selectedAudioKey = '';
      App.store.save();
      render({ restoreKey: key });
    } else if (action === 'play-syllable' || action === 'play-inline-syllable' || action === 'play-chart-syllable' || action === 'play-table-syllable') {
      await playSyllableButton(button);
    } else if (action === 'play-mini-table') {
      await playMiniTable(button);
    } else if (action === 'play-shadowing') {
      const item = getShadowing(button.dataset.id);
      if (item) { selectInteraction(button); await App.audio.playShadowing(item, button); renderStatusOnly(); }
    } else if (action === 'toggle-progress') {
      App.store.toggle(button.dataset.type, button.dataset.id, button.dataset.field); rerender();
    } else if (action === 'add-wrong') {
      App.store.addWrong(button.dataset.type, button.dataset.id); rerender();
    } else if (action === 'clear-wrong') {
      App.store.clearWrong(button.dataset.type, button.dataset.id); rerender();
    } else if (action === 'load-more-group') {
      App.state.ui.groupVisible[button.dataset.group] = Number(App.state.ui.groupVisible[button.dataset.group] || 24) + 24; rerender();
    } else if (action === 'load-more-review') {
      App.state.ui.reviewVisible = Number(App.state.ui.reviewVisible || 80) + 80; rerender();
    } else if (action === 'select-review-group') {
      transition(function () { App.state.activeReviewGroup = button.dataset.group; App.state.ui.reviewVisible = 80; }, { topIfMissing: false });
    } else if (action === 'start-quiz') {
      startQuiz(button.dataset.group || App.state.activeGroup);
    } else if (action === 'answer-quiz') {
      answerQuiz(Number(button.dataset.tone));
    } else if (action === 'next-quiz') {
      startQuiz(App.state.quiz && App.state.quiz.groupId);
    } else if (action === 'reset-quiz') {
      App.state.quiz = null; rerender();
    } else if (action === 'submit-search') {
      const item = App.data.findSyllable(App.state.search);
      if (item) {
        const key = currentViewKey(); captureViewState(key); App.state.selected = item.safe; App.state.ui.selectedAudioKey = ''; App.store.save(); render({ restoreKey: key });
      } else App.ui.toast('Không tìm thấy âm này.', 'warning');
    } else if (action === 'open-review') {
      transition(function () { App.state.activeReviewGroup = button.dataset.group; App.state.tab = 'review'; });
    } else if (action === 'open-group') {
      transition(function () { App.state.activeGroup = button.dataset.group; App.state.tab = 'learn'; });
    }
  }

  function handleChange(event) {
    const node = event.target;
    const action = node.dataset.action;
    if (action === 'select-group') {
      transition(function () { App.state.activeGroup = node.value; });
    } else if (action === 'select-quiz-group') {
      const key = currentViewKey(); captureViewState(key); App.state.activeGroup = node.value; App.state.quiz = null; App.store.save(); render({ restoreKey: key });
    } else if (action === 'select-review-group') {
      transition(function () { App.state.activeReviewGroup = node.dataset.group || node.value; App.state.ui.reviewVisible = 80; }, { topIfMissing: false });
    } else if (action === 'filter-initial') {
      App.state.initialGroup = node.value; rerender();
    } else if (action === 'filter-final') {
      App.state.finalGroup = node.value; rerender();
    } else if (action === 'toggle-hide-empty') {
      App.state.hideEmpty = node.checked; rerender();
    }
  }

  function handleInput(event) {
    if (event.target.dataset.action === 'search-syllable') {
      App.state.search = event.target.value;
      App.store.save();
    }
  }

  function handleKeydown(event) {
    if (event.key === 'Enter' && event.target.dataset.action === 'search-syllable') {
      const item = App.data.findSyllable(event.target.value);
      if (item) {
        const key = currentViewKey(); captureViewState(key); App.state.selected = item.safe; App.state.ui.selectedAudioKey = ''; App.store.save(); render({ restoreKey: key });
      }
    }
  }

  function renderStatusOnly() {
    document.querySelectorAll('[data-syllable-card]').forEach(function (card) {
      const safe = card.dataset.syllableCard;
      const row = card.querySelector('.status-row');
      if (row) row.innerHTML = App.ui.statusChips('syllable', safe);
    });
  }

  function handlePointerDown(event) {
    const audioButton = event.target.closest('[data-action="play-syllable"], [data-action="play-inline-syllable"], [data-action="play-chart-syllable"], [data-action="play-table-syllable"]');
    if (audioButton && audioButton.dataset.safe) {
      App.audio.prepareSyllable(audioButton.dataset.safe, Number(audioButton.dataset.tone || App.state.tone || 2));
    }
    const summary = event.target.closest('summary');
    const details = summary && summary.parentElement;
    if (!details || (!details.dataset.miniTableId && !details.dataset.ruleCategoryId)) return;
    pendingDetailsAnchor = {
      details,
      top: summary.getBoundingClientRect().top,
      wasOpen: details.open
    };
  }

  function handleToggle(event) {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement)) return;
    const miniId = String(details.dataset.miniTableId || '');
    const ruleId = String(details.dataset.ruleCategoryId || '');
    if (miniId) App.state.ui.openMiniTables[miniId] = !!details.open;
    if (ruleId) App.state.ui.openRuleCategories[ruleId] = !!details.open;
    if (!miniId && !ruleId) return;
    App.store.save();

    if (pendingDetailsAnchor && pendingDetailsAnchor.details === details && pendingDetailsAnchor.wasOpen && !details.open) {
      const wantedTop = pendingDetailsAnchor.top;
      root.requestAnimationFrame(function () {
        const summary = details.querySelector('summary');
        if (!summary) return;
        const delta = summary.getBoundingClientRect().top - wantedTop;
        if (Math.abs(delta) > 1) root.scrollBy({ top: delta, left: 0, behavior: 'auto' });
      });
    }
    pendingDetailsAnchor = null;
  }

  function schedulePersistView() {
    if (restoringView || !App.state) return;
    root.clearTimeout(persistTimer);
    persistTimer = root.setTimeout(function () {
      captureViewState(currentViewKey());
      App.store.save();
    }, 180);
  }

  async function init() {
    try {
      if ('scrollRestoration' in root.history) root.history.scrollRestoration = 'manual';
      App.store.load();
      await App.data.load();
      if (!App.state.selected) {
        const first = App.model.syllables.find(item => item.hasAudio) || App.model.syllables[0];
        App.state.selected = first ? first.safe : '';
      }
      if (!App.data.learningGroup(App.state.activeGroup)) App.state.activeGroup = App.model.groups.defaultLearningGroup || 'intro';
      if (!App.data.reviewGroups().some(group => group.id === App.state.activeReviewGroup)) App.state.activeReviewGroup = App.model.groups.defaultReviewGroup || 'not_started';
      App.store.save();
      render({ restoreKey: currentViewKey() });
      if (root.TiengTrungAppShell && typeof root.TiengTrungAppShell.recordCurrentLearningLocation === 'function') {
        root.TiengTrungAppShell.recordCurrentLearningLocation();
      }
    } catch (error) {
      console.error(error);
      rootNode.innerHTML = `<section class="load-error"><h1>Không tải được Pinyin</h1><p>${App.utils.escapeHtml(error.message)}</p><button type="button" onclick="location.reload()">Thử lại</button></section>`;
    }
  }

  document.addEventListener('click', handleClick);
  document.addEventListener('change', handleChange);
  document.addEventListener('input', handleInput);
  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('pointerdown', handlePointerDown, true);
  document.addEventListener('toggle', handleToggle, true);
  document.addEventListener('scroll', schedulePersistView, true);
  root.addEventListener('scroll', schedulePersistView, { passive: true });
  root.addEventListener('pagehide', function () { captureViewState(currentViewKey()); App.store.save(); });
  App.render = render;
  App.navigation = { currentViewKey, captureViewState, restoreViewState, updateSelectionDom };
  init();
})(window);

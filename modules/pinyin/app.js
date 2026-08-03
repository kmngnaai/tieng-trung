(function (root) {
  'use strict';

  const App = root.PinyinApp = root.PinyinApp || {};
  App.assets = Object.freeze({ mascot: '../../assets/brand/mascot.png', mascotFallback: '../../assets/brand/mascot.png' });
  App.tabLabels = Object.freeze(['Học', 'Nghe', 'Quiz', 'Ôn', 'Tiến độ']);
  const rootNode = document.getElementById('app');

  function render() {
    const screen = App.screens[App.state.tab] || App.screens.learn;
    rootNode.innerHTML = App.ui.shell(screen.render());
    requestAnimationFrame(function () {
      const active = document.querySelector('.pinyin-tab.is-active');
      if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    });
  }

  function chooseRandom(array) { return array[Math.floor(Math.random() * array.length)]; }

  function startQuiz(groupId) {
    const pool = App.screens.quiz.quizPool(groupId || App.state.activeGroup);
    if (!pool.length) { App.ui.toast('Nhóm này chưa có audio để tạo quiz.', 'warning'); return; }
    const item = chooseRandom(pool);
    const tones = [1,2,3,4].filter(tone => App.audio.exactSource(item, tone));
    const tone = chooseRandom(tones);
    App.state.activeGroup = groupId || App.state.activeGroup;
    App.state.quiz = { safe: item.safe, tone, answered: false, correct: false, feedback: '', groupId: App.state.activeGroup, heard: false };
    App.state.tab = 'quiz';
    App.store.save();
    render();
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
    App.store.save();
    render();
  }

  function getShadowing(id) { return (App.model.shadowing.sentences || []).find(item => item.id === id); }

  function updateMatrixSelection(safe) {
    document.querySelectorAll('[data-matrix-safe].is-selected').forEach(node => node.classList.remove('is-selected'));
    document.querySelectorAll(`[data-matrix-safe="${String(safe || '').replace(/"/g, '\"')}"]`).forEach(node => node.classList.add('is-selected'));
  }

  async function playInlineSyllable(button) {
    const safe = button.dataset.safe;
    const tone = Number(button.dataset.tone || App.state.tone || 2);
    App.state.selected = safe;
    App.store.save();
    updateMatrixSelection(safe);
    await App.audio.playSyllable(safe, tone, button);
    renderStatusOnly();
  }

  async function playMiniTable(button) {
    const tableNo = Number(button.dataset.tableNo || 0);
    const table = (App.model.pinyin.miniTables || []).find(row => Number(row.no) === tableNo);
    if (!table) return;
    const safes = App.screens.listen.tableSafes(table);
    await App.audio.playExactSequence(safes, Number(App.state.tone || 2), button);
    renderStatusOnly();
  }

  async function handleClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;

    if (action === 'set-tab') { App.audio.stop(); App.state.tab = button.dataset.tab; App.store.save(); render(); window.scrollTo(0, 0); }
    else if (action === 'set-listen-mode') { App.state.ui.listenMode = button.dataset.mode; App.store.save(); render(); }
    else if (action === 'select-syllable') { App.state.selected = button.dataset.safe; App.store.save(); render(); }
    else if (action === 'set-tone') { App.state.tone = Number(button.dataset.tone); App.store.save(); render(); }
    else if (action === 'play-syllable') { await App.audio.playSyllable(button.dataset.safe, Number(button.dataset.tone), button); renderStatusOnly(); }
    else if (action === 'play-inline-syllable' || action === 'play-chart-syllable' || action === 'play-table-syllable') { await playInlineSyllable(button); }
    else if (action === 'play-mini-table') { await playMiniTable(button); }
    else if (action === 'play-shadowing') { const item = getShadowing(button.dataset.id); if (item) await App.audio.playShadowing(item, button); renderStatusOnly(); }
    else if (action === 'toggle-progress') { App.store.toggle(button.dataset.type, button.dataset.id, button.dataset.field); render(); }
    else if (action === 'add-wrong') { App.store.addWrong(button.dataset.type, button.dataset.id); render(); }
    else if (action === 'clear-wrong') { App.store.clearWrong(button.dataset.type, button.dataset.id); render(); }
    else if (action === 'load-more-group') { const id = button.dataset.group; App.state.ui.groupVisible[id] = Number(App.state.ui.groupVisible[id] || 24) + 24; App.store.save(); render(); }
    else if (action === 'load-more-review') { App.state.ui.reviewVisible = Number(App.state.ui.reviewVisible || 80) + 80; App.store.save(); render(); }
    else if (action === 'select-review-group') { App.state.activeReviewGroup = button.dataset.group; App.state.ui.reviewVisible = 80; App.store.save(); render(); }
    else if (action === 'start-quiz') startQuiz(button.dataset.group || App.state.activeGroup);
    else if (action === 'answer-quiz') answerQuiz(Number(button.dataset.tone));
    else if (action === 'next-quiz') startQuiz(App.state.quiz && App.state.quiz.groupId);
    else if (action === 'reset-quiz') { App.state.quiz = null; App.store.save(); render(); }
    else if (action === 'submit-search') { const item = App.data.findSyllable(App.state.search); if (item) { App.state.selected = item.safe; App.store.save(); render(); } else App.ui.toast('Không tìm thấy âm này.', 'warning'); }
    else if (action === 'open-review') { App.state.activeReviewGroup = button.dataset.group; App.state.tab = 'review'; App.store.save(); render(); }
    else if (action === 'open-group') { App.state.activeGroup = button.dataset.group; App.state.tab = 'learn'; App.store.save(); render(); }
  }

  function handleChange(event) {
    const node = event.target;
    const action = node.dataset.action;
    if (action === 'select-group') { App.state.activeGroup = node.value; App.store.save(); render(); }
    else if (action === 'select-quiz-group') { App.state.activeGroup = node.value; App.state.quiz = null; App.store.save(); render(); }
    else if (action === 'select-review-group') { App.state.activeReviewGroup = node.dataset.group || node.value; App.state.ui.reviewVisible = 80; App.store.save(); render(); }
    else if (action === 'filter-initial') { App.state.initialGroup = node.value; App.store.save(); render(); }
    else if (action === 'filter-final') { App.state.finalGroup = node.value; App.store.save(); render(); }
    else if (action === 'toggle-hide-empty') { App.state.hideEmpty = node.checked; App.store.save(); render(); }
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
      if (item) { App.state.selected = item.safe; App.store.save(); render(); }
    }
  }

  function renderStatusOnly() {
    document.querySelectorAll('[data-syllable-card]').forEach(function (card) {
      const safe = card.dataset.syllableCard;
      const row = card.querySelector('.status-row');
      if (row) row.innerHTML = App.ui.statusChips('syllable', safe);
    });
  }

  function handleToggle(event) {
    const details = event.target.closest && event.target.closest('[data-mini-table-id]');
    if (!details || event.target !== details) return;
    const id = String(details.dataset.miniTableId || '');
    if (!id) return;
    App.state.ui.openMiniTables[id] = !!details.open;
    App.store.save();
  }

  async function init() {
    try {
      App.store.load();
      await App.data.load();
      if (!App.state.selected) {
        const first = App.model.syllables.find(item => item.hasAudio) || App.model.syllables[0];
        App.state.selected = first ? first.safe : '';
      }
      if (!App.data.learningGroup(App.state.activeGroup)) App.state.activeGroup = App.model.groups.defaultLearningGroup || 'intro';
      if (!App.data.reviewGroups().some(group => group.id === App.state.activeReviewGroup)) App.state.activeReviewGroup = App.model.groups.defaultReviewGroup || 'not_started';
      App.store.save();
      render();
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
  document.addEventListener('toggle', handleToggle, true);
  App.render = render;
  init();
})(window);

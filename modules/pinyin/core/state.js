(function (root) {
  'use strict';

  const App = root.PinyinApp = root.PinyinApp || {};
  const LS_KEY = 'tiengtrung_pinyin_v12_state';
  const TAB_MIGRATION = Object.freeze({ chart: 'listen', groups: 'listen', rules: 'listen', practice: 'quiz' });
  const defaults = {
    tab: 'learn', selected: '', tone: 2, search: '', finalGroup: 'all', initialGroup: 'all', hideEmpty: false,
    learned: {}, favorite: {}, wrong: {}, quiz: null, chartMode: 'cards', activeGroup: 'intro', activeReviewGroup: 'not_started',
    progress: { syllables: {}, hanzi: {}, shadowing: {} },
    ui: { listenMode: 'lookup', groupVisible: {}, reviewVisible: 80, openMiniTables: {} }
  };
  let state = null;

  function nowIso() { return new Date().toISOString(); }
  function safeObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }

  function ensureShape(candidate) {
    const next = Object.assign({}, defaults, safeObject(candidate));
    next.tab = TAB_MIGRATION[next.tab] || next.tab;
    if (!['learn', 'listen', 'quiz', 'review', 'progress'].includes(next.tab)) next.tab = 'learn';
    next.learned = safeObject(next.learned);
    next.favorite = safeObject(next.favorite);
    next.wrong = safeObject(next.wrong);
    next.progress = safeObject(next.progress);
    next.progress.syllables = safeObject(next.progress.syllables);
    next.progress.hanzi = safeObject(next.progress.hanzi);
    next.progress.shadowing = safeObject(next.progress.shadowing);
    next.ui = Object.assign({}, defaults.ui, safeObject(next.ui));
    next.ui.groupVisible = safeObject(next.ui.groupVisible);
    next.ui.openMiniTables = safeObject(next.ui.openMiniTables);

    Object.keys(next.learned).forEach(function (safe) {
      if (!next.learned[safe]) return;
      const p = next.progress.syllables[safe] = safeObject(next.progress.syllables[safe]);
      p.learned = true;
      p.learnedAt = p.learnedAt || nowIso();
    });
    Object.keys(next.wrong).forEach(function (safe) {
      const count = Number(next.wrong[safe] || 0);
      if (!count) return;
      const p = next.progress.syllables[safe] = safeObject(next.progress.syllables[safe]);
      p.wrong = Math.max(Number(p.wrong || 0), count);
    });
    return next;
  }

  function load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (_error) {}
    state = ensureShape(saved);
    App.state = state;
    return state;
  }

  function save() {
    if (!state) return;
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (_error) {}
  }

  function bucket(type) {
    if (type === 'syllable') return 'syllables';
    if (type === 'shadowing') return 'shadowing';
    return 'hanzi';
  }

  function progress(type, id) {
    const name = bucket(type);
    state.progress[name][id] = safeObject(state.progress[name][id]);
    return state.progress[name][id];
  }

  function patchProgress(type, id, patch) {
    const current = progress(type, id);
    Object.assign(current, patch || {}, { updatedAt: nowIso() });
    if (type === 'syllable') {
      if (current.learned || current.heard) state.learned[id] = true;
      else delete state.learned[id];
      if (Number(current.wrong || 0)) state.wrong[id] = Number(current.wrong || 0);
      else delete state.wrong[id];
    }
    save();
    return current;
  }

  function markHeard(type, id) {
    const current = progress(type, id);
    return patchProgress(type, id, {
      heard: true, heardAt: current.heardAt || nowIso(),
      learned: type === 'syllable' ? true : current.learned,
      learnedAt: type === 'syllable' ? (current.learnedAt || nowIso()) : current.learnedAt,
      lastReviewedAt: nowIso()
    });
  }

  function toggle(type, id, field) {
    const current = progress(type, id);
    const value = !current[field];
    const patch = { [field]: value, lastReviewedAt: nowIso() };
    if (value) patch[`${field}At`] = current[`${field}At`] || nowIso();
    return patchProgress(type, id, patch);
  }

  function addWrong(type, id) {
    const current = progress(type, id);
    return patchProgress(type, id, { wrong: Number(current.wrong || 0) + 1, lastReviewedAt: nowIso() });
  }

  function clearWrong(type, id) { return patchProgress(type, id, { wrong: 0, lastReviewedAt: nowIso() }); }

  App.store = { LS_KEY, defaults, load, save, progress, patchProgress, markHeard, toggle, addWrong, clearWrong, nowIso };
})(window);

(function (root) {
  'use strict';

  const App = root.PinyinApp = root.PinyinApp || {};

  function thresholds() {
    return Object.assign({ wrongManyMin: 3, dueAfterHours: 24, masteredQuizCorrectMin: 3, masteredWrongMax: 0 },
      (App.model && App.model.review && App.model.review.thresholds) || {});
  }

  function hasActivity(p) {
    return !!(p && (p.heard || p.learned || p.shadowed || p.mastered || Number(p.quizAttempts || 0) || Number(p.wrong || 0)));
  }

  function isMastered(type, p) {
    const limits = thresholds();
    if (p.mastered) return true;
    if (type === 'syllable') {
      return !!p.heard && Number(p.quizCorrect || 0) >= Number(limits.masteredQuizCorrectMin) && Number(p.wrong || 0) <= Number(limits.masteredWrongMax);
    }
    return !!p.mastered;
  }

  function isDue(type, p) {
    if (!hasActivity(p) || isMastered(type, p)) return false;
    if (Number(p.wrong || 0) > 0) return true;
    const value = p.lastReviewedAt || p.updatedAt || p.learnedAt || p.heardAt;
    if (!value) return true;
    const elapsed = Date.now() - new Date(value).getTime();
    return elapsed >= Number(thresholds().dueAfterHours) * 3600000;
  }

  function syllableCanListen(item) {
    return [1,2,3,4].some(tone => {
      const source = App.audio.availability(item, tone);
      return source.status === 'mp3' || source.status === 'device';
    });
  }

  function syllableCanQuiz(item) {
    return [1,2,3,4].some(tone => !!App.audio.exactSource(item, tone));
  }

  function recordCanPractice(record) {
    if (record.type === 'syllable') return syllableCanListen(record.item);
    if (record.type === 'shadowing') return App.audio.inspectShadowing(record.item).ready;
    return false;
  }

  function allRecords() {
    if (!App.model) return [];
    const syllables = App.model.syllables.map(function (item) {
      return {
        type: 'syllable', id: item.safe, title: item.pinyin,
        subtitle: `${item.initialLabel || '∅'} + ${item.chartFinal || item.final || ''}`,
        item, progress: App.store.progress('syllable', item.safe)
      };
    });
    const shadowing = (App.model.shadowing.sentences || []).map(function (item) {
      return { type: 'shadowing', id: item.id, title: item.zh, subtitle: item.pinyin, item, progress: App.store.progress('shadowing', item.id) };
    });
    return syllables.concat(shadowing);
  }

  function records(groupId) {
    const limits = thresholds();
    return allRecords().filter(function (record) {
      const p = record.progress;
      const practiceable = recordCanPractice(record);
      if (groupId === 'not_started') return practiceable && !hasActivity(p);
      if (groupId === 'due') return practiceable && isDue(record.type, p);
      if (groupId === 'wrong_many') return practiceable && Number(p.wrong || 0) >= Number(limits.wrongManyMin);
      if (groupId === 'unheard') return practiceable && !p.heard;
      if (groupId === 'unshadowed') return record.type === 'shadowing' && practiceable && !p.shadowed;
      if (groupId === 'unquizzed') return record.type === 'syllable' && syllableCanQuiz(record.item) && !Number(p.quizAttempts || 0);
      if (groupId === 'mastered') return practiceable && isMastered(record.type, p);
      return false;
    });
  }

  App.review = {
    thresholds,
    hasActivity,
    isMastered,
    isDue,
    syllableCanListen,
    syllableCanQuiz,
    recordCanPractice,
    allRecords,
    records
  };
})(window);

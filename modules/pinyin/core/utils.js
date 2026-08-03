(function (root) {
  'use strict';

  const App = root.PinyinApp = root.PinyinApp || {};
  const TONE_MARKS = {
    a: ['ā', 'á', 'ǎ', 'à'], e: ['ē', 'é', 'ě', 'è'], i: ['ī', 'í', 'ǐ', 'ì'],
    o: ['ō', 'ó', 'ǒ', 'ò'], u: ['ū', 'ú', 'ǔ', 'ù'], ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ']
  };
  const TONE_CHAR = {
    ā: ['a', 1], á: ['a', 2], ǎ: ['a', 3], à: ['a', 4],
    ē: ['e', 1], é: ['e', 2], ě: ['e', 3], è: ['e', 4],
    ī: ['i', 1], í: ['i', 2], ǐ: ['i', 3], ì: ['i', 4],
    ō: ['o', 1], ó: ['o', 2], ǒ: ['o', 3], ò: ['o', 4],
    ū: ['u', 1], ú: ['u', 2], ǔ: ['u', 3], ù: ['u', 4],
    ǖ: ['ü', 1], ǘ: ['ü', 2], ǚ: ['ü', 3], ǜ: ['ü', 4],
    ü: ['ü', 0], Ü: ['ü', 0], v: ['ü', 0], V: ['ü', 0]
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch];
    });
  }

  function normalize(value) {
    return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/v/g, 'ü').trim();
  }

  function parseMarkedSyllable(value) {
    const plain = [];
    let tone = 0;
    for (const ch of String(value || '')) {
      const mapped = TONE_CHAR[ch];
      if (mapped) {
        plain.push(mapped[0]);
        if (mapped[1]) tone = mapped[1];
      } else if (/[a-z]/i.test(ch)) {
        plain.push(ch.toLowerCase());
      }
    }
    return { plain: plain.join('').replace(/v/g, 'ü'), tone };
  }

  function markTone(base, tone) {
    const syllable = String(base || '').replace(/v/g, 'ü').toLowerCase();
    const value = Number(tone || 0);
    if (!value || value < 1 || value > 4) return syllable;

    let index = -1;
    if (syllable.includes('a')) index = syllable.indexOf('a');
    else if (syllable.includes('e')) index = syllable.indexOf('e');
    else if (syllable.includes('ou')) index = syllable.indexOf('o');
    else {
      for (let i = syllable.length - 1; i >= 0; i -= 1) {
        if ('aeiouü'.includes(syllable[i])) { index = i; break; }
      }
    }
    if (index < 0 || !TONE_MARKS[syllable[index]]) return syllable;
    const marked = TONE_MARKS[syllable[index]][value - 1];
    return syllable.slice(0, index) + marked + syllable.slice(index + 1);
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(date);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value || 0)));
  }

  App.utils = { escapeHtml, normalize, parseMarkedSyllable, markTone, formatDate, clamp };
})(window);

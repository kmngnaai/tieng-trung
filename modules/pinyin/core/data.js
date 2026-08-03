(function (root) {
  'use strict';

  const App = root.PinyinApp = root.PinyinApp || {};
  const FILES = Object.freeze({
    pinyin: 'data/pinyin.json',
    groups: 'data/pinyin_groups.json',
    required: 'data/required_syllables.json',
    shadowing: 'data/shadowing_sentences.json',
    review: 'data/review_rules.json',
    rules: 'data/pinyin_rules.json',
    fallbacks: 'data/pinyin_hanzi_fallbacks.json',
    audioAudit: 'data/audio_audit.json'
  });

  async function fetchJson(url, optional) {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) {
      if (optional) return null;
      throw new Error(`Không tải được ${url}: HTTP ${response.status}`);
    }
    return response.json();
  }

  async function load() {
    const [pinyin, groups, required, shadowing, review, rules, fallbacks, audioAudit] = await Promise.all([
      fetchJson(FILES.pinyin),
      fetchJson(FILES.groups),
      fetchJson(FILES.required),
      fetchJson(FILES.shadowing),
      fetchJson(FILES.review),
      fetchJson(FILES.rules),
      fetchJson(FILES.fallbacks),
      fetchJson(FILES.audioAudit, true)
    ]);

    const fallbackItems = (fallbacks && fallbacks.items) || {};
    const syllables = Array.isArray(required.syllables) && required.syllables.length
      ? required.syllables
      : (pinyin.items || []);
    const bySafe = new Map();
    const byPlain = new Map();
    syllables.forEach(function (row) {
      if (!row || !row.safe) return;
      const sourceRow = (pinyin.items || []).find(item => item.safe === row.safe) || {};
      const full = Object.assign({}, row, sourceRow);
      full.fallback = fallbackItems[full.safe] || null;
      full.hasExactAudio = Object.keys(full.audio || {}).some(tone => !!full.audio[tone]);
      full.hasVerifiedFallback = !!(full.fallback && full.fallback.status === 'verified' &&
        Object.values(full.fallback.tones || {}).some(entry => entry && entry.verified && entry.hanzi));
      full.needsVerification = !!(full.fallback && full.fallback.status === 'needs_verification');
      bySafe.set(full.safe, full);
      byPlain.set(App.utils.normalize(full.pinyin), full);
      byPlain.set(App.utils.normalize(full.safe), full);
    });

    const model = {
      pinyin,
      groups,
      required,
      shadowing,
      review,
      rules,
      fallbacks,
      audioAudit: audioAudit || {},
      syllables: Array.from(bySafe.values()),
      bySafe,
      byPlain
    };
    App.model = model;
    return model;
  }

  function syllable(safe) { return App.model && App.model.bySafe.get(safe); }
  function findSyllable(query) { return App.model && App.model.byPlain.get(App.utils.normalize(query)); }
  function learningGroups() {
    return (((App.model && App.model.groups.learningGroups) || [])
      .filter(group => group && group.contentType !== 'hanzi'));
  }
  function reviewGroups() { return (App.model && App.model.groups.reviewGroups) || []; }
  function learningGroup(id) { return learningGroups().find(group => group.id === id) || learningGroups()[0] || null; }

  function groupItems(group) {
    if (!group || !App.model) return [];
    if (group.contentType === 'syllable') return (group.items || []).map(syllable).filter(Boolean);
    if (group.contentType === 'shadowing') return App.model.shadowing.sentences || [];
    return [];
  }

  function fallback(safe, tone) {
    const item = syllable(safe);
    if (!item || !item.fallback || item.fallback.status !== 'verified') return null;
    const entry = (item.fallback.tones || {})[String(Number(tone || 0))];
    return entry && entry.verified && entry.hanzi ? entry : null;
  }

  App.data = {
    FILES,
    load,
    syllable,
    findSyllable,
    learningGroups,
    reviewGroups,
    learningGroup,
    groupItems,
    fallback
  };
})(window);

(function(root, factory){
  if(typeof module === 'object' && module.exports) module.exports = factory();
  else root.TiengTrungMatching = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const runtime = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : {});
  const SETTINGS_KEY = 'tieng-trung-interaction-settings-v1';
  const DEFAULT_SETTINGS = Object.freeze({ tapHanziSpeak: true, matchingShowPinyin: true });

  function clean(value){ return String(value == null ? '' : value).trim(); }
  function escapeHtml(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function stableId(value, prefix){
    let hash = 2166136261;
    const text = String(value || '');
    for(let i=0;i<text.length;i+=1){ hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return `${prefix || 'match'}-${(hash >>> 0).toString(36)}`;
  }
  function readSettings(){
    try{
      const saved = JSON.parse(runtime.localStorage && runtime.localStorage.getItem(SETTINGS_KEY) || '{}');
      return {
        tapHanziSpeak: saved.tapHanziSpeak !== false,
        matchingShowPinyin: saved.matchingShowPinyin !== false
      };
    }catch(_err){ return { ...DEFAULT_SETTINGS }; }
  }
  function writeSettings(next){
    const settings = { ...readSettings(), ...(next || {}) };
    try{ runtime.localStorage && runtime.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }catch(_err){}
    return settings;
  }
  function setSetting(name, value){ return writeSettings({ [name]: Boolean(value) }); }

  function normalizePair(input, index){
    const leftText = clean(input && (input.leftText || input.hanzi || input.text || input.word));
    const rightText = clean(input && (input.rightText || input.meaning || input.meaningVi || input.vi));
    if(!leftText || !rightText) return null;
    const canonicalItemId = clean(input.canonicalItemId || input.id || stableId(`${leftText}|${rightText}`, 'item'));
    const id = clean(input.pairId || input.id || stableId(`${canonicalItemId}|${leftText}|${rightText}|${index}`, 'pair'));
    return {
      id,
      canonicalItemId,
      leftText,
      pinyin: clean(input.pinyin),
      rightText,
      speechText: clean(input.speechText || leftText),
      sourceType: clean(input.sourceType),
      sourceId: clean(input.sourceId),
      groupId: clean(input.groupId),
      groupKind: clean(input.groupKind),
      meta: input.meta && typeof input.meta === 'object' ? input.meta : {}
    };
  }
  function normalizePairs(items){
    const seen = new Set();
    return (Array.isArray(items) ? items : []).map(normalizePair).filter(pair => {
      if(!pair || seen.has(pair.id)) return false;
      seen.add(pair.id); return true;
    });
  }
  function shuffled(values, random){
    const out = [...values];
    const rand = typeof random === 'function' ? random : Math.random;
    for(let i=out.length-1;i>0;i-=1){ const j = Math.floor(rand() * (i+1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }
  function clampRoundSize(value, pairCount){
    const requested = Number(value) || 4;
    const max = pairCount <= 3 ? pairCount : 5;
    return Math.max(2, Math.min(max, requested, pairCount));
  }
  function makeRound(session){
    const pending = session.order.filter(id => !session.completedIds.includes(id));
    const ids = pending.slice(0, clampRoundSize(session.roundSize, pending.length || session.pairs.length));
    session.roundIds = ids;
    session.leftOrder = shuffled(ids);
    session.rightOrder = shuffled(ids);
    if(ids.length > 1 && session.rightOrder.every((id, index) => id === session.leftOrder[index])){
      session.rightOrder.push(session.rightOrder.shift());
    }
    session.selectedLeftId = '';
    session.selectedRightId = '';
    session.feedback = null;
    session.hintPairId = '';
    return session;
  }
  function createSession(items, options){
    const configured = options || {};
    const pairs = normalizePairs(items);
    const interaction = readSettings();
    const session = {
      version: 1,
      id: clean(configured.id || stableId(pairs.map(pair => pair.id).join('|'), 'matching-session')),
      title: clean(configured.title || 'Nối chữ'),
      subtitle: clean(configured.subtitle || ''),
      sourceKind: clean(configured.sourceKind || ''),
      pairs,
      order: shuffled(pairs.map(pair => pair.id)),
      roundSize: clampRoundSize(configured.roundSize || (pairs.length > 8 ? 5 : 4), pairs.length),
      roundIds: [], leftOrder: [], rightOrder: [],
      completedIds: [],
      selectedLeftId: '', selectedRightId: '',
      mistakesById: {},
      feedback: null,
      hintPairId: '',
      showPinyin: configured.showPinyin == null ? interaction.matchingShowPinyin : Boolean(configured.showPinyin),
      tapToSpeak: configured.tapToSpeak == null ? interaction.tapHanziSpeak : Boolean(configured.tapToSpeak),
      startedAt: configured.startedAt || new Date().toISOString(),
      finishedAt: ''
    };
    return makeRound(session);
  }
  function hydrateSession(saved, items, options){
    if(!saved || typeof saved !== 'object') return createSession(items, options);
    const freshPairs = normalizePairs(items);
    const byId = new Map(freshPairs.map(pair => [pair.id, pair]));
    const completedIds = (saved.completedIds || []).filter(id => byId.has(id));
    const order = (saved.order || []).filter(id => byId.has(id));
    freshPairs.forEach(pair => { if(!order.includes(pair.id)) order.push(pair.id); });
    const savedHintPairId = saved.hintPairId && byId.has(saved.hintPairId) && !completedIds.includes(saved.hintPairId) ? saved.hintPairId : '';
    const session = {
      ...createSession(freshPairs, options),
      ...saved,
      pairs: freshPairs,
      order,
      completedIds,
      mistakesById: saved.mistakesById && typeof saved.mistakesById === 'object' ? saved.mistakesById : {},
      selectedLeftId: '', selectedRightId: '', feedback: null,
      hintPairId: ''
    };
    makeRound(session);
    if(savedHintPairId && session.roundIds.includes(savedHintPairId)) session.hintPairId = savedHintPairId;
    return session;
  }
  function pairMap(session){ return new Map((session.pairs || []).map(pair => [pair.id, pair])); }
  function isRoundComplete(session){ return (session.roundIds || []).every(id => session.completedIds.includes(id)); }
  function isComplete(session){ return (session.pairs || []).length > 0 && session.completedIds.length >= session.pairs.length; }
  function select(session, side, pairId){
    if(!session || !['left','right'].includes(side) || !(session.roundIds || []).includes(pairId) || session.completedIds.includes(pairId)) return { status:'ignored' };
    if(session._feedbackTimer && typeof runtime.clearTimeout === 'function'){
      runtime.clearTimeout(session._feedbackTimer);
      session._feedbackTimer = null;
    }
    const key = side === 'left' ? 'selectedLeftId' : 'selectedRightId';
    session[key] = session[key] === pairId ? '' : pairId;
    session.feedback = null;
    if(session.tapToSpeak && side === 'left'){
      const pair = pairMap(session).get(pairId);
      session.pendingSpeechText = pair && pair.speechText || '';
    }else session.pendingSpeechText = '';
    if(!session.selectedLeftId || !session.selectedRightId) return { status:'selected', speechText: session.pendingSpeechText || '' };
    const leftId = session.selectedLeftId;
    const rightId = session.selectedRightId;
    session.selectedLeftId = '';
    session.selectedRightId = '';
    if(leftId === rightId){
      if(!session.completedIds.includes(leftId)) session.completedIds.push(leftId);
      if(session.hintPairId === leftId) session.hintPairId = '';
      session.feedback = { type:'correct', pairId:leftId };
      if(isComplete(session)) session.finishedAt = new Date().toISOString();
      return { status:'correct', pairId:leftId, speechText: session.pendingSpeechText || '', roundComplete:isRoundComplete(session), complete:isComplete(session) };
    }
    // Đánh giá theo mục chữ Hán đang được hỏi. Nghĩa sai chỉ là lựa chọn gây nhiễu,
    // không nên làm thẻ đích bị hạ mức oan.
    const mistakeCount = Number(session.mistakesById[leftId] || 0) + 1;
    session.mistakesById[leftId] = mistakeCount;
    if(mistakeCount >= 3) session.hintPairId = leftId;
    session.feedback = { type:'wrong', leftId, rightId, mistakeCount };
    return { status:'wrong', leftId, rightId, mistakeCount, hintPairId:session.hintPairId || '', speechText: session.pendingSpeechText || '' };
  }
  function clearTransientFeedback(session){
    if(!session || !session.feedback || session.feedback.type !== 'wrong') return false;
    session.feedback = null;
    return true;
  }
  function scheduleFeedbackClear(session, callback, delay){
    if(!session || !session.feedback || session.feedback.type !== 'wrong') return null;
    if(session._feedbackTimer && typeof runtime.clearTimeout === 'function') runtime.clearTimeout(session._feedbackTimer);
    const feedbackRef = session.feedback;
    const wait = Math.max(250, Number(delay) || 650);
    if(typeof runtime.setTimeout !== 'function') return null;
    session._feedbackTimer = runtime.setTimeout(() => {
      session._feedbackTimer = null;
      if(session.feedback === feedbackRef) clearTransientFeedback(session);
      if(typeof callback === 'function') callback();
    }, wait);
    return session._feedbackTimer;
  }
  function nextRound(session){
    if(!session || isComplete(session)) return session;
    return makeRound(session);
  }
  function ratingFor(session, pairId){
    const mistakes = Number(session && session.mistakesById && session.mistakesById[pairId] || 0);
    return mistakes <= 0 ? 'easy' : mistakes === 1 ? 'review' : 'hard';
  }
  function results(session){
    return (session && session.pairs || []).map(pair => ({ pair, rating:ratingFor(session, pair.id), mistakes:Number(session.mistakesById[pair.id] || 0), completed:session.completedIds.includes(pair.id) }));
  }
  function togglePinyin(session){ session.showPinyin = !session.showPinyin; setSetting('matchingShowPinyin', session.showPinyin); return session.showPinyin; }
  function toggleTapSpeak(session){ session.tapToSpeak = !session.tapToSpeak; setSetting('tapHanziSpeak', session.tapToSpeak); return session.tapToSpeak; }

  function render(session, options){
    const configured = options || {};
    const byId = pairMap(session);
    const remaining = Math.max(0, session.pairs.length - session.completedIds.length);
    const left = (session.leftOrder || []).filter(id => !session.completedIds.includes(id)).map(id => byId.get(id)).filter(Boolean);
    const right = (session.rightOrder || []).filter(id => !session.completedIds.includes(id)).map(id => byId.get(id)).filter(Boolean);
    const card = (pair, side) => {
      const completed = session.completedIds.includes(pair.id);
      const selected = side === 'left' ? session.selectedLeftId === pair.id : session.selectedRightId === pair.id;
      const wrong = Boolean(session.feedback && session.feedback.type === 'wrong' && (
        (side === 'left' && session.feedback.leftId === pair.id) ||
        (side === 'right' && session.feedback.rightId === pair.id)
      ));
      const hintSource = side === 'left' && session.hintPairId === pair.id;
      const hintTarget = side === 'right' && session.hintPairId === pair.id;
      const text = side === 'left'
        ? `<b lang="zh-Hans">${escapeHtml(pair.leftText)}</b>${session.showPinyin && pair.pinyin ? `<small>${escapeHtml(pair.pinyin)}</small>` : ''}`
        : `<span>${escapeHtml(pair.rightText)}</span>`;
      return `<button type="button" class="tt-match-card tt-match-card--${side}${selected?' is-selected':''}${completed?' is-complete':''}${hintSource?' is-hint-source':''}${hintTarget?' is-hint-target':''}${wrong?' is-wrong':''}" data-match-side="${side}" data-match-id="${escapeHtml(pair.id)}" ${completed?'disabled':''}>${text}</button>`;
    };
    const roundDone = isRoundComplete(session) && !isComplete(session);
    const complete = isComplete(session);
    return `<section class="tt-match" data-matching-root>
      <header class="tt-match__head">
        <div><p>${escapeHtml(configured.eyebrow || 'NỐI CHỮ')}</p><h2>${escapeHtml(session.title || 'Nối chữ')}</h2>${session.subtitle ? `<small>${escapeHtml(session.subtitle)}</small>` : ''}</div>
        <span class="tt-match__progress">${session.completedIds.length}/${session.pairs.length}</span>
      </header>
      <div class="tt-match__tools" role="group" aria-label="Tùy chọn nối chữ">
        <button type="button" data-match-action="toggle-pinyin" class="${session.showPinyin?'active':''}" aria-pressed="${session.showPinyin}">拼 <span>Pinyin</span></button>
        <button type="button" data-match-action="toggle-speak" class="${session.tapToSpeak?'active':''}" aria-pressed="${session.tapToSpeak}">🔊 <span>Chạm để nghe</span></button>
      </div>
      <p class="tt-match__instruction">Chạm một ô chữ Hán rồi chạm nghĩa tương ứng.</p>
      <div class="tt-match__board">
        <div class="tt-match__column tt-match__column--left">${left.map(pair => card(pair,'left')).join('')}</div>
        <div class="tt-match__column tt-match__column--right">${right.map(pair => card(pair,'right')).join('')}</div>
      </div>
      ${session.feedback && session.feedback.type === 'wrong' ? `<p class="tt-match__feedback is-wrong">${session.feedback.mistakeCount >= 3 ? 'Chưa khớp. Cặp đúng đã được gợi ý.' : 'Chưa khớp, thử lại nhé.'}</p>` : ''}
      ${session.hintPairId ? '<p class="tt-match__hint">Gợi ý: cặp đúng đang sáng xanh.</p>' : ''}
      ${roundDone ? '<button type="button" class="tt-match__next" data-match-action="next-round">Cặp tiếp theo →</button>' : ''}
      ${complete ? '<div class="tt-match__complete"><b>Hoàn thành</b><span>Đã nối đúng toàn bộ nội dung.</span></div>' : ''}
      ${remaining && !roundDone && !complete ? `<p class="tt-match__remaining">Còn ${remaining} cặp</p>` : ''}
    </section>`;
  }

  return {
    SETTINGS_KEY, DEFAULT_SETTINGS,
    readSettings, writeSettings, setSetting,
    normalizePairs, createSession, hydrateSession, select, clearTransientFeedback, scheduleFeedbackClear, nextRound,
    isRoundComplete, isComplete, ratingFor, results,
    togglePinyin, toggleTapSpeak, render, stableId
  };
});

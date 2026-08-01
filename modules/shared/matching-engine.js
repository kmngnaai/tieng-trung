(function(root, factory){
  if(typeof module === 'object' && module.exports) module.exports = factory();
  else root.TiengTrungMatching = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const runtime = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : {});
  const SETTINGS_KEY = 'tieng-trung-interaction-settings-v1';
  const DEFAULT_SETTINGS = Object.freeze({ tapHanziSpeak: true, matchingShowPinyin: true });
  const ADAPTIVE_DEFAULTS = Object.freeze({
    minPairs: 2,
    maxPairs: 8,
    fallbackWidth: 390,
    fallbackHeight: 844,
    mobileChromeHeight: 377,
    desktopChromeHeight: 330,
    minBoardHeight: 248,
    maxBoardHeight: 620,
    mobileGap: 5,
    desktopGap: 8
  });

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

  function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }

  function viewportMetrics(overrides){
    const configured = overrides && typeof overrides === 'object' ? overrides : {};
    const visual = runtime.visualViewport || {};
    const width = Number(configured.width || visual.width || runtime.innerWidth || ADAPTIVE_DEFAULTS.fallbackWidth);
    const height = Number(configured.height || visual.height || runtime.innerHeight || ADAPTIVE_DEFAULTS.fallbackHeight);
    const mobile = width <= 520;
    const horizontalChrome = mobile ? 54 : 70;
    const columnWidth = Math.max(118, (Math.min(width, 760) - horizontalChrome) / 2);
    const fixedChrome = mobile ? ADAPTIVE_DEFAULTS.mobileChromeHeight : ADAPTIVE_DEFAULTS.desktopChromeHeight;
    const boardHeight = clamp(height - fixedChrome, ADAPTIVE_DEFAULTS.minBoardHeight, ADAPTIVE_DEFAULTS.maxBoardHeight);
    return {
      width,
      height,
      mobile,
      columnWidth,
      boardHeight,
      gap: mobile ? ADAPTIVE_DEFAULTS.mobileGap : ADAPTIVE_DEFAULTS.desktopGap,
      signature: `${Math.round(width)}x${Math.round(height)}`
    };
  }

  function weightedUnits(value){
    let total = 0;
    for(const char of Array.from(clean(value))){
      if(/\s/.test(char)) total += 0.32;
      else if(/[\u3400-\u9fff\uf900-\ufaff]/.test(char)) total += 1;
      else if(/[A-Za-z0-9]/.test(char)) total += 0.56;
      else if(/[，。！？；：、,.!?;:'"()（）\[\]【】—-]/.test(char)) total += 0.48;
      else total += 0.78;
    }
    return Math.max(1, total);
  }

  function lineCountByUnits(value, unitsPerLine){
    return Math.max(1, Math.ceil(weightedUnits(value) / Math.max(1, unitsPerLine)));
  }

  function estimatePairHeights(pair, metrics, showPinyin){
    const mobile = metrics.mobile;
    const hanziUnitWidth = mobile ? 18.4 : 19.2;
    const meaningUnitWidth = mobile ? 7.0 : 7.4;
    const pinyinUnitWidth = mobile ? 5.6 : 5.9;
    const leftLines = lineCountByUnits(pair.leftText, metrics.columnWidth / hanziUnitWidth);
    const meaningLines = lineCountByUnits(pair.rightText, metrics.columnWidth / meaningUnitWidth);
    const pinyinLines = showPinyin && pair.pinyin
      ? lineCountByUnits(pair.pinyin, metrics.columnWidth / pinyinUnitWidth)
      : 0;
    const verticalPadding = mobile ? 13 : 16;
    const leftHeight = verticalPadding + leftLines * (mobile ? 22.5 : 24) + (pinyinLines ? 2 + pinyinLines * 12.5 : 0);
    const rightHeight = verticalPadding + meaningLines * (mobile ? 16.4 : 17.2);
    return {
      left: Math.max(mobile ? 46 : 52, Math.ceil(leftHeight)),
      right: Math.max(mobile ? 46 : 52, Math.ceil(rightHeight))
    };
  }

  function contentKindMax(kind){
    clean(kind); // Giữ tham số để schema có thể mở rộng mà không tách engine theo nguồn.
    return ADAPTIVE_DEFAULTS.maxPairs;
  }

  function inferContentKind(pairs){
    const values = Array.isArray(pairs) ? pairs : [];
    if(values.some(pair => pair && pair.meta && pair.meta.cardType === 'grammar')) return 'grammar';
    const maxLeft = values.reduce((max, pair) => Math.max(max, Array.from(clean(pair && pair.leftText)).length), 0);
    const maxRight = values.reduce((max, pair) => Math.max(max, clean(pair && pair.rightText).length), 0);
    return maxLeft <= 7 && maxRight <= 38 ? 'word' : 'sentence';
  }

  function estimateBoardHeight(pairs, metrics, showPinyin){
    let left = 0;
    let right = 0;
    pairs.forEach((pair, index) => {
      const height = estimatePairHeights(pair, metrics, showPinyin);
      left += height.left;
      right += height.right;
      if(index > 0){ left += metrics.gap; right += metrics.gap; }
    });
    return Math.max(left, right);
  }

  function estimateRoundCapacity(pairs, options){
    const configured = options || {};
    const values = normalizePairs(pairs);
    if(values.length <= 1) return values.length;
    const metrics = viewportMetrics(configured.viewport);
    const minPairs = clamp(Number(configured.minPairs) || ADAPTIVE_DEFAULTS.minPairs, 2, ADAPTIVE_DEFAULTS.maxPairs);
    const kind = clean(configured.contentKind || inferContentKind(values));
    const kindMax = contentKindMax(kind);
    const configuredMax = Number(configured.maxPairs || configured.roundSize || kindMax) || kindMax;
    const maxPairs = clamp(Math.min(values.length, configuredMax, kindMax), minPairs, ADAPTIVE_DEFAULTS.maxPairs);
    let capacity = minPairs;
    for(let count = minPairs; count <= maxPairs; count += 1){
      const height = estimateBoardHeight(values.slice(0, count), metrics, configured.showPinyin !== false);
      if(height <= metrics.boardHeight) capacity = count;
      else break;
    }
    return Math.min(values.length, Math.max(minPairs, capacity));
  }

  function balancedRoundSize(total, capacity){
    const count = Math.max(0, Number(total) || 0);
    if(count <= 1) return count;
    const safeCapacity = clamp(Number(capacity) || ADAPTIVE_DEFAULTS.minPairs, ADAPTIVE_DEFAULTS.minPairs, ADAPTIVE_DEFAULTS.maxPairs);
    if(count <= safeCapacity) return count;
    const roundCount = Math.ceil(count / safeCapacity);
    return clamp(Math.ceil(count / roundCount), ADAPTIVE_DEFAULTS.minPairs, safeCapacity);
  }
  function makeRound(session){
    const pending = session.order.filter(id => !session.completedIds.includes(id));
    const byId = pairMap(session);
    const pendingPairs = pending.map(id => byId.get(id)).filter(Boolean);
    const metrics = viewportMetrics(session.viewport);
    const capacity = session.adaptive === false
      ? clamp(Number(session.maxRoundSize) || 4, 2, Math.min(ADAPTIVE_DEFAULTS.maxPairs, Math.max(2, pendingPairs.length)))
      : estimateRoundCapacity(pendingPairs, {
        viewport: metrics,
        minPairs: session.minRoundSize,
        maxPairs: session.maxRoundSize,
        contentKind: session.contentKind,
        showPinyin: session.showPinyin
      });
    const plannedSize = balancedRoundSize(pending.length, capacity);
    const ids = pending.slice(0, plannedSize || pending.length);
    session.roundCapacity = capacity;
    session.roundSize = ids.length;
    session.layout = {
      viewportWidth: metrics.width,
      viewportHeight: metrics.height,
      boardHeight: metrics.boardHeight,
      columnWidth: metrics.columnWidth,
      signature: metrics.signature
    };
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
      adaptive: configured.adaptive !== false,
      contentKind: clean(configured.contentKind || inferContentKind(pairs)),
      minRoundSize: clamp(Number(configured.minRoundSize) || ADAPTIVE_DEFAULTS.minPairs, 2, ADAPTIVE_DEFAULTS.maxPairs),
      maxRoundSize: clamp(Number(configured.maxRoundSize || configured.roundSize || contentKindMax(configured.contentKind || inferContentKind(pairs))) || ADAPTIVE_DEFAULTS.maxPairs, 2, ADAPTIVE_DEFAULTS.maxPairs),
      viewport: configured.viewport && typeof configured.viewport === 'object' ? { width:Number(configured.viewport.width) || 0, height:Number(configured.viewport.height) || 0 } : null,
      roundCapacity: 0,
      roundSize: 0,
      layout: null,
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
    const base = createSession(freshPairs, options);
    const session = {
      ...base,
      ...saved,
      pairs: freshPairs,
      order,
      completedIds,
      adaptive: options && options.adaptive != null ? options.adaptive !== false : saved.adaptive !== false,
      contentKind: clean(options && options.contentKind || saved.contentKind || base.contentKind),
      minRoundSize: clamp(Number(options && options.minRoundSize || saved.minRoundSize || base.minRoundSize), 2, ADAPTIVE_DEFAULTS.maxPairs),
      maxRoundSize: clamp(Number(options && (options.maxRoundSize || options.roundSize) || saved.maxRoundSize || base.maxRoundSize), 2, ADAPTIVE_DEFAULTS.maxPairs),
      viewport: options && options.viewport ? options.viewport : saved.viewport || base.viewport,
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
    return `<section class="tt-match" data-matching-root data-match-round-size="${session.roundIds.length}" data-match-capacity="${session.roundCapacity || session.roundIds.length}">
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
    normalizePairs, viewportMetrics, estimatePairHeights, estimateBoardHeight, estimateRoundCapacity, balancedRoundSize,
    createSession, hydrateSession, select, clearTransientFeedback, scheduleFeedbackClear, nextRound,
    isRoundComplete, isComplete, ratingFor, results,
    togglePinyin, toggleTapSpeak, render, stableId
  };
});

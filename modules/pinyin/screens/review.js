(function (root) {
  'use strict';
  const App = root.PinyinApp = root.PinyinApp || {};
  const esc = () => App.utils.escapeHtml;

  function listenTone(item) {
    const preferred = Number(App.state.tone || 2);
    const preferredSource = App.audio.availability(item, preferred);
    if (preferredSource.status === 'mp3' || preferredSource.status === 'device') return preferred;
    return [1,2,3,4].find(tone => {
      const source = App.audio.availability(item, tone);
      return source.status === 'mp3' || source.status === 'device';
    }) || 0;
  }

  function sourceLabel(item, tone) {
    const source = App.audio.availability(item, tone);
    if (source.status === 'device' && source.fallback) return `${source.fallback.hanzi} · Giọng máy`;
    return source.label;
  }

  function recordRow(record) {
    const p = record.progress;
    if (record.type === 'syllable') {
      const tone = listenTone(record.item);
      return `<article class="review-row"><div class="review-copy"><b>${esc()(App.utils.markTone(record.item.pinyin, tone || 1))}</b><span>${esc()(record.subtitle)} · ${esc()(sourceLabel(record.item, tone))}</span><div class="status-row">${App.ui.statusChips('syllable', record.id)}</div></div><div class="review-actions">
        <button type="button" class="icon-button${App.ui.audioSelectionClass(record.id, tone)}" data-action="play-syllable" data-safe="${esc()(record.id)}" data-tone="${tone}" data-audio-key="${esc()(App.ui.audioKey(record.id, tone))}" data-selection-context="review" ${tone ? '' : 'disabled'}>🔊</button>
        <button type="button" class="mini-button" data-action="toggle-progress" data-type="syllable" data-id="${esc()(record.id)}" data-field="mastered">★ Vững</button>
        ${Number(p.wrong || 0) ? `<button type="button" class="mini-button" data-action="clear-wrong" data-type="syllable" data-id="${esc()(record.id)}">Xóa lỗi</button>` : ''}
      </div></article>`;
    }
    const audit = App.audio.inspectShadowing(record.item);
    return `<article class="review-row"><div class="review-copy"><b class="hanzi-line">${esc()(record.item.zh)}</b><span>${esc()(record.item.pinyin)}</span><div class="status-row">${App.ui.statusChips('shadowing', record.id)}</div></div><div class="review-actions"><button type="button" class="icon-button${App.state.ui.selectedAudioKey === `shadowing:${record.id}` ? ' is-selected' : ''}" data-action="play-shadowing" data-id="${esc()(record.id)}" data-selection-key="shadowing:${esc()(record.id)}" data-selection-context="review-shadowing" ${audit.ready ? '' : 'disabled'}>${audit.ready ? '🔊' : '🔇'}</button><button type="button" class="mini-button" data-action="toggle-progress" data-type="shadowing" data-id="${esc()(record.id)}" data-field="mastered">★ Vững</button></div></article>`;
  }

  function render() {
    const groups = App.data.reviewGroups();
    const active = groups.find(group => group.id === App.state.activeReviewGroup) || groups[0];
    const records = App.review.records(active.id);
    const visible = Number(App.state.ui.reviewVisible || 80);
    const report = App.audio.report();
    return `<section class="screen-hero"><div><span class="eyebrow">ÔN TỰ ĐỘNG</span><h2>${esc()(active.title)}</h2><p>${esc()(active.description || '')}</p></div><span class="hero-count">${records.length}</span></section>
      ${report.missing ? `<p class="progress-exclusion-note">${report.missing} âm chưa xác minh không được tính là thất bại và không xuất hiện trong danh sách ôn bắt buộc.</p>` : ''}
      <div class="review-tabs">${groups.map(group => { const count = App.review.records(group.id).length; return `<button type="button" class="review-tab${group.id === active.id ? ' is-active' : ''}" data-action="select-review-group" data-group="${esc()(group.id)}"><b>${count}</b><span>${esc()(group.title)}</span></button>`; }).join('')}</div>
      <div class="review-list">${records.length ? records.slice(0, visible).map(recordRow).join('') : App.ui.empty('Nhóm đang trống', 'Không có mục nào phù hợp với điều kiện này.')}</div>
      ${visible < records.length ? `<button type="button" class="load-more" data-action="load-more-review">Hiện thêm ${Math.min(80, records.length - visible)} mục</button>` : ''}`;
  }

  App.screens = App.screens || {};
  App.screens.review = { render };
})(window);

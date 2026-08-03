(function (root) {
  'use strict';
  const App = root.PinyinApp = root.PinyinApp || {};
  const esc = () => App.utils.escapeHtml;

  function selectedItem() {
    return App.data.syllable(App.state.selected) || App.model.syllables.find(item => item.hasExactAudio) || App.model.syllables[0];
  }

  function modeButton(mode, label) {
    return `<button type="button" class="segment-button${App.state.ui.listenMode === mode ? ' is-active' : ''}" data-action="set-listen-mode" data-mode="${mode}">${label}</button>`;
  }

  function preferredTone(item) {
    const wanted = Number(App.state.tone || 2);
    const wantedState = App.audio.availability(item, wanted);
    if (wantedState.status === 'mp3' || wantedState.status === 'device') return wanted;
    const exact = [1,2,3,4].find(tone => !!App.audio.exactSource(item, tone));
    if (exact) return exact;
    return [1,2,3,4].find(tone => !!App.audio.verifiedFallback(item, tone)) || wanted;
  }

  function sourceClass(status) {
    return status === 'mp3' ? 'is-mp3' : status === 'device' ? 'is-device' : status === 'verify' ? 'is-verify' : status === 'broken' ? 'is-broken' : 'is-missing';
  }

  function sourceShort(status) {
    return status === 'mp3' ? 'MP3' : status === 'device' ? 'Máy' : status === 'verify' ? 'Xác minh' : status === 'broken' ? 'Hỏng' : 'Thiếu';
  }

  function canPlay(status) { return status === 'mp3' || status === 'device'; }

  function toneControls(item) {
    return `<div class="listen-tone-grid">${[1,2,3,4].map(function (tone) {
      const source = App.audio.availability(item, tone);
      return `<button type="button" class="listen-tone ${sourceClass(source.status)}${App.state.tone === tone ? ' is-active' : ''}" data-action="set-tone" data-tone="${tone}">
        <span>${esc()(App.utils.markTone(item.pinyin, tone))}</span><small>Thanh ${tone}</small><i>${sourceShort(source.status)}</i>
      </button>`;
    }).join('')}</div>`;
  }

  function audioReport() {
    const report = App.audio.report();
    return `<section class="audio-health" aria-label="Báo cáo audio">
      <div class="audio-health__item is-ready"><span>Khả dụng</span><b>${report.available}/${report.total}</b><small>${report.mp3} MP3 · ${report.device} giọng máy</small></div>
      <div class="audio-health__item is-missing"><span>Thiếu / xác minh</span><b>${report.missing}</b><small>${report.verify} âm đang cần xác minh</small></div>
      <div class="audio-health__item is-broken"><span>Hỏng thật</span><b>${report.broken}</b><small>${report.temporary} lỗi tạm thời không bị ghi thành hỏng</small></div>
    </section>`;
  }

  function renderLookup() {
    const item = selectedItem();
    const query = App.utils.normalize(App.state.search);
    const results = query ? App.model.syllables.filter(row => App.utils.normalize(row.pinyin).includes(query) || App.utils.normalize(row.safe).includes(query)).slice(0, 30) : [];
    const source = App.audio.availability(item, App.state.tone);
    const fallback = source.fallback;
    const sourceDetail = source.status === 'device'
      ? `${fallback.pinyin} · ${fallback.hanzi} · ${source.label}`
      : source.label;
    return `${audioReport()}<section class="listen-layout"><article class="selected-syllable"><span class="eyebrow">ÂM ĐANG CHỌN</span><div class="selected-pinyin">${esc()(App.utils.markTone(item.pinyin, App.state.tone))}</div><p>${esc()(item.initialLabel || '∅')} + ${esc()(item.chartFinal || item.final || '')}</p>
      ${toneControls(item)}
      <button type="button" class="primary-button full${App.ui.audioSelectionClass(item.safe, App.state.tone)}" data-action="play-syllable" data-safe="${esc()(item.safe)}" data-tone="${App.state.tone}" data-audio-key="${esc()(App.ui.audioKey(item.safe, App.state.tone))}" ${canPlay(source.status) ? '' : 'disabled'}>🔊 Nghe thanh ${App.state.tone}</button>
      <p class="audio-source-badge ${sourceClass(source.status)}">${esc()(sourceDetail)}</p>
      ${source.status === 'verify' ? `<p class="verify-note">${esc()(source.reason || 'Chưa có nguồn đã xác minh.')}</p>` : ''}
      <div class="rule-panel"><b>${esc()(item.rule || 'Quy tắc')}</b><span>${esc()(item.hint || '')}</span></div></article>
      <div class="lookup-column"><section class="panel"><h3>Tra âm</h3><div class="search-row"><input type="search" value="${esc()(App.state.search)}" placeholder="ma, shi, xue, lü…" data-action="search-syllable"><button type="button" class="primary-button" data-action="submit-search">Tra</button></div>
      ${results.length ? `<div class="chip-grid">${results.map(row => `<button type="button" class="pinyin-chip${App.ui.syllableSelectionClass(row.safe)}" data-action="select-syllable" data-safe="${esc()(row.safe)}" data-select-safe="${esc()(row.safe)}">${esc()(row.pinyin)}</button>`).join('')}</div>` : '<p class="muted">Nhập âm không dấu hoặc có dấu để tìm.</p>'}</section>
      ${(App.model.pinyin.quickGroups || []).map(group => `<section class="panel compact"><h3>${esc()(group.title)}</h3><div class="chip-grid">${group.items.map(py => { const row = App.data.findSyllable(py); return row ? `<button type="button" class="pinyin-chip${App.ui.syllableSelectionClass(row.safe)}" data-action="select-syllable" data-safe="${esc()(row.safe)}" data-select-safe="${esc()(row.safe)}">${esc()(row.pinyin)}</button>` : ''; }).join('')}</div></section>`).join('')}</div></section>`;
  }

  function initialRows() {
    const groups = App.model.pinyin.initialGroups || [];
    const active = groups.find(group => group.key === App.state.initialGroup);
    const values = active ? active.initials : groups.flatMap(group => group.initials || []);
    return Array.from(new Set(values));
  }

  function finalColumns() {
    const groups = App.model.pinyin.finalGroups || [];
    const active = groups.find(group => group.key === App.state.finalGroup);
    const values = active ? active.finals : groups.flatMap(group => group.finals || []);
    return Array.from(new Set(values));
  }

  function findMatrixItem(initial, final) {
    return App.model.syllables.find(item => item.initial === initial && item.chartFinal === final) || null;
  }

  function finalGroupHeaders(finals) {
    const groups = App.model.pinyin.finalGroups || [];
    return groups.map(group => {
      const count = (group.finals || []).filter(final => finals.includes(final)).length;
      return count ? `<th class="matrix-final-group" colspan="${count}">${esc()(group.title)}</th>` : '';
    }).join('');
  }

  function matrixCell(item, action, extra) {
    if (!item) return '<td class="matrix-empty" aria-label="Không có âm tiết">—</td>';
    const tone = Number(App.state.tone || 2);
    const source = App.audio.availability(item, tone);
    if (App.state.hideEmpty && !canPlay(source.status)) return '<td class="matrix-empty is-filtered" aria-label="Đã lọc">—</td>';
    const selected = App.ui.isAudioSelected(item.safe, tone) ? ' is-selected' : '';
    return `<td class="matrix-value ${sourceClass(source.status)}${selected}" data-matrix-safe="${esc()(item.safe)}">
      <button type="button" class="matrix-audio-button${App.ui.audioSelectionClass(item.safe, tone)}" data-action="${action}" data-safe="${esc()(item.safe)}" data-tone="${tone}" data-audio-key="${esc()(App.ui.audioKey(item.safe, tone))}" ${extra || ''} aria-label="${esc()(`${item.pinyin}, ${source.label}`)}">
        <b>${esc()(App.utils.markTone(item.pinyin, tone))}</b><small>${sourceShort(source.status)}</small>
      </button>
    </td>`;
  }

  function renderToneToolbar() {
    return `<div class="matrix-tone-toolbar"><span>Thanh đang nghe</span><div>${[1,2,3,4].map(tone => `<button type="button" data-action="set-tone" data-tone="${tone}" class="${Number(App.state.tone) === tone ? 'is-active' : ''}">${tone}</button>`).join('')}</div><small>Chạm một âm để nghe ngay. MP3 được ưu tiên; giọng máy chỉ dùng chữ Hán đã xác minh.</small></div>`;
  }

  function renderChart() {
    const initialGroups = App.model.pinyin.initialGroups || [];
    const finalGroups = App.model.pinyin.finalGroups || [];
    const initials = initialRows();
    const finals = finalColumns();
    return `${audioReport()}<section class="panel chart-panel"><div class="section-head"><div><span class="eyebrow">BẢNG TỔNG</span><h2>Ma trận thanh mẫu × vận mẫu</h2><p class="muted">Tiêu đề hàng và cột được giữ khi cuộn để dễ đối chiếu.</p></div></div>
      <div class="filter-grid"><label>Thanh mẫu<select data-action="filter-initial"><option value="all">Tất cả</option>${initialGroups.map(group => `<option value="${esc()(group.key)}" ${App.state.initialGroup === group.key ? 'selected' : ''}>${esc()(group.title)}</option>`).join('')}</select></label>
      <label>Vận mẫu<select data-action="filter-final"><option value="all">Tất cả</option>${finalGroups.map(group => `<option value="${esc()(group.key)}" ${App.state.finalGroup === group.key ? 'selected' : ''}>${esc()(group.title)}</option>`).join('')}</select></label>
      <label class="check-label"><input type="checkbox" data-action="toggle-hide-empty" ${App.state.hideEmpty ? 'checked' : ''}> Chỉ ô nghe được ở thanh này</label></div>
      ${renderToneToolbar()}
      <div class="audio-legend"><span class="is-mp3">MP3 chuẩn</span><span class="is-device">Giọng máy</span><span class="is-verify">Cần xác minh</span><span class="is-empty">Không có âm</span></div>
      <div class="pinyin-matrix-scroll" data-pinyin-matrix-scroll><table class="pinyin-matrix" data-pinyin-matrix><thead><tr><th class="matrix-corner" rowspan="2">Thanh mẫu</th>${finalGroupHeaders(finals)}</tr><tr>${finals.map(final => `<th data-matrix-col="${esc()(final)}">${esc()(final)}</th>`).join('')}</tr></thead><tbody>
        ${initials.map(initial => `<tr data-matrix-row="${esc()(initial || 'zero')}"><th>${esc()(initial || '∅')}</th>${finals.map(final => matrixCell(findMatrixItem(initial, final), 'play-chart-syllable')).join('')}</tr>`).join('')}
      </tbody></table></div></section>`;
  }

  function tableSafes(table) {
    const values = [];
    (table.initials || []).forEach(initial => {
      (table.finals || []).forEach(final => {
        const item = findMatrixItem(initial, final);
        if (item && App.audio.exactSource(item, Number(App.state.tone || 2))) values.push(item.safe);
      });
    });
    return values;
  }

  function renderTables() {
    const open = App.state.ui.openMiniTables || {};
    return `${audioReport()}<section class="section-head"><div><span class="eyebrow">18 BẢNG NHỎ</span><h2>Học theo nhóm ghép</h2><p class="muted">Chạm âm chỉ phát tại chỗ; bảng đang mở không tự thu lại.</p></div></section>${renderToneToolbar()}<div class="mini-table-grid">${(App.model.pinyin.miniTables || []).map(table => {
      const safes = tableSafes(table);
      return `<details class="mini-table" data-mini-table-id="${table.no}" ${open[String(table.no)] ? 'open' : ''}><summary><span>${String(table.no).padStart(2,'0')}</span><b>${esc()(table.title)}</b><small>${safes.length} MP3 thanh ${App.state.tone}</small></summary>
        <div class="mini-table__body"><div class="mini-table-toolbar"><button type="button" class="secondary-button${App.state.ui.selectedAudioKey === `table:${table.no}` ? ' is-selected' : ''}" data-action="play-mini-table" data-table-no="${table.no}" data-selection-key="table:${table.no}" data-selection-context="mini-table" ${safes.length ? '' : 'disabled'}>▶ Đọc lần lượt MP3</button><span>Âm thiếu không được ghép thay thế.</span></div>
        ${(table.meta || []).length ? `<div class="mini-table-meta">${table.meta.map(meta => `<div><b>${esc()(meta.label)}</b><span>${esc()(meta.value)}</span></div>`).join('')}</div>` : ''}
        <div class="mini-table-scroll" data-mini-table-scroll="${table.no}"><table class="mini-matrix"><thead><tr><th>Thanh mẫu</th>${table.finals.map(final => `<th>${esc()(final)}</th>`).join('')}</tr></thead><tbody>${table.initials.map(initial => `<tr><th>${esc()(initial || '∅')}</th>${table.finals.map(final => matrixCell(findMatrixItem(initial, final), 'play-table-syllable', `data-table-no="${table.no}"`)).join('')}</tr>`).join('')}</tbody></table></div>
        ${(table.notes || []).length ? `<aside class="mini-table-notes"><b>Chú ý cần nhớ</b><ul>${table.notes.map(note => `<li>${esc()(note)}</li>`).join('')}</ul></aside>` : ''}</div>
      </details>`;
    }).join('')}</div>`;
  }

  function ruleChip(value) {
    const item = App.data.findSyllable(value);
    if (!item) return '';
    const tone = preferredTone(item);
    const source = App.audio.availability(item, tone);
    return `<button type="button" class="rule-audio-chip ${sourceClass(source.status)}${App.ui.audioSelectionClass(item.safe, tone)}" data-action="play-inline-syllable" data-safe="${esc()(item.safe)}" data-tone="${tone}" data-audio-key="${esc()(App.ui.audioKey(item.safe, tone))}" data-selection-context="rule"><span>${esc()(App.utils.markTone(item.pinyin, tone))}</span><small>${sourceShort(source.status)}</small></button>`;
  }

  function renderRules() {
    const data = App.model.rules || { categories: [] };
    const openRules = App.state.ui.openRuleCategories || {};
    const hasSavedRuleState = Object.keys(openRules).length > 0;
    return `<section class="rules-intro panel"><span class="eyebrow">QUY TẮC TỔNG & CHI TIẾT</span><h2>${esc()(data.title || 'Quy tắc phát âm Pinyin')}</h2><p>${esc()(data.intro || '')}</p></section>
      <div class="rules-accordion">${(data.categories || []).map((category, index) => `<details class="rule-category tone-${esc()(category.tone || 'mint')}" data-rule-category-id="${esc()(category.id || String(index))}" ${(openRules[category.id] || (!hasSavedRuleState && index === 0)) ? 'open' : ''}><summary><div><span>${String(index + 1).padStart(2,'0')}</span><b>${esc()(category.title)}</b></div><p>${esc()(category.summary)}</p></summary><div class="rule-category__body">
        <div class="rule-detail-grid">${(category.sections || []).map(section => `<article class="rule-detail"><h3>${esc()(section.title)}</h3><p>${esc()(section.body)}</p>${(section.related || []).length ? `<div class="rule-chip-row">${section.related.map(ruleChip).join('')}</div>` : ''}</article>`).join('')}</div>
        ${(category.notes || []).length ? `<aside class="rule-notes"><b>Ghi nhớ</b><ul>${category.notes.map(note => `<li>${esc()(note)}</li>`).join('')}</ul></aside>` : ''}
      </div></details>`).join('')}</div>`;
  }

  function render() {
    const mode = App.state.ui.listenMode || 'lookup';
    const body = mode === 'chart' ? renderChart() : mode === 'tables' ? renderTables() : mode === 'rules' ? renderRules() : renderLookup();
    return `<section class="screen-hero listen-hero"><div><span class="eyebrow">NGHE & TRA ÂM</span><h2>Nghe đúng từng âm tiết</h2><p>Ưu tiên MP3 đúng âm và đúng thanh. Khi MP3 thiếu, chỉ dùng chữ Hán đã xác minh với giọng zh-CN; không đọc Pinyin Latin.</p></div></section>
      <div class="segmented-control">${modeButton('lookup','Tra âm')}${modeButton('chart','Bảng tổng')}${modeButton('tables','18 bảng')}${modeButton('rules','Quy tắc')}</div>${body}`;
  }

  App.screens = App.screens || {};
  App.screens.listen = { render, tableSafes };
})(window);

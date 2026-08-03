(function (root) {
  'use strict';
  const App = root.PinyinApp = root.PinyinApp || {};
  const esc = () => App.utils.escapeHtml;

  function sourceClass(status) {
    return status === 'mp3' ? 'is-mp3' : status === 'device' ? 'is-device' : status === 'verify' ? 'is-verify' : status === 'broken' ? 'is-broken' : 'is-missing';
  }

  function sourceShort(status) {
    return status === 'mp3' ? 'MP3' : status === 'device' ? 'Máy' : status === 'verify' ? 'Xác minh' : status === 'broken' ? 'Hỏng' : 'Thiếu';
  }

  function canPlay(status) { return status === 'mp3' || status === 'device'; }

  function toneButton(item, tone) {
    const source = App.audio.availability(item, tone);
    return `<button type="button" class="tone-audio ${sourceClass(source.status)}" data-action="play-syllable" data-safe="${esc()(item.safe)}" data-tone="${tone}" aria-label="${esc()(`${item.pinyin} thanh ${tone}, ${source.label}`)}">
      <b>${esc()(App.utils.markTone(item.pinyin, tone))}</b><small>${sourceShort(source.status)}</small>
    </button>`;
  }

  function syllableCard(item) {
    const p = App.store.progress('syllable', item.safe);
    const tone = Number(App.state.tone || 2);
    const source = App.audio.availability(item, tone);
    const fallbackText = source.status === 'device' && source.fallback
      ? `${source.fallback.hanzi} · ${source.fallback.pinyin} · Giọng máy`
      : source.label;
    return `<article class="study-card syllable-card" data-syllable-card="${esc()(item.safe)}">
      <div class="study-card__head"><div><span class="eyebrow">ÂM TIẾT</span><h3>${esc()(App.utils.markTone(item.pinyin, tone))}</h3><p>${esc()(item.initialLabel || '∅')} + ${esc()(item.chartFinal || item.final || '')}</p></div>
        <button type="button" class="icon-button ${sourceClass(source.status)}" data-action="play-syllable" data-safe="${esc()(item.safe)}" data-tone="${tone}" aria-label="Nghe âm đang chọn">${canPlay(source.status) ? '🔊' : '◌'}</button>
      </div>
      <div class="tone-audio-row">${[1,2,3,4].map(t => toneButton(item, t)).join('')}</div>
      <p class="audio-source-badge ${sourceClass(source.status)}">${esc()(fallbackText)}</p>
      ${source.status === 'verify' ? `<p class="verify-note">${esc()((item.fallback && item.fallback.reason) || 'Chưa xác minh nguồn phát âm.')}</p>` : ''}
      <p class="study-note"><b>${esc()(item.rule || 'Quy tắc ghép')}</b> · ${esc()(item.hint || '')}</p>
      <div class="study-card__footer"><div class="status-row">${App.ui.statusChips('syllable', item.safe)}</div>
        <div class="compact-actions">
          <button type="button" data-action="toggle-progress" data-type="syllable" data-id="${esc()(item.safe)}" data-field="learned" class="mini-button${p.learned ? ' is-active' : ''}">Đã học</button>
          <button type="button" data-action="toggle-progress" data-type="syllable" data-id="${esc()(item.safe)}" data-field="mastered" class="mini-button${p.mastered ? ' is-active' : ''}">★ Vững</button>
          <button type="button" data-action="add-wrong" data-type="syllable" data-id="${esc()(item.safe)}" class="mini-button${Number(p.wrong || 0) ? ' is-danger' : ''}">! Cần ôn</button>
        </div>
      </div>
    </article>`;
  }

  function shadowingCard(item) {
    const audit = App.audio.inspectShadowing(item);
    const p = App.store.progress('shadowing', item.id);
    const source = audit.ready ? (audit.type === 'direct' ? 'audio mẫu nguyên câu' : 'ghép nghiêm ngặt từ MP3 đúng từng âm') : `đã khóa: ${audit.missing.slice(0,2).join('; ')}`;
    return `<article class="study-card shadowing-card"><div class="study-card__head"><div><span class="eyebrow">SHADOWING</span><h3 class="hanzi-line">${esc()(item.zh)}</h3><p>${esc()(item.pinyin)}</p></div>
      <button type="button" class="icon-button" data-action="play-shadowing" data-id="${esc()(item.id)}" ${audit.ready ? '' : 'disabled'} aria-label="Nghe câu">${audit.ready ? '🔊' : '🔇'}</button></div>
      <p>${esc()(item.vi)}</p><p class="audio-source${audit.ready ? '' : ' is-warning'}">${esc()(source)}</p>
      <div class="study-card__footer"><div class="status-row">${App.ui.statusChips('shadowing', item.id)}</div><div class="compact-actions"><button type="button" class="mini-button${p.shadowed ? ' is-active' : ''}" data-action="toggle-progress" data-type="shadowing" data-id="${esc()(item.id)}" data-field="shadowed">Đã nhại</button><button type="button" class="mini-button${p.mastered ? ' is-active' : ''}" data-action="toggle-progress" data-type="shadowing" data-id="${esc()(item.id)}" data-field="mastered">★ Vững</button></div></div>
    </article>`;
  }

  function render() {
    const groups = App.data.learningGroups();
    const group = App.data.learningGroup(App.state.activeGroup);
    const items = App.data.groupItems(group);
    const defaultVisible = 24;
    const visible = Number(App.state.ui.groupVisible[group ? group.id : ''] || defaultVisible);
    const shown = items.slice(0, visible);
    const done = items.filter(item => {
      const type = group.contentType === 'syllable' ? 'syllable' : group.contentType;
      const id = item.safe || item.id;
      const p = App.store.progress(type, id);
      return p.heard || p.learned || p.mastered;
    }).length;
    const cards = group.contentType === 'syllable' ? shown.map(syllableCard).join('') : shown.map(shadowingCard).join('');
    const quizButton = group.contentType === 'syllable'
      ? `<button type="button" class="primary-button" data-action="start-quiz" data-group="${esc()(group.id)}">Quiz nhóm</button>`
      : '';

    return `<section class="screen-hero"><div><span class="eyebrow">HỌC THEO NHÓM</span><h2>${esc()(group.title)}</h2><p>${esc()(group.description || '')}</p></div>${quizButton}</section>
      <section class="group-picker"><label>Nhóm học<select data-action="select-group">${groups.map(row => `<option value="${esc()(row.id)}" ${row.id === group.id ? 'selected' : ''}>${esc()(row.title)} · ${row.count || App.data.groupItems(row).length}</option>`).join('')}</select></label><div class="group-progress"><b>${done}/${items.length}</b><span>đã bắt đầu</span></div></section>
      ${(group.goals || []).length ? `<details class="goals"><summary>Mục tiêu nhóm</summary><ul>${group.goals.map(goal => `<li>${esc()(goal)}</li>`).join('')}</ul></details>` : ''}
      <div class="study-grid ${esc()(group.contentType)}">${cards || App.ui.empty('Chưa có nội dung', 'Nhóm này chưa có dữ liệu để hiển thị.')}</div>
      ${visible < items.length ? `<button type="button" class="load-more" data-action="load-more-group" data-group="${esc()(group.id)}">Hiện thêm ${Math.min(24, items.length - visible)} mục</button>` : ''}`;
  }

  App.screens = App.screens || {};
  App.screens.learn = { render };
})(window);

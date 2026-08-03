(function (root) {
  'use strict';
  const App = root.PinyinApp = root.PinyinApp || {};
  const esc = () => App.utils.escapeHtml;

  function metric(label, value, total, detail) {
    const percent = total ? Math.round(value * 100 / total) : 0;
    return `<article class="metric-card"><div><span>${esc()(label)}</span><b>${value}/${total}</b></div><div class="metric-track"><i style="width:${percent}%"></i></div><p>${percent}% · ${esc()(detail || '')}</p></article>`;
  }

  function eligibleGroupItems(group) {
    const items = App.data.groupItems(group);
    if (group.contentType === 'syllable') return items.filter(item => App.review.syllableCanListen(item));
    if (group.contentType === 'shadowing') return items.filter(item => App.audio.inspectShadowing(item).ready);
    return [];
  }

  function render() {
    const syllables = App.model.syllables.filter(item => App.review.syllableCanListen(item));
    const quizSyllables = App.model.syllables.filter(item => App.review.syllableCanQuiz(item));
    const total = syllables.length;
    const heard = syllables.filter(item => App.store.progress('syllable', item.safe).heard).length;
    const learned = syllables.filter(item => { const p = App.store.progress('syllable', item.safe); return p.learned || p.heard; }).length;
    const quizzed = quizSyllables.filter(item => Number(App.store.progress('syllable', item.safe).quizAttempts || 0)).length;
    const mastered = syllables.filter(item => App.review.isMastered('syllable', App.store.progress('syllable', item.safe))).length;
    const due = App.review.records('due').length;
    const wrong = App.review.records('wrong_many').length;
    const groups = App.data.learningGroups();
    const report = App.audio.report();

    return `<section class="screen-hero"><div><span class="eyebrow">TIẾN ĐỘ</span><h2>Toàn bộ Pinyin</h2><p>Dữ liệu được đọc từ localStorage cũ, không đổi key và không xóa lịch sử.</p></div><button type="button" class="primary-button" data-action="set-tab" data-tab="learn">Học tiếp</button></section>
      <section class="audio-progress-summary"><div><span>Audio khả dụng</span><b>${report.available}/${report.total}</b><small>${report.mp3} MP3 · ${report.device} giọng máy zh-CN</small></div><div><span>Cần xác minh</span><b>${report.missing}</b><small>không tính vào thất bại hoặc tiến độ bắt buộc</small></div><div><span>Audio hỏng thật</span><b>${report.broken}</b><small>${report.temporary} lỗi tạm thời không bị ghi thành hỏng</small></div></section>
      <div class="metric-grid">${metric('Đã nghe', heard, total, 'chỉ tính âm có nguồn nghe hợp lệ')}${metric('Đã học', learned, total, 'bao gồm mục đã nghe')}${metric('Đã quiz', quizzed, quizSyllables.length, 'quiz chỉ dùng MP3 chuẩn')}${metric('Đã vững', mastered, total, 'đạt tiêu chí hiện tại')}</div>
      <section class="panel"><div class="section-head"><div><span class="eyebrow">CẦN CHÚ Ý</span><h2>Ôn tập</h2></div></div><div class="summary-pills"><button type="button" data-action="open-review" data-group="due"><b>${due}</b><span>Cần ôn</span></button><button type="button" data-action="open-review" data-group="wrong_many"><b>${wrong}</b><span>Sai nhiều</span></button><button type="button" data-action="open-review" data-group="unheard"><b>${App.review.records('unheard').length}</b><span>Chưa nghe</span></button></div></section>
      <section class="panel"><div class="section-head"><div><span class="eyebrow">NHÓM HỌC</span><h2>Tiến độ theo nhóm</h2></div></div><div class="group-progress-list">${groups.map(group => { const items = eligibleGroupItems(group); const type = group.contentType === 'syllable' ? 'syllable' : group.contentType; const done = items.filter(item => { const p = App.store.progress(type, item.safe || item.id); return p.heard || p.learned || p.mastered; }).length; const percent = items.length ? Math.round(done * 100 / items.length) : 0; return `<button type="button" data-action="open-group" data-group="${esc()(group.id)}"><span><b>${esc()(group.title)}</b><small>${done}/${items.length}</small></span><i><em style="width:${percent}%"></em></i></button>`; }).join('')}</div></section>
      <p class="storage-note">localStorage: <code>${esc()(App.store.LS_KEY)}</code></p>`;
  }

  App.screens = App.screens || {};
  App.screens.progress = { render };
})(window);

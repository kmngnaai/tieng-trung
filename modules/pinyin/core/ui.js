(function (root) {
  'use strict';

  const App = root.PinyinApp = root.PinyinApp || {};
  let toastTimer = 0;

  function toast(message, type) {
    let node = document.querySelector('[data-pinyin-toast]');
    if (!node) {
      node = document.createElement('div');
      node.dataset.pinyinToast = '';
      node.className = 'pinyin-toast';
      document.body.appendChild(node);
    }
    node.className = `pinyin-toast is-visible is-${type || 'info'}`;
    node.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.classList.remove('is-visible'); }, 2600);
  }

  function progressSummary() {
    const syllables = App.model.syllables.filter(item => App.review.syllableCanListen(item));
    const heard = syllables.filter(item => App.store.progress('syllable', item.safe).heard).length;
    const learned = syllables.filter(item => {
      const p = App.store.progress('syllable', item.safe);
      return p.learned || p.heard;
    }).length;
    const due = App.review.records('due').length;
    return { total: syllables.length, heard, learned, due };
  }

  function navButton(tab, label, icon, badge) {
    const active = App.state.tab === tab;
    return `<button type="button" class="pinyin-tab${active ? ' is-active' : ''}" data-action="set-tab" data-tab="${tab}" aria-current="${active ? 'page' : 'false'}">
      <span aria-hidden="true">${icon}</span><b>${label}</b>${badge ? `<small>${badge}</small>` : ''}
    </button>`;
  }

  function shell(content) {
    const summary = progressSummary();
    return `<div class="pinyin-module">
      <section class="pinyin-heading">
        <div class="pinyin-heading-main"><img class="pinyin-mascot" src="${App.assets && App.assets.mascot ? App.assets.mascot : '../../assets/brand/mascot.png'}" alt="Linh vật Pinyin"><div><span class="pinyin-kicker">HỌC PHÁT ÂM</span><h1>Pinyin</h1><p>Nghe đúng âm, hiểu cấu tạo và ôn theo tiến độ của bạn.</p></div></div>
        <div class="pinyin-heading-stats"><span><b>${summary.learned}</b> đã học</span><span><b>${summary.due}</b> cần ôn</span></div>
      </section>
      <nav class="pinyin-tabs" aria-label="Các màn Pinyin">
        ${navButton('learn', 'Học', '学')}
        ${navButton('listen', 'Nghe', '听')}
        ${navButton('quiz', 'Quiz', '问')}
        ${navButton('review', 'Ôn', '复', summary.due || '')}
        ${navButton('progress', 'Tiến độ', '进')}
      </nav>
      <main class="pinyin-screen" data-pinyin-screen>${content}</main>
    </div>`;
  }

  function statusChips(type, id) {
    const p = App.store.progress(type, id);
    const chips = [];
    if (p.heard) chips.push('<span class="status-chip is-good">✓ đã nghe</span>');
    if (p.learned) chips.push('<span class="status-chip is-good">đã học</span>');
    if (p.shadowed) chips.push('<span class="status-chip">đã nhại</span>');
    if (Number(p.quizAttempts || 0)) chips.push(`<span class="status-chip">quiz ${Number(p.quizCorrect || 0)}/${Number(p.quizAttempts || 0)}</span>`);
    if (p.mastered) chips.push('<span class="status-chip is-star">★ vững</span>');
    if (Number(p.wrong || 0)) chips.push(`<span class="status-chip is-bad">! ${Number(p.wrong || 0)}</span>`);
    return chips.length ? chips.join('') : '<span class="status-chip is-muted">mới</span>';
  }

  function empty(title, body) {
    return `<section class="empty-state"><div aria-hidden="true">拼</div><h2>${App.utils.escapeHtml(title)}</h2><p>${App.utils.escapeHtml(body)}</p></section>`;
  }

  App.ui = { toast, shell, statusChips, empty, progressSummary };
})(window);

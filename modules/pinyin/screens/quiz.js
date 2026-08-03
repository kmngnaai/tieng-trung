(function (root) {
  'use strict';
  const App = root.PinyinApp = root.PinyinApp || {};
  const esc = () => App.utils.escapeHtml;

  function syllableGroups() {
    return App.data.learningGroups().filter(group => group.contentType === 'syllable');
  }

  function quizPool(groupId) {
    const group = App.data.learningGroup(groupId);
    const source = group && group.contentType === 'syllable' ? App.data.groupItems(group) : App.model.syllables;
    return source.filter(item => App.review.syllableCanQuiz(item));
  }

  function render() {
    const groups = syllableGroups();
    const currentGroup = groups.find(group => group.id === App.state.activeGroup) || groups[0];
    const quiz = App.state.quiz;
    const item = quiz && App.data.syllable(quiz.safe);
    const groupTitle = currentGroup ? currentGroup.title : 'Toàn bộ âm tiết';
    const poolCount = quizPool(currentGroup && currentGroup.id).length;

    if (!quiz || !item) {
      return `<section class="screen-hero"><div><span class="eyebrow">QUIZ NGHE</span><h2>Phân biệt bốn thanh</h2><p>Quiz chỉ dùng MP3 chuẩn. Âm chỉ có giọng máy hoặc đang cần xác minh không được đưa vào câu hỏi.</p></div></section>
        <section class="quiz-setup panel"><label>Phạm vi<select data-action="select-quiz-group">${groups.map(group => `<option value="${esc()(group.id)}" ${group.id === currentGroup.id ? 'selected' : ''}>${esc()(group.title)} · ${quizPool(group.id).length}</option>`).join('')}</select></label>
        <div class="quiz-ready"><div aria-hidden="true">听</div><h3>${esc()(groupTitle)}</h3><p>${poolCount} âm có MP3 chuẩn để tạo câu hỏi.</p><button type="button" class="primary-button" data-action="start-quiz" data-group="${esc()(currentGroup.id)}">Bắt đầu quiz</button></div></section>`;
    }

    const answered = !!quiz.answered;
    const feedbackClass = quiz.correct ? 'is-correct' : 'is-wrong';
    return `<section class="screen-hero compact"><div><span class="eyebrow">QUIZ NGHE</span><h2>${esc()(groupTitle)}</h2><p>Nghe âm rồi chọn thanh điệu.</p></div><button type="button" class="secondary-button" data-action="reset-quiz">Đổi nhóm</button></section>
      <section class="quiz-card panel"><div class="quiz-question"><span>Câu hiện tại</span><div class="quiz-hidden-answer">${answered ? esc()(App.utils.markTone(item.pinyin, quiz.tone)) : '?'}</div>
        <button type="button" class="play-quiz-button" data-action="play-syllable" data-safe="${esc()(item.safe)}" data-tone="${quiz.tone}">▶ Phát âm</button></div>
        <div class="quiz-options">${[1,2,3,4].map(tone => `<button type="button" data-action="answer-quiz" data-tone="${tone}" ${answered ? 'disabled' : ''} class="quiz-option${answered && tone === quiz.tone ? ' is-answer' : ''}"><b>Thanh ${tone}</b><span>${tone === 1 ? 'cao và ngang' : tone === 2 ? 'đi lên' : tone === 3 ? 'hạ rồi lên' : 'đi xuống'}</span></button>`).join('')}</div>
        ${answered ? `<div class="quiz-feedback ${feedbackClass}">${esc()(quiz.feedback || '')}</div><button type="button" class="primary-button full" data-action="next-quiz">Câu tiếp theo</button>` : '<p class="muted center">Đáp án chỉ hiện sau khi bạn chọn.</p>'}
      </section>`;
  }

  App.screens = App.screens || {};
  App.screens.quiz = { render, quizPool };
})(window);

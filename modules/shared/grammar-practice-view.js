(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports){
    module.exports = api;
  }
  if(root){
    root.TiengTrungGrammarPracticeView = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const VERSION = 'grammar-practice-view-v1';
  const SKILL_META = Object.freeze({
    mcq: Object.freeze({ label: 'Trắc nghiệm', note: 'Chọn một đáp án.' }),
    translate_zh_vi: Object.freeze({ label: 'Trung → Việt', note: 'Tự dịch rồi xem đáp án tham khảo.' }),
    translate_vi_zh: Object.freeze({ label: 'Việt → Trung', note: 'Tự dịch rồi xem đáp án tham khảo.' })
  });

  function assertFunction(value, name){
    if(typeof value !== 'function'){
      throw new TypeError(`GrammarPractice View requires ${name}`);
    }
    return value;
  }

  function render(host, session, options = {}){
    if(!host || !session) return false;

    const ui = options.ui;
    if(!ui || typeof ui.getView !== 'function' || !Array.isArray(ui.SKILLS)){
      throw new TypeError('GrammarPractice View requires GrammarPracticeUi');
    }

    const escapeHtml = assertFunction(options.escapeHtml, 'escapeHtml');
    const formatPinyin = assertFunction(options.formatPinyin, 'formatPinyin');
    const formatText = assertFunction(options.formatText, 'formatText');
    const onStudyCards = typeof options.onStudyCards === 'function' ? options.onStudyCards : null;
    const scrollTarget = typeof options.scrollTarget === 'function' ? options.scrollTarget : null;

    const view = ui.getView(session);
    const exercise = view.exercise;
    if(!exercise) return false;

    const result = view.result;
    const isMcq = exercise.type === 'mcq';
    const skillButtons = ui.SKILLS.map(skill => {
      const meta = SKILL_META[skill];
      if(!meta) throw new TypeError(`GrammarPractice View unsupported skill: ${skill}`);
      return `
        <button
          type="button"
          class="hsk-grammar-practice__skill ${skill === view.skill ? 'is-active' : ''}"
          data-grammar-practice-skill="${escapeHtml(skill)}"
          aria-pressed="${skill === view.skill}"
        >${escapeHtml(meta.label)}</button>
      `;
    }).join('');

    let bodyHtml = '';
    if(isMcq){
      const presentationOptions = Array.isArray(view.presentationOptions) && view.presentationOptions.length
        ? view.presentationOptions
        : (Array.isArray(exercise.options)
          ? exercise.options.map(option => ({ ...option, displayId: String(option?.id || '').trim() }))
          : []);
      bodyHtml = `
        <div class="hsk-grammar-practice__options">
          ${presentationOptions.map(option => {
            const optionId = String(option?.id || '').trim();
            const displayId = String(option?.displayId || optionId).trim();
            const classes = ['hsk-grammar-practice__option'];
            if(result?.expected === optionId) classes.push('is-correct');
            if(result && !result.correct && result.response === optionId) classes.push('is-wrong');
            return `
              <button
                type="button"
                class="${classes.join(' ')}"
                data-grammar-practice-option="${escapeHtml(optionId)}"
                ${result ? 'disabled' : ''}
              >
                <span class="hsk-grammar-practice__option-id">${escapeHtml(displayId)}</span>
                <span>${formatText(option?.text || '')}</span>
              </button>
            `;
          }).join('')}
        </div>
        ${result ? `
          <div class="hsk-grammar-practice__feedback" aria-live="polite">
            <strong>${result.correct ? 'Chính xác' : 'Chưa đúng'}</strong>
            ${result.explanation ? `<p>${escapeHtml(result.explanation)}</p>` : ''}
          </div>
        ` : ''}
      `;
    }else{
      bodyHtml = `
        <div class="hsk-grammar-practice__translation">
          ${result ? `
            <div class="hsk-grammar-practice__feedback" aria-live="polite">
              <strong>Tự đối chiếu — không chấm đúng/sai</strong>
              <div class="hsk-grammar-practice__review-block hsk-grammar-practice__review-block--user" data-grammar-practice-user-answer>
                <span class="hsk-grammar-practice__review-label">Bài của bạn</span>
                <p class="hsk-grammar-practice__review-answer">${result.response ? formatText(result.response) : '<span class="hsk-grammar-practice__review-empty">Chưa nhập câu trả lời.</span>'}</p>
              </div>
              <div class="hsk-grammar-practice__review-block hsk-grammar-practice__review-block--reference" data-grammar-practice-reference-answer>
                <span class="hsk-grammar-practice__review-label">Đáp án tham khảo</span>
                <p class="hsk-grammar-practice__review-answer">${formatText(result.referenceAnswer || '')}</p>
                ${result.pinyin ? `<span class="hsk-grammar-practice__review-pinyin">${escapeHtml(formatPinyin(result.pinyin))}</span>` : ''}
              </div>
            </div>
          ` : `
            <textarea
              data-grammar-practice-input
              aria-label="Nhập bản dịch của bạn"
              placeholder="Nhập câu trả lời của bạn trước khi xem đáp án tham khảo"
            ></textarea>
            <button type="button" class="hsk-grammar-practice__action hsk-grammar-practice__action--primary" data-grammar-practice-reveal>
              Xem đáp án tham khảo
            </button>
            <span class="hsk-grammar-practice__self-review">Phần dịch dùng tự đối chiếu, hệ thống không chấm đúng/sai.</span>
          `}
        </div>
      `;
    }

    host.innerHTML = `
      <div class="hsk-grammar-practice__head">
        <div>
          <h4>Luyện tập</h4>
          <p>${escapeHtml(SKILL_META[view.skill].note)}</p>
        </div>
        <div class="hsk-grammar-practice__head-tools">
          <button type="button" class="hsk-grammar-practice__action" data-grammar-practice-study-cards>Ôn thẻ</button>
          <button
            type="button"
            class="hsk-grammar-practice__action hsk-grammar-practice__shuffle"
            data-grammar-practice-shuffle
            aria-label="Đổi câu ngẫu nhiên"
            title="Đổi câu ngẫu nhiên"
            ${view.canShuffle ? '' : 'disabled'}
          >🔀</button>
          <span class="hsk-grammar-practice__progress">Câu ${view.index + 1}/${view.total}</span>
        </div>
      </div>
      <div class="hsk-grammar-practice__skills" role="group" aria-label="Chọn dạng bài">
        ${skillButtons}
      </div>
      <div class="hsk-grammar-practice__card">
        <p class="hsk-grammar-practice__prompt">${formatText(exercise.prompt || '')}</p>
        ${bodyHtml}
        ${result ? `
          <div class="hsk-grammar-practice__actions">
            <button type="button" class="hsk-grammar-practice__action hsk-grammar-practice__action--primary" data-grammar-practice-next>
              Câu tiếp
            </button>
          </div>
        ` : ''}
      </div>
    `;

    const rerender = () => render(host, session, options);
    const scroll = (selector, block = 'nearest') => {
      if(scrollTarget) scrollTarget(host, selector, block);
    };

    host.querySelector('[data-grammar-practice-study-cards]')?.addEventListener('click', () => {
      if(onStudyCards) onStudyCards(session.grammar);
    });

    host.querySelector('[data-grammar-practice-shuffle]')?.addEventListener('click', () => {
      ui.shuffleCurrent(session);
      rerender();
      scroll('.hsk-grammar-practice__prompt', 'nearest');
    });

    host.querySelectorAll('[data-grammar-practice-skill]').forEach(button => {
      button.addEventListener('click', () => {
        ui.selectSkill(session, button.dataset.grammarPracticeSkill);
        rerender();
      });
    });

    host.querySelectorAll('[data-grammar-practice-option]').forEach(button => {
      button.addEventListener('click', () => {
        ui.submit(session, button.dataset.grammarPracticeOption);
        rerender();
        scroll('.hsk-grammar-practice__feedback', 'center');
      });
    });

    host.querySelector('[data-grammar-practice-reveal]')?.addEventListener('click', () => {
      const input = host.querySelector('[data-grammar-practice-input]');
      ui.submit(session, input?.value || '');
      rerender();
      scroll('.hsk-grammar-practice__feedback', 'center');
    });

    host.querySelector('[data-grammar-practice-next]')?.addEventListener('click', () => {
      ui.next(session);
      rerender();
      scroll('.hsk-grammar-practice__prompt', 'nearest');
    });

    return true;
  }

  return Object.freeze({
    VERSION,
    SKILL_META,
    render
  });
});

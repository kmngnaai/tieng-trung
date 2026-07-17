(function initFcType3Prototype() {
  'use strict';

  const machine = window.PinyinTypingStateMachine;
  if (!machine) throw new Error('PinyinTypingStateMachine is required.');

  const cards = [
    { id: '学习', word: '学习', pinyin: 'xuéxí', meaningVi: 'học tập' },
    { id: '女儿', word: '女儿', pinyin: "nǚ'ér", meaningVi: 'con gái' },
    { id: '绿色', word: '绿色', pinyin: 'lǜsè', meaningVi: 'màu xanh lá' },
    { id: '你好', word: '你好', pinyin: 'nǐhǎo', meaningVi: 'xin chào' },
  ];

  const elements = {
    input: document.getElementById('typingInput'),
    slots: document.getElementById('typingSlots'),
    shell: document.getElementById('slotsShell'),
    status: document.getElementById('typingStatus'),
    hintBox: document.getElementById('hintBox'),
    hintText: document.getElementById('hintText'),
    promptType: document.getElementById('promptType'),
    promptContent: document.getElementById('promptContent'),
    progress: document.getElementById('progressText'),
    resultPanel: document.getElementById('resultPanel'),
    resultDetails: document.getElementById('resultDetails'),
    speaker: document.getElementById('speakerButton'),
    knowledge: document.getElementById('knowledgeButton'),
    answerReveal: document.getElementById('answerReveal'),
    closeAnswer: document.getElementById('closeAnswerButton'),
    revealedPinyin: document.getElementById('revealedPinyin'),
    revealedContext: document.getElementById('revealedContext'),
    reset: document.getElementById('resetCardButton'),
    next: document.getElementById('nextCardButton'),
    timeStat: document.getElementById('timeStat'),
    accuracyStat: document.getElementById('accuracyStat'),
    errorStat: document.getElementById('errorStat'),
  };

  const runtime = {
    cardIndex: 0,
    promptMode: 'hanzi',
    state: null,
    completionTimer: 0,
    composing: false,
    lastAcceptedWasUmlautU: false,
    cardStartedAt: 0,
    elapsedBeforePauseMs: 0,
    correctTokenCount: 0,
    errorCount: 0,
    statsTimer: 0,
    answerRevealUsed: false,
    answerRevealCount: 0,
    answerRevealedAt: 0,
  };

  function currentCard() {
    return cards[runtime.cardIndex];
  }

  function formatElapsed(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function getElapsedMs() {
    if (!runtime.cardStartedAt) return runtime.elapsedBeforePauseMs;
    return runtime.elapsedBeforePauseMs + (performance.now() - runtime.cardStartedAt);
  }

  function renderStats() {
    const attempts = runtime.correctTokenCount + runtime.errorCount;
    const accuracy = attempts > 0
      ? Math.round((runtime.correctTokenCount / attempts) * 100)
      : 100;
    elements.timeStat.textContent = formatElapsed(getElapsedMs());
    elements.accuracyStat.textContent = `${accuracy}%`;
    elements.errorStat.textContent = String(runtime.errorCount);
  }

  function startCardStats() {
    clearInterval(runtime.statsTimer);
    runtime.cardStartedAt = performance.now();
    runtime.elapsedBeforePauseMs = 0;
    runtime.correctTokenCount = 0;
    runtime.errorCount = 0;
    renderStats();
    runtime.statsTimer = window.setInterval(renderStats, 250);
  }

  function stopCardStats() {
    if (runtime.cardStartedAt) {
      runtime.elapsedBeforePauseMs += performance.now() - runtime.cardStartedAt;
      runtime.cardStartedAt = 0;
    }
    clearInterval(runtime.statsTimer);
    runtime.statsTimer = 0;
    renderStats();
  }

  function createState() {
    const card = currentCard();
    runtime.state = machine.createTypingState({
      cardId: card.id,
      answers: [card.pinyin],
      hintThreshold: 5,
    });
    runtime.lastAcceptedWasUmlautU = false;
  }

  function renderPrompt() {
    const card = currentCard();
    const isMeaning = runtime.promptMode === 'meaning';
    elements.promptType.textContent = isMeaning ? 'Nghĩa Việt → Pinyin' : 'Chữ Trung → Pinyin';
    elements.promptContent.textContent = isMeaning ? card.meaningVi : card.word;
    elements.promptContent.classList.toggle('is-meaning', isMeaning);
    elements.progress.textContent = `${runtime.cardIndex + 1} / ${cards.length}`;
  }

  function renderState(event) {
    const view = machine.getTypingViewModel(runtime.state);
    elements.slots.replaceChildren(...view.slots.map((slot) => {
      const node = document.createElement('span');
      node.className = `typing-slot is-${slot.status}`;
      node.textContent = slot.display;
      node.setAttribute('aria-label', slot.status === 'wrong' ? `${slot.display}, sai` : slot.display === '_' ? 'chưa nhập' : slot.display);
      return node;
    }));

    const wrong = view.status === 'wrong-current-token' || view.status === 'hint-available';
    const completed = view.status === 'completed';
    elements.shell.classList.toggle('is-wrong', wrong);
    elements.shell.classList.toggle('is-complete', completed);
    elements.status.classList.toggle('is-wrong', wrong);
    elements.status.classList.toggle('is-correct', completed);

    if (completed) {
      elements.status.textContent = 'Chính xác.';
    } else if (wrong) {
      const position = runtime.state.currentIndex + 1;
      elements.status.textContent = `Ký tự ở vị trí ${position} chưa đúng.`;
    } else {
      elements.status.textContent = '';
    }

    if (view.hint && view.hint.token) {
      elements.hintBox.hidden = false;
      elements.hintText.textContent = `Gợi ý vị trí ${runtime.state.currentIndex + 1}: ${view.hint.acceptedDisplay}`;
    } else {
      elements.hintBox.hidden = true;
      elements.hintText.textContent = '';
    }

    if (event && event.type === 'wrong' && navigator.vibrate) navigator.vibrate(25);
  }

  function focusInput() {
    if (runtime.state && runtime.state.status !== 'completed') {
      elements.input.focus({ preventScroll: true });
    }
  }

  function hideAnswerReveal(options) {
    const settings = options || {};
    elements.answerReveal.hidden = true;
    elements.knowledge.setAttribute('aria-expanded', 'false');
    if (settings.refocus !== false) window.setTimeout(focusInput, 0);
  }

  function showAnswerReveal() {
    const card = currentCard();
    runtime.answerRevealUsed = true;
    runtime.answerRevealCount += 1;
    runtime.answerRevealedAt = Date.now();
    elements.revealedPinyin.textContent = card.pinyin;
    elements.revealedContext.textContent = `${card.word} · ${card.meaningVi}`;
    elements.answerReveal.hidden = false;
    elements.knowledge.setAttribute('aria-expanded', 'true');
    window.setTimeout(focusInput, 0);
  }

  function toggleAnswerReveal() {
    if (elements.answerReveal.hidden) showAnswerReveal();
    else hideAnswerReveal();
  }

  function showComplete() {
    const card = currentCard();
    const assisted = runtime.answerRevealUsed ? ' · Đã xem đáp án' : '';
    elements.resultDetails.textContent = `${card.word} · ${card.pinyin} · ${card.meaningVi}${assisted}`;
    elements.resultPanel.hidden = false;
    clearTimeout(runtime.completionTimer);
    runtime.completionTimer = window.setTimeout(() => moveNextCard(true), 760);
  }

  function submitToken(rawToken) {
    if (!rawToken || runtime.state.status === 'completed') return;

    // When expected ü was accepted through plain u, a following colon is only the
    // second half of the user's u: notation. Ignore it instead of consuming a slot.
    if (rawToken === ':' && runtime.lastAcceptedWasUmlautU) {
      runtime.lastAcceptedWasUmlautU = false;
      return;
    }

    const beforeIndex = runtime.state.currentIndex;
    const expectedTokens = runtime.state.candidateAnswerIndexes
      .map((index) => runtime.state.answers[index] && runtime.state.answers[index].tokens[beforeIndex])
      .filter(Boolean);
    const result = machine.submitTypingToken(runtime.state, rawToken);
    runtime.state = result.state;

    runtime.lastAcceptedWasUmlautU = (
      result.event.type === 'correct' || result.event.type === 'completed'
    ) && rawToken.toLowerCase() === 'u' && expectedTokens.includes('ü');

    if (result.event.type === 'wrong') {
      runtime.errorCount += 1;
    } else if (result.event.type === 'correct' || result.event.type === 'completed') {
      runtime.correctTokenCount += 1;
    }
    renderStats();
    renderState(result.event);
    if (result.event.type === 'completed') {
      stopCardStats();
      showComplete();
    }
  }

  function processRawInput(rawValue) {
    const value = String(rawValue || '');
    if (!value) return;

    // Let the engine process separators and multi-character u: safely. Stop as
    // soon as the current position is wrong, matching the locked-slot rule.
    for (let index = 0; index < value.length; index += 1) {
      const char = value[index];
      if (/\s|['’\-·]/u.test(char)) continue;
      if (char === ':' && runtime.lastAcceptedWasUmlautU) {
        runtime.lastAcceptedWasUmlautU = false;
        continue;
      }
      submitToken(char);
      if (runtime.state.status === 'wrong-current-token' || runtime.state.status === 'hint-available' || runtime.state.status === 'completed') break;
    }
  }

  function resetCurrentCard() {
    clearTimeout(runtime.completionTimer);
    createState();
    elements.resultPanel.hidden = true;
    elements.input.disabled = false;
    elements.input.value = '';
    runtime.answerRevealUsed = false;
    runtime.answerRevealCount = 0;
    runtime.answerRevealedAt = 0;
    hideAnswerReveal({ refocus: false });
    elements.revealedPinyin.textContent = '';
    elements.revealedContext.textContent = '';
    renderPrompt();
    renderState();
    startCardStats();
    requestAnimationFrame(focusInput);
  }

  function moveNextCard(auto) {
    clearTimeout(runtime.completionTimer);
    runtime.cardIndex = (runtime.cardIndex + 1) % cards.length;
    resetCurrentCard();
  }

  elements.input.addEventListener('compositionstart', () => { runtime.composing = true; });
  elements.input.addEventListener('compositionend', (event) => {
    runtime.composing = false;
    processRawInput(event.data || elements.input.value);
    elements.input.value = '';
  });

  elements.input.addEventListener('input', () => {
    if (runtime.composing) return;
    processRawInput(elements.input.value);
    elements.input.value = '';
  });

  elements.input.addEventListener('keydown', (event) => {
    if (event.key === 'Backspace' && !elements.input.value) {
      event.preventDefault();
      const result = machine.deleteTypingToken(runtime.state);
      runtime.state = result.state;
      runtime.lastAcceptedWasUmlautU = false;
      renderState(result.event);
    }
  });

  elements.shell.addEventListener('click', focusInput);
  elements.shell.addEventListener('focus', focusInput);
  elements.input.addEventListener('focus', () => elements.shell.classList.add('is-focused'));
  elements.input.addEventListener('blur', () => elements.shell.classList.remove('is-focused'));

  document.querySelectorAll('[data-prompt-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      runtime.promptMode = button.dataset.promptMode === 'meaning' ? 'meaning' : 'hanzi';
      document.querySelectorAll('[data-prompt-mode]').forEach((item) => item.classList.toggle('is-active', item === button));
      resetCurrentCard();
    });
  });

  elements.speaker.addEventListener('click', () => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(currentCard().word);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
    window.setTimeout(focusInput, 0);
  });

  elements.knowledge.addEventListener('click', toggleAnswerReveal);
  elements.closeAnswer.addEventListener('click', () => hideAnswerReveal());

  elements.reset.addEventListener('click', resetCurrentCard);
  elements.next.addEventListener('click', () => moveNextCard(false));
  document.getElementById('closeButton').addEventListener('click', () => {
    elements.status.textContent = '';
  });

  createState();
  renderPrompt();
  renderState();
  startCardStats();
  window.setTimeout(focusInput, 100);
})();

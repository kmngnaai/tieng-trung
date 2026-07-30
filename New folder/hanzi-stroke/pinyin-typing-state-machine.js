(function initPinyinTypingStateMachine(root, factory) {
  let engine = root && root.PinyinTypingEngine;

  if (!engine && typeof module === 'object' && module.exports) {
    // Node/CommonJS test environment.
    engine = require('./pinyin-typing-engine.js');
  }

  const api = factory(engine);

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root && typeof root === 'object') {
    root.PinyinTypingStateMachine = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createStateMachine(engine) {
  'use strict';

  if (!engine) {
    throw new Error('PinyinTypingEngine is required before PinyinTypingStateMachine.');
  }

  const STATE_MACHINE_VERSION = '1.0.0';
  const DEFAULT_HINT_THRESHOLD = 5;

  function cloneArray(value) {
    return Array.isArray(value) ? value.slice() : [];
  }

  function normalizeAnswers(value) {
    const answers = engine.buildAcceptedPinyinAnswers(value);
    if (answers.length === 0) {
      throw new Error('At least one valid, source-backed pinyin answer is required.');
    }
    return answers;
  }

  function getCandidateIndexes(answers, committedTokens) {
    return answers
      .map((answer, index) => ({ answer, index }))
      .filter(({ answer }) => {
        if (committedTokens.length > answer.tokens.length) return false;
        return committedTokens.every((token, tokenIndex) => (
          engine.isTypingTokenAccepted(answer.tokens[tokenIndex], token)
        ));
      })
      .map(({ index }) => index);
  }

  function getExpectedTokensAt(state, position) {
    const indexes = state.candidateAnswerIndexes.length > 0
      ? state.candidateAnswerIndexes
      : state.answers.map((_, index) => index);

    return Array.from(new Set(
      indexes
        .map((index) => state.answers[index] && state.answers[index].tokens[position])
        .filter(Boolean),
    ));
  }

  function getHintForPosition(state, position) {
    const expectedTokens = getExpectedTokensAt(state, position);
    if (expectedTokens.length === 1) {
      return {
        available: true,
        ambiguous: false,
        token: expectedTokens[0],
        acceptedDisplay: expectedTokens[0] === 'ü' ? 'ü / u / v / u:' : expectedTokens[0],
      };
    }

    return {
      available: false,
      ambiguous: expectedTokens.length > 1,
      token: '',
      acceptedDisplay: '',
    };
  }

  function createTypingState(options) {
    const settings = options || {};
    const answers = normalizeAnswers(settings.answers || settings.pinyin || []);
    const hintThreshold = Number.isFinite(settings.hintThreshold)
      ? Math.max(1, Math.floor(settings.hintThreshold))
      : DEFAULT_HINT_THRESHOLD;

    const primaryAnswerIndex = Number.isInteger(settings.primaryAnswerIndex)
      && settings.primaryAnswerIndex >= 0
      && settings.primaryAnswerIndex < answers.length
      ? settings.primaryAnswerIndex
      : 0;

    const slotCount = answers[primaryAnswerIndex].tokens.length;

    return {
      version: STATE_MACHINE_VERSION,
      cardId: settings.cardId == null ? '' : String(settings.cardId),
      answers,
      primaryAnswerIndex,
      slotCount,
      hintThreshold,
      status: 'typing',
      currentIndex: 0,
      committedTokens: [],
      currentWrongToken: '',
      currentWrongReason: '',
      mistakesByIndex: Array(slotCount).fill(0),
      hintShownByIndex: Array(slotCount).fill(false),
      candidateAnswerIndexes: answers.map((_, index) => index),
      completedAnswerIndexes: [],
      totalMistakes: 0,
      usedHint: false,
      completedAt: null,
      lastAction: 'created',
    };
  }

  function copyState(state) {
    return {
      ...state,
      answers: state.answers.map((answer) => ({
        ...answer,
        tokens: cloneArray(answer.tokens),
      })),
      committedTokens: cloneArray(state.committedTokens),
      mistakesByIndex: cloneArray(state.mistakesByIndex),
      hintShownByIndex: cloneArray(state.hintShownByIndex),
      candidateAnswerIndexes: cloneArray(state.candidateAnswerIndexes),
      completedAnswerIndexes: cloneArray(state.completedAnswerIndexes),
    };
  }

  function normalizeOneSubmittedToken(rawToken) {
    const tokenized = engine.tokenizePinyinForTyping(rawToken);
    if (tokenized.invalidCharacters.length > 0) {
      return {
        valid: false,
        ignored: false,
        reason: 'invalid-character',
        token: tokenized.tokens[0] || '',
        invalidCharacters: tokenized.invalidCharacters,
      };
    }

    if (tokenized.tokens.length === 0) {
      return {
        valid: false,
        ignored: true,
        reason: 'separator-only',
        token: '',
        invalidCharacters: [],
      };
    }

    if (tokenized.tokens.length > 1) {
      return {
        valid: false,
        ignored: false,
        reason: 'multiple-tokens',
        token: '',
        tokens: tokenized.tokens,
        invalidCharacters: [],
      };
    }

    return {
      valid: true,
      ignored: false,
      reason: '',
      token: tokenized.tokens[0],
      invalidCharacters: [],
    };
  }

  function submitTypingToken(inputState, rawToken, now) {
    const state = copyState(inputState);

    if (state.status === 'completed') {
      state.lastAction = 'ignored-after-complete';
      return {
        state,
        event: {
          type: 'ignored',
          reason: 'already-completed',
        },
      };
    }

    const submitted = normalizeOneSubmittedToken(rawToken);
    if (!submitted.valid) {
      state.lastAction = submitted.ignored ? 'ignored-separator' : 'invalid-input';
      return {
        state,
        event: {
          type: submitted.ignored ? 'ignored' : 'invalid',
          reason: submitted.reason,
          token: submitted.token,
          tokens: submitted.tokens || [],
          invalidCharacters: submitted.invalidCharacters,
        },
      };
    }

    const position = state.currentIndex;
    const candidateIndexes = state.candidateAnswerIndexes.length > 0
      ? state.candidateAnswerIndexes
      : state.answers.map((_, index) => index);

    const matchingIndexes = candidateIndexes.filter((index) => {
      const expectedToken = state.answers[index].tokens[position];
      return expectedToken && engine.isTypingTokenAccepted(expectedToken, submitted.token);
    });

    if (matchingIndexes.length === 0) {
      while (state.mistakesByIndex.length <= position) state.mistakesByIndex.push(0);
      while (state.hintShownByIndex.length <= position) state.hintShownByIndex.push(false);

      state.currentWrongToken = submitted.token;
      state.currentWrongReason = 'wrong-token';
      state.mistakesByIndex[position] += 1;
      state.totalMistakes += 1;
      state.status = 'wrong-current-token';
      state.lastAction = 'wrong-token';

      const hint = getHintForPosition(state, position);
      const hintUnlocked = state.mistakesByIndex[position] >= state.hintThreshold;
      if (hintUnlocked && hint.available) {
        state.hintShownByIndex[position] = true;
        state.usedHint = true;
        state.status = 'hint-available';
      }

      return {
        state,
        event: {
          type: 'wrong',
          position,
          token: submitted.token,
          mistakesAtPosition: state.mistakesByIndex[position],
          totalMistakes: state.totalMistakes,
          locked: true,
          hintUnlocked,
          hint: hintUnlocked ? hint : null,
        },
      };
    }

    state.committedTokens[position] = submitted.token;
    state.currentWrongToken = '';
    state.currentWrongReason = '';
    state.candidateAnswerIndexes = matchingIndexes;
    state.currentIndex = position + 1;
    state.status = 'typing';
    state.lastAction = 'correct-token';

    const completedAnswerIndexes = matchingIndexes.filter((index) => (
      state.answers[index].tokens.length === state.currentIndex
    ));

    if (completedAnswerIndexes.length > 0) {
      state.status = 'completed';
      state.completedAnswerIndexes = completedAnswerIndexes;
      state.completedAt = Number.isFinite(now) ? now : Date.now();
      state.lastAction = 'completed';

      return {
        state,
        event: {
          type: 'completed',
          position,
          token: submitted.token,
          completedAnswerIndexes,
          completedAnswers: completedAnswerIndexes.map((index) => state.answers[index]),
        },
      };
    }

    return {
      state,
      event: {
        type: 'correct',
        position,
        token: submitted.token,
        nextPosition: state.currentIndex,
        remainingCandidateIndexes: cloneArray(state.candidateAnswerIndexes),
      },
    };
  }

  function deleteTypingToken(inputState) {
    const state = copyState(inputState);

    if (state.status === 'completed') {
      state.lastAction = 'delete-ignored-after-complete';
      return {
        state,
        event: { type: 'ignored', reason: 'already-completed' },
      };
    }

    if (state.currentWrongToken) {
      const removedToken = state.currentWrongToken;
      state.currentWrongToken = '';
      state.currentWrongReason = '';
      state.status = state.hintShownByIndex[state.currentIndex] ? 'hint-available' : 'typing';
      state.lastAction = 'cleared-wrong-token';
      return {
        state,
        event: {
          type: 'cleared-wrong',
          position: state.currentIndex,
          token: removedToken,
        },
      };
    }

    if (state.currentIndex <= 0) {
      state.lastAction = 'delete-at-start';
      return {
        state,
        event: { type: 'ignored', reason: 'at-start' },
      };
    }

    const previousIndex = state.currentIndex - 1;
    const removedToken = state.committedTokens[previousIndex];
    state.committedTokens = state.committedTokens.slice(0, previousIndex);
    state.currentIndex = previousIndex;
    state.candidateAnswerIndexes = getCandidateIndexes(state.answers, state.committedTokens);
    state.status = state.hintShownByIndex[previousIndex] ? 'hint-available' : 'typing';
    state.lastAction = 'deleted-committed-token';

    return {
      state,
      event: {
        type: 'deleted-correct',
        position: previousIndex,
        token: removedToken,
      },
    };
  }

  function submitTypingSequence(inputState, rawValue, now) {
    const tokenized = engine.tokenizePinyinForTyping(rawValue);
    let state = copyState(inputState);
    const events = [];

    if (tokenized.invalidCharacters.length > 0) {
      return {
        state,
        events: [{
          type: 'invalid',
          reason: 'invalid-character',
          invalidCharacters: tokenized.invalidCharacters,
        }],
      };
    }

    for (const token of tokenized.tokens) {
      const result = submitTypingToken(state, token, now);
      state = result.state;
      events.push(result.event);

      if (result.event.type === 'wrong' || result.event.type === 'completed') break;
    }

    return { state, events };
  }

  function getTypingViewModel(state) {
    const slots = [];
    const slotCount = Math.max(state.slotCount, state.currentIndex + (state.currentWrongToken ? 1 : 0));

    for (let index = 0; index < slotCount; index += 1) {
      let status = 'empty';
      let token = '';

      if (index < state.committedTokens.length) {
        status = 'correct';
        token = state.committedTokens[index];
      } else if (index === state.currentIndex && state.currentWrongToken) {
        status = 'wrong';
        token = state.currentWrongToken;
      } else if (index === state.currentIndex && state.status !== 'completed') {
        status = 'active';
      }

      slots.push({
        index,
        status,
        token,
        display: token || '_',
        mistakes: state.mistakesByIndex[index] || 0,
        hintShown: Boolean(state.hintShownByIndex[index]),
      });
    }

    const hint = state.hintShownByIndex[state.currentIndex]
      ? getHintForPosition(state, state.currentIndex)
      : null;

    return {
      status: state.status,
      currentIndex: state.currentIndex,
      slotCount,
      slots,
      locked: Boolean(state.currentWrongToken),
      completed: state.status === 'completed',
      hint,
      totalMistakes: state.totalMistakes,
    };
  }

  function restoreTypingState(snapshot, options) {
    const base = createTypingState({
      ...(options || {}),
      answers: snapshot && snapshot.answers
        ? snapshot.answers.map((answer) => answer.source || answer.normalized || answer.compact)
        : (options && (options.answers || options.pinyin)),
      cardId: snapshot && snapshot.cardId,
      primaryAnswerIndex: snapshot && snapshot.primaryAnswerIndex,
      hintThreshold: snapshot && snapshot.hintThreshold,
    });

    if (!snapshot || typeof snapshot !== 'object') return base;

    const committedTokens = cloneArray(snapshot.committedTokens);
    const candidateAnswerIndexes = getCandidateIndexes(base.answers, committedTokens);
    if (candidateAnswerIndexes.length === 0) return base;

    const currentIndex = Math.min(committedTokens.length, Math.max(...base.answers.map((answer) => answer.tokens.length)));
    base.committedTokens = committedTokens.slice(0, currentIndex);
    base.currentIndex = currentIndex;
    base.candidateAnswerIndexes = candidateAnswerIndexes;
    base.currentWrongToken = snapshot.currentWrongToken || '';
    base.currentWrongReason = snapshot.currentWrongReason || '';
    base.mistakesByIndex = cloneArray(snapshot.mistakesByIndex);
    base.hintShownByIndex = cloneArray(snapshot.hintShownByIndex);
    base.totalMistakes = Number.isFinite(snapshot.totalMistakes) ? snapshot.totalMistakes : 0;
    base.usedHint = Boolean(snapshot.usedHint);
    base.status = base.currentWrongToken
      ? (base.hintShownByIndex[base.currentIndex] ? 'hint-available' : 'wrong-current-token')
      : 'typing';
    base.lastAction = 'restored';

    return base;
  }

  return Object.freeze({
    STATE_MACHINE_VERSION,
    DEFAULT_HINT_THRESHOLD,
    createTypingState,
    submitTypingToken,
    submitTypingSequence,
    deleteTypingToken,
    getTypingViewModel,
    restoreTypingState,
  });
});

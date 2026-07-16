(function initPinyinTypingEngine(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root && typeof root === 'object') {
    root.PinyinTypingEngine = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPinyinTypingEngine() {
  'use strict';

  const ENGINE_VERSION = '1.0.0';

  const TONE_MARK_MAP = Object.freeze({
    ā: 'a', á: 'a', ǎ: 'a', à: 'a',
    ē: 'e', é: 'e', ě: 'e', è: 'e',
    ī: 'i', í: 'i', ǐ: 'i', ì: 'i',
    ō: 'o', ó: 'o', ǒ: 'o', ò: 'o',
    ū: 'u', ú: 'u', ǔ: 'u', ù: 'u',
    ǖ: 'ü', ǘ: 'ü', ǚ: 'ü', ǜ: 'ü',
    ń: 'n', ň: 'n', ǹ: 'n',
    ḿ: 'm',
    ê: 'e',
  });

  const IGNORED_SEPARATOR_RE = /[\s'’`´·•・\-‐‑‒–—_.,，、/\\|;；:：]+/gu;
  const ALTERNATIVE_SEPARATOR_RE = /[\/|;；、，]+/u;
  const TONE_NUMBER_RE = /[1-5]/gu;
  const LATIN_PINYIN_TOKEN_RE = /^[a-zü]$/u;

  function toText(value) {
    if (value === null || value === undefined) return '';
    return String(value);
  }

  /**
   * Removes Mandarin tone marks while preserving plain ü as ü.
   * This function does not collapse ü into u because the answer engine must
   * know whether u/v/u:/ü equivalence is allowed at a given position.
   */
  function stripPinyinToneMarks(value) {
    const source = toText(value).trim().toLowerCase();
    if (!source) return '';

    let mapped = '';
    for (const character of source) {
      mapped += Object.prototype.hasOwnProperty.call(TONE_MARK_MAP, character)
        ? TONE_MARK_MAP[character]
        : character;
    }

    // Remove remaining combining tone marks. Keep diaeresis so a decomposed ü
    // can be reconstructed below instead of being silently changed to u.
    const decomposed = mapped.normalize('NFD');
    let output = '';

    for (let index = 0; index < decomposed.length; index += 1) {
      const character = decomposed[index];
      const next = decomposed[index + 1];

      if (character === 'u' && next === '\u0308') {
        output += 'ü';
        index += 1;
        continue;
      }

      // Combining macron, acute, caron, grave, circumflex and similar marks.
      if (/^[\u0300-\u036f]$/u.test(character)) continue;
      output += character;
    }

    return output.normalize('NFC');
  }

  /**
   * Normalizes pinyin text without destroying the distinction between u and ü.
   * Separators are retained unless compact=true.
   */
  function normalizePinyinForTyping(value, options) {
    const settings = {
      compact: false,
      removeToneNumbers: true,
      ...options,
    };

    let normalized = stripPinyinToneMarks(value)
      .replace(/[’`´]/gu, "'")
      .replace(/\s+/gu, ' ')
      .trim();

    if (settings.removeToneNumbers) {
      normalized = normalized.replace(TONE_NUMBER_RE, '');
    }

    if (settings.compact) {
      normalized = normalized.replace(IGNORED_SEPARATOR_RE, '');
    }

    return normalized;
  }

  /**
   * Tokenizes one pinyin spelling into display-independent typing units.
   * - Spaces and punctuation are ignored.
   * - u: is one token, not two.
   * - Tone marks/numbers are ignored.
   * - Unknown characters are skipped and reported in invalidCharacters.
   */
  function tokenizePinyinForTyping(value) {
    const normalized = normalizePinyinForTyping(value, { compact: false });
    const tokens = [];
    const invalidCharacters = [];

    for (let index = 0; index < normalized.length; index += 1) {
      const character = normalized[index];
      const next = normalized[index + 1];

      if (character === 'u' && next === ':') {
        tokens.push('u:');
        index += 1;
        continue;
      }

      if (IGNORED_SEPARATOR_RE.test(character)) {
        IGNORED_SEPARATOR_RE.lastIndex = 0;
        continue;
      }
      IGNORED_SEPARATOR_RE.lastIndex = 0;

      if (LATIN_PINYIN_TOKEN_RE.test(character)) {
        tokens.push(character);
        continue;
      }

      invalidCharacters.push({ character, index });
    }

    return {
      source: toText(value),
      normalized,
      compact: tokens.join(''),
      tokens,
      invalidCharacters,
      valid: invalidCharacters.length === 0 && tokens.length > 0,
    };
  }

  /**
   * The user explicitly allows ü to be typed as ü, u, v, or u:.
   * This equivalence is one-way: an expected plain u only accepts plain u.
   */
  function isTypingTokenAccepted(expectedToken, actualToken) {
    const expected = toText(expectedToken).toLowerCase();
    const actual = toText(actualToken).toLowerCase();

    if (expected === 'ü') {
      return actual === 'ü' || actual === 'u' || actual === 'v' || actual === 'u:';
    }

    return expected === actual;
  }

  function tokenizeAlternativeSource(value) {
    if (Array.isArray(value)) {
      return value.flatMap((item) => tokenizeAlternativeSource(item));
    }

    const text = toText(value).trim();
    if (!text) return [];

    return text
      .split(ALTERNATIVE_SEPARATOR_RE)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  /**
   * Builds de-duplicated accepted answers from a string or array.
   * No answer is invented: every returned answer comes from supplied data.
   */
  function buildAcceptedPinyinAnswers(value) {
    const answers = [];
    const seen = new Set();

    tokenizeAlternativeSource(value).forEach((source) => {
      const tokenized = tokenizePinyinForTyping(source);
      if (!tokenized.valid) return;

      const key = tokenized.tokens.join('\u0001');
      if (seen.has(key)) return;
      seen.add(key);

      answers.push({
        source,
        normalized: tokenized.normalized,
        compact: tokenized.compact,
        tokens: tokenized.tokens,
      });
    });

    return answers;
  }

  function normalizeAnswerList(answers) {
    if (!Array.isArray(answers)) return buildAcceptedPinyinAnswers(answers);

    const alreadyBuilt = answers.every((answer) => answer && Array.isArray(answer.tokens));
    return alreadyBuilt ? answers : buildAcceptedPinyinAnswers(answers);
  }

  /**
   * Checks a typed token sequence against one expected answer.
   */
  function comparePinyinTyping(expected, actual) {
    const expectedTokens = Array.isArray(expected)
      ? expected
      : tokenizePinyinForTyping(expected).tokens;
    const actualTokens = Array.isArray(actual)
      ? actual
      : tokenizePinyinForTyping(actual).tokens;

    const length = Math.max(expectedTokens.length, actualTokens.length);
    const positions = [];

    for (let index = 0; index < length; index += 1) {
      const expectedToken = expectedTokens[index] || '';
      const actualToken = actualTokens[index] || '';
      let status = 'missing';

      if (!expectedToken && actualToken) status = 'extra';
      else if (expectedToken && actualToken) {
        status = isTypingTokenAccepted(expectedToken, actualToken) ? 'correct' : 'wrong';
      }

      positions.push({ index, expectedToken, actualToken, status });
    }

    const wrongPositions = positions.filter((item) => item.status === 'wrong').map((item) => item.index);
    const extraPositions = positions.filter((item) => item.status === 'extra').map((item) => item.index);
    const missingPositions = positions.filter((item) => item.status === 'missing').map((item) => item.index);

    return {
      expectedTokens,
      actualTokens,
      positions,
      wrongPositions,
      extraPositions,
      missingPositions,
      complete:
        expectedTokens.length === actualTokens.length &&
        wrongPositions.length === 0 &&
        extraPositions.length === 0 &&
        missingPositions.length === 0,
      prefixValid:
        actualTokens.length <= expectedTokens.length &&
        wrongPositions.length === 0 &&
        extraPositions.length === 0,
    };
  }

  /**
   * Finds all source-backed pronunciations that still match a typed prefix.
   * Useful later for polyphonic cards without guessing a pronunciation.
   */
  function matchPinyinTypingPrefix(answers, actual) {
    const acceptedAnswers = normalizeAnswerList(answers);
    const actualTokens = Array.isArray(actual)
      ? actual
      : tokenizePinyinForTyping(actual).tokens;

    const matches = acceptedAnswers.filter((answer) => {
      if (actualTokens.length > answer.tokens.length) return false;
      return actualTokens.every((token, index) => isTypingTokenAccepted(answer.tokens[index], token));
    });

    const completeMatches = matches.filter((answer) => answer.tokens.length === actualTokens.length);

    return {
      actualTokens,
      matches,
      completeMatches,
      prefixValid: matches.length > 0,
      complete: completeMatches.length > 0,
    };
  }

  return Object.freeze({
    ENGINE_VERSION,
    stripPinyinToneMarks,
    normalizePinyinForTyping,
    tokenizePinyinForTyping,
    isTypingTokenAccepted,
    buildAcceptedPinyinAnswers,
    comparePinyinTyping,
    matchPinyinTypingPrefix,
  });
});

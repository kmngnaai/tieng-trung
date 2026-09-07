(function (global) {
  'use strict';

  const STORAGE_KEY = 'tiengTrung.learning.words.v1';
  const SCHEMA_VERSION = 1;

  const STATES = Object.freeze({
    UNSEEN: 'unseen',
    LEARNING: 'learning',
    LEARNED: 'learned'
  });

  const listeners = new Set();

  function nowIso() {
    return new Date().toISOString();
  }

  function extractTarget(value) {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';

    return (
      value.target ||
      value.hanzi ||
      value.simplified ||
      value.word ||
      ''
    );
  }

  function normalizeTarget(value) {
    const raw = String(extractTarget(value) || '');
    const normalized =
      typeof raw.normalize === 'function'
        ? raw.normalize('NFC')
        : raw;

    return normalized.trim().replace(/\s+/g, ' ');
  }

  function toCount(value) {
    const number = Number(value);

    if (!Number.isFinite(number) || number <= 0) {
      return 0;
    }

    return Math.floor(number);
  }

  function emptyStore() {
    return {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: '',
      words: {}
    };
  }

  function getStorage() {
    try {
      return global.localStorage || null;
    } catch (_error) {
      return null;
    }
  }

  function sanitizeRecord(raw) {
    const attempts = toCount(raw && raw.attempts);
    const successes = Math.min(
      attempts,
      toCount(raw && raw.successes)
    );

    return {
      attempts,
      successes,
      lastActivityAt: String(
        (raw && raw.lastActivityAt) || ''
      ),
      lastSource: String(
        (raw && raw.lastSource) || ''
      )
    };
  }

  function readStore() {
    const storage = getStorage();

    if (!storage) {
      return emptyStore();
    }

    try {
      const raw = storage.getItem(STORAGE_KEY);

      if (!raw) {
        return emptyStore();
      }

      const parsed = JSON.parse(raw);

      if (
        !parsed ||
        parsed.schemaVersion !== SCHEMA_VERSION ||
        !parsed.words ||
        typeof parsed.words !== 'object'
      ) {
        return emptyStore();
      }

      const words = {};

      Object.entries(parsed.words).forEach(
        ([target, record]) => {
          const normalized = normalizeTarget(target);

          if (!normalized) return;

          words[normalized] = sanitizeRecord(record);
        }
      );

      return {
        schemaVersion: SCHEMA_VERSION,
        updatedAt: String(parsed.updatedAt || ''),
        words
      };
    } catch (_error) {
      return emptyStore();
    }
  }

  function writeStore(store) {
    const storage = getStorage();

    if (!storage) {
      return false;
    }

    try {
      storage.setItem(
        STORAGE_KEY,
        JSON.stringify(store)
      );

      return true;
    } catch (_error) {
      return false;
    }
  }

  function stateFromRecord(record) {
    if (record.successes > 0) {
      return STATES.LEARNED;
    }

    if (record.attempts > 0) {
      return STATES.LEARNING;
    }

    return STATES.UNSEEN;
  }

  function publicRecord(target, record) {
    const clean = sanitizeRecord(record);

    return Object.freeze({
      target,
      state: stateFromRecord(clean),
      attempts: clean.attempts,
      successes: clean.successes,
      lastActivityAt: clean.lastActivityAt,
      lastSource: clean.lastSource
    });
  }

  function get(targetLike) {
    const target = normalizeTarget(targetLike);

    if (!target) {
      return publicRecord('', {});
    }

    const store = readStore();

    return publicRecord(
      target,
      store.words[target] || {}
    );
  }

  function emitChange(detail) {
    listeners.forEach(listener => {
      try {
        listener(detail);
      } catch (error) {
        if (
          global.console &&
          typeof global.console.warn === 'function'
        ) {
          global.console.warn(
            'LearningState subscriber failed:',
            error
          );
        }
      }
    });

    if (
      typeof global.dispatchEvent === 'function' &&
      typeof global.CustomEvent === 'function'
    ) {
      try {
        global.dispatchEvent(
          new global.CustomEvent(
            'tiengTrung:learning-state-change',
            { detail }
          )
        );
      } catch (_error) {
        // Optional browser notification only.
      }
    }
  }

  function recordAttempt(targetLike, options) {
    const target = normalizeTarget(targetLike);

    if (!target) {
      return publicRecord('', {});
    }

    const settings =
      options && typeof options === 'object'
        ? options
        : {};

    const correct = settings.correct === true;
    const source = String(
      settings.source || ''
    ).trim();

    const at = String(
      settings.at || nowIso()
    );

    const store = readStore();

    const current = sanitizeRecord(
      store.words[target] || {}
    );

    const next = {
      attempts: current.attempts + 1,
      successes:
        current.successes + (correct ? 1 : 0),
      lastActivityAt: at,
      lastSource:
        source || current.lastSource
    };

    store.words[target] = next;
    store.updatedAt = at;

    writeStore(store);

    const result = publicRecord(
      target,
      next
    );

    emitChange(result);

    return result;
  }

  function markLearning(targetLike, options) {
    return recordAttempt(
      targetLike,
      Object.assign(
        {},
        options || {},
        { correct: false }
      )
    );
  }

  function markLearned(targetLike, options) {
    return recordAttempt(
      targetLike,
      Object.assign(
        {},
        options || {},
        { correct: true }
      )
    );
  }

  function getMany(targets) {
    const store = readStore();

    return (
      Array.isArray(targets)
        ? targets
        : []
    ).map(targetLike => {
      const target = normalizeTarget(targetLike);

      if (!target) {
        return publicRecord('', {});
      }

      return publicRecord(
        target,
        store.words[target] || {}
      );
    });
  }
  function getProgress(targets) {
    const uniqueTargets = [];
    const seen = new Set();

    (
      Array.isArray(targets)
        ? targets
        : []
    ).forEach(value => {
      const target = normalizeTarget(value);

      if (!target || seen.has(target)) {
        return;
      }

      seen.add(target);
      uniqueTargets.push(target);
    });

    const store = readStore();

    let learned = 0;
    let learning = 0;

    uniqueTargets.forEach(target => {
      const state = stateFromRecord(
        sanitizeRecord(
          store.words[target] || {}
        )
      );

      if (state === STATES.LEARNED) {
        learned += 1;
      } else if (state === STATES.LEARNING) {
        learning += 1;
      }
    });

    return Object.freeze({
      total: uniqueTargets.length,
      learned,
      learning,
      unseen:
        uniqueTargets.length -
        learned -
        learning
    });
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') {
      return function () {};
    }

    listeners.add(listener);

    return function unsubscribe() {
      listeners.delete(listener);
    };
  }

  const api = Object.freeze({
    STORAGE_KEY,
    SCHEMA_VERSION,
    STATES,

    normalizeTarget,

    get,
    getMany,
    getProgress,

    recordAttempt,
    markLearning,
    markLearned,

    subscribe
  });

  global.TiengTrungLearningState = api;

})(
  typeof window !== 'undefined'
    ? window
    : globalThis
);
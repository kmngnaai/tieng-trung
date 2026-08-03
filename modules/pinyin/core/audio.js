(function (root) {
  'use strict';

  const App = root.PinyinApp = root.PinyinApp || {};
  const player = new Audio();
  let activeButton = null;
  let activeUtterance = null;
  let activeSource = '';
  let playbackToken = 0;
  let queueToken = 0;
  let queueActive = false;
  let lastFailure = null;
  const runtimeBroken = new Map();
  const transientFailures = new Map();

  function clearFailureClasses(button) {
    if (!button) return;
    button.classList.remove('is-temporary-error', 'is-verified-broken');
  }

  function clearButton() {
    if (activeButton) {
      activeButton.classList.remove('is-playing');
      activeButton.setAttribute('aria-pressed', 'false');
    }
    activeButton = null;
  }

  function stop() {
    playbackToken += 1;
    queueToken += 1;
    queueActive = false;
    player.onended = null;
    player.onerror = null;
    try { player.pause(); } catch (_error) {}
    try { player.removeAttribute('src'); player.load(); } catch (_error) {}
    activeSource = '';
    if (root.speechSynthesis) {
      try { root.speechSynthesis.cancel(); } catch (_error) {}
    }
    activeUtterance = null;
    clearButton();
  }

  function setButton(button) {
    clearButton();
    activeButton = button || null;
    if (activeButton) {
      clearFailureClasses(activeButton);
      activeButton.classList.add('is-playing');
      activeButton.setAttribute('aria-pressed', 'true');
    }
  }

  function exactSource(item, tone) {
    if (!item || !item.audio) return '';
    const value = item.audio[String(Number(tone || 0))];
    return typeof value === 'string' ? value : '';
  }

  function verifiedFallback(item, tone) {
    if (!item || !App.data || !App.data.fallback) return null;
    return App.data.fallback(item.safe, tone);
  }

  function availability(item, tone) {
    const value = Number(tone || 0);
    const src = exactSource(item, value);
    if (src) {
      return runtimeBroken.has(src)
        ? { status: 'broken', label: 'Audio hỏng đã xác nhận', src, failure: runtimeBroken.get(src) }
        : { status: 'mp3', label: 'MP3 chuẩn', src };
    }
    const fallback = verifiedFallback(item, value);
    if (fallback) return { status: 'device', label: 'Giọng máy zh-CN', fallback };
    if (item && item.needsVerification) {
      return { status: 'verify', label: 'Cần xác minh', reason: item.fallback && item.fallback.reason };
    }
    return { status: 'missing', label: 'Chưa có audio', reason: 'Chưa có MP3 hoặc chữ Hán fallback đã xác minh cho đúng thanh.' };
  }

  function classifyFailure(error, mediaError) {
    const code = Number(mediaError && mediaError.code || 0);
    if (code === 3) return { kind: 'decode', broken: true, message: 'Trình duyệt không giải mã được file MP3.' };
    if (code === 4) return { kind: 'unsupported', broken: true, message: 'Nguồn MP3 không được trình duyệt hỗ trợ.' };
    if (code === 2) return { kind: 'network', broken: false, message: 'Mạng chưa tải kịp file MP3. Chạm lại để thử.' };
    if (code === 1) return { kind: 'aborted', broken: false, silent: true, message: 'Lượt phát đã bị ngắt.' };

    const name = String(error && error.name || '');
    if (name === 'AbortError') return { kind: 'aborted', broken: false, silent: true, message: 'Lượt phát trước đã bị ngắt.' };
    if (name === 'NotAllowedError' || name === 'SecurityError') return { kind: 'blocked', broken: false, message: 'Trình duyệt chưa cho phát âm thanh. Chạm lại để phát.' };
    if (name === 'NotSupportedError') return { kind: 'unsupported', broken: true, message: 'Nguồn MP3 không được trình duyệt hỗ trợ.' };
    if (name === 'NetworkError') return { kind: 'network', broken: false, message: 'Kết nối tạm thời chưa tải được MP3. Chạm lại để thử.' };
    return { kind: 'temporary', broken: false, message: 'Chưa phát được âm thanh. Chạm lại để thử.' };
  }

  function recordFailure(src, failure, button) {
    lastFailure = Object.assign({ src: src || '', at: Date.now() }, failure || {});
    if (failure && failure.broken && src) {
      runtimeBroken.set(src, lastFailure);
      transientFailures.delete(src);
      if (button) button.classList.add('is-verified-broken');
    } else if (src) {
      transientFailures.set(src, lastFailure);
      if (button && !(failure && failure.silent)) {
        button.classList.add('is-temporary-error');
        root.setTimeout(function () { button.classList.remove('is-temporary-error'); }, 1800);
      }
    }
    clearButton();
    return lastFailure;
  }

  function markSuccessful(src, button) {
    lastFailure = null;
    if (src) {
      runtimeBroken.delete(src);
      transientFailures.delete(src);
    }
    clearFailureClasses(button);
  }

  function showFailure(failure) {
    if (!failure || failure.silent) return;
    App.ui.toast(failure.message, failure.broken ? 'error' : 'warning');
  }

  async function playSource(src, button) {
    if (!src) return false;
    stop();
    const token = playbackToken;
    activeSource = src;
    setButton(button);
    player.src = src;
    player.currentTime = 0;
    let eventHandled = false;

    player.onerror = function () {
      if (token !== playbackToken || eventHandled) return;
      eventHandled = true;
      const failure = classifyFailure(null, player.error);
      recordFailure(src, failure, button);
      showFailure(failure);
    };
    player.onended = function () {
      if (token !== playbackToken) return;
      clearButton();
    };

    try {
      await player.play();
      if (token !== playbackToken) return false;
      markSuccessful(src, button);
      setButton(button);
      return true;
    } catch (error) {
      if (token !== playbackToken || eventHandled) return false;
      eventHandled = true;
      const failure = classifyFailure(error, player.error);
      recordFailure(src, failure, button);
      showFailure(failure);
      return false;
    }
  }

  function chineseVoices() {
    if (!root.speechSynthesis || typeof root.speechSynthesis.getVoices !== 'function') return [];
    return root.speechSynthesis.getVoices().filter(voice => /^zh(?:-|_)/i.test(String(voice.lang || '')));
  }

  async function resolveChineseVoice() {
    let voices = chineseVoices();
    if (voices.length) return voices[0];
    if (!root.speechSynthesis) return null;
    await new Promise(resolve => {
      let done = false;
      const finish = function () {
        if (done) return;
        done = true;
        root.speechSynthesis.removeEventListener('voiceschanged', finish);
        resolve();
      };
      root.speechSynthesis.addEventListener('voiceschanged', finish, { once: true });
      setTimeout(finish, 650);
    });
    voices = chineseVoices();
    return voices[0] || null;
  }

  async function speakHanzi(entry, button) {
    if (!entry || !entry.hanzi || !root.speechSynthesis || typeof root.SpeechSynthesisUtterance !== 'function') {
      App.ui.toast('Thiết bị này không hỗ trợ giọng đọc Trung Quốc.', 'warning');
      return false;
    }
    const voice = await resolveChineseVoice();
    if (!voice) {
      App.ui.toast('Thiết bị chưa có giọng zh-CN. Không dùng TTS Latin thay thế.', 'warning');
      return false;
    }

    stop();
    const token = playbackToken;
    setButton(button);
    const utterance = new root.SpeechSynthesisUtterance(entry.ttsText || entry.hanzi);
    utterance.lang = voice.lang || 'zh-CN';
    utterance.voice = voice;
    utterance.rate = 0.88;
    utterance.pitch = 1;
    activeUtterance = utterance;

    return new Promise(resolve => {
      let started = false;
      utterance.onstart = function () { if (token === playbackToken) started = true; };
      utterance.onend = function () {
        if (token !== playbackToken) return resolve(false);
        activeUtterance = null;
        clearButton();
        resolve(started || true);
      };
      utterance.onerror = function () {
        if (token !== playbackToken) return resolve(false);
        activeUtterance = null;
        const failure = { kind: 'tts-temporary', broken: false, message: 'Giọng máy chưa phát được chữ Hán fallback. Chạm lại để thử.' };
        recordFailure('', failure, button);
        showFailure(failure);
        resolve(false);
      };
      try { root.speechSynthesis.speak(utterance); }
      catch (_error) { utterance.onerror(); }
    });
  }

  async function playSyllable(safe, tone, button) {
    const item = App.data.syllable(safe);
    const value = Number(tone || 0);
    const source = availability(item, value);
    let ok = false;

    if (source.status === 'mp3') {
      ok = await playSource(source.src, button);
    } else if (source.status === 'device') {
      ok = await speakHanzi(source.fallback, button);
      if (ok) App.ui.toast(`${source.fallback.pinyin} · ${source.fallback.hanzi} · Giọng máy`, 'info');
    } else if (source.status === 'verify') {
      App.ui.toast(`${item ? item.pinyin : safe}: cần xác minh trước khi bổ sung audio.`, 'warning');
    } else if (source.status === 'broken') {
      App.ui.toast('File MP3 đã được xác nhận lỗi giải mã hoặc không được hỗ trợ.', 'error');
    } else {
      App.ui.toast(`Chưa có audio chính xác cho ${item ? item.pinyin : safe} thanh ${value}.`, 'warning');
    }

    if (ok) App.store.markHeard('syllable', safe);
    return ok;
  }

  function directShadowingSource(item) {
    if (!item) return '';
    const value = item.audio || item.audioSrc || item.src || item.url || item.audioUrl || item.mp3;
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') return value.src || value.url || value.file || value.mp3 || '';
    return '';
  }

  function strictSegments(token) {
    const parsed = App.utils.parseMarkedSyllable(token);
    const dict = App.model.syllables
      .map(item => ({ key: App.utils.normalize(item.pinyin), item }))
      .sort((a, b) => b.key.length - a.key.length);
    const result = [];
    let index = 0;
    while (index < parsed.plain.length) {
      const found = dict.find(row => parsed.plain.startsWith(row.key, index));
      if (!found) return { ok: false, reason: `không nhận diện “${token}”` };
      const segmentText = parsed.plain.slice(index, index + found.key.length);
      const sourceSlice = String(token).slice(index, index + found.key.length);
      const segmentTone = App.utils.parseMarkedSyllable(sourceSlice).tone || (result.length === 0 ? parsed.tone : 0);
      if (!segmentTone) return { ok: false, reason: `“${segmentText}” không có thanh điệu xác định` };
      const src = exactSource(found.item, segmentTone);
      if (!src) return { ok: false, reason: `thiếu MP3 ${found.item.pinyin} thanh ${segmentTone}` };
      result.push({ src, safe: found.item.safe, tone: segmentTone, pause: 90 });
      index += found.key.length;
    }
    return { ok: true, segments: result };
  }

  function inspectShadowing(item) {
    const direct = directShadowingSource(item);
    if (direct) return { ready: true, type: 'direct', src: direct, missing: [] };
    const tokens = String((item && item.pinyin) || '')
      .replace(/[，。！？；：,.!?;:]/g, ' ')
      .split(/\s+/).filter(Boolean);
    if (!tokens.length) return { ready: false, type: 'none', missing: ['không có Pinyin'] };
    const queue = [];
    const missing = [];
    tokens.forEach(function (token) {
      const result = strictSegments(token);
      if (!result.ok) missing.push(result.reason);
      else queue.push.apply(queue, result.segments);
    });
    if (missing.length || !queue.length) return { ready: false, type: 'composed', queue: [], missing };
    return { ready: true, type: 'composed', queue, missing: [] };
  }

  async function playMp3Queue(queue, button, callbacks) {
    if (!queue || !queue.length) return false;
    stop();
    const token = queueToken;
    queueActive = true;
    setButton(button);
    const hooks = callbacks || {};

    return new Promise(function (resolve) {
      const finishFailure = function (part, error) {
        if (token !== queueToken) return resolve(false);
        const failure = classifyFailure(error, player.error);
        recordFailure(part && part.src, failure, button);
        showFailure(failure);
        queueActive = false;
        resolve(false);
      };

      const playAt = function (index) {
        if (token !== queueToken) return resolve(false);
        if (index >= queue.length) {
          queueActive = false;
          clearButton();
          if (typeof hooks.onComplete === 'function') hooks.onComplete();
          return resolve(true);
        }
        const part = queue[index];
        activeSource = part.src;
        player.src = part.src;
        player.currentTime = 0;
        let eventHandled = false;
        player.onended = function () {
          if (token !== queueToken) return;
          setTimeout(() => playAt(index + 1), Number(part.pause || 80));
        };
        player.onerror = function () {
          if (token !== queueToken || eventHandled) return;
          eventHandled = true;
          finishFailure(part, null);
        };
        player.play().then(function () {
          if (token !== queueToken) return;
          markSuccessful(part.src, button);
          setButton(button);
          if (typeof hooks.onPartStart === 'function') hooks.onPartStart(part, index);
        }).catch(function (error) {
          if (token !== queueToken || eventHandled) return;
          eventHandled = true;
          finishFailure(part, error);
        });
      };
      playAt(0);
    });
  }

  async function playExactSequence(safes, tone, button) {
    const value = Number(tone || 0);
    const queue = (safes || []).map(function (safe) {
      const item = App.data.syllable(safe);
      const src = exactSource(item, value);
      return src ? { src, safe, tone: value, pause: 120 } : null;
    }).filter(Boolean);
    if (!queue.length) {
      App.ui.toast(`Không có MP3 chuẩn thanh ${value} trong bảng này.`, 'warning');
      return false;
    }
    return playMp3Queue(queue, button, {
      onPartStart: function (part) { App.store.markHeard('syllable', part.safe); }
    });
  }

  async function playShadowing(item, button) {
    const audit = inspectShadowing(item);
    if (!audit.ready) {
      App.ui.toast(`Không ghép audio: ${audit.missing.slice(0, 2).join('; ')}.`, 'warning');
      return false;
    }
    if (audit.type === 'direct') {
      const ok = await playSource(audit.src, button);
      if (ok) App.store.markHeard('shadowing', item.id);
      return ok;
    }
    return playMp3Queue(audit.queue, button, {
      onComplete: function () { App.store.markHeard('shadowing', item.id); }
    });
  }

  function report() {
    const items = (App.model && App.model.syllables) || [];
    const mp3 = items.filter(item => item.hasExactAudio).length;
    const device = items.filter(item => !item.hasExactAudio && item.hasVerifiedFallback).length;
    const verify = items.filter(item => !item.hasExactAudio && item.needsVerification).length;
    const audit = (App.model && App.model.audioAudit) || {};
    const packagedBroken = Number(audit.brokenCount || 0);
    return {
      total: items.length,
      available: mp3 + device,
      mp3,
      device,
      missing: verify + items.filter(item => !item.hasExactAudio && !item.hasVerifiedFallback && !item.needsVerification).length,
      verify,
      broken: packagedBroken + runtimeBroken.size,
      temporary: transientFailures.size,
      runtimeBroken: Array.from(runtimeBroken.keys()),
      transientFailures: Array.from(transientFailures.values()),
      lastFailure
    };
  }

  player.addEventListener('pause', function () {
    if (!player.ended && !queueActive) clearButton();
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); });

  App.audio = {
    stop,
    exactSource,
    verifiedFallback,
    availability,
    classifyFailure,
    playSyllable,
    inspectShadowing,
    playShadowing,
    playExactSequence,
    report
  };
})(window);

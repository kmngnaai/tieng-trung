(() => {
  'use strict';

  const DB_NAME = 'tieng-trung-listening-audio-v1';
  const STORE = 'audio';
  const MAX_BYTES = 300 * 1024 * 1024;
  const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
  const encoder = new TextEncoder();

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'key' });
          store.createIndex('lastUsedAt', 'lastUsedAt');
          store.createIndex('expiresAt', 'expiresAt');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function digest(value) {
    const data = encoder.encode(value);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function keyFor({ text, voice, rate, format = 'mp3-24k-48k' }) {
    return digest(`${text}\n${voice}\n${rate}\n${format}`);
  }

  async function get(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const request = store.get(key);
      request.onsuccess = () => {
        const entry = request.result;
        if (!entry) return resolve(null);
        entry.lastUsedAt = Date.now();
        store.put(entry);
        resolve(entry);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function put(entry) {
    const db = await openDb();
    const now = Date.now();
    const record = {
      ...entry,
      createdAt: entry.createdAt || now,
      lastUsedAt: now,
      expiresAt: now + MAX_AGE_MS,
      size: entry.blob && entry.blob.size || entry.size || 0
    };
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    await cleanup();
    return record;
  }

  async function all() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async function remove(keys) {
    if (!keys.length) return;
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      keys.forEach((key) => store.delete(key));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function cleanup() {
    const entries = await all();
    const now = Date.now();
    const expired = entries.filter((entry) => entry.expiresAt && entry.expiresAt <= now);
    await remove(expired.map((entry) => entry.key));
    const remaining = entries.filter((entry) => !expired.some((item) => item.key === entry.key));
    let total = remaining.reduce((sum, entry) => sum + (entry.size || 0), 0);
    if (total <= MAX_BYTES) return;
    const sorted = remaining.sort((a, b) => {
      const ratingRank = { hard: 2, review: 1, easy: 0 };
      const rankDiff = (ratingRank[a.rating] || 0) - (ratingRank[b.rating] || 0);
      if (rankDiff !== 0) return rankDiff;
      return (a.lastUsedAt || 0) - (b.lastUsedAt || 0);
    });
    const toDelete = [];
    for (const entry of sorted) {
      if (total <= MAX_BYTES) break;
      total -= entry.size || 0;
      toDelete.push(entry.key);
    }
    await remove(toDelete);
  }

  async function clearExpired() {
    const entries = await all();
    const now = Date.now();
    await remove(entries.filter((entry) => entry.expiresAt && entry.expiresAt <= now).map((entry) => entry.key));
  }

  async function clearAll() {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function stats() {
    const entries = await all();
    return {
      count: entries.length,
      bytes: entries.reduce((sum, entry) => sum + (entry.size || 0), 0),
      maxBytes: MAX_BYTES
    };
  }

  async function fetchAzure({ endpoint, text, voice, rate, signal }) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, rate }),
      signal
    });
    if (!response.ok) {
      const message = await response.text().catch(() => '');
      throw new Error(message || `Azure TTS lỗi ${response.status}`);
    }
    return response.blob();
  }

  async function resolveAudio({ text, voice, rate, endpoint, importedOnly = false, signal }) {
    const key = await keyFor({ text, voice, rate });
    const cached = await get(key);
    if (cached && cached.blob) return { ...cached, source: cached.source || 'cache' };
    if (importedOnly) return null;
    if (!endpoint) throw new Error('Chưa cấu hình Azure Function endpoint.');
    const blob = await fetchAzure({ endpoint, text, voice, rate, signal });
    const entry = await put({ key, text, voice, rate, blob, source: 'azure' });
    return entry;
  }

  async function importForText({ file, text, voice, rate, itemId = '' }) {
    const key = await keyFor({ text, voice, rate });
    return put({ key, text, voice, rate, itemId, blob: file, source: 'import', originalName: file.name || '' });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.ListeningAzureAudio = {
    keyFor,
    get,
    put,
    stats,
    cleanup,
    clearExpired,
    clearAll,
    resolveAudio,
    importForText,
    downloadBlob,
    constants: { MAX_BYTES, MAX_AGE_MS }
  };
})();

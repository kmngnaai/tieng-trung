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
    const hash = await crypto.subtle.digest('SHA-256', encoder.encode(value));
    return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function keyFor({ text, itemId = '', scope = 'card' }) {
    return digest(`import\n${scope}\n${itemId}\n${String(text || '').trim()}`);
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
      source: 'import',
      createdAt: entry.createdAt || now,
      lastUsedAt: now,
      expiresAt: now + MAX_AGE_MS,
      size: entry.blob?.size || entry.size || 0
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
    // Chỉ giữ MP3 do người dùng nhập; loại bỏ cache online từ các bản cũ.
    const obsolete = entries.filter((entry) => entry.source !== 'import');
    const expired = entries.filter((entry) => entry.source === 'import' && entry.expiresAt && entry.expiresAt <= now);
    await remove([...obsolete, ...expired].map((entry) => entry.key));

    const removed = new Set([...obsolete, ...expired].map((entry) => entry.key));
    const remaining = entries.filter((entry) => !removed.has(entry.key) && entry.source === 'import');
    let total = remaining.reduce((sum, entry) => sum + (entry.size || 0), 0);
    if (total <= MAX_BYTES) return;

    const ratingRank = { hard: 2, review: 1, easy: 0 };
    const sorted = remaining.sort((a, b) => {
      const rankDiff = (ratingRank[a.rating] || 0) - (ratingRank[b.rating] || 0);
      return rankDiff || (a.lastUsedAt || 0) - (b.lastUsedAt || 0);
    });
    const toDelete = [];
    for (const entry of sorted) {
      if (total <= MAX_BYTES) break;
      total -= entry.size || 0;
      toDelete.push(entry.key);
    }
    await remove(toDelete);
  }

  async function resolveImported({ text, itemId = '', scope = 'card' }) {
    const normalizedText = String(text || '').trim();
    const key = await keyFor({ text: normalizedText, itemId, scope });
    const entry = await get(key);
    if (entry?.source === 'import' && entry.blob) return entry;

    // Tương thích mọi bản cũ: ưu tiên itemId + scope, rồi text + scope,
    // cuối cùng mới nhận bản ghi chưa có scope. Không lấy MP3 của card cho passage.
    const legacyEntries = await all();
    const imported = legacyEntries.filter((item) => item.source === 'import' && item.blob);
    const legacy =
      imported.find((item) => itemId && item.itemId === itemId && item.scope === scope) ||
      imported.find((item) => normalizedText && String(item.text || '').trim() === normalizedText && item.scope === scope) ||
      imported.find((item) => !item.scope && itemId && item.itemId === itemId) ||
      imported.find((item) => !item.scope && normalizedText && String(item.text || '').trim() === normalizedText);
    if (!legacy) return null;
    const migrated = await put({ ...legacy, key, scope, text: normalizedText, itemId, source: 'import' });
    if (legacy.key !== key) await remove([legacy.key]);
    return migrated;
  }

  async function removeImported({ text, itemId = '', scope = 'card' }) {
    const normalizedText = String(text || '').trim();
    const exactKey = await keyFor({ text: normalizedText, itemId, scope });
    const entries = await all();
    const keys = entries.filter((item) => item.source === 'import' && (
      item.key === exactKey ||
      (item.scope === scope && itemId && item.itemId === itemId) ||
      (item.scope === scope && normalizedText && String(item.text || '').trim() === normalizedText) ||
      (!item.scope && itemId && item.itemId === itemId) ||
      (!item.scope && normalizedText && String(item.text || '').trim() === normalizedText)
    )).map((item) => item.key);
    await remove([...new Set(keys)]);
    return keys.length;
  }

  async function importForText({ file, text, itemId = '', duration = 0, scope = 'card' }) {
    const key = await keyFor({ text, itemId, scope });
    return put({
      key,
      scope,
      text,
      itemId,
      duration,
      blob: file,
      originalName: file.name || '',
      mimeType: file.type || 'audio/mpeg'
    });
  }

  async function clearExpired() {
    const entries = await all();
    const now = Date.now();
    await remove(entries.filter((entry) => entry.source !== 'import' || (entry.expiresAt && entry.expiresAt <= now)).map((entry) => entry.key));
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
    const entries = (await all()).filter((entry) => entry.source === 'import');
    return {
      count: entries.length,
      bytes: entries.reduce((sum, entry) => sum + (entry.size || 0), 0),
      maxBytes: MAX_BYTES
    };
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

  window.ListeningAudioStore = {
    keyFor,
    get,
    put,
    stats,
    cleanup,
    clearExpired,
    clearAll,
    resolveImported,
    importForText,
    removeImported,
    downloadBlob,
    constants: { MAX_BYTES, MAX_AGE_MS }
  };

  cleanup().catch((error) => console.warn('Không thể dọn cache audio:', error));
})();

(() => {
  'use strict';

  const ImportCore = window.TiengTrungImportCore;
  const DB_NAME = 'tiengTrungListeningLibrary';
  const DB_VERSION = 2;
  const STORES = Object.freeze({ groups: 'groups', decks: 'decks', trash: 'trash' });
  const LEGACY_KEY = 'tieng-trung-listening-custom-v1';
  const MIGRATION_KEY = 'tieng-trung-listening-library-migrated-v1';
  const TRASH_DAYS = 30;

  function nowIso() {
    return new Date().toISOString();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function slug(value, fallback = 'item') {
    const normalized = String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\u3400-\u9fff]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
    return normalized || fallback;
  }

  function makeId(prefix, value) {
    const base = slug(value, prefix);
    const time = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 7);
    return `${prefix}-${base}-${time}-${random}`;
  }

  function containsHan(value) {
    return /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u.test(String(value || ''));
  }

  function cleanSpeakerPrefix(text, speaker) {
    let result = String(text || '').trim();
    const name = String(speaker || '').trim();
    if (!name) return result;
    ['：', ':'].forEach((separator) => {
      const prefix = `${name}${separator}`;
      if (result.startsWith(prefix)) result = result.slice(prefix.length).trim();
    });
    return result;
  }

  function normalizeCard(raw, context = {}) {
    if (typeof raw === 'string') raw = { word: raw };
    if (!raw || typeof raw !== 'object') return null;
    const speaker = String(raw.speaker || raw.speaker_zh || raw.role || '').trim();
    const word = cleanSpeakerPrefix(
      raw.word ?? raw.zh ?? raw.text ?? raw.chinese ?? raw.hanzi ?? raw.sentence ?? '',
      speaker
    );
    if (!containsHan(word)) return null;
    const pinyin = String(raw.pinyin ?? raw.py ?? raw.romanization ?? '').trim();
    const meaningVi = String(raw.meaningVi ?? raw.meaning ?? raw.vi ?? raw.vietnamese ?? raw.translation ?? '').trim();
    return {
      id: String(raw.id || makeId('card', word)),
      speaker,
      word,
      pinyin,
      meaningVi,
      listenEnabled: raw.listenEnabled !== false,
      createdAt: String(raw.createdAt || context.createdAt || nowIso()),
      updatedAt: nowIso()
    };
  }

  function dedupeCards(cards) {
    const seen = new Set();
    return cards.filter((card) => {
      if (!card) return false;
      const key = `${card.speaker}\u0000${card.word}\u0000${card.pinyin}\u0000${card.meaningVi}`.normalize('NFC');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function normalizeGroup(raw, index = 0) {
    if (!raw || typeof raw !== 'object') return null;
    const name = String(raw.name || raw.title || `Nhóm ${index + 1}`).trim();
    return {
      id: String(raw.id || makeId('group', name)),
      name,
      description: String(raw.description || '').trim(),
      createdAt: String(raw.createdAt || nowIso()),
      updatedAt: nowIso()
    };
  }

  function normalizeDeck(raw, index = 0, groupIdFallback = null) {
    if (!raw || typeof raw !== 'object') return null;
    if (ImportCore && typeof ImportCore.normalizeExistingListeningDeck === 'function') {
      const candidate = Object.assign({}, raw, {
        groupId: raw.groupId === null ? null : String(raw.groupId || groupIdFallback || '') || null
      });
      const deck = ImportCore.normalizeExistingListeningDeck(candidate, index);
      if (!deck || (!(deck.dataset?.words || []).length && !(deck.dataset?.sentences || []).length)) return null;
      return deck;
    }
    const name = String(raw.name || raw.title || `Bộ ${index + 1}`).trim();
    const sourceCards = Array.isArray(raw.cards) ? raw.cards : Array.isArray(raw.items) ? raw.items : [];
    const cards = dedupeCards(sourceCards.map((card) => normalizeCard(card)).filter(Boolean));
    if (!cards.length) return null;
    return {
      id: String(raw.id || makeId('deck', name)), name,
      description: String(raw.description || raw.summary || '').trim(),
      groupId: raw.groupId === null ? null : String(raw.groupId || groupIdFallback || '') || null,
      cards, createdAt: String(raw.createdAt || nowIso()), updatedAt: nowIso()
    };
  }

  function collectGenericCards(value, output = [], seen = new Set()) {
    if (value == null) return output;
    if (typeof value === 'string') {
      const card = normalizeCard(value);
      if (card && !seen.has(card.word)) {
        seen.add(card.word);
        output.push(card);
      }
      return output;
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => collectGenericCards(entry, output, seen));
      return output;
    }
    if (typeof value !== 'object') return output;
    const direct = normalizeCard(value);
    if (direct) {
      const key = `${direct.speaker}\u0000${direct.word}\u0000${direct.pinyin}\u0000${direct.meaningVi}`;
      if (!seen.has(key)) {
        seen.add(key);
        output.push(direct);
      }
      return output;
    }
    Object.entries(value).forEach(([key, child]) => {
      if (['groups', 'decks', 'results', 'metadata', 'sources'].includes(key)) return;
      collectGenericCards(child, output, seen);
    });
    return output;
  }

  function parseImportPayload(data, fileName = 'Bộ tự tạo') {
    const groups = [];
    const decks = [];
    const groupMap = new Map();

    const rawGroups = Array.isArray(data?.groups) ? data.groups : [];
    rawGroups.forEach((raw, index) => {
      const group = normalizeGroup(raw, index);
      if (!group) return;
      groups.push(group);
      groupMap.set(String(raw.id || group.id), group.id);
    });

    const rawDecks = Array.isArray(data)
      ? data
      : Array.isArray(data?.decks)
        ? data.decks
        : data?.deck && typeof data.deck === 'object'
          ? [data.deck]
          : [];

    rawDecks.forEach((raw, index) => {
      const mappedGroupId = raw?.groupId ? (groupMap.get(String(raw.groupId)) || String(raw.groupId)) : null;
      const deck = normalizeDeck(raw, index, mappedGroupId);
      if (deck) decks.push(deck);
    });

    if (!decks.length) {
      const title = String(data?.title || data?.name || fileName.replace(/\.json$/i, '') || 'Bộ tự tạo').trim();
      const cards = collectGenericCards(data);
      if (cards.length) {
        decks.push({
          id: makeId('deck', title),
          name: title,
          description: String(data?.description || '').trim(),
          groupId: null,
          mode: 'dialogue',
          sourceLessons: [],
          cards: dedupeCards(cards),
          createdAt: nowIso(),
          updatedAt: nowIso()
        });
      }
    }

    const validGroupIds = new Set(groups.map((group) => group.id));
    decks.forEach((deck) => {
      if (deck.groupId && !validGroupIds.has(deck.groupId)) deck.groupId = null;
    });

    return { groups, decks };
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
      transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
    });
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORES.groups)) db.createObjectStore(STORES.groups, { keyPath: 'id' });
        let deckStore;
        if (!db.objectStoreNames.contains(STORES.decks)) {
          deckStore = db.createObjectStore(STORES.decks, { keyPath: 'id' });
          deckStore.createIndex('groupId', 'groupId', { unique: false });
        } else {
          deckStore = request.transaction.objectStore(STORES.decks);
          if (!deckStore.indexNames.contains('groupId')) deckStore.createIndex('groupId', 'groupId', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.trash)) db.createObjectStore(STORES.trash, { keyPath: 'id' });
        if (event.oldVersion < 2 && deckStore && ImportCore) {
          deckStore.openCursor().onsuccess = (event) => {
            const cursor = event.target.result;
            if (!cursor) return;
            try { cursor.update(normalizeDeck(cursor.value)); } catch (error) { console.warn('Không di chuyển được bộ Nghe cũ:', error); }
            cursor.continue();
          };
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Không mở được thư viện Nghe.'));
    });
  }

  async function withStore(storeNames, mode, callback) {
    const db = await openDb();
    try {
      const transaction = db.transaction(storeNames, mode);
      const stores = Object.fromEntries(storeNames.map((name) => [name, transaction.objectStore(name)]));
      const result = await callback(stores, transaction);
      await transactionDone(transaction);
      return result;
    } finally {
      db.close();
    }
  }

  async function getAll(storeName) {
    return withStore([storeName], 'readonly', async (stores) => requestToPromise(stores[storeName].getAll()));
  }

  async function putAll(storeName, values) {
    if (!values.length) return;
    await withStore([storeName], 'readwrite', async (stores) => {
      values.forEach((value) => stores[storeName].put(clone(value)));
    });
  }

  async function migrateLegacy() {
    if (localStorage.getItem(MIGRATION_KEY) === '1') return;
    let legacy = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
      legacy = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      legacy = [];
    }
    const decks = legacy.map((entry, index) => normalizeDeck({
      id: entry.id,
      name: entry.title || entry.name || `Bộ ${index + 1}`,
      description: entry.description || '',
      groupId: null,
      cards: entry.items || entry.cards || []
    }, index)).filter(Boolean);
    if (decks.length) await putAll(STORES.decks, decks);
    localStorage.setItem(MIGRATION_KEY, '1');
  }

  async function purgeExpiredTrash() {
    const now = Date.now();
    await withStore([STORES.trash], 'readwrite', async (stores) => {
      const items = await requestToPromise(stores.trash.getAll());
      items.forEach((item) => {
        if (new Date(item.expiresAt || 0).getTime() <= now) stores.trash.delete(item.id);
      });
    });
  }

  async function init() {
    await openDb().then((db) => db.close());
    await migrateLegacy();
    await purgeExpiredTrash();
  }

  async function listGroups() {
    const groups = await getAll(STORES.groups);
    return groups.sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'));
  }

  async function listDecks() {
    const decks = (await getAll(STORES.decks)).map((deck, index) => normalizeDeck(deck, index)).filter(Boolean);
    return decks.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  }

  async function getDeck(id) {
    const deck = await withStore([STORES.decks], 'readonly', async (stores) => requestToPromise(stores.decks.get(id)));
    return deck ? normalizeDeck(deck) : null;
  }

  async function getGroup(id) {
    return withStore([STORES.groups], 'readonly', async (stores) => requestToPromise(stores.groups.get(id)));
  }

  async function listTrash() {
    await purgeExpiredTrash();
    const items = await getAll(STORES.trash);
    return items.sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
  }

  function nextAvailableId(base, used) {
    const cleanBase = String(base || 'item');
    if (!used.has(cleanBase)) { used.add(cleanBase); return cleanBase; }
    let index = 2;
    while (used.has(`${cleanBase}-${index}`)) index += 1;
    const id = `${cleanBase}-${index}`;
    used.add(id);
    return id;
  }

  async function importData(data, fileName, options = {}) {
    const prepared = data && Array.isArray(data.decks) && Array.isArray(data.groups)
      ? data
      : parseImportPayload(data, fileName);
    if (Array.isArray(prepared.errors) && prepared.errors.length) throw new Error(prepared.errors.join(' · '));
    if (!prepared.decks.length) throw new Error('Không tìm thấy bộ Nghe có dữ liệu hợp lệ trong file.');
    const restore = options.restore === true;
    const existingGroups = await listGroups();
    const existingDecks = await listDecks();
    const usedGroupIds = new Set(existingGroups.map((group) => group.id));
    const usedDeckIds = new Set(existingDecks.map((deck) => deck.id));
    const groupIdMap = new Map();
    const groups = prepared.groups.map((raw, index) => {
      const group = normalizeGroup(raw, index);
      const originalId = group.id;
      group.id = restore ? originalId : nextAvailableId(originalId, usedGroupIds);
      if (restore) usedGroupIds.add(group.id);
      groupIdMap.set(originalId, group.id);
      return group;
    });
    const decks = prepared.decks.map((raw, index) => {
      const originalGroupId = raw.groupId ? String(raw.groupId) : null;
      const deck = normalizeDeck(raw, index, originalGroupId && groupIdMap.get(originalGroupId));
      if (!deck) return null;
      const originalId = deck.id;
      deck.id = restore ? originalId : nextAvailableId(originalId, usedDeckIds);
      if (restore) usedDeckIds.add(deck.id);
      deck.groupId = originalGroupId ? (groupIdMap.get(originalGroupId) || (restore ? originalGroupId : null)) : null;
      if (deck.dataset) {
        deck.dataset.unit.id = deck.id;
        deck.dataset.source.id = `custom:${deck.id}`;
        [...(deck.dataset.words || []), ...(deck.dataset.sentences || [])].forEach((item) => {
          item.sourceId = deck.id; item.lessonId = deck.id;
        });
        (deck.dataset.groups || []).forEach((group) => { group.sourceId = deck.id; group.lessonId = deck.id; });
      }
      deck.updatedAt = nowIso();
      return deck;
    }).filter(Boolean);
    await withStore([STORES.groups, STORES.decks], 'readwrite', async (stores) => {
      groups.forEach((group) => stores.groups.put(group));
      decks.forEach((deck) => stores.decks.put(deck));
    });
    const stats = ImportCore && typeof ImportCore.buildListeningImport === 'function'
      ? decks.reduce((summary, deck) => {
          summary.wordCount += (deck.dataset?.words || []).length;
          summary.sentenceCount += (deck.dataset?.sentences || []).length;
          summary.dialogueCount += (deck.dataset?.groups || []).filter((group) => group.kind === 'dialogue').length;
          summary.passageCount += (deck.dataset?.groups || []).filter((group) => group.kind === 'passage').length;
          return summary;
        }, { wordCount: 0, sentenceCount: 0, dialogueCount: 0, passageCount: 0 })
      : { wordCount: 0, sentenceCount: decks.reduce((sum, deck) => sum + deck.cards.length, 0), dialogueCount: 0, passageCount: 0 };
    return { groupCount: groups.length, deckCount: decks.length, cardCount: stats.wordCount + stats.sentenceCount, ...stats, remapped: !restore };
  }

  function backupPayload(groups, decks) {
    return {
      version: 2,
      type: 'tieng-trung-listening-library-backup',
      exportedAt: nowIso(),
      groups: clone(groups),
      decks: clone(decks),
      results: {}
    };
  }

  async function exportAll() {
    return backupPayload(await listGroups(), await listDecks());
  }

  async function exportGroup(groupId) {
    const group = await getGroup(groupId);
    if (!group) throw new Error('Nhóm không còn tồn tại.');
    const decks = (await listDecks()).filter((deck) => deck.groupId === groupId);
    return backupPayload([group], decks);
  }

  async function exportDeck(deckId) {
    const deck = await getDeck(deckId);
    if (!deck) throw new Error('Bộ không còn tồn tại.');
    const group = deck.groupId ? await getGroup(deck.groupId) : null;
    return backupPayload(group ? [group] : [], [deck]);
  }

  function downloadJson(payload, fileName) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function toggleCard(deckId, cardId, enabled) {
    await withStore([STORES.decks], 'readwrite', async (stores) => {
      const raw = await requestToPromise(stores.decks.get(deckId));
      const deck = raw ? normalizeDeck(raw) : null;
      if (!deck) throw new Error('Bộ không còn tồn tại.');
      const card = deck.cards.find((entry) => entry.id === cardId);
      if (!card) throw new Error('Nội dung không còn tồn tại.');
      card.listenEnabled = Boolean(enabled);
      const word = deck.dataset?.words?.find((entry) => entry.id === cardId);
      const sentence = deck.dataset?.sentences?.find((entry) => entry.id === cardId);
      if (word) word.listenEnabled = Boolean(enabled);
      if (sentence) sentence.listenEnabled = Boolean(enabled);
      (deck.dataset?.groups || []).forEach((group) => {
        group.items.forEach((item) => {
          if (item.canonicalSentenceId === cardId) item.listenEnabled = Boolean(enabled);
        });
      });
      deck.updatedAt = nowIso();
      stores.decks.put(deck);
    });
  }

  function trashRecord(type, payload, name) {
    const deletedAt = new Date();
    const expiresAt = new Date(deletedAt.getTime() + TRASH_DAYS * 86400000);
    return {
      id: makeId('trash', `${type}-${name}`),
      type,
      name,
      payload: clone(payload),
      deletedAt: deletedAt.toISOString(),
      expiresAt: expiresAt.toISOString()
    };
  }

  async function deleteDeck(deckId) {
    await withStore([STORES.decks, STORES.trash], 'readwrite', async (stores) => {
      const deck = await requestToPromise(stores.decks.get(deckId));
      if (!deck) throw new Error('Bộ không còn tồn tại.');
      stores.trash.put(trashRecord('deck', { deck }, deck.name));
      stores.decks.delete(deckId);
    });
  }

  async function deleteGroup(groupId, mode) {
    await withStore([STORES.groups, STORES.decks, STORES.trash], 'readwrite', async (stores) => {
      const group = await requestToPromise(stores.groups.get(groupId));
      if (!group) throw new Error('Nhóm không còn tồn tại.');
      const decks = (await requestToPromise(stores.decks.getAll())).filter((deck) => deck.groupId === groupId);
      if (mode === 'ungroup') {
        decks.forEach((deck) => {
          deck.groupId = null;
          deck.updatedAt = nowIso();
          stores.decks.put(deck);
        });
        stores.groups.delete(groupId);
        return;
      }
      stores.trash.put(trashRecord('group', { group, decks }, group.name));
      decks.forEach((deck) => stores.decks.delete(deck.id));
      stores.groups.delete(groupId);
    });
  }

  async function restoreTrash(id) {
    await withStore([STORES.groups, STORES.decks, STORES.trash], 'readwrite', async (stores) => {
      const item = await requestToPromise(stores.trash.get(id));
      if (!item) return;
      if (item.type === 'group') {
        if (item.payload.group) stores.groups.put(item.payload.group);
        (item.payload.decks || []).forEach((deck) => stores.decks.put(deck));
      } else if (item.type === 'deck' && item.payload.deck) {
        const deck = item.payload.deck;
        if (deck.groupId) {
          const group = await requestToPromise(stores.groups.get(deck.groupId));
          if (!group) deck.groupId = null;
        }
        stores.decks.put(deck);
      }
      stores.trash.delete(id);
    });
  }

  async function deleteTrashPermanently(id) {
    await withStore([STORES.trash], 'readwrite', async (stores) => stores.trash.delete(id));
  }

  async function restoreAllTrash() {
    const items = await listTrash();
    for (const item of items) await restoreTrash(item.id);
  }

  async function emptyTrash() {
    await withStore([STORES.trash], 'readwrite', async (stores) => stores.trash.clear());
  }

  window.ListeningLibraryStore = Object.freeze({
    init,
    listGroups,
    listDecks,
    listTrash,
    getGroup,
    getDeck,
    importData,
    exportAll,
    exportGroup,
    exportDeck,
    downloadJson,
    toggleCard,
    deleteDeck,
    deleteGroup,
    restoreTrash,
    deleteTrashPermanently,
    restoreAllTrash,
    emptyTrash,
    parseImportPayload,
    normalizeCard,
    normalizeDeck,
    normalizeGroup,
    constants: Object.freeze({ DB_NAME, DB_VERSION, TRASH_DAYS })
  });
})();

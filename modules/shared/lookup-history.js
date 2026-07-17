(function initLookupRecentHistory(global) {
  'use strict';

  const STORAGE_KEY = 'tiengTrung.lookup.recent.v1';
  const CHANGE_EVENT = 'tiengtrung:lookup-history-changed';
  const MAX_ITEMS = 10;

  function normalizeTarget(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function sanitize(items) {
    const seen = new Set();
    const result = [];
    for (const item of Array.isArray(items) ? items : []) {
      const target = normalizeTarget(typeof item === 'string' ? item : item?.target);
      if (!target || seen.has(target)) continue;
      seen.add(target);
      result.push(target);
      if (result.length >= MAX_ITEMS) break;
    }
    return result;
  }

  function read() {
    try {
      return sanitize(JSON.parse(global.localStorage?.getItem(STORAGE_KEY) || '[]'));
    } catch (error) {
      console.warn('[Tra gần đây] Không đọc được lịch sử:', error);
      return [];
    }
  }

  function notify(items) {
    global.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { items: [...items] } }));
  }

  function writeItems(items) {
    const next = sanitize(items);
    try {
      global.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      console.warn('[Tra gần đây] Không lưu được lịch sử:', error);
    }
    notify(next);
    return next;
  }

  function add(target) {
    const value = normalizeTarget(target);
    if (!value) return read();
    return writeItems([value, ...read().filter(item => item !== value)]);
  }

  function clear() {
    try {
      global.localStorage?.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn('[Tra gần đây] Không xóa được lịch sử:', error);
    }
    notify([]);
    return [];
  }

  global.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY) notify(read());
  });

  global.TiengTrungLookupHistory = Object.freeze({
    key: STORAGE_KEY,
    eventName: CHANGE_EVENT,
    maxItems: MAX_ITEMS,
    read,
    add,
    clear
  });
})(window);

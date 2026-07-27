from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path

VERSION = "20260725-library1-16"

CUSTOM_BLOCK = r'''
  async function refreshListeningLibrary() {
    if (!LibraryStore) throw new Error('Thiếu library-store.js.');
    await LibraryStore.init();
    const [groups, decks, trash] = await Promise.all([
      LibraryStore.listGroups(),
      LibraryStore.listDecks(),
      LibraryStore.listTrash()
    ]);
    state.libraryGroups = groups;
    state.libraryDecks = decks;
    state.libraryTrash = trash;
    state.libraryReady = true;
  }

  async function openCustomLibrary() {
    state.screen = 'custom';
    state.error = '';
    state.libraryNotice = '';
    render();
    try {
      await refreshListeningLibrary();
    } catch (error) {
      state.error = `Không mở được thư viện: ${error.message || error}`;
    }
    render();
  }

  function libraryGroupDecks(groupId) {
    return state.libraryDecks.filter((deck) => deck.groupId === groupId);
  }

  function ungroupedDecks() {
    return state.libraryDecks.filter((deck) => !deck.groupId || !state.libraryGroups.some((group) => group.id === deck.groupId));
  }

  function deckEnabledCount(deck) {
    return (deck.cards || []).filter((card) => card.listenEnabled !== false).length;
  }

  function libraryToolbar() {
    return `<div class="library-toolbar">
      <label class="library-action library-action--primary">Nhập JSON<input id="libraryFileInput" type="file" accept="application/json,.json" hidden /></label>
      <button class="library-action" data-action="export-library-all">Xuất tất cả</button>
      <button class="library-action" data-action="open-library-trash">Thùng rác${state.libraryTrash.length ? ` (${state.libraryTrash.length})` : ''}</button>
    </div>`;
  }

  function renderCustomLibrary() {
    const groups = state.libraryGroups || [];
    const decks = state.libraryDecks || [];
    const outside = ungroupedDecks();
    app.innerHTML = `
      ${pageHeader('Bộ tự tạo', `${groups.length} nhóm · ${decks.length} bộ`, true)}
      <main class="listen-main library-main">
        ${libraryToolbar()}
        ${state.libraryNotice ? `<section class="notice-card"><span>${escapeHtml(state.libraryNotice)}</span></section>` : ''}
        ${state.error ? errorCard(state.error) : ''}
        ${!state.libraryReady ? loadingCard('Đang mở thư viện bộ nghe...') : `
          <section class="section-block section-block--first">
            <div class="section-heading"><div><p class="eyebrow">Nhóm bộ</p><h2>Các nhóm đã nhập</h2></div></div>
            <div class="library-list">
              ${groups.length ? groups.map(renderLibraryGroupCard).join('') : emptyCard('Chưa có nhóm', 'File có groups/decks sẽ được giữ nguyên cấu trúc khi nhập.')}
            </div>
          </section>
          <section class="section-block">
            <div class="section-heading"><div><p class="eyebrow">Ngoài nhóm</p><h2>Chưa phân nhóm</h2></div><span class="library-count">${outside.length} bộ</span></div>
            <div class="library-list">
              ${outside.length ? outside.map(renderLibraryDeckCard).join('') : emptyCard('Không có bộ ngoài nhóm', 'Các bộ chưa gom sẽ xuất hiện tại đây.')}
            </div>
          </section>
        `}
      </main>
      ${bottomNav()}
      ${settingsSheet()}
      ${renderLibraryDialog()}
    `;
  }

  function renderLibraryGroupCard(group) {
    const decks = libraryGroupDecks(group.id);
    const cardCount = decks.reduce((sum, deck) => sum + (deck.cards || []).length, 0);
    return `<article class="library-card library-card--group">
      <button class="library-card__main" data-action="open-library-group" data-group-id="${escapeHtml(group.id)}">
        <span class="library-card__icon">组</span>
        <span class="library-card__copy"><strong>${escapeHtml(group.name)}</strong><small>${decks.length} bộ · ${cardCount} câu${group.description ? ` · ${escapeHtml(group.description)}` : ''}</small></span>
        <b aria-hidden="true">›</b>
      </button>
      <div class="library-card__actions">
        <button data-action="export-library-group" data-group-id="${escapeHtml(group.id)}">Xuất nhóm</button>
        <button class="danger-text" data-action="request-delete-library-group" data-group-id="${escapeHtml(group.id)}">Xóa nhóm</button>
      </div>
    </article>`;
  }

  function renderLibraryDeckCard(deck) {
    const enabledCount = deckEnabledCount(deck);
    const group = deck.groupId ? state.libraryGroups.find((entry) => entry.id === deck.groupId) : null;
    const isManaging = state.libraryManagerDeckId === deck.id;
    return `<article class="library-card library-card--deck">
      <button class="library-card__main" data-action="open-library-deck" data-deck-id="${escapeHtml(deck.id)}">
        <span class="library-card__icon">段</span>
        <span class="library-card__copy"><strong>${escapeHtml(deck.name)}</strong><small>${enabledCount}/${(deck.cards || []).length} câu luyện${group ? ` · ${escapeHtml(group.name)}` : ''}${deck.description ? ` · ${escapeHtml(deck.description)}` : ''}</small></span>
        <b aria-hidden="true">›</b>
      </button>
      <div class="library-card__actions">
        <button data-action="manage-library-deck" data-deck-id="${escapeHtml(deck.id)}">${isManaging ? 'Đóng danh sách' : 'Chọn câu'}</button>
        <button data-action="export-library-deck" data-deck-id="${escapeHtml(deck.id)}">Xuất bộ</button>
        <button class="danger-text" data-action="request-delete-library-deck" data-deck-id="${escapeHtml(deck.id)}">Xóa</button>
      </div>
      ${isManaging ? renderLibraryDeckManager(deck) : ''}
    </article>`;
  }

  function renderLibraryDeckManager(deck) {
    return `<div class="library-card-manager">
      ${(deck.cards || []).map((card) => `<label class="library-card-row">
        <input type="checkbox" data-action="toggle-library-card" data-deck-id="${escapeHtml(deck.id)}" data-card-id="${escapeHtml(card.id)}" ${card.listenEnabled === false ? '' : 'checked'} />
        <span><strong lang="zh-Hans">${escapeHtml(card.speaker ? `${card.speaker}：${card.word}` : card.word)}</strong><small>${escapeHtml(card.pinyin || card.meaningVi || '')}</small></span>
      </label>`).join('')}
    </div>`;
  }

  function renderCustomGroupScreen() {
    const group = state.libraryGroups.find((entry) => entry.id === state.activeLibraryGroupId);
    if (!group) {
      state.screen = 'custom';
      renderCustomLibrary();
      return;
    }
    const decks = libraryGroupDecks(group.id);
    const cardCount = decks.reduce((sum, deck) => sum + (deck.cards || []).length, 0);
    app.innerHTML = `
      ${pageHeader(group.name, `${decks.length} bộ · ${cardCount} câu`, true)}
      <main class="listen-main library-main">
        <div class="library-toolbar">
          <button class="library-action library-action--primary" data-action="export-library-group" data-group-id="${escapeHtml(group.id)}">Xuất nhóm</button>
          <button class="library-action library-action--danger" data-action="request-delete-library-group" data-group-id="${escapeHtml(group.id)}">Xóa nhóm</button>
        </div>
        ${group.description ? `<section class="notice-card"><span>${escapeHtml(group.description)}</span></section>` : ''}
        ${state.libraryNotice ? `<section class="notice-card"><span>${escapeHtml(state.libraryNotice)}</span></section>` : ''}
        ${state.error ? errorCard(state.error) : ''}
        <section class="section-block section-block--first">
          <div class="section-heading"><div><p class="eyebrow">Các đoạn</p><h2>Chọn bộ để luyện</h2></div></div>
          <div class="library-list">${decks.length ? decks.map(renderLibraryDeckCard).join('') : emptyCard('Nhóm chưa có bộ', 'Nhập lại file hoặc đưa bộ khác vào nhóm.')}</div>
        </section>
      </main>
      ${bottomNav()}
      ${settingsSheet()}
      ${renderLibraryDialog()}
    `;
  }

  function renderLibraryTrash() {
    const items = state.libraryTrash || [];
    app.innerHTML = `
      ${pageHeader('Thùng rác', `${items.length} mục · tự xóa sau 30 ngày`, true)}
      <main class="listen-main library-main">
        <div class="library-toolbar">
          <button class="library-action library-action--primary" data-action="restore-library-trash-all" ${items.length ? '' : 'disabled'}>Khôi phục tất cả</button>
          <button class="library-action library-action--danger" data-action="request-empty-library-trash" ${items.length ? '' : 'disabled'}>Dọn sạch</button>
        </div>
        ${state.libraryNotice ? `<section class="notice-card"><span>${escapeHtml(state.libraryNotice)}</span></section>` : ''}
        ${state.error ? errorCard(state.error) : ''}
        <div class="library-trash-list">
          ${items.length ? items.map(renderLibraryTrashItem).join('') : emptyCard('Thùng rác đang trống', 'Bộ hoặc nhóm bị xóa sẽ được giữ ở đây trong 30 ngày.')}
        </div>
      </main>
      ${bottomNav()}
      ${renderLibraryDialog()}
    `;
  }

  function renderLibraryTrashItem(item) {
    const expires = Math.max(0, Math.ceil((new Date(item.expiresAt).getTime() - Date.now()) / 86400000));
    const count = item.type === 'group'
      ? (item.payload.decks || []).reduce((sum, deck) => sum + (deck.cards || []).length, 0)
      : ((item.payload.deck && item.payload.deck.cards) || []).length;
    return `<article class="library-trash-card">
      <div><strong>${escapeHtml(item.name)}</strong><small>${item.type === 'group' ? 'Nhóm' : 'Bộ'} · ${count} câu · còn ${expires} ngày</small></div>
      <div class="library-card__actions">
        <button data-action="restore-library-trash" data-trash-id="${escapeHtml(item.id)}">Khôi phục</button>
        <button class="danger-text" data-action="request-delete-library-trash" data-trash-id="${escapeHtml(item.id)}">Xóa vĩnh viễn</button>
      </div>
    </article>`;
  }

  function renderLibraryDialog() {
    const dialog = state.libraryDialog;
    if (!dialog) return '';
    if (dialog.type === 'group') {
      const group = state.libraryGroups.find((entry) => entry.id === dialog.id);
      if (!group) return '';
      const decks = libraryGroupDecks(group.id);
      return `<div class="library-dialog-backdrop" data-action="close-library-dialog">
        <section class="library-dialog" role="dialog" aria-modal="true" aria-labelledby="libraryDialogTitle" onclick="event.stopPropagation()">
          <p class="eyebrow">Xóa nhóm</p><h2 id="libraryDialogTitle">${escapeHtml(group.name)}</h2>
          <p>Nhóm có ${decks.length} bộ. Chọn cách xử lý các bộ bên trong.</p>
          <button class="library-dialog-option" data-action="delete-library-group-ungroup" data-group-id="${escapeHtml(group.id)}"><strong>Đưa về Chưa phân nhóm</strong><small>Xóa nhóm nhưng giữ nguyên toàn bộ bộ và tiến độ.</small></button>
          <button class="library-dialog-option is-danger" data-action="delete-library-group-all" data-group-id="${escapeHtml(group.id)}"><strong>Xóa nhóm và các bộ</strong><small>Chuyển cả nhóm vào Thùng rác trong 30 ngày.</small></button>
          <button class="library-dialog-cancel" data-action="close-library-dialog">Hủy</button>
        </section>
      </div>`;
    }
    const title = dialog.type === 'deck' ? 'Xóa bộ?' : dialog.type === 'trash' ? 'Xóa vĩnh viễn?' : 'Dọn sạch Thùng rác?';
    const body = dialog.type === 'deck'
      ? 'Bộ sẽ được chuyển vào Thùng rác trong 30 ngày. Tiến độ học vẫn được giữ.'
      : dialog.type === 'trash'
        ? 'Mục này sẽ bị xóa vĩnh viễn và không thể khôi phục.'
        : 'Toàn bộ mục trong Thùng rác sẽ bị xóa vĩnh viễn.';
    const action = dialog.type === 'deck' ? 'confirm-delete-library-deck' : dialog.type === 'trash' ? 'confirm-delete-library-trash' : 'confirm-empty-library-trash';
    const attr = dialog.type === 'deck' ? `data-deck-id="${escapeHtml(dialog.id)}"` : dialog.type === 'trash' ? `data-trash-id="${escapeHtml(dialog.id)}"` : '';
    return `<div class="library-dialog-backdrop" data-action="close-library-dialog">
      <section class="library-dialog" role="dialog" aria-modal="true" aria-labelledby="libraryDialogTitle" onclick="event.stopPropagation()">
        <p class="eyebrow">Xác nhận</p><h2 id="libraryDialogTitle">${title}</h2><p>${body}</p>
        <div class="library-dialog-actions"><button data-action="close-library-dialog">Hủy</button><button class="is-danger" data-action="${action}" ${attr}>Xác nhận</button></div>
      </section>
    </div>`;
  }

  async function importCustomFile(file) {
    state.error = '';
    state.libraryNotice = '';
    try {
      const data = JSON.parse(await file.text());
      const summary = await LibraryStore.importData(data, file.name);
      await refreshListeningLibrary();
      state.libraryNotice = `Đã nhập ${summary.groupCount} nhóm, ${summary.deckCount} bộ và ${summary.cardCount} câu.`;
    } catch (error) {
      state.error = `Không nhập được JSON: ${error.message || error}`;
    }
    render();
  }

  async function openLibraryGroup(groupId) {
    state.activeLibraryGroupId = groupId;
    state.libraryManagerDeckId = '';
    state.libraryNotice = '';
    state.screen = 'customGroup';
    render();
  }

  async function openCustomDeck(deckId) {
    const deck = await LibraryStore.getDeck(deckId);
    if (!deck) {
      state.error = 'Bộ không còn tồn tại.';
      render();
      return;
    }
    const enabled = (deck.cards || []).filter((card) => card.listenEnabled !== false);
    if (!enabled.length) {
      state.error = 'Bộ này chưa có câu nào được bật cho luyện nghe.';
      render();
      return;
    }
    state.source = 'custom';
    state.lesson = { id: deck.id, title: deck.name, name: deck.name, groupId: deck.groupId, description: deck.description };
    state.lessonData = null;
    state.practiceItems = null;
    state.items = enabled.map((card) => ({
      id: card.id,
      text: card.word,
      pinyin: card.pinyin || '',
      meaning: card.meaningVi || '',
      speaker: card.speaker || '',
      sourceType: 'custom',
      sourceId: deck.id,
      sourceTitle: deck.name,
      lessonId: deck.id
    }));
    state.vocabulary = [];
    state.screen = 'mode';
    state.error = '';
    render();
  }

  async function exportLibrary(kind, id) {
    try {
      const payload = kind === 'all'
        ? await LibraryStore.exportAll()
        : kind === 'group'
          ? await LibraryStore.exportGroup(id)
          : await LibraryStore.exportDeck(id);
      const label = kind === 'all' ? 'tat-ca' : kind === 'group' ? `nhom-${id}` : `bo-${id}`;
      LibraryStore.downloadJson(payload, `nghe-${label}-${new Date().toISOString().slice(0, 10)}.json`);
      state.libraryNotice = 'Đã tạo file JSON để lưu hoặc chia sẻ.';
    } catch (error) {
      state.error = error.message || String(error);
    }
    render();
  }

  async function toggleLibraryCard(deckId, cardId, enabled) {
    try {
      await LibraryStore.toggleCard(deckId, cardId, enabled);
      await refreshListeningLibrary();
    } catch (error) {
      state.error = error.message || String(error);
    }
    render();
  }

  async function executeLibraryDelete(type, id, mode) {
    try {
      if (type === 'group') await LibraryStore.deleteGroup(id, mode);
      else if (type === 'deck') await LibraryStore.deleteDeck(id);
      else if (type === 'trash') await LibraryStore.deleteTrashPermanently(id);
      else if (type === 'empty') await LibraryStore.emptyTrash();
      state.libraryDialog = null;
      await refreshListeningLibrary();
      if (type === 'group' && state.screen === 'customGroup') state.screen = 'custom';
      state.libraryNotice = type === 'trash' || type === 'empty' ? 'Đã xóa vĩnh viễn.' : 'Đã chuyển dữ liệu vào Thùng rác.';
    } catch (error) {
      state.error = error.message || String(error);
    }
    render();
  }

  async function restoreLibraryTrash(id) {
    try {
      await LibraryStore.restoreTrash(id);
      await refreshListeningLibrary();
      state.libraryNotice = 'Đã khôi phục dữ liệu.';
    } catch (error) {
      state.error = error.message || String(error);
    }
    render();
  }

  async function restoreAllLibraryTrash() {
    try {
      await LibraryStore.restoreAllTrash();
      await refreshListeningLibrary();
      state.libraryNotice = 'Đã khôi phục toàn bộ.';
    } catch (error) {
      state.error = error.message || String(error);
    }
    render();
  }

  function renderModeChoice() {
'''

CSS = r'''

/* Listening library v1.16 — one groups/decks/trash subsystem */
.library-main { padding-bottom: calc(92px + env(safe-area-inset-bottom)); }
.library-toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.library-action { min-height: 42px; padding: 9px 13px; border: 1px solid var(--line, #d6e7e1); border-radius: 13px; background: #fff; color: var(--ink, #18302b); font: inherit; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.library-action--primary { background: var(--primary, #168b78); color: #fff; border-color: transparent; }
.library-action--danger { color: #a33b34; }
.library-action:disabled { opacity: .45; cursor: default; }
.library-list, .library-trash-list { display: grid; gap: 10px; }
.library-count { color: var(--muted, #71827d); font-size: 12px; }
.library-card, .library-trash-card { border: 1px solid var(--line, #d7e7e2); border-radius: 17px; background: #fff; overflow: hidden; box-shadow: 0 5px 16px rgba(35, 85, 72, .045); }
.library-card__main { width: 100%; border: 0; background: transparent; display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; gap: 11px; align-items: center; padding: 12px; text-align: left; color: inherit; font: inherit; cursor: pointer; }
.library-card__icon { width: 44px; height: 44px; border-radius: 13px; display: grid; place-items: center; background: #e5f6f1; color: #087765; font-family: var(--font-hanzi, serif); font-size: 21px; font-weight: 400; }
.library-card__copy { min-width: 0; display: grid; gap: 3px; }
.library-card__copy strong { font-size: 15px; line-height: 1.25; }
.library-card__copy small { color: var(--muted, #72827e); font-size: 11px; line-height: 1.35; overflow-wrap: anywhere; }
.library-card__main > b { font-size: 23px; color: #6f817c; }
.library-card__actions { display: flex; flex-wrap: wrap; gap: 7px; padding: 0 12px 11px; }
.library-card__actions button { min-height: 34px; border: 1px solid var(--line, #d6e7e1); border-radius: 10px; background: #fff; padding: 6px 10px; color: #176f61; font: inherit; font-size: 12px; font-weight: 700; }
.library-card__actions .danger-text { color: #a43e37; }
.library-card-manager { border-top: 1px dashed var(--line, #d6e7e1); padding: 7px 12px 12px; display: grid; gap: 3px; }
.library-card-row { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 9px; align-items: start; padding: 8px 0; }
.library-card-row span { display: grid; gap: 2px; min-width: 0; }
.library-card-row strong { font-family: var(--font-hanzi, serif); font-weight: 400; font-size: 17px; line-height: 1.45; }
.library-card-row small { color: var(--muted, #72827e); font-size: 11px; }
.library-trash-card { padding: 13px; display: grid; gap: 10px; }
.library-trash-card > div:first-child { display: grid; gap: 3px; }
.library-trash-card small { color: var(--muted, #72827e); font-size: 12px; }
.library-dialog-backdrop { position: fixed; inset: 0; z-index: 120; background: rgba(20, 38, 34, .42); display: grid; align-items: end; padding: 12px; }
.library-dialog { width: min(520px, 100%); max-height: calc(100dvh - 24px); overflow: auto; margin: 0 auto; border-radius: 24px 24px 18px 18px; background: #fff; padding: 20px; box-shadow: 0 18px 60px rgba(0,0,0,.2); }
.library-dialog h2 { margin: 3px 0 8px; font-size: 23px; }
.library-dialog > p:not(.eyebrow) { color: var(--muted, #687a75); line-height: 1.5; }
.library-dialog-option { width: 100%; display: grid; gap: 3px; text-align: left; margin-top: 10px; padding: 13px; border: 1px solid var(--line, #d6e7e1); border-radius: 14px; background: #f8fcfa; color: inherit; font: inherit; }
.library-dialog-option small { color: var(--muted, #687a75); line-height: 1.4; }
.library-dialog-option.is-danger { border-color: #efd3cf; background: #fff8f7; color: #9c332d; }
.library-dialog-cancel { width: 100%; min-height: 43px; margin-top: 12px; border: 0; background: transparent; color: #526762; font: inherit; font-weight: 700; }
.library-dialog-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; margin-top: 15px; }
.library-dialog-actions button { min-height: 44px; border: 1px solid var(--line, #d6e7e1); border-radius: 13px; background: #fff; font: inherit; font-weight: 700; }
.library-dialog-actions .is-danger { background: #a63e37; border-color: #a63e37; color: #fff; }
@media (min-width: 700px) { .library-dialog-backdrop { align-items: center; } .library-dialog { border-radius: 22px; } }
'''


def replace_once(text: str, pattern: str, replacement: str, label: str, flags: int = 0) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"Không tìm thấy đúng khối {label} (count={count}). Repo có thể đã khác phiên bản dự kiến.")
    return updated


def patch_app(text: str) -> str:
    # Remove old flat localStorage library and introduce one IndexedDB subsystem.
    text = text.replace("  const Core = window.ListeningCore;\n", "  const Core = window.ListeningCore;\n  const LibraryStore = window.ListeningLibraryStore;\n", 1)
    text = text.replace("  const CUSTOM_KEY = 'tieng-trung-listening-custom-v1';\n", "", 1)
    text = text.replace("    customGroups: loadJson(CUSTOM_KEY, []),\n", "    libraryGroups: [],\n    libraryDecks: [],\n    libraryTrash: [],\n    libraryReady: false,\n    activeLibraryGroupId: '',\n    libraryManagerDeckId: '',\n    libraryDialog: null,\n    libraryNotice: '',\n", 1)
    text = re.sub(r"\n  function saveCustomGroups\(\) \{\n    saveJson\(CUSTOM_KEY, state\.customGroups\);\n  \}", "", text, count=1)
    text = text.replace("    if (state.source === 'custom') return state.lesson && state.lesson.title || 'Bộ tự tạo';", "    if (state.source === 'custom') return state.lesson && (state.lesson.name || state.lesson.title) || 'Bộ tự tạo';", 1)
    text = text.replace("    else if (state.screen === 'custom') renderCustomLibrary();\n", "    else if (state.screen === 'custom') renderCustomLibrary();\n    else if (state.screen === 'customGroup') renderCustomGroupScreen();\n    else if (state.screen === 'customTrash') renderLibraryTrash();\n", 1)

    text = replace_once(
        text,
        r"  function renderCustomLibrary\(\) \{.*?\n  function renderModeChoice\(\) \{",
        CUSTOM_BLOCK,
        "thư viện Bộ tự tạo cũ",
        re.S,
    )

    text = text.replace("      else if (action === 'open-custom') element.onclick = () => setScreen('custom');", "      else if (action === 'open-custom') element.onclick = openCustomLibrary;", 1)
    old_actions = """      else if (action === 'open-custom-group') element.onclick = () => openCustomGroup(element.dataset.groupId);
      else if (action === 'manage-custom-group') element.onclick = () => toggleCustomManager(element.dataset.groupId);
      else if (action === 'delete-custom-group') element.onclick = () => deleteCustomGroup(element.dataset.groupId);"""
    new_actions = """      else if (action === 'open-library-group') element.onclick = () => openLibraryGroup(element.dataset.groupId);
      else if (action === 'open-library-deck') element.onclick = () => openCustomDeck(element.dataset.deckId);
      else if (action === 'manage-library-deck') element.onclick = () => { state.libraryManagerDeckId = state.libraryManagerDeckId === element.dataset.deckId ? '' : element.dataset.deckId; render(); };
      else if (action === 'export-library-all') element.onclick = () => exportLibrary('all');
      else if (action === 'export-library-group') element.onclick = () => exportLibrary('group', element.dataset.groupId);
      else if (action === 'export-library-deck') element.onclick = () => exportLibrary('deck', element.dataset.deckId);
      else if (action === 'open-library-trash') element.onclick = async () => { state.screen = 'customTrash'; await refreshListeningLibrary(); render(); };
      else if (action === 'request-delete-library-group') element.onclick = () => { state.libraryDialog = { type: 'group', id: element.dataset.groupId }; render(); };
      else if (action === 'request-delete-library-deck') element.onclick = () => { state.libraryDialog = { type: 'deck', id: element.dataset.deckId }; render(); };
      else if (action === 'request-delete-library-trash') element.onclick = () => { state.libraryDialog = { type: 'trash', id: element.dataset.trashId }; render(); };
      else if (action === 'request-empty-library-trash') element.onclick = () => { state.libraryDialog = { type: 'empty' }; render(); };
      else if (action === 'close-library-dialog') element.onclick = () => { state.libraryDialog = null; render(); };
      else if (action === 'delete-library-group-ungroup') element.onclick = () => executeLibraryDelete('group', element.dataset.groupId, 'ungroup');
      else if (action === 'delete-library-group-all') element.onclick = () => executeLibraryDelete('group', element.dataset.groupId, 'delete');
      else if (action === 'confirm-delete-library-deck') element.onclick = () => executeLibraryDelete('deck', element.dataset.deckId);
      else if (action === 'confirm-delete-library-trash') element.onclick = () => executeLibraryDelete('trash', element.dataset.trashId);
      else if (action === 'confirm-empty-library-trash') element.onclick = () => executeLibraryDelete('empty');
      else if (action === 'restore-library-trash') element.onclick = () => restoreLibraryTrash(element.dataset.trashId);
      else if (action === 'restore-library-trash-all') element.onclick = restoreAllLibraryTrash;"""
    if old_actions not in text:
        raise RuntimeError("Không tìm thấy chuỗi action Bộ tự tạo cũ.")
    text = text.replace(old_actions, new_actions, 1)

    text = text.replace("    const fileInput = document.getElementById('customFileInput');\n    if (fileInput) fileInput.onchange = () => { if (fileInput.files && fileInput.files[0]) importCustomFile(fileInput.files[0]); };\n\n    app.querySelectorAll('[data-action=\"toggle-custom-item\"]').forEach((input) => {\n      input.onchange = () => toggleCustomItem(input.dataset.groupId, Number(input.dataset.itemIndex), input.checked);\n    });", "    const fileInput = document.getElementById('libraryFileInput');\n    if (fileInput) fileInput.onchange = () => { if (fileInput.files && fileInput.files[0]) importCustomFile(fileInput.files[0]); };\n\n    app.querySelectorAll('[data-action=\"toggle-library-card\"]').forEach((input) => {\n      input.onchange = () => toggleLibraryCard(input.dataset.deckId, input.dataset.cardId, input.checked);\n    });", 1)

    text = replace_once(
        text,
        r"    if \(session\.source === 'custom'\) \{.*?\n      return;\n    \}",
        """    if (session.source === 'custom') {
      await refreshListeningLibrary();
      const deck = state.libraryDecks.find((entry) => entry.id === session.lessonId);
      if (deck) {
        if (deck.groupId) state.activeLibraryGroupId = deck.groupId;
        await openCustomDeck(deck.id);
        startPractice(session.mode || 'dictation', session.currentIndex || 0);
      }
      return;
    }""",
        "khôi phục phiên Bộ tự tạo",
        re.S,
    )

    text = replace_once(
        text,
        r"\n\s*function toggleCustomManager\(groupId\) \{.*?\n\s*function goBack\(\) \{",
        "\n\n  function goBack() {",
        "hàm quản lý/xóa Bộ tự tạo cũ",
        re.S,
    )

    text = text.replace("      state.screen = state.source === '301' ? 'lessons301' : state.source === 'custom' ? 'custom' : 'home';", "      if (state.source === '301') state.screen = 'lessons301';\n      else if (state.source === 'custom') state.screen = state.lesson && state.lesson.groupId ? 'customGroup' : 'custom';\n      else state.screen = 'home';", 1)
    text = text.replace("    setScreen('home');\n  }\n  function syncOverlayState()", "    if (state.screen === 'customGroup' || state.screen === 'customTrash') {\n      state.screen = 'custom';\n      state.activeLibraryGroupId = '';\n      state.libraryManagerDeckId = '';\n      render();\n      return;\n    }\n    setScreen('home');\n  }\n  function syncOverlayState()", 1)

    # Initialize library once without blocking the rest of the app.
    text = text.replace("  window.addEventListener('pagehide', () => { stopSpeech(); clearAutoAdvance(); });", "  if (LibraryStore) {\n    LibraryStore.init().then(refreshListeningLibrary).catch((error) => console.warn('Không khởi tạo được thư viện Nghe:', error));\n  }\n  window.addEventListener('pagehide', () => { stopSpeech(); clearAutoAdvance(); });", 1)
    return text


def patch_index(text: str) -> str:
    if 'library-store.js' not in text:
        text = re.sub(
            r'(\s*<script src="core\.js\?v=[^"]+"></script>)',
            rf'\1\n  <script src="library-store.js?v={VERSION}"></script>',
            text,
            count=1,
        )
    text = re.sub(r'style\.css\?v=[^"]+', f'style.css?v={VERSION}', text)
    text = re.sub(r'app\.js\?v=[^"]+', f'app.js?v={VERSION}', text)
    return text


def main() -> None:
    if len(sys.argv) != 2:
        print('Cách dùng: python install_listening_library_v1_16.py "D:\\...\\tieng-trung-web"')
        raise SystemExit(2)

    repo = Path(sys.argv[1]).expanduser().resolve()
    module = repo / 'modules' / 'listening'
    app_path = module / 'app.js'
    style_path = module / 'style.css'
    index_path = module / 'index.html'
    source_store = Path(__file__).resolve().parent / 'modules' / 'listening' / 'library-store.js'

    for path in (app_path, style_path, index_path, source_store):
        if not path.exists():
            raise FileNotFoundError(path)

    backup = module / 'backup-before-library-v1.16'
    backup.mkdir(exist_ok=True)
    for path in (app_path, style_path, index_path):
        shutil.copy2(path, backup / path.name)

    app_text = app_path.read_text(encoding='utf-8')
    if 'Listening library v1.16' in app_text:
        print('V1.16 đã được cài trước đó; không sửa lặp.')
        return

    patched_app = patch_app(app_text)
    patched_app = patched_app.replace("(() => {\n  'use strict';", "(() => {\n  'use strict';\n  // Listening library v1.16 — groups/decks/trash replace the old flat custom list.", 1)
    app_path.write_text(patched_app, encoding='utf-8', newline='\n')

    style_text = style_path.read_text(encoding='utf-8')
    if 'Listening library v1.16' not in style_text:
        style_path.write_text(style_text.rstrip() + CSS + '\n', encoding='utf-8', newline='\n')

    index_path.write_text(patch_index(index_path.read_text(encoding='utf-8')), encoding='utf-8', newline='\n')
    shutil.copy2(source_store, module / 'library-store.js')

    print('Đã thay toàn bộ subsystem Bộ tự tạo của Nghe bằng cấu trúc nhóm → bộ → câu.')
    print(f'Backup: {backup}')
    print('File mới: modules/listening/library-store.js')


if __name__ == '__main__':
    main()

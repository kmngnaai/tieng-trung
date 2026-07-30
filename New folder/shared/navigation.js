(function () {
  'use strict';

  const SCRIPT_URL = document.currentScript && document.currentScript.src
    ? new URL(document.currentScript.src)
    : new URL('../shared/navigation.js', document.baseURI);
  const ROOT_URL = new URL('../../', SCRIPT_URL);
  const SETTINGS_KEY = 'tiengTrung.navigation.v1';

  const ROUTES = {
    home: new URL('index.html', ROOT_URL).href,
    lookup: new URL('modules/hanzi-stroke/prototypes/lookup-c1-2/index.html', ROOT_URL).href,
    learn: new URL('modules/hanzi-stroke/index.html', ROOT_URL).href,
    pinyin: new URL('modules/pinyin/index.html', ROOT_URL).href,
    writing: new URL('modules/hanzi-stroke/index.html?study=lookup', ROOT_URL).href,
    hsk: new URL('modules/hanzi-stroke/index.html?study=hsk', ROOT_URL).href,
    radicals: new URL('modules/hanzi-stroke/index.html?study=radicals', ROOT_URL).href,
    cards: new URL('modules/hanzi-stroke/index.html?study=flashcards', ROOT_URL).href,
    dialogue301: new URL('index.html#dialogue301', ROOT_URL).href,
    legacyRadicals: new URL('modules/bo-thu-50/index.html', ROOT_URL).href
  };

  const state = {
    drawerOpen: false,
    lastFocused: null,
    settings: readSettings()
  };

  function readSettings() {
    const defaults = { theme: 'system', fontScale: 'default', rememberLast: true };
    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
      return raw ? Object.assign(defaults, JSON.parse(raw)) : defaults;
    } catch (_error) {
      return defaults;
    }
  }

  function saveSettings() {
    try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch (_error) {}
  }

  function applySettings() {
    const root = document.documentElement;
    const dark = state.settings.theme === 'dark' || (
      state.settings.theme === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    );
    root.classList.toggle('tt-shell-dark', dark);
    const scale = state.settings.fontScale === 'small' ? 0.93 : state.settings.fontScale === 'large' ? 1.08 : 1;
    root.style.setProperty('--tt-shell-font-scale', String(scale));
  }

  function getContext() {
    const explicit = document.body && document.body.dataset ? document.body.dataset.navContext : '';
    if (explicit) return explicit;
    const path = location.pathname.toLowerCase();
    if (path.includes('/prototypes/lookup-c1-2/')) return 'lookup';
    if (path.includes('/modules/pinyin/')) return 'learn';
    if (path.includes('/modules/hanzi-stroke/')) return 'learn';
    if (path.includes('/modules/bo-thu-50/')) return 'learn';
    return 'home';
  }

  function link(icon, label, description, href, active) {
    return `<a class="tt-shell-link${active ? ' is-active' : ''}" href="${href}">
      <span class="tt-shell-link-icon" aria-hidden="true">${icon}</span>
      <span class="tt-shell-link-copy"><strong>${label}</strong>${description ? `<small>${description}</small>` : ''}</span>
    </a>`;
  }

  function createShell() {
    const context = getContext();
    const backdrop = document.createElement('div');
    backdrop.className = 'tt-shell-backdrop';
    backdrop.dataset.ttShellBackdrop = '';

    const drawer = document.createElement('aside');
    drawer.className = 'tt-shell-drawer';
    drawer.id = 'ttGlobalMenu';
    drawer.setAttribute('aria-hidden', 'true');
    drawer.setAttribute('aria-label', 'Menu chính');
    drawer.innerHTML = `
      <div class="tt-shell-drawer-head">
        <h2 class="tt-shell-drawer-title">Menu</h2>
        <button class="tt-shell-close" type="button" data-tt-close aria-label="Đóng menu">×</button>
      </div>
      <nav aria-label="Điều hướng toàn ứng dụng">
        ${link('⌂', 'Trang chủ', 'Tổng quan và truy cập nhanh', ROUTES.home, context === 'home')}
        ${link('⌕', 'Tra', 'Tra chữ, từ và lọc dữ liệu', ROUTES.lookup, context === 'lookup')}
        ${link('▤', 'Học', 'Các công cụ học hiện có', ROUTES.learn, context === 'learn')}
        <div class="tt-shell-subnav">
          ${link('拼', 'Pinyin', 'Học, nghe, quiz, ôn, tiến độ', ROUTES.pinyin, false)}
          ${link('写', 'Bút thuận', 'Tra nét và luyện viết', ROUTES.writing, false)}
          ${link('课', 'HSK & Giáo trình', 'Bài học, chủ đề, từ vựng, ngữ pháp', ROUTES.hsk, false)}
          ${link('部', 'Bộ thủ', 'Danh sách và chi tiết bộ thủ', ROUTES.radicals, false)}
          ${link('卡', 'Thẻ', 'Flashcard, Gõ Pinyin, Ôn/Khó', ROUTES.cards, false)}
          ${link('☵', '301 Đàm thoại', 'Đặt trong nhóm Học', ROUTES.dialogue301, false)}
        </div>
      </nav>
      <section class="tt-shell-section" aria-labelledby="ttSettingsTitle">
        <h3 class="tt-shell-section-title" id="ttSettingsTitle">Cài đặt nhanh</h3>
        <div class="tt-shell-setting-row">
          <label for="ttThemeSetting">Giao diện</label>
          <select id="ttThemeSetting" data-tt-setting="theme">
            <option value="system">Theo thiết bị</option>
            <option value="light">Sáng</option>
            <option value="dark">Tối</option>
          </select>
        </div>
        <div class="tt-shell-setting-row">
          <label for="ttFontSetting">Cỡ chữ</label>
          <select id="ttFontSetting" data-tt-setting="fontScale">
            <option value="small">Nhỏ</option>
            <option value="default">Mặc định</option>
            <option value="large">Lớn</option>
          </select>
        </div>
        <button class="tt-shell-action" type="button" data-tt-reset-settings>
          <span class="tt-shell-link-icon" aria-hidden="true">↺</span>
          <span class="tt-shell-link-copy"><strong>Khôi phục cài đặt menu</strong><small>Không xóa tiến độ học</small></span>
        </button>
      </section>
      <section class="tt-shell-section">
        <h3 class="tt-shell-section-title">Tiện ích</h3>
        ${link('◫', 'Bộ thủ phiên bản cũ', 'Giữ route hiện tại để đối chiếu', ROUTES.legacyRadicals, false)}
      </section>`;

    const bottom = document.createElement('nav');
    bottom.className = 'tt-shell-bottom-nav';
    bottom.setAttribute('aria-label', 'Điều hướng chính');
    bottom.innerHTML = `
      <a class="tt-shell-bottom-item${context === 'home' ? ' is-active' : ''}" href="${ROUTES.home}" ${context === 'home' ? 'aria-current="page"' : ''}><span>⌂</span><small>Trang chủ</small></a>
      <a class="tt-shell-bottom-item${context === 'lookup' ? ' is-active' : ''}" href="${ROUTES.lookup}" ${context === 'lookup' ? 'aria-current="page"' : ''}><span>⌕</span><small>Tra</small></a>
      <a class="tt-shell-bottom-item${context === 'learn' ? ' is-active' : ''}" href="${ROUTES.learn}" ${context === 'learn' ? 'aria-current="page"' : ''}><span>▤</span><small>Học</small></a>
      <button class="tt-shell-bottom-item" type="button" data-tt-open-menu><span>☰</span><small>Menu</small></button>`;

    document.body.append(backdrop, drawer, bottom);
    bindExistingMenuTrigger();
    bindShellEvents(backdrop, drawer, bottom);
    syncSettingControls(drawer);
    ensureDialogue301StudyTab();
    applyStudyQuery();
  }

  function bindExistingMenuTrigger() {
    let trigger = document.querySelector('[data-tt-open-menu], [aria-label="Menu"]');
    if (trigger && !trigger.closest('.tt-shell-bottom-nav')) {
      trigger.classList.add('tt-shell-existing-menu');
      trigger.dataset.ttOpenMenu = '';
      trigger.setAttribute('aria-controls', 'ttGlobalMenu');
      trigger.setAttribute('aria-expanded', 'false');
      return;
    }
    trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'tt-shell-menu-trigger';
    trigger.dataset.ttOpenMenu = '';
    trigger.setAttribute('aria-label', 'Menu');
    trigger.setAttribute('aria-controls', 'ttGlobalMenu');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.textContent = '☰';
    document.body.appendChild(trigger);
  }

  function bindShellEvents(backdrop, drawer, bottom) {
    document.addEventListener('click', event => {
      if (event.target.closest('[data-tt-open-menu]')) {
        event.preventDefault();
        openDrawer(false);
        return;
      }
      if (event.target.closest('[data-tt-open-settings]')) {
        event.preventDefault();
        openDrawer(true);
        return;
      }
      if (event.target.closest('[data-tt-close]') || event.target === backdrop) {
        closeDrawer();
      }
      if (event.target.closest('[data-tt-reset-settings]')) {
        state.settings = { theme: 'system', fontScale: 'default', rememberLast: true };
        saveSettings();
        applySettings();
        syncSettingControls(drawer);
      }
    });

    drawer.addEventListener('change', event => {
      const select = event.target.closest('[data-tt-setting]');
      if (!select) return;
      state.settings[select.dataset.ttSetting] = select.value;
      saveSettings();
      applySettings();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && state.drawerOpen) closeDrawer();
      if (event.key === 'Tab' && state.drawerOpen) trapFocus(event, drawer);
    });

    bottom.addEventListener('click', event => {
      const interactive = event.target.closest('a, button');
      if (!interactive || interactive.tagName !== 'A') return;
      closeDrawer();
    });
  }

  function syncSettingControls(drawer) {
    drawer.querySelectorAll('[data-tt-setting]').forEach(select => {
      const value = state.settings[select.dataset.ttSetting];
      if (value != null) select.value = value;
    });
  }

  function openDrawer(settingsOnly) {
    const drawer = document.getElementById('ttGlobalMenu');
    const backdrop = document.querySelector('[data-tt-shell-backdrop]');
    if (!drawer || !backdrop) return;
    state.lastFocused = document.activeElement;
    state.drawerOpen = true;
    document.body.classList.add('tt-shell-lock');
    drawer.classList.add('is-open');
    backdrop.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    document.querySelectorAll('[data-tt-open-menu]').forEach(button => button.setAttribute('aria-expanded', 'true'));
    const target = settingsOnly ? drawer.querySelector('#ttThemeSetting') : drawer.querySelector('[data-tt-close]');
    window.setTimeout(() => target && target.focus(), 0);
  }

  function closeDrawer() {
    if (!state.drawerOpen) return;
    const drawer = document.getElementById('ttGlobalMenu');
    const backdrop = document.querySelector('[data-tt-shell-backdrop]');
    state.drawerOpen = false;
    document.body.classList.remove('tt-shell-lock');
    drawer && drawer.classList.remove('is-open');
    backdrop && backdrop.classList.remove('is-open');
    drawer && drawer.setAttribute('aria-hidden', 'true');
    document.querySelectorAll('[data-tt-open-menu]').forEach(button => button.setAttribute('aria-expanded', 'false'));
    if (state.lastFocused && typeof state.lastFocused.focus === 'function') state.lastFocused.focus();
  }

  function trapFocus(event, drawer) {
    const focusables = Array.from(drawer.querySelectorAll('a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }


  function ensureDialogue301StudyTab() {
    const path = location.pathname.toLowerCase();
    if (!path.includes('/modules/hanzi-stroke/')) return;
    const tabs = document.querySelector('.study-tabs');
    if (!tabs) return;

    let tab = document.getElementById('studyTabDialogue301');
    if (!tab) {
      tab = document.createElement('a');
      tab.id = 'studyTabDialogue301';
      tab.className = 'study-tab';
      tab.href = ROUTES.dialogue301;
      tab.setAttribute('aria-label', 'Mở 301 Đàm thoại');
      tab.innerHTML = '<span aria-hidden="true">301</span><b>301</b>';
    }

    const placeAfterFlashcards = () => {
      const flashcards = document.getElementById('studyTabFlashcards');
      const currentTab = document.getElementById('studyTabDialogue301');
      if (!flashcards || !currentTab || flashcards.parentElement !== tabs) return false;
      if (flashcards.nextElementSibling !== currentTab) flashcards.insertAdjacentElement('afterend', currentTab);
      return true;
    };

    if (tab.parentElement !== tabs) tabs.appendChild(tab);
    if (placeAfterFlashcards()) return;

    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (placeAfterFlashcards() || tries >= 50) window.clearInterval(timer);
    }, 100);
  }

  function applyStudyQuery() {
    const path = location.pathname.toLowerCase();
    if (!path.includes('/modules/hanzi-stroke/')) return;
    const study = new URLSearchParams(location.search).get('study');
    if (!study) return;
    const ids = {
      lookup: 'studyTabLookup',
      hsk: 'studyTabHsk',
      radicals: 'studyTabRadicals',
      flashcards: 'studyTabFlashcards'
    };
    const id = ids[study];
    if (!id) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      const button = document.getElementById(id);
      if (button) {
        window.clearInterval(timer);
        button.click();
      } else if (tries >= 40) {
        window.clearInterval(timer);
      }
    }, 100);
  }

  applySettings();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', createShell, { once: true });
  else createShell();
})();

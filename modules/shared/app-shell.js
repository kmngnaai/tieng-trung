(function () {
  'use strict';

  // LISTENING_DEVICE_V1_APP_SHELL

  const currentScript = document.currentScript;
  const scriptUrl = currentScript && currentScript.src
    ? new URL(currentScript.src)
    : new URL('../shared/app-shell.js', document.baseURI);
  const rootUrl = new URL('../../', scriptUrl);
  const SETTINGS_KEY = 'tiengTrung.navigation.v2';
  const LEARNING_HISTORY_KEY = 'tiengTrung.learning.recent.v1';
  const LEARNING_HISTORY_MAX = 10;
  const LEARNING_HISTORY_EVENT = 'tiengtrung:learning-history-changed';

  const ROUTES = Object.freeze({
    home: new URL('index.html', rootUrl).href,
    lookup: new URL('modules/lookup/index.html', rootUrl).href,
    learn: new URL('modules/hanzi-stroke/index.html?study=hub', rootUrl).href,
    curriculum: new URL('modules/hanzi-stroke/index.html?study=hsk', rootUrl).href,
    radicals: new URL('modules/hanzi-stroke/index.html?study=radicals', rootUrl).href,
    cards: new URL('modules/hanzi-stroke/index.html?study=flashcards', rootUrl).href,
    listening: new URL('modules/listening/index.html', rootUrl).href,
    ldsn14: new URL('modules/ldsn14/index.html', rootUrl).href,
    newHskCourse: new URL('modules/new-hsk-course/index.html', rootUrl).href,
    writing: new URL('modules/hanzi-stroke/index.html?study=writing', rootUrl).href,
    pinyin: new URL('modules/pinyin/index.html', rootUrl).href,
    dialogue301: new URL('index.html#dialogue301', rootUrl).href,
    dialogue301Curriculum: new URL('modules/hanzi-stroke/index.html?study=hsk&curriculum=dialogue301', rootUrl).href,
    legacyRadicals: new URL('modules/bo-thu-50/index.html', rootUrl).href
  });

  const state = {
    drawerOpen: false,
    lastFocused: null,
    settings: readSettings(),
    customBreadcrumbItems: null
  };

  function readSettings() {
    const defaults = { theme: 'system', fontScale: 'default' };
    try {
      const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || '{}');
      return Object.assign({}, defaults, saved && typeof saved === 'object' ? saved : {});
    } catch (_error) {
      return defaults;
    }
  }

  function saveSettings() {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    } catch (_error) {}
  }


  function readLearningHistory() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(LEARNING_HISTORY_KEY) || '[]');
      return Array.isArray(saved) ? saved.filter(item => item && item.title && item.url).slice(0, LEARNING_HISTORY_MAX) : [];
    } catch (_error) {
      return [];
    }
  }

  function writeLearningHistory(items) {
    try {
      window.localStorage.setItem(LEARNING_HISTORY_KEY, JSON.stringify((items || []).slice(0, LEARNING_HISTORY_MAX)));
    } catch (_error) {}
  }

  function currentRelativeUrl() {
    const url = new URL(window.location.href);
    return `${url.pathname}${url.search}${url.hash}`;
  }

  function learningItemId(type, title) {
    const params = new URLSearchParams(window.location.search);
    const study = params.get('study') || '';
    const curriculum = params.get('curriculum') || '';
    const level = params.get('level') || '';
    const section = params.get('section') || '';
    const lesson = params.get('lesson') || '';
    return [type, study, curriculum, level, section, lesson, title].filter(Boolean).join('|');
  }

  function buildCurrentLearningItem(customItems = null) {
    const path = window.location.pathname.toLowerCase();
    const params = new URLSearchParams(window.location.search);
    const study = params.get('study') || 'hub';
    const breadcrumbItems = normalizeBreadcrumbItems(customItems || state.customBreadcrumbItems || createDefaultBreadcrumbItems(resolveContext()));
    const labels = breadcrumbItems.map(item => item.label).filter(Boolean);
    let item = null;

    if (window.location.hash === '#dialogue301') {
      const lessonNumber = getDialogue301LessonNumber(params.get('lesson') || '');
      item = {
        type: 'curriculum',
        icon: '课',
        title: lessonNumber ? `301 · Bài ${lessonNumber}` : '301 Đàm thoại',
        subtitle: lessonNumber ? 'Tiếp tục bài học gần nhất' : 'Giáo trình 301'
      };
    } else if (path.includes('/modules/ldsn14/')) {
      const lessonNumber = params.get('lesson') || '';
      item = { type: 'curriculum', icon: '译', title: lessonNumber ? `LDSN1-4 · Bài ${lessonNumber}` : 'LDSN1-4', subtitle: 'Luyện dịch song ngữ HSK 1–4' };
    } else if (path.includes('/modules/new-hsk-course/')) {
      const level = params.get('level') || '1';
      const lessonNumber = params.get('lesson') || '';
      item = {
        type: 'curriculum',
        icon: '课',
        title: lessonNumber ? `New HSK ${level} · Bài ${lessonNumber}` : 'New HSK 3.0',
        subtitle: lessonNumber ? 'Nội dung đầy đủ theo sách' : 'Giáo trình New HSK 1–3'
      };
    } else if (path.includes('/modules/listening/')) {
      item = { type: 'listening', icon: '听', title: 'Nghe', subtitle: 'Chép chính tả · Có transcript' };
    } else if (path.includes('/modules/pinyin/')) {
      item = { type: 'pinyin', icon: '拼', title: 'Pinyin', subtitle: 'Học · Nghe · Quiz · Ôn · Tiến độ' };
    } else if (path.includes('/modules/bo-thu-50/')) {
      item = { type: 'legacy-radicals', icon: '部', title: 'Bộ thủ 50', subtitle: 'Tài liệu tham khảo' };
    } else if (path.includes('/modules/hanzi-stroke/')) {
      if (study === 'hub') return null;
      if (study === 'writing') item = { type: 'writing', icon: '✍', title: 'Bút thuận', subtitle: 'Luyện viết và thứ tự nét' };
      else if (study === 'radical' || study === 'radicals') item = { type: 'radicals', icon: '部', title: 'Bộ thủ', subtitle: '214 bộ thủ' };
      else if (study === 'flashcards') item = { type: 'flashcards', icon: '卡', title: 'Thư viện bộ thẻ', subtitle: 'Flashcard và ôn tập' };
      else if (study === 'hsk') {
        const meaningful = labels.filter(label => !['Học', 'Giáo trình'].includes(label));
        const title = meaningful[meaningful.length - 1] || 'Giáo trình';
        const subtitle = meaningful.length > 1 ? meaningful.slice(0, -1).join(' · ') : 'Giáo trình tiếng Trung';
        item = { type: 'curriculum', icon: '课', title, subtitle };
      }
    }

    if (!item) return null;
    return {
      id: learningItemId(item.type, item.title),
      type: item.type,
      icon: item.icon,
      title: item.title,
      subtitle: item.subtitle,
      url: currentRelativeUrl(),
      updatedAt: new Date().toISOString()
    };
  }

  function recordLearningItem(item) {
    if (!item || !item.title || !item.url) return null;
    const current = readLearningHistory();
    const next = [item, ...current.filter(row => row.id !== item.id && row.url !== item.url)].slice(0, LEARNING_HISTORY_MAX);
    writeLearningHistory(next);
    if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(LEARNING_HISTORY_EVENT, { detail: { items: next, current: item } }));
    }
    return item;
  }

  function recordCurrentLearningLocation(options = {}) {
    const item = buildCurrentLearningItem(options.items || null);
    return item ? recordLearningItem(item) : null;
  }

  function clearLearningHistory() {
    writeLearningHistory([]);
    if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(LEARNING_HISTORY_EVENT, { detail: { items: [] } }));
    }
  }

  function resolveContext() {
    const path = window.location.pathname.toLowerCase();
    const study = new URLSearchParams(window.location.search).get('study');

    if (window.location.hash === '#dialogue301') return 'learn';
    if (path.includes('/modules/bo-thu-50/')) return 'menu';
    if (path.includes('/modules/lookup/')) return 'lookup';
    if (path.includes('/modules/hanzi-stroke/') || path.includes('/modules/pinyin/') || path.includes('/modules/listening/') || path.includes('/modules/ldsn14/') || path.includes('/modules/new-hsk-course/')) return 'learn';

    const explicit = document.body && document.body.dataset
      ? document.body.dataset.uiShellContext || document.body.dataset.navContext
      : '';
    if (['home', 'lookup', 'learn', 'menu'].includes(explicit)) return explicit;
    return 'home';
  }

  function applySettings() {
    const root = document.documentElement;
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = state.settings.theme === 'dark' || (state.settings.theme === 'system' && prefersDark);
    root.dataset.theme = dark ? 'dark' : 'light';
    root.classList.toggle('theme-dark', dark);
    root.style.setProperty('--ui-user-scale', state.settings.fontScale === 'small' ? '.94' : state.settings.fontScale === 'large' ? '1.08' : '1');
  }

  function headerNavLink(label, href, active) {
    return `<a class="ui-desktop-nav__item${active ? ' is-active' : ''}" href="${href}"${active ? ' aria-current="page"' : ''}>${label}</a>`;
  }

  function createHeader(context) {
    const header = document.createElement('header');
    header.className = `ui-app-header ${context === 'home' ? 'is-context-home' : 'is-context-child'}`;
    header.dataset.uiAppHeader = '';
    header.innerHTML = `
      <div class="ui-app-header__inner">
        <a class="ui-app-brand" href="${ROUTES.home}" aria-label="Về Trang chủ">
          <span class="ui-app-brand__mark" aria-hidden="true">中</span>
          <span class="ui-app-brand__copy"><strong>Tiếng Trung</strong></span>
        </a>
        <div class="ui-app-header__center">
          <nav class="ui-header-breadcrumb" data-ui-header-breadcrumb aria-label="Đường dẫn hiện tại" hidden></nav>
          <nav class="ui-desktop-nav" aria-label="Điều hướng chính">
            ${headerNavLink('Trang chủ', ROUTES.home, context === 'home')}
            ${headerNavLink('Tra', ROUTES.lookup, context === 'lookup')}
            ${headerNavLink('Học', ROUTES.learn, context === 'learn')}
            <button class="ui-desktop-nav__item${context === 'menu' ? ' is-active' : ''}" type="button" data-ui-menu-open aria-controls="uiGlobalDrawer" aria-expanded="false">Menu</button>
          </nav>
        </div>
        <div class="ui-app-header__actions">
          <button class="ui-app-icon-button" type="button" data-ui-theme-toggle aria-label="Đổi giao diện sáng hoặc tối">◐</button>
          <button class="ui-app-icon-button ui-mobile-menu-button" type="button" data-ui-menu-open aria-label="Mở Menu" aria-controls="uiGlobalDrawer" aria-expanded="false">☰</button>
        </div>
      </div>`;
    return header;
  }

  function drawerLink(icon, title, subtitle, href, active) {
    return `<a class="ui-drawer-link${active ? ' is-active' : ''}" href="${href}"${active ? ' aria-current="page"' : ''}>
      <span class="ui-drawer-link__icon" aria-hidden="true">${icon}</span>
      <span class="ui-drawer-link__copy"><strong>${title}</strong>${subtitle ? `<small>${subtitle}</small>` : ''}</span>
      <span class="ui-drawer-link__arrow" aria-hidden="true">›</span>
    </a>`;
  }

  function createDrawer(context) {
    const path = window.location.pathname.toLowerCase();
    const backdrop = document.createElement('div');
    backdrop.className = 'ui-drawer-backdrop';
    backdrop.dataset.uiDrawerBackdrop = '';

    const drawer = document.createElement('aside');
    drawer.className = 'ui-app-drawer';
    drawer.id = 'uiGlobalDrawer';
    drawer.setAttribute('aria-label', 'Menu toàn ứng dụng');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.innerHTML = `
      <div class="ui-app-drawer__header">
        <div><p>Tiếng Trung</p><h2>Menu</h2></div>
        <button class="ui-app-icon-button" type="button" data-ui-menu-close aria-label="Đóng Menu">×</button>
      </div>
      <div class="ui-app-drawer__body">
        <nav class="ui-drawer-nav" aria-label="Điều hướng chính">
          ${drawerLink('⌂', 'Trang chủ', 'Tra nhanh và học tiếp', ROUTES.home, context === 'home')}
          ${drawerLink('⌕', 'Tra', 'Tra chữ, từ nhiều chữ hoặc Pinyin', ROUTES.lookup, context === 'lookup')}
          ${drawerLink('学', 'Học', 'Giáo trình và các công cụ học', ROUTES.learn, context === 'learn')}
        </nav>

        <section class="ui-drawer-section" aria-labelledby="uiLearnGroupTitle">
          <h3 id="uiLearnGroupTitle">Học tập</h3>
          <div class="ui-drawer-subnav">
            ${drawerLink('课', 'Giáo trình', '301 · HSK 6 cấp · HSK 9 cấp · YCT · Boya', ROUTES.curriculum, false)}
            ${drawerLink('译', 'LDSN1-4', '10 bài luyện dịch song ngữ', ROUTES.ldsn14, path.includes('/modules/ldsn14/'))}
            ${drawerLink('部', 'Bộ thủ', 'Bộ thủ 214 hiện tại', ROUTES.radicals, false)}
            ${drawerLink('卡', 'Thẻ', 'Flashcard và ôn tập', ROUTES.cards, false)}
            ${drawerLink('听', 'Nghe', 'Chép chính tả và transcript', ROUTES.listening, path.includes('/modules/listening/'))}
            ${drawerLink('✍', 'Bút thuận', 'Luyện viết và thứ tự nét', ROUTES.writing, false)}
            ${drawerLink('拼', 'Pinyin', 'Học · Nghe · Quiz · Ôn · Tiến độ', ROUTES.pinyin, false)}
          </div>
        </section>

        <section class="ui-drawer-section" aria-labelledby="uiReferenceTitle">
          <h3 id="uiReferenceTitle">Tham khảo</h3>
          <div class="ui-drawer-subnav">
            ${drawerLink('部', 'Bộ thủ 50', 'Phiên bản cũ chỉ dùng để tham khảo', ROUTES.legacyRadicals, context === 'menu')}
          </div>
        </section>

        <section class="ui-drawer-section" aria-labelledby="uiQuickSettingsTitle">
          <h3 id="uiQuickSettingsTitle">Giao diện</h3>
          <label class="ui-settings-row">
            <span><strong class="ui-settings-row__label">Chế độ</strong><small class="ui-settings-row__hint">Theo thiết bị, sáng hoặc tối</small></span>
            <select class="ui-shell-select" data-ui-setting="theme">
              <option value="system">Tự động</option><option value="light">Sáng</option><option value="dark">Tối</option>
            </select>
          </label>
          <label class="ui-settings-row">
            <span><strong class="ui-settings-row__label">Cỡ chữ</strong><small class="ui-settings-row__hint">Điều chỉnh phần khung chung</small></span>
            <select class="ui-shell-select" data-ui-setting="fontScale">
              <option value="small">Nhỏ</option><option value="default">Mặc định</option><option value="large">Lớn</option>
            </select>
          </label>
          <button class="ui-button ui-button--secondary ui-drawer-reset" type="button" data-ui-settings-reset>Khôi phục mặc định</button>
        </section>
      </div>`;
    return { backdrop, drawer };
  }

  function createBottomNavigation(context) {
    const bottom = document.createElement('nav');
    bottom.className = 'ui-bottom-nav';
    bottom.setAttribute('aria-label', 'Điều hướng chính');
    bottom.innerHTML = `
      <a class="ui-bottom-nav__item${context === 'home' ? ' is-active' : ''}" href="${ROUTES.home}"${context === 'home' ? ' aria-current="page" data-ui-context-active' : ''}><span aria-hidden="true">⌂</span><small>Trang chủ</small></a>
      <a class="ui-bottom-nav__item${context === 'lookup' ? ' is-active' : ''}" href="${ROUTES.lookup}"${context === 'lookup' ? ' aria-current="page" data-ui-context-active' : ''}><span aria-hidden="true">⌕</span><small>Tra</small></a>
      <a class="ui-bottom-nav__item${context === 'learn' ? ' is-active' : ''}" href="${ROUTES.learn}"${context === 'learn' ? ' aria-current="page" data-ui-context-active' : ''}><span aria-hidden="true">学</span><small>Học</small></a>
      <button class="ui-bottom-nav__item${context === 'menu' ? ' is-active' : ''}" type="button" data-ui-menu-open${context === 'menu' ? ' data-ui-context-active' : ''} aria-label="Mở Menu"><span aria-hidden="true">☰</span><small>Menu</small></button>`;
    return bottom;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function breadcrumbItem(label, href = '', current = false) {
    return { label: String(label || ''), href: String(href || ''), current: Boolean(current) };
  }

  function getDialogue301LessonNumber(lessonId) {
    const match = String(lessonId || '').match(/(\d+)$/);
    if (!match) return '';
    const number = Number.parseInt(match[1], 10);
    return Number.isFinite(number) ? String(number) : '';
  }

  function getCurriculumLabel(sourceKey) {
    return ({
      dialogue301: '301',
      hsk: 'HSK 6 cấp',
      new_hsk: 'HSK 9 cấp',
      yct: 'YCT',
      boya: 'Boya'
    })[sourceKey] || '';
  }

  function getStoredCurriculum() {
    try {
      return window.localStorage.getItem('hanziStroke.lastCurriculum.v1') || 'dialogue301';
    } catch (_error) {
      return 'dialogue301';
    }
  }

  function curriculumUrl(sourceKey, level = '') {
    const url = new URL(ROUTES.curriculum);
    url.searchParams.set('curriculum', sourceKey);
    if (level) url.searchParams.set('level', String(level));
    return url.href;
  }

  function createDefaultBreadcrumbItems(context) {
    if (context === 'home') return [];
    const path = window.location.pathname.toLowerCase();
    const params = new URLSearchParams(window.location.search);
    const study = params.get('study') || 'hub';
    const isDialogue301 = window.location.hash === '#dialogue301';
    const items = [];

    if (context === 'lookup' || path.includes('/modules/lookup/')) {
      const query = String(params.get('q') || '').trim();
      items.push(breadcrumbItem('Tra', ROUTES.lookup, !query));
      if (query) items.push(breadcrumbItem(query, '', true));
      return items;
    }

    if (path.includes('/modules/bo-thu-50/')) {
      items.push(breadcrumbItem('Menu', '#menu'));
      items.push(breadcrumbItem('Tham khảo', '#menu'));
      items.push(breadcrumbItem('Bộ thủ 50', '', true));
      return items;
    }

    if (isDialogue301) {
      const lessonNumber = getDialogue301LessonNumber(params.get('lesson') || '');
      items.push(breadcrumbItem('Học', ROUTES.learn));
      items.push(breadcrumbItem('Giáo trình', ROUTES.curriculum));
      items.push(breadcrumbItem('301', ROUTES.dialogue301Curriculum, !lessonNumber));
      if (lessonNumber) items.push(breadcrumbItem(`Bài ${lessonNumber}`, '', true));
      return items;
    }

    items.push(breadcrumbItem('Học', ROUTES.learn, study === 'hub' && !path.includes('/modules/pinyin/') && !path.includes('/modules/listening/') && !path.includes('/modules/ldsn14/') && !path.includes('/modules/new-hsk-course/')));
    if (path.includes('/modules/new-hsk-course/')) {
      const level = params.get('level') || '';
      const lessonNumber = params.get('lesson') || '';
      items.push(breadcrumbItem('Giáo trình', ROUTES.curriculum));
      items.push(breadcrumbItem('New HSK 3.0', ROUTES.newHskCourse, !level && !lessonNumber));
      if (level) items.push(breadcrumbItem(`HSK ${level}`, `${ROUTES.newHskCourse}?level=${encodeURIComponent(level)}`, !lessonNumber));
      if (lessonNumber) items.push(breadcrumbItem(`Bài ${lessonNumber}`, '', true));
      return items;
    }
    if (path.includes('/modules/ldsn14/')) {
      const lessonNumber = params.get('lesson') || '';
      items.push(breadcrumbItem('LDSN1-4', ROUTES.ldsn14, !lessonNumber));
      if (lessonNumber) items.push(breadcrumbItem(`Bài ${lessonNumber}`, '', true));
      return items;
    }
    if (path.includes('/modules/listening/')) {
      items.push(breadcrumbItem('Nghe', '', true));
      return items;
    }
    if (path.includes('/modules/pinyin/')) {
      items.push(breadcrumbItem('Pinyin', '', true));
      return items;
    }
    if (study === 'hsk') {
      const sourceKey = params.get('curriculum') || getStoredCurriculum();
      const sourceLabel = getCurriculumLabel(sourceKey);
      const level = params.get('level') || '';
      items.push(breadcrumbItem('Giáo trình', ROUTES.curriculum, !sourceLabel));
      if (sourceLabel) {
        items.push(breadcrumbItem(sourceLabel, curriculumUrl(sourceKey), !level));
        if (level && sourceKey !== 'dialogue301') {
          const levelLabel = sourceKey === 'boya' ? `Quyển ${level}` : sourceKey === 'yct' ? `YCT ${level}` : sourceKey === 'new_hsk' && Number(level) === 7 ? 'HSK 7–9' : `HSK ${level}`;
          items.push(breadcrumbItem(levelLabel, '', true));
        }
      }
      return items;
    }

    const leaf = ({
      radical: 'Bộ thủ',
      radicals: 'Bộ thủ',
      flashcards: 'Thẻ',
      writing: 'Bút thuận'
    })[study];
    if (leaf) items.push(breadcrumbItem(leaf, '', true));
    return items;
  }

  function normalizeBreadcrumbItems(items) {
    return (Array.isArray(items) ? items : [])
      .map(item => breadcrumbItem(item?.label, item?.href, item?.current))
      .filter(item => item.label);
  }

  function renderHeaderBreadcrumb(options = {}) {
    const nav = document.querySelector('[data-ui-header-breadcrumb]');
    if (!nav) return;
    if (options.clearCustom) state.customBreadcrumbItems = null;
    const context = resolveContext();
    const items = state.customBreadcrumbItems || createDefaultBreadcrumbItems(context);
    if (context === 'home' || !items.length) {
      nav.hidden = true;
      nav.innerHTML = '';
      return;
    }
    nav.hidden = false;
    nav.innerHTML = items.map((item, index) => {
      const separator = index ? '<span class="ui-header-breadcrumb__separator" aria-hidden="true">→</span>' : '';
      const label = escapeHtml(item.label);
      if (item.current || !item.href) return `${separator}<strong title="${label}" aria-current="page">${label}</strong>`;
      return `${separator}<a href="${escapeHtml(item.href)}" title="${label}">${label}</a>`;
    }).join('');
    nav.querySelectorAll('a[href="#menu"]').forEach(link => link.addEventListener('click', event => {
      event.preventDefault();
      openDrawer();
    }));
    window.requestAnimationFrame(() => {
      nav.scrollLeft = nav.scrollWidth;
    });
  }

  function refreshHierarchyBreadcrumb() {
    renderHeaderBreadcrumb({ clearCustom: true });
  }

  function setHeaderBreadcrumb(items) {
    state.customBreadcrumbItems = normalizeBreadcrumbItems(items);
    renderHeaderBreadcrumb();
  }

  function installPageContainer() {
    const target = document.querySelector('[data-ui-shell-main]') || document.querySelector('main');
    if (!target) return;
    target.classList.add('ui-shell-main');
    target.setAttribute('data-ui-shell-main', '');
    target.querySelectorAll(':scope > .ui-hierarchy-breadcrumb').forEach(node => node.remove());
  }

  function hideLegacyChrome() {
    document.querySelectorAll('.tt-shell-bottom-nav, .tt-shell-menu-trigger, .tt-shell-drawer, .tt-shell-backdrop').forEach(node => node.remove());
    document.querySelectorAll('.app-header, .bottom-nav, .mobile-bottom-nav, .tt-module-top-nav').forEach(node => {
      if (!node.closest('[data-ui-app-shell]')) node.classList.add('ui-shell-legacy-chrome');
    });
  }

  function syncBottomNavigationForDrawer(open) {
    const items = document.querySelectorAll('.ui-bottom-nav__item');
    items.forEach(item => {
      const active = open ? item.matches('[data-ui-menu-open]') : item.hasAttribute('data-ui-context-active');
      item.classList.toggle('is-active', active);
    });
  }

  function openDrawer() {
    const drawer = document.getElementById('uiGlobalDrawer');
    const backdrop = document.querySelector('[data-ui-drawer-backdrop]');
    if (!drawer || !backdrop || state.drawerOpen) return;
    state.lastFocused = document.activeElement;
    state.drawerOpen = true;
    document.body.classList.add('ui-shell-lock', 'ui-drawer-open');
    syncBottomNavigationForDrawer(true);
    drawer.classList.add('is-open');
    backdrop.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    document.querySelectorAll('[data-ui-menu-open]').forEach(button => button.setAttribute('aria-expanded', 'true'));
    window.requestAnimationFrame(() => {
      const first = drawer.querySelector('[data-ui-menu-close], a, button, select');
      if (first) first.focus({ preventScroll: true });
    });
  }

  function closeDrawer() {
    const drawer = document.getElementById('uiGlobalDrawer');
    const backdrop = document.querySelector('[data-ui-drawer-backdrop]');
    if (!drawer || !backdrop || !state.drawerOpen) return;
    state.drawerOpen = false;
    document.body.classList.remove('ui-shell-lock', 'ui-drawer-open');
    syncBottomNavigationForDrawer(false);
    drawer.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    document.querySelectorAll('[data-ui-menu-open]').forEach(button => button.setAttribute('aria-expanded', 'false'));
    if (state.lastFocused && typeof state.lastFocused.focus === 'function') state.lastFocused.focus({ preventScroll: true });
  }

  function trapFocus(event) {
    if (!state.drawerOpen || event.key !== 'Tab') return;
    const drawer = document.getElementById('uiGlobalDrawer');
    const focusable = Array.from(drawer.querySelectorAll('a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function bindEvents(drawer) {
    document.addEventListener('click', event => {
      if (event.target.closest('[data-ui-menu-open]')) { event.preventDefault(); openDrawer(); return; }
      if (event.target.closest('[data-ui-menu-close]') || event.target.matches('[data-ui-drawer-backdrop]')) { event.preventDefault(); closeDrawer(); return; }
      if (event.target.closest('[data-ui-theme-toggle]')) {
        state.settings.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        saveSettings(); applySettings(); syncSettings(drawer); return;
      }
      if (event.target.closest('[data-ui-settings-reset]')) {
        state.settings = { theme: 'system', fontScale: 'default' };
        saveSettings(); applySettings(); syncSettings(drawer);
      }
    });

    drawer.addEventListener('change', event => {
      const control = event.target.closest('[data-ui-setting]');
      if (!control) return;
      state.settings[control.dataset.uiSetting] = control.value;
      saveSettings(); applySettings();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && state.drawerOpen) closeDrawer();
      trapFocus(event);
    });

    window.addEventListener('tiengtrung:navigationchange', refreshHierarchyBreadcrumb);
    window.addEventListener('tiengtrung:navigationchange', recordCurrentLearningLocation);
    window.addEventListener('tiengtrung:breadcrumbchange', event => {
      const items = event.detail?.items || [];
      setHeaderBreadcrumb(items);
      recordCurrentLearningLocation({ items });
    });
    window.addEventListener('popstate', () => {
      refreshHierarchyBreadcrumb();
      recordCurrentLearningLocation();
    });
    window.addEventListener('hashchange', () => {
      refreshHierarchyBreadcrumb();
      recordCurrentLearningLocation();
    });
  }

  function syncSettings(drawer) {
    drawer.querySelectorAll('[data-ui-setting]').forEach(control => {
      if (state.settings[control.dataset.uiSetting] != null) control.value = state.settings[control.dataset.uiSetting];
    });
  }

  function applyStudyQuery() {
    if (!window.location.pathname.toLowerCase().includes('/modules/hanzi-stroke/')) return;
    const study = new URLSearchParams(window.location.search).get('study') || 'hub';
    const ids = {
      hub: 'studyTabHub',
      writing: 'studyTabLookup',
      hsk: 'studyTabHsk',
      radical: 'studyTabRadicals',
      radicals: 'studyTabRadicals',
      flashcards: 'studyTabFlashcards'
    };
    if (!ids[study]) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      const button = document.getElementById(ids[study]);
      if (button) { window.clearInterval(timer); button.click(); }
      else if (tries >= 70) window.clearInterval(timer);
    }, 100);
  }

  function mount() {
    if (!document.body || document.querySelector('[data-ui-app-shell]')) return;
    const context = resolveContext();
    document.body.classList.remove('is-dim');
    applySettings();
    hideLegacyChrome();
    installPageContainer();

    const shell = document.createElement('div');
    shell.dataset.uiAppShell = '';
    shell.className = 'ui-app-shell';
    const header = createHeader(context);
    const { backdrop, drawer } = createDrawer(context);
    const bottom = createBottomNavigation(context);
    shell.append(header, backdrop, drawer, bottom);
    document.body.prepend(shell);
    renderHeaderBreadcrumb();

    syncSettings(drawer);
    bindEvents(drawer);
    applyStudyQuery();
    if (typeof window.setTimeout === 'function') window.setTimeout(() => recordCurrentLearningLocation(), 0);
    else recordCurrentLearningLocation();
  }

  window.TiengTrungLearningHistory = Object.freeze({
    read: readLearningHistory,
    record: recordLearningItem,
    recordCurrent: recordCurrentLearningLocation,
    clear: clearLearningHistory,
    eventName: LEARNING_HISTORY_EVENT,
    key: LEARNING_HISTORY_KEY
  });
  window.TiengTrungAppShell = Object.freeze({ mount, openDrawer, closeDrawer, refreshHierarchyBreadcrumb, setBreadcrumb: setHeaderBreadcrumb, routes: ROUTES });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();

const $ = s => document.querySelector(s);

let audioManifest = {};
let radicalAudio = [];
let currentTone = '1';
let currentAudio = null;
let currentPage = 'home';
let dialogue301BasePath = '';
let dialogue301Lessons = [];
let dialogue301SelectedId = '';
let dialogue301Filter = 'all';
let dialogue301LessonSheetOpen = false;
let dialogue301LessonSearch = '';
let dialogue301CurrentData = null;
let dialogue301CurrentLesson = null;
let dialogue301ExpandedSections = new Set();
let dialogue301OverviewExpandedSections = new Set();
const DIALOGUE301_LESSON_CHIP_LIMIT = 8;
const DIALOGUE301_OVERVIEW_LIMITS = { vocabulary: 8, sentences: 3, dialogue: 3 };
const DIALOGUE301_SECONDARY_SECTIONS = new Set(['notes', 'grammar', 'extension', 'practice']);

const pageTitle = $('#pageTitle');
const pageSubtitle = $('#pageSubtitle');
const pageContent = $('#pageContent');
const homePageContent = pageContent ? pageContent.innerHTML : '';

const DIALOGUE301_BASE_CANDIDATES = (() => {
  const path = window.location.pathname.replace(/\/+$/g, '');
  return path.endsWith('/tieng-trung-web') || path.includes('/tieng-trung-web/')
    ? ['../lessons-301-v2', 'lessons-301-v2']
    : ['lessons-301-v2', '../lessons-301-v2'];
})();
const DIALOGUE301_SECTIONS = [
  ['vocabulary', 'Từ vựng'],
  ['sentences', 'Câu mẫu'],
  ['dialogue', 'Hội thoại'],
  ['notes', 'Chú thích'],
  ['grammar', 'Ngữ pháp / Ngữ âm'],
  ['extension', 'Thay thế và mở rộng'],
  ['practice', 'Luyện tập']
];
const DIALOGUE301_FILTERS = [
  ['all', 'Tất cả'],
  ['vocabulary', 'Từ vựng'],
  ['sentences', 'Câu mẫu'],
  ['dialogue', 'Hội thoại'],
  ['notes', 'Chú thích'],
  ['extension', 'Mở rộng'],
  ['grammar', 'Ngữ pháp'],
  ['practice', 'Luyện tập']
];

function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#039;'
  }[ch]));
}


function normalizeDialogue301Title(title){
  return String(title || '')
    .replace(/^\s*\d+\s*/, '')
    .replace(/[＿_]+/g, ' · ')
    .replace(/\s*[-—–]\s*/g, ' · ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getDialogue301ShortTitle(data, lesson){
  const zh = String(data?.title_zh || lesson?.title_zh || '').trim();
  if(zh) return zh;
  const raw = data?.title || lesson?.title || '301 Đàm thoại';
  const normalized = normalizeDialogue301Title(raw) || raw;
  const parts = String(normalized).split('·').map(part => part.trim()).filter(Boolean);
  return parts[parts.length - 1] || normalized;
}

function getDialogue301FullLessonTitle(data, lesson){
  const zh = String(data?.title_zh || lesson?.title_zh || '').trim();
  const vi = String(data?.title_vi || lesson?.title_vi || '').trim();
  if(zh && vi) return `${zh} · ${vi}`;
  if(zh) return zh;
  const raw = data?.title || lesson?.title || '';
  return normalizeDialogue301Title(raw) || raw;
}

function getDialogue301LessonTitleLine(lesson){
  const zh = String(lesson?.title_zh || '').trim();
  const vi = String(lesson?.title_vi || '').trim();
  if(zh && vi) return `${zh} · ${vi}`;
  if(zh) return zh;
  return normalizeDialogue301Title(lesson?.title) || lesson?.title || '';
}

function getDialogue301StructuredItems(data, key){
  if(Array.isArray(data?.[key]) && data[key].length){
    return data[key];
  }
  const sectionItems = data?.sections?.[key];
  return Array.isArray(sectionItems) ? sectionItems : [];
}

function hasDialogue301StructuredItems(data, key){
  return Array.isArray(data?.[key]) && data[key].length > 0;
}

function getDialogue301MediaItems(data, key){
  if(Array.isArray(data?.[key]) && data[key].length) return data[key];
  if(Array.isArray(data?.media?.[key]) && data.media[key].length) return data.media[key];
  return [];
}

function getDialogue301MediaBasePath(data, key){
  return dialogue301BasePath || 'lessons-301-v2';
}

async function enrichDialogue301WithLegacyMedia(data, lesson){
  return data;
}

function buildDialogue301RenderSections(data){
  const sections = {};
  DIALOGUE301_SECTIONS.forEach(([key]) => {
    sections[key] = getDialogue301StructuredItems(data, key);
  });
  return sections;
}

function getDialogue301LessonSearchResults(lessons){
  const query = dialogue301LessonSearch.trim().toLowerCase();

  if(!query){
    return [];
  }

  return lessons.filter(lesson => {
    const haystack = [
      `bài ${lesson.lesson_no || ''}`,
      lesson.lesson_no || '',
      lesson.title || '',
      getDialogue301LessonTitleLine(lesson)
    ].join(' ').toLowerCase();

    return haystack.includes(query);
  });
}

function findColumnIndex(header, patterns){
  return header.findIndex(cell => {
    const text = String(cell || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return patterns.some(pattern => text.includes(pattern));
  });
}

function setPage(page){
  currentPage = page;
  document.body.classList.toggle('is-dialogue301', page === 'dialogue301');
  if(page === 'dialogue301' && location.hash !== '#dialogue301'){
    history.replaceState(null, '', '#dialogue301');
  }else if(page !== 'dialogue301' && location.hash === '#dialogue301'){
    history.replaceState(null, '', location.pathname + location.search);
  }

  // Các module riêng mở full page trong cùng tab.
  if(page === 'radicals'){
    window.location.href = 'modules/bo-thu-50/index.html';
    return;
  }

  if(page === 'pinyin'){
    window.location.href = 'modules/pinyin/index.html';
    return;
  }

  if(page === 'hanziStroke'){
    window.location.href = 'modules/hanzi-stroke/index.html?study=writing';
    return;
  }
  updateNavActive(page);

  if(page === 'home') renderHome();
  if(page === 'radicals') renderRadicals();

  if(page === 'dialogue301') renderDialogue301();
}

function formatHomeResumeTime(value){
  const timestamp = Date.parse(value || '');
  if(!Number.isFinite(timestamp)) return 'Gần đây';
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60000);
  if(minutes < 1) return 'Vừa mở';
  if(minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if(hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Hôm qua' : `${days} ngày trước`;
}

function renderHomeResume(){
  const host = document.getElementById('homeResumeContent');
  if(!host) return;
  const historyApi = window.TiengTrungLearningHistory;
  const item = historyApi?.read?.()?.[0];
  if(!item){
    host.className = 'home-resume-empty';
    host.setAttribute('role', 'status');
    host.innerHTML = `
      <span class="home-resume-empty__icon" aria-hidden="true">↻</span>
      <span><strong>Chưa có nội dung gần đây</strong><small>Mở một bài học hoặc công cụ để bắt đầu.</small></span>`;
    return;
  }
  host.className = 'home-resume-card';
  host.removeAttribute('role');
  const url = new URL(item.url, window.location.origin);
  host.innerHTML = `
    <a class="home-resume-card__link" href="${escapeHtml(`${url.pathname}${url.search}${url.hash}`)}">
      <span class="home-resume-card__icon" aria-hidden="true">${escapeHtml(item.icon || '学')}</span>
      <span class="home-resume-card__copy">
        <small>${escapeHtml(item.subtitle || 'Nội dung học gần đây')}</small>
        <strong>${escapeHtml(item.title || 'Học tiếp')}</strong>
        <em>${escapeHtml(formatHomeResumeTime(item.updatedAt))}</em>
      </span>
      <span class="home-resume-card__action">Tiếp tục <b aria-hidden="true">›</b></span>
    </a>`;
}

function renderHome(){
  pageTitle.textContent = 'Tiếng Trung';
  pageSubtitle.textContent = 'Tra nhanh · Học theo giáo trình · Ôn tập chủ động';
  pageContent.innerHTML = homePageContent;
  updateNavActive('home');
  bindHomeLookup();
  window.setTimeout(renderHomeResume, 0);
}

function renderRadicals(){
  // Bộ thủ mở bằng full page cùng tab, không nhúng iframe để tránh nested sidebar.
  window.location.href = 'modules/bo-thu-50/index.html';
}

function joinUrlPath(...parts){
  return parts
    .filter(part => part !== undefined && part !== null && String(part).trim() !== '')
    .map((part, index) => {
      const value = String(part).replace(/\\/g, '/');
      return index === 0 ? value.replace(/\/+$/g, '') : value.replace(/^\/+|\/+$/g, '');
    })
    .join('/');
}

async function fetchJson(url){
  const res = await fetch(url);
  if(!res.ok){
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function loadDialogue301Lessons(){
  if(dialogue301Lessons.length){
    return dialogue301Lessons;
  }

  const errors = [];

  for(const basePath of DIALOGUE301_BASE_CANDIDATES){
    const url = joinUrlPath(basePath, 'lessons.json');

    try{
      const data = await fetchJson(url);
      const lessons = Array.isArray(data) ? data : (data.lessons || []);

      if(!lessons.length){
        throw new Error('Danh sách bài trống.');
      }

      dialogue301BasePath = basePath;
      dialogue301Lessons = lessons;
      return dialogue301Lessons;
    }catch(err){
      errors.push(`${url}: ${err.message}`);
    }
  }

  throw new Error(`Không tải được lessons-301-v2/lessons.json. ${errors.join(' | ')}`);
}

async function renderDialogue301(){
  pageTitle.textContent = '301 Đàm thoại';
  pageSubtitle.textContent = 'Từ vựng · Câu mẫu · Hội thoại · Chú thích';
  pageContent.innerHTML = `
    <div class="card">
      <h3>Đang tải danh sách bài...</h3>
      <p class="status">Đang đọc dữ liệu từ lessons-301-v2/lessons.json.</p>
    </div>
  `;

  try{
    const lessons = await loadDialogue301Lessons();
    if(currentPage !== 'dialogue301') return;

    pageContent.innerHTML = `
      <section class="dialogue301-shell">
        <label class="dialogue301-search search-entry" aria-label="Tìm bài học">
          <span aria-hidden="true">⌕</span>
          <input data-dialogue301-main-search type="search" placeholder="Tìm bài học..." autocomplete="off" />
        </label>
        <div class="dialogue301-view">
          <section class="dialogue301-lesson-panel">
            <div class="dialogue301-panel-head">
              <div class="eyebrow">301 Đàm thoại</div>
              <button class="dialogue301-all-lessons-btn" type="button" data-action="open-lesson-sheet">Tất cả bài ›</button>
            </div>
            <div class="dialogue301-lessons dialogue301-lesson-chips" id="dialogue301LessonList"></div>
            <div id="dialogue301LessonSheetRoot"></div>
          </section>
          <div class="dialogue301-content" id="dialogue301LessonContent"></div>
        </div>
      </section>
    `;

    renderDialogue301LessonList(lessons);
    const requestedLessonId = new URLSearchParams(window.location.search).get('lesson') || '';
    const initialLesson = lessons.find(item => item.lesson_id === requestedLessonId) || lessons[0];
    await openDialogue301Lesson(initialLesson, { replaceRoute: true });
  }catch(err){
    console.error(err);
    pageContent.innerHTML = `
      <div class="card">
        <h3>Lỗi tải 301 Đàm thoại</h3>
        <p>${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

function renderDialogue301LessonList(lessons){
  const listEl = $('#dialogue301LessonList');
  if(!listEl) return;

  const searchResults = getDialogue301LessonSearchResults(lessons);
  const isSearching = dialogue301LessonSearch.trim().length > 0;

  if(isSearching){
    listEl.classList.remove('dialogue301-lesson-chips');
    listEl.classList.add('dialogue301-search-results');
    listEl.innerHTML = `
      <div class="dialogue301-search-result-head">
        <strong>Kết quả tìm kiếm</strong>
        <span>${searchResults.length}/${lessons.length} bài</span>
      </div>
      ${searchResults.length ? searchResults.map(lesson => `
        <button class="dialogue301-search-result-item ${lesson.lesson_id === dialogue301SelectedId ? 'active' : ''}" type="button" data-lesson-id="${escapeHtml(lesson.lesson_id)}">
          <span>Bài ${escapeHtml(lesson.lesson_no)}</span>
          <strong>${escapeHtml(getDialogue301LessonTitleLine(lesson))}</strong>
        </button>
      `).join('') : '<p class="dialogue301-search-empty">Không tìm thấy bài phù hợp.</p>'}
    `;
  }else{
    listEl.classList.add('dialogue301-lesson-chips');
    listEl.classList.remove('dialogue301-search-results');
    const firstLessons = lessons.slice(0, DIALOGUE301_LESSON_CHIP_LIMIT);
    const selectedLesson = lessons.find(item => item.lesson_id === dialogue301SelectedId);
    const chipLessons = selectedLesson && !firstLessons.some(item => item.lesson_id === selectedLesson.lesson_id)
      ? [selectedLesson, ...firstLessons]
      : firstLessons;

    listEl.innerHTML = chipLessons.map(lesson => `
      <button class="dialogue301-lesson-chip" type="button" data-lesson-id="${escapeHtml(lesson.lesson_id)}" title="${escapeHtml(getDialogue301LessonTitleLine(lesson))}">
        Bài ${escapeHtml(lesson.lesson_no)}
      </button>
    `).join('');
  }

  listEl.querySelectorAll('[data-lesson-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const lesson = lessons.find(item => item.lesson_id === btn.dataset.lessonId);
      if(lesson){
        dialogue301LessonSearch = '';
        openDialogue301Lesson(lesson);
        renderDialogue301LessonList(lessons);
      }
    });
  });

  document.querySelectorAll('[data-action="open-lesson-sheet"]').forEach(btn => {
    btn.onclick = () => {
      dialogue301LessonSheetOpen = true;
      renderDialogue301LessonList(lessons);
    };
  });

  const mainSearch = document.querySelector('[data-dialogue301-main-search]');
  if(mainSearch){
    mainSearch.value = dialogue301LessonSearch;
    mainSearch.oninput = () => {
      dialogue301LessonSearch = mainSearch.value;
      dialogue301LessonSheetOpen = false;
      renderDialogue301LessonList(lessons);
      setTimeout(() => {
        const nextInput = document.querySelector('[data-dialogue301-main-search]');
        if(nextInput){
          nextInput.focus();
          const length = nextInput.value.length;
          nextInput.setSelectionRange(length, length);
        }
      }, 0);
    };
  }

  renderDialogue301LessonSheet(lessons);
  updateDialogue301ActiveLesson();
}

function renderDialogue301LessonSheet(lessons){
  const root = $('#dialogue301LessonSheetRoot');
  if(!root) return;

  if(!dialogue301LessonSheetOpen){
    root.innerHTML = '';
    return;
  }

  const query = dialogue301LessonSearch.trim().toLowerCase();
  const filteredLessons = lessons.filter(lesson => {
    if(!query) return true;
    const haystack = [
      `bài ${lesson.lesson_no || ''}`,
      lesson.lesson_no || '',
      lesson.title || '',
      getDialogue301LessonTitleLine(lesson)
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  });

  root.innerHTML = `
    <div class="lesson-sheet-overlay" data-action="close-lesson-sheet"></div>
    <section class="lesson-sheet" role="dialog" aria-modal="true" aria-label="Chọn bài học">
      <div class="lesson-sheet-head">
        <div>
          <h3>Chọn bài học</h3>
          <p>${filteredLessons.length}/${lessons.length} bài</p>
        </div>
        <button class="lesson-sheet-close" type="button" data-action="close-lesson-sheet" aria-label="Đóng">×</button>
      </div>
      <label class="lesson-sheet-search">
        <span aria-hidden="true">⌕</span>
        <input data-dialogue301-lesson-search type="search" placeholder="Tìm bài học..." value="${escapeHtml(dialogue301LessonSearch)}" />
      </label>
      <div class="lesson-sheet-list">
        ${filteredLessons.length ? filteredLessons.map(lesson => `
          <button class="lesson-sheet-item ${lesson.lesson_id === dialogue301SelectedId ? 'active' : ''}" type="button" data-sheet-lesson-id="${escapeHtml(lesson.lesson_id)}">
            <span>Bài ${escapeHtml(lesson.lesson_no)}</span>
            <strong>${escapeHtml(getDialogue301LessonTitleLine(lesson))}</strong>
          </button>
        `).join('') : '<p class="lesson-sheet-empty">Không tìm thấy bài phù hợp.</p>'}
      </div>
    </section>
  `;

  root.querySelectorAll('[data-action="close-lesson-sheet"]').forEach(btn => {
    btn.addEventListener('click', () => {
      dialogue301LessonSheetOpen = false;
      dialogue301LessonSearch = '';
      renderDialogue301LessonList(lessons);
    });
  });

  root.querySelectorAll('[data-sheet-lesson-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const lesson = lessons.find(item => item.lesson_id === btn.dataset.sheetLessonId);
      if(lesson){
        dialogue301LessonSheetOpen = false;
        dialogue301LessonSearch = '';
        openDialogue301Lesson(lesson);
        renderDialogue301LessonList(lessons);
      }
    });
  });

  const input = root.querySelector('[data-dialogue301-lesson-search]');
  if(input){
    input.addEventListener('input', () => {
      dialogue301LessonSearch = input.value;
      renderDialogue301LessonList(lessons);
      setTimeout(() => {
        const nextInput = document.querySelector('[data-dialogue301-lesson-search]');
        if(nextInput){
          nextInput.focus();
          const length = nextInput.value.length;
          nextInput.setSelectionRange(length, length);
        }
      }, 0);
    });
    setTimeout(() => input.focus(), 0);
  }
}

function updateDialogue301ActiveLesson(){
  document.querySelectorAll('.dialogue301-lesson-chip, .dialogue301-lesson-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lessonId === dialogue301SelectedId);
  });
  scrollDialogue301ActiveChipIntoView('.dialogue301-lesson-chip.active');
}

function updateDialogue301LessonRoute(lesson, options = {}){
  const lessonId = String(lesson?.lesson_id || '').trim();
  if(!lessonId || options.skipRoute) return;

  const url = new URL(window.location.href);
  url.searchParams.set('lesson', lessonId);
  url.hash = 'dialogue301';
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if(nextUrl !== currentUrl){
    const method = options.replaceRoute ? 'replaceState' : 'pushState';
    window.history[method]({ dialogue301LessonId: lessonId }, '', nextUrl);
  }

  window.dispatchEvent(new CustomEvent('tiengtrung:navigationchange', {
    detail: { page: 'dialogue301', lessonId }
  }));
}

async function openDialogue301Lesson(lesson, options = {}){
  if(!lesson) return;

  updateDialogue301LessonRoute(lesson, options);
  dialogue301SelectedId = lesson.lesson_id;
  dialogue301Filter = 'all';
  dialogue301ExpandedSections = new Set();
  dialogue301OverviewExpandedSections = new Set();
  updateDialogue301ActiveLesson();
  if(dialogue301Lessons.length){
    renderDialogue301LessonList(dialogue301Lessons);
  }

  const contentEl = $('#dialogue301LessonContent');
  if(!contentEl) return;

  contentEl.innerHTML = `
    <div class="card">
      <h3>Đang tải ${escapeHtml(lesson.title)}...</h3>
      <p class="status">Đọc ${escapeHtml(lesson.data || `${lesson.lesson_id}/data.json`)}.</p>
    </div>
  `;

  try{
    const dataUrl = joinUrlPath(dialogue301BasePath, lesson.data || `${lesson.lesson_id}/data.json`);
    let data = await fetchJson(dataUrl);
    data = await enrichDialogue301WithLegacyMedia(data, lesson);
    if(currentPage !== 'dialogue301') return;

    dialogue301SelectedId = data.lesson_id || lesson.lesson_id;
    dialogue301CurrentData = data;
    dialogue301CurrentLesson = lesson;
    updateDialogue301ActiveLesson();
    contentEl.innerHTML = renderDialogue301Lesson(data, lesson);
    bindDialogue301LessonUI();
  }catch(err){
    console.error(err);
    contentEl.innerHTML = `
      <div class="card">
        <h3>Lỗi tải bài</h3>
        <p>${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

function getDialogue301LessonDir(data, lesson){
  if(data?.lesson_id) return data.lesson_id;
  if(lesson?.lesson_id) return lesson.lesson_id;

  const dataPath = lesson?.data || '';
  return dataPath.split('/')[0] || '';
}

function renderDialogue301Lesson(data, lesson){
  const shortTitle = getDialogue301ShortTitle(data, lesson);
  const fullTitle = getDialogue301FullLessonTitle(data, lesson);
  const lessonNo = data.lesson_no || lesson?.lesson_no || '';
  const sections = buildDialogue301RenderSections(data);
  const sectionEntries = DIALOGUE301_SECTIONS
    .map(([key, label]) => ({
      key,
      label,
      html: renderDialogue301Section(key, label, sections[key])
    }))
    .filter(entry => entry.html);

  const availableFilters = new Set(['all', ...sectionEntries.map(entry => entry.key)]);

  if(!availableFilters.has(dialogue301Filter)){
    dialogue301Filter = 'all';
  }

  const filterHtml = DIALOGUE301_FILTERS
    .filter(([key]) => availableFilters.has(key))
    .map(([key, label]) => `
      <button class="dialogue301-filter-btn ${dialogue301Filter === key ? 'active' : ''}" type="button" data-filter="${escapeHtml(key)}">
        ${escapeHtml(label)}
      </button>
    `).join('');

  return `
    <article class="dialogue301-lesson-head">
      <div>
        <div class="eyebrow">Bài ${escapeHtml(lessonNo)}</div>
        <h3>Bài ${escapeHtml(lessonNo)} · ${escapeHtml(shortTitle)}</h3>
        ${fullTitle && fullTitle !== shortTitle ? `<p>${escapeHtml(fullTitle)}</p>` : ''}
      </div>
    </article>
    <div class="dialogue301-filter-tabs" aria-label="Lọc nội dung bài">
      ${filterHtml}
    </div>
    ${sectionEntries.length ? sectionEntries.map(entry => entry.html).join('') : '<div class="card"><p>Chưa có nội dung chữ cho bài này.</p></div>'}
  `;
}

function renderDialogue301Section(key, label, items){
  if(!Array.isArray(items) || !items.length){
    return '';
  }

  const displayLabel = key === 'grammar' ? 'Ngữ pháp / Ngữ âm' : label;
  const isOverview = dialogue301Filter === 'all';
  const isSecondary = DIALOGUE301_SECONDARY_SECTIONS.has(key);
  const isExpanded = dialogue301ExpandedSections.has(key);
  const limit = isOverview ? DIALOGUE301_OVERVIEW_LIMITS[key] : 0;
  let blocks = '';
  let hiddenCount = 0;

  if(key === 'vocabulary'){
    const rows = normalizeDialogue301VocabRows(items);
    hiddenCount = limit && rows.length > limit ? rows.length - limit : 0;
    blocks = renderDialogue301VocabRows(limit ? rows.slice(0, limit) : rows);
  }else if(key === 'sentences'){
    const rows = normalizeDialogue301SentenceRows(items);
    hiddenCount = limit && rows.length > limit ? rows.length - limit : 0;
    blocks = rows.length
      ? renderDialogue301SentenceRows(limit ? rows.slice(0, limit) : rows)
      : renderDialogue301TextBlocks(items, key, limit ? 1 : 0);
  }else if(key === 'dialogue'){
    const rows = normalizeDialogue301DialogueRows(items);
    hiddenCount = limit && rows.length > limit ? rows.length - limit : 0;
    blocks = rows.length
      ? renderDialogue301DialogueRows(limit ? rows.slice(0, limit) : rows)
      : renderDialogue301TextBlocks(items, key, limit ? 1 : 0);
  }else if(key === 'extension'){
    const rows = normalizeDialogue301SentenceRows(items);
    blocks = rows.length ? renderDialogue301ExtensionRows(rows) : renderDialogue301TextBlocks(items, key, 0);
  }else if(key === 'notes'){
    blocks = renderDialogue301NoteCards(items) || renderDialogue301TextBlocks(items, key, 0);
  }else if(key === 'grammar'){
    blocks = renderDialogue301StudyCards(items, key) || renderDialogue301TextBlocks(items, key, 0);
  }else if(key === 'practice'){
    blocks = renderDialogue301StudyCards(items, key) || renderDialogue301TextBlocks(items, key, 0);
  }else{
    blocks = renderDialogue301TextBlocks(items, key, 0);
  }

  if(!blocks){
    return '';
  }

  if(isOverview && isSecondary){
    const summary = getDialogue301SectionSummary(key, items);
    return `
      <section class="card dialogue301-section dialogue301-accordion-section dialogue301-section-${escapeHtml(key)} ${isExpanded ? 'is-open' : ''}" data-section="${escapeHtml(key)}">
        <button class="dialogue301-accordion-head" type="button" data-action="toggle-dialogue301-section" data-section-key="${escapeHtml(key)}" aria-expanded="${isExpanded ? 'true' : 'false'}">
          <span>
            <strong>${escapeHtml(displayLabel)}</strong>
            <small>${escapeHtml(summary)}</small>
          </span>
          <em>${isExpanded ? 'Thu gọn' : 'Mở'} ›</em>
        </button>
        <div class="dialogue301-blocks dialogue301-accordion-body" data-secondary-body="${escapeHtml(key)}" ${isExpanded ? '' : 'hidden'}>${blocks}</div>
      </section>
    `;
  }

  const canOverviewExpand = isOverview && ['vocabulary', 'sentences', 'dialogue'].includes(key);
  const isOverviewExpanded = canOverviewExpand && dialogue301OverviewExpandedSections.has(key);
  if(canOverviewExpand && isOverviewExpanded){
    if(key === 'vocabulary'){
      const rows = normalizeDialogue301VocabRows(items);
      blocks = renderDialogue301VocabRows(rows);
      hiddenCount = 0;
    }else if(key === 'sentences'){
      const rows = normalizeDialogue301SentenceRows(items);
      blocks = rows.length ? renderDialogue301SentenceRows(rows) : renderDialogue301TextBlocks(items, key, 0);
      hiddenCount = 0;
    }else if(key === 'dialogue'){
      const rows = normalizeDialogue301DialogueRows(items);
      blocks = rows.length ? renderDialogue301DialogueRows(rows) : renderDialogue301TextBlocks(items, key, 0);
      hiddenCount = 0;
    }
  }

  const actionHtml = canOverviewExpand && hiddenCount > 0
    ? `<button class="dialogue301-section-action" type="button" data-action="expand-dialogue301-overview" data-section-key="${escapeHtml(key)}">Xem tất cả ›</button>`
    : canOverviewExpand && isOverviewExpanded
      ? `<button class="dialogue301-section-action" type="button" data-action="collapse-dialogue301-overview" data-section-key="${escapeHtml(key)}">Thu gọn ›</button>`
      : '';
  const moreHtml = hiddenCount > 0
    ? `<button class="dialogue301-inline-more" type="button" data-action="expand-dialogue301-overview" data-section-key="${escapeHtml(key)}">+ Xem thêm ${escapeHtml(hiddenCount)} ${key === 'vocabulary' ? 'từ' : 'dòng'}</button>`
    : canOverviewExpand && isOverviewExpanded
      ? `<button class="dialogue301-inline-more" type="button" data-action="collapse-dialogue301-overview" data-section-key="${escapeHtml(key)}">Thu gọn</button>`
      : '';

  return `
    <section class="card dialogue301-section dialogue301-section-${escapeHtml(key)}" data-section="${escapeHtml(key)}">
      <div class="dialogue301-section-title">
        <h3>${escapeHtml(displayLabel)}</h3>
        ${actionHtml}
      </div>
      <div class="dialogue301-blocks">
        ${blocks}
        ${moreHtml}
      </div>
    </section>
  `;
}

function renderDialogue301TextBlocks(items, sectionKey, limit){
  const selectedItems = limit ? items.slice(0, limit) : items;
  return selectedItems
    .map(item => renderDialogue301TextBlock(item, sectionKey))
    .filter(Boolean)
    .join('');
}

function renderDialogue301NoteCards(items){
  if(!Array.isArray(items) || !items.length) return '';

  const cards = items
    .filter(item => item && typeof item === 'object')
    .map((item, index) => {
      const title = pickDialogue301Value(item, ['title', 'title_zh', 'zh']);
      const viTitle = pickDialogue301Value(item, ['vi_title', 'title_vi', 'vi', 'meaning']);
      const content = pickDialogue301Value(item, ['content', 'explanation_vi', 'explanation_raw', 'raw', 'text']);
      const hasAny = title || viTitle || content;
      if(!hasAny) return '';
      return `
        <article class="dialogue301-note-card">
          <div class="dialogue301-note-index">${escapeHtml(index + 1)}</div>
          <div class="dialogue301-note-main">
            ${title ? `<h4>${escapeHtml(title)}</h4>` : ''}
            ${viTitle ? `<strong>${escapeHtml(viTitle)}</strong>` : ''}
            ${content ? `<p>${escapeHtml(content).replace(/\n/g, '<br>')}</p>` : ''}
          </div>
        </article>
      `;
    })
    .filter(Boolean)
    .join('');

  return cards ? `<div class="dialogue301-note-list">${cards}</div>` : '';
}

function renderDialogue301StudyCards(items, sectionKey){
  if(!Array.isArray(items) || !items.length) return '';

  const cards = items.map((item, index) => {
    const text = cleanLessonText(item && typeof item === 'object' ? stringifyDialogue301StructuredItem(item) : item);
    if(!text) return '';
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const first = lines[0] || '';
    const rest = lines.slice(1).join('\n');
    const label = sectionKey === 'practice' ? `Bài tập ${index + 1}` : `Mục ${index + 1}`;
    return `
      <article class="dialogue301-study-card dialogue301-study-${escapeHtml(sectionKey)}">
        <div class="dialogue301-study-kicker">${escapeHtml(label)}</div>
        ${first ? `<h4>${escapeHtml(first)}</h4>` : ''}
        ${rest ? `<p>${escapeHtml(rest).replace(/\n/g, '<br>')}</p>` : ''}
      </article>
    `;
  }).filter(Boolean).join('');

  return cards ? `<div class="dialogue301-study-list">${cards}</div>` : '';
}

function renderDialogue301ExtensionRows(rows){
  if(!Array.isArray(rows) || !rows.length) return '';

  return `
    <div class="sentence-card-list extension-card-list">
      ${rows.map((row, index) => `
        <article class="sentence-card extension-card">
          <span class="sentence-index">${index + 1}</span>
          <div class="sentence-main">
            <strong>${escapeHtml(row.hanzi)}</strong>
            <span>${escapeHtml(row.pinyin)}</span>
            ${row.meaning ? `<small>${escapeHtml(row.meaning)}</small>` : ''}
          </div>
          <button class="sentence-audio-btn" type="button" aria-label="Nghe câu mở rộng ${index + 1}">🔊</button>
        </article>
      `).join('')}
    </div>
  `;
}

function pickDialogue301Value(item, keys){
  for(const key of keys){
    const value = item?.[key];
    if(value !== undefined && value !== null && String(value).trim() !== ''){
      return String(value).trim();
    }
  }
  return '';
}

function normalizeDialogue301VocabRows(items){
  if(!Array.isArray(items) || !items.length) return [];
  const structuredRows = items
    .filter(item => item && typeof item === 'object' && (item.zh || item.hanzi || item.word || item.pinyin || item.vi || item.meaning))
    .map(item => ({
      hanzi: pickDialogue301Value(item, ['zh', 'hanzi', 'word', 'text_zh']),
      pinyin: pickDialogue301Value(item, ['pinyin', 'py']),
      meaning: pickDialogue301Value(item, ['vi', 'meaning', 'meaning_vi', 'translation']),
      type: pickDialogue301Value(item, ['word_type', 'type', 'word_type_zh'])
    }))
    .filter(row => row.hanzi || row.pinyin || row.meaning);

  return structuredRows.length ? structuredRows : collectDialogue301VocabRows(items);
}

function normalizeDialogue301SentenceRows(items){
  if(!Array.isArray(items) || !items.length) return [];
  const structuredRows = items
    .filter(item => item && typeof item === 'object' && (item.zh || item.hanzi || item.pinyin || item.vi || item.meaning))
    .map(item => ({
      hanzi: pickDialogue301Value(item, ['zh', 'hanzi', 'sentence_zh', 'text_zh']),
      pinyin: pickDialogue301Value(item, ['pinyin', 'py']),
      meaning: pickDialogue301Value(item, ['vi', 'meaning', 'meaning_vi', 'translation'])
    }))
    .filter(row => row.hanzi || row.pinyin || row.meaning);

  return structuredRows.length ? structuredRows : collectDialogue301TableRows(items);
}

function normalizeDialogue301DialogueRows(items){
  if(!Array.isArray(items) || !items.length) return [];
  const structuredRows = items
    .filter(item => item && typeof item === 'object' && (item.zh || item.hanzi || item.pinyin || item.vi || item.speaker_zh))
    .map(item => ({
      hanzi: pickDialogue301Value(item, ['zh', 'hanzi', 'line_zh', 'text_zh']),
      pinyin: pickDialogue301Value(item, ['pinyin', 'py']),
      meaning: pickDialogue301Value(item, ['vi', 'meaning', 'meaning_vi', 'translation']),
      speaker: pickDialogue301Value(item, ['speaker_zh', 'speaker', 'speaker_vi']),
      speakerPinyin: pickDialogue301Value(item, ['speaker_pinyin']),
      speakerVi: pickDialogue301Value(item, ['speaker_vi'])
    }))
    .filter(row => row.hanzi || row.pinyin || row.meaning || row.speaker);

  return structuredRows.length ? structuredRows : collectDialogue301TableRows(items);
}

function stringifyDialogue301StructuredItem(item){
  if(item === undefined || item === null) return '';
  if(typeof item !== 'object') return String(item || '');

  const lines = [];
  const push = value => {
    const text = String(value ?? '').trim();
    if(text) lines.push(text);
  };

  push(item.title || item.vi_title || item.title_zh || item.title_vi);
  push(item.zh || item.hanzi);
  push(item.pinyin);
  push(item.vi || item.meaning || item.translation);
  push(item.content || item.explanation_vi || item.explanation_raw || item.raw);

  if(Array.isArray(item.examples) && item.examples.length){
    item.examples.forEach(example => {
      if(typeof example === 'object'){
        push([example.zh, example.pinyin, example.vi || example.meaning].filter(Boolean).join('\n'));
      }else{
        push(example);
      }
    });
  }

  if(Array.isArray(item.items) && item.items.length){
    item.items.forEach(entry => {
      if(typeof entry === 'object'){
        push([entry.zh, entry.pinyin, entry.vi || entry.meaning].filter(Boolean).join(' · '));
      }else{
        push(entry);
      }
    });
  }

  return lines.join('\n').trim();
}

function collectDialogue301TableRows(items){
  const out = [];
  items.forEach(item => {
    const text = cleanLessonText(item && typeof item === 'object' ? stringifyDialogue301StructuredItem(item) : item);
    const rows = parseDialogue301RowsFromTable(text);
    if(rows && rows.length){
      rows.forEach(row => out.push(row));
    }
  });
  return out;
}

function getDialogue301SectionSummary(key, items){
  const count = Array.isArray(items) ? items.length : 0;
  const map = {
    notes: `${count} phần chú thích`,
    grammar: `${count} phần ngữ pháp / ngữ âm`,
    extension: `${count} phần thay thế mở rộng`,
    practice: `${count} phần luyện tập`
  };
  return map[key] || `${count} phần`;
}

function renderDialogue301TextBlock(item, sectionKey){
  const text = cleanLessonText(item && typeof item === 'object' ? stringifyDialogue301StructuredItem(item) : item);

  if(!text){
    return '';
  }

  const vocabHtml = sectionKey === 'vocabulary' ? renderDialogue301VocabList(text) : '';
  const sentenceHtml = sectionKey === 'sentences' ? renderDialogue301SentenceList(text) : '';
  const dialogueHtml = sectionKey === 'dialogue' ? renderDialogue301DialogueBlock(text) : '';
  const tableHtml = vocabHtml || sentenceHtml || dialogueHtml ? '' : renderDialogue301PipeTable(text);

  return `
    <article class="dialogue301-text-block ${sectionKey ? `dialogue301-text-${escapeHtml(sectionKey)}` : ''}">
      ${vocabHtml || sentenceHtml || dialogueHtml || tableHtml || `<pre>${escapeHtml(text)}</pre>`}
    </article>
  `;
}

function cleanLessonText(text){
  const trashLines = new Set(['Minliang', 'minliang', 'THE END', 'The End', '目录', '‹#›']);
  const sectionTitleLines = new Set(['生词', '句子', '课文', '注释', '语音', '语法', '练习', '替换与扩展']);
  const out = [];
  let lastBlank = false;

  String(text ?? '').split(/\r?\n/).forEach(rawLine => {
    const line = rawLine.trim();
    const hasPipe = line.includes('|');

    if(!line){
      if(out.length && !lastBlank){
        out.push('');
        lastBlank = true;
      }
      return;
    }

    if(trashLines.has(line) || (!hasPipe && (/^\d{2}$/.test(line) || sectionTitleLines.has(line)))){
      return;
    }

    out.push(line);
    lastBlank = false;
  });

  while(out.length && out[out.length - 1] === ''){
    out.pop();
  }

  return out.join('\n').trim();
}

function hasChineseText(text){
  return /[\u3400-\u9FFF]/.test(String(text ?? ''));
}

function isDialogue301PinyinCell(text){
  const value = String(text ?? '').trim().normalize('NFC');
  if(!value || hasChineseText(value) || value.includes('|')){
    return false;
  }

  return /^[A-Za-zÀ-ÖØ-öø-ÿĀ-ſƀ-ɏǍǎǏǐǑǒǓǔǕ-ǜḀ-ỿÜü\s'.’·-]+$/u.test(value) &&
    /[A-Za-zÀ-ÖØ-öø-ÿĀ-ſƀ-ɏǍǎǏǐǑǒǓǔǕ-ǜḀ-ỿÜü]/u.test(value);
}

function parseDialogue301RowsFromTable(text){
  const rows = parseDialogue301PipeTable(text);
  if(!rows || rows.length < 2 || !isDialogue301HeaderRow(rows[0])) return null;

  const header = rows[0];
  const chineseIndex = findColumnIndex(header, ['tieng trung', 'tu vung', '中文', 'han']);
  const pinyinIndex = findColumnIndex(header, ['phien am', 'pinyin']);
  const meaningIndex = findColumnIndex(header, ['nghia', 'nghia cua tu', 'viet', '越南']);
  const typeIndex = findColumnIndex(header, ['tu loai', 'loai tu', '词类']);

  if(chineseIndex < 0 || pinyinIndex < 0) return null;

  return rows.slice(1)
    .map(row => ({
      hanzi: row[chineseIndex] || '',
      pinyin: row[pinyinIndex] || '',
      meaning: meaningIndex >= 0 ? (row[meaningIndex] || '') : '',
      type: typeIndex >= 0 ? (row[typeIndex] || '') : ''
    }))
    .filter(row => row.hanzi || row.pinyin || row.meaning);
}


function collectDialogue301VocabRows(items){
  const ordered = [];
  const byHanzi = new Map();

  const addRow = row => {
    const hanzi = String(row?.hanzi || '').trim();
    const pinyin = String(row?.pinyin || '').trim();
    const meaning = String(row?.meaning || '').trim();
    const type = String(row?.type || '').trim();
    if(!hanzi && !pinyin && !meaning) return;
    const key = hanzi || `${pinyin}-${meaning}`;
    if(!byHanzi.has(key)){
      const next = { hanzi, pinyin, meaning, type };
      byHanzi.set(key, next);
      ordered.push(next);
      return;
    }
    const current = byHanzi.get(key);
    if(!current.pinyin && pinyin) current.pinyin = pinyin;
    if(!current.meaning && meaning) current.meaning = meaning;
    if(!current.type && type) current.type = type;
  };

  items.forEach(item => {
    const text = cleanLessonText(item && typeof item === 'object' ? (item.text || '') : item);
    if(!text) return;

    const tableRows = parseDialogue301RowsFromTable(text);
    if(tableRows){
      tableRows.forEach(addRow);
      return;
    }

    const pairRows = parseDialogue301VocabPairs(text);
    if(pairRows){
      pairRows.forEach(addRow);
    }
  });

  return ordered;
}

function renderDialogue301VocabRows(rows){
  if(!Array.isArray(rows) || !rows.length){
    return '';
  }

  return `
    <div class="vocab-list">
      ${rows.map((row, index) => `
        <div class="vocab-row is-clickable" role="button" tabindex="0" data-vocab-row data-vocab-index="${index}" data-hanzi="${escapeHtml(row.hanzi)}" data-pinyin="${escapeHtml(row.pinyin)}" data-meaning="${escapeHtml(row.meaning || '')}" data-type="${escapeHtml(row.type || '')}" aria-label="Xem chi tiết ${escapeHtml(row.hanzi || row.pinyin || row.meaning)}">
          <div class="vocab-row-hanzi">${escapeHtml(row.hanzi)}</div>
          <div class="vocab-row-pinyin">${escapeHtml(row.pinyin)}</div>
          <div class="vocab-row-meaning">${row.meaning ? escapeHtml(row.meaning) : '&nbsp;'}</div>
          <button class="vocab-audio-btn" type="button" aria-label="Nghe ${escapeHtml(row.hanzi)}">🔊</button>
        </div>
      `).join('')}
    </div>
  `;
}

function renderDialogue301VocabList(text){
  let rows = parseDialogue301RowsFromTable(text);

  if(!rows){
    const cards = parseDialogue301VocabPairs(text);
    rows = cards ? cards.map(card => ({ ...card, meaning: '' })) : null;
  }

  return renderDialogue301VocabRows(rows);
}


function normalizeDialogue301SearchText(text){
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitDialogue301HanziTerms(text){
  return String(text || '')
    .split(/[\/／、,，;；\s]+/g)
    .map(part => part.trim())
    .filter(Boolean);
}


function getDialogue301HanziVariants(text){
  const seen = new Set();
  return splitDialogue301HanziTerms(text)
    .filter(part => /[\u3400-\u9FFF\uF900-\uFAFF]/.test(part))
    .filter(part => {
      if(seen.has(part)) return false;
      seen.add(part);
      return true;
    });
}

function getDialogue301HanziCharacters(text){
  const seen = new Set();
  return Array.from(String(text || ''))
    .filter(char => /[\u3400-\u9FFF\uF900-\uFAFF]/.test(char))
    .filter(char => {
      if(seen.has(char)) return false;
      seen.add(char);
      return true;
    });
}


function isDialogue301SingleHanziText(text){
  const value = String(text || '').trim();
  if(!value) return false;
  const chars = getDialogue301HanziCharacters(value);
  return chars.length === 1 && value === chars[0];
}

function getDialogue301UniqueHanziCharactersFromTerms(terms){
  const seen = new Set();
  const chars = [];
  (Array.isArray(terms) ? terms : []).forEach(term => {
    getDialogue301HanziCharacters(term).forEach(char => {
      if(!seen.has(char)){
        seen.add(char);
        chars.push(char);
      }
    });
  });
  return chars;
}

function getDialogue301ChineseSpeakParts(text){
  const parts = String(text || '')
    .split(/[\/／、,，;；]/)
    .map(part => part.trim())
    .filter(Boolean)
    .filter(part => /[\u3400-\u9FFF\uF900-\uFAFF]/.test(part));

  const seen = new Set();
  return parts.filter(part => {
    if(seen.has(part)) return false;
    seen.add(part);
    return true;
  });
}

function pickDialogue301ChineseVoice(){
  if(!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
  return voices.find(voice => /^zh[-_]?CN/i.test(voice.lang))
    || voices.find(voice => /^zh/i.test(voice.lang))
    || null;
}

function speakDialogue301ChineseText(text){
  if(!('speechSynthesis' in window) || !window.SpeechSynthesisUtterance) return false;

  const parts = getDialogue301ChineseSpeakParts(text);
  if(!parts.length) return false;

  window.speechSynthesis.cancel();
  const voice = pickDialogue301ChineseVoice();

  parts.forEach(part => {
    const utterance = new SpeechSynthesisUtterance(part);
    utterance.lang = voice?.lang || 'zh-CN';
    if(voice) utterance.voice = voice;
    utterance.rate = 0.88;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  });

  return true;
}


const dialogue301WordBucketCache = new Map();

function cleanDialogue301PinyinText(text){
  return String(text || '')
    .replace(/\u200b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getDialogue301WordBucketPath(wordText, source){
  const chars = getDialogue301HanziCharacters(wordText);
  if(!chars.length) return '';
  if(source === 'by_first_char'){
    const hex = chars[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
    return `modules/hanzi-stroke/data/words/by_first_char/${hex}.json`;
  }
  if(source === 'by_length'){
    return `modules/hanzi-stroke/data/words/by_length/len_${String(chars.length).padStart(2, '0')}.json`;
  }
  return '';
}

function loadDialogue301WordBucket(wordText, source){
  const path = getDialogue301WordBucketPath(wordText, source);
  if(!path) return Promise.resolve(null);
  if(dialogue301WordBucketCache.has(path)) return dialogue301WordBucketCache.get(path);

  const promise = fetch(path)
    .then(response => {
      if(response.status === 404) return null;
      if(!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response.json();
    })
    .catch(error => {
      console.warn(`Cannot load Dialogue 301 word bucket ${path}:`, error);
      return null;
    });

  dialogue301WordBucketCache.set(path, promise);
  return promise;
}

function pickDialogue301WordEntry(rows){
  const list = Array.isArray(rows) ? rows : (rows ? [rows] : []);
  if(!list.length) return null;
  return list.find(row => String(row?.vi || '').trim())
    || list.find(row => String(row?.en || '').trim())
    || list[0];
}

function findDialogue301WordEntryInBucket(bucket, target){
  if(!bucket) return null;
  if(Array.isArray(bucket)){
    return pickDialogue301WordEntry(bucket.filter(row => String(row?.s || row?.word || '').trim() === target));
  }
  return pickDialogue301WordEntry(bucket[target]);
}

function normalizeDialogue301WordDictionaryEntry(entry, target, source){
  if(!entry) return null;
  return {
    word: entry.s || entry.word || target,
    traditional: entry.t || entry.traditional || '',
    pinyin: cleanDialogue301PinyinText(entry.p || entry.pinyin || entry.pt || ''),
    meaningVi: entry.vi || entry.meaningVi || '',
    meaningEn: entry.en || entry.meaningEn || '',
    hanViet: entry.sv || entry.hanViet || '',
    hsk: entry.hsk || '',
    source: source === 'by_first_char' ? 'words/by_first_char' : 'words/by_length'
  };
}

async function lookupDialogue301CompoundWord(wordText){
  const target = String(wordText || '').trim();
  if(!target) return null;
  const sources = ['by_first_char', 'by_length'];
  for(const source of sources){
    const bucket = await loadDialogue301WordBucket(target, source);
    const entry = findDialogue301WordEntryInBucket(bucket, target);
    const normalized = normalizeDialogue301WordDictionaryEntry(entry, target, source);
    if(normalized) return normalized;
  }
  return null;
}


const dialogue301CharInfoCache = new Map();

function getDialogue301CharDataPath(char){
  const code = String(char || '').codePointAt(0);
  if(!Number.isFinite(code)) return '';
  return `modules/hanzi-stroke/data/chars/${code.toString(16).toUpperCase()}.json`;
}

function loadDialogue301CharInfo(char){
  const target = String(char || '').trim();
  if(!target) return Promise.resolve(null);
  if(dialogue301CharInfoCache.has(target)) return dialogue301CharInfoCache.get(target);

  const path = getDialogue301CharDataPath(target);
  if(!path) return Promise.resolve(null);

  const promise = fetch(path)
    .then(response => {
      if(response.status === 404) return null;
      if(!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response.json();
    })
    .then(data => normalizeDialogue301CharInfo(data, target))
    .catch(error => {
      console.warn(`Cannot load Dialogue 301 char info ${path}:`, error);
      return null;
    });

  dialogue301CharInfoCache.set(target, promise);
  return promise;
}

function normalizeDialogue301CharInfo(info, fallbackChar){
  if(!info) return null;
  return {
    char: info.char || info.s || fallbackChar,
    pinyin: cleanDialogue301PinyinText(info.pinyin || info.p || ''),
    meaningVi: info.meaningVi || info.vi || info.definitionVi || '',
    meaningEn: info.meaningEn || info.en || info.definitionEn || '',
    hanViet: info.hanViet || info.sv || info.vietnamese || '',
    radical: info.radical || info.radicalChar || info.bushu || '',
    strokeCount: info.strokeCount ?? info.strokes ?? info.stroke_count ?? '',
    hsk: info.hsk || '',
    relatedWords: Array.isArray(info.relatedWords) ? info.relatedWords : (Array.isArray(info.words) ? info.words : []),
    source: 'data/chars'
  };
}

function formatDialogue301LookupMeaning(info){
  return String(info?.meaningVi || info?.meaningEn || '').trim();
}

function renderDialogue301CharRelatedWords(words){
  const related = Array.isArray(words) ? words.slice(0, 8) : [];
  if(!related.length) return '';

  return `
    <section class="dialogue301-word-section dialogue301-char-related-section">
      <h4>Từ liên quan</h4>
      <div class="dialogue301-char-related-list">
        ${related.map(item => {
          const word = String(item?.word || item?.s || '').trim();
          if(!word) return '';
          const pinyin = cleanDialogue301PinyinText(item?.pinyin || item?.p || '');
          const meaning = String(item?.meaningVi || item?.vi || item?.meaningEn || item?.en || '').trim();
          const lookupAction = isDialogue301SingleHanziText(word) ? 'dialogue301-inline-char-ready' : 'dialogue301-inline-word-ready';
          return `
            <article class="dialogue301-char-related-item" data-action="${lookupAction}" data-text="${escapeHtml(word)}" data-copy-text="${escapeHtml(word)}" tabindex="0">
              <div class="dialogue301-related-text">
                <strong>${escapeHtml(word)}</strong>
                ${pinyin ? `<span>${escapeHtml(pinyin)}</span>` : ''}
                ${meaning ? `<small>${escapeHtml(meaning)}</small>` : ''}
              </div>
              <button class="dialogue301-related-audio" type="button" data-action="dialogue301-related-audio" data-text="${escapeHtml(word)}" aria-label="Nghe ${escapeHtml(word)}">🔊</button>
            </article>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

function renderDialogue301LookupChips(items, action, extraClass = ''){
  if(!Array.isArray(items) || !items.length) return '';
  return items.map(item => `
    <button class="dialogue301-word-chip ${escapeHtml(extraClass)}" type="button" data-action="${escapeHtml(action)}" data-text="${escapeHtml(item)}" data-copy-text="${escapeHtml(item)}">
      ${escapeHtml(item)}
    </button>
  `).join('');
}


const dialogue301PopupHistory = [];
let dialogue301CurrentPopupView = null;

function setDialogue301CurrentPopupView(view){
  dialogue301CurrentPopupView = view ? { ...view } : null;
}

function pushDialogue301PopupHistory(){
  if(!dialogue301CurrentPopupView) return;
  dialogue301PopupHistory.push({ ...dialogue301CurrentPopupView });
  if(dialogue301PopupHistory.length > 12){
    dialogue301PopupHistory.shift();
  }
}

function resetDialogue301PopupHistory(){
  dialogue301PopupHistory.length = 0;
}

function openDialogue301PopupState(state){
  if(!state) return;
  if(state.type === 'vocab'){
    openDialogue301WordPopup(state.word, { resetHistory: false, pushHistory: false });
    return;
  }
  if(state.type === 'word'){
    openDialogue301InlineWordLookup(state.text, state.previousWord, { pushHistory: false });
    return;
  }
  if(state.type === 'char'){
    openDialogue301InlineCharLookup(state.text, state.previousWord, { pushHistory: false });
  }
}

function backDialogue301Popup(){
  const previous = dialogue301PopupHistory.pop();
  if(previous){
    openDialogue301PopupState(previous);
    return;
  }
  if(dialogue301CurrentPopupView?.previousWord){
    openDialogue301WordPopup(dialogue301CurrentPopupView.previousWord, { resetHistory: false, pushHistory: false });
  }
}

function copyDialogue301Text(text){
  const value = String(text || '').trim();
  if(!value) return Promise.resolve(false);

  if(navigator.clipboard && window.isSecureContext){
    return navigator.clipboard.writeText(value).then(() => true).catch(() => false);
  }

  return new Promise(resolve => {
    try{
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      resolve(Boolean(ok));
    }catch(error){
      resolve(false);
    }
  });
}

function showDialogue301Toast(message){
  let toast = document.getElementById('dialogue301WordToast');
  if(!toast){
    toast = document.createElement('div');
    toast.id = 'dialogue301WordToast';
    toast.className = 'dialogue301-word-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(showDialogue301Toast.timer);
  showDialogue301Toast.timer = window.setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 1300);
}

function bindDialogue301CopyInteractions(root){
  if(!root) return;

  root.querySelectorAll('[data-action="copy-dialogue301-text"]').forEach(btn => {
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const text = btn.getAttribute('data-text') || '';
      copyDialogue301Text(text).then(ok => showDialogue301Toast(ok ? 'Đã copy' : 'Không copy được'));
    });
  });

  root.querySelectorAll('[data-copy-text]').forEach(el => {
    let timer = null;
    let copiedByHold = false;
    const clear = () => {
      if(timer){
        window.clearTimeout(timer);
        timer = null;
      }
    };
    el.addEventListener('pointerdown', event => {
      copiedByHold = false;
      clear();
      const text = el.getAttribute('data-copy-text') || '';
      timer = window.setTimeout(() => {
        copiedByHold = true;
        copyDialogue301Text(text).then(ok => showDialogue301Toast(ok ? 'Đã copy' : 'Không copy được'));
      }, 650);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(type => {
      el.addEventListener(type, clear);
    });
    el.addEventListener('click', event => {
      if(copiedByHold){
        event.preventDefault();
        event.stopPropagation();
      }
    });
  });
}

function getDialogue301CurrentVocabularyRows(){
  if(!dialogue301CurrentData) return [];
  return normalizeDialogue301VocabRows(getDialogue301StructuredItems(dialogue301CurrentData, 'vocabulary'));
}

function getDialogue301RelatedWords(word){
  const rows = getDialogue301CurrentVocabularyRows();
  const hanzi = String(word?.hanzi || '').trim();
  const terms = splitDialogue301HanziTerms(hanzi);
  if(!terms.length) return [];

  const exact = `${hanzi}|||${String(word?.pinyin || '').trim()}|||${String(word?.meaning || '').trim()}`;

  return rows.filter(row => {
    const rowKey = `${String(row.hanzi || '').trim()}|||${String(row.pinyin || '').trim()}|||${String(row.meaning || '').trim()}`;
    if(rowKey === exact) return false;
    const rowHanzi = String(row.hanzi || '').trim();
    if(!rowHanzi) return false;
    return terms.some(term => rowHanzi.includes(term) || term.includes(rowHanzi));
  }).slice(0, 8);
}

function getDialogue301ExamplesForWord(word){
  if(!dialogue301CurrentData) return [];
  const terms = splitDialogue301HanziTerms(word?.hanzi || '');
  const pinyinNeedle = normalizeDialogue301SearchText(word?.pinyin || '');
  if(!terms.length && !pinyinNeedle) return [];

  const rows = [
    ...normalizeDialogue301SentenceRows(getDialogue301StructuredItems(dialogue301CurrentData, 'sentences')),
    ...normalizeDialogue301DialogueRows(getDialogue301StructuredItems(dialogue301CurrentData, 'dialogue')),
    ...normalizeDialogue301SentenceRows(getDialogue301StructuredItems(dialogue301CurrentData, 'extension'))
  ];

  const seen = new Set();
  const examples = [];
  rows.forEach(row => {
    const hanzi = String(row.hanzi || '').trim();
    const pinyin = String(row.pinyin || '').trim();
    const meaning = String(row.meaning || '').trim();
    const haystack = `${hanzi} ${pinyin} ${meaning}`;
    const normalized = normalizeDialogue301SearchText(haystack);
    const matchByHanzi = terms.some(term => hanzi.includes(term));
    const matchByPinyin = pinyinNeedle && normalized.includes(pinyinNeedle);
    if(!matchByHanzi && !matchByPinyin) return;
    const key = `${hanzi}|||${pinyin}|||${meaning}`;
    if(seen.has(key)) return;
    seen.add(key);
    examples.push(row);
  });

  return examples.slice(0, 4);
}

function renderDialogue301WordPopup(word){
  const related = getDialogue301RelatedWords(word);
  const examples = getDialogue301ExamplesForWord(word);
  const lessonNo = dialogue301CurrentData?.lesson_no || dialogue301CurrentLesson?.lesson_no || '';
  const variants = getDialogue301HanziVariants(word?.hanzi || '');
  const multiCharVariants = variants.filter(item => getDialogue301HanziCharacters(item).length > 1);
  const characters = getDialogue301UniqueHanziCharactersFromTerms(variants.length ? variants : [word?.hanzi || '']);
  const copyText = variants[0] || word?.hanzi || word?.pinyin || word?.meaning || '';

  const quickLookupHtml = multiCharVariants.length ? `
    <section class="dialogue301-word-section dialogue301-word-quick-section">
      <h4>Tra nhanh</h4>
      <div class="dialogue301-word-chip-row">
        ${renderDialogue301LookupChips(multiCharVariants, 'dialogue301-inline-word-ready', 'word-chip')}
      </div>
    </section>
  ` : '';

  const charLookupHtml = characters.length ? `
    <section class="dialogue301-word-section dialogue301-word-char-section">
      <h4>Từng chữ</h4>
      <div class="dialogue301-word-chip-row dialogue301-word-char-row">
        ${renderDialogue301LookupChips(characters, 'dialogue301-inline-char-ready', 'char-chip')}
      </div>
    </section>
  ` : '';

  const relatedHtml = related.length ? `
    <section class="dialogue301-word-section">
      <h4>Từ liên quan trong bài</h4>
      <div class="dialogue301-word-related-list">
        ${related.map(item => `
          <article class="dialogue301-word-related-item" data-copy-text="${escapeHtml(item.hanzi || '')}" tabindex="0">
            <div class="dialogue301-related-text">
              <strong>${escapeHtml(item.hanzi)}</strong>
              <span>${escapeHtml(item.pinyin)}</span>
              <small>${escapeHtml(item.meaning || '')}</small>
            </div>
            <button class="dialogue301-related-audio" type="button" data-action="dialogue301-related-audio" data-text="${escapeHtml(item.hanzi || '')}" aria-label="Nghe ${escapeHtml(item.hanzi || '')}">🔊</button>
          </article>
        `).join('')}
      </div>
    </section>
  ` : '';

  const examplesHtml = examples.length ? `
    <section class="dialogue301-word-section">
      <h4>Ví dụ trong bài</h4>
      <div class="dialogue301-word-example-list">
        ${examples.map(item => `
          <article class="dialogue301-word-example-card">
            <strong>${escapeHtml(item.hanzi)}</strong>
            ${item.pinyin ? `<span>${escapeHtml(item.pinyin)}</span>` : ''}
            ${item.meaning ? `<small>${escapeHtml(item.meaning)}</small>` : ''}
          </article>
        `).join('')}
      </div>
    </section>
  ` : '';

  return `
    <div class="dialogue301-word-overlay" data-action="close-dialogue301-word-popup"></div>
    <section class="dialogue301-word-sheet" role="dialog" aria-modal="true" aria-label="Chi tiết từ vựng">
      <div class="dialogue301-word-head">
        <strong>Chi tiết từ</strong>
        <button class="dialogue301-word-close" type="button" data-action="close-dialogue301-word-popup" aria-label="Đóng">×</button>
      </div>
      <div class="dialogue301-word-main-card">
        <div class="dialogue301-word-hanzi" data-copy-text="${escapeHtml(copyText)}" title="Nhấn giữ để copy">${escapeHtml(word.hanzi || '')}</div>
        ${word.pinyin ? `<div class="dialogue301-word-pinyin">${escapeHtml(word.pinyin)}</div>` : ''}
        ${word.meaning ? `<div class="dialogue301-word-meaning">${escapeHtml(word.meaning)}</div>` : ''}
        <div class="dialogue301-word-action-row">
          <button class="dialogue301-word-audio" type="button" aria-label="Nghe ${escapeHtml(word.hanzi || word.pinyin || '')}">🔊</button>
        </div>
      </div>
      ${quickLookupHtml}
      ${charLookupHtml}
      <section class="dialogue301-word-section">
        <h4>Thông tin</h4>
        <div class="dialogue301-word-info-grid">
          ${word.type ? `<span>Loại từ</span><strong>${escapeHtml(word.type)}</strong>` : ''}
          ${lessonNo ? `<span>Bài</span><strong>Bài ${escapeHtml(lessonNo)}</strong>` : ''}
          <span>Nguồn</span><strong>301 Đàm thoại</strong>
        </div>
      </section>
      ${relatedHtml}
      ${examplesHtml}
    </section>
  `;
}


function renderDialogue301InlineLookupLoading(text){
  return `
    <div class="dialogue301-word-overlay" data-action="close-dialogue301-word-popup"></div>
    <section class="dialogue301-word-sheet" role="dialog" aria-modal="true" aria-label="Tra chữ Hán">
      <div class="dialogue301-word-head dialogue301-word-lookup-head">
        <button class="dialogue301-word-back" type="button" data-action="back-dialogue301-word-popup">← Quay về</button>
        <button class="dialogue301-word-close" type="button" data-action="close-dialogue301-word-popup" aria-label="Đóng">×</button>
      </div>
      <div class="dialogue301-word-main-card dialogue301-inline-lookup-card">
        <div class="dialogue301-word-hanzi" data-copy-text="${escapeHtml(text)}" title="Nhấn giữ để copy">${escapeHtml(text)}</div>
        <div class="dialogue301-lookup-status">Đang tra dữ liệu...</div>
      </div>
    </section>
  `;
}



let dialogue301InlineStrokeWriter = null;
let dialogue301InlineStrokeChar = '';
let dialogue301HanziWriterLoader = null;

function ensureDialogue301HanziWriter(){
  if(window.HanziWriter) return Promise.resolve(window.HanziWriter);
  if(dialogue301HanziWriterLoader) return dialogue301HanziWriterLoader;

  dialogue301HanziWriterLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-dialogue301-hanzi-writer="true"]');
    if(existing){
      existing.addEventListener('load', () => resolve(window.HanziWriter), { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/hanzi-writer@3.7/dist/hanzi-writer.min.js';
    script.async = true;
    script.dataset.dialogue301HanziWriter = 'true';
    script.onload = () => resolve(window.HanziWriter);
    script.onerror = reject;
    document.head.appendChild(script);
  }).catch(error => {
    console.warn('Cannot load Hanzi Writer for Dialogue 301 popup:', error);
    return null;
  });

  return dialogue301HanziWriterLoader;
}

function renderDialogue301StrokePractice(chars, activeChar){
  const uniqueChars = getDialogue301UniqueHanziCharactersFromTerms(chars || []);
  if(!uniqueChars.length) return '';
  const selected = activeChar && uniqueChars.includes(activeChar) ? activeChar : uniqueChars[0];

  return `
    <section class="dialogue301-word-section dialogue301-stroke-section" data-dialogue301-stroke-section>
      <div class="dialogue301-stroke-head">
        <h4>Cách viết</h4>
        <small>Chọn một chữ để xem nét</small>
      </div>
      ${uniqueChars.length > 1 ? `
        <div class="dialogue301-word-chip-row dialogue301-stroke-char-row">
          ${uniqueChars.map(char => `
            <button class="dialogue301-word-chip dialogue301-stroke-chip ${char === selected ? 'active' : ''}" type="button" data-action="dialogue301-stroke-select" data-stroke-char="${escapeHtml(char)}">
              ${escapeHtml(char)}
            </button>
          `).join('')}
        </div>
      ` : ''}
      <div class="dialogue301-stroke-current">Đang luyện: <strong data-dialogue301-stroke-current>${escapeHtml(selected)}</strong></div>
      <div class="dialogue301-stroke-canvas-wrap">
        <div class="dialogue301-stroke-canvas" id="dialogue301InlineStrokeCanvas" aria-label="Cách viết ${escapeHtml(selected)}"></div>
      </div>
      <div class="dialogue301-stroke-actions">
        <button type="button" data-action="dialogue301-stroke-animate">▶ Phát nét</button>
        <button type="button" data-action="dialogue301-stroke-quiz">✎ Luyện viết</button>
      </div>
      <p class="dialogue301-stroke-status" data-dialogue301-stroke-status>Đang chuẩn bị nét chữ...</p>
    </section>
  `;
}

function setDialogue301StrokeStatus(root, message){
  const status = root?.querySelector?.('[data-dialogue301-stroke-status]');
  if(status) status.textContent = message || '';
}

async function activateDialogue301InlineStrokeChar(root, char){
  const target = String(char || '').trim();
  if(!root || !target) return;

  dialogue301InlineStrokeChar = target;
  const current = root.querySelector('[data-dialogue301-stroke-current]');
  if(current) current.textContent = target;
  root.querySelectorAll('[data-action="dialogue301-stroke-select"]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-stroke-char') === target);
  });

  const canvas = root.querySelector('#dialogue301InlineStrokeCanvas');
  if(!canvas) return;
  canvas.innerHTML = '';
  setDialogue301StrokeStatus(root, 'Đang tải nét chữ...');

  const HanziWriterLib = await ensureDialogue301HanziWriter();
  if(!HanziWriterLib){
    setDialogue301StrokeStatus(root, 'Không tải được Hanzi Writer. Có thể mở Tra chữ Hán đầy đủ để luyện viết.');
    return;
  }

  try{
    dialogue301InlineStrokeWriter = HanziWriterLib.create(canvas, target, {
      width: 172,
      height: 172,
      padding: 10,
      showOutline: true,
      showCharacter: false,
      strokeAnimationSpeed: 1,
      delayBetweenStrokes: 260,
      drawingWidth: 22,
      radicalColor: '#c85f42',
      charDataLoader: (loadChar, onComplete, onError) => {
        fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@latest/${encodeURIComponent(loadChar)}.json`)
          .then(response => {
            if(!response.ok) throw new Error(`${response.status} ${response.statusText}`);
            return response.json();
          })
          .then(onComplete)
          .catch(onError);
      }
    });
    setDialogue301StrokeStatus(root, 'Bấm Phát nét hoặc Luyện viết để học chữ này.');
  }catch(error){
    console.warn('Cannot create Dialogue 301 inline stroke writer:', error);
    setDialogue301StrokeStatus(root, 'Không hiển thị được nét chữ này.');
  }
}

function bindDialogue301InlineStrokePractice(root, chars){
  const uniqueChars = getDialogue301UniqueHanziCharactersFromTerms(chars || []);
  if(!root || !uniqueChars.length) return;

  root.querySelectorAll('[data-action="dialogue301-stroke-select"]').forEach(btn => {
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      activateDialogue301InlineStrokeChar(root, btn.getAttribute('data-stroke-char') || '');
    });
  });

  root.querySelectorAll('[data-action="dialogue301-stroke-animate"]').forEach(btn => {
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if(dialogue301InlineStrokeWriter){
        dialogue301InlineStrokeWriter.animateCharacter();
      }else{
        activateDialogue301InlineStrokeChar(root, dialogue301InlineStrokeChar || uniqueChars[0]);
      }
    });
  });

  root.querySelectorAll('[data-action="dialogue301-stroke-quiz"]').forEach(btn => {
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if(dialogue301InlineStrokeWriter){
        dialogue301InlineStrokeWriter.quiz();
      }else{
        activateDialogue301InlineStrokeChar(root, dialogue301InlineStrokeChar || uniqueChars[0]);
      }
    });
  });

  activateDialogue301InlineStrokeChar(root, uniqueChars[0]);
}

function renderDialogue301InlineWordLookup(text, info){
  const target = String(text || '').trim();
  const chars = getDialogue301HanziCharacters(target);
  const pinyin = info?.pinyin || '';
  const meaningVi = info?.meaningVi || '';
  const meaningEn = info?.meaningEn || '';
  const hasInfo = Boolean(info && (pinyin || meaningVi || meaningEn));

  const charsHtml = chars.length ? `
    <section class="dialogue301-word-section dialogue301-word-char-section">
      <h4>Từng chữ trong từ</h4>
      <div class="dialogue301-word-chip-row dialogue301-word-char-row">
        ${renderDialogue301LookupChips(chars, 'dialogue301-inline-char-ready', 'char-chip')}
      </div>
    </section>
  ` : '';
  const strokeHtml = renderDialogue301StrokePractice(chars, chars[0]);

  const infoHtml = hasInfo ? `
    <section class="dialogue301-word-section">
      <h4>Thông tin từ điển</h4>
      <div class="dialogue301-word-info-grid">
        ${info.hsk ? `<span>HSK</span><strong>HSK ${escapeHtml(info.hsk)}</strong>` : ''}
        ${info.hanViet ? `<span>Hán Việt</span><strong>${escapeHtml(info.hanViet)}</strong>` : ''}
        <span>Nguồn</span><strong>Tra chữ Hán · ${escapeHtml(info.source || 'words')}</strong>
      </div>
    </section>
  ` : `
    <section class="dialogue301-word-section">
      <h4>Thông tin từ điển</h4>
      <p class="dialogue301-lookup-empty">Chưa tìm thấy nghĩa cụm từ trong dữ liệu words. Vẫn có thể copy từng chữ để tra ở lớp tiếp theo.</p>
    </section>
  `;

  return `
    <div class="dialogue301-word-overlay" data-action="close-dialogue301-word-popup"></div>
    <section class="dialogue301-word-sheet" role="dialog" aria-modal="true" aria-label="Tra chữ Hán">
      <div class="dialogue301-word-head dialogue301-word-lookup-head">
        <button class="dialogue301-word-back" type="button" data-action="back-dialogue301-word-popup">← Quay về từ vựng</button>
        <button class="dialogue301-word-close" type="button" data-action="close-dialogue301-word-popup" aria-label="Đóng">×</button>
      </div>
      <div class="dialogue301-word-main-card dialogue301-inline-lookup-card">
        <div class="dialogue301-word-hanzi" data-copy-text="${escapeHtml(target)}" title="Nhấn giữ để copy">${escapeHtml(target)}</div>
        ${pinyin ? `<div class="dialogue301-word-pinyin">${escapeHtml(pinyin)}</div>` : ''}
        ${meaningVi ? `<div class="dialogue301-word-meaning">${escapeHtml(meaningVi)}</div>` : ''}
        ${meaningEn ? `<div class="dialogue301-word-en-meaning">${escapeHtml(meaningEn)}</div>` : ''}
        <div class="dialogue301-word-action-row">
          <button class="dialogue301-word-audio" type="button" aria-label="Nghe ${escapeHtml(target)}">🔊</button>
        </div>
      </div>
      ${charsHtml}
      ${infoHtml}
      ${strokeHtml}
    </section>
  `;
}


function renderDialogue301InlineCharLookup(text, info){
  const target = String(text || '').trim();
  const pinyin = info?.pinyin || '';
  const meaning = formatDialogue301LookupMeaning(info);
  const hsk = info?.hsk ? `HSK ${info.hsk}` : '';
  const strokeCount = info?.strokeCount || '';
  const hasInfo = Boolean(info && (pinyin || meaning || info.hanViet || info.radical || strokeCount || hsk));
  const relatedHtml = renderDialogue301CharRelatedWords(info?.relatedWords);
  const strokeHtml = renderDialogue301StrokePractice([target], target);

  const infoHtml = hasInfo ? `
    <section class="dialogue301-word-section">
      <h4>Thông tin chữ Hán</h4>
      <div class="dialogue301-word-info-grid dialogue301-char-info-grid">
        ${info.hanViet ? `<span>Hán Việt</span><strong>${escapeHtml(info.hanViet)}</strong>` : ''}
        ${info.radical ? `<span>Bộ thủ</span><strong>${escapeHtml(info.radical)}</strong>` : ''}
        ${strokeCount ? `<span>Số nét</span><strong>${escapeHtml(strokeCount)}</strong>` : ''}
        ${hsk ? `<span>HSK</span><strong>${escapeHtml(hsk)}</strong>` : ''}
        <span>Nguồn</span><strong>Tra chữ Hán · ${escapeHtml(info.source || 'data/chars')}</strong>
      </div>
    </section>
  ` : `
    <section class="dialogue301-word-section">
      <h4>Thông tin chữ Hán</h4>
      <p class="dialogue301-lookup-empty">Chưa tìm thấy dữ liệu chi tiết cho chữ này.</p>
    </section>
  `;

  return `
    <div class="dialogue301-word-overlay" data-action="close-dialogue301-word-popup"></div>
    <section class="dialogue301-word-sheet" role="dialog" aria-modal="true" aria-label="Tra chữ Hán">
      <div class="dialogue301-word-head dialogue301-word-lookup-head">
        <button class="dialogue301-word-back" type="button" data-action="back-dialogue301-word-popup">← Quay về từ vựng</button>
        <button class="dialogue301-word-close" type="button" data-action="close-dialogue301-word-popup" aria-label="Đóng">×</button>
      </div>
      <div class="dialogue301-word-main-card dialogue301-inline-lookup-card dialogue301-inline-char-card">
        <div class="dialogue301-word-hanzi dialogue301-inline-char-hanzi" data-copy-text="${escapeHtml(target)}" title="Nhấn giữ để copy">${escapeHtml(target)}</div>
        ${pinyin ? `<div class="dialogue301-word-pinyin">${escapeHtml(pinyin)}</div>` : ''}
        ${meaning ? `<div class="dialogue301-word-meaning">${escapeHtml(meaning)}</div>` : ''}
        <div class="dialogue301-word-action-row">
          <button class="dialogue301-word-audio" type="button" aria-label="Nghe ${escapeHtml(target)}">🔊</button>
        </div>
      </div>
      ${infoHtml}
      ${strokeHtml}
      ${relatedHtml}
    </section>
  `;
}

async function openDialogue301InlineCharLookup(text, previousWord, options = {}){
  const target = String(text || '').trim();
  if(!target) return;
  if(options.pushHistory !== false) pushDialogue301PopupHistory();
  setDialogue301CurrentPopupView({ type: 'char', text: target, previousWord });
  let root = document.getElementById('dialogue301WordPopupRoot');
  if(!root){
    root = document.createElement('div');
    root.id = 'dialogue301WordPopupRoot';
    document.body.appendChild(root);
  }

  root.innerHTML = renderDialogue301InlineLookupLoading(target);
  document.body.classList.add('dialogue301-word-popup-open');
  bindDialogue301InlineLookupShell(root, target, previousWord);

  const info = await loadDialogue301CharInfo(target);
  root.innerHTML = renderDialogue301InlineCharLookup(target, info);
  bindDialogue301InlineLookupShell(root, target, previousWord);
  bindDialogue301InlineStrokePractice(root, getDialogue301HanziCharacters(target));
}

async function openDialogue301InlineWordLookup(text, previousWord, options = {}){
  const target = String(text || '').trim();
  if(!target) return;
  if(options.pushHistory !== false) pushDialogue301PopupHistory();
  setDialogue301CurrentPopupView({ type: 'word', text: target, previousWord });
  let root = document.getElementById('dialogue301WordPopupRoot');
  if(!root){
    root = document.createElement('div');
    root.id = 'dialogue301WordPopupRoot';
    document.body.appendChild(root);
  }

  root.innerHTML = renderDialogue301InlineLookupLoading(target);
  document.body.classList.add('dialogue301-word-popup-open');
  bindDialogue301InlineLookupShell(root, target, previousWord);

  const info = await lookupDialogue301CompoundWord(target);
  root.innerHTML = renderDialogue301InlineWordLookup(target, info);
  bindDialogue301InlineLookupShell(root, target, previousWord);
  bindDialogue301InlineStrokePractice(root, getDialogue301HanziCharacters(target));
}

function bindDialogue301InlineLookupShell(root, target, previousWord){
  root.querySelectorAll('[data-action="close-dialogue301-word-popup"]').forEach(btn => {
    btn.addEventListener('click', closeDialogue301WordPopup);
  });

  root.querySelectorAll('[data-action="back-dialogue301-word-popup"]').forEach(btn => {
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      backDialogue301Popup();
    });
  });

  const audioBtn = root.querySelector('.dialogue301-word-audio');
  if(audioBtn){
    audioBtn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const ok = speakDialogue301ChineseText(target || '');
      if(!ok) showDialogue301Toast('Không phát được âm');
    });
  }

  bindDialogue301CopyInteractions(root);

  root.querySelectorAll('[data-action="dialogue301-related-audio"]').forEach(btn => {
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const text = btn.getAttribute('data-text') || '';
      const ok = speakDialogue301ChineseText(text);
      if(!ok) showDialogue301Toast('Không phát được âm');
    });
  });

  root.querySelectorAll('[data-action="dialogue301-inline-word-ready"]').forEach(btn => {
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const text = btn.getAttribute('data-text') || '';
      if(isDialogue301SingleHanziText(text)){
        openDialogue301InlineCharLookup(text, previousWord);
      }else{
        openDialogue301InlineWordLookup(text, previousWord);
      }
    });
    btn.addEventListener('keydown', event => {
      if(event.key === 'Enter' || event.key === ' '){
        event.preventDefault();
        const text = btn.getAttribute('data-text') || '';
        if(isDialogue301SingleHanziText(text)){
          openDialogue301InlineCharLookup(text, previousWord);
        }else{
          openDialogue301InlineWordLookup(text, previousWord);
        }
      }
    });
  });

  root.querySelectorAll('[data-action="dialogue301-inline-char-ready"]').forEach(btn => {
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const text = btn.getAttribute('data-text') || '';
      openDialogue301InlineCharLookup(text, previousWord);
    });
  });
}

function openDialogue301WordPopup(word, options = {}){
  if(!word || (!word.hanzi && !word.pinyin && !word.meaning)) return;
  if(options.resetHistory !== false) resetDialogue301PopupHistory();
  if(options.pushHistory === true) pushDialogue301PopupHistory();
  setDialogue301CurrentPopupView({ type: 'vocab', word });
  let root = document.getElementById('dialogue301WordPopupRoot');
  if(!root){
    root = document.createElement('div');
    root.id = 'dialogue301WordPopupRoot';
    document.body.appendChild(root);
  }
  root.innerHTML = renderDialogue301WordPopup(word);
  document.body.classList.add('dialogue301-word-popup-open');

  root.querySelectorAll('[data-action="close-dialogue301-word-popup"]').forEach(btn => {
    btn.addEventListener('click', closeDialogue301WordPopup);
  });

  const audioBtn = root.querySelector('.dialogue301-word-audio');
  if(audioBtn){
    audioBtn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const ok = speakDialogue301ChineseText(word.hanzi || '');
      if(!ok) showDialogue301Toast('Không phát được âm');
    });
  }

  bindDialogue301CopyInteractions(root);

  root.querySelectorAll('[data-action="dialogue301-related-audio"]').forEach(btn => {
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const text = btn.getAttribute('data-text') || '';
      const ok = speakDialogue301ChineseText(text);
      if(!ok) showDialogue301Toast('Không phát được âm');
    });
  });

  root.querySelectorAll('[data-action="dialogue301-inline-word-ready"]').forEach(btn => {
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const text = btn.getAttribute('data-text') || '';
      if(isDialogue301SingleHanziText(text)){
        openDialogue301InlineCharLookup(text, word);
      }else{
        openDialogue301InlineWordLookup(text, word);
      }
    });
  });

  root.querySelectorAll('[data-action="dialogue301-inline-char-ready"]').forEach(btn => {
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const text = btn.getAttribute('data-text') || '';
      openDialogue301InlineCharLookup(text, word);
    });
  });
}

function closeDialogue301WordPopup(){
  const root = document.getElementById('dialogue301WordPopupRoot');
  if(root) root.innerHTML = '';
  dialogue301InlineStrokeWriter = null;
  dialogue301InlineStrokeChar = '';
  resetDialogue301PopupHistory();
  setDialogue301CurrentPopupView(null);
  document.body.classList.remove('dialogue301-word-popup-open');
}

function renderDialogue301SentenceList(text){
  const rows = parseDialogue301RowsFromTable(text);
  return rows && rows.length ? renderDialogue301SentenceRows(rows) : '';
}

function renderDialogue301SentenceRows(rows){
  if(!Array.isArray(rows) || !rows.length){
    return '';
  }

  return `
    <div class="sentence-card-list">
      ${rows.map((row, index) => `
        <article class="sentence-card">
          <span class="sentence-index">${index + 1}</span>
          <div class="sentence-main">
            <strong>${escapeHtml(row.hanzi)}</strong>
            <span>${escapeHtml(row.pinyin)}</span>
            ${row.meaning ? `<small>${escapeHtml(row.meaning)}</small>` : ''}
          </div>
          <button class="sentence-audio-btn" type="button" aria-label="Nghe câu ${index + 1}">🔊</button>
        </article>
      `).join('')}
    </div>
  `;
}

function renderDialogue301DialogueBlock(text){
  const rows = parseDialogue301RowsFromTable(text);
  if(rows && rows.length){
    return renderDialogue301DialogueRows(rows);
  }

  const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if(!lines.length) return '';

  return `
    <div class="dialogue-chat-list">
      ${lines.map((line, index) => {
        const speaker = index % 2 === 0 ? 'A' : 'B';
        return `
          <article class="dialogue-bubble ${speaker === 'B' ? 'speaker-b' : 'speaker-a'}">
            <span class="dialogue-speaker">${speaker}</span>
            <div class="dialogue-main"><strong>${escapeHtml(line)}</strong></div>
            <button class="dialogue-audio-btn" type="button" aria-label="Nghe lượt thoại ${index + 1}">🔊</button>
          </article>
        `;
      }).join('')}
    </div>
  `;
}

function renderDialogue301DialogueRows(rows){
  if(!Array.isArray(rows) || !rows.length){
    return '';
  }

  return `
    <div class="dialogue-chat-list dialogue301-speaker-list">
      ${rows.map((row, index) => {
        const fallbackSpeaker = index % 2 === 0 ? 'A' : 'B';
        const speakerName = [row.speaker, row.speakerVi].filter(Boolean).join(' · ');
        const speakerMeta = row.speakerPinyin || '';
        return `
          <article class="dialogue-bubble ${index % 2 ? 'speaker-b' : 'speaker-a'}">
            <span class="dialogue-speaker">${escapeHtml(row.speaker ? row.speaker.charAt(0) : fallbackSpeaker)}</span>
            <div class="dialogue-main">
              ${speakerName ? `<div class="dialogue-speaker-name">${escapeHtml(speakerName)}${speakerMeta ? ` <small>${escapeHtml(speakerMeta)}</small>` : ''}</div>` : ''}
              <strong>${escapeHtml(row.hanzi)}</strong>
              <span>${escapeHtml(row.pinyin)}</span>
              ${row.meaning ? `<small>${escapeHtml(row.meaning)}</small>` : ''}
            </div>
            <button class="dialogue-audio-btn" type="button" aria-label="Nghe lượt thoại ${index + 1}">🔊</button>
          </article>
        `;
      }).join('')}
    </div>
  `;
}

function parseDialogue301VocabPairs(text){
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && line.includes('|'));

  if(lines.length < 2){
    return null;
  }

  const cards = [];
  const allPairLines = lines.every(line => {
    const cells = line.split('|').map(cell => cell.trim());
    if(cells.length !== 4){
      return false;
    }

    const firstPairOk = hasChineseText(cells[0]) && isDialogue301PinyinCell(cells[1]);
    const secondPairEmpty = !cells[2] && !cells[3];
    const secondPairOk = hasChineseText(cells[2]) && isDialogue301PinyinCell(cells[3]);

    if(!firstPairOk || (!secondPairEmpty && !secondPairOk)){
      return false;
    }

    cards.push({ hanzi: cells[0], pinyin: cells[1] });

    if(secondPairOk){
      cards.push({ hanzi: cells[2], pinyin: cells[3] });
    }

    return true;
  });

  return allPairLines && cards.length >= 2 ? cards : null;
}

function renderDialogue301VocabGrid(text){
  const cards = parseDialogue301VocabPairs(text);

  if(!cards){
    return '';
  }

  return `
    <div class="vocab-grid">
      ${cards.map(card => `
        <div class="vocab-card">
          <div class="vocab-hanzi">${escapeHtml(card.hanzi)}</div>
          <div class="vocab-pinyin">${escapeHtml(card.pinyin)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function parseDialogue301PipeTable(text){
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const pipeLines = lines.filter(line => line.includes('|'));

  if(pipeLines.length < 2){
    return null;
  }

  const rows = pipeLines.map(line => line.split('|').map(cell => cell.trim()));

  if(rows.some(row => row.length < 3)){
    return null;
  }

  return rows;
}

function isDialogue301HeaderRow(row){
  const text = row.join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return /\bstt\b/.test(text) && text.includes('tieng trung') && text.includes('phien am');
}

function renderDialogue301PipeTable(text){
  const rows = parseDialogue301PipeTable(text);

  if(!rows){
    return '';
  }

  const note = String(text ?? '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.includes('|'))
    .join('\n');
  if(!isDialogue301HeaderRow(rows[0])){
    return '';
  }

  const headRows = rows.slice(0, 1);
  const bodyRows = rows.slice(1);

  return `
    ${note ? `<pre class="dialogue301-table-note">${escapeHtml(note)}</pre>` : ''}
    <div class="lesson-table-wrap dialogue301-table-wrap">
      <table class="lesson-table dialogue301-table">
        ${headRows.length ? `
          <thead>
            ${headRows.map(row => `<tr>${row.map(cell => `<th>${escapeHtml(cell)}</th>`).join('')}</tr>`).join('')}
          </thead>
        ` : ''}
        <tbody>
          ${bodyRows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}



function scrollDialogue301ActiveChipIntoView(selector){
  const active = document.querySelector(selector);
  if(!active || typeof active.scrollIntoView !== 'function') return;
  try{
    active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }catch(_err){
    active.scrollIntoView(false);
  }
}

function bindDialogue301LessonUI(){
  document.querySelectorAll('.dialogue301-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      dialogue301Filter = btn.dataset.filter || 'all';
      applyDialogue301Filter();
      scrollDialogue301ActiveChipIntoView('.dialogue301-filter-btn.active');
    });
  });

  document.querySelectorAll('[data-filter-jump]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nextFilter = btn.getAttribute('data-filter-jump') || btn.dataset.filterJump || 'all';
      dialogue301Filter = nextFilter;
      rerenderDialogue301CurrentLesson();
    });
  });

  document.querySelectorAll('[data-action="expand-dialogue301-overview"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.sectionKey || '';
      if(!key) return;
      dialogue301OverviewExpandedSections.add(key);
      rerenderDialogue301CurrentLesson();
    });
  });

  document.querySelectorAll('[data-action="collapse-dialogue301-overview"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.sectionKey || '';
      if(!key) return;
      dialogue301OverviewExpandedSections.delete(key);
      rerenderDialogue301CurrentLesson();
    });
  });

  document.querySelectorAll('[data-action="toggle-dialogue301-section"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.sectionKey || '';
      if(!key) return;
      if(dialogue301ExpandedSections.has(key)){
        dialogue301ExpandedSections.delete(key);
      }else{
        dialogue301ExpandedSections.add(key);
      }
      rerenderDialogue301CurrentLesson();
    });
  });


  document.querySelectorAll('.vocab-row[data-vocab-row]').forEach(row => {
    row.addEventListener('click', () => {
      openDialogue301WordPopup({
        hanzi: row.dataset.hanzi || '',
        pinyin: row.dataset.pinyin || '',
        meaning: row.dataset.meaning || '',
        type: row.dataset.type || ''
      });
    });
    row.addEventListener('keydown', event => {
      if(event.key === 'Enter' || event.key === ' '){
        event.preventDefault();
        openDialogue301WordPopup({
          hanzi: row.dataset.hanzi || '',
          pinyin: row.dataset.pinyin || '',
          meaning: row.dataset.meaning || '',
          type: row.dataset.type || ''
        });
      }
    });
  });

  document.querySelectorAll('.vocab-audio-btn').forEach(btn => {
    btn.addEventListener('click', event => {
      event.stopPropagation();
      const row = btn.closest('.vocab-row[data-vocab-row]');
      const text = row?.dataset?.hanzi || btn.getAttribute('aria-label')?.replace(/^Nghe\s+/i, '') || '';
      const ok = speakDialogue301ChineseText(text);
      if(!ok) showDialogue301Toast('Không phát được âm');
    });
  });


  applyDialogue301Filter();
}

function rerenderDialogue301CurrentLesson(){
  const contentEl = $('#dialogue301LessonContent');
  if(!contentEl || !dialogue301CurrentData || !dialogue301CurrentLesson) return;
  const scrollY = window.scrollY;
  contentEl.innerHTML = renderDialogue301Lesson(dialogue301CurrentData, dialogue301CurrentLesson);
  bindDialogue301LessonUI();
  requestAnimationFrame(() => window.scrollTo({ top: scrollY }));
}

function applyDialogue301Filter(){
  const available = new Set(['all']);
  document.querySelectorAll('.dialogue301-section').forEach(section => {
    const key = section.dataset.section || '';
    if(key) available.add(key);
  });

  if(!available.has(dialogue301Filter)){
    dialogue301Filter = 'all';
  }

  document.querySelectorAll('.dialogue301-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === dialogue301Filter);
  });

  document.querySelectorAll('.dialogue301-section').forEach(section => {
    const key = section.dataset.section || '';
    if(dialogue301Filter === 'all'){
      section.hidden = false;
    }else{
      section.hidden = key !== dialogue301Filter;
    }

    const secondaryBody = section.querySelector('[data-secondary-body]');
    const accordionHead = section.querySelector('.dialogue301-accordion-head');
    if(secondaryBody){
      const shouldOpen = dialogue301Filter !== 'all' && key === dialogue301Filter;
      const isManualOpen = dialogue301ExpandedSections.has(key);
      secondaryBody.hidden = !(shouldOpen || isManualOpen);
      section.classList.toggle('is-open', shouldOpen || isManualOpen);
      if(accordionHead){
        accordionHead.setAttribute('aria-expanded', shouldOpen || isManualOpen ? 'true' : 'false');
        const em = accordionHead.querySelector('em');
        if(em) em.textContent = (shouldOpen || isManualOpen) ? 'Thu gọn ›' : 'Mở ›';
      }
    }
  });
}


document.addEventListener('keydown', event => {
  if(event.key === 'Escape'){
    closeDialogue301WordPopup();
  }
});

const toneMap = {
  a:['ā','á','ǎ','à'],
  e:['ē','é','ě','è'],
  i:['ī','í','ǐ','ì'],
  o:['ō','ó','ǒ','ò'],
  u:['ū','ú','ǔ','ù'],
  'ü':['ǖ','ǘ','ǚ','ǜ']
};

function normalizeBase(input){
  return (input || '')
    .trim()
    .toLowerCase()
    .replaceAll('u:', 'ü')
    .replaceAll('v', 'ü')
    .replace(/[^a-zü]/g, '');
}

function toneTargetIndex(base){
  if(base.includes('a')) return base.indexOf('a');
  if(base.includes('e')) return base.indexOf('e');
  if(base.includes('ou')) return base.indexOf('o');

  for(let i = base.length - 1; i >= 0; i--){
    if('aeiouü'.includes(base[i])) return i;
  }

  return -1;
}

function markTone(base, tone){
  base = normalizeBase(base);
  const t = Number(tone);

  if(!base) return '—';
  if(![1,2,3,4].includes(t)) return base;

  const idx = toneTargetIndex(base);
  if(idx < 0) return base;

  const ch = base[idx];
  const marked = toneMap[ch]?.[t - 1];

  if(!marked) return base;

  return base.slice(0, idx) + marked + base.slice(idx + 1);
}

function audioCandidates(base, tone){
  base = normalizeBase(base);
  if(!base || !tone) return [];

  const out = [];
  const push = x => {
    if(x && !out.includes(x)) out.push(x);
  };

  push(`${base}${tone}`);

  if(base.includes('ü')){
    push(`${base.replaceAll('ü','v')}${tone}`);
    push(`${base.replaceAll('ü','u')}${tone}`);
  }

  return out;
}

function findAudio(base, tone){
  for(const key of audioCandidates(base, tone)){
    if(audioManifest[key]){
      return {
        key,
        url: audioManifest[key]
      };
    }
  }

  return null;
}

// v3 mobile audio fix
function ensureMobileAudioPlayer(){
  let wrap = document.getElementById("mobileAudioPlayer");

  if(!wrap){
    wrap = document.createElement("div");
    wrap.id = "mobileAudioPlayer";
    wrap.className = "mobile-audio-player";
    wrap.innerHTML = `
      <audio id="sharedAudioPlayer" controls preload="auto" playsinline></audio>
      <div id="sharedAudioMsg" class="audio-msg">Sẵn sàng phát âm.</div>
    `;
    document.body.appendChild(wrap);
  }

  return {
    wrap,
    audio: document.getElementById("sharedAudioPlayer"),
    msg: document.getElementById("sharedAudioMsg")
  };
}

async function playAudioUrl(url){
  if(!url) return;

  const player = ensureMobileAudioPlayer();
  const finalUrl = new URL(url, document.baseURI).href;

  player.wrap.classList.add("show");
  player.msg.textContent = "Đang tải audio...";

  try{
    if(currentAudio && currentAudio !== player.audio){
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }

    currentAudio = player.audio;
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio.src = finalUrl;
    currentAudio.load();

    await currentAudio.play();

    player.msg.textContent = "Đang phát: " + finalUrl.split("/").pop();
  }catch(err){
    console.warn("Audio play failed:", err);
    player.msg.textContent = "Chưa phát được. Hãy bấm nút play trên thanh audio hoặc kiểm tra silent mode/volume.";
  }
}

function renderPinyin(){
  pageTitle.textContent = 'Pinyin';
  pageSubtitle.textContent = 'Giao diện mới theo style Bộ thủ, dùng để học đọc và tra âm Pinyin riêng.';

  pageContent.innerHTML = `
    <div class="listen-grid">
      <article class="card">
        <h3>Âm đang chọn</h3>
        <div class="current-pinyin" id="currentMarked">mā</div>
        <div class="current-raw" id="currentRaw">ma1</div>
        <p id="pinyinStatus" class="status">Sẵn sàng.</p>
      </article>

      <article class="card">
        <h3>Nghe & tra âm</h3>
        <div class="input-row">
          <input id="pinyinInput" value="ma" placeholder="Nhập pinyin: ma, ren, dao, kou..." />
          <div class="tone-buttons">
            <button class="tone-btn active" data-tone="1" type="button">1</button>
            <button class="tone-btn" data-tone="2" type="button">2</button>
            <button class="tone-btn" data-tone="3" type="button">3</button>
            <button class="tone-btn" data-tone="4" type="button">4</button>
          </div>
          <div class="action-row">
            <button id="playPinyinBtn" class="primary-btn" type="button">▶ Nghe</button>
            <button id="stopAudioBtn" class="ghost-btn" type="button">■ Dừng</button>
          </div>
          <div class="chips">
            ${['ma','ba','pa','shi','zhi','zi','ren','dao','li','kou','xue','ju','qu','lü','nü'].map(x => `<button class="chip" data-pinyin="${x}" type="button">${x}</button>`).join('')}
          </div>
        </div>
      </article>
    </div>
  `;

  bindPinyinUI();
}

function updatePinyinPreview(){
  const base = normalizeBase($('#pinyinInput')?.value || 'ma');
  const marked = markTone(base, currentTone);
  const audio = findAudio(base, currentTone);

  $('#currentMarked').textContent = marked;
  $('#currentRaw').textContent = `${base || '—'}${currentTone}`;
  $('#pinyinStatus').textContent = audio ? `Có audio: ${audio.key}.mp3` : 'Chưa tìm thấy audio tương ứng.';
}

function bindPinyinUI(){
  const input = $('#pinyinInput');

  input.addEventListener('input', updatePinyinPreview);

  document.querySelectorAll('.tone-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTone = btn.dataset.tone;
      document.querySelectorAll('.tone-btn').forEach(x => x.classList.toggle('active', x === btn));
      updatePinyinPreview();
    });
  });

  $('#playPinyinBtn').addEventListener('click', () => {
    const base = normalizeBase(input.value);
    const audio = findAudio(base, currentTone);

    if(audio){
      playAudioUrl(audio.url);
      $('#pinyinStatus').textContent = `Đang phát: ${audio.key}.mp3`;
    }else{
      $('#pinyinStatus').textContent = 'Không có file audio cho âm này.';
    }
  });

  $('#stopAudioBtn').addEventListener('click', () => {
    if(currentAudio){
      currentAudio.pause();
      currentAudio.currentTime = 0;
      $('#pinyinStatus').textContent = 'Đã dừng.';
    }
  });

  document.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      input.value = btn.dataset.pinyin;
      updatePinyinPreview();
    });
  });

  updatePinyinPreview();
}

function renderRadicalAudioList(){
  const el = $('#radicalAudioList');

  el.innerHTML = radicalAudio.map(item => `
    <div class="radical-audio-card">
      <div class="radical-char">${escapeHtml(item.char)}</div>
      <div class="radical-main">
        <div class="radical-title">${escapeHtml(item.id)}. ${escapeHtml(item.hanviet)}</div>
        <div class="radical-meta">${escapeHtml(item.pinyin)} · ${escapeHtml(item.meaning || '')}</div>
      </div>
      <button class="audio-btn" type="button" data-audio="${escapeHtml(item.audio || '')}" ${item.has_audio ? '' : 'disabled'} title="${item.has_audio ? 'Nghe' : 'Chưa có audio'}">🔊</button>
    </div>
  `).join('');

  el.querySelectorAll('.audio-btn:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', () => playAudioUrl(btn.dataset.audio));
  });
}


function updateNavActive(page){
  document.querySelectorAll('.bottom-nav-item, .desktop-nav-link, .top-nav-btn, .nav-btn').forEach(item => {
    const itemPage = item.dataset.page || item.dataset.go;
    item.classList.toggle('active', itemPage === page);
  });
}

function renderHomeLookupHistory(){
  const section = document.getElementById('homeRecentLookup');
  const list = document.getElementById('homeRecentLookupList');
  const historyApi = window.TiengTrungLookupHistory;
  if(!section || !list || !historyApi) return;
  const items = historyApi.read().slice(0, 5);
  section.hidden = items.length === 0;
  list.innerHTML = items.map(target => {
    const url = new URL('modules/lookup/index.html', window.location.href);
    url.searchParams.set('q', target);
    return `<a class="home-recent-lookup__chip" href="${url.href}" aria-label="Tra lại ${escapeHtml(target)}">${escapeHtml(target)}</a>`;
  }).join('');
}

function bindHomeLookup(){
  const form = document.getElementById('homeLookupForm');
  const input = document.getElementById('homeLookupInput');
  if(!form || !input) return;

  form.addEventListener('submit', event => {
    event.preventDefault();
    const query = String(input.value || '').trim();
    const url = new URL('modules/lookup/index.html', window.location.href);
    if(query) url.searchParams.set('q', query);
    window.location.href = url.href;
  });

  renderHomeLookupHistory();
  if(!window.__homeLookupHistoryListenerBound){
    window.__homeLookupHistoryListenerBound = true;
    window.addEventListener(window.TiengTrungLookupHistory?.eventName || 'tiengtrung:lookup-history-changed', renderHomeLookupHistory);
  }
}

function bindRootNavigation(){
  // Một bộ điều hướng duy nhất cho cả sidebar, top nav và các nút trong trang chủ.
  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-page], [data-go]');

    if(!trigger){
      return;
    }

    const page = trigger.dataset.page || trigger.dataset.go;

    const validPages = new Set([
      'home',
      'radicals',
      'pinyin',
      'hanziStroke',
      'dialogue301'
    ]);

    if(!validPages.has(page)){
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setPage(page);
  });

  window.addEventListener('hashchange', () => {
    if(location.hash === '#dialogue301'){
      setPage('dialogue301');
    }
  });

  window.addEventListener('popstate', () => {
    if(location.hash !== '#dialogue301' || currentPage !== 'dialogue301' || !dialogue301Lessons.length) return;
    const requestedLessonId = new URLSearchParams(window.location.search).get('lesson') || '';
    const lesson = dialogue301Lessons.find(item => item.lesson_id === requestedLessonId);
    if(lesson && lesson.lesson_id !== dialogue301SelectedId){
      openDialogue301Lesson(lesson, { skipRoute: true });
    }
  });
}

async function loadPinyinAudioData(){
  try{
    const [manifestRes, radicalRes] = await Promise.all([
      fetch('modules/pinyin/data/audio_manifest.json?v=1'),
      fetch('modules/pinyin/data/radical_audio.json?v=1')
    ]);

    if(!manifestRes.ok){
      throw new Error(`audio_manifest.json: ${manifestRes.status} ${manifestRes.statusText}`);
    }

    if(!radicalRes.ok){
      throw new Error(`radical_audio.json: ${radicalRes.status} ${radicalRes.statusText}`);
    }

    const manifestData = await manifestRes.json();
    const radicalData = await radicalRes.json();

    audioManifest = manifestData.audio || {};
    radicalAudio = radicalData.items || [];
  }catch(err){
    console.warn('Không tải được dữ liệu audio Pinyin. App vẫn chạy, chỉ phần audio có thể thiếu.', err);
    audioManifest = {};
    radicalAudio = [];
  }
}

async function init(){
  bindRootNavigation();
  window.addEventListener('tiengtrung:learning-history-changed', renderHomeResume);
  window.addEventListener('pageshow', renderHomeResume);

  setPage(location.hash === '#dialogue301' ? 'dialogue301' : 'home');

  await loadPinyinAudioData();
}

init().catch(err => {
  console.error(err);
});


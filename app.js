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
let dialogue301VisibleSlideCount = 6;
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
  ['practice', 'Luyện tập'],
  ['slides', 'Slide']
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
    window.location.href = 'modules/hanzi-stroke/index.html';
    return;
  }
  updateNavActive(page);

  if(page === 'home') renderHome();
  if(page === 'radicals') renderRadicals();

  if(page === 'dialogue301') renderDialogue301();
}

function renderHome(){
  pageTitle.textContent = 'Tiếng Trung';
  pageSubtitle.textContent = 'Pinyin · Bút thuận · Bộ thủ · 301 Đàm thoại';
  pageContent.innerHTML = homePageContent;
  updateNavActive('home');
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
  pageSubtitle.textContent = 'Từ vựng · Câu mẫu · Hội thoại · Slide';
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
    await openDialogue301Lesson(lessons[0]);
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

async function openDialogue301Lesson(lesson){
  if(!lesson) return;

  dialogue301SelectedId = lesson.lesson_id;
  dialogue301Filter = 'all';
  dialogue301ExpandedSections = new Set();
  dialogue301OverviewExpandedSections = new Set();
  dialogue301VisibleSlideCount = 6;
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
  const lessonDir = getDialogue301LessonDir(data, lesson);
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

  const slides = getDialogue301MediaItems(data, 'slides');
  const videos = getDialogue301MediaItems(data, 'videos');
  const slidesHtml = renderDialogue301MediaSection('slides', 'Slide gốc', slides, lessonDir, getDialogue301MediaBasePath(data, 'slides'));
  const videosHtml = renderDialogue301VideoSection(videos, lessonDir, getDialogue301MediaBasePath(data, 'videos'));
  const availableFilters = new Set(['all', ...sectionEntries.map(entry => entry.key)]);

  if(slidesHtml){
    availableFilters.add('slides');
  }

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
    ${videosHtml}
    ${slidesHtml}
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
  const slide = item && typeof item === 'object' ? item.slide : '';
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

  const relatedHtml = related.length ? `
    <section class="dialogue301-word-section">
      <h4>Từ liên quan trong bài</h4>
      <div class="dialogue301-word-related-list">
        ${related.map(item => `
          <div class="dialogue301-word-related-item">
            <strong>${escapeHtml(item.hanzi)}</strong>
            <span>${escapeHtml(item.pinyin)}</span>
            <small>${escapeHtml(item.meaning || '')}</small>
          </div>
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
        <div class="dialogue301-word-hanzi">${escapeHtml(word.hanzi || '')}</div>
        ${word.pinyin ? `<div class="dialogue301-word-pinyin">${escapeHtml(word.pinyin)}</div>` : ''}
        ${word.meaning ? `<div class="dialogue301-word-meaning">${escapeHtml(word.meaning)}</div>` : ''}
        <button class="dialogue301-word-audio" type="button" aria-label="Nghe ${escapeHtml(word.hanzi || word.pinyin || '')}">🔊 Nghe</button>
      </div>
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

function openDialogue301WordPopup(word){
  if(!word || (!word.hanzi && !word.pinyin && !word.meaning)) return;
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
      event.stopPropagation();
      const text = word.hanzi || word.pinyin || '';
      if(text){
        console.info('Dialogue 301 word audio placeholder:', text);
      }
    });
  }
}

function closeDialogue301WordPopup(){
  const root = document.getElementById('dialogue301WordPopupRoot');
  if(root) root.innerHTML = '';
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

function renderDialogue301MediaSection(type, label, items, lessonDir, basePath){
  if(!Array.isArray(items) || !items.length || !lessonDir){
    return '';
  }

  if(type !== 'slides'){
    return '';
  }

  const visibleCount = Math.min(dialogue301VisibleSlideCount || 6, items.length);
  const visibleItems = items.slice(0, visibleCount);
  const remainingCount = Math.max(0, items.length - visibleCount);

  return `
    <section class="card dialogue301-section dialogue301-slide-section" data-section="slides">
      <div class="dialogue301-section-head">
        <h3>${escapeHtml(label)}</h3>
        <p>Slide được xuất thành PNG nên là ảnh tĩnh, không chạy animation PowerPoint. Đang hiện ${escapeHtml(visibleCount)}/${escapeHtml(items.length)} slide.</p>
      </div>
      <div class="dialogue301-slide-gallery">
        ${visibleItems.map((item, index) => {
          const src = joinUrlPath(basePath || dialogue301BasePath || 'lessons-301-v2', lessonDir, item);
          return `
            <figure class="dialogue301-media-card">
              <button class="dialogue301-slide-open" type="button" data-src="${escapeHtml(src)}" aria-label="Phóng to slide ${index + 1}">
                <img src="${escapeHtml(src)}" alt="${escapeHtml(label)} ${index + 1}" loading="lazy" />
              </button>
              <figcaption>Slide ${index + 1}</figcaption>
            </figure>
          `;
        }).join('')}
      </div>
      ${remainingCount ? `<button class="dialogue301-inline-more dialogue301-slide-more" type="button" data-action="show-more-dialogue301-slides">+ Xem thêm ${escapeHtml(Math.min(6, remainingCount))} slide</button>` : ''}
    </section>
  `;
}

function dialogue301MediaUrl(item, lessonDir, basePath){
  const src = typeof item === 'string' ? item : (item?.src || item?.url || item?.path || '');
  if(!src) return '';
  if(/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('/')){
    return src;
  }
  return joinUrlPath(basePath || dialogue301BasePath || 'lessons-301-v2', lessonDir, src);
}

function renderDialogue301VideoSection(videos, lessonDir, basePath){
  if(!Array.isArray(videos) || !videos.length || !lessonDir){
    return '';
  }

  return `
    <section class="card dialogue301-section dialogue301-video-section" data-section="slides">
      <div class="dialogue301-section-head">
        <h3>Video / animation</h3>
        <p>Media động nếu dữ liệu bài học có field videos.</p>
      </div>
      <div class="dialogue301-video-grid">
        ${videos.map((item, index) => {
          const src = dialogue301MediaUrl(item, lessonDir, basePath);
          const title = typeof item === 'object' ? (item.title || item.name || `Video ${index + 1}`) : `Video ${index + 1}`;
          const poster = typeof item === 'object' && item.poster ? dialogue301MediaUrl(item.poster, lessonDir, basePath) : '';
          if(!src) return '';

          return `
            <figure class="dialogue301-media-card">
              <video controls preload="metadata" ${poster ? `poster="${escapeHtml(poster)}"` : ''}>
                <source src="${escapeHtml(src)}" />
              </video>
              <figcaption>${escapeHtml(title)}</figcaption>
            </figure>
          `;
        }).join('')}
      </div>
    </section>
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

  document.querySelectorAll('[data-action="show-more-dialogue301-slides"]').forEach(btn => {
    btn.addEventListener('click', () => {
      dialogue301VisibleSlideCount += 6;
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
    });
  });

  document.querySelectorAll('.dialogue301-slide-open').forEach(btn => {
    btn.addEventListener('click', () => openDialogue301Lightbox(btn.dataset.src));
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
      section.hidden = key === 'slides';
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

function openDialogue301Lightbox(src){
  if(!src) return;

  let overlay = document.getElementById('dialogue301Lightbox');
  if(!overlay){
    overlay = document.createElement('div');
    overlay.id = 'dialogue301Lightbox';
    overlay.className = 'dialogue301-lightbox';
    overlay.innerHTML = `
      <button class="dialogue301-lightbox-close" type="button" aria-label="Đóng">×</button>
      <img alt="Slide phóng to" />
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', e => {
      if(e.target === overlay || e.target.closest('.dialogue301-lightbox-close')){
        overlay.classList.remove('show');
      }
    });

    document.addEventListener('keydown', e => {
      if(e.key === 'Escape'){
        overlay.classList.remove('show');
      }
    });
  }

  overlay.querySelector('img').src = src;
  overlay.classList.add('show');
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

  setPage(location.hash === '#dialogue301' ? 'dialogue301' : 'home');

  await loadPinyinAudioData();
}

init().catch(err => {
  console.error(err);
});


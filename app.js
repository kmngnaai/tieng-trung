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

const pageTitle = $('#pageTitle');
const pageSubtitle = $('#pageSubtitle');
const pageContent = $('#pageContent');

const DIALOGUE301_BASE_CANDIDATES = (() => {
  const path = window.location.pathname.replace(/\/+$/g, '');
  return path.endsWith('/tieng-trung-web') || path.includes('/tieng-trung-web/')
    ? ['../lessons-301', 'lessons-301']
    : ['lessons-301', '../lessons-301'];
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

function setPage(page){
  currentPage = page;
  document.body.classList.toggle('is-dialogue301', page === 'dialogue301');
  if(page === 'dialogue301' && location.hash !== '#dialogue301'){
    history.replaceState(null, '', '#dialogue301');
  }else if(page !== 'dialogue301' && location.hash === '#dialogue301'){
    history.replaceState(null, '', location.pathname + location.search);
  }

  // PATCH_V7_RADICALS_SAME_TAB_FULL_PAGE
  // Bộ thủ là app đầy đủ riêng, mở cùng tab để giữ layout đẹp.
  if(page === 'radicals'){
    window.location.href = 'modules/bo-thu-50/index.html';
    return;
  }
  document.querySelectorAll('.nav-btn, .top-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });

  if(page === 'home') renderHome();
  if(page === 'radicals') renderRadicals();
  if(page === 'pinyin') renderPinyin();
  if(page === 'dialogue301') renderDialogue301();
}

function renderHome(){
  pageTitle.textContent = 'Trang chủ';
  pageSubtitle.textContent = 'Nền tảng chung để mở rộng từ Bộ thủ 50 sang Pinyin và bài học.';

  pageContent.innerHTML = `
    <div class="grid three">
      <article class="card">
        <h3>Bộ thủ 50</h3>
        <p>Mở Bộ thủ 50 ở cùng tab, giữ nguyên giao diện rộng đẹp như bản ban đầu.</p>
        <button class="primary-btn" type="button" data-go="radicals">Mở Bộ thủ</button>
      </article>
      <article class="card">
        <h3>Pinyin</h3>
        <p>Module phát âm mới dùng audio Kimma local, có thể dùng chung để đọc tên bộ thủ.</p>
        <button class="primary-btn" type="button" data-go="pinyin">Mở Pinyin</button>
      </article>
      <article class="card">
        <h3>301 Đàm thoại</h3>
        <p>Danh sách 10 bài đầu, đọc trực tiếp từ dữ liệu PPT đã tách sẵn trong lessons-301.</p>
        <button class="primary-btn" type="button" data-go="dialogue301">Mở 301</button>
      </article>
      <article class="card">
        <h3>Hướng phát triển</h3>
        <p>Sau v1 có thể thêm bài học theo ngày, từ vựng, mẫu câu, quiz và ôn tập.</p>
      </article>
    </div>
  `;

  pageContent.querySelectorAll('[data-go]').forEach(btn => {
    btn.addEventListener('click', () => setPage(btn.dataset.go));
  });
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

  throw new Error(`Không tải được lessons-301/lessons.json. ${errors.join(' | ')}`);
}

async function renderDialogue301(){
  pageTitle.textContent = '301 Đàm thoại';
  pageSubtitle.textContent = 'Danh sách bài và nội dung trích từ PPT: từ vựng, câu mẫu, hội thoại, chú thích, luyện tập và slide ảnh tĩnh.';
  pageContent.innerHTML = `
    <div class="card">
      <h3>Đang tải danh sách bài...</h3>
      <p class="status">Đọc dữ liệu từ lessons-301/lessons.json.</p>
    </div>
  `;

  try{
    const lessons = await loadDialogue301Lessons();
    if(currentPage !== 'dialogue301') return;

    pageContent.innerHTML = `
      <div class="dialogue301-view">
        <section class="card dialogue301-lesson-panel">
          <div>
            <div class="eyebrow">301 Đàm thoại</div>
            <h3>Chọn bài học</h3>
          </div>
          <div class="dialogue301-lessons" id="dialogue301LessonList"></div>
        </section>
        <div class="dialogue301-content" id="dialogue301LessonContent"></div>
      </div>
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

  listEl.innerHTML = lessons.map(lesson => `
    <button class="dialogue301-lesson-btn" type="button" data-lesson-id="${escapeHtml(lesson.lesson_id)}">
      <span>Bài ${escapeHtml(lesson.lesson_no)}</span>
      <strong>${escapeHtml(lesson.title)}</strong>
    </button>
  `).join('');

  listEl.querySelectorAll('.dialogue301-lesson-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const lesson = lessons.find(item => item.lesson_id === btn.dataset.lessonId);
      if(lesson){
        openDialogue301Lesson(lesson);
      }
    });
  });
}

function updateDialogue301ActiveLesson(){
  document.querySelectorAll('.dialogue301-lesson-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lessonId === dialogue301SelectedId);
  });
}

async function openDialogue301Lesson(lesson){
  if(!lesson) return;

  dialogue301SelectedId = lesson.lesson_id;
  dialogue301Filter = 'all';
  updateDialogue301ActiveLesson();

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
    const data = await fetchJson(dataUrl);
    if(currentPage !== 'dialogue301') return;

    dialogue301SelectedId = data.lesson_id || lesson.lesson_id;
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
  const sections = data.sections || {};
  const sectionHtml = DIALOGUE301_SECTIONS
    .map(([key, label]) => renderDialogue301Section(key, label, sections[key]))
    .join('');
  const slidesHtml = renderDialogue301MediaSection('slides', 'Slide gốc / ảnh tĩnh', data.slides, lessonDir);
  const videosHtml = renderDialogue301VideoSection(data.videos, lessonDir);

  return `
    <article class="dialogue301-lesson-head">
      <div>
        <div class="eyebrow">Bài ${escapeHtml(data.lesson_no || lesson?.lesson_no || '')}</div>
        <h3>${escapeHtml(data.title || lesson?.title || '301 Đàm thoại')}</h3>
        ${data.source_file ? `<p>Nguồn: ${escapeHtml(data.source_file)}</p>` : ''}
      </div>
      ${data.slide_count ? `<div class="dialogue301-count">${escapeHtml(data.slide_count)} slide</div>` : ''}
    </article>
    <div class="dialogue301-filter-tabs" aria-label="Lọc nội dung bài">
      ${DIALOGUE301_FILTERS.map(([key, label]) => `
        <button class="dialogue301-filter-btn ${dialogue301Filter === key ? 'active' : ''}" type="button" data-filter="${escapeHtml(key)}">
          ${escapeHtml(label)}
        </button>
      `).join('')}
    </div>
    ${sectionHtml || '<div class="card"><p>Chưa có nội dung chữ cho bài này.</p></div>'}
    ${videosHtml}
    ${slidesHtml}
  `;
}

function renderDialogue301Section(key, label, items){
  if(!Array.isArray(items) || !items.length){
    return '';
  }

  const blocks = items
    .map(item => renderDialogue301TextBlock(item))
    .filter(Boolean)
    .join('');

  if(!blocks){
    return '';
  }

  return `
    <section class="card dialogue301-section" data-section="${escapeHtml(key)}">
      <h3>${escapeHtml(label)}</h3>
      <div class="dialogue301-blocks">
        ${blocks}
      </div>
    </section>
  `;
}

function renderDialogue301TextBlock(item){
  const slide = item && typeof item === 'object' ? item.slide : '';
  const text = cleanLessonText(item && typeof item === 'object' ? (item.text || '') : item);

  if(!text){
    return '';
  }

  const vocabHtml = renderDialogue301VocabGrid(text);
  const tableHtml = vocabHtml ? '' : renderDialogue301PipeTable(text);

  return `
    <article class="dialogue301-text-block">
      ${slide ? `<div class="dialogue301-slide-tag">Slide ${escapeHtml(slide)}</div>` : ''}
      ${vocabHtml || tableHtml || `<pre>${escapeHtml(text)}</pre>`}
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

function renderDialogue301MediaSection(type, label, items, lessonDir){
  if(!Array.isArray(items) || !items.length || !lessonDir){
    return '';
  }

  if(type !== 'slides'){
    return '';
  }

  return `
    <section class="card dialogue301-section dialogue301-slide-section" data-section="slides">
      <div class="dialogue301-section-head">
        <h3>${escapeHtml(label)}</h3>
        <p>Slide được xuất thành PNG nên là ảnh tĩnh, không chạy animation PowerPoint.</p>
      </div>
      <div class="dialogue301-slide-gallery">
        ${items.map((item, index) => {
          const src = joinUrlPath(dialogue301BasePath || 'lessons-301', lessonDir, item);
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
    </section>
  `;
}

function dialogue301MediaUrl(item, lessonDir){
  const src = typeof item === 'string' ? item : (item?.src || item?.url || item?.path || '');
  if(!src) return '';
  if(/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('/')){
    return src;
  }
  return joinUrlPath(dialogue301BasePath || 'lessons-301', lessonDir, src);
}

function renderDialogue301VideoSection(videos, lessonDir){
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
          const src = dialogue301MediaUrl(item, lessonDir);
          const title = typeof item === 'object' ? (item.title || item.name || `Video ${index + 1}`) : `Video ${index + 1}`;
          const poster = typeof item === 'object' && item.poster ? dialogue301MediaUrl(item.poster, lessonDir) : '';
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

function bindDialogue301LessonUI(){
  document.querySelectorAll('.dialogue301-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      dialogue301Filter = btn.dataset.filter || 'all';
      applyDialogue301Filter();
    });
  });

  document.querySelectorAll('.dialogue301-slide-open').forEach(btn => {
    btn.addEventListener('click', () => openDialogue301Lightbox(btn.dataset.src));
  });

  applyDialogue301Filter();
}

function applyDialogue301Filter(){
  document.querySelectorAll('.dialogue301-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === dialogue301Filter);
  });

  document.querySelectorAll('.dialogue301-section').forEach(section => {
    const key = section.dataset.section || '';
    section.hidden = dialogue301Filter !== 'all' && key !== dialogue301Filter;
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

async function init(){
  const [manifestRes, radicalRes] = await Promise.all([
    fetch('modules/pinyin/data/audio_manifest.json?v=1'),
    fetch('modules/pinyin/data/radical_audio.json?v=1')
  ]);

  const manifestData = await manifestRes.json();
  const radicalData = await radicalRes.json();

  audioManifest = manifestData.audio || {};
  radicalAudio = radicalData.items || [];

  document.querySelectorAll('.nav-btn, .top-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => setPage(btn.dataset.page));
  });

  window.addEventListener('hashchange', () => {
    if(location.hash === '#dialogue301'){
      setPage('dialogue301');
    }
  });

  setPage(location.hash === '#dialogue301' ? 'dialogue301' : 'home');
}

init().catch(err => {
  console.error(err);
  pageContent.innerHTML = `<div class="card"><h3>Lỗi tải dữ liệu</h3><p>${escapeHtml(err.message)}</p></div>`;
});


// v4 audio debug + robust play override
function ensureMobileAudioPlayer(){
  let wrap = document.getElementById("mobileAudioPlayer");

  if(!wrap){
    wrap = document.createElement("div");
    wrap.id = "mobileAudioPlayer";
    wrap.className = "mobile-audio-player";
    wrap.innerHTML = `
      <audio id="sharedAudioPlayer" controls preload="metadata" playsinline></audio>
      <div id="sharedAudioMsg" class="audio-msg">Sẵn sàng phát âm.</div>
      <a id="sharedAudioLink" class="audio-debug-link" href="#" target="_blank" rel="noopener">Mở file audio</a>
      <div id="sharedAudioUrl" class="audio-file-url"></div>
    `;
    document.body.appendChild(wrap);
  }

  return {
    wrap,
    audio: document.getElementById("sharedAudioPlayer"),
    msg: document.getElementById("sharedAudioMsg"),
    link: document.getElementById("sharedAudioLink"),
    urlText: document.getElementById("sharedAudioUrl")
  };
}

async function playAudioUrl(url){
  if(!url) return;

  const player = ensureMobileAudioPlayer();
  const finalUrl = new URL(url, document.baseURI).href;

  player.wrap.classList.add("show");
  player.link.href = finalUrl;
  player.urlText.textContent = finalUrl;
  player.msg.textContent = "Đang tải audio...";

  if(currentAudio && currentAudio !== player.audio){
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }

  currentAudio = player.audio;

  currentAudio.onerror = () => {
    player.msg.textContent = "Không tải được file audio. Bấm 'Mở file audio' để kiểm tra đường dẫn.";
  };

  currentAudio.onloadedmetadata = () => {
    const d = Number.isFinite(currentAudio.duration) ? currentAudio.duration.toFixed(2) : "?";
    player.msg.textContent = "Đã tải audio, thời lượng: " + d + " giây.";
  };

  currentAudio.onplay = () => {
    player.msg.textContent = "Đang phát: " + finalUrl.split("/").pop();
  };

  currentAudio.onended = () => {
    player.msg.textContent = "Đã phát xong: " + finalUrl.split("/").pop();
  };

  try{
    currentAudio.pause();
    currentAudio.removeAttribute("src");
    currentAudio.load();

    currentAudio.src = finalUrl + (finalUrl.includes("?") ? "&" : "?") + "v=" + Date.now();
    currentAudio.load();

    await currentAudio.play();
  }catch(err){
    console.warn("Audio play failed:", err);
    player.msg.textContent = "Trình duyệt chưa cho phát tự động. Hãy bấm nút play trên thanh audio.";
  }
}

/* PATCH_V6_EMBED_ONLY_NO_NEW_TAB
   Ép module nội bộ không mở tab mới và ẩn nút mở trực tiếp.
*/
(function () {
  const INTERNAL_RE = /modules\/(bo-thu-50|pinyin)/i;
  const HIDE_TEXTS = [
    '',
    '',
    'Mở ở tab mới',
    'Mở tab mới',
    'Open in same tab',
    'Open in new tab',
    'Open full screen'
  ];

  function isInternalUrl(url) {
    return typeof url === 'string' && INTERNAL_RE.test(url);
  }

  const originalOpen = window.open;
  window.open = function (url, target, features) {
    if (isInternalUrl(url)) {
      window.location.href = url;
      return null;
    }
    return originalOpen ? originalOpen.apply(window, arguments) : null;
  };

  function cleanOpenButtons() {
    document.querySelectorAll('a[target="_blank"]').forEach(function (a) {
      const href = a.getAttribute('href') || '';
      if (isInternalUrl(href)) {
        a.setAttribute('target', '_self');
        a.removeAttribute('rel');
      }
    });

    document.querySelectorAll('a, button').forEach(function (el) {
      const text = (el.textContent || '').trim();
      if (HIDE_TEXTS.some(function (w) { return w && text.includes(w); })) {
        el.remove();
      }
    });

    document.querySelectorAll('p, div, span').forEach(function (el) {
      const text = (el.textContent || '').trim();
      if (!text) return;
      if (/mở trực tiếp|toàn màn hình/i.test(text) && el.querySelectorAll('a, button').length === 0) {
        el.textContent = '';
      }
    });
  }

  document.addEventListener('click', function (e) {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (isInternalUrl(href) && a.getAttribute('target') === '_blank') {
      e.preventDefault();
      window.location.href = href;
    }
  }, true);

  document.addEventListener('DOMContentLoaded', cleanOpenButtons);
  window.addEventListener('load', cleanOpenButtons);
  setTimeout(cleanOpenButtons, 200);
  setTimeout(cleanOpenButtons, 1000);
  setTimeout(cleanOpenButtons, 2500);
})();

/* PATCH_V8_CARD_CLICK_SAME_TAB
   Bắt click card/sidebar ở trang chính và mở module full page trong cùng tab.
*/
(function () {
  function normalizeText(s) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function openSameTab(url) {
    if (!url) return;
    window.location.href = url;
  }

  function isDialogue301Target(target) {
    return target?.closest?.('[data-go="dialogue301"], [data-page="dialogue301"], .dialogue301-view');
  }

  function isRootTopNavTarget(target) {
    return target?.closest?.('.root-top-nav');
  }

  function routeFromElement(el) {
    if (!el) return '';

    const href = el.getAttribute && (el.getAttribute('href') || '');
    const dataPage = el.getAttribute && (el.getAttribute('data-page') || el.dataset?.page || '');
    const dataModule = el.getAttribute && (el.getAttribute('data-module') || el.dataset?.module || '');
    const txt = normalizeText(el.textContent || el.innerText || '');

    if (/modules\/bo-thu-50/i.test(href)) return 'modules/bo-thu-50/index.html';
    if (/modules\/pinyin/i.test(href)) return 'modules/pinyin/index.html';

    if (/radicals|bo-thu-50|bo thu 50/i.test(dataPage + ' ' + dataModule)) {
      return 'modules/bo-thu-50/index.html';
    }

    if (/pinyin/i.test(dataPage + ' ' + dataModule)) {
      return 'modules/pinyin/index.html';
    }

    if (txt.includes('bo thu 50') || txt.includes('50 bo thu')) {
      return 'modules/bo-thu-50/index.html';
    }

    // Sidebar nút "Bộ thủ 50"
    if (txt === 'bo thu 50' || txt === 'bo thu') {
      return 'modules/bo-thu-50/index.html';
    }

    if (txt === 'pinyin' || txt.startsWith('pinyin ') || txt.includes(' phat am pinyin')) {
      return 'modules/pinyin/index.html';
    }

    return '';
  }

  function findClickableRouteTarget(start) {
    let el = start;
    for (let i = 0; el && i < 8; i += 1, el = el.parentElement) {
      if (!(el instanceof Element)) continue;
      const route = routeFromElement(el);
      if (route) return { el, route };
    }
    return null;
  }

  function cleanupRootUi() {
    // Xóa nút/link rỗng còn sót từ patch trước ở trang chủ.
    document.querySelectorAll('button, a').forEach(function (el) {
      const txt = (el.textContent || '').trim();
      const aria = (el.getAttribute('aria-label') || '').trim();
      const title = (el.getAttribute('title') || '').trim();
      const href = (el.getAttribute('href') || '').trim();

      if (!txt && !aria && !title && !href) {
        el.remove();
      }
    });

    // Biến các card có chữ Bộ thủ/Pinyin thành clickable cho rõ.
    document.querySelectorAll('div, article, section').forEach(function (el) {
      const route = routeFromElement(el);
      if (!route) return;

      const txt = normalizeText(el.textContent || '');
      if (txt.includes('bo thu 50') || txt.includes('pinyin')) {
        el.classList.add('js-module-card-clickable');
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.dataset.moduleHref = route;
      }
    });
  }

  document.addEventListener('click', function (e) {
    if (isRootTopNavTarget(e.target)) return;
    if (isDialogue301Target(e.target)) return;

    const hit = findClickableRouteTarget(e.target);
    if (!hit) return;

    e.preventDefault();
    e.stopPropagation();
    openSameTab(hit.route);
  }, true);

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (isRootTopNavTarget(e.target)) return;
    if (isDialogue301Target(e.target)) return;

    const hit = findClickableRouteTarget(e.target);
    if (!hit) return;

    e.preventDefault();
    openSameTab(hit.route);
  }, true);

  document.addEventListener('DOMContentLoaded', cleanupRootUi);
  window.addEventListener('load', cleanupRootUi);
  setTimeout(cleanupRootUi, 200);
  setTimeout(cleanupRootUi, 1000);
})();

/* PATCH_PINYIN_MODULE_V11_LINK
   Click Pinyin ở root app mở module Pinyin full page trong cùng tab.
*/
(function () {
  function norm(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  document.addEventListener('click', function (e) {
    let el = e.target;
    for (let i = 0; el && i < 7; i++, el = el.parentElement) {
      const txt = norm(el.textContent || '');
      const dataPage = norm((el.dataset && (el.dataset.page || el.dataset.module)) || '');
      if (txt === 'pinyin' || txt.includes('pinyin module') || dataPage === 'pinyin') {
        e.preventDefault();
        e.stopPropagation();
        window.location.href = 'modules/pinyin/index.html';
        return;
      }
    }
  }, true);
})();

/* PATCH_PINYIN_MODULE_V12_LINK
   Click Pinyin ở root app mở module Pinyin full page trong cùng tab.
*/
(function () {
  function norm(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }
  document.addEventListener('click', function (e) {
    let el = e.target;
    for (let i = 0; el && i < 7; i++, el = el.parentElement) {
      const txt = norm(el.textContent || '');
      const dataPage = norm((el.dataset && (el.dataset.page || el.dataset.module)) || '');
      if (txt === 'pinyin' || txt.includes('pinyin module') || dataPage === 'pinyin') {
        e.preventDefault();
        e.stopPropagation();
        window.location.href = 'modules/pinyin/index.html';
        return;
      }
    }
  }, true);
})();

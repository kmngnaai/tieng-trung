const $ = s => document.querySelector(s);

let audioManifest = {};
let radicalAudio = [];
let currentTone = '1';
let currentAudio = null;

const pageTitle = $('#pageTitle');
const pageSubtitle = $('#pageSubtitle');
const pageContent = $('#pageContent');

function escapeHtml(s){
  return (s || '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#039;'
  }[ch]));
}

function setPage(page){

  // PATCH_V7_RADICALS_SAME_TAB_FULL_PAGE
  // Bộ thủ là app đầy đủ riêng, mở cùng tab để giữ layout đẹp.
  if(page === 'radicals'){
    window.location.href = 'modules/bo-thu-50/index.html';
    return;
  }
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });

  if(page === 'home') renderHome();
  if(page === 'radicals') renderRadicals();
  if(page === 'pinyin') renderPinyin();
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

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => setPage(btn.dataset.page));
  });

  renderHome();
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
      if (HIDE_TEXTS.some(function (w) { return text.includes(w); })) {
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
    const hit = findClickableRouteTarget(e.target);
    if (!hit) return;

    e.preventDefault();
    e.stopPropagation();
    openSameTab(hit.route);
  }, true);

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
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

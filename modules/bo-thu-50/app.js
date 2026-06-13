let lessons=[];
let legacy=[];
let current=null;
let currentLegacy=null;
let currentMode='lesson';
let activeTab='overview';
let showFavOnly=false;

const state={
  favs:new Set(JSON.parse(localStorage.getItem('boThuFavs')||'[]')),
  learned:new Set(JSON.parse(localStorage.getItem('boThuLearned')||'[]'))
};

const $=s=>document.querySelector(s);
const listEl=$('#lessonList');
const tabContent=$('#tabContent');

function saveState(){
  localStorage.setItem('boThuFavs',JSON.stringify([...state.favs]));
  localStorage.setItem('boThuLearned',JSON.stringify([...state.learned]));
}

function normalizeText(s){
  return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}

function escapeHtml(s){
  return (s||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
}

function inline(s){
  return escapeHtml(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/`(.+?)`/g,'<code>$1</code>');
}

function mdToHtml(md){
  if(!md)return '';
  const lines=md.split(/\r?\n/);
  let out=[],inCode=false,code=[],table=[];

  const flushTable=()=>{
    if(!table.length)return;
    const rows=table
      .filter(line=>! /^\|\s*-/.test(line.trim()))
      .map(line=>line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(c=>c.trim()));

    if(rows.length){
      out.push('<table>');
      rows.forEach((cells,i)=>{
        out.push('<tr>'+cells.map(c=>i===0?`<th>${inline(c)}</th>`:`<td>${inline(c)}</td>`).join('')+'</tr>');
      });
      out.push('</table>');
    }
    table=[];
  };

  const flushCode=()=>{
    out.push(`<pre>${escapeHtml(code.join('\n'))}</pre>`);
    code=[];
  };

  for(const line of lines){
    if(line.startsWith('```')){
      flushTable();
      if(inCode){flushCode();inCode=false;}else{inCode=true;code=[];}
      continue;
    }

    if(inCode){code.push(line);continue;}

    if(line.trim().startsWith('|')){
      table.push(line);
      continue;
    }

    flushTable();

    if(/^###\s+/.test(line))out.push(`<h3>${inline(line.replace(/^###\s+/,''))}</h3>`);
    else if(/^##\s+/.test(line))out.push(`<h2>${inline(line.replace(/^##\s+/,''))}</h2>`);
    else if(/^#\s+/.test(line))out.push(`<h1>${inline(line.replace(/^#\s+/,''))}</h1>`);
    else if(/^\-\s+/.test(line))out.push(`<p>• ${inline(line.replace(/^\-\s+/,''))}</p>`);
    else if(line.trim())out.push(`<p>${inline(line)}</p>`);
  }

  flushTable();
  if(inCode)flushCode();
  return out.join('\n');
}

function section(n){
  return current?.sections?.[String(n)]?.markdown || '';
}

function setMode(mode,id){
  currentMode=mode;
  document.body.classList.toggle('legacy-mode',mode==='legacy');

  $('#lessonModeBtn').classList.toggle('active',mode==='lesson');
  $('#legacyModeBtn').classList.toggle('active',mode==='legacy');

  const targetId=id || current?.id || currentLegacy?.id || '01';
  current=lessons.find(l=>l.id===targetId) || lessons[0];
  currentLegacy=legacy.find(r=>r.id===targetId) || legacy[0];

  renderList();
  renderHeader();
  renderTab();
}

function selectLesson(id){
  current=lessons.find(l=>l.id===id)||lessons[0];
  currentLegacy=legacy.find(r=>r.id===id)||legacy[0];
  renderList();
  renderHeader();
  renderTab();
}

function renderList(){
  const q=normalizeText($('#searchInput').value);

  if(currentMode==='legacy'){
    const filtered=legacy.filter(r=>{
      if(showFavOnly&&!state.favs.has(r.id))return false;
      const hay=normalizeText([r.id,r.radical_original,r.strokes,r.reading,(r.examples||[]).join(' ')].join(' '));
      return hay.includes(q);
    });

    listEl.innerHTML=filtered.map(r=>{
      const firstChar=(r.radical_original.match(/[\u3400-\u9fff⺀-⻿]/)||[''])[0];
      return `<button class="lesson-item ${currentLegacy?.id===r.id?'active':''}" data-id="${r.id}">
        <span class="lesson-no">${r.id}</span>
        <span class="lesson-char">${escapeHtml(firstChar)}</span>
        <span class="lesson-text">
          <span class="lesson-title-row">
            <span class="lesson-name">${escapeHtml(r.radical_original)}</span>
            <span class="lesson-pinyin">${escapeHtml(r.strokes)} nét</span>
          </span>
          <span class="lesson-meaning">${escapeHtml(r.reading)}</span>
        </span>
      </button>`;
    }).join('') || '<div class="empty">Không tìm thấy dòng phù hợp.</div>';

    listEl.querySelectorAll('.lesson-item').forEach(btn=>btn.addEventListener('click',()=>selectLesson(btn.dataset.id)));
    return;
  }

  const filtered=lessons.filter(l=>{
    if(showFavOnly&&!state.favs.has(l.id))return false;
    const hay=normalizeText([l.id,l.char,l.radical,l.hanviet,l.pinyin,l.meaning,l.title].join(' '));
    return hay.includes(q);
  });

  listEl.innerHTML=filtered.map(l=>`<button class="lesson-item ${current?.id===l.id?'active':''}" data-id="${l.id}">
    <span class="lesson-no">${l.id}</span>
    <span class="lesson-char">${escapeHtml(l.char)}</span>
    <span class="lesson-text">
      <span class="lesson-title-row">
        <span class="lesson-name">${escapeHtml(l.hanviet)}</span>
        <span class="lesson-pinyin">${escapeHtml(l.pinyin)}</span>
      </span>
      <span class="lesson-meaning">${escapeHtml(l.meaning)}</span>
    </span>
  </button>`).join('') || '<div class="empty">Không tìm thấy bài phù hợp.</div>';

  listEl.querySelectorAll('.lesson-item').forEach(btn=>btn.addEventListener('click',()=>selectLesson(btn.dataset.id)));
}

function renderHeader(){
  if(currentMode==='legacy'){
    $('#lessonTitle').textContent=`${currentLegacy.id}. Bảng gốc - ${currentLegacy.radical_original}`;
    $('#lessonMeta').textContent=`${currentLegacy.reading} · ${currentLegacy.strokes} nét`;
    return;
  }

  $('#lessonTitle').textContent=`${current.id}. Bộ ${current.hanviet} - ${current.char}`;
  $('#lessonMeta').textContent=`${current.pinyin} · ${current.meaning} · ${current.strokes}`;
  $('#favBtn').textContent=`${state.favs.has(current.id)?'★':'☆'} Yêu thích`;
  $('#learnedBtn').textContent=`${state.learned.has(current.id)?'☑':'☐'} Đã học`;
}

function renderOverview(){
  return `<div class="grid three">
    <article class="card soft-blue">
      <h3>Thông tin chung</h3>
      <div class="hero-char">${escapeHtml(current.char)}</div>
      <div class="meta-list">
        <div class="meta-row"><strong>Bộ thủ</strong><span>${escapeHtml(current.radical)}</span></div>
        <div class="meta-row"><strong>Hán Việt</strong><span>${escapeHtml(current.hanviet)}</span></div>
        <div class="meta-row"><strong>Pinyin</strong><span>${escapeHtml(current.pinyin)}</span></div>
        <div class="meta-row"><strong>Số nét</strong><span>${escapeHtml(current.strokes)}</span></div>
      </div>
    </article>
    <article class="card soft-green">
      <h3>Ý nghĩa chính</h3>
      <p>${escapeHtml(current.meaning)}</p>
      <p>Bài học được chia thành chữ ví dụ, từ vựng, mẫu câu, bài tập và kiểm tra cuối bài.</p>
    </article>
    <article class="card soft-yellow">
      <h3>Học theo chuỗi</h3>
      <p>Bộ thủ → hình ảnh → bút thuận → chữ thật → từ thật → câu thật → luyện viết → ôn lại.</p>
    </article>
  </div>
  <div class="card" style="margin-top:16px">
    <h3>Bảng gốc</h3>
    <button class="primary-btn open-legacy-from-lesson" type="button">Mở bảng gốc</button>
  </div>
  <div class="card md-render" style="margin-top:16px">${mdToHtml(section(1)+'\n\n'+section(2)+'\n\n'+section(3))}</div>`;
}

function renderWrite(){
  return `<div class="image-grid">
    <article class="card">
      <h3>Minh họa tĩnh</h3>
      <img class="stroke-img zoomable" src="${current.static}" alt="Minh họa tĩnh ${escapeHtml(current.char)}" loading="lazy">
      <div class="image-actions">
        <button class="primary-btn icon-btn zoom-btn" title="Phóng to" aria-label="Phóng to" data-src="${current.static}">🔍</button>
      </div>
    </article>
    <article class="card">
      <h3>Minh họa động</h3>
      <img id="animatedImg" class="stroke-img zoomable" src="${current.static}" data-static="${current.static}" data-gif="${current.animated}" data-playing="0" alt="Minh họa động ${escapeHtml(current.char)}" loading="lazy">
      <div class="image-actions">
        <button class="primary-btn icon-btn zoom-btn animated-zoom" title="Phóng to" aria-label="Phóng to" data-src="${current.static}">🔍</button>
        <button class="ghost-btn icon-btn toggle-gif" title="Dừng / phát GIF" aria-label="Dừng / phát GIF">▶</button>
        <button class="ghost-btn icon-btn replay-gif" title="Phát lại từ đầu" aria-label="Phát lại từ đầu">↻</button>
      </div>
    </article>
  </div>
  <div class="card md-render" style="margin-top:16px">${mdToHtml(section(4)+'\n\n'+section(5)+'\n\n'+section(9))}</div>`;
}

function renderMdSections(nums){
  return `<div class="card md-render">${mdToHtml(nums.map(n=>section(n)).join('\n\n'))}</div>`;
}

function renderPractice(){
  return `<div class="card md-render">${mdToHtml(section(10))}</div>
  <div class="answer-box">
    <button id="toggleAnswer" class="primary-btn" type="button">Hiện / ẩn đáp án</button>
    <div id="answerBlock" class="card md-render hidden-answer" style="margin-top:14px">${mdToHtml(section(11))}</div>
  </div>`;
}

function renderLegacyView(){
  const r=currentLegacy;
  const examples=(r.examples||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('');

  return `<div class="card legacy-card">
    <div class="legacy-top">
      <div>
        <div class="legacy-no">STT ${escapeHtml(r.id)}</div>
        <div class="legacy-radical">${escapeHtml(r.radical_original)}</div>
        <div class="legacy-reading">${escapeHtml(r.reading)}</div>
      </div>
      <div class="meta-list" style="min-width:140px">
        <div class="meta-row"><strong>Số nét</strong><span>${escapeHtml(r.strokes)}</span></div>
      </div>
    </div>
    <div>
      <h3>Ví dụ trong bảng gốc</h3>
      <ul class="legacy-examples">${examples}</ul>
    </div>
    <div>
      <button class="primary-btn open-lesson-from-legacy" type="button">Mở bài học 2.0</button>
    </div>
  </div>`;
}

function renderTab(){
  if(currentMode==='legacy'){
    tabContent.innerHTML=renderLegacyView();
    const btn=document.querySelector('.open-lesson-from-legacy');
    if(btn)btn.addEventListener('click',()=>setMode('lesson',currentLegacy?.id||'01'));
    bindDynamic();
    return;
  }

  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===activeTab));

  const views={
    overview:renderOverview,
    write:renderWrite,
    examples:()=>renderMdSections([6]),
    vocab:()=>renderMdSections([7]),
    sentences:()=>renderMdSections([8]),
    practice:renderPractice,
    check:()=>renderMdSections([12,13])
  };

  tabContent.innerHTML=views[activeTab]();
  bindDynamic();
}

function clearSelections(except){
  document.querySelectorAll('.selecting').forEach(el=>{
    if(el!==except)el.classList.remove('selecting');
  });
}

function attachSelectable(){
  const selector=[
    '.legacy-examples li',
    '.md-render table tr:not(:first-child)',
    '.md-render pre',
    '.md-render p'
  ].join(',');

  document.querySelectorAll(selector).forEach(el=>{
    if(el.dataset.selectReady==='1')return;
    el.dataset.selectReady='1';

    el.addEventListener('click',e=>{
      e.stopPropagation();
      const was=el.classList.contains('selecting');
      clearSelections(el);
      if(was)el.classList.remove('selecting');
      else el.classList.add('selecting');
    });
  });
}

function bindDynamic(){
  document.querySelectorAll('.zoom-btn,.zoomable').forEach(el=>{
    if(el.dataset.zoomReady==='1')return;
    el.dataset.zoomReady='1';

    el.addEventListener('click',()=>{
      const src=el.dataset.src||el.getAttribute('src');
      if(!src)return;
      $('#dialogImage').src=src;
      $('#imageDialog').showModal();
    });
  });

  const gifImg=$('#animatedImg');
  const toggleGif=document.querySelector('.toggle-gif');
  const replay=document.querySelector('.replay-gif');
  const animatedZoom=document.querySelector('.animated-zoom');

  if(toggleGif&&gifImg){
    toggleGif.addEventListener('click',()=>{
      const playing=gifImg.dataset.playing==='1';

      if(playing){
        gifImg.dataset.playing='0';
        gifImg.src=gifImg.dataset.static;
        toggleGif.textContent='▶';
        if(animatedZoom)animatedZoom.dataset.src=gifImg.dataset.static;
      }else{
        gifImg.dataset.playing='1';
        gifImg.src='';
        setTimeout(()=>{gifImg.src=gifImg.dataset.gif;},30);
        toggleGif.textContent='⏸';
        if(animatedZoom)animatedZoom.dataset.src=gifImg.dataset.gif;
      }
    });
  }

  if(replay&&gifImg){
    replay.addEventListener('click',()=>{
      gifImg.dataset.playing='1';
      if(toggleGif)toggleGif.textContent='⏸';
      gifImg.src='';
      setTimeout(()=>{gifImg.src=gifImg.dataset.gif;},30);
      if(animatedZoom)animatedZoom.dataset.src=gifImg.dataset.gif;
    });
  }

  const answerBtn=$('#toggleAnswer');
  if(answerBtn)answerBtn.addEventListener('click',()=>$('#answerBlock').classList.toggle('hidden-answer'));

  const openLegacy=document.querySelector('.open-legacy-from-lesson');
  if(openLegacy)openLegacy.addEventListener('click',()=>setMode('legacy',current?.id||'01'));

  attachSelectable();
}

document.addEventListener('click',e=>{
  if(!e.target.closest('.md-render')&&!e.target.closest('.legacy-examples'))clearSelections();
});

document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click',()=>{
    activeTab=btn.dataset.tab;
    renderTab();
  });
});

$('#lessonModeBtn').addEventListener('click',()=>setMode('lesson',current?.id||currentLegacy?.id||'01'));
$('#legacyModeBtn').addEventListener('click',()=>setMode('legacy',current?.id||currentLegacy?.id||'01'));
$('#searchInput').addEventListener('input',renderList);

$('#showAllBtn').addEventListener('click',()=>{
  showFavOnly=false;
  $('#showAllBtn').classList.add('active');
  $('#showFavBtn').classList.remove('active');
  renderList();
});

$('#showFavBtn').addEventListener('click',()=>{
  showFavOnly=true;
  $('#showFavBtn').classList.add('active');
  $('#showAllBtn').classList.remove('active');
  renderList();
});

$('#themeBtn').addEventListener('click',()=>{
  const dark=document.documentElement.dataset.theme==='dark';
  document.documentElement.dataset.theme=dark?'':'dark';
  localStorage.setItem('boThuTheme',dark?'':'dark');
});

$('#favBtn').addEventListener('click',()=>{
  if(!current)return;
  state.favs.has(current.id)?state.favs.delete(current.id):state.favs.add(current.id);
  saveState();
  renderHeader();
  renderList();
});

$('#learnedBtn').addEventListener('click',()=>{
  if(!current)return;
  state.learned.has(current.id)?state.learned.delete(current.id):state.learned.add(current.id);
  saveState();
  renderHeader();
});

$('#openLegacyBtn').addEventListener('click',()=>setMode('legacy',current?.id||'01'));
$('#closeDialog').addEventListener('click',()=>$('#imageDialog').close());

async function init(){
  document.documentElement.dataset.theme=localStorage.getItem('boThuTheme')||'';

  const version='20260612';
  const [lessonRes,legacyRes]=await Promise.all([
    fetch(`data/lessons.json?v=${version}`),
    fetch(`data/legacy.json?v=${version}`)
  ]);

  const lessonData=await lessonRes.json();
  const legacyData=await legacyRes.json();

  lessons=lessonData.lessons||[];
  legacy=legacyData.legacy||[];

  if(!lessons.length)throw new Error('Không có lessons');
  if(!legacy.length)throw new Error('Không có legacy');

  current=lessons[0];
  currentLegacy=legacy[0];

  setMode('lesson','01');
}

init().catch(err=>{
  console.error(err);
  tabContent.innerHTML=`<div class="card"><h3>Lỗi tải dữ liệu</h3><p>${escapeHtml(err.message)}</p><p>Hãy chạy bằng local server hoặc kiểm tra thư mục data.</p></div>`;
});



// v2 audio in bo-thu header
let boThuAudioById = {};
let boThuCurrentAudio = null;

function boThuAudioUrlForModule(item){
  if(!item || !item.audio) return "";

  // radical_audio.json sinh ra path kiểu:
  // modules/pinyin/audio/ren2.mp3
  // Nhưng file này đang chạy bên trong modules/bo-thu-50/,
  // nên cần đổi sang ../pinyin/audio/ren2.mp3
  return item.audio.replace(/^modules\/pinyin\//, "../pinyin/");
}

// v3 mobile audio fix for bo-thu module
function ensureBoThuMobileAudioPlayer(){
  let wrap = document.getElementById("boThuMobileAudioPlayer");

  if(!wrap){
    wrap = document.createElement("div");
    wrap.id = "boThuMobileAudioPlayer";
    wrap.className = "mobile-audio-player";
    wrap.innerHTML = `
      <audio id="boThuSharedAudioPlayer" controls preload="auto" playsinline></audio>
      <div id="boThuSharedAudioMsg" class="audio-msg">Sẵn sàng phát âm.</div>
    `;
    document.body.appendChild(wrap);
  }

  return {
    wrap,
    audio: document.getElementById("boThuSharedAudioPlayer"),
    msg: document.getElementById("boThuSharedAudioMsg")
  };
}

async function boThuPlayAudio(url){
  if(!url) return;

  const player = ensureBoThuMobileAudioPlayer();
  const finalUrl = new URL(url, document.baseURI).href;

  player.wrap.classList.add("show");
  player.msg.textContent = "Đang tải audio...";

  try{
    if(boThuCurrentAudio && boThuCurrentAudio !== player.audio){
      boThuCurrentAudio.pause();
      boThuCurrentAudio.currentTime = 0;
    }

    boThuCurrentAudio = player.audio;
    boThuCurrentAudio.pause();
    boThuCurrentAudio.currentTime = 0;
    boThuCurrentAudio.src = finalUrl;
    boThuCurrentAudio.load();

    await boThuCurrentAudio.play();

    player.msg.textContent = "Đang phát: " + finalUrl.split("/").pop();
  }catch(err){
    console.warn("Bo-thu audio play failed:", err);
    player.msg.textContent = "Chưa phát được. Hãy bấm nút play trên thanh audio hoặc kiểm tra silent mode/volume.";
  }
}

async function boThuLoadRadicalAudio(){
  try{
    const res = await fetch("../pinyin/data/radical_audio.json?v=2");
    const data = await res.json();

    boThuAudioById = {};
    (data.items || []).forEach(item => {
      boThuAudioById[item.id] = item;
    });

    if(typeof renderHeader === "function"){
      renderHeader();
    }
  }catch(err){
    console.warn("Không tải được radical_audio.json", err);
  }
}

const boThuOldRenderHeader = renderHeader;
renderHeader = function(){
  boThuOldRenderHeader();

  if(currentMode === "legacy") return;
  if(!current) return;

  const meta = document.getElementById("lessonMeta");
  if(!meta) return;

  const item = boThuAudioById[current.id];
  const audioUrl = boThuAudioUrlForModule(item);

  if(item && item.has_audio && audioUrl){
    meta.innerHTML = `${escapeHtml(current.pinyin)} <button class="inline-audio-btn" id="boThuHeaderAudioBtn" type="button" title="Nghe ${escapeHtml(current.pinyin)}" aria-label="Nghe ${escapeHtml(current.pinyin)}">🔊</button> · ${escapeHtml(current.meaning)} · ${escapeHtml(current.strokes)}`;

    const btn = document.getElementById("boThuHeaderAudioBtn");
    if(btn){
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        boThuPlayAudio(audioUrl);
      });
    }
  }
};

boThuLoadRadicalAudio();


// v4 audio debug + robust play override for bo-thu module
function ensureBoThuMobileAudioPlayer(){
  let wrap = document.getElementById("boThuMobileAudioPlayer");

  if(!wrap){
    wrap = document.createElement("div");
    wrap.id = "boThuMobileAudioPlayer";
    wrap.className = "mobile-audio-player";
    wrap.innerHTML = `
      <audio id="boThuSharedAudioPlayer" controls preload="metadata" playsinline></audio>
      <div id="boThuSharedAudioMsg" class="audio-msg">Sẵn sàng phát âm.</div>
      <a id="boThuSharedAudioLink" class="audio-debug-link" href="#" target="_blank" rel="noopener">Mở file audio</a>
      <div id="boThuSharedAudioUrl" class="audio-file-url"></div>
    `;
    document.body.appendChild(wrap);
  }

  return {
    wrap,
    audio: document.getElementById("boThuSharedAudioPlayer"),
    msg: document.getElementById("boThuSharedAudioMsg"),
    link: document.getElementById("boThuSharedAudioLink"),
    urlText: document.getElementById("boThuSharedAudioUrl")
  };
}

async function boThuPlayAudio(url){
  if(!url) return;

  const player = ensureBoThuMobileAudioPlayer();
  const finalUrl = new URL(url, document.baseURI).href;

  player.wrap.classList.add("show");
  player.link.href = finalUrl;
  player.urlText.textContent = finalUrl;
  player.msg.textContent = "Đang tải audio...";

  if(boThuCurrentAudio && boThuCurrentAudio !== player.audio){
    boThuCurrentAudio.pause();
    boThuCurrentAudio.currentTime = 0;
  }

  boThuCurrentAudio = player.audio;

  boThuCurrentAudio.onerror = () => {
    player.msg.textContent = "Không tải được file audio. Bấm 'Mở file audio' để kiểm tra đường dẫn.";
  };

  boThuCurrentAudio.onloadedmetadata = () => {
    const d = Number.isFinite(boThuCurrentAudio.duration) ? boThuCurrentAudio.duration.toFixed(2) : "?";
    player.msg.textContent = "Đã tải audio, thời lượng: " + d + " giây.";
  };

  boThuCurrentAudio.onplay = () => {
    player.msg.textContent = "Đang phát: " + finalUrl.split("/").pop();
  };

  boThuCurrentAudio.onended = () => {
    player.msg.textContent = "Đã phát xong: " + finalUrl.split("/").pop();
  };

  try{
    boThuCurrentAudio.pause();
    boThuCurrentAudio.removeAttribute("src");
    boThuCurrentAudio.load();

    boThuCurrentAudio.src = finalUrl + (finalUrl.includes("?") ? "&" : "?") + "v=" + Date.now();
    boThuCurrentAudio.load();

    await boThuCurrentAudio.play();
  }catch(err){
    console.warn("Bo-thu audio play failed:", err);
    player.msg.textContent = "Trình duyệt chưa cho phát tự động. Hãy bấm nút play trên thanh audio.";
  }
}

/* PATCH_V6_EMBED_ONLY_NO_NEW_TAB
   Ép module nội bộ không mở tab mới và ẩn nút mở trực tiếp.
*/
(function () {
  const INTERNAL_RE = /modules\/(bo-thu-50|pinyin)/i;
  const HIDE_TEXTS = [
    'Mở trong tab này',
    'Mở toàn màn hình',
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
        el.textContent = 'Nội dung mở ngay bên dưới.';
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

/* PATCH_V9_HIDE_AUDIO_DOCK
   Chỉ giữ trạng thái trên nút loa, ẩn toàn bộ audio dock/debug.
*/
(function () {
  let activeSpeakerButton = null;

  function isSpeakerButton(el) {
    if (!el) return false;
    const text = (el.textContent || '').trim();
    const aria = (el.getAttribute && (el.getAttribute('aria-label') || '')) || '';
    const title = (el.getAttribute && (el.getAttribute('title') || '')) || '';
    const cls = (el.className || '').toString();

    return (
      text.includes('🔊') ||
      text.includes('🔈') ||
      /audio|speaker|sound|listen|play/i.test(aria + ' ' + title + ' ' + cls)
    );
  }

  function nearestButton(el) {
    if (!el) return null;
    if (el.closest) {
      const btn = el.closest('button, a, [role="button"]');
      if (btn && isSpeakerButton(btn)) return btn;
    }
    return null;
  }

  function setSpeakerActive(btn, active) {
    if (!btn) return;
    btn.classList.toggle('speaker-playing', !!active);
    btn.classList.toggle('audio-playing', !!active);

    if (active) {
      btn.setAttribute('aria-pressed', 'true');
      btn.setAttribute('title', 'Đang phát');
    } else {
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('title', 'Phát âm');
    }
  }

  function clearActiveSpeaker() {
    if (activeSpeakerButton) {
      setSpeakerActive(activeSpeakerButton, false);
      activeSpeakerButton = null;
    }
  }

  function setActiveSpeaker(btn) {
    if (activeSpeakerButton && activeSpeakerButton !== btn) {
      setSpeakerActive(activeSpeakerButton, false);
    }
    activeSpeakerButton = btn;
    setSpeakerActive(btn, true);
  }

  function looksLikeAudioDock(el) {
    if (!el || !(el instanceof Element)) return false;

    const text = (el.textContent || '').trim();
    const hasAudio = !!el.querySelector('audio');
    const hasDebugLink = !!el.querySelector('.audio-debug-link, .audio-file-url');

    if (hasDebugLink) return true;

    if (hasAudio && (
      text.includes('Đang phát') ||
      text.includes('Đã phát xong') ||
      text.includes('Trình duyệt chưa cho phát') ||
      text.includes('Mở file audio') ||
      text.includes('http://localhost') ||
      text.includes('/modules/pinyin/audio/')
    )) {
      return true;
    }

    return false;
  }

  function hideAudioDock() {
    document.querySelectorAll('.audio-debug-link, .audio-file-url').forEach(function (el) {
      el.style.display = 'none';
      el.setAttribute('hidden', 'hidden');
    });

    document.querySelectorAll('audio').forEach(function (audio) {
      audio.removeAttribute('controls');
      audio.style.display = 'none';
      audio.setAttribute('aria-hidden', 'true');

      if (!audio.dataset.v9SpeakerHooked) {
        audio.dataset.v9SpeakerHooked = '1';

        audio.addEventListener('play', function () {
          if (activeSpeakerButton) setSpeakerActive(activeSpeakerButton, true);
        });

        audio.addEventListener('pause', function () {
          clearActiveSpeaker();
        });

        audio.addEventListener('ended', function () {
          clearActiveSpeaker();
        });

        audio.addEventListener('error', function () {
          clearActiveSpeaker();
        });
      }
    });

    document.querySelectorAll('div, section, aside, footer').forEach(function (el) {
      if (looksLikeAudioDock(el)) {
        el.style.display = 'none';
        el.setAttribute('hidden', 'hidden');
      }
    });
  }

  document.addEventListener('click', function (e) {
    const btn = nearestButton(e.target);
    if (!btn) return;

    setActiveSpeaker(btn);

    // Cho code phát âm cũ chạy trước, sau đó ẩn dock.
    setTimeout(hideAudioDock, 0);
    setTimeout(hideAudioDock, 120);
    setTimeout(hideAudioDock, 500);
  }, true);

  document.addEventListener('DOMContentLoaded', hideAudioDock);
  window.addEventListener('load', hideAudioDock);
  setInterval(hideAudioDock, 800);
})();

/* PATCH_V11_COMPACT_TOP_NAV
   Thanh điều hướng gọn ở trên tiêu đề module.
*/
(function () {
  function removeOldBottomHomeLink() {
    document.querySelectorAll('.module-home-link').forEach(function (el) {
      el.remove();
    });
  }

  function addTopNav() {
    removeOldBottomHomeLink();

    if (document.querySelector('.tt-module-top-nav')) return;

    const isBoThu = /\/bo-thu-50\//i.test(location.pathname);
    const isPinyin = /\/pinyin\//i.test(location.pathname);

    const nav = document.createElement('header');
    nav.className = 'tt-module-top-nav';
    nav.innerHTML = `
      <a class="tt-top-brand" href="../../index.html" target="_self" aria-label="Về trang chủ Tiếng Trung">
        <span class="tt-top-logo">中</span>
        <span class="tt-top-name">Tiếng Trung</span>
      </a>
      <nav class="tt-top-links" aria-label="Điều hướng module">
        <a href="../../index.html" target="_self">Trang chủ</a>
        <a href="../bo-thu-50/index.html" target="_self" class="${isBoThu ? 'active' : ''}">Bộ thủ</a>
        <a href="../pinyin/index.html" target="_self" class="${isPinyin ? 'active' : ''}">Pinyin</a>
        <a href="../../index.html#dialogue301" target="_self">301 Đàm thoại</a>
      </nav>
    `;

    document.body.prepend(nav);
    document.documentElement.classList.add('has-tt-module-top-nav');
    document.body.classList.add('has-tt-module-top-nav');
  }

  document.addEventListener('DOMContentLoaded', addTopNav);
  window.addEventListener('load', addTopNav);
  setTimeout(addTopNav, 100);
  setTimeout(addTopNav, 500);
})();

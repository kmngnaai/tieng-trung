const DATA_URL = 'data/pinyin.json';
const LS_KEY = 'tiengtrung_pinyin_v12_state';

let DATA = null;
let state = {
  tab: 'learn',
  selected: '',
  tone: 2,
  search: '',
  finalGroup: 'all',
  initialGroup: 'all',
  hideEmpty: false,
  learned: {},
  favorite: {},
  wrong: {},
  quiz: null,
  chartMode: 'cards',
  activeGroup: 'intro',
  activeReviewGroup: 'not_started',
  progress: {
    syllables: {},
    hanzi: {},
    shadowing: {}
  }
};

let audio = new Audio();
let activeBtn = null;

function $(s){return document.querySelector(s)}
function $all(s){return Array.from(document.querySelectorAll(s))}
function norm(s){return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim()}

function ensureProgressState(){
  state.progress = state.progress || {};
  state.progress.syllables = state.progress.syllables || {};
  state.progress.hanzi = state.progress.hanzi || {};
  state.progress.shadowing = state.progress.shadowing || {};

  Object.keys(state.learned || {}).forEach(safe => {
    if(!state.learned[safe]) return;
    const p = state.progress.syllables[safe] || {};
    p.learned = true;
    p.learnedAt = p.learnedAt || new Date().toISOString();
    state.progress.syllables[safe] = p;
  });

  Object.keys(state.wrong || {}).forEach(safe => {
    const count = Number(state.wrong[safe] || 0);
    if(!count) return;
    const p = state.progress.syllables[safe] || {};
    p.wrong = Math.max(Number(p.wrong || 0), count);
    state.progress.syllables[safe] = p;
  });
}

function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(raw) state = {...state, ...JSON.parse(raw)};
  }catch(e){}
  ensureProgressState();
}
function saveState(){
  ensureProgressState();
  localStorage.setItem(LS_KEY, JSON.stringify({
    tab: state.tab, selected: state.selected, tone: state.tone, search: state.search,
    finalGroup: state.finalGroup, initialGroup: state.initialGroup, hideEmpty: state.hideEmpty,
    learned: state.learned, favorite: state.favorite, wrong: state.wrong,
    quiz: state.quiz, chartMode: state.chartMode,
    activeGroup: state.activeGroup, activeReviewGroup: state.activeReviewGroup,
    progress: state.progress
  }));
}

function playableItems(){return DATA.items.filter(x=>x.hasAudio)}
function itemBySafe(safe){return DATA.items.find(x=>x.safe===safe)}
function itemByPinyin(py){return DATA.items.find(x=>norm(x.pinyin)===norm(py) || norm(x.safe)===norm(py))}
function selectedItem(){return itemBySafe(state.selected) || playableItems()[0]}

function countState(obj){return Object.values(obj||{}).filter(Boolean).length}
function reviewCount(){return Object.keys(state.wrong||{}).length}
function setTab(tab){state.tab=tab; saveState(); render()}
function selectItem(safe){state.selected=safe; saveState(); render()}
function selectPinyin(py){const it=itemByPinyin(py); if(it){state.selected=it.safe; saveState(); render();}}
function setTone(t){state.tone=Number(t); saveState(); render()}
function setPlaying(btn,on){if(!btn)return; btn.classList.toggle('playing',!!on); btn.setAttribute('aria-pressed',on?'true':'false')}
function clearPlaying(){if(activeBtn){setPlaying(activeBtn,false);activeBtn=null}}

audio.addEventListener('ended', clearPlaying);
audio.addEventListener('pause', clearPlaying);
audio.addEventListener('error', clearPlaying);

function playTone(safe,tone,btn){
  const it = itemBySafe(safe);
  if(!it || !it.audio || !it.audio[String(tone)]) return;
  clearPlaying();
  activeBtn = btn || null;
  setPlaying(activeBtn,true);
  audio.src = it.audio[String(tone)];
  audio.currentTime = 0;
  audio.play().catch(()=>clearPlaying());
}

function playSelected(btn){
  const it = selectedItem();
  if(!it) return;
  const tone = it.audio[String(state.tone)] ? state.tone : (it.tones[0] || 1);
  playTone(it.safe, tone, btn);
}

function toggleLearned(safe){state.learned[safe]=!state.learned[safe]; saveState(); render()}
function toggleFavorite(safe){state.favorite[safe]=!state.favorite[safe]; saveState(); render()}
function markWrong(safe){state.wrong[safe]=(state.wrong[safe]||0)+1; saveState(); render()}
function clearWrong(safe){delete state.wrong[safe]; saveState(); render()}

function navButton(tab,label,count=''){
  return `<button class="nav-btn ${state.tab===tab?'active':''}" onclick="setTab('${tab}')"><span>${label}</span>${count?`<span class="count">${count}</span>`:''}</button>`
}

function appShell(content){
  const total = DATA.stats.audioItems;
  const learned = countState(state.learned);
  const fav = countState(state.favorite);
  const review = reviewCount();
  return `
<header class="tt-module-top-nav">
  <a class="tt-top-brand" href="../../index.html" target="_self"><span class="tt-top-logo">中</span><span class="tt-top-name">Tiếng Trung</span></a>
  <nav class="tt-top-links">
    <a href="../../index.html" target="_self">Trang chủ</a>
    <a href="../bo-thu-50/index.html" target="_self">Bộ thủ</a>
    <a href="../pinyin/index.html" target="_self" class="active">Pinyin</a>
    <a href="../../index.html#dialogue301" target="_self">301 Đàm thoại</a>
  </nav>
</header>

<div class="app-shell">
  <aside class="sidebar">
    <div class="brand"><div class="brand-logo">拼</div><div><h1>Pinyin</h1><p>Nghe · Bảng ghép · Ôn tập</p></div></div>
    ${navButton('listen','Nghe', 'tra âm')}
    ${navButton('chart','Bảng tổng', total)}
    ${navButton('groups','18 bảng', 'nhỏ')}
    ${navButton('rules','Quy tắc', 'ghi nhớ')}
    ${navButton('practice','Luyện tập', 'quiz')}
    ${navButton('review','Ôn tập', review)}
    <div class="side-card">
      <div class="side-stat">
        <div><span>Audio thật</span><b>${total}</b></div>
        <div><span>Đã học</span><b>${learned}</b></div>
        <div><span>Yêu thích</span><b>${fav}</b></div>
        <div><span>Cần ôn</span><b>${review}</b></div>
      </div>
    </div>
  </aside>
  <main class="content">${content}</main>
</div>`;
}

function hero(title, subtitle, actions=''){
  const s = DATA.stats;
  return `<section class="hero">
    <div class="hero-main">
      <div class="kicker">Mini app học Pinyin</div>
      <h1 class="title">${title}</h1>
      <p class="subtitle">${subtitle}</p>
      ${actions ? `<div class="hero-actions">${actions}</div>` : ''}
    </div>
    <div class="hero-stats">
      <div class="stat"><b>${s.audioItems}</b><span>âm có audio</span></div>
      <div class="stat"><b>${countState(state.learned)}</b><span>đã học</span></div>
      <div class="stat"><b>${countState(state.favorite)}</b><span>yêu thích</span></div>
      <div class="stat"><b>${reviewCount()}</b><span>cần ôn</span></div>
    </div>
  </section>`;
}

function renderListen(){
  const it = selectedItem();
  const quick = DATA.quickGroups.map(g => `<div class="panel"><h3>${g.title}</h3><div class="chips">${g.items.map(py => chip(py)).join('')}</div></div>`).join('');
  return appShell(`
${hero('Nghe & tra âm', 'Chọn Pinyin, chọn thanh điệu rồi bấm loa. Các quy tắc cũ như -i đặc biệt, j/q/x + ü, iu/ui/un viết tắt đã được đưa vào phần gợi ý.', `
  <button class="btn primary" onclick="setTab('chart')">Mở bảng ghép</button>
  <button class="btn" onclick="setTab('practice')">Luyện nghe</button>
`)}
<section class="listen-layout">
  <div class="now-card">
    <div class="now-label">Âm đang chọn</div>
    <div class="now-pinyin">${it?.pinyin || '—'}</div>
    <div class="now-split">${it ? `${it.initialLabel || '∅'} + ${it.chartFinal}` : 'chưa chọn âm'}</div>
    <div class="rule-box">
      <div><b>Quy tắc</b><span>${it?.rule || 'Chưa có'}</span></div>
      <div><b>Gợi ý</b><span>${it?.hint || 'Chọn một âm để xem gợi ý.'}</span></div>
    </div>
    ${it ? toneButtons(it, true) : ''}
  </div>
  <div class="control-stack">
    <div class="panel">
      <h2>Tra nhanh</h2>
      <div class="input-row">
        <input placeholder="Nhập pinyin: ma, shi, xue, lü..." value="${state.search}" oninput="state.search=this.value;saveState();renderSearchBox()" onkeydown="if(event.key==='Enter'){selectPinyin(this.value);playSelected(this)}">
        <button class="btn primary" onclick="selectPinyin(state.search);playSelected(this)">Nghe</button>
      </div>
      <div class="tone-row" style="margin-top:12px">${[1,2,3,4].map(t=>`<button class="tone-btn ${state.tone===t?'active':''}" onclick="setTone(${t})">Thanh ${t}</button>`).join('')}</div>
      <div id="searchBox">${searchBoxHtml()}</div>
    </div>
    ${quick}
  </div>
</section>`);
}

function renderSearchBox(){
  const box = $('#searchBox');
  if(box) box.innerHTML = searchBoxHtml();
}

function searchBoxHtml(){
  const q = norm(state.search);
  if(!q) return '';
  const arr = playableItems().filter(x => norm(x.pinyin).includes(q) || norm(x.safe).includes(q)).slice(0,24);
  return `<div class="chips" style="margin-top:12px">${arr.map(x=>chip(x.pinyin)).join('')}</div>`;
}

function chip(py){
  const it = itemByPinyin(py);
  if(!it) return `<button class="chip">${py}</button>`;
  const sel = state.selected===it.safe ? 'selected' : '';
  return `<button class="chip ${sel}" onclick="selectItem('${it.safe}');playTone('${it.safe}', ${state.tone}, this)">${it.pinyin}</button>`;
}

function toneButtons(it, includeActions=false){
  return `<div class="tone-row" style="margin-top:14px">
    ${[1,2,3,4].map(t=>{
      const has = it.audio && it.audio[String(t)];
      return `<button class="tone-btn ${state.tone===t?'active':''}" ${has?`onclick="setTone(${t});playTone('${it.safe}',${t},this)"`:'disabled'}>${t} 🔊</button>`;
    }).join('')}
  </div>
  ${includeActions ? `<div class="tray-actions" style="margin-top:10px">
    <button class="btn ${state.learned[it.safe]?'primary':''}" onclick="toggleLearned('${it.safe}')">✓ Đã học</button>
    <button class="btn ${state.favorite[it.safe]?'primary':''}" onclick="toggleFavorite('${it.safe}')">☆ Yêu thích</button>
    <button class="btn" onclick="markWrong('${it.safe}')">↻ Cần ôn</button>
    <button class="btn" onclick="setTab('chart')">Bảng ghép</button>
  </div>` : ''}`;
}

function filteredInitials(){
  if(state.initialGroup === 'all') return DATA.initials;
  const g = DATA.initialGroups.find(x=>x.key===state.initialGroup);
  if(!g) return DATA.initials;
  return DATA.initials.filter(x => g.initials.includes(x.key));
}

function filteredFinalGroups(){
  if(state.finalGroup === 'all') return DATA.finalGroups;
  return DATA.finalGroups.filter(x=>x.key===state.finalGroup);
}

function itemMap(){
  const map = {};
  playableItems().forEach(x => { map[`${x.initial}__${x.chartFinal}`] = x; });
  return map;
}

function renderChart(){
  const it = selectedItem();
  const zeroItems = playableItems().filter(x => x.initial==='' || x.initial==='y' || x.initial==='w').slice(0,80);
  return appShell(`
${hero('Bảng ghép Pinyin', 'Bảng tổng được làm lại dễ nhìn hơn: nhóm cột rõ, thanh mẫu cố định, có lọc nhóm và panel âm đang chọn.', `
  <button class="btn primary" onclick="setTab('listen')">Nghe âm đang chọn</button>
  <button class="btn" onclick="state.hideEmpty=!state.hideEmpty;saveState();render()">Ẩn/hiện ô trống</button>
`)}
<div class="zero-strip"><b>Đứng riêng:</b>${zeroItems.map(x=>chip(x.pinyin)).join('')}</div>
<section class="chart-shell">
  <aside class="sound-tray">
    <div class="now-label">Đang chọn</div>
    <div class="tray-pinyin">${it?.pinyin || '—'}</div>
    <div class="tray-meta">${it ? `${it.initialLabel || '∅'} + ${it.chartFinal}` : ''}</div>
    <div class="rule-box">
      <div><b>${it?.rule || 'Quy tắc'}</b><span>${it?.hint || 'Bấm một ô trong bảng.'}</span></div>
    </div>
    ${it ? toneButtons(it, true) : ''}
  </aside>
  <section>
    <div class="toolbar">
      <input class="search" placeholder="Tìm trong bảng: ren, ma, xue..." value="${state.search}" oninput="state.search=this.value;saveState();render()">
      <select onchange="state.initialGroup=this.value;saveState();render()">
        <option value="all">Tất cả thanh mẫu</option>
        ${DATA.initialGroups.map(g=>`<option value="${g.key}" ${state.initialGroup===g.key?'selected':''}>${g.title}</option>`).join('')}
      </select>
      <select onchange="state.finalGroup=this.value;saveState();render()">
        <option value="all">Tất cả vận mẫu</option>
        ${DATA.finalGroups.map(g=>`<option value="${g.key}" ${state.finalGroup===g.key?'selected':''}>${g.title}</option>`).join('')}
      </select>
    </div>
    <div class="legend">
      <span><i class="dot learned-dot"></i>Đã học</span>
      <span><i class="dot rule-special-dot"></i>-i đặc biệt</span>
      <span><i class="dot rule-umlaut-dot"></i>ü</span>
      <span><i class="dot rule-abbr-dot"></i>viết tắt</span>
    </div>
    ${state.search ? renderSearchResults() : renderTable(filteredInitials(), filteredFinalGroups(), itemMap())}
  </section>
</section>`);
}

function renderSearchResults(){
  const q = norm(state.search);
  const arr = playableItems().filter(x => norm(x.pinyin).includes(q) || norm(x.safe).includes(q) || norm(x.rule).includes(q)).slice(0,120);
  return `<div class="grid-4">${arr.map(x => `<div class="study-card" onclick="selectItem('${x.safe}')"><b>${x.pinyin}</b><span>${x.initialLabel || '∅'} + ${x.chartFinal}</span>${toneButtons(x,false)}</div>`).join('')}</div>`;
}

function ruleClass(x){
  if(!x) return '';
  if(x.ruleGroup === 'special') return 'rule-special';
  if(x.ruleGroup === 'umlaut') return 'rule-umlaut';
  if(x.ruleGroup === 'abbr') return 'rule-abbr';
  return '';
}

function renderTable(initials, groups, map){
  return `<div class="table-wrap">
    <table class="pinyin-chart ${state.hideEmpty?'hide-empty':''}">
      <thead>
        <tr><th class="row-head" rowspan="2">Thanh mẫu</th>${groups.map(g=>`<th colspan="${g.finals.length}">${g.title}</th>`).join('')}</tr>
        <tr>${groups.flatMap(g=>g.finals.map(f=>`<th>${f}</th>`)).join('')}</tr>
      </thead>
      <tbody>
        ${initials.map(i=>`<tr>
          <th class="row-head">${i.label}</th>
          ${groups.flatMap(g=>g.finals.map(f=>{
            const x = map[`${i.key}__${f}`];
            if(!x) return `<td class="empty">—</td>`;
            const cls = ['syllable', ruleClass(x), state.selected===x.safe?'selected':'', state.learned[x.safe]?'learned':'', state.favorite[x.safe]?'favorite':''].join(' ');
            return `<td class="has"><button class="${cls}" onclick="selectItem('${x.safe}');playTone('${x.safe}', ${state.tone}, this)">${x.pinyin}</button></td>`;
          })).join('')}
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function renderGroups(){
  return appShell(`
${hero('18 bảng nhỏ', 'Giữ tinh thần bảng cũ: chia nhỏ theo nhóm thanh mẫu/vận mẫu để học lần lượt, nhưng trình bày gọn hơn.')}
<div class="mini-list">
  ${DATA.miniTables.map(t => `<details class="mini-acc" ${t.no<=2?'open':''}>
    <summary><span class="mini-title"><span class="badge">${String(t.no).padStart(2,'0')}</span><span>${t.title}<small>${t.tip}</small></span></span></summary>
    <div class="mini-body">${renderTable(DATA.initials.filter(i=>t.initials.includes(i.key)), [{key:'mini', title:'Vận mẫu', finals:t.finals}], itemMap())}</div>
  </details>`).join('')}
</div>`);
}

function renderRules(){
  return appShell(`
${hero('Quy tắc Pinyin', 'Các quy tắc quan trọng được lấy lại theo nội dung bảng cũ và gom thành thẻ dễ ôn.')}
<div class="rules-grid">
  ${DATA.rules.map(r => `<div class="rule-card"><h2>${r.title}</h2><p class="muted">${r.body}</p><div class="rule-tags">${r.tags.map(t=>chip(t)).join('')}</div></div>`).join('')}
</div>`);
}

function newQuiz(){
  const arr = playableItems().filter(x=>x.tones.length);
  const item = arr[Math.floor(Math.random()*arr.length)];
  const tone = item.tones[Math.floor(Math.random()*item.tones.length)];
  state.quiz = {safe:item.safe, tone, answered:false, feedback:''};
  saveState(); render();
}

function answerQuiz(tone){
  if(!state.quiz) return;
  const it = itemBySafe(state.quiz.safe);
  const ok = Number(tone) === Number(state.quiz.tone);
  state.quiz.answered = true;
  state.quiz.feedback = ok ? `Đúng: ${it.pinyin}${tone}` : `Sai. Đáp án đúng: ${it.pinyin}${state.quiz.tone}`;
  if(!ok) markWrong(it.safe);
  saveState(); render();
}

function renderPractice(){
  const q = state.quiz;
  const it = q ? itemBySafe(q.safe) : null;
  return appShell(`
${hero('Luyện tập nghe', 'Nghe âm và chọn đúng thanh điệu. Câu sai tự đưa vào Ôn tập.')}
<div class="quiz-card">
  ${!q ? `<p class="muted">Bấm bắt đầu để lấy câu hỏi.</p><button class="btn primary" onclick="newQuiz()">Bắt đầu</button>` : `
    <div class="muted">Nghe và chọn thanh</div>
    <div class="quiz-big">?</div>
    <button class="btn primary" onclick="playTone('${q.safe}', ${q.tone}, this)">Phát âm 🔊</button>
    <div class="quiz-options">${[1,2,3,4].map(t=>`<button class="btn" onclick="answerQuiz(${t})">Thanh ${t}</button>`).join('')}</div>
    ${q.answered ? `<div class="feedback ${q.feedback.startsWith('Đúng')?'ok':'bad'}">${q.feedback}</div><button class="btn primary" style="margin-top:12px" onclick="newQuiz()">Câu tiếp</button>` : ''}
  `}
</div>`);
}

function renderReview(){
  const wrong = Object.keys(state.wrong).sort((a,b)=>state.wrong[b]-state.wrong[a]);
  const fav = Object.keys(state.favorite).filter(k=>state.favorite[k]);
  return appShell(`
${hero('Ôn tập', 'Âm sai và âm yêu thích được lưu trong trình duyệt để học lại.')}
<div class="panel"><h2>Cần ôn</h2>
  ${wrong.length ? `<div class="review-list">${wrong.map(k=>reviewItem(k, true)).join('')}</div>` : `<p class="muted">Chưa có âm cần ôn. Hãy làm Luyện tập để hệ thống tự gom lỗi.</p>`}
</div>
<div class="panel"><h2>Yêu thích</h2>
  ${fav.length ? `<div class="review-list">${fav.map(k=>reviewItem(k, false)).join('')}</div>` : `<p class="muted">Chưa có âm yêu thích.</p>`}
</div>`);
}

function reviewItem(k, wrongMode){
  const it = itemBySafe(k);
  if(!it) return '';
  return `<div class="review-item"><b>${it.pinyin}</b><p class="muted">${it.rule}${wrongMode ? ` · sai ${state.wrong[k]} lần` : ''}</p>${toneButtons(it,false)}${wrongMode ? `<button class="btn" onclick="clearWrong('${k}')">Đã ôn</button>` : ''}</div>`;
}

function render(){
  let html = '';
  if(state.tab==='listen') html = renderListen();
  else if(state.tab==='chart') html = renderChart();
  else if(state.tab==='groups') html = renderGroups();
  else if(state.tab==='rules') html = renderRules();
  else if(state.tab==='practice') html = renderPractice();
  else if(state.tab==='review') html = renderReview();
  else html = renderListen();
  $('#app').innerHTML = html;
}

async function init(){
  loadState();
  const res = await fetch(DATA_URL);
  DATA = await res.json();
  if(!state.selected){
    const first = itemByPinyin('ren') || playableItems()[0];
    if(first) state.selected = first.safe;
  }
  render();
}

window.setTab=setTab; window.selectItem=selectItem; window.selectPinyin=selectPinyin; window.setTone=setTone;
window.playTone=playTone; window.playSelected=playSelected; window.toggleLearned=toggleLearned; window.toggleFavorite=toggleFavorite;
window.markWrong=markWrong; window.clearWrong=clearWrong; window.newQuiz=newQuiz; window.answerQuiz=answerQuiz; window.state=state; window.render=render;

init();

/* PATCH_PINYIN_V13_TONE_RULES_COMPACT
   Tone marks + complete rules + compact hero + selected panel for 18 bảng.
*/
(function () {
  const toneMarks = {
    a: ['ā', 'á', 'ǎ', 'à'],
    e: ['ē', 'é', 'ě', 'è'],
    i: ['ī', 'í', 'ǐ', 'ì'],
    o: ['ō', 'ó', 'ǒ', 'ò'],
    u: ['ū', 'ú', 'ǔ', 'ù'],
    ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ']
  };

  window.markPinyinTone = function markPinyinTone(py, tone) {
    py = String(py || '');
    tone = Number(tone || 0);
    if (!py || tone < 1 || tone > 4) return py;

    const lower = py.toLowerCase();
    let idx = -1;

    for (const v of ['a', 'o', 'e']) {
      idx = lower.indexOf(v);
      if (idx >= 0) break;
    }

    if (idx < 0 && lower.includes('iu')) {
      idx = lower.indexOf('iu') + 1;
    } else if (idx < 0 && lower.includes('ui')) {
      idx = lower.indexOf('ui') + 1;
    }

    if (idx < 0) {
      for (let i = py.length - 1; i >= 0; i--) {
        if ('aeiouü'.includes(lower[i])) {
          idx = i;
          break;
        }
      }
    }

    if (idx < 0) return py;

    const ch = lower[idx];
    const marked = toneMarks[ch] && toneMarks[ch][tone - 1];
    if (!marked) return py;

    return py.slice(0, idx) + marked + py.slice(idx + 1);
  };

  window.currentToneForItem = function currentToneForItem(it) {
    if (!it) return Number(state.tone || 1);
    if (it.audio && it.audio[String(state.tone)]) return Number(state.tone);
    return Number((it.tones && it.tones[0]) || state.tone || 1);
  };

  window.markedItem = function markedItem(it, tone) {
    if (!it) return '—';
    return markPinyinTone(it.pinyin, tone || currentToneForItem(it));
  };

  window.getBetterRule = function getBetterRule(it) {
    if (!it) return { rule: 'Quy tắc', hint: 'Bấm một Pinyin trong bảng để xem gợi ý.' };

    const p = it.pinyin;
    const fixed = {
      zhi: ['-i đặc biệt', 'Chữ i không đọc như yi. Nhóm đầu lưỡi sau/cuốn lưỡi.'],
      chi: ['-i đặc biệt', 'Chữ i không đọc như yi. Nhóm đầu lưỡi sau/cuốn lưỡi.'],
      shi: ['-i đặc biệt', 'Chữ i không đọc như yi. Nhóm đầu lưỡi sau/cuốn lưỡi.'],
      ri: ['-i đặc biệt', 'Chữ i không đọc như yi. Nhóm đầu lưỡi sau/cuốn lưỡi.'],
      zi: ['-i đặc biệt', 'Chữ i không đọc như yi. Nhóm đầu lưỡi trước.'],
      ci: ['-i đặc biệt', 'Chữ i không đọc như yi. Nhóm đầu lưỡi trước.'],
      si: ['-i đặc biệt', 'Chữ i không đọc như yi. Nhóm đầu lưỡi trước.'],

      ju: ['j/q/x + ü', 'Viết ju nhưng hiểu là jü. Không đọc u thường.'],
      qu: ['j/q/x + ü', 'Viết qu nhưng hiểu là qü. Không đọc u thường.'],
      xu: ['j/q/x + ü', 'Viết xu nhưng hiểu là xü. Không đọc u thường.'],
      jue: ['j/q/x + ü', 'Viết jue nhưng hiểu là jüe.'],
      que: ['j/q/x + ü', 'Viết que nhưng hiểu là qüe.'],
      xue: ['j/q/x + ü', 'Viết xue nhưng hiểu là xüe.'],
      juan: ['j/q/x + ü', 'Viết juan nhưng hiểu là jüan.'],
      quan: ['j/q/x + ü', 'Viết quan nhưng hiểu là qüan.'],
      xuan: ['j/q/x + ü', 'Viết xuan nhưng hiểu là xüan.'],
      jun: ['j/q/x + ü', 'Viết jun nhưng hiểu là jün.'],
      qun: ['j/q/x + ü', 'Viết qun nhưng hiểu là qün.'],
      xun: ['j/q/x + ü', 'Viết xun nhưng hiểu là xün.'],

      'lü': ['ü viết rõ', 'l + ü phải giữ dấu hai chấm để phân biệt với lu.'],
      'nü': ['ü viết rõ', 'n + ü phải giữ dấu hai chấm để phân biệt với nu.'],
      'lüe': ['ü viết rõ', 'l + üe phải giữ dấu hai chấm.'],
      'nüe': ['ü viết rõ', 'n + üe phải giữ dấu hai chấm.'],

      yu: ['y + ü bỏ dấu', 'yu là cách viết độc lập của ü. Âm vẫn là ü, không đọc u thường.'],
      yue: ['y + ü bỏ dấu', 'yue là cách viết độc lập của üe. Âm vẫn là ü, không đọc u thường.'],
      yuan: ['y + ü bỏ dấu', 'yuan là cách viết độc lập của üan. Âm vẫn là ü, không đọc u thường.'],
      yun: ['y + ü bỏ dấu', 'yun là cách viết độc lập của ün. Âm vẫn là ü, không đọc u thường.'],

      bo: ['o sau b/p/m/f', 'bo thường nghe gần như buo trong thực tế học phát âm.'],
      po: ['o sau b/p/m/f', 'po thường nghe gần như puo trong thực tế học phát âm.'],
      mo: ['o sau b/p/m/f', 'mo thường nghe gần như muo trong thực tế học phát âm.'],
      fo: ['o sau b/p/m/f', 'fo thường nghe gần như fuo trong thực tế học phát âm.']
    };

    if (fixed[p]) return { rule: fixed[p][0], hint: fixed[p][1] };

    if (/(iu)$/.test(p) && p.length > 2) return { rule: 'Viết tắt iou → iu', hint: `${p} là ${p.slice(0, -2)}iou viết tắt. Dấu thanh đặt trên u: liù, jiǔ.` };
    if (/(ui)$/.test(p) && p.length > 2) return { rule: 'Viết tắt uei → ui', hint: `${p} là ${p.slice(0, -2)}uei viết tắt. Dấu thanh đặt trên i: guì, duì.` };
    if (/(un)$/.test(p) && p.length > 2) return { rule: 'Viết tắt uen → un', hint: `${p} là ${p.slice(0, -2)}uen viết tắt.` };

    if (/^y/.test(p)) return { rule: 'Âm tiết không thanh mẫu', hint: 'y là quy tắc viết khi âm tiết bắt đầu bằng hệ i/ü.' };
    if (/^w/.test(p)) return { rule: 'Âm tiết không thanh mẫu', hint: 'w là quy tắc viết khi âm tiết bắt đầu bằng hệ u.' };

    if (/^[bpmdtgk]/.test(p)) return { rule: 'Cặp bật hơi/không bật hơi', hint: 'Chú ý phân biệt b/p, d/t, g/k. Đặt giấy trước miệng để test hơi.' };
    if (/^(zh|ch|sh|r)/.test(p)) return { rule: 'Âm cong lưỡi', hint: 'zh/ch/sh/r là nhóm đầu lưỡi sau/cuốn lưỡi. Dễ nhầm với z/c/s.' };
    if (/^[zcs]/.test(p)) return { rule: 'Âm lưỡi phẳng', hint: 'z/c/s là nhóm đầu lưỡi trước. Không cong lưỡi như zh/ch/sh.' };

    return { rule: it.rule || 'Ghép thường', hint: it.hint || 'Nghe thanh mẫu + vận mẫu, sau đó đọc cả âm tiết.' };
  };

  window.hero = function hero(title, subtitle, actions = '') {
    return `<section class="hero hero-compact">
      <div class="hero-main">
        <div class="kicker">Mini app học Pinyin</div>
        <h1 class="title">${title}</h1>
        <p class="subtitle">${subtitle}</p>
        ${actions ? `<div class="hero-actions">${actions}</div>` : ''}
      </div>
    </section>`;
  };

  window.toneButtons = function toneButtons(it, includeActions = false) {
    if (!it) return '';
    const currentTone = currentToneForItem(it);
    return `<div class="tone-row" style="margin-top:14px">
      ${[1, 2, 3, 4].map(t => {
        const has = it.audio && it.audio[String(t)];
        const label = markPinyinTone(it.pinyin, t);
        return `<button class="tone-btn ${currentTone === t ? 'active' : ''}" ${has ? `onclick="setTone(${t});playTone('${it.safe}',${t},this)"` : 'disabled'}>${label} 🔊</button>`;
      }).join('')}
    </div>
    ${includeActions ? `<div class="tray-actions" style="margin-top:10px">
      <button class="btn ${state.learned[it.safe] ? 'primary' : ''}" onclick="toggleLearned('${it.safe}')">✓ Đã học</button>
      <button class="btn ${state.favorite[it.safe] ? 'primary' : ''}" onclick="toggleFavorite('${it.safe}')">☆ Yêu thích</button>
      <button class="btn" onclick="markWrong('${it.safe}')">↻ Cần ôn</button>
      <button class="btn" onclick="setTab('chart')">Bảng ghép</button>
    </div>` : ''}`;
  };

  window.selectedInfoPanel = function selectedInfoPanel() {
    const it = selectedItem();
    if (!it) return '';
    const tone = currentToneForItem(it);
    const r = getBetterRule(it);
    return `<section class="selected-info-panel">
      <div>
        <div class="selected-marked">${markedItem(it, tone)}</div>
        <div class="selected-raw">${it.pinyin} · thanh ${tone}</div>
      </div>
      <div class="selected-rule">
        <b>${r.rule}</b>
        <span>${r.hint}</span>
      </div>
      <div class="selected-actions">${toneButtons(it, true)}</div>
    </section>`;
  };

  window.renderListen = function renderListen() {
    const it = selectedItem();
    const tone = currentToneForItem(it);
    const r = getBetterRule(it);
    const quick = DATA.quickGroups.map(g => `<div class="panel"><h3>${g.title}</h3><div class="chips">${g.items.map(py => chip(py)).join('')}</div></div>`).join('');
    return appShell(`
${hero('Nghe & tra âm', 'Chọn Pinyin, chọn thanh điệu rồi bấm loa. Dấu thanh sẽ tự hiển thị trên âm đang chọn.', `
  <button class="btn primary" onclick="setTab('chart')">Mở bảng ghép</button>
  <button class="btn" onclick="setTab('practice')">Luyện nghe</button>
`)}
<section class="listen-layout">
  <div class="now-card">
    <div class="now-label">Âm đang chọn</div>
    <div class="now-pinyin">${it ? markedItem(it, tone) : '—'}</div>
    <div class="now-split">${it ? `${it.pinyin} · thanh ${tone} · ${it.initialLabel || '∅'} + ${it.chartFinal}` : 'chưa chọn âm'}</div>
    <div class="rule-box">
      <div><b>Quy tắc</b><span>${r.rule}</span></div>
      <div><b>Gợi ý</b><span>${r.hint}</span></div>
    </div>
    ${it ? toneButtons(it, true) : ''}
  </div>
  <div class="control-stack">
    <div class="panel">
      <h2>Tra nhanh</h2>
      <div class="input-row">
        <input placeholder="Nhập pinyin: ma, shi, xue, lü..." value="${state.search}" oninput="state.search=this.value;saveState();renderSearchBox()" onkeydown="if(event.key==='Enter'){selectPinyin(this.value);playSelected(this)}">
        <button class="btn primary" onclick="selectPinyin(state.search);playSelected(this)">Nghe</button>
      </div>
      <div class="tone-row" style="margin-top:12px">${[1,2,3,4].map(t=>`<button class="tone-btn ${state.tone===t?'active':''}" onclick="setTone(${t})">Thanh ${t}</button>`).join('')}</div>
      <div id="searchBox">${searchBoxHtml()}</div>
    </div>
    ${quick}
  </div>
</section>`);
  };

  window.renderChart = function renderChart() {
    const it = selectedItem();
    const tone = currentToneForItem(it);
    const r = getBetterRule(it);
    const zeroItems = playableItems().filter(x => x.initial === '' || x.initial === 'y' || x.initial === 'w').slice(0, 80);
    return appShell(`
${hero('Bảng ghép Pinyin', 'Bảng tổng dễ nhìn hơn: nhóm cột rõ, thanh mẫu cố định, có lọc nhóm và panel âm đang chọn.', `
  <button class="btn primary" onclick="setTab('listen')">Nghe âm đang chọn</button>
  <button class="btn" onclick="state.hideEmpty=!state.hideEmpty;saveState();render()">Ẩn/hiện ô trống</button>
`)}
<div class="zero-strip"><b>Đứng riêng:</b>${zeroItems.map(x=>chip(x.pinyin)).join('')}</div>
<section class="chart-shell">
  <aside class="sound-tray">
    <div class="now-label">Đang chọn</div>
    <div class="tray-pinyin">${it ? markedItem(it, tone) : '—'}</div>
    <div class="tray-meta">${it ? `${it.pinyin} · thanh ${tone} · ${it.initialLabel || '∅'} + ${it.chartFinal}` : ''}</div>
    <div class="rule-box"><div><b>${r.rule}</b><span>${r.hint}</span></div></div>
    ${it ? toneButtons(it, true) : ''}
  </aside>
  <section>
    <div class="toolbar">
      <input class="search" placeholder="Tìm trong bảng: ren, ma, xue..." value="${state.search}" oninput="state.search=this.value;saveState();render()">
      <select onchange="state.initialGroup=this.value;saveState();render()">
        <option value="all">Tất cả thanh mẫu</option>
        ${DATA.initialGroups.map(g=>`<option value="${g.key}" ${state.initialGroup===g.key?'selected':''}>${g.title}</option>`).join('')}
      </select>
      <select onchange="state.finalGroup=this.value;saveState();render()">
        <option value="all">Tất cả vận mẫu</option>
        ${DATA.finalGroups.map(g=>`<option value="${g.key}" ${state.finalGroup===g.key?'selected':''}>${g.title}</option>`).join('')}
      </select>
    </div>
    <div class="legend">
      <span><i class="dot learned-dot"></i>Đã học</span>
      <span><i class="dot rule-special-dot"></i>-i đặc biệt</span>
      <span><i class="dot rule-umlaut-dot"></i>ü</span>
      <span><i class="dot rule-abbr-dot"></i>viết tắt</span>
    </div>
    ${state.search ? renderSearchResults() : renderTable(filteredInitials(), filteredFinalGroups(), itemMap())}
  </section>
</section>`);
  };

  window.renderGroups = function renderGroups() {
    return appShell(`
${hero('18 bảng nhỏ', 'Chia nhỏ theo nhóm thanh mẫu/vận mẫu để học lần lượt. Bấm một ô sẽ hiện âm có dấu thanh và quy tắc ngay phía trên.')}
${selectedInfoPanel()}
<div class="mini-list">
  ${DATA.miniTables.map(t => `<details class="mini-acc" ${t.no<=2?'open':''}>
    <summary><span class="mini-title"><span class="badge">${String(t.no).padStart(2,'0')}</span><span>${t.title}<small>${t.tip}</small></span></span></summary>
    <div class="mini-body">${renderTable(DATA.initials.filter(i=>t.initials.includes(i.key)), [{key:'mini', title:'Vận mẫu', finals:t.finals}], itemMap())}</div>
  </details>`).join('')}
</div>`);
  };

  window.ruleSection = function ruleSection(title, body, chips = []) {
    return `<details class="rule-acc" open>
      <summary>${title}</summary>
      <div class="rule-body">
        <p>${body}</p>
        ${chips.length ? `<div class="rule-tags">${chips.map(t=>chip(t)).join('')}</div>` : ''}
      </div>
    </details>`;
  };

  window.renderRules = function renderRules() {
    return appShell(`
${hero('Quy tắc Pinyin', 'Gom quy tắc vào một chỗ, đầy đủ hơn phần thẻ V12. Bấm chip để nghe ngay.')}
<div class="rules-accordion">
  ${ruleSection('1. Thanh mẫu', `
    <b>Trọng tâm:</b> phân biệt bật hơi và không bật hơi. 
    b/p/m/f; d/t/n/l; g/k/h; j/q/x; zh/ch/sh/r; z/c/s. 
    Mẹo test: đặt giấy mỏng trước miệng, p/t/k/q/ch/c làm giấy lay động rõ hơn b/d/g/j/zh/z.
  `, ['ba','pa','da','ta','ga','ka','ji','qi','zhi','chi','zi','ci'])}

  ${ruleSection('2. Vận mẫu', `
    Nhóm thường: a, o, e, ai, ei, ao, ou, an, en, ang, eng, ong.
    Hệ i: i, ia, ie, iao, iou, ian, in, iang, ing, iong.
    Hệ u: u, ua, uo, uai, uei, uan, uen, uang, ueng.
    Hệ ü: ü, üe, üan, ün.
  `, ['a','ai','ang','yi','you','wu','wang','yu','yue'])}

  ${ruleSection('3. Thanh điệu và đặt dấu', `
    Dấu thanh ưu tiên đặt trên a, o, e. Nếu là iu/ui thì đặt ở nguyên âm sau: liù, guì.
    Thanh 1 cao ngang, thanh 2 đi lên, thanh 3 xuống rồi lên, thanh 4 xuống mạnh.
  `, ['ma','mei','hao','liu','gui','ren'])}

  ${ruleSection('4. -i đặc biệt', `
    zhi/chi/shi/ri/zi/ci/si không đọc i như yi. Nhóm zh/ch/sh/r là đầu lưỡi sau/cuốn lưỡi; z/c/s là đầu lưỡi trước.
  `, ['zhi','chi','shi','ri','zi','ci','si'])}

  ${ruleSection('5. j/q/x + ü và n/l + ü', `
    j/q/x đi với ü nhưng chữ viết bỏ dấu hai chấm: ju, qu, xu, jue, que, xue...
    n/l đi với ü thì viết rõ: nü, lü, nüe, lüe để phân biệt với nu, lu.
  `, ['ju','qu','xu','jue','que','xue','nü','lü'])}

  ${ruleSection('6. Âm tiết không thanh mẫu y/w', `
    y/w là quy tắc viết khi âm tiết bắt đầu bằng hệ i/u/ü. 
    Ví dụ: yi, ya, ye, yao, you; wu, wa, wo, wei; yu, yue, yuan, yun.
  `, ['yi','ya','ye','you','wu','wa','wo','wei','yu','yue','yuan','yun'])}

  ${ruleSection('7. Viết tắt iou / uei / uen', `
    iou viết thành iu sau thanh mẫu; uei viết thành ui; uen viết thành un. 
    Khi có thanh điệu: liù, duì, dūn.
  `, ['liu','jiu','dui','gui','dun','gun'])}

  ${ruleSection('8. Nhóm dễ nhầm', `
    Cần luyện riêng: zh/ch/sh với z/c/s; n với l; an với ang; en với eng; in với ing; u với ü.
  `, ['zhi','zi','chi','ci','shi','si','na','la','an','ang','en','eng','in','ing','lu','lü'])}
</div>`);
  };

  try { render(); } catch (e) {}
})();

/* PATCH_PINYIN_V14_COMPACT_PANEL_RULES
   XieHanzi-like compact selected panel + full rules from old Pinyin HTML.
*/
(function () {
  const toneMarksV14 = {
    a: ['ā', 'á', 'ǎ', 'à'],
    o: ['ō', 'ó', 'ǒ', 'ò'],
    e: ['ē', 'é', 'ě', 'è'],
    i: ['ī', 'í', 'ǐ', 'ì'],
    u: ['ū', 'ú', 'ǔ', 'ù'],
    ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ']
  };

  function markToneV14(py, tone) {
    py = String(py || '');
    tone = Number(tone || 0);
    if (!py || ![1,2,3,4].includes(tone)) return py;

    const lower = py.toLowerCase();
    let idx = -1;
    let vowel = '';

    for (const v of ['a', 'o', 'e']) {
      idx = lower.indexOf(v);
      if (idx !== -1) {
        vowel = v;
        break;
      }
    }

    if (idx === -1) {
      if (lower.includes('iu')) {
        idx = lower.lastIndexOf('u');
        vowel = 'u';
      } else if (lower.includes('ui')) {
        idx = lower.lastIndexOf('i');
        vowel = 'i';
      } else {
        for (let i = lower.length - 1; i >= 0; i--) {
          const ch = lower[i];
          if ('iuüv'.includes(ch)) {
            idx = i;
            vowel = ch === 'v' ? 'ü' : ch;
            break;
          }
        }
      }
    }

    if (idx === -1 || !toneMarksV14[vowel]) return py;
    return py.slice(0, idx) + toneMarksV14[vowel][tone - 1] + py.slice(idx + 1);
  }

  window.markPinyinTone = markToneV14;

  function currentTone(it) {
    if (!it) return Number(state.tone || 1);
    if (it.audio && it.audio[String(state.tone)]) return Number(state.tone);
    return Number((it.tones && it.tones[0]) || state.tone || 1);
  }

  window.currentToneForItem = currentTone;

  function getRuleV14(it) {
    if (!it) return { rule: 'Quy tắc', hint: 'Bấm một Pinyin trong bảng để xem gợi ý.' };

    const p = it.pinyin;
    const fixed = {
      zhi: ['-i đặc biệt', 'Chữ i ở đây không đọc như yi. Nghe cả âm tiết, không tách i riêng.'],
      chi: ['-i đặc biệt', 'Chữ i ở đây không đọc như yi. Nghe cả âm tiết, không tách i riêng.'],
      shi: ['-i đặc biệt', 'Chữ i ở đây không đọc như yi. Nghe cả âm tiết, không tách i riêng.'],
      ri: ['-i đặc biệt', 'Chữ i ở đây không đọc như yi. Nghe cả âm tiết, không tách i riêng.'],
      zi: ['-i đặc biệt', 'Chữ i ở đây không đọc như yi. Nghe cả âm tiết, không tách i riêng.'],
      ci: ['-i đặc biệt', 'Chữ i ở đây không đọc như yi. Nghe cả âm tiết, không tách i riêng.'],
      si: ['-i đặc biệt', 'Chữ i ở đây không đọc như yi. Nghe cả âm tiết, không tách i riêng.'],

      ju: ['j/q/x + ü', 'Viết ju, hiểu âm là jü. Không đọc u thường.'],
      qu: ['j/q/x + ü', 'Viết qu, hiểu âm là qü. Không đọc u thường.'],
      xu: ['j/q/x + ü', 'Viết xu, hiểu âm là xü. Không đọc u thường.'],
      jue: ['j/q/x + ü', 'Viết jue, hiểu âm là jüe. Không đọc u thường.'],
      que: ['j/q/x + ü', 'Viết que, hiểu âm là qüe. Không đọc u thường.'],
      xue: ['j/q/x + ü', 'Viết xue, hiểu âm là xüe. Không đọc u thường.'],
      juan: ['j/q/x + ü', 'Viết juan, hiểu âm là jüan. Không đọc u thường.'],
      quan: ['j/q/x + ü', 'Viết quan, hiểu âm là qüan. Không đọc u thường.'],
      xuan: ['j/q/x + ü', 'Viết xuan, hiểu âm là xüan. Không đọc u thường.'],
      jun: ['j/q/x + ü', 'Viết jun, hiểu âm là jün. Không đọc u thường.'],
      qun: ['j/q/x + ü', 'Viết qun, hiểu âm là qün. Không đọc u thường.'],
      xun: ['j/q/x + ü', 'Viết xun, hiểu âm là xün. Không đọc u thường.'],

      'nü': ['n/l + ü', 'n/l + ü phải viết rõ dấu hai chấm để phân biệt với nu/lu.'],
      'lü': ['n/l + ü', 'n/l + ü phải viết rõ dấu hai chấm để phân biệt với nu/lu.'],
      'nüe': ['n/l + ü', 'n/l + üe phải viết rõ dấu hai chấm.'],
      'lüe': ['n/l + ü', 'n/l + üe phải viết rõ dấu hai chấm.'],

      yu: ['y/w', 'y/w là quy tắc viết cho âm tiết không có thanh mẫu thật: ü → yu.'],
      yue: ['y/w', 'yue là cách viết của üe khi đứng độc lập.'],
      yuan: ['y/w', 'yuan là cách viết của üan khi đứng độc lập.'],
      yun: ['y/w', 'yun là cách viết của ün khi đứng độc lập.'],

      bo: ['o sau b/p/m/f', 'bo thường nghe gần như buo trong thực tế học phát âm.'],
      po: ['o sau b/p/m/f', 'po thường nghe gần như puo trong thực tế học phát âm.'],
      mo: ['o sau b/p/m/f', 'mo thường nghe gần như muo trong thực tế học phát âm.'],
      fo: ['o sau b/p/m/f', 'fo thường nghe gần như fuo trong thực tế học phát âm.']
    };

    if (fixed[p]) return { rule: fixed[p][0], hint: fixed[p][1] };
    if (/(iu)$/.test(p) && p.length > 2) return { rule: 'iu / ui / un', hint: `${p} là dạng rút gọn từ iou. Ví dụ liu = liou.` };
    if (/(ui)$/.test(p) && p.length > 2) return { rule: 'iu / ui / un', hint: `${p} là dạng rút gọn từ uei. Ví dụ dui = duei.` };
    if (/(un)$/.test(p) && p.length > 2) return { rule: 'iu / ui / un', hint: `${p} là dạng rút gọn từ uen. Ví dụ gun = guen.` };
    if (/^y/.test(p)) return { rule: 'Âm tiết không thanh mẫu', hint: 'y là quy tắc viết khi âm tiết bắt đầu bằng hệ i/ü.' };
    if (/^w/.test(p)) return { rule: 'Âm tiết không thanh mẫu', hint: 'w là quy tắc viết khi âm tiết bắt đầu bằng hệ u.' };
    if (/^[bpmdtgk]/.test(p)) return { rule: 'Bật hơi / không bật hơi', hint: 'Chú ý phân biệt b/p, d/t, g/k. Đặt giấy trước miệng để test hơi.' };
    if (/^[jqx]/.test(p)) return { rule: 'j/q/x', hint: 'Âm mặt lưỡi, môi hơi dẹt. j không bật hơi, q bật hơi, x là âm sát nhẹ.' };
    if (/^(zh|ch|sh|r)/.test(p)) return { rule: 'zh/ch/sh/r', hint: 'Nhóm đầu lưỡi sau/cuốn lưỡi. Phân biệt với z/c/s.' };
    if (/^[zcs]/.test(p)) return { rule: 'z/c/s', hint: 'Nhóm đầu lưỡi trước. Không cong lưỡi như zh/ch/sh/r.' };
    if (/(ang|eng|ong)$/.test(p)) return { rule: 'Âm mũi sau', hint: 'Chú ý phần cuối -ng, không đọc giống -n.' };
    if (/(an|en|in|un|ün)$/.test(p)) return { rule: 'Âm mũi trước', hint: 'Chú ý phần cuối -n, phân biệt với -ng.' };
    return { rule: it.rule || 'Âm tiết thường', hint: it.hint || 'Ghép thanh mẫu + vận mẫu theo bảng.' };
  }

  window.getBetterRule = getRuleV14;

  function ensureCompactPanel() {
    let panel = document.getElementById('pinyinCompactPanel');
    if (panel) return panel;

    panel = document.createElement('section');
    panel.id = 'pinyinCompactPanel';
    panel.className = 'pinyin-compact-panel';
    panel.innerHTML = `
      <button class="pc-close" type="button" aria-label="Đóng">×</button>
      <div class="pc-left">
        <div class="pc-marked">—</div>
        <div class="pc-raw">chưa chọn âm</div>
      </div>
      <div class="pc-rule">
        <b>Quy tắc</b>
        <span>Bấm một Pinyin trong bảng để xem gợi ý.</span>
      </div>
      <div class="pc-tones"></div>
    `;

    document.body.appendChild(panel);

    panel.querySelector('.pc-close').addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      hideCompactPanel();
    });

    return panel;
  }

  function showCompactPanelFor(it, tone) {
    if (!it) return;

    const panel = ensureCompactPanel();
    tone = Number(tone || currentTone(it));
    const r = getRuleV14(it);

    panel.querySelector('.pc-marked').textContent = markToneV14(it.pinyin, tone);
    panel.querySelector('.pc-raw').textContent = `${it.pinyin} · thanh ${tone}`;
    panel.querySelector('.pc-rule b').textContent = r.rule;
    panel.querySelector('.pc-rule span').textContent = r.hint;

    const tones = panel.querySelector('.pc-tones');
    tones.innerHTML = [1, 2, 3, 4].map(t => {
      const has = it.audio && it.audio[String(t)];
      return `<button type="button" class="pc-tone ${tone === t ? 'active' : ''}" data-safe="${it.safe}" data-tone="${t}" ${has ? '' : 'disabled'}>${markToneV14(it.pinyin, t)} 🔊</button>`;
    }).join('');

    tones.querySelectorAll('.pc-tone').forEach(btn => {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const safe = this.dataset.safe;
        const t = Number(this.dataset.tone);
        if (typeof setTone === 'function') setTone(t);
        if (typeof playTone === 'function') playTone(safe, t, this);
        const next = itemBySafe(safe);
        setTimeout(() => showCompactPanelFor(next, t), 40);
      });
    });

    panel.classList.add('show');
  }

  function hideCompactPanel() {
    const panel = document.getElementById('pinyinCompactPanel');
    if (panel) panel.classList.remove('show');
  }

  window.hidePinyinCompactPanel = hideCompactPanel;
  window.showPinyinCompactPanelFor = showCompactPanelFor;

  // Gọn hero, bỏ stats hero vì sidebar đã có.
  window.hero = function hero(title, subtitle, actions = '') {
    return `<section class="hero hero-compact">
      <div class="hero-main">
        <div class="kicker">Mini app học Pinyin</div>
        <h1 class="title">${title}</h1>
        <p class="subtitle">${subtitle}</p>
        ${actions ? `<div class="hero-actions">${actions}</div>` : ''}
      </div>
    </section>`;
  };

  // Không render panel dày cũ trong 18 bảng.
  window.selectedInfoPanel = function selectedInfoPanel() {
    return '';
  };

  // Wrap các hàm click/nghe để hiện panel nhỏ.
  const oldSelectItem = window.selectItem;
  window.selectItem = function (safe) {
    if (oldSelectItem) oldSelectItem(safe);
    setTimeout(() => {
      const it = itemBySafe(safe);
      if (it) showCompactPanelFor(it, currentTone(it));
    }, 40);
  };

  const oldPlayTone = window.playTone;
  window.playTone = function (safe, tone, btn) {
    if (oldPlayTone) oldPlayTone(safe, tone, btn);
    setTimeout(() => {
      const it = itemBySafe(safe);
      if (it) showCompactPanelFor(it, Number(tone || currentTone(it)));
    }, 40);
  };

  const oldSetTone = window.setTone;
  window.setTone = function (tone) {
    if (oldSetTone) oldSetTone(tone);
    setTimeout(() => {
      const it = selectedItem && selectedItem();
      if (it) {
        const panel = document.getElementById('pinyinCompactPanel');
        if (panel && panel.classList.contains('show')) showCompactPanelFor(it, Number(tone));
      }
    }, 40);
  };

  function ruleAcc(title, body, inner = '') {
    return `<details class="rule-acc" open>
      <summary>${title}</summary>
      <div class="rule-body">${body}${inner}</div>
    </details>`;
  }

  function miniGrid(items) {
    return `<div class="rule-mini-grid">${items.map(x => `<div class="rule-mini"><b>${x[0]}</b><span>${x[1]}</span></div>`).join('')}</div>`;
  }

  function chipRow(arr) {
    return `<div class="rule-tags">${arr.map(t => chip(t)).join('')}</div>`;
  }

  window.renderRules = function renderRules() {
    return appShell(`
${hero('Quy tắc phát âm Pinyin', 'Tất cả quy tắc được gom vào một chỗ. Bấm từng mục để sổ xuống xem, không cần kéo qua nhiều phần rời rạc.')}
<div class="rules-accordion rules-full">
  ${ruleAcc('Thanh mẫu', `
    <p><b>Trọng tâm:</b> phân biệt âm <b>bật hơi</b> và <b>không bật hơi</b>. Ví dụ tiếng Việt chỉ để hình dung gần đúng, không thay thế âm chuẩn.</p>
    ${miniGrid([
      ['b / p / m / f', 'b gần p nhẹ không bật hơi; p bật hơi mạnh; m gần m; f gần ph.'],
      ['d / t / n / l', 'd gần t nhẹ không bật hơi; t bật hơi mạnh; n/l gần tiếng Việt.'],
      ['g / k / h', 'g gần c/k không bật hơi; k bật hơi mạnh; h hơi sát từ cuống họng.'],
      ['j / q / x', 'Âm mặt lưỡi, môi hơi dẹt. j không bật hơi, q bật hơi, x không đọc giống hẳn x tiếng Việt.'],
      ['zh / ch / sh / r', 'Nhóm đầu lưỡi sau/cuốn lưỡi. zh không bật hơi, ch bật hơi, sh sát, r không rung mạnh.'],
      ['z / c / s', 'Nhóm đầu lưỡi trước. z không bật hơi, c bật hơi, s sát nhẹ.']
    ])}
    <p><b>Mẹo test:</b> đặt giấy mỏng trước miệng. p/t/k/q/ch/c phải làm giấy lay động rõ hơn b/d/g/j/zh/z.</p>
  `)}

  ${ruleAcc('Vận mẫu', `
    <p><b>Trọng tâm:</b> nhận diện nhóm vần để ghép đúng và viết đúng.</p>
    ${miniGrid([
      ['Nhóm thường', 'a, o, e, ai, ei, ao, ou, an, en, ang, eng, ong.'],
      ['Hệ i', 'i, ia, ie, iao, iou, ian, in, iang, ing, iong.'],
      ['Hệ u', 'u, ua, uo, uai, uei, uan, uen, uang, ueng.'],
      ['Hệ ü', 'ü, üe, üan, ün. Môi tròn như u nhưng lưỡi hướng âm i.']
    ])}
    <ul>
      <li><b>ian</b> nghe gần “iên”, không đọc tách cứng i-an.</li>
      <li><b>ing</b> nghe gần “inh”.</li>
      <li><b>ong</b> nghe gần “ung”.</li>
      <li><b>e</b> gần giữa “ơ/ưa”, không nên Việt hóa quá cứng.</li>
    </ul>
  `)}

  ${ruleAcc('Đặc biệt', `
    ${miniGrid([
      ['-i đặc biệt', 'zhi / chi / shi / ri / zi / ci / si. Chữ i ở đây không đọc như yi.'],
      ['j/q/x + ü', 'viết ju / qu / xu nhưng hiểu là jü / qü / xü. Không đọc u thường.'],
      ['n/l + ü', 'phải viết rõ nü / lü để phân biệt với nu / lu.'],
      ['Rút gọn', 'iou → iu, uei → ui, uen → un sau thanh mẫu. Ví dụ: liu = liou, dui = duei, gun = guen.'],
      ['y/w', 'quy tắc viết cho âm tiết không có thanh mẫu thật: i → yi, u → wu, ü → yu.']
    ])}
    <p><b>Nên luyện riêng:</b> zhi ↔ zi, chi ↔ ci, shi ↔ si, ju/qu/xu, lü/nü.</p>
    ${chipRow(['zhi','zi','chi','ci','shi','si','ju','qu','xu','lü','nü'])}
  `)}

  ${ruleAcc('Biến điệu', `
    <p>Biến điệu là thay đổi cách đọc trong câu, nhưng thường không đổi cách viết Pinyin gốc trong từ điển.</p>
    <ul>
      <li><b>Thanh 3 + thanh 3:</b> thanh 3 thứ nhất đọc gần thành thanh 2. Ví dụ: nǐ hǎo đọc gần như ní hǎo.</li>
      <li><b>一 yī:</b> trước thanh 4 thường đọc thành yí; trước thanh 1/2/3 thường đọc thành yì; đứng riêng vẫn yī.</li>
      <li><b>不 bù:</b> trước thanh 4 đọc thành bú. Ví dụ: bù shì đọc thành bú shì.</li>
    </ul>
  `)}

  ${ruleAcc('Lỗi dễ sai', `
    <ul>
      <li>Đọc b/d/g thành bờ/đờ/gờ tiếng Việt quá rõ.</li>
      <li>Không bật hơi đủ ở p/t/k/q/ch/c.</li>
      <li>Lẫn z/c/s với zh/ch/sh/r.</li>
      <li>Đọc zhi/chi/shi/ri/zi/ci/si như i thường.</li>
      <li>Đọc ju/qu/xu/xue/juan/qun theo u thường, quên âm ü.</li>
      <li>Đọc iu/ui/un theo mặt chữ quá ngắn, quên gốc iou/uei/uen.</li>
      <li>Chỉ nhìn chữ mà không nghe lại audio mẫu.</li>
    </ul>
  `)}
</div>`);
  };

  document.addEventListener('click', function (e) {
    const panel = document.getElementById('pinyinCompactPanel');
    if (!panel || !panel.classList.contains('show')) return;

    const keep = e.target.closest(
      '#pinyinCompactPanel, .syllable, .chip, .tone-btn, .btn, input, select, summary, .nav-btn, .tt-module-top-nav'
    );

    if (!keep) hideCompactPanel();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hideCompactPanel();
  });

  setTimeout(ensureCompactPanel, 300);
  try { render(); } catch (e) {}
})();

/* PATCH_PINYIN_V15_COMPACT_RULES_TAB
   Compact selected panel + full pronunciation rules tab.
*/
(function () {
  function v15ToneMark(py, tone) {
    py = String(py || '');
    tone = Number(tone || 0);
    if (!py || tone < 1 || tone > 4) return py;

    const marks = {
      a: ['ā', 'á', 'ǎ', 'à'],
      o: ['ō', 'ó', 'ǒ', 'ò'],
      e: ['ē', 'é', 'ě', 'è'],
      i: ['ī', 'í', 'ǐ', 'ì'],
      u: ['ū', 'ú', 'ǔ', 'ù'],
      ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ']
    };

    const low = py.toLowerCase();
    let idx = -1;
    let v = '';

    for (const x of ['a', 'o', 'e']) {
      idx = low.indexOf(x);
      if (idx >= 0) {
        v = x;
        break;
      }
    }

    if (idx < 0 && low.includes('iu')) {
      idx = low.indexOf('iu') + 1;
      v = 'u';
    } else if (idx < 0 && low.includes('ui')) {
      idx = low.indexOf('ui') + 1;
      v = 'i';
    }

    if (idx < 0) {
      for (let i = low.length - 1; i >= 0; i--) {
        const c = low[i];
        if ('iuüv'.includes(c)) {
          idx = i;
          v = c === 'v' ? 'ü' : c;
          break;
        }
      }
    }

    if (idx < 0 || !marks[v]) return py;
    return py.slice(0, idx) + marks[v][tone - 1] + py.slice(idx + 1);
  }

  window.markPinyinTone = v15ToneMark;

  function v15Tone(it) {
    if (!it) return Number(state.tone || 1);
    if (it.audio && it.audio[String(state.tone)]) return Number(state.tone);
    return Number((it.tones && it.tones[0]) || state.tone || 1);
  }

  window.currentToneForItem = v15Tone;

  function v15Rule(it) {
    if (!it) return { rule: 'Quy tắc', hint: 'Bấm một Pinyin trong bảng để xem gợi ý.' };

    const p = it.pinyin;
    const fixed = {
      zhi: ['-i đặc biệt', 'Chữ i ở đây không đọc như yi. Nghe cả âm tiết, không tách i riêng.'],
      chi: ['-i đặc biệt', 'Chữ i ở đây không đọc như yi. Nghe cả âm tiết, không tách i riêng.'],
      shi: ['-i đặc biệt', 'Chữ i ở đây không đọc như yi. Nghe cả âm tiết, không tách i riêng.'],
      ri: ['-i đặc biệt', 'Chữ i ở đây không đọc như yi. Nghe cả âm tiết, không tách i riêng.'],
      zi: ['-i đặc biệt', 'Chữ i ở đây không đọc như yi. Nghe cả âm tiết, không tách i riêng.'],
      ci: ['-i đặc biệt', 'Chữ i ở đây không đọc như yi. Nghe cả âm tiết, không tách i riêng.'],
      si: ['-i đặc biệt', 'Chữ i ở đây không đọc như yi. Nghe cả âm tiết, không tách i riêng.'],

      ju: ['j/q/x + ü', 'Viết ju nhưng hiểu là jü. Không đọc u thường.'],
      qu: ['j/q/x + ü', 'Viết qu nhưng hiểu là qü. Không đọc u thường.'],
      xu: ['j/q/x + ü', 'Viết xu nhưng hiểu là xü. Không đọc u thường.'],
      jue: ['j/q/x + ü', 'Viết jue nhưng hiểu là jüe. Không đọc u thường.'],
      que: ['j/q/x + ü', 'Viết que nhưng hiểu là qüe. Không đọc u thường.'],
      xue: ['j/q/x + ü', 'Viết xue nhưng hiểu là xüe. Không đọc u thường.'],
      juan: ['j/q/x + ü', 'Viết juan nhưng hiểu là jüan. Không đọc u thường.'],
      quan: ['j/q/x + ü', 'Viết quan nhưng hiểu là qüan. Không đọc u thường.'],
      xuan: ['j/q/x + ü', 'Viết xuan nhưng hiểu là xüan. Không đọc u thường.'],
      jun: ['j/q/x + ü', 'Viết jun nhưng hiểu là jün. Không đọc u thường.'],
      qun: ['j/q/x + ü', 'Viết qun nhưng hiểu là qün. Không đọc u thường.'],
      xun: ['j/q/x + ü', 'Viết xun nhưng hiểu là xün. Không đọc u thường.'],

      'nü': ['n/l + ü', 'n/l + ü phải viết rõ nü / lü để phân biệt với nu / lu.'],
      'lü': ['n/l + ü', 'n/l + ü phải viết rõ nü / lü để phân biệt với nu / lu.'],
      'nüe': ['n/l + ü', 'n/l + üe phải viết rõ dấu hai chấm.'],
      'lüe': ['n/l + ü', 'n/l + üe phải viết rõ dấu hai chấm.'],

      yu: ['y / w', 'y/w là quy tắc viết cho âm tiết không có thanh mẫu thật: ü → yu.'],
      yue: ['y / w', 'yue là cách viết của üe khi đứng độc lập.'],
      yuan: ['y / w', 'yuan là cách viết của üan khi đứng độc lập.'],
      yun: ['y / w', 'yun là cách viết của ün khi đứng độc lập.']
    };

    if (fixed[p]) return { rule: fixed[p][0], hint: fixed[p][1] };
    if (/(iu)$/.test(p) && p.length > 2) return { rule: 'iu / ui / un', hint: `${p} là dạng rút gọn từ iou. Ví dụ: liu = liou.` };
    if (/(ui)$/.test(p) && p.length > 2) return { rule: 'iu / ui / un', hint: `${p} là dạng rút gọn từ uei. Ví dụ: dui = duei.` };
    if (/(un)$/.test(p) && p.length > 2) return { rule: 'iu / ui / un', hint: `${p} là dạng rút gọn từ uen. Ví dụ: gun = guen.` };
    if (/^y/.test(p)) return { rule: 'Âm tiết không thanh mẫu', hint: 'y là quy tắc viết khi âm tiết bắt đầu bằng hệ i/ü.' };
    if (/^w/.test(p)) return { rule: 'Âm tiết không thanh mẫu', hint: 'w là quy tắc viết khi âm tiết bắt đầu bằng hệ u.' };
    if (/^[bpmdtgk]/.test(p)) return { rule: 'Bật hơi / không bật hơi', hint: 'Chú ý phân biệt b/p, d/t, g/k. Đặt giấy trước miệng để test hơi.' };
    if (/^[jqx]/.test(p)) return { rule: 'j / q / x', hint: 'Âm mặt lưỡi, môi hơi dẹt. j không bật hơi, q bật hơi.' };
    if (/^(zh|ch|sh|r)/.test(p)) return { rule: 'zh / ch / sh / r', hint: 'Nhóm đầu lưỡi sau/cuốn lưỡi. Phân biệt với z/c/s.' };
    if (/^[zcs]/.test(p)) return { rule: 'z / c / s', hint: 'Nhóm đầu lưỡi trước. Không cong lưỡi như zh/ch/sh/r.' };
    if (/(ang|eng|ong)$/.test(p)) return { rule: 'Âm mũi sau', hint: 'Chú ý phần cuối -ng, không đọc giống -n.' };
    if (/(an|en|in|un|ün)$/.test(p)) return { rule: 'Âm mũi trước', hint: 'Chú ý phần cuối -n, phân biệt với -ng.' };
    return { rule: it.rule || 'Ghép thường', hint: it.hint || 'Ghép thanh mẫu + vận mẫu, sau đó đọc cả âm tiết.' };
  }

  window.getBetterRule = v15Rule;

  function panel() {
    let p = document.getElementById('pinyinCompactPanel');
    if (p) return p;

    p = document.createElement('section');
    p.id = 'pinyinCompactPanel';
    p.className = 'pinyin-compact-panel';
    p.innerHTML = `
      <button class="pc-close" type="button" aria-label="Đóng">×</button>
      <div class="pc-main">
        <span class="pc-marked">—</span>
        <span class="pc-raw">chưa chọn âm</span>
      </div>
      <div class="pc-rule"><b>Quy tắc</b><span>Bấm một Pinyin trong bảng để xem gợi ý.</span></div>
      <div class="pc-tones"></div>
    `;
    document.body.appendChild(p);

    p.querySelector('.pc-close').addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      hidePanel();
    });

    return p;
  }

  function showPanel(it, tone) {
    if (!it) return;
    const p = panel();
    tone = Number(tone || v15Tone(it));
    const r = v15Rule(it);

    p.querySelector('.pc-marked').textContent = v15ToneMark(it.pinyin, tone);
    p.querySelector('.pc-raw').textContent = `${it.pinyin} · thanh ${tone}`;
    p.querySelector('.pc-rule b').textContent = r.rule;
    p.querySelector('.pc-rule span').textContent = r.hint;

    p.querySelector('.pc-tones').innerHTML = [1,2,3,4].map(t => {
      const has = it.audio && it.audio[String(t)];
      return `<button type="button" class="pc-tone ${tone === t ? 'active' : ''}" data-safe="${it.safe}" data-tone="${t}" ${has ? '' : 'disabled'}>${v15ToneMark(it.pinyin, t)} 🔊</button>`;
    }).join('');

    p.querySelectorAll('.pc-tone').forEach(btn => {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const safe = this.dataset.safe;
        const t = Number(this.dataset.tone);
        if (typeof setTone === 'function') setTone(t);
        if (typeof playTone === 'function') playTone(safe, t, this);
        const next = itemBySafe(safe);
        setTimeout(() => showPanel(next, t), 40);
      });
    });

    p.classList.add('show');
  }

  function hidePanel() {
    const p = document.getElementById('pinyinCompactPanel');
    if (p) p.classList.remove('show');
  }

  window.showPinyinCompactPanelV15 = showPanel;
  window.hidePinyinCompactPanel = hidePanel;

  window.hero = function hero(title, subtitle, actions = '') {
    return `<section class="hero hero-compact">
      <div class="hero-main">
        <div class="kicker">Mini app học Pinyin</div>
        <h1 class="title">${title}</h1>
        <p class="subtitle">${subtitle}</p>
        ${actions ? `<div class="hero-actions">${actions}</div>` : ''}
      </div>
    </section>`;
  };

  window.selectedInfoPanel = function selectedInfoPanel() {
    return '';
  };

  window.toneButtons = function toneButtons(it, includeActions = false) {
    if (!it) return '';
    const current = v15Tone(it);
    return `<div class="tone-row" style="margin-top:10px">
      ${[1,2,3,4].map(t => {
        const has = it.audio && it.audio[String(t)];
        return `<button class="tone-btn ${current === t ? 'active' : ''}" ${has ? `onclick="setTone(${t});playTone('${it.safe}',${t},this)"` : 'disabled'}>${v15ToneMark(it.pinyin,t)} 🔊</button>`;
      }).join('')}
    </div>
    ${includeActions ? `<div class="tray-actions">
      <button class="btn ${state.learned[it.safe] ? 'primary' : ''}" onclick="toggleLearned('${it.safe}')">✓ Đã học</button>
      <button class="btn ${state.favorite[it.safe] ? 'primary' : ''}" onclick="toggleFavorite('${it.safe}')">☆ Yêu thích</button>
      <button class="btn" onclick="markWrong('${it.safe}')">↻ Cần ôn</button>
      <button class="btn" onclick="setTab('chart')">Bảng ghép</button>
    </div>` : ''}`;
  };

  window.renderListen = function renderListen() {
    const it = selectedItem();
    const tone = v15Tone(it);
    const r = v15Rule(it);
    const quick = DATA.quickGroups.map(g => `<div class="panel"><h3>${g.title}</h3><div class="chips">${g.items.map(py => chip(py)).join('')}</div></div>`).join('');
    return appShell(`
${hero('Nghe & tra âm', 'Chọn Pinyin, chọn thanh điệu rồi bấm loa. Dấu thanh tự hiện, panel nhỏ chỉ xuất hiện khi click/nghe.', `
  <button class="btn primary" onclick="setTab('chart')">Mở bảng ghép</button>
  <button class="btn" onclick="setTab('practice')">Luyện nghe</button>
`)}
<section class="listen-layout">
  <div class="now-card now-card-slim">
    <div class="now-label">Âm đang chọn</div>
    <div class="now-pinyin">${it ? v15ToneMark(it.pinyin, tone) : '—'}</div>
    <div class="now-split">${it ? `${it.pinyin} · thanh ${tone} · ${it.initialLabel || '∅'} + ${it.chartFinal}` : 'chưa chọn âm'}</div>
    <div class="rule-box">
      <div><b>${r.rule}</b><span>${r.hint}</span></div>
    </div>
    ${it ? toneButtons(it, true) : ''}
  </div>
  <div class="control-stack">
    <div class="panel">
      <h2>Tra nhanh</h2>
      <div class="input-row">
        <input placeholder="Nhập pinyin: ma, shi, xue, lü..." value="${state.search}" oninput="state.search=this.value;saveState();renderSearchBox()" onkeydown="if(event.key==='Enter'){selectPinyin(this.value);playSelected(this)}">
        <button class="btn primary" onclick="selectPinyin(state.search);playSelected(this)">Nghe</button>
      </div>
      <div class="tone-row" style="margin-top:10px">${[1,2,3,4].map(t=>`<button class="tone-btn ${state.tone===t?'active':''}" onclick="setTone(${t})">Thanh ${t}</button>`).join('')}</div>
      <div id="searchBox">${searchBoxHtml()}</div>
    </div>
    ${quick}
  </div>
</section>`);
  };

  const oldSelectItem = window.selectItem;
  window.selectItem = function (safe) {
    if (oldSelectItem) oldSelectItem(safe);
    setTimeout(() => {
      const it = itemBySafe(safe);
      if (it) showPanel(it, v15Tone(it));
    }, 70);
  };

  const oldPlayTone = window.playTone;
  window.playTone = function (safe, tone, btn) {
    if (oldPlayTone) oldPlayTone(safe, tone, btn);
    setTimeout(() => {
      const it = itemBySafe(safe);
      if (it) showPanel(it, Number(tone || v15Tone(it)));
    }, 70);
  };

  const oldSetTone = window.setTone;
  window.setTone = function (tone) {
    if (oldSetTone) oldSetTone(tone);
    setTimeout(() => {
      const it = selectedItem && selectedItem();
      const p = document.getElementById('pinyinCompactPanel');
      if (it && p && p.classList.contains('show')) showPanel(it, Number(tone));
    }, 70);
  };

  function ruleAcc(title, body) {
    return `<details class="rule-acc" open><summary>${title}</summary><div class="rule-body">${body}</div></details>`;
  }

  function miniGrid(items) {
    return `<div class="rule-mini-grid">${items.map(x => `<div class="rule-mini"><b>${x[0]}</b><span>${x[1]}</span></div>`).join('')}</div>`;
  }

  function chipRow(items) {
    return `<div class="rule-tags">${items.map(t => chip(t)).join('')}</div>`;
  }

  window.renderRules = function renderRules() {
    return appShell(`
${hero('Quy tắc phát âm Pinyin', 'Tất cả quy tắc được gom vào một chỗ. Bấm từng mục để sổ xuống xem, không cần kéo qua nhiều phần rời rạc.')}
<div class="rule-tabs"><button class="rule-tab active">Quy tắc phát âm</button></div>
<div class="rules-accordion rules-full">
  ${ruleAcc('Thanh mẫu', `
    <p><b>Trọng tâm:</b> phân biệt âm bật hơi và không bật hơi. Ví dụ tiếng Việt chỉ để hình dung gần đúng, không thay thế âm chuẩn.</p>
    ${miniGrid([
      ['b / p / m / f', 'b gần p nhẹ không bật hơi; p bật hơi mạnh; m gần m; f gần ph.'],
      ['d / t / n / l', 'd gần t nhẹ không bật hơi; t bật hơi mạnh; n/l gần tiếng Việt.'],
      ['g / k / h', 'g gần c/k không bật hơi; k bật hơi mạnh; h hơi sát từ cuống họng.'],
      ['j / q / x', 'Âm mặt lưỡi, môi hơi dẹt. j không bật hơi, q bật hơi, x không đọc giống hẳn x tiếng Việt.'],
      ['zh / ch / sh / r', 'Nhóm đầu lưỡi sau/cuốn lưỡi. zh không bật hơi, ch bật hơi, sh sát, r không rung mạnh.'],
      ['z / c / s', 'Nhóm đầu lưỡi trước. z không bật hơi, c bật hơi, s sát nhẹ.']
    ])}
    <p><b>Mẹo test:</b> đặt giấy mỏng trước miệng. p/t/k/q/ch/c phải làm giấy lay động rõ hơn b/d/g/j/zh/z.</p>
  `)}

  ${ruleAcc('Vận mẫu', `
    <p><b>Trọng tâm:</b> nhận diện nhóm vần để ghép đúng và viết đúng.</p>
    ${miniGrid([
      ['Nhóm thường', 'a, o, e, ai, ei, ao, ou, an, en, ang, eng, ong.'],
      ['Hệ i', 'i, ia, ie, iao, iou, ian, in, iang, ing, iong.'],
      ['Hệ u', 'u, ua, uo, uai, uei, uan, uen, uang, ueng.'],
      ['Hệ ü', 'ü, üe, üan, ün. Môi tròn như u nhưng lưỡi hướng âm i.']
    ])}
    <ul>
      <li><b>ian</b> nghe gần “iên”, không đọc tách cứng i-an.</li>
      <li><b>ing</b> nghe gần “inh”.</li>
      <li><b>ong</b> nghe gần “ung”.</li>
      <li><b>e</b> gần giữa “ơ/ưa”, không nên Việt hóa quá cứng.</li>
    </ul>
  `)}

  ${ruleAcc('Đặc biệt', `
    ${miniGrid([
      ['-i đặc biệt', 'zhi / chi / shi / ri / zi / ci / si. Chữ i ở đây không đọc như yi.'],
      ['j/q/x + ü', 'viết ju / qu / xu nhưng hiểu là jü / qü / xü. Không đọc u thường.'],
      ['n/l + ü', 'phải viết rõ nü / lü để phân biệt với nu / lu.'],
      ['Rút gọn', 'iou → iu, uei → ui, uen → un sau thanh mẫu. Ví dụ: liu = liou, dui = duei, gun = guen.'],
      ['y/w', 'quy tắc viết cho âm tiết không có thanh mẫu thật: i → yi, u → wu, ü → yu.']
    ])}
    <p><b>Nên luyện riêng:</b> zhi ↔ zi, chi ↔ ci, shi ↔ si, ju/qu/xu, lü/nü.</p>
    ${chipRow(['zhi','zi','chi','ci','shi','si','ju','qu','xu','lü','nü'])}
  `)}

  ${ruleAcc('Biến điệu', `
    <p>Biến điệu là thay đổi cách đọc trong câu, nhưng thường không đổi cách viết Pinyin gốc trong từ điển.</p>
    <ul>
      <li><b>Thanh 3 + thanh 3:</b> thanh 3 thứ nhất đọc gần thành thanh 2. Ví dụ: nǐ hǎo đọc gần như ní hǎo.</li>
      <li><b>一 yī:</b> trước thanh 4 thường đọc thành yí; trước thanh 1/2/3 thường đọc thành yì; đứng riêng vẫn yī.</li>
      <li><b>不 bù:</b> trước thanh 4 đọc thành bú. Ví dụ: bù shì đọc thành bú shì.</li>
    </ul>
  `)}

  ${ruleAcc('Lỗi dễ sai', `
    <ul>
      <li>Đọc b/d/g thành bờ/đờ/gờ tiếng Việt quá rõ.</li>
      <li>Không bật hơi đủ ở p/t/k/q/ch/c.</li>
      <li>Lẫn z/c/s với zh/ch/sh/r.</li>
      <li>Đọc zhi/chi/shi/ri/zi/ci/si như i thường.</li>
      <li>Đọc ju/qu/xu/xue/juan/qun theo u thường, quên âm ü.</li>
      <li>Đọc iu/ui/un theo mặt chữ quá ngắn, quên gốc iou/uei/uen.</li>
      <li>Chỉ nhìn chữ mà không nghe lại audio mẫu.</li>
    </ul>
  `)}
</div>`);
  };

  document.addEventListener('click', function (e) {
    const p = document.getElementById('pinyinCompactPanel');
    if (!p || !p.classList.contains('show')) return;
    const keep = e.target.closest('#pinyinCompactPanel, .syllable, .chip, .tone-btn, .pc-tone, .btn, input, select, summary, .nav-btn, .tt-module-top-nav');
    if (!keep) hidePanel();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hidePanel();
  });

  setTimeout(panel, 300);
  try { render(); } catch (e) {}
})();

/* PATCH_PINYIN_V16_FULL_RULES_MD
   Full rules from markdown, closed accordion by default.
*/
(function () {
  const RULES_HTML_V16 = "<div class=\"rule-tabs rule-tabs-v16\">\n  <button class=\"rule-tab active\" type=\"button\">Quy tắc phát âm</button>\n</div>\n<div class=\"rules-accordion rules-full rules-md-v16\">\n  <details class=\"rule-acc rule-md-section\">\n  <summary>\n    <span class=\"rule-no\">01</span>\n    <span class=\"rule-title-text\">Tổng quan</span>\n  </summary>\n  <div class=\"rule-body rule-md-body\">\n    <p>Dưới đây là cẩm nang hướng dẫn toàn diện và chi tiết nhất về <strong>quy tắc phát âm Pinyin (Bính âm)</strong> trong tiếng Trung, được đối chiếu trực tiếp dựa trên bảng hệ thống phiên âm đầy đủ trong file <strong>image.png</strong> của bạn.</p>\n<p>Hệ thống Pinyin được cấu thành từ: <strong>Thanh mẫu</strong> (Phụ âm bắt đầu), <strong>Vận mẫu</strong> (Nguyên âm/Vần phía sau), <strong>Thanh điệu</strong> (Dấu) và các <strong>Biến điệu/Bất quy tắc</strong> khi ghép âm.</p>\n<hr class=\"rule-sep\" />\n  </div>\n</details><details class=\"rule-acc rule-md-section\">\n  <summary>\n    <span class=\"rule-no\">02</span>\n    <span class=\"rule-title-text\">QUY TẮC ĐỌC THANH MẪU (PHỤ ÂM)</span>\n  </summary>\n  <div class=\"rule-body rule-md-body\">\n    <p>Hệ thống gồm 21 thanh mẫu (và 2 bán nguyên âm <code>y</code>, <code>w</code> ở dòng cuối cùng). Để dễ học, ta chia theo nhóm phương thức phát âm:</p>\n<h3>1. Nhóm âm môi &amp; môi răng (<code>b</code>, <code>p</code>, <code>m</code>, <code>f</code>)</h3>\n<ul>\n<li><strong>b</strong>: Đọc như <strong>&quot;p&quot;</strong> (âm bẹt môi, không bật hơi, giống chữ <em>p</em> trong &quot;pin&quot; tiếng Anh hoặc gần giống <em>p</em> tiếng Việt). <em>Ví dụ: ba → đọc giống &quot;pa&quot;.</em></li>\n<li><strong>p</strong>: Đọc như <strong>&quot;p&quot; bật hơi thật mạnh</strong> (mím môi tích hơi rồi bật ra làm rung không khí). <em>Ví dụ: pa → &quot;p&#x27;a&quot;.</em></li>\n<li><strong>m</strong>: Đọc giống <strong>&quot;m&quot;</strong> tiếng Việt.</li>\n<li><strong>f</strong>: Đọc giống <strong>&quot;ph&quot;</strong> tiếng Việt.</li>\n</ul>\n<h3>2. Nhóm âm đầu lưỡi giữa (<code>d</code>, <code>t</code>, <code>n</code>, <code>l</code>)</h3>\n<ul>\n<li><strong>d</strong>: Đọc như <strong>&quot;t&quot;</strong> tiếng Việt (không bật hơi). <em>Ví dụ: da → đọc giống &quot;ta&quot;.</em></li>\n<li><strong>t</strong>: Đọc như <strong>&quot;t&quot; bật hơi thật mạnh</strong> (gần giống chữ <em>th</em> tiếng Việt nhưng xả hơi mạnh từ đầu lưỡi). <em>Ví dụ: ta → &quot;t&#x27;a&quot;.</em></li>\n<li><strong>n</strong>: Đọc giống <strong>&quot;n&quot;</strong> tiếng Việt.</li>\n<li><strong>l</strong>: Đọc giống <strong>&quot;l&quot;</strong> tiếng Việt.</li>\n</ul>\n<h3>3. Nhóm âm gốc lưỡi (<code>g</code>, <code>k</code>, <code>h</code>)</h3>\n<ul>\n<li><strong>g</strong>: Đọc như <strong>&quot;c/k&quot;</strong> tiếng Việt (không bật hơi). <em>Ví dụ: ga → đọc giống &quot;ca&quot;.</em></li>\n<li><strong>k</strong>: Đọc như <strong>&quot;kh&quot; nhưng bật hơi rất mạnh</strong> từ cuống họng.</li>\n<li><strong>h</strong>: Đọc như giữa <strong>&quot;h&quot;</strong> và <strong>&quot;kh&quot;</strong> (hơi thở ra nhẹ nhàng từ cuống họng, giống chữ <em>h</em> trong tiếng Anh nhưng sát nhẹ hơn).</li>\n</ul>\n<h3>4. Nhóm âm mặt lưỡi (<code>j</code>, <code>q</code>, <code>x</code>) – <em>Chỉ đi với dòng vận mẫu bắt đầu bằng <code>i</code> và <code>ü</em></code></h3>\n<ul>\n<li><strong>j</strong>: Đọc giống <strong>&quot;ch&quot;</strong> tiếng Việt nhưng giữ mặt lưỡi phẳng, hơi ép dẹt qua kẽ răng (không bật hơi).</li>\n<li><strong>q</strong>: Đọc giống <strong>&quot;ch&quot; nhưng bật hơi thật mạnh</strong>, dẹt môi và đẩy hơi qua kẽ răng.</li>\n<li><strong>x</strong>: Đọc gần giống giữa <strong>&quot;x&quot;</strong> và <strong>&quot;s&quot;</strong> tiếng Việt (môi dẹt ra, hơi thoát nhẹ qua kẽ răng, miệng mỉm cười).</li>\n</ul>\n<h3>5. Nhóm âm đầu lưỡi trước (<code>z</code>, <code>c</code>, <code>s</code>) – <em>Thường đi với vần <code>-i</code> đọc là &quot;ư&quot;</em></h3>\n<ul>\n<li><strong>z</strong>: Đọc giống <strong>&quot;ch&quot;</strong> nhưng đầu lưỡi thẳng chạm vào mặt sau của răng cửa trên, lưỡi không cong (không bật hơi). Gần giống chữ <em>đờ-zi</em> đọc nhanh.</li>\n<li><strong>c</strong>: Vị trí lưỡi như chữ <code>z</code> nhưng <strong>bật hơi thật mạnh</strong>, hơi xì ra qua kẽ răng cửa.</li>\n<li><strong>s</strong>: Đọc thẳng như <strong>&quot;s/x&quot;</strong> tiếng Việt (lưỡi thẳng, hơi xì nhẹ ra răng).</li>\n</ul>\n<h3>6. Nhóm âm đầu lưỡi sau / Âm cuốn lưỡi (<code>zh</code>, <code>ch</code>, <code>sh</code>, <code>r</code>) – <em>Phải cong lưỡi hết cỡ</em></h3>\n<ul>\n<li><strong>zh</strong>: Cong lưỡi lên chạm vòm họng trên, bật nhẹ ra âm giống <strong>&quot;tr&quot;</strong> tiếng Việt nặng (không bật hơi).</li>\n<li><strong>ch</strong>: Vị trí như <code>zh</code> nhưng <strong>bật hơi, đẩy luồng khí mạnh</strong> ra ngoài khi hạ lưỡi.</li>\n<li><strong>sh</strong>: Cong lưỡi lên, chừa một khe hở nhỏ với vòm họng, phát ra âm <strong>&quot;s&quot; uốn lưỡi</strong> (giống <em>sh</em> trong tiếng Anh &quot;she&quot;).</li>\n<li><strong>r</strong>: Đọc gần giống <strong>&quot;r&quot;</strong> tiếng Việt nhưng không rung lưỡi, hoặc giống âm <strong>&quot;gi&quot;</strong> nhưng uốn cong lưỡi.</li>\n</ul>\n<hr class=\"rule-sep\" />\n  </div>\n</details><details class=\"rule-acc rule-md-section\">\n  <summary>\n    <span class=\"rule-no\">03</span>\n    <span class=\"rule-title-text\">QUY TẮC ĐỌC VẬN MẪU (NGUYÊN ÂM)</span>\n  </summary>\n  <div class=\"rule-body rule-md-body\">\n    <p>Nhìn vào bảng trong <strong>image.png</strong>, vận mẫu được chia làm 4 nhóm lớn (1, 2, 3, 4) dựa theo nguyên âm mở đầu:</p>\n<h3>Nhóm 1: Vận mẫu mở đầu bằng <code>a</code>, <code>o</code>, <code>e</code>, <code>i</code></h3>\n<ul>\n<li><strong>a</strong>: Đọc là <strong>&quot;a&quot;</strong>.</li>\n<li><strong>o</strong>: Đọc là <strong>&quot;ô&quot;</strong> (khi đứng một mình) hoặc <strong>&quot;uô&quot;</strong> (khi đi với <code>b, p, m, f</code> → <em>bo, po, mo, fo</em> đọc là <em>buô, phuô, muô, phuô</em>).</li>\n<li><strong>e</strong>: Đọc là <strong>&quot;ơ&quot;</strong> hoặc <strong>&quot;ưa&quot;</strong> (tùy vùng, phổ biến nhất là <em>ưa</em>). <em>Ví dụ: ge → &quot;cưa&quot;, me → &quot;mơ/mưa&quot;</em>.</li>\n<li><strong>-i (Vận mẫu đặc biệt)</strong>:</li>\n<li>Đi với <code>z, c, s, zh, ch, sh, r</code> → Đọc là <strong>&quot;ư&quot;</strong> (<em>zi → tư, zhi → trư</em>).</li>\n<li>Đi với tất cả các âm còn lại (<code>b, p, m, f, d, t, n, l, j, q, x</code>) → Đọc là <strong>&quot;i&quot;</strong> bình thường.</li>\n</ul>\n<ul>\n<li><strong>ê</strong>: Đọc là <strong>&quot;ê&quot;</strong> (ít khi đứng độc lập).</li>\n<li><strong>er</strong>: Đọc là <strong>&quot;ơ&quot; rồi cong lưỡi</strong> ngay lập tức (âm đặc trưng của giọng Bắc Kinh).</li>\n<li><strong>ai</strong>: Đọc là <strong>&quot;ai&quot;</strong>.</li>\n<li><strong>ei</strong>: Đọc là <strong>&quot;ây&quot;</strong>.</li>\n<li><strong>ao</strong>: Đọc là <strong>&quot;ao&quot;</strong>.</li>\n<li><strong>ou</strong>: Đọc là <strong>&quot;âu&quot;</strong>.</li>\n<li><strong>an</strong>: Đọc là <strong>&quot;an&quot;</strong>.</li>\n<li><strong>en</strong>: Đọc là <strong>&quot;ân&quot;</strong>.</li>\n<li><strong>ang</strong>: Đọc là <strong>&quot;ang&quot;</strong>.</li>\n<li><strong>eng</strong>: Đọc là <strong>&quot;âng&quot;</strong>.</li>\n<li><strong>ong</strong>: Đọc là <strong>&quot;ung&quot;</strong>.</li>\n</ul>\n<h3>Nhóm 2: Vận mẫu mở đầu bằng <code>i</code> (Vần hệ <code>i</code>)</h3>\n<ul>\n<li><strong>i</strong>: Đọc là <strong>&quot;i&quot;</strong>.</li>\n<li><strong>ia</strong>: Đọc là <strong>&quot;ia&quot;</strong> (đọc nhanh <code>i</code>+<code>a</code>).</li>\n<li><strong>ie</strong>: Đọc là <strong>&quot;iê&quot;</strong>.</li>\n<li><strong>iao</strong>: Đọc là <strong>&quot;iêu&quot;</strong>.</li>\n<li><strong>iou</strong>: Đọc là <strong>&quot;iêu&quot;</strong> (Khi viết kết hợp phụ âm bị rút gọn thành <strong><code>-iu</code></strong>, ví dụ: <em>liu, jiu</em>).</li>\n<li><strong>ian</strong>: Đọc là <strong>&quot;iên&quot;</strong> (Đặc biệt lưu ý: không đọc là &quot;ian&quot;).</li>\n<li><strong>in</strong>: Đọc là <strong>&quot;in&quot;</strong>.</li>\n<li><strong>iang</strong>: Đọc là <strong>&quot;iang&quot;</strong>.</li>\n<li><strong>ing</strong>: Đọc là <strong>&quot;inh&quot;</strong>.</li>\n<li><strong>iong</strong>: Đọc là <strong>&quot;iung&quot;</strong>.</li>\n</ul>\n<h3>Nhóm 3: Vận mẫu mở đầu bằng <code>u</code> (Vần hệ <code>u</code>)</h3>\n<ul>\n<li><strong>u</strong>: Đọc là <strong>&quot;u&quot;</strong>.</li>\n<li><strong>ua</strong>: Đọc là <strong>&quot;oa&quot;</strong>.</li>\n<li><strong>uo</strong>: Đọc là <strong>&quot;uô&quot;</strong>.</li>\n<li><strong>uai</strong>: Đọc là <strong>&quot;oai&quot;</strong>.</li>\n<li><strong>uei</strong>: Đọc là <strong>&quot;uây&quot;</strong> (Khi viết kết hợp phụ âm bị rút gọn thành <strong><code>-ui</code></strong>, ví dụ: <em>dui, hui</em>).</li>\n<li><strong>uan</strong>: Đọc là <strong>&quot;oan&quot;</strong>.</li>\n<li><strong>uen</strong>: Đọc là <strong>&quot;uân&quot;</strong> (Khi viết kết hợp phụ âm bị rút gọn thành <strong><code>-un</code></strong>, ví dụ: <em>dun, kun</em>).</li>\n<li><strong>uang</strong>: Đọc là <strong>&quot;oang&quot;</strong>.</li>\n<li><strong>ueng</strong>: Đọc là <strong>&quot;uâng&quot;</strong> (chỉ đứng độc lập thành <em>weng</em>).</li>\n</ul>\n<h3>Nhóm 4: Vận mẫu mở đầu bằng <code>ü</code> (Môi tròn)</h3>\n<ul>\n<li><strong>ü</strong>: Đọc là <strong>&quot;uy&quot;</strong> (Giữ hình dáng môi tròn, chúm chụt suốt quá trình phát âm âm <em>i</em>).</li>\n<li><strong>üe</strong>: Đọc là <strong>&quot;uyê&quot;</strong>.</li>\n<li><strong>üan</strong>: Đọc là <strong>&quot;uyên&quot;</strong>.</li>\n<li><strong>ün</strong>: Đọc là <strong>&quot;uyn&quot;</strong>.</li>\n</ul>\n<hr class=\"rule-sep\" />\n  </div>\n</details><details class=\"rule-acc rule-md-section\">\n  <summary>\n    <span class=\"rule-no\">04</span>\n    <span class=\"rule-title-text\">CÁC NGUYÊN TẮC BẤT QUY TẮC &amp; TRƯỜNG HỢP ĐẶC BIỆT (Bắt buộc phải nhớ)</span>\n  </summary>\n  <div class=\"rule-body rule-md-body\">\n    <p>Nhìn kỹ phần dòng dưới cùng (màu cam nhạt) và các ô trống trong bảng <strong>image.png</strong>, bạn sẽ thấy các quy tắc biến đổi chữ viết sau:</p>\n<h3>1. Quy tắc viết khi VẬN MẪU đứng độc lập (Không có thanh mẫu đi trước)</h3>\n<p>Khi một từ không có phụ âm bắt đầu, Pinyin sẽ biến đổi chữ viết để phân tách các âm tiết:</p>\n<ul>\n<li><strong>Họ <code>i</code> biến thành <code>y</strong></code>:</li>\n<li><code>i</code> → <strong>yi</strong></li>\n<li><code>ia, ie, iao, ian, iang, iong</code> → đổi <code>i</code> thành <code>y</code> → <strong>ya, ye, yao, yan, yang, yong</strong>.</li>\n<li><code>iou</code> → viết đầy đủ là <strong>you</strong>.</li>\n<li><code>in, ing</code> → thêm <code>y</code> vào trước → <strong>yin, ying</strong>.</li>\n</ul>\n<ul>\n<li><strong>Họ <code>u</code> biến thành <code>w</strong></code>:</li>\n<li><code>u</code> → <strong>wu</strong>.</li>\n<li><code>ua, uo, uai, uan, uang, ueng</code> → đổi <code>u</code> thành <code>w</code> → <strong>wa, wo, wai, wan, wang, weng</strong>.</li>\n<li><code>uei</code> → viết đầy đủ là <strong>wei</strong>.</li>\n<li><code>uen</code> → viết đầy đủ là <strong>wen</strong>.</li>\n</ul>\n<ul>\n<li><strong>Họ <code>ü</code> biến thành <code>yu</code> (Bỏ dấu 2 chấm)</strong>:</li>\n<li><code>ü, üe, üan, ün</code> → Thêm <code>y</code> ra trước và <strong>bỏ hoàn toàn 2 dấu chấm</strong> trên đầu → <strong>yu, yue, yuan, yun</strong>. <em>(Nhưng bản chất phát âm vẫn giữ nguyên là âm tròn môi <code>ü</code>)</em>.</li>\n</ul>\n<h3>2. Quy tắc bỏ dấu hai chấm của <code>ü</code> khi đi với <code>j, q, x</code></h3>\n<ul>\n<li>Khi <code>ü, üe, üan, ün</code> đi sau 3 thanh mẫu mặt lưỡi <strong><code>j, q, x</code></strong>, do 3 âm này không bao giờ đi với <code>u</code> thường, nên người ta <strong>bỏ dấu 2 chấm</strong> đi cho gọn.</li>\n<li><em>Cách viết:</em> <strong>ju, que, xuan, xun</strong> → <em>Cách đọc đúng:</em> <strong>juy, khuyê, xuên, xuyn</strong> (Vẫn phải giữ môi tròn, không đọc thành &quot;u&quot; tiếng Việt).</li>\n<li><em>Lưu ý:</em> Khi <code>ü</code> đi với <strong><code>n</code></strong> và <strong><code>l</code></strong>, vì <code>n</code> và <code>l</code> có thể đi được với cả <code>u</code> thường (như <em>nu, lu</em>), nên bắt buộc phải giữ nguyên dấu 2 chấm là <strong>nü, lü</strong> để tránh nhầm lẫn (như bạn thấy ở cột số 4 trong file ảnh).</li>\n</ul>\n<h3>3. Quy tắc rút gọn chữ viết (<code>-iou</code>, <code>-uei</code>, <code>-uen</code>)</h3>\n<p>Khi kết hợp với một thanh mẫu phía trước, các vần này sẽ bị lược bỏ nguyên âm ở giữa, nhưng <strong>cách phát âm vẫn giữ nguyên vần gốc</strong>:</p>\n<ul>\n<li><code>j</code> + <code>iou</code> → viết là <strong>jiu</strong> (nhưng vẫn đọc là <em>chiêu</em>, không đọc là <em>chiu</em>).</li>\n<li><code>d</code> + <code>uei</code> → viết là <strong>dui</strong> (nhưng vẫn đọc là <em>đuây</em>, không đọc là <em>đui</em>).</li>\n<li><code>g</code> + <code>uen</code> → viết là <strong>gun</strong> (nhưng vẫn đọc là <em>cuân</em>, không đọc là <em>cun</em>).</li>\n</ul>\n<hr class=\"rule-sep\" />\n  </div>\n</details><details class=\"rule-acc rule-md-section\">\n  <summary>\n    <span class=\"rule-no\">05</span>\n    <span class=\"rule-title-text\">QUY TẮC BIẾN ĐIỆU THANH ĐIỆU (DẤU)</span>\n  </summary>\n  <div class=\"rule-body rule-md-body\">\n    <p>Tiếng Trung có 4 thanh điệu chính (thanh 1 đến thanh 4) và 1 thanh nhẹ (không có dấu). Khi giao tiếp, các thanh điệu có sự biến đổi cơ bản sau:</p>\n<h3>1. Biến điệu của hai Thanh 3 (Dấu hỏi <code>ˇ</code> + Dấu hỏi <code>ˇ</code>)</h3>\n<ul>\n<li>Khi hai âm tiết mang <strong>Thanh 3</strong> đi liền nhau, thanh 3 thứ nhất sẽ biến thành <strong>Thanh 2</strong> (đọc giống dấu sắc).</li>\n<li><em>Ví dụ nổi tiếng:</em> Nǐ (thanh 3) + hǎo (thanh 3) → Đọc thành <strong>Ní hǎo</strong>.</li>\n</ul>\n<h3>2. Biến điệu của chữ &quot;一&quot; (Yī - Số 1)</h3>\n<ul>\n<li>Đứng một mình hoặc dùng để đếm: Đọc là <strong>yī</strong> (Thanh 1).</li>\n<li>Đi trước từ mang <strong>Thanh 4</strong>: <code>yī</code> biến thành <strong>yí</strong> (Thanh 2). <em>Ví dụ: yī yàng → yí yàng.</em></li>\n<li>Đi trước từ mang <strong>Thanh 1, 2, 3</strong>: <code>yī</code> biến thành <strong>yì</strong> (Thanh 4). <em>Ví dụ: yī tiān → yì tiān.</em></li>\n</ul>\n<h3>3. Biến điệu của chữ &quot;不&quot; (Bù - Không)</h3>\n<ul>\n<li>Bình thường đọc là <strong>bù</strong> (Thanh 4).</li>\n<li>Khi đi trước một từ cũng mang <strong>Thanh 4</strong>, <code>bù</code> sẽ biến đổi thành <strong>bú</strong> (Thanh 2). <em>Ví dụ: bù shì → bú shì.</em></li>\n</ul>\n  </div>\n</details><details class=\"rule-acc rule-md-section\">\n  <summary>\n    <span class=\"rule-no\">06</span>\n    <span class=\"rule-title-text\">Mẹo tổng kết để nhìn bảng Pinyin trong image.png không bị rối:</span>\n  </summary>\n  <div class=\"rule-body rule-md-body\">\n    <ol>\n<li>Xác định phụ âm đầu nằm ở dòng nào → Áp dụng quy tắc bật hơi/không bật hơi, cong lưỡi/thẳng lưỡi.</li>\n<li>Gióng sang hàng ngang để tìm vần → Để ý xem vần đó có rơi vào trường hợp rút gọn (<code>-iu, -ui, -un</code>) hoặc trường hợp biến đổi của âm <code>ü</code> khi đi với <code>j, q, x, y</code> hay không.</li>\n<li>Ghép âm lại và thêm thanh điệu phù hợp.</li>\n</ol>\n  </div>\n</details>\n</div>";

  window.renderRules = function renderRules() {
    return appShell(`
${hero('Quy tắc phát âm Pinyin', 'Tất cả quy tắc được gom vào một chỗ. Mới vào chỉ hiện các mục; bấm từng mục để xem nội dung chi tiết.')}
${RULES_HTML_V16}
    `);
  };

  try {
    if (typeof state !== 'undefined' && state.tab === 'rules') render();
  } catch (e) {}
})();

/* PATCH_PINYIN_V17_RULES_TABS_CLOSED_18
   Keep quick rules, add full rules table, close all 18 mini tables by default.
*/
(function () {
  const FULL_RULES_HTML_V17 = "<div class=\"rules-accordion rules-full rules-md-v17\">\n  <details class=\"rule-acc rule-md-section\">\n  <summary>\n    <span class=\"rule-no\">01</span>\n    <span class=\"rule-title-text\">Tổng quan</span>\n  </summary>\n  <div class=\"rule-body rule-md-body\"><p>Dưới đây là cẩm nang hướng dẫn toàn diện và chi tiết nhất về <strong>quy tắc phát âm Pinyin (Bính âm)</strong> trong tiếng Trung, được đối chiếu trực tiếp dựa trên bảng hệ thống phiên âm đầy đủ trong file <strong>image.png</strong> của bạn.</p>\n<p>Hệ thống Pinyin được cấu thành từ: <strong>Thanh mẫu</strong> (Phụ âm bắt đầu), <strong>Vận mẫu</strong> (Nguyên âm/Vần phía sau), <strong>Thanh điệu</strong> (Dấu) và các <strong>Biến điệu/Bất quy tắc</strong> khi ghép âm.</p>\n<hr class=\"rule-sep\" /></div>\n</details><details class=\"rule-acc rule-md-section\">\n  <summary>\n    <span class=\"rule-no\">02</span>\n    <span class=\"rule-title-text\">QUY TẮC ĐỌC THANH MẪU (PHỤ ÂM)</span>\n  </summary>\n  <div class=\"rule-body rule-md-body\"><p>Hệ thống gồm 21 thanh mẫu (và 2 bán nguyên âm <code>y</code>, <code>w</code> ở dòng cuối cùng). Để dễ học, ta chia theo nhóm phương thức phát âm:</p>\n<h3>1. Nhóm âm môi &amp; môi răng (<code>b</code>, <code>p</code>, <code>m</code>, <code>f</code>)</h3>\n<ul>\n<li><strong>b</strong>: Đọc như <strong>&quot;p&quot;</strong> (âm bẹt môi, không bật hơi, giống chữ <em>p</em> trong &quot;pin&quot; tiếng Anh hoặc gần giống <em>p</em> tiếng Việt). <em>Ví dụ: ba → đọc giống &quot;pa&quot;.</em></li>\n<li><strong>p</strong>: Đọc như <strong>&quot;p&quot; bật hơi thật mạnh</strong> (mím môi tích hơi rồi bật ra làm rung không khí). <em>Ví dụ: pa → &quot;p&#x27;a&quot;.</em></li>\n<li><strong>m</strong>: Đọc giống <strong>&quot;m&quot;</strong> tiếng Việt.</li>\n<li><strong>f</strong>: Đọc giống <strong>&quot;ph&quot;</strong> tiếng Việt.</li>\n</ul>\n<h3>2. Nhóm âm đầu lưỡi giữa (<code>d</code>, <code>t</code>, <code>n</code>, <code>l</code>)</h3>\n<ul>\n<li><strong>d</strong>: Đọc như <strong>&quot;t&quot;</strong> tiếng Việt (không bật hơi). <em>Ví dụ: da → đọc giống &quot;ta&quot;.</em></li>\n<li><strong>t</strong>: Đọc như <strong>&quot;t&quot; bật hơi thật mạnh</strong> (gần giống chữ <em>th</em> tiếng Việt nhưng xả hơi mạnh từ đầu lưỡi). <em>Ví dụ: ta → &quot;t&#x27;a&quot;.</em></li>\n<li><strong>n</strong>: Đọc giống <strong>&quot;n&quot;</strong> tiếng Việt.</li>\n<li><strong>l</strong>: Đọc giống <strong>&quot;l&quot;</strong> tiếng Việt.</li>\n</ul>\n<h3>3. Nhóm âm gốc lưỡi (<code>g</code>, <code>k</code>, <code>h</code>)</h3>\n<ul>\n<li><strong>g</strong>: Đọc như <strong>&quot;c/k&quot;</strong> tiếng Việt (không bật hơi). <em>Ví dụ: ga → đọc giống &quot;ca&quot;.</em></li>\n<li><strong>k</strong>: Đọc như <strong>&quot;kh&quot; nhưng bật hơi rất mạnh</strong> từ cuống họng.</li>\n<li><strong>h</strong>: Đọc như giữa <strong>&quot;h&quot;</strong> và <strong>&quot;kh&quot;</strong> (hơi thở ra nhẹ nhàng từ cuống họng, giống chữ <em>h</em> trong tiếng Anh nhưng sát nhẹ hơn).</li>\n</ul>\n<h3>4. Nhóm âm mặt lưỡi (<code>j</code>, <code>q</code>, <code>x</code>) – <em>Chỉ đi với dòng vận mẫu bắt đầu bằng <code>i</code> và <code>ü</em></code></h3>\n<ul>\n<li><strong>j</strong>: Đọc giống <strong>&quot;ch&quot;</strong> tiếng Việt nhưng giữ mặt lưỡi phẳng, hơi ép dẹt qua kẽ răng (không bật hơi).</li>\n<li><strong>q</strong>: Đọc giống <strong>&quot;ch&quot; nhưng bật hơi thật mạnh</strong>, dẹt môi và đẩy hơi qua kẽ răng.</li>\n<li><strong>x</strong>: Đọc gần giống giữa <strong>&quot;x&quot;</strong> và <strong>&quot;s&quot;</strong> tiếng Việt (môi dẹt ra, hơi thoát nhẹ qua kẽ răng, miệng mỉm cười).</li>\n</ul>\n<h3>5. Nhóm âm đầu lưỡi trước (<code>z</code>, <code>c</code>, <code>s</code>) – <em>Thường đi với vần <code>-i</code> đọc là &quot;ư&quot;</em></h3>\n<ul>\n<li><strong>z</strong>: Đọc giống <strong>&quot;ch&quot;</strong> nhưng đầu lưỡi thẳng chạm vào mặt sau của răng cửa trên, lưỡi không cong (không bật hơi). Gần giống chữ <em>đờ-zi</em> đọc nhanh.</li>\n<li><strong>c</strong>: Vị trí lưỡi như chữ <code>z</code> nhưng <strong>bật hơi thật mạnh</strong>, hơi xì ra qua kẽ răng cửa.</li>\n<li><strong>s</strong>: Đọc thẳng như <strong>&quot;s/x&quot;</strong> tiếng Việt (lưỡi thẳng, hơi xì nhẹ ra răng).</li>\n</ul>\n<h3>6. Nhóm âm đầu lưỡi sau / Âm cuốn lưỡi (<code>zh</code>, <code>ch</code>, <code>sh</code>, <code>r</code>) – <em>Phải cong lưỡi hết cỡ</em></h3>\n<ul>\n<li><strong>zh</strong>: Cong lưỡi lên chạm vòm họng trên, bật nhẹ ra âm giống <strong>&quot;tr&quot;</strong> tiếng Việt nặng (không bật hơi).</li>\n<li><strong>ch</strong>: Vị trí như <code>zh</code> nhưng <strong>bật hơi, đẩy luồng khí mạnh</strong> ra ngoài khi hạ lưỡi.</li>\n<li><strong>sh</strong>: Cong lưỡi lên, chừa một khe hở nhỏ với vòm họng, phát ra âm <strong>&quot;s&quot; uốn lưỡi</strong> (giống <em>sh</em> trong tiếng Anh &quot;she&quot;).</li>\n<li><strong>r</strong>: Đọc gần giống <strong>&quot;r&quot;</strong> tiếng Việt nhưng không rung lưỡi, hoặc giống âm <strong>&quot;gi&quot;</strong> nhưng uốn cong lưỡi.</li>\n</ul>\n<hr class=\"rule-sep\" /></div>\n</details><details class=\"rule-acc rule-md-section\">\n  <summary>\n    <span class=\"rule-no\">03</span>\n    <span class=\"rule-title-text\">QUY TẮC ĐỌC VẬN MẪU (NGUYÊN ÂM)</span>\n  </summary>\n  <div class=\"rule-body rule-md-body\"><p>Nhìn vào bảng trong <strong>image.png</strong>, vận mẫu được chia làm 4 nhóm lớn (1, 2, 3, 4) dựa theo nguyên âm mở đầu:</p>\n<h3>Nhóm 1: Vận mẫu mở đầu bằng <code>a</code>, <code>o</code>, <code>e</code>, <code>i</code></h3>\n<ul>\n<li><strong>a</strong>: Đọc là <strong>&quot;a&quot;</strong>.</li>\n<li><strong>o</strong>: Đọc là <strong>&quot;ô&quot;</strong> (khi đứng một mình) hoặc <strong>&quot;uô&quot;</strong> (khi đi với <code>b, p, m, f</code> → <em>bo, po, mo, fo</em> đọc là <em>buô, phuô, muô, phuô</em>).</li>\n<li><strong>e</strong>: Đọc là <strong>&quot;ơ&quot;</strong> hoặc <strong>&quot;ưa&quot;</strong> (tùy vùng, phổ biến nhất là <em>ưa</em>). <em>Ví dụ: ge → &quot;cưa&quot;, me → &quot;mơ/mưa&quot;</em>.</li>\n<li><strong>-i (Vận mẫu đặc biệt)</strong>:</li>\n<li>Đi với <code>z, c, s, zh, ch, sh, r</code> → Đọc là <strong>&quot;ư&quot;</strong> (<em>zi → tư, zhi → trư</em>).</li>\n<li>Đi với tất cả các âm còn lại (<code>b, p, m, f, d, t, n, l, j, q, x</code>) → Đọc là <strong>&quot;i&quot;</strong> bình thường.</li>\n</ul>\n<ul>\n<li><strong>ê</strong>: Đọc là <strong>&quot;ê&quot;</strong> (ít khi đứng độc lập).</li>\n<li><strong>er</strong>: Đọc là <strong>&quot;ơ&quot; rồi cong lưỡi</strong> ngay lập tức (âm đặc trưng của giọng Bắc Kinh).</li>\n<li><strong>ai</strong>: Đọc là <strong>&quot;ai&quot;</strong>.</li>\n<li><strong>ei</strong>: Đọc là <strong>&quot;ây&quot;</strong>.</li>\n<li><strong>ao</strong>: Đọc là <strong>&quot;ao&quot;</strong>.</li>\n<li><strong>ou</strong>: Đọc là <strong>&quot;âu&quot;</strong>.</li>\n<li><strong>an</strong>: Đọc là <strong>&quot;an&quot;</strong>.</li>\n<li><strong>en</strong>: Đọc là <strong>&quot;ân&quot;</strong>.</li>\n<li><strong>ang</strong>: Đọc là <strong>&quot;ang&quot;</strong>.</li>\n<li><strong>eng</strong>: Đọc là <strong>&quot;âng&quot;</strong>.</li>\n<li><strong>ong</strong>: Đọc là <strong>&quot;ung&quot;</strong>.</li>\n</ul>\n<h3>Nhóm 2: Vận mẫu mở đầu bằng <code>i</code> (Vần hệ <code>i</code>)</h3>\n<ul>\n<li><strong>i</strong>: Đọc là <strong>&quot;i&quot;</strong>.</li>\n<li><strong>ia</strong>: Đọc là <strong>&quot;ia&quot;</strong> (đọc nhanh <code>i</code>+<code>a</code>).</li>\n<li><strong>ie</strong>: Đọc là <strong>&quot;iê&quot;</strong>.</li>\n<li><strong>iao</strong>: Đọc là <strong>&quot;iêu&quot;</strong>.</li>\n<li><strong>iou</strong>: Đọc là <strong>&quot;iêu&quot;</strong> (Khi viết kết hợp phụ âm bị rút gọn thành <strong><code>-iu</code></strong>, ví dụ: <em>liu, jiu</em>).</li>\n<li><strong>ian</strong>: Đọc là <strong>&quot;iên&quot;</strong> (Đặc biệt lưu ý: không đọc là &quot;ian&quot;).</li>\n<li><strong>in</strong>: Đọc là <strong>&quot;in&quot;</strong>.</li>\n<li><strong>iang</strong>: Đọc là <strong>&quot;iang&quot;</strong>.</li>\n<li><strong>ing</strong>: Đọc là <strong>&quot;inh&quot;</strong>.</li>\n<li><strong>iong</strong>: Đọc là <strong>&quot;iung&quot;</strong>.</li>\n</ul>\n<h3>Nhóm 3: Vận mẫu mở đầu bằng <code>u</code> (Vần hệ <code>u</code>)</h3>\n<ul>\n<li><strong>u</strong>: Đọc là <strong>&quot;u&quot;</strong>.</li>\n<li><strong>ua</strong>: Đọc là <strong>&quot;oa&quot;</strong>.</li>\n<li><strong>uo</strong>: Đọc là <strong>&quot;uô&quot;</strong>.</li>\n<li><strong>uai</strong>: Đọc là <strong>&quot;oai&quot;</strong>.</li>\n<li><strong>uei</strong>: Đọc là <strong>&quot;uây&quot;</strong> (Khi viết kết hợp phụ âm bị rút gọn thành <strong><code>-ui</code></strong>, ví dụ: <em>dui, hui</em>).</li>\n<li><strong>uan</strong>: Đọc là <strong>&quot;oan&quot;</strong>.</li>\n<li><strong>uen</strong>: Đọc là <strong>&quot;uân&quot;</strong> (Khi viết kết hợp phụ âm bị rút gọn thành <strong><code>-un</code></strong>, ví dụ: <em>dun, kun</em>).</li>\n<li><strong>uang</strong>: Đọc là <strong>&quot;oang&quot;</strong>.</li>\n<li><strong>ueng</strong>: Đọc là <strong>&quot;uâng&quot;</strong> (chỉ đứng độc lập thành <em>weng</em>).</li>\n</ul>\n<h3>Nhóm 4: Vận mẫu mở đầu bằng <code>ü</code> (Môi tròn)</h3>\n<ul>\n<li><strong>ü</strong>: Đọc là <strong>&quot;uy&quot;</strong> (Giữ hình dáng môi tròn, chúm chụt suốt quá trình phát âm âm <em>i</em>).</li>\n<li><strong>üe</strong>: Đọc là <strong>&quot;uyê&quot;</strong>.</li>\n<li><strong>üan</strong>: Đọc là <strong>&quot;uyên&quot;</strong>.</li>\n<li><strong>ün</strong>: Đọc là <strong>&quot;uyn&quot;</strong>.</li>\n</ul>\n<hr class=\"rule-sep\" /></div>\n</details><details class=\"rule-acc rule-md-section\">\n  <summary>\n    <span class=\"rule-no\">04</span>\n    <span class=\"rule-title-text\">CÁC NGUYÊN TẮC BẤT QUY TẮC &amp; TRƯỜNG HỢP ĐẶC BIỆT (Bắt buộc phải nhớ)</span>\n  </summary>\n  <div class=\"rule-body rule-md-body\"><p>Nhìn kỹ phần dòng dưới cùng (màu cam nhạt) và các ô trống trong bảng <strong>image.png</strong>, bạn sẽ thấy các quy tắc biến đổi chữ viết sau:</p>\n<h3>1. Quy tắc viết khi VẬN MẪU đứng độc lập (Không có thanh mẫu đi trước)</h3>\n<p>Khi một từ không có phụ âm bắt đầu, Pinyin sẽ biến đổi chữ viết để phân tách các âm tiết:</p>\n<ul>\n<li><strong>Họ <code>i</code> biến thành <code>y</strong></code>:</li>\n<li><code>i</code> → <strong>yi</strong></li>\n<li><code>ia, ie, iao, ian, iang, iong</code> → đổi <code>i</code> thành <code>y</code> → <strong>ya, ye, yao, yan, yang, yong</strong>.</li>\n<li><code>iou</code> → viết đầy đủ là <strong>you</strong>.</li>\n<li><code>in, ing</code> → thêm <code>y</code> vào trước → <strong>yin, ying</strong>.</li>\n</ul>\n<ul>\n<li><strong>Họ <code>u</code> biến thành <code>w</strong></code>:</li>\n<li><code>u</code> → <strong>wu</strong>.</li>\n<li><code>ua, uo, uai, uan, uang, ueng</code> → đổi <code>u</code> thành <code>w</code> → <strong>wa, wo, wai, wan, wang, weng</strong>.</li>\n<li><code>uei</code> → viết đầy đủ là <strong>wei</strong>.</li>\n<li><code>uen</code> → viết đầy đủ là <strong>wen</strong>.</li>\n</ul>\n<ul>\n<li><strong>Họ <code>ü</code> biến thành <code>yu</code> (Bỏ dấu 2 chấm)</strong>:</li>\n<li><code>ü, üe, üan, ün</code> → Thêm <code>y</code> ra trước và <strong>bỏ hoàn toàn 2 dấu chấm</strong> trên đầu → <strong>yu, yue, yuan, yun</strong>. <em>(Nhưng bản chất phát âm vẫn giữ nguyên là âm tròn môi <code>ü</code>)</em>.</li>\n</ul>\n<h3>2. Quy tắc bỏ dấu hai chấm của <code>ü</code> khi đi với <code>j, q, x</code></h3>\n<ul>\n<li>Khi <code>ü, üe, üan, ün</code> đi sau 3 thanh mẫu mặt lưỡi <strong><code>j, q, x</code></strong>, do 3 âm này không bao giờ đi với <code>u</code> thường, nên người ta <strong>bỏ dấu 2 chấm</strong> đi cho gọn.</li>\n<li><em>Cách viết:</em> <strong>ju, que, xuan, xun</strong> → <em>Cách đọc đúng:</em> <strong>juy, khuyê, xuên, xuyn</strong> (Vẫn phải giữ môi tròn, không đọc thành &quot;u&quot; tiếng Việt).</li>\n<li><em>Lưu ý:</em> Khi <code>ü</code> đi với <strong><code>n</code></strong> và <strong><code>l</code></strong>, vì <code>n</code> và <code>l</code> có thể đi được với cả <code>u</code> thường (như <em>nu, lu</em>), nên bắt buộc phải giữ nguyên dấu 2 chấm là <strong>nü, lü</strong> để tránh nhầm lẫn (như bạn thấy ở cột số 4 trong file ảnh).</li>\n</ul>\n<h3>3. Quy tắc rút gọn chữ viết (<code>-iou</code>, <code>-uei</code>, <code>-uen</code>)</h3>\n<p>Khi kết hợp với một thanh mẫu phía trước, các vần này sẽ bị lược bỏ nguyên âm ở giữa, nhưng <strong>cách phát âm vẫn giữ nguyên vần gốc</strong>:</p>\n<ul>\n<li><code>j</code> + <code>iou</code> → viết là <strong>jiu</strong> (nhưng vẫn đọc là <em>chiêu</em>, không đọc là <em>chiu</em>).</li>\n<li><code>d</code> + <code>uei</code> → viết là <strong>dui</strong> (nhưng vẫn đọc là <em>đuây</em>, không đọc là <em>đui</em>).</li>\n<li><code>g</code> + <code>uen</code> → viết là <strong>gun</strong> (nhưng vẫn đọc là <em>cuân</em>, không đọc là <em>cun</em>).</li>\n</ul>\n<hr class=\"rule-sep\" /></div>\n</details><details class=\"rule-acc rule-md-section\">\n  <summary>\n    <span class=\"rule-no\">05</span>\n    <span class=\"rule-title-text\">QUY TẮC BIẾN ĐIỆU THANH ĐIỆU (DẤU)</span>\n  </summary>\n  <div class=\"rule-body rule-md-body\"><p>Tiếng Trung có 4 thanh điệu chính (thanh 1 đến thanh 4) và 1 thanh nhẹ (không có dấu). Khi giao tiếp, các thanh điệu có sự biến đổi cơ bản sau:</p>\n<h3>1. Biến điệu của hai Thanh 3 (Dấu hỏi <code>ˇ</code> + Dấu hỏi <code>ˇ</code>)</h3>\n<ul>\n<li>Khi hai âm tiết mang <strong>Thanh 3</strong> đi liền nhau, thanh 3 thứ nhất sẽ biến thành <strong>Thanh 2</strong> (đọc giống dấu sắc).</li>\n<li><em>Ví dụ nổi tiếng:</em> Nǐ (thanh 3) + hǎo (thanh 3) → Đọc thành <strong>Ní hǎo</strong>.</li>\n</ul>\n<h3>2. Biến điệu của chữ &quot;一&quot; (Yī - Số 1)</h3>\n<ul>\n<li>Đứng một mình hoặc dùng để đếm: Đọc là <strong>yī</strong> (Thanh 1).</li>\n<li>Đi trước từ mang <strong>Thanh 4</strong>: <code>yī</code> biến thành <strong>yí</strong> (Thanh 2). <em>Ví dụ: yī yàng → yí yàng.</em></li>\n<li>Đi trước từ mang <strong>Thanh 1, 2, 3</strong>: <code>yī</code> biến thành <strong>yì</strong> (Thanh 4). <em>Ví dụ: yī tiān → yì tiān.</em></li>\n</ul>\n<h3>3. Biến điệu của chữ &quot;不&quot; (Bù - Không)</h3>\n<ul>\n<li>Bình thường đọc là <strong>bù</strong> (Thanh 4).</li>\n<li>Khi đi trước một từ cũng mang <strong>Thanh 4</strong>, <code>bù</code> sẽ biến đổi thành <strong>bú</strong> (Thanh 2). <em>Ví dụ: bù shì → bú shì.</em></li>\n</ul></div>\n</details><details class=\"rule-acc rule-md-section\">\n  <summary>\n    <span class=\"rule-no\">06</span>\n    <span class=\"rule-title-text\">Mẹo tổng kết để nhìn bảng Pinyin trong image.png không bị rối:</span>\n  </summary>\n  <div class=\"rule-body rule-md-body\"><ol>\n<li>Xác định phụ âm đầu nằm ở dòng nào → Áp dụng quy tắc bật hơi/không bật hơi, cong lưỡi/thẳng lưỡi.</li>\n<li>Gióng sang hàng ngang để tìm vần → Để ý xem vần đó có rơi vào trường hợp rút gọn (<code>-iu, -ui, -un</code>) hoặc trường hợp biến đổi của âm <code>ü</code> khi đi với <code>j, q, x, y</code> hay không.</li>\n<li>Ghép âm lại và thêm thanh điệu phù hợp.</li>\n</ol></div>\n</details>\n</div>";

  window.ruleAccV17 = function ruleAccV17(title, body) {
    return `<details class="rule-acc quick-rule-section">
      <summary>${title}</summary>
      <div class="rule-body">${body}</div>
    </details>`;
  };

  window.miniGridV17 = function miniGridV17(items) {
    return `<div class="rule-mini-grid">${items.map(x => `<div class="rule-mini"><b>${x[0]}</b><span>${x[1]}</span></div>`).join('')}</div>`;
  };

  window.chipRowV17 = function chipRowV17(items) {
    return `<div class="rule-tags">${items.map(t => chip(t)).join('')}</div>`;
  };

  window.quickRulesHtmlV17 = function quickRulesHtmlV17() {
    return `
<div class="rules-accordion quick-rules-v17">
  ${ruleAccV17('Thanh mẫu', `
    <p><b>Trọng tâm:</b> phân biệt âm bật hơi và không bật hơi. Ví dụ tiếng Việt chỉ để hình dung gần đúng, không thay thế âm chuẩn.</p>
    ${miniGridV17([
      ['b / p / m / f', 'b gần p nhẹ không bật hơi; p bật hơi mạnh; m gần m; f gần ph.'],
      ['d / t / n / l', 'd gần t nhẹ không bật hơi; t bật hơi mạnh; n/l gần tiếng Việt.'],
      ['g / k / h', 'g gần c/k không bật hơi; k bật hơi mạnh; h hơi sát từ cuống họng.'],
      ['j / q / x', 'Âm mặt lưỡi, môi hơi dẹt. j không bật hơi, q bật hơi, x không đọc giống hẳn x tiếng Việt.'],
      ['zh / ch / sh / r', 'Nhóm đầu lưỡi sau/cuốn lưỡi. zh không bật hơi, ch bật hơi, sh sát, r không rung mạnh.'],
      ['z / c / s', 'Nhóm đầu lưỡi trước. z không bật hơi, c bật hơi, s sát nhẹ.']
    ])}
    <p><b>Mẹo test:</b> đặt giấy mỏng trước miệng. p/t/k/q/ch/c phải làm giấy lay động rõ hơn b/d/g/j/zh/z.</p>
  `)}

  ${ruleAccV17('Vận mẫu', `
    <p><b>Trọng tâm:</b> nhận diện nhóm vần để ghép đúng và viết đúng.</p>
    ${miniGridV17([
      ['Nhóm thường', 'a, o, e, ai, ei, ao, ou, an, en, ang, eng, ong.'],
      ['Hệ i', 'i, ia, ie, iao, iou, ian, in, iang, ing, iong.'],
      ['Hệ u', 'u, ua, uo, uai, uei, uan, uen, uang, ueng.'],
      ['Hệ ü', 'ü, üe, üan, ün. Môi tròn như u nhưng lưỡi hướng âm i.']
    ])}
    <ul>
      <li><b>ian</b> nghe gần “iên”, không đọc tách cứng i-an.</li>
      <li><b>ing</b> nghe gần “inh”.</li>
      <li><b>ong</b> nghe gần “ung”.</li>
      <li><b>e</b> gần giữa “ơ/ưa”, không nên Việt hóa quá cứng.</li>
    </ul>
  `)}

  ${ruleAccV17('Đặc biệt', `
    ${miniGridV17([
      ['-i đặc biệt', 'zhi / chi / shi / ri / zi / ci / si. Chữ i ở đây không đọc như yi.'],
      ['j/q/x + ü', 'viết ju / qu / xu nhưng hiểu là jü / qü / xü. Không đọc u thường.'],
      ['n/l + ü', 'phải viết rõ nü / lü để phân biệt với nu / lu.'],
      ['Rút gọn', 'iou → iu, uei → ui, uen → un sau thanh mẫu. Ví dụ: liu = liou, dui = duei, gun = guen.'],
      ['y/w', 'quy tắc viết cho âm tiết không có thanh mẫu thật: i → yi, u → wu, ü → yu.']
    ])}
    <p><b>Nên luyện riêng:</b> zhi ↔ zi, chi ↔ ci, shi ↔ si, ju/qu/xu, lü/nü.</p>
    ${chipRowV17(['zhi','zi','chi','ci','shi','si','ju','qu','xu','lü','nü'])}
  `)}

  ${ruleAccV17('Biến điệu', `
    <p>Biến điệu là thay đổi cách đọc trong câu, nhưng thường không đổi cách viết Pinyin gốc trong từ điển.</p>
    <ul>
      <li><b>Thanh 3 + thanh 3:</b> thanh 3 thứ nhất đọc gần thành thanh 2. Ví dụ: nǐ hǎo đọc gần như ní hǎo.</li>
      <li><b>一 yī:</b> trước thanh 4 thường đọc thành yí; trước thanh 1/2/3 thường đọc thành yì; đứng riêng vẫn yī.</li>
      <li><b>不 bù:</b> trước thanh 4 đọc thành bú. Ví dụ: bù shì đọc thành bú shì.</li>
    </ul>
  `)}

  ${ruleAccV17('Lỗi dễ sai', `
    <ul>
      <li>Đọc b/d/g thành bờ/đờ/gờ tiếng Việt quá rõ.</li>
      <li>Không bật hơi đủ ở p/t/k/q/ch/c.</li>
      <li>Lẫn z/c/s với zh/ch/sh/r.</li>
      <li>Đọc zhi/chi/shi/ri/zi/ci/si như i thường.</li>
      <li>Đọc ju/qu/xu/xue/juan/qun theo u thường, quên âm ü.</li>
      <li>Đọc iu/ui/un theo mặt chữ quá ngắn, quên gốc iou/uei/uen.</li>
      <li>Chỉ nhìn chữ mà không nghe lại audio mẫu.</li>
    </ul>
  `)}
</div>`;
  };

  window.setRulesSubTabV17 = function setRulesSubTabV17(tab) {
    const box = document.getElementById('rulesContentV17');
    if (!box) return;

    document.querySelectorAll('.rule-subtab-v17').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.ruleTab === tab);
    });

    if (tab === 'quick') {
      box.innerHTML = quickRulesHtmlV17();
    } else if (tab === 'full') {
      box.innerHTML = FULL_RULES_HTML_V17;
    } else {
      box.innerHTML = '';
    }
  };

  window.renderRules = function renderRules() {
    return appShell(`
${hero('Quy tắc phát âm Pinyin', 'Giữ phần quy tắc gọn vừa rồi và thêm bảng đầy đủ từ file quy tắc phát âm.md. Bấm tab con mới hiện nội dung.')}
<div class="rule-tabs-v17">
  <button class="rule-subtab-v17" data-rule-tab="quick" type="button" onclick="setRulesSubTabV17('quick')">Quy tắc phát âm</button>
  <button class="rule-subtab-v17" data-rule-tab="full" type="button" onclick="setRulesSubTabV17('full')">Bảng đầy đủ</button>
</div>
<div id="rulesContentV17" class="rules-content-v17">
  <div class="rule-empty-v17">Chọn một tab ở trên để xem nội dung.</div>
</div>
    `);
  };

  // 18 bảng: tất cả đóng mặc định, bấm tiêu đề mới xổ ra.
  window.renderGroups = function renderGroups() {
    return appShell(`
${hero('18 bảng nhỏ', 'Chia nhỏ theo nhóm thanh mẫu/vận mẫu. Mới vào chỉ hiện tiêu đề bảng; bấm từng bảng mới xổ ra.')}
${selectedInfoPanel ? selectedInfoPanel() : ''}
<div class="mini-list">
  ${DATA.miniTables.map(t => `<details class="mini-acc">
    <summary><span class="mini-title"><span class="badge">${String(t.no).padStart(2,'0')}</span><span>${t.title}<small>${t.tip}</small></span></span></summary>
    <div class="mini-body">${renderTable(DATA.initials.filter(i=>t.initials.includes(i.key)), [{key:'mini', title:'Vận mẫu', finals:t.finals}], itemMap())}</div>
  </details>`).join('')}
</div>`);
  };

  try {
    if (typeof state !== 'undefined' && (state.tab === 'rules' || state.tab === 'groups')) render();
  } catch (e) {}
})();

/* PATCH_PINYIN_V18_MOBILE_18_TABLES
   18 bảng chuyển từ table ngang sang card/chip dễ dùng trên mobile.
*/
(function () {
  function v18ItemMap() {
    const map = {};
    playableItems().forEach(x => {
      map[`${x.initial}__${x.chartFinal}`] = x;
    });
    return map;
  }

  function v18InitialLabel(key) {
    const found = DATA.initials.find(x => x.key === key);
    return found ? found.label : (key || '∅');
  }

  function v18Mark(py, tone) {
    if (typeof markPinyinTone === 'function') return markPinyinTone(py, tone || state.tone || 1);
    return py;
  }

  function v18MiniChip(item) {
    const tone = Number(state.tone || 1);
    const selected = state.selected === item.safe ? 'selected' : '';
    const learned = state.learned[item.safe] ? 'learned' : '';
    const fav = state.favorite[item.safe] ? 'favorite' : '';

    return `<button type="button"
      class="mini-sound-chip ${selected} ${learned} ${fav}"
      onclick="selectItem('${item.safe}');playTone('${item.safe}', ${tone}, this)">
      <span class="mini-pinyin-raw">${item.pinyin}</span>
      <span class="mini-pinyin-tone">${v18Mark(item.pinyin, tone)}</span>
    </button>`;
  }

  function v18MiniChart(t) {
    const map = v18ItemMap();

    const rows = t.initials.map(ini => {
      const sounds = t.finals
        .map(fin => map[`${ini}__${fin}`])
        .filter(Boolean);

      if (!sounds.length) return '';

      return `<div class="mini-mobile-row">
        <div class="mini-mobile-initial">${v18InitialLabel(ini)}</div>
        <div class="mini-mobile-sounds">
          ${sounds.map(v18MiniChip).join('')}
        </div>
      </div>`;
    }).filter(Boolean).join('');

    const finals = t.finals.map(f => `<span>${f}</span>`).join('');

    if (!rows) {
      return `<div class="mini-mobile-empty">Bảng này chưa có âm ghép khả dụng.</div>`;
    }

    return `<div class="mini-mobile-chart">
      <div class="mini-mobile-finals">
        <b>Vận mẫu:</b>
        <div>${finals}</div>
      </div>
      ${rows}
    </div>`;
  }

  window.renderGroups = function renderGroups() {
    return appShell(`
${hero('18 bảng nhỏ', 'Mỗi bảng được gom theo thẻ để dễ bấm trên điện thoại. Bấm một bảng để mở, bấm âm để nghe.')}
${typeof selectedInfoPanel === 'function' ? selectedInfoPanel() : ''}
<div class="mini-list mini-list-v18">
  ${DATA.miniTables.map(t => `<details class="mini-acc mini-acc-v18">
    <summary>
      <span class="mini-title">
        <span class="badge">${String(t.no).padStart(2,'0')}</span>
        <span>${t.title}<small>${t.tip}</small></span>
      </span>
    </summary>
    <div class="mini-body mini-body-v18">${v18MiniChart(t)}</div>
  </details>`).join('')}
</div>`);
  };

  // Chỉ mở 1 bảng tại một thời điểm.
  document.addEventListener('toggle', function (e) {
    const item = e.target;
    if (!item || !item.classList || !item.classList.contains('mini-acc-v18')) return;
    if (!item.open) return;

    document.querySelectorAll('.mini-acc-v18[open]').forEach(other => {
      if (other !== item) other.open = false;
    });

    setTimeout(() => {
      item.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }, true);

  try {
    if (typeof state !== 'undefined' && state.tab === 'groups') render();
  } catch (e) {}
})();

/* PATCH_PINYIN_V19_FIX_18_CLICK
   18 bảng: bấm âm không render lại trang, không đóng accordion.
*/
(function () {
  function v19ItemMap() {
    const map = {};
    playableItems().forEach(x => {
      map[`${x.initial}__${x.chartFinal}`] = x;
    });
    return map;
  }

  function v19InitialLabel(key) {
    const found = DATA.initials.find(x => x.key === key);
    return found ? found.label : (key || '∅');
  }

  function v19Mark(py, tone) {
    if (typeof markPinyinTone === 'function') return markPinyinTone(py, tone || state.tone || 1);
    return py;
  }

  window.pinyinMiniClickNoRenderV19 = function pinyinMiniClickNoRenderV19(safe, btn) {
    const it = itemBySafe(safe);
    if (!it) return;

    // Cập nhật selected nhưng KHÔNG gọi render().
    state.selected = safe;
    saveState();

    document.querySelectorAll('.mini-sound-chip.selected').forEach(el => {
      el.classList.remove('selected');
    });

    if (btn) btn.classList.add('selected');

    const tone = Number(state.tone || 1);
    const playableTone = it.audio && it.audio[String(tone)] ? tone : Number((it.tones && it.tones[0]) || tone);

    if (typeof playTone === 'function') {
      playTone(safe, playableTone, btn);
    }

    if (typeof showPinyinCompactPanelV15 === 'function') {
      setTimeout(() => showPinyinCompactPanelV15(it, playableTone), 50);
    } else if (typeof showPinyinCompactPanelFor === 'function') {
      setTimeout(() => showPinyinCompactPanelFor(it, playableTone), 50);
    }
  };

  function v19MiniChip(item) {
    const tone = Number(state.tone || 1);
    const selected = state.selected === item.safe ? 'selected' : '';
    const learned = state.learned[item.safe] ? 'learned' : '';
    const fav = state.favorite[item.safe] ? 'favorite' : '';

    return `<button type="button"
      class="mini-sound-chip ${selected} ${learned} ${fav}"
      onclick="event.preventDefault();event.stopPropagation();pinyinMiniClickNoRenderV19('${item.safe}', this)">
      <span class="mini-pinyin-raw">${item.pinyin}</span>
      <span class="mini-pinyin-tone">${v19Mark(item.pinyin, tone)}</span>
    </button>`;
  }

  function v19MiniChart(t) {
    const map = v19ItemMap();

    const rows = t.initials.map(ini => {
      const sounds = t.finals
        .map(fin => map[`${ini}__${fin}`])
        .filter(Boolean);

      if (!sounds.length) return '';

      return `<div class="mini-mobile-row">
        <div class="mini-mobile-initial">${v19InitialLabel(ini)}</div>
        <div class="mini-mobile-sounds">
          ${sounds.map(v19MiniChip).join('')}
        </div>
      </div>`;
    }).filter(Boolean).join('');

    const finals = t.finals.map(f => `<span>${f}</span>`).join('');

    if (!rows) {
      return `<div class="mini-mobile-empty">Bảng này chưa có âm ghép khả dụng.</div>`;
    }

    return `<div class="mini-mobile-chart">
      <div class="mini-mobile-finals">
        <b>Vận mẫu:</b>
        <div>${finals}</div>
      </div>
      ${rows}
    </div>`;
  }

  window.renderGroups = function renderGroups() {
    return appShell(`
${hero('18 bảng nhỏ', 'Mỗi bảng được gom theo thẻ để dễ bấm trên điện thoại. Bấm bảng để mở, bấm âm để nghe, bảng không tự đóng.')}
${typeof selectedInfoPanel === 'function' ? selectedInfoPanel() : ''}
<div class="mini-list mini-list-v18 mini-list-v19">
  ${DATA.miniTables.map(t => `<details class="mini-acc mini-acc-v18 mini-acc-v19">
    <summary>
      <span class="mini-title">
        <span class="badge">${String(t.no).padStart(2,'0')}</span>
        <span>${t.title}<small>${t.tip}</small></span>
      </span>
    </summary>
    <div class="mini-body mini-body-v18 mini-body-v19">${v19MiniChart(t)}</div>
  </details>`).join('')}
</div>`);
  };

  // Chỉ đóng bảng khác khi mở một bảng mới.
  // Không xử lý khi bấm âm bên trong.
  document.addEventListener('toggle', function (e) {
    const item = e.target;
    if (!item || !item.classList || !item.classList.contains('mini-acc-v19')) return;
    if (!item.open) return;

    document.querySelectorAll('.mini-acc-v19[open]').forEach(other => {
      if (other !== item) other.open = false;
    });
  }, true);

  try {
    if (typeof state !== 'undefined' && state.tab === 'groups') render();
  } catch (e) {}
})();

/* PATCH_PINYIN_V20_MOBILE_BANG_TONG
   Bảng tổng: mặc định dạng nhóm/chip dễ dùng, có nút xem bảng rộng.
*/
(function () {
  if (typeof state !== 'undefined' && !state.chartMode) {
    state.chartMode = 'cards';
  }

  function v20ItemMap() {
    const map = {};
    playableItems().forEach(x => {
      map[`${x.initial}__${x.chartFinal}`] = x;
    });
    return map;
  }

  function v20InitialLabel(key) {
    const found = DATA.initials.find(x => x.key === key);
    return found ? found.label : (key || '∅');
  }

  function v20Mark(py, tone) {
    if (typeof markPinyinTone === 'function') return markPinyinTone(py, tone || state.tone || 1);
    return py;
  }

  window.pinyinChartClickNoRenderV20 = function pinyinChartClickNoRenderV20(safe, btn) {
    const it = itemBySafe(safe);
    if (!it) return;

    state.selected = safe;
    saveState();

    document.querySelectorAll('.chart-sound-chip.selected, .syllable.selected').forEach(el => {
      el.classList.remove('selected');
    });

    if (btn) btn.classList.add('selected');

    const tone = Number(state.tone || 1);
    const playableTone = it.audio && it.audio[String(tone)] ? tone : Number((it.tones && it.tones[0]) || tone);

    if (typeof playTone === 'function') {
      playTone(safe, playableTone, btn);
    }

    if (typeof showPinyinCompactPanelV15 === 'function') {
      setTimeout(() => showPinyinCompactPanelV15(it, playableTone), 50);
    } else if (typeof showPinyinCompactPanelFor === 'function') {
      setTimeout(() => showPinyinCompactPanelFor(it, playableTone), 50);
    }
  };

  function v20Chip(item) {
    const tone = Number(state.tone || 1);
    const selected = state.selected === item.safe ? 'selected' : '';
    const learned = state.learned[item.safe] ? 'learned' : '';
    const fav = state.favorite[item.safe] ? 'favorite' : '';

    return `<button type="button"
      class="chart-sound-chip ${selected} ${learned} ${fav}"
      onclick="event.preventDefault();event.stopPropagation();pinyinChartClickNoRenderV20('${item.safe}', this)">
      <span class="chart-pinyin-raw">${item.pinyin}</span>
      <span class="chart-pinyin-tone">${v20Mark(item.pinyin, tone)}</span>
    </button>`;
  }

  function v20GroupCard(group, map) {
    const initials = filteredInitials();
    const rows = initials.map(ini => {
      const sounds = group.finals
        .map(fin => map[`${ini.key}__${fin}`])
        .filter(Boolean);

      if (!sounds.length) return '';

      return `<div class="chart-mobile-row">
        <div class="chart-mobile-initial">${v20InitialLabel(ini.key)}</div>
        <div class="chart-mobile-sounds">
          ${sounds.map(v20Chip).join('')}
        </div>
      </div>`;
    }).filter(Boolean).join('');

    if (!rows) return '';

    return `<details class="chart-group-acc" open>
      <summary>
        <span>${group.title}</span>
        <small>${group.finals.join(' · ')}</small>
      </summary>
      <div class="chart-group-body">${rows}</div>
    </details>`;
  }

  function renderChartCardsV20() {
    const map = v20ItemMap();
    const groups = filteredFinalGroups();
    const html = groups.map(g => v20GroupCard(g, map)).filter(Boolean).join('');

    if (!html) {
      return `<div class="chart-empty-v20">Không có âm phù hợp với bộ lọc hiện tại.</div>`;
    }

    return `<div class="chart-cards-v20">${html}</div>`;
  }

  // Override bảng table cũ để click không render lại nữa.
  window.renderTableV20Original = window.renderTable;
  window.renderTable = function renderTable(initials, groups, map) {
    return `<div class="table-wrap">
      <table class="pinyin-chart ${state.hideEmpty?'hide-empty':''}">
        <thead>
          <tr><th class="row-head" rowspan="2">Thanh mẫu</th>${groups.map(g=>`<th colspan="${g.finals.length}">${g.title}</th>`).join('')}</tr>
          <tr>${groups.flatMap(g=>g.finals.map(f=>`<th>${f}</th>`)).join('')}</tr>
        </thead>
        <tbody>
          ${initials.map(i=>`<tr>
            <th class="row-head">${i.label}</th>
            ${groups.flatMap(g=>g.finals.map(f=>{
              const x = map[`${i.key}__${f}`];
              if(!x) return `<td class="empty">—</td>`;
              const cls = ['syllable', ruleClass(x), state.selected===x.safe?'selected':'', state.learned[x.safe]?'learned':'', state.favorite[x.safe]?'favorite':''].join(' ');
              return `<td class="has"><button class="${cls}" onclick="event.preventDefault();event.stopPropagation();pinyinChartClickNoRenderV20('${x.safe}', this)">${x.pinyin}</button></td>`;
            })).join('')}
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  };

  window.setChartModeV20 = function setChartModeV20(mode) {
    state.chartMode = mode;
    saveState();
    render();
  };

  window.renderChart = function renderChart() {
    const zeroItems = playableItems().filter(x => x.initial === '' || x.initial === 'y' || x.initial === 'w').slice(0, 80);
    const mode = state.chartMode || 'cards';

    return appShell(`
${hero('Bảng tổng Pinyin', 'Mặc định dùng dạng thẻ dễ bấm trên điện thoại. Có thể chuyển sang bảng rộng khi cần xem toàn cảnh.', `
  <button class="btn ${mode === 'cards' ? 'primary' : ''}" onclick="setChartModeV20('cards')">Dễ bấm</button>
  <button class="btn ${mode === 'table' ? 'primary' : ''}" onclick="setChartModeV20('table')">Bảng rộng</button>
`)}
<div class="zero-strip"><b>Đứng riêng:</b>${zeroItems.map(x=>chip(x.pinyin)).join('')}</div>
<section class="chart-full-v20">
  <div class="toolbar">
    <input class="search" placeholder="Tìm trong bảng: ren, ma, xue..." value="${state.search}" oninput="state.search=this.value;saveState();render()">
    <select onchange="state.initialGroup=this.value;saveState();render()">
      <option value="all">Tất cả thanh mẫu</option>
      ${DATA.initialGroups.map(g=>`<option value="${g.key}" ${state.initialGroup===g.key?'selected':''}>${g.title}</option>`).join('')}
    </select>
    <select onchange="state.finalGroup=this.value;saveState();render()">
      <option value="all">Tất cả vận mẫu</option>
      ${DATA.finalGroups.map(g=>`<option value="${g.key}" ${state.finalGroup===g.key?'selected':''}>${g.title}</option>`).join('')}
    </select>
  </div>
  <div class="legend">
    <span><i class="dot learned-dot"></i>Đã học</span>
    <span><i class="dot rule-special-dot"></i>-i đặc biệt</span>
    <span><i class="dot rule-umlaut-dot"></i>ü</span>
    <span><i class="dot rule-abbr-dot"></i>viết tắt</span>
  </div>
  ${state.search ? renderSearchResults() : (mode === 'table' ? renderTable(filteredInitials(), filteredFinalGroups(), itemMap()) : renderChartCardsV20())}
</section>`);
  };

  try {
    if (typeof state !== 'undefined' && state.tab === 'chart') render();
  } catch (e) {}
})();

/* PINYIN_V21_LEARNING_GROUPS
   Data-driven learning groups + localStorage-based review buckets.
*/
(function () {
  const DATA_FILES_V21 = {
    groups: 'data/pinyin_groups.json',
    required: 'data/required_syllables.json',
    hanzi: 'data/hanzi_1000.json',
    shadowing: 'data/shadowing_sentences.json',
    reviewRules: 'data/review_rules.json'
  };

  const renderBeforeV21 = window.render;
  const appShellBeforeV21 = window.appShell;
  const playToneBeforeV21 = window.playTone;

  const V21 = window.PIN_YIN_GROUPS_V21 = {
    ready: false,
    groups: null,
    required: null,
    hanzi: null,
    shadowing: null,
    reviewRules: null,
    loadError: ''
  };

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[ch]));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function fetchJsonV21(url) {
    return fetch(url).then(res => {
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      return res.json();
    });
  }

  function hasV21Data() {
    return V21.ready && V21.groups && V21.required;
  }

  function progressBucket(type) {
    if (type === 'hanzi') return 'hanzi';
    if (type === 'shadowing') return 'shadowing';
    return 'syllables';
  }

  function getProgress(type, id) {
    ensureProgressState();
    const bucket = progressBucket(type);
    state.progress[bucket][id] = state.progress[bucket][id] || {};

    if (type === 'syllable') {
      if (state.learned && state.learned[id]) state.progress[bucket][id].learned = true;
      if (state.wrong && state.wrong[id]) {
        state.progress[bucket][id].wrong = Math.max(
          Number(state.progress[bucket][id].wrong || 0),
          Number(state.wrong[id] || 0)
        );
      }
    }

    return state.progress[bucket][id];
  }

  function renderPreserveScrollV21() {
    const x = window.scrollX || 0;
    const y = window.scrollY || 0;
    render();
    requestAnimationFrame(() => window.scrollTo(x, y));
  }

  function refreshProgressElementsV21(type, id) {
    try {
      document.querySelectorAll(`[data-v21-type="${type}"]`).forEach(el => {
        if (el.getAttribute('data-v21-id') !== String(id)) return;
        const slot = el.querySelector('[data-v21-status-slot]');
        if (slot) slot.innerHTML = statusChipsV21(type, id);
        el.classList.toggle('mastered', isMasteredV21(type, id));
        const p = getProgress(type, id);
        el.querySelectorAll('[data-v21-active]').forEach(node => {
          const flag = node.getAttribute('data-v21-active');
          const active = flag === 'learned' ? !!p.learned
            : flag === 'heard' ? !!p.heard
            : flag === 'mastered' ? !!p.mastered || isMasteredV21(type, id)
            : flag === 'wrong' ? Number(p.wrong || 0) > 0
            : false;
          node.classList.toggle('active', active);
          node.classList.toggle('primary', active);
          node.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
      });
    } catch (e) {}
  }

  function patchProgress(type, id, patch, rerender = true) {
    const p = getProgress(type, id);
    Object.assign(p, patch, { updatedAt: nowIso() });

    if (type === 'syllable') {
      if (patch.learned !== undefined) state.learned[id] = !!patch.learned;
      if (patch.wrong !== undefined) {
        if (Number(patch.wrong || 0) > 0) state.wrong[id] = Number(patch.wrong || 0);
        else delete state.wrong[id];
      }
    }

    saveState();
    if (rerender) renderPreserveScrollV21();
    else refreshProgressElementsV21(type, id);
  }

  function markHeard(type, id, rerender = false) {
    const p = getProgress(type, id);
    const stamp = nowIso();
    p.heard = true;
    p.heardAt = p.heardAt || stamp;
    p.lastReviewedAt = stamp;
    p.updatedAt = stamp;

    if (type === 'syllable' || type === 'shadowing') {
      p.learned = true;
      p.learnedAt = p.learnedAt || stamp;
      if (type === 'syllable') state.learned[id] = true;
    }

    saveState();
    if (rerender) renderPreserveScrollV21();
    else refreshProgressElementsV21(type, id);
  }

  function allSyllablesV21() {
    const rows = (V21.required && V21.required.syllables) || (DATA && DATA.items) || [];
    return rows.filter(x => x && x.safe);
  }

  function syllableBySafeV21(safe) {
    return allSyllablesV21().find(x => x.safe === safe) || itemBySafe(safe);
  }

  function toneForV21(item) {
    if (!item) return Number(state.tone || 1);
    if (item.audio && item.audio[String(state.tone)]) return Number(state.tone || 1);
    return Number((item.tones && item.tones[0]) || state.tone || 1);
  }

  function markedV21(item, tone) {
    if (!item) return '—';
    if (typeof markPinyinTone === 'function') return markPinyinTone(item.pinyin, tone || toneForV21(item));
    return item.pinyin;
  }

  function groupByIdV21(id) {
    const groups = (V21.groups && V21.groups.learningGroups) || [];
    return groups.find(g => g.id === id) || groups[0] || null;
  }

  function activeLearningGroupV21() {
    if (!state.activeGroup && V21.groups) state.activeGroup = V21.groups.defaultLearningGroup || 'intro';
    return groupByIdV21(state.activeGroup);
  }

  function activeReviewGroupV21() {
    const groups = (V21.groups && V21.groups.reviewGroups) || [];
    if (!state.activeReviewGroup && V21.groups) state.activeReviewGroup = V21.groups.defaultReviewGroup || 'not_started';
    return groups.find(g => g.id === state.activeReviewGroup) || groups[0] || null;
  }

  function syllablesForGroupV21(group) {
    if (!group || group.contentType !== 'syllable') return [];
    return (group.items || []).map(syllableBySafeV21).filter(Boolean);
  }

  function contentForGroupV21(group) {
    if (!group) return [];
    if (group.contentType === 'syllable') return syllablesForGroupV21(group);
    if (group.contentType === 'hanzi') return (V21.hanzi && V21.hanzi.items) || [];
    if (group.contentType === 'shadowing') return (V21.shadowing && V21.shadowing.sentences) || [];
    return [];
  }

  function groupIndexV21(id) {
    const groups = (V21.groups && V21.groups.learningGroups) || [];
    const idx = groups.findIndex(g => g.id === id);
    return idx >= 0 ? idx : 0;
  }

  function shadowingByIdV21(id) {
    return ((V21.shadowing && V21.shadowing.sentences) || []).find(item => item.id === id) || null;
  }

  function audioSrcFromV21(item) {
    if (!item) return '';
    const raw = item.audio || item.audioSrc || item.audioUrl || item.src || item.file || item.url;
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw === 'object') {
      return raw.src || raw.url || raw.file || raw.default || raw['1'] || Object.values(raw).find(v => typeof v === 'string') || '';
    }
    return '';
  }

  function playToneRawV21(safe, tone, btn) {
    const it = itemBySafe(safe) || syllableBySafeV21(safe);
    if (!it || !it.audio || !it.audio[String(tone)]) return undefined;
    clearPlaying();
    activeBtn = btn || null;
    setPlaying(activeBtn, true);
    audio.src = it.audio[String(tone)];
    audio.currentTime = 0;
    return audio.play().catch(() => clearPlaying());
  }

  function playAudioSrcV21(src, btn) {
    if (!src) return undefined;
    clearPlaying();
    activeBtn = btn || null;
    setPlaying(activeBtn, true);
    audio.src = src;
    audio.currentTime = 0;
    return audio.play().catch(() => clearPlaying());
  }

  function iconButtonV21(label, title, onclick, active = false, extraClass = '', activeFlag = '') {
    return `<button class="v23-icon-btn ${extraClass} ${active ? 'active primary' : ''}" type="button" title="${esc(title)}" aria-label="${esc(title)}" aria-pressed="${active ? 'true' : 'false'}" ${activeFlag ? `data-v21-active="${esc(activeFlag)}"` : ''} onclick="${onclick}"><span>${label}</span></button>`;
  }

  function iconStateV21(label, title, active = false, activeFlag = '') {
    return `<span class="v23-icon-state ${active ? 'active primary' : ''}" title="${esc(title)}" aria-label="${esc(title)}" aria-pressed="${active ? 'true' : 'false'}" ${activeFlag ? `data-v21-active="${esc(activeFlag)}"` : ''}>${label}</span>`;
  }

  function hasStartedV21(type, id) {
    const p = getProgress(type, id);
    return !!(p.learned || p.heard || p.shadowed || p.quizAttempts || p.mastered || Number(p.wrong || 0));
  }

  function isMasteredV21(type, id) {
    const p = getProgress(type, id);
    const thresholds = (V21.reviewRules && V21.reviewRules.thresholds) || {};
    const minCorrect = Number(thresholds.masteredQuizCorrectMin || 3);
    const maxWrong = Number(thresholds.masteredWrongMax || 0);
    if (p.mastered) return true;
    if (type === 'hanzi') return !!p.learned;
    if (type === 'shadowing') return !!(p.learned && p.shadowed);
    return !!(p.learned && p.heard && Number(p.quizCorrect || 0) >= minCorrect && Number(p.wrong || 0) <= maxWrong);
  }

  function groupDoneCountV21(group) {
    return contentForGroupV21(group).filter(item => isMasteredV21(group.contentType, item.safe || item.id)).length;
  }

  function statusChipsV21(type, id) {
    const p = getProgress(type, id);
    const chips = [];
    if (p.heard || p.learned) chips.push(['✓', type === 'shadowing' ? 'đã nghe' : 'đã nghe / đã học']);
    if (Number(p.quizAttempts || 0)) chips.push([`Q ${p.quizCorrect || 0}/${p.quizAttempts}`, 'quiz']);
    if (Number(p.wrong || 0)) chips.push([`! ${p.wrong}`, 'cần ôn']);
    if (isMasteredV21(type, id)) chips.push(['★', 'thuộc / thành thạo']);
    return chips.length
      ? `<div class="v21-status v23-status">${chips.map(x => `<span title="${esc(x[1])}">${esc(x[0])}</span>`).join('')}</div>`
      : `<div class="v21-status v23-status muted"><span>chưa học</span></div>`;
  }

  function reviewUniverseV21() {
    const syllables = allSyllablesV21().map(item => ({
      type: 'syllable',
      id: item.safe,
      title: item.pinyin,
      subtitle: `${item.initialLabel || '∅'} + ${item.chartFinal}`,
      item
    }));

    const hanzi = ((V21.hanzi && V21.hanzi.items) || []).map(item => ({
      type: 'hanzi',
      id: item.id,
      title: item.char,
      subtitle: `#${item.rank}`,
      item
    }));

    const shadowing = ((V21.shadowing && V21.shadowing.sentences) || []).map(item => ({
      type: 'shadowing',
      id: item.id,
      title: item.zh,
      subtitle: item.pinyin,
      item
    }));

    return [...syllables, ...hanzi, ...shadowing];
  }

  function isDueV21(record) {
    const p = getProgress(record.type, record.id);
    if (Number(p.wrong || 0) > 0) return true;
    if (!hasStartedV21(record.type, record.id) || isMasteredV21(record.type, record.id)) return false;

    const dueHours = Number((V21.reviewRules && V21.reviewRules.thresholds && V21.reviewRules.thresholds.dueAfterHours) || 24);
    if (!p.lastReviewedAt) return true;
    const elapsed = Date.now() - Date.parse(p.lastReviewedAt);
    return Number.isFinite(elapsed) && elapsed >= dueHours * 60 * 60 * 1000;
  }

  function recordsForReviewV21(bucketId) {
    const wrongMany = Number((V21.reviewRules && V21.reviewRules.thresholds && V21.reviewRules.thresholds.wrongManyMin) || 3);
    return reviewUniverseV21().filter(record => {
      const p = getProgress(record.type, record.id);
      if (bucketId === 'not_started') return !hasStartedV21(record.type, record.id);
      if (bucketId === 'due') return isDueV21(record);
      if (bucketId === 'wrong_many') return Number(p.wrong || 0) >= wrongMany;
      if (bucketId === 'unheard') return record.type !== 'hanzi' && !p.heard;
      if (bucketId === 'unshadowed') return false;
      if (bucketId === 'unquizzed') return record.type === 'syllable' && !Number(p.quizAttempts || 0);
      if (bucketId === 'mastered') return isMasteredV21(record.type, record.id);
      return false;
    });
  }

  function renderTopHeroV21(title, subtitle, extra = '') {
    return `<section class="v21-hero">
      <div>
        <div class="kicker">Pinyin</div>
        <h1 class="title">${esc(title)}</h1>
        <p class="subtitle">${esc(subtitle)}</p>
      </div>
      ${extra ? `<div class="v21-hero-extra">${extra}</div>` : ''}
    </section>`;
  }

  function navButtonV21(tab, label, count = '') {
    const active = state.tab === tab || (tab === 'learn' && (state.tab === 'chart' || state.tab === 'rules'));
    return `<button class="nav-btn ${active ? 'active' : ''}" type="button" onclick="setTab('${tab}')"><span>${esc(label)}</span>${count !== '' ? `<span class="count">${esc(count)}</span>` : ''}</button>`;
  }

  window.appShell = function appShell(content) {
    if (!hasV21Data()) return appShellBeforeV21 ? appShellBeforeV21(content) : content;

    const groups = V21.groups.learningGroups || [];
    const total = (V21.required && V21.required.audioCount) || (DATA && DATA.stats && DATA.stats.audioItems) || 0;
    const reviewTotal = recordsForReviewV21('due').length;
    const masteredTotal = recordsForReviewV21('mastered').length;
    const requiredTotal = (V21.required && V21.required.count) || allSyllablesV21().length || 0;

    return `
<header class="tt-module-top-nav v22-top-nav">
  <a class="tt-top-brand" href="../../index.html" target="_self"><span class="tt-top-logo">拼</span><span class="tt-top-name">Pinyin</span><span class="tt-top-meta"> · ${requiredTotal} âm · ${groups.length} nhóm</span></a>
  <nav class="tt-top-links">
    <a href="../../index.html" target="_self">Trang chủ</a>
    <a href="../bo-thu-50/index.html" target="_self">Bộ thủ</a>
    <a href="../pinyin/index.html" target="_self" class="active">Pinyin</a>
    <a href="../../index.html#dialogue301" target="_self">301 Đàm thoại</a>
  </nav>
</header>

<div class="app-shell v21-shell">
  <aside class="sidebar v21-sidebar">
    <div class="brand"><div class="brand-logo">拼</div><div><h1>Pinyin</h1><p>Học nhanh · nghe đúng</p></div></div>
    ${navButtonV21('learn','Học', groups.length)}
    ${navButtonV21('listen','Nghe', total)}
    ${navButtonV21('practice','Quiz')}
    ${navButtonV21('review','Ôn', reviewTotal)}
    ${navButtonV21('progress','Tiến độ', masteredTotal)}
    <div class="side-card">
      <div class="side-stat">
        <div><span>Nhóm học</span><b>${groups.length}</b></div>
        <div><span>Âm bắt buộc</span><b>${requiredTotal}</b></div>
        <div><span>Đã thành thạo</span><b>${masteredTotal}</b></div>
        <div><span>Audio thật</span><b>${total}</b></div>
      </div>
    </div>
  </aside>
  <main class="content v21-content">${content}</main>
</div>`;
  };

  window.setTab = function setTab(tab) {
    if (typeof window.hidePinyinCompactPanel === 'function') window.hidePinyinCompactPanel();
    state.tab = tab;
    saveState();
    render();
  };

  window.setActiveGroupV21 = function setActiveGroupV21(id) {
    state.activeGroup = id;
    state.tab = 'learn';
    saveState();
    render();
    requestAnimationFrame(() => {
      const target = document.getElementById('v21-current-study') || document.getElementById('v21-group-detail');
      if (target) target.scrollIntoView({ block: 'start' });
    });
  };

  window.stepActiveGroupV21 = function stepActiveGroupV21(delta) {
    const groups = (V21.groups && V21.groups.learningGroups) || [];
    if (!groups.length) return;
    const idx = groupIndexV21(state.activeGroup);
    const next = Math.max(0, Math.min(groups.length - 1, idx + Number(delta || 0)));
    setActiveGroupV21(groups[next].id);
  };

  window.setReviewGroupV21 = function setReviewGroupV21(id) {
    state.activeReviewGroup = id;
    state.tab = 'review';
    saveState();
    render();
  };

  window.openStudyGroupsV21 = function openStudyGroupsV21() {
    const target = document.getElementById('v21-current-study') || document.getElementById('v21-group-detail');
    if (target) target.scrollIntoView({ block: 'start' });
  };

  function homeActionV21(title, subtitle, action, tone = 'blue') {
    return `<button class="v22-action-card ${tone}" type="button" onclick="${action}">
      <b>${esc(title)}</b>
      <span>${esc(subtitle)}</span>
    </button>`;
  }

  window.markProgressV21 = function markProgressV21(type, id, action) {
    const p = getProgress(type, id);
    const stamp = nowIso();
    if (action === 'learned') patchProgress(type, id, { learned: !p.learned, learnedAt: p.learned ? p.learnedAt : stamp });
    if (action === 'heard') patchProgress(type, id, { heard: true, learned: true, heardAt: p.heardAt || stamp, learnedAt: p.learnedAt || stamp, lastReviewedAt: stamp });
    if (action === 'shadowed') patchProgress(type, id, { shadowed: !p.shadowed, shadowedAt: p.shadowed ? p.shadowedAt : stamp });
    if (action === 'mastered') patchProgress(type, id, { mastered: !p.mastered, masteredAt: p.mastered ? p.masteredAt : stamp, learned: true, learnedAt: p.learnedAt || stamp });
    if (action === 'wrong') patchProgress(type, id, { wrong: Number(p.wrong || 0) + 1, lastReviewedAt: stamp });
    if (action === 'clearWrong') patchProgress(type, id, { wrong: 0, lastReviewedAt: stamp });
  };

  window.playTone = function playTone(safe, tone, btn) {
    if (state.tab === 'practice') {
      if (state.quiz && state.quiz.safe === safe) state.quiz.heard = true;
      markHeard('syllable', safe, false);
      saveState();
      if (typeof window.hidePinyinCompactPanel === 'function') window.hidePinyinCompactPanel();
      return playToneRawV21(safe, tone, btn);
    }

    markHeard('syllable', safe, false);
    const result = playToneBeforeV21 ? playToneBeforeV21(safe, tone, btn) : playToneRawV21(safe, tone, btn);
    setTimeout(() => {
      if (state.tab !== 'listen' && state.tab !== 'chart' && typeof window.hidePinyinCompactPanel === 'function') {
        window.hidePinyinCompactPanel();
      }
    }, 140);
    return result;
  };

  window.playSyllableV21 = function playSyllableV21(safe, tone, btn) {
    state.selected = safe;
    saveState();
    playTone(safe, tone, btn);
  };

  window.playQuizToneV21 = function playQuizToneV21(safe, tone, btn) {
    state.selected = safe;
    if (state.quiz && state.quiz.safe === safe) state.quiz.heard = true;
    markHeard('syllable', safe, false);
    saveState();
    if (typeof window.hidePinyinCompactPanel === 'function') window.hidePinyinCompactPanel();
    return playToneRawV21(safe, tone, btn);
  };

  window.playShadowingAudioV21 = function playShadowingAudioV21(id, btn) {
    const item = shadowingByIdV21(id);
    const src = audioSrcFromV21(item);
    if (!src) return;
    markHeard('shadowing', id, false);
    return playAudioSrcV21(src, btn);
  };

  window.markShadowingHeardV21 = function markShadowingHeardV21(id) {
    markHeard('shadowing', id, true);
  };

  window.toggleLearned = function toggleLearned(safe) {
    const p = getProgress('syllable', safe);
    patchProgress('syllable', safe, { learned: !p.learned, learnedAt: p.learned ? p.learnedAt : nowIso() });
  };

  window.markWrong = function markWrong(safe) {
    const p = getProgress('syllable', safe);
    patchProgress('syllable', safe, { wrong: Number(p.wrong || 0) + 1, lastReviewedAt: nowIso() });
  };

  window.clearWrong = function clearWrong(safe) {
    patchProgress('syllable', safe, { wrong: 0, lastReviewedAt: nowIso() });
  };

  function learningGroupButtonV21(group) {
    const done = groupDoneCountV21(group);
    const total = contentForGroupV21(group).length || group.count || 0;
    return `<button class="v21-group-tab ${state.activeGroup === group.id ? 'active' : ''}" onclick="setActiveGroupV21('${esc(group.id)}')">
      <span>${String(group.order || '').padStart(2, '0')}</span>
      <b>${esc(group.title)}</b>
      <small>${done}/${total}</small>
    </button>`;
  }

  function renderGroupPickerV21(groups, active) {
    if (!groups.length || !active) return '';
    const idx = groupIndexV21(active.id);
    const done = groupDoneCountV21(active);
    const total = contentForGroupV21(active).length || active.count || 0;
    return `<div class="v23-group-picker" aria-label="Chọn nhóm học">
      <button class="v23-group-step" type="button" onclick="stepActiveGroupV21(-1)" ${idx <= 0 ? 'disabled' : ''} aria-label="Nhóm trước">‹</button>
      <label class="v23-group-current">
        <span>Nhóm ${String(idx + 1).padStart(2, '0')}/${groups.length} · ${done}/${total}</span>
        <select class="v23-group-select" onchange="setActiveGroupV21(this.value)">
          ${groups.map(g => `<option value="${esc(g.id)}" ${g.id === active.id ? 'selected' : ''}>${String(g.order || '').padStart(2, '0')} · ${esc(g.title)}</option>`).join('')}
        </select>
      </label>
      <button class="v23-group-step" type="button" onclick="stepActiveGroupV21(1)" ${idx >= groups.length - 1 ? 'disabled' : ''} aria-label="Nhóm sau">›</button>
    </div>`;
  }

  function renderSyllableCardV21(item) {
    const tone = toneForV21(item);
    const p = getProgress('syllable', item.safe);
    const rule = typeof getBetterRule === 'function' ? getBetterRule(item) : { rule: item.rule, hint: item.hint };
    const wrongCount = Number(p.wrong || 0);
    return `<article class="v21-card v21-syllable-card ${isMasteredV21('syllable', item.safe) ? 'mastered' : ''}" data-v21-type="syllable" data-v21-id="${esc(item.safe)}">
      <div class="v21-card-head">
        <div>
          <b class="v21-pinyin">${esc(markedV21(item, tone))}</b>
          <span>${esc(item.pinyin)} · ${esc(item.initialLabel || '∅')} + ${esc(item.chartFinal)}</span>
        </div>
        ${iconButtonV21('🔊', 'Nghe âm này. Nghe xong tự đánh dấu đã học.', `playSyllableV21('${esc(item.safe)}', ${tone}, this)`, !!p.heard, 'v23-listen-btn', 'heard')}
      </div>
      <p><b>${esc(rule.rule || item.rule)}</b> · ${esc(rule.hint || item.hint || '')}</p>
      <div data-v21-status-slot>${statusChipsV21('syllable', item.safe)}</div>
      <div class="v21-actions v23-icon-actions">
        ${iconStateV21('✓', 'Đã nghe / đã học', !!(p.heard || p.learned), 'learned')}
        ${iconButtonV21('★', 'Đánh dấu thuộc', `markProgressV21('syllable','${esc(item.safe)}','mastered')`, !!p.mastered || isMasteredV21('syllable', item.safe), 'v23-master-btn', 'mastered')}
        ${iconButtonV21('!', wrongCount ? `Đang cần ôn: ${wrongCount} lần` : 'Đánh dấu sai / cần ôn', `markProgressV21('syllable','${esc(item.safe)}','wrong')`, wrongCount > 0, 'v23-wrong-btn', 'wrong')}
        ${wrongCount ? iconButtonV21('↺', 'Xóa lỗi sau khi đã ôn', `markProgressV21('syllable','${esc(item.safe)}','clearWrong')`, false, 'v23-clear-btn') : ''}
      </div>
    </article>`;
  }

  function renderHanziCardV21(item) {
    const p = getProgress('hanzi', item.id);
    return `<article class="v21-card v21-hanzi-card ${isMasteredV21('hanzi', item.id) ? 'mastered' : ''}" data-v21-type="hanzi" data-v21-id="${esc(item.id)}">
      <div class="v21-hanzi">${esc(item.char)}</div>
      <div class="v21-hanzi-meta">#${item.rank} · ${esc(item.source || '')}</div>
      <div data-v21-status-slot>${statusChipsV21('hanzi', item.id)}</div>
      <div class="v21-actions v23-icon-actions">
        ${iconButtonV21('✓', 'Đã học chữ này', `markProgressV21('hanzi','${esc(item.id)}','learned')`, !!p.learned, 'v23-learned-btn', 'learned')}
        ${iconButtonV21('★', 'Thuộc chữ này', `markProgressV21('hanzi','${esc(item.id)}','mastered')`, !!p.mastered || isMasteredV21('hanzi', item.id), 'v23-master-btn', 'mastered')}
      </div>
    </article>`;
  }

  function renderShadowingCardV21(item) {
    const p = getProgress('shadowing', item.id);
    const src = audioSrcFromV21(item);
    return `<article class="v21-card v21-shadow-card ${isMasteredV21('shadowing', item.id) ? 'mastered' : ''}" data-v21-type="shadowing" data-v21-id="${esc(item.id)}">
      <div class="v21-shadow-zh">${esc(item.zh)}</div>
      <div class="v21-shadow-pinyin">${esc(item.pinyin)}</div>
      <p>${esc(item.vi)}</p>
      <div data-v21-status-slot>${statusChipsV21('shadowing', item.id)}</div>
      <div class="v21-actions v23-icon-actions">
        ${src ? iconButtonV21('🔊', 'Nghe câu mẫu', `playShadowingAudioV21('${esc(item.id)}', this)`, !!p.heard, 'v23-listen-btn', 'heard') : `<button class="v23-icon-btn" type="button" disabled title="Chưa có audio mẫu" aria-label="Chưa có audio mẫu"><span>🔇</span></button>`}
        ${iconButtonV21('✓', 'Đánh dấu đã nghe / đã học', `markProgressV21('shadowing','${esc(item.id)}','heard')`, !!(p.heard || p.learned), 'v23-learned-btn', 'learned')}
        ${iconButtonV21('★', 'Thuộc câu này', `markProgressV21('shadowing','${esc(item.id)}','mastered')`, !!p.mastered || isMasteredV21('shadowing', item.id), 'v23-master-btn', 'mastered')}
      </div>
    </article>`;
  }

  function renderGroupDetailV21(group) {
    if (!group) return `<div class="panel">Chưa có nhóm học.</div>`;
    const items = contentForGroupV21(group);
    const done = groupDoneCountV21(group);
    const total = items.length || group.count || 0;
    const goals = (group.goals || []).map(goal => `<li>${esc(goal)}</li>`).join('');

    let body = '';
    if (group.contentType === 'syllable') {
      body = `<div class="v21-card-grid syllables">${items.map(renderSyllableCardV21).join('')}</div>`;
    } else if (group.contentType === 'hanzi') {
      body = `<div class="v21-card-grid hanzi">${items.slice(0, 120).map(renderHanziCardV21).join('')}</div>
        <p class="muted v21-footnote">Đang hiển thị 120/1000 chữ đầu để trang nhẹ hơn; ôn tự động vẫn tính trên toàn bộ 1000 chữ.</p>`;
    } else if (group.contentType === 'shadowing') {
      body = `<div class="v21-card-grid shadowing">${items.map(renderShadowingCardV21).join('')}</div>`;
    }

    return `<section id="v21-group-detail" class="v21-detail">
      <div class="v21-detail-head">
        <div>
          <div class="kicker">${esc(group.contentType)}</div>
          <h2>${esc(group.title)}</h2>
          <p>${esc(group.description || '')}</p>
        </div>
        <div class="v21-progress-ring"><b>${done}</b><span>/${total}</span></div>
      </div>
      ${goals ? `<ul class="v21-goals">${goals}</ul>` : ''}
      ${group.contentType === 'syllable' ? `<div class="v21-toolbar">
        <button class="btn primary" onclick="startGroupQuizV21('${esc(group.id)}')">Quiz nhóm này</button>
        <button class="btn" onclick="setTab('chart')">Mở bảng tổng</button>
      </div>` : ''}
      ${body}
    </section>`;
  }

  window.renderLearn = function renderLearn() {
    const groups = (V21.groups && V21.groups.learningGroups) || [];
    const active = activeLearningGroupV21();
    const dueCount = recordsForReviewV21('due').length;
    const learnedCount = Object.values(state.learned || {}).filter(Boolean).length;
    const requiredTotal = (V21.required && V21.required.count) || allSyllablesV21().length || 0;
    return appShell(`
<section class="v22-home">
  <div class="v22-home-head">
    <div>
      <div class="kicker">Hôm nay học gì?</div>
      <h1>Học Pinyin</h1>
      <p>${learnedCount}/${requiredTotal} âm đã học · ${dueCount} mục cần ôn</p>
    </div>
    <span>拼</span>
  </div>
  <div class="v22-action-grid">
    ${homeActionV21('Tiếp tục học', active ? active.title : 'Chọn nhóm Pinyin', 'openStudyGroupsV21()', 'green')}
    ${homeActionV21('Nghe nhanh', 'Tra âm và nghe mẫu', "setTab('listen')", 'blue')}
    ${homeActionV21('Quiz nghe', 'Luyện thanh theo nhóm', `startGroupQuizV21('${esc(active ? active.id : '')}')`, 'amber')}
    ${homeActionV21('Ôn âm yếu', `${dueCount} mục cần xem lại`, "setTab('review')", 'red')}
  </div>

  <section class="v22-lookup">
    <h2>Tra cứu</h2>
    <div class="v22-lookup-actions">
      <button class="btn" type="button" onclick="setTab('listen')">Tra âm</button>
      <button class="btn" type="button" onclick="setTab('chart')">Bảng tổng</button>
      <button class="btn" type="button" onclick="setTab('rules')">Quy tắc</button>
    </div>
  </section>

  <section id="v21-current-study" class="v23-study-panel">
    ${renderGroupPickerV21(groups, active)}
    ${renderGroupDetailV21(active)}
  </section>
</section>`);
  };

  function renderReviewRecordV21(record) {
    const p = getProgress(record.type, record.id);
    if (record.type === 'syllable') {
      const item = record.item;
      const tone = toneForV21(item);
      const wrongCount = Number(p.wrong || 0);
      return `<article class="v21-review-row" data-v21-type="syllable" data-v21-id="${esc(item.safe)}">
        <div><b>${esc(markedV21(item, tone))}</b><span>${esc(record.subtitle)}</span></div>
        <div data-v21-status-slot>${statusChipsV21(record.type, record.id)}</div>
        <div class="v21-actions v23-icon-actions">
          ${iconButtonV21('🔊', 'Nghe lại âm này', `playSyllableV21('${esc(item.safe)}', ${tone}, this)`, !!p.heard, 'v23-listen-btn', 'heard')}
          ${iconStateV21('✓', 'Đã nghe / đã học', !!(p.heard || p.learned), 'learned')}
          ${iconButtonV21('★', 'Đánh dấu thuộc', `markProgressV21('syllable','${esc(item.safe)}','mastered')`, !!p.mastered || isMasteredV21('syllable', item.safe), 'v23-master-btn', 'mastered')}
          ${wrongCount ? iconButtonV21('↺', 'Xóa lỗi sau khi đã ôn', `markProgressV21('syllable','${esc(item.safe)}','clearWrong')`, true, 'v23-clear-btn', 'wrong') : iconButtonV21('!', 'Đánh dấu cần ôn', `markProgressV21('syllable','${esc(item.safe)}','wrong')`, false, 'v23-wrong-btn')}
        </div>
      </article>`;
    }

    if (record.type === 'hanzi') {
      return `<article class="v21-review-row" data-v21-type="hanzi" data-v21-id="${esc(record.id)}">
        <div><b class="v21-hanzi-inline">${esc(record.title)}</b><span>${esc(record.subtitle)}</span></div>
        <div data-v21-status-slot>${statusChipsV21(record.type, record.id)}</div>
        <div class="v21-actions v23-icon-actions">
          ${iconButtonV21('✓', 'Đã học chữ này', `markProgressV21('hanzi','${esc(record.id)}','learned')`, !!p.learned, 'v23-learned-btn', 'learned')}
          ${iconButtonV21('★', 'Thuộc chữ này', `markProgressV21('hanzi','${esc(record.id)}','mastered')`, !!p.mastered || isMasteredV21('hanzi', record.id), 'v23-master-btn', 'mastered')}
        </div>
      </article>`;
    }

    const src = audioSrcFromV21(record.item);
    return `<article class="v21-review-row" data-v21-type="shadowing" data-v21-id="${esc(record.id)}">
      <div><b>${esc(record.title)}</b><span>${esc(record.subtitle)}</span></div>
      <div data-v21-status-slot>${statusChipsV21(record.type, record.id)}</div>
      <div class="v21-actions v23-icon-actions">
        ${src ? iconButtonV21('🔊', 'Nghe câu mẫu', `playShadowingAudioV21('${esc(record.id)}', this)`, !!p.heard, 'v23-listen-btn', 'heard') : `<button class="v23-icon-btn" type="button" disabled title="Chưa có audio mẫu" aria-label="Chưa có audio mẫu"><span>🔇</span></button>`}
        ${iconButtonV21('✓', 'Đánh dấu đã nghe / đã học', `markProgressV21('shadowing','${esc(record.id)}','heard')`, !!(p.heard || p.learned), 'v23-learned-btn', 'learned')}
        ${iconButtonV21('★', 'Thuộc câu này', `markProgressV21('shadowing','${esc(record.id)}','mastered')`, !!p.mastered || isMasteredV21('shadowing', record.id), 'v23-master-btn', 'mastered')}
      </div>
    </article>`;
  }

  window.renderReview = function renderReview() {
    const groups = (V21.groups && V21.groups.reviewGroups) || [];
    const active = activeReviewGroupV21();
    const records = active ? recordsForReviewV21(active.id) : [];
    return appShell(`
${renderTopHeroV21('Nhóm cần ôn', 'Các nhóm này được tính tự động từ tiến độ localStorage: nghe, quiz, lỗi và thành thạo.', `
  <button class="btn primary" onclick="setTab('learn')">Quay lại nhóm học</button>
`)}
<section class="v21-review-layout">
  <aside class="v21-group-list">
    ${groups.map(g => `<button class="v21-group-tab ${state.activeReviewGroup === g.id ? 'active' : ''}" onclick="setReviewGroupV21('${esc(g.id)}')">
      <span>${recordsForReviewV21(g.id).length}</span><b>${esc(g.title)}</b><small>${esc(g.description || '')}</small>
    </button>`).join('')}
  </aside>
  <section class="v21-detail">
    <div class="v21-detail-head">
      <div><div class="kicker">auto review</div><h2>${esc(active ? active.title : 'Ôn tập')}</h2><p>${esc(active ? active.description : '')}</p></div>
      <div class="v21-progress-ring"><b>${records.length}</b><span>mục</span></div>
    </div>
    <div class="v21-review-list">
      ${records.length ? records.slice(0, 220).map(renderReviewRecordV21).join('') : `<div class="panel"><p class="muted">Nhóm này đang trống.</p></div>`}
    </div>
  </section>
</section>`);
  };

  window.renderProgressV21 = function renderProgressV21() {
    const syllables = allSyllablesV21();
    const total = syllables.length;
    const learned = syllables.filter(item => getProgress('syllable', item.safe).learned).length;
    const heard = syllables.filter(item => getProgress('syllable', item.safe).heard).length;
    const quizzed = syllables.filter(item => Number(getProgress('syllable', item.safe).quizAttempts || 0)).length;
    const mastered = recordsForReviewV21('mastered').length;
    const due = recordsForReviewV21('due').length;
    const wrongMany = recordsForReviewV21('wrong_many').length;

    return appShell(`
${renderTopHeroV21('Tiến độ', 'Tóm tắt từ localStorage hiện có. Không đổi key, không đổi format dữ liệu.', `
  <button class="btn primary" type="button" onclick="setTab('learn')">Học tiếp</button>
  <button class="btn" type="button" onclick="setTab('review')">Ôn ngay</button>
`)}
<section class="v22-progress-grid">
  <article><b>${learned}</b><span>Đã học</span></article>
  <article><b>${heard}</b><span>Đã nghe</span></article>
  <article><b>${quizzed}</b><span>Đã quiz</span></article>
  <article><b>${mastered}</b><span>Thành thạo</span></article>
  <article><b>${due}</b><span>Cần ôn</span></article>
  <article><b>${wrongMany}</b><span>Sai nhiều</span></article>
</section>
<section class="v22-lookup">
  <h2>Tổng quan</h2>
  <p class="muted">Pinyin đang có ${total} âm tiết bắt buộc và ${(V21.groups && V21.groups.learningGroups || []).length} nhóm học. Tiến độ cũ vẫn nằm trong localStorage key <code>${LS_KEY}</code>.</p>
</section>`);
  };

  function quizPoolForGroupV21(groupId) {
    const group = groupByIdV21(groupId || state.activeGroup);
    const items = group && group.contentType === 'syllable' ? syllablesForGroupV21(group) : allSyllablesV21();
    return items.filter(x => x.hasAudio && x.tones && x.tones.length);
  }

  window.startGroupQuizV21 = function startGroupQuizV21(groupId) {
    const pool = quizPoolForGroupV21(groupId);
    if (!pool.length) return;
    const item = pool[Math.floor(Math.random() * pool.length)];
    const tone = item.tones[Math.floor(Math.random() * item.tones.length)];
    state.quiz = { safe: item.safe, tone, answered: false, feedback: '', groupId: groupId || state.activeGroup };
    state.tab = 'practice';
    saveState();
    render();
  };

  window.newQuiz = function newQuiz() {
    startGroupQuizV21(state.activeGroup);
  };

  window.answerQuiz = function answerQuiz(tone) {
    if (!state.quiz) return;
    const item = syllableBySafeV21(state.quiz.safe);
    if (!item) return;
    const p = getProgress('syllable', item.safe);
    const ok = Number(tone) === Number(state.quiz.tone);
    const stamp = nowIso();
    const attempts = Number(p.quizAttempts || 0) + 1;
    const correct = Number(p.quizCorrect || 0) + (ok ? 1 : 0);
    const wrong = Number(p.wrong || 0) + (ok ? 0 : 1);
    const heardInQuiz = !!(p.heard || state.quiz.heard);
    const learnedByQuiz = !!(p.learned || ok);
    Object.assign(p, {
      quizAttempts: attempts,
      quizCorrect: correct,
      quizWrong: attempts - correct,
      wrong,
      heard: heardInQuiz || p.heard,
      heardAt: heardInQuiz ? (p.heardAt || stamp) : p.heardAt,
      learned: learnedByQuiz,
      learnedAt: learnedByQuiz ? (p.learnedAt || stamp) : p.learnedAt,
      lastReviewedAt: stamp,
      updatedAt: stamp
    });
    if (learnedByQuiz) state.learned[item.safe] = true;
    state.wrong[item.safe] = wrong;
    if (wrong <= 0) delete state.wrong[item.safe];
    state.quiz.answered = true;
    state.quiz.feedback = ok ? `Đúng: ${markedV21(item, state.quiz.tone)}` : `Sai. Đáp án đúng: ${markedV21(item, state.quiz.tone)}`;
    saveState();
    render();
  };

  window.renderPractice = function renderPractice() {
    const group = activeLearningGroupV21();
    const pool = quizPoolForGroupV21(group && group.id);
    const q = state.quiz;
    const item = q ? syllableBySafeV21(q.safe) : null;
    return appShell(`
${renderTopHeroV21('Quiz nghe theo nhóm', `Nguồn câu hỏi hiện tại: ${group ? group.title : 'toàn bộ âm tiết'}.`, `
  <button class="btn primary" onclick="startGroupQuizV21('${esc(group ? group.id : '')}')">Câu mới</button>
  <button class="btn" onclick="setTab('learn')">Chọn nhóm khác</button>
`)}
<div class="quiz-card v21-quiz">
  ${!q || !item ? `<p class="muted">Có ${pool.length} âm có thể đưa vào quiz từ nhóm đang chọn.</p><button class="btn primary" onclick="startGroupQuizV21('${esc(group ? group.id : '')}')">Bắt đầu</button>` : `
    <div class="muted">Nghe và chọn đúng thanh</div>
    <div class="quiz-big">${q.answered ? esc(markedV21(item, q.tone)) : '?'}</div>
    <button class="btn primary" onclick="playQuizToneV21('${esc(q.safe)}', ${q.tone}, this)">Phát âm 🔊</button>
    <div class="quiz-options">${[1,2,3,4].map(t => `<button class="btn" onclick="answerQuiz(${t})">Thanh ${t}</button>`).join('')}</div>
    ${q.answered ? `<div class="feedback ${q.feedback.startsWith('Đúng') ? 'ok' : 'bad'}">${esc(q.feedback)}</div><button class="btn primary" style="margin-top:12px" onclick="startGroupQuizV21('${esc(q.groupId || (group && group.id) || '')}')">Câu tiếp</button>` : ''}
  `}
</div>`);
  };

  window.render = function render() {
    const app = $('#app');
    if (!app) return;
    if (!DATA) {
      app.innerHTML = '<div class="loading">Đang tải Pinyin...</div>';
      return;
    }
    if (!hasV21Data()) {
      if (typeof renderBeforeV21 === 'function') return renderBeforeV21();
      app.innerHTML = '<div class="loading">Đang tải nhóm Pinyin...</div>';
      return;
    }

    ensureProgressState();
    if (!state.tab || state.tab === 'groups') state.tab = 'learn';
    if (!state.activeGroup) state.activeGroup = V21.groups.defaultLearningGroup || 'intro';
    if (!state.activeReviewGroup) state.activeReviewGroup = V21.groups.defaultReviewGroup || 'not_started';

    let html = '';
    if (state.tab === 'learn') html = window.renderLearn();
    else if (state.tab === 'listen') html = window.renderListen();
    else if (state.tab === 'practice') html = window.renderPractice();
    else if (state.tab === 'review') html = window.renderReview();
    else if (state.tab === 'progress') html = window.renderProgressV21();
    else if (state.tab === 'chart') html = window.renderChart();
    else if (state.tab === 'rules') html = window.renderRules();
    else html = window.renderLearn();
    app.innerHTML = html;
  };

  function loadV21Data() {
    Promise.all([
      fetchJsonV21(DATA_FILES_V21.groups),
      fetchJsonV21(DATA_FILES_V21.required),
      fetchJsonV21(DATA_FILES_V21.hanzi),
      fetchJsonV21(DATA_FILES_V21.shadowing),
      fetchJsonV21(DATA_FILES_V21.reviewRules)
    ]).then(([groups, required, hanzi, shadowing, reviewRules]) => {
      V21.groups = groups;
      V21.required = required;
      V21.hanzi = hanzi;
      V21.shadowing = shadowing;
      V21.reviewRules = reviewRules;
      V21.ready = true;
      V21.loadError = '';
      if (!state.activeGroup) state.activeGroup = groups.defaultLearningGroup || 'intro';
      if (!state.activeReviewGroup) state.activeReviewGroup = groups.defaultReviewGroup || 'not_started';
      if (!state.tab || state.tab === 'groups') state.tab = 'learn';
      saveState();
      render();
    }).catch(err => {
      V21.loadError = err.message || String(err);
      console.error('Không tải được dữ liệu nhóm Pinyin V21:', err);
      if (typeof renderBeforeV21 === 'function') renderBeforeV21();
    });
  }

  loadV21Data();
})();

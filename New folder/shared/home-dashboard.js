(function(){
  'use strict';
  const script = document.currentScript;
  const scriptUrl = script && script.src ? new URL(script.src) : new URL('./home-dashboard.js', document.baseURI);
  const root = new URL('../../', scriptUrl);
  const routes = {
    lookup: new URL('modules/lookup/index.html', root).href,
    learn: new URL('modules/hanzi-stroke/index.html', root).href,
    writing: new URL('modules/hanzi-stroke/index.html?study=writing', root).href,
    hsk: new URL('modules/hanzi-stroke/index.html?study=hsk', root).href,
    radicals: new URL('modules/hanzi-stroke/index.html?study=radicals', root).href,
    cards: new URL('modules/hanzi-stroke/index.html?study=flashcards', root).href,
    pinyin: new URL('modules/pinyin/index.html', root).href,
    dialogue301: new URL('index.html#dialogue301', root).href
  };
  function safeJson(key){ try{return JSON.parse(localStorage.getItem(key)||'null')}catch(_e){return null} }
  function getResume(){
    const session=safeJson('hanziStroke.flashcardSession.v1')||safeJson('hanziStrokeFlashcardSession')||safeJson('hsk.flashcard.session');
    if(session && typeof session==='object') return {title:session.contextLabel||session.title||'Tiếp tục phiên Thẻ',subtitle:'Khôi phục phiên học gần nhất',href:routes.cards,icon:'卡'};
    const last=safeJson('tiengTrung.navigation.v1');
    if(last && last.lastRoute) return {title:'Tiếp tục học',subtitle:'Mở nội dung gần nhất',href:last.lastRoute,icon:'学'};
    return null;
  }
  function countRatings(){
    let review=0,hard=0;
    try{
      for(let i=0;i<localStorage.length;i+=1){
        const key=localStorage.key(i)||'';
        if(!/flashcard|rating|progress/i.test(key)) continue;
        const value=safeJson(key);
        const walk=v=>{ if(!v)return; if(Array.isArray(v)){v.forEach(walk);return;} if(typeof v==='object'){Object.values(v).forEach(walk);return;} if(v==='review'||v==='Ôn'||v==='on')review+=1; if(v==='hard'||v==='Khó'||v==='kho')hard+=1; };
        walk(value);
      }
    }catch(_e){}
    return {review,hard};
  }
  function mount(){
    if(!document.body || document.querySelector('[data-ui-home-dashboard]')) return;
    const main=document.querySelector('main')||document.body;
    const ratings=countRatings();
    const resume=getResume();
    const section=document.createElement('section');
    section.className='ui-home-dashboard';
    section.dataset.uiHomeDashboard='';
    section.innerHTML=`
      <div class="ui-home-hero"><p>Học mỗi ngày</p><h1>Tiếng Trung</h1><small>Tra cứu, luyện viết, học theo giáo trình và ôn bằng thẻ trong một nơi.</small></div>
      ${resume?`<section class="ui-home-section"><div class="ui-home-section__head"><h2>Tiếp tục học</h2></div><a class="ui-home-resume" href="${resume.href}"><span class="ui-home-resume__icon">${resume.icon}</span><span><strong>${resume.title}</strong><small>${resume.subtitle}</small></span><b>›</b></a></section>`:''}
      <section class="ui-home-section"><div class="ui-home-section__head"><h2>Học nhanh</h2></div><div class="ui-home-quick-grid">
        <a class="ui-home-quick-card" href="${routes.lookup}"><span>⌕</span><strong>Tra</strong><small>Tra chữ, từ và pinyin</small></a>
        <a class="ui-home-quick-card" href="${routes.learn}"><span>学</span><strong>Học</strong><small>Mở trung tâm học tập</small></a>
        <a class="ui-home-quick-card" href="${routes.writing}"><span>✍</span><strong>Bút thuận</strong><small>Luyện viết từng nét</small></a>
        <a class="ui-home-quick-card" href="${routes.hsk}"><span>课</span><strong>HSK</strong><small>Bài, từ vựng, ngữ pháp</small></a>
        <a class="ui-home-quick-card" href="${routes.cards}"><span>卡</span><strong>Thẻ</strong><small>Flashcard và Gõ Pinyin</small></a>
        <a class="ui-home-quick-card" href="${routes.dialogue301}"><span>301</span><strong>301</strong><small>Đàm thoại và câu mẫu</small></a>
      </div></section>
      ${(ratings.review||ratings.hard)?`<section class="ui-home-section"><div class="ui-home-section__head"><h2>Cần ôn</h2></div><div class="ui-home-stats">${ratings.review?`<a class="ui-home-stat" href="${routes.cards}"><strong>${ratings.review}</strong><small>Thẻ Ôn</small></a>`:''}${ratings.hard?`<a class="ui-home-stat" href="${routes.cards}"><strong>${ratings.hard}</strong><small>Thẻ Khó</small></a>`:''}</div></section>`:''}`;
    main.prepend(section);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();

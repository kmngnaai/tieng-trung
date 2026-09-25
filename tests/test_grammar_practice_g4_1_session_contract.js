const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repo = path.resolve(process.argv[2] || process.cwd());
const uiPath = path.join(repo, 'modules/shared/grammar-practice-ui.js');
const viewPath = path.join(repo, 'modules/shared/grammar-practice-view.js');
const appPath = path.join(repo, 'modules/hanzi-stroke/app.js');
const cssPath = path.join(repo, 'modules/shared/grammar-practice-ui.css');
const fontPath = path.join(repo, 'modules/shared/font-han-serif.css');
const Ui = require(uiPath);
const uiSource = fs.readFileSync(uiPath, 'utf8');
const viewSource = fs.readFileSync(viewPath, 'utf8');
const appSource = fs.readFileSync(appPath, 'utf8');
const cssSource = fs.readFileSync(cssPath, 'utf8');
const fontSource = fs.readFileSync(fontPath, 'utf8');

function clean(value){ return String(value == null ? '' : value).trim(); }
function seedToUint32(seed){
  const text = String(seed == null ? 'g41-test' : seed);
  let hash = 2166136261;
  for(let i=0;i<text.length;i+=1){ hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
function seededRandom(seed){
  let state = seedToUint32(seed);
  return function(){
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(rows, seed){
  const out = rows.slice();
  const random = seededRandom(seed);
  for(let i=out.length-1;i>0;i-=1){
    const j = Math.floor(random() * (i + 1));
    const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}
function cloneExercise(row){
  return { ...row, options: Array.isArray(row.options) ? row.options.map(option => ({...option})) : undefined };
}
function makeGrammar(count=10){
  return {
    grammarId:`g4_1_contract_${count}`,
    exercises:Array.from({length:count}, (_,i) => ({
      questionId:`q${i+1}`,
      grammarId:`g4_1_contract_${count}`,
      type:'mcq',
      seq:i+1,
      prompt:`Question ${i+1}`,
      options:[
        {id:'A',text:`A${i+1}`},
        {id:'B',text:`B${i+1}`},
        {id:'C',text:`C${i+1}`},
        {id:'D',text:`D${i+1}`},
      ],
      answer:'B',
      explanation:`Explanation ${i+1}`,
    }))
  };
}

function makeMixedGrammar(){
  const grammar=makeGrammar(10);
  grammar.grammarId='g4_1_contract_mixed';
  grammar.exercises=grammar.exercises.map(row=>({...row,grammarId:grammar.grammarId}));
  for(let i=0;i<5;i+=1){
    grammar.exercises.push({
      questionId:`zhvi${i+1}`, grammarId:grammar.grammarId, type:'translate_zh_vi', seq:11+i,
      prompt:`中文 ${i+1}`, pinyin:`pin yin ${i+1}`, referenceAnswer:`Tiếng Việt ${i+1}`
    });
  }
  for(let i=0;i<5;i+=1){
    grammar.exercises.push({
      questionId:`vizh${i+1}`, grammarId:grammar.grammarId, type:'translate_vi_zh', seq:16+i,
      prompt:`Tiếng Việt ${i+1}`, pinyin:`pin yin ${i+1}`, referenceAnswer:`中文 ${i+1}`
    });
  }
  return grammar;
}

const orderCalls=[];
const adapter={
  getExercises(grammar, options={}){
    orderCalls.push({order:options.order || '', seed:options.seed || ''});
    let rows=grammar.exercises.filter(row => !options.skill || row.type === options.skill).slice().sort((a,b)=>a.seq-b.seq);
    if(options.order === 'random') rows=shuffled(rows, options.seed);
    else if(options.order !== 'ordered') throw new Error(`unexpected order ${options.order}`);
    return rows.map(cloneExercise);
  },
  evaluateExercise(exercise, response){
    if(exercise.type === 'translate_zh_vi' || exercise.type === 'translate_vi_zh'){
      return {
        mode:'self-review', questionId:exercise.questionId, grammarId:exercise.grammarId,
        type:exercise.type, response:clean(response), expected:null, correct:null,
        pinyin:exercise.pinyin, referenceAnswer:exercise.referenceAnswer,
      };
    }
    const normalized=clean(response).toUpperCase();
    return {
      mode:'auto', questionId:exercise.questionId, grammarId:exercise.grammarId,
      type:exercise.type, response:normalized, expected:exercise.answer,
      correct:normalized === exercise.answer, explanation:exercise.explanation,
    };
  }
};

const results=[];
function record(id, ok, evidence){ results.push({id,status:ok?'PASS':'FAIL',evidence}); }
function assert(cond, message){ if(!cond) throw new Error(message); }

// S01 — explicit manual shuffle works for all three skills before submit/reveal, preserves uniqueness, and disables after result.
{
  const session=Ui.createSession(adapter, makeMixedGrammar(), {skill:'mcq', seed:'s01'});
  const evidence={};
  let ok=true;
  for(const skill of ['mcq','translate_zh_vi','translate_vi_zh']){
    Ui.selectSkill(session,skill);
    const beforeView=Ui.getView(session);
    const before=beforeView.exercise.questionId;
    const after=Ui.shuffleCurrent(session).exercise.questionId;
    const order=session.orderBySkill[skill].slice();
    const unique=new Set(order).size===order.length;
    const moved=before!==after && order.includes(before) && order.indexOf(before)>0;
    const result=skill==='mcq'
      ? Ui.submit(session,Ui.getView(session).exercise.answer)
      : Ui.submit(session,'manual response');
    const afterSubmitBefore=Ui.getView(session).exercise.questionId;
    const afterSubmit=Ui.shuffleCurrent(session).exercise.questionId;
    const blockedAfterResult=afterSubmit===afterSubmitBefore && Ui.getView(session).canShuffle===false;
    evidence[skill]={before,after,order,unique,moved,blockedAfterResult,resultMode:result.mode};
    ok = ok && unique && moved && blockedAfterResult;
    Ui.resetAnswer(session);
  }
  const appAllowsAllSkills = !uiSource.includes("session.skill !== 'mcq'") &&
    viewSource.includes("${view.canShuffle ? '' : 'disabled'}");
  record('S01',ok && appAllowsAllSkills,{...evidence,appAllowsAllSkills});
}

// S02 — one 10-question round contains 10 unique questionIds.
{
  const session=Ui.createSession(adapter, makeGrammar(10), {skill:'mcq', seed:'s02'});
  const ids=[];
  for(let i=0;i<10;i+=1){
    ids.push(Ui.getView(session).exercise.questionId);
    if(i<9) Ui.next(session);
  }
  record('S02',new Set(ids).size===10 && ids.length===10,{ids});
}

// S03 — presentation option order is permuted while canonical exercise.options remains ABCD.
let mappedDisplayCount=0;
const correctDisplayLabels=[];
{
  const session=Ui.createSession(adapter, makeGrammar(10), {skill:'mcq', seed:'s03'});
  const presentationSignatures=[];
  const canonicalSignatures=[];
  for(let i=0;i<10;i+=1){
    const view=Ui.getView(session);
    presentationSignatures.push(view.presentationOptions.map(option=>option.id).join(''));
    canonicalSignatures.push(view.exercise.options.map(option=>option.id).join(''));
    const correct=view.presentationOptions.find(option=>option.id===view.exercise.answer);
    correctDisplayLabels.push(correct && correct.displayId);
    if(correct && correct.displayId !== correct.id) mappedDisplayCount += 1;
    if(i<9) Ui.next(session);
  }
  const ok=canonicalSignatures.every(sig=>sig==='ABCD') &&
    presentationSignatures.every(sig=>sig!=='ABCD') &&
    new Set(correctDisplayLabels).size > 1;
  record('S03',ok,{presentationSignatures,canonicalSignatures,correctDisplayLabels});
}

// S04 — displayed labels map to canonical option IDs before grading; canonical submit remains authoritative.
{
  const session=Ui.createSession(adapter, makeGrammar(10), {skill:'mcq', seed:'s04'});
  let mappingExample=null;
  let allCorrect=true;
  for(let i=0;i<10;i+=1){
    const view=Ui.getView(session);
    const displayedCorrect=view.presentationOptions.find(option=>option.id===view.exercise.answer);
    if(displayedCorrect && displayedCorrect.displayId !== displayedCorrect.id && !mappingExample){
      mappingExample={displayId:displayedCorrect.displayId, canonicalId:displayedCorrect.id, questionId:view.exercise.questionId};
    }
    const graded=Ui.submit(session, displayedCorrect.id);
    if(!graded.correct || graded.response !== view.exercise.answer) allCorrect=false;
    if(i<9) Ui.next(session);
  }
  const appMapsDisplayToCanonical = viewSource.includes("const displayId = String(option?.displayId || optionId).trim();") &&
    viewSource.includes('data-grammar-practice-option="${escapeHtml(optionId)}"') &&
    viewSource.includes('${escapeHtml(displayId)}</span>');
  record('S04',allCorrect && Boolean(mappingExample) && appMapsDisplayToCanonical,{mappingExample,appMapsDisplayToCanonical,mappedDisplayCount});
}

// S05 — canonical GrammarV1 source files remain untouched.
{
  let changed=[];
  try{
    const out=execFileSync('git',['-C',repo,'diff','--name-only','HEAD','--','modules/GrammarV1/source/exercises'],{encoding:'utf8'});
    changed=out.split(/\r?\n/).filter(Boolean);
  }catch(_err){ changed=['<git-check-failed>']; }
  record('S05',changed.length===0,{changed});
}

// S06 — a wrong question is first in the next round.
{
  const session=Ui.createSession(adapter, makeGrammar(10), {skill:'mcq', seed:'s06'});
  for(let i=0;i<4;i+=1) Ui.next(session); // q5
  const wrongQuestion=Ui.getView(session).exercise.questionId;
  Ui.submit(session,'A');
  Ui.next(session); // q6
  for(let i=0;i<5;i+=1) Ui.next(session); // reach next-round first
  const nextRoundFirst=Ui.getView(session).exercise.questionId;
  const usedG2Random=orderCalls.some(call=>call.order==='random');
  record('S06',nextRoundFirst===wrongQuestion && usedG2Random,{wrongQuestion,nextRoundFirst,usedG2Random});
}

// S07 — with a >10 pool, questions never submitted in round 1 are prioritized before reviewed-correct questions.
{
  const session=Ui.createSession(adapter, makeGrammar(12), {skill:'mcq', seed:'s07'});
  for(let i=0;i<10;i+=1){
    const view=Ui.getView(session);
    Ui.submit(session,view.exercise.answer);
    Ui.next(session);
  }
  const first=Ui.getView(session).exercise.questionId;
  Ui.next(session);
  const second=Ui.getView(session).exercise.questionId;
  const pair=new Set([first,second]);
  const historyKeys=Object.keys(session.attemptedBySkill.mcq || {});
  record('S07',pair.has('q11') && pair.has('q12') && historyKeys.length===10,{first,second,historyKeys});
}

// S08 — avoid boundary repeat when possible, but preserve wrong priority if the only top-priority item is the previous last question.
{
  const session=Ui.createSession(adapter, makeGrammar(10), {skill:'mcq', seed:'s08-normal'});
  for(let i=0;i<9;i+=1) Ui.next(session);
  const last=Ui.getView(session).exercise.questionId;
  Ui.next(session);
  const firstNext=Ui.getView(session).exercise.questionId;

  const prioritySession=Ui.createSession(adapter, makeGrammar(10), {skill:'mcq', seed:'s08-priority'});
  for(let i=0;i<9;i+=1) Ui.next(prioritySession);
  const priorityLast=Ui.getView(prioritySession).exercise.questionId;
  Ui.submit(prioritySession,'A');
  Ui.next(prioritySession);
  const priorityFirst=Ui.getView(prioritySession).exercise.questionId;

  record('S08',last!==firstNext && priorityLast===priorityFirst,{last,firstNext,priorityLast,priorityFirst});
}

// S09 — all G4.1 history remains in-memory only; no persistence primitive is added.
{
  const forbidden=['localStorage','sessionStorage','indexedDB','LearningState'];
  const found=forbidden.filter(token=>uiSource.includes(token));
  const session=Ui.createSession(adapter, makeGrammar(10), {skill:'mcq', seed:'s09'});
  Ui.submit(session,Ui.getView(session).exercise.answer);
  const hasMemoryHistory=Boolean(session.attemptedBySkill && session.wrongBySkill && session.orderBySkill);
  record('S09',found.length===0 && hasMemoryHistory,{found,sessionKeys:Object.keys(session)});
}

// Manual mobile UX contract: after re-render, feedback/reference and next prompt are brought into view without changing grading semantics.
const scrollUxPass = appSource.includes("function scrollGrammarPracticeTarget(host, selector, block = 'nearest')") &&
  appSource.includes('scrollTarget: scrollGrammarPracticeTarget') &&
  viewSource.includes("scroll('.hsk-grammar-practice__feedback', 'center')") &&
  viewSource.includes("scroll('.hsk-grammar-practice__prompt', 'nearest')") &&
  appSource.includes("behavior: 'smooth'") &&
  appSource.includes("target.scrollIntoView({ behavior: 'smooth', block })");

// Locked visual-theme rule and G4.2 phase-aware boundaries.
// G4.2 is explicitly allowed to add the approved "Bài của bạn" presentation.
// G4.1 behavior/storage/G5+ boundaries remain enforced.
const themePass = cssSource.includes('--grammar-practice-accent:#9b86c8') &&
  cssSource.includes('--grammar-practice-accent-soft:#f4f0fb') &&
  !/font-family\s*:/i.test(cssSource) &&
  cssSource.includes('.hsk-grammar-practice__option.is-correct') &&
  cssSource.includes('.hsk-grammar-practice__option.is-wrong');

const boundaryPass =
  !uiSource.includes('buildExternalFlashcardPayload') &&
  !uiSource.includes('localStorage') &&
  !uiSource.includes('sessionStorage') &&
  !viewSource.includes('localStorage') &&
  !viewSource.includes('sessionStorage') &&
  !viewSource.includes('indexedDB');

// G4.1 R2B typography alignment: reuse the repository Han font contract only.
// Mixed Vietnamese/Chinese strings keep the UI font for Vietnamese and wrap only
// Han runs with lang=zh-Hans so font-han-serif.css applies the existing Han serif.
const fontAlignmentPass =
  appSource.includes('function formatGrammarPracticeText(value){') &&
  appSource.includes("'<span lang=\"zh-Hans\">$1</span>'") &&
  appSource.includes('formatText: formatGrammarPracticeText') &&
  viewSource.includes("${formatText(option?.text || '')}") &&
  viewSource.includes("${formatText(result.referenceAnswer || '')}") &&
  viewSource.includes("${formatText(exercise.prompt || '')}") &&
  fontSource.includes('--ui-font-han-serif') &&
  fontSource.includes('[lang="zh-Hans"]') &&
  !/font-family\s*:/i.test(cssSource);

const failures=results.filter(row=>row.status!=='PASS');
for(const row of results) console.log(`${row.id} ${row.status}`);
console.log(`THEME ${themePass?'PASS':'FAIL'}`);
console.log(`SCROLL_UX ${scrollUxPass?'PASS':'FAIL'}`);
console.log(`FONT_ALIGNMENT ${fontAlignmentPass?'PASS':'FAIL'}`);
console.log(`BOUNDARIES ${boundaryPass?'PASS':'FAIL'}`);

const report={
  schemaVersion:'grammarv1-g4.1-session-contract-v1',
  results,
  diagnostics:{
    uiVersion:Ui.VERSION,
    exportedApi:Object.keys(Ui),
    orderCalls,
    themePass,
    scrollUxPass,
    fontAlignmentPass,
    boundaryPass,
  },
  status:failures.length===0 && themePass && scrollUxPass && fontAlignmentPass && boundaryPass ? 'PASS' : 'FAIL'
};
console.log(JSON.stringify(report,null,2));
if(report.status!=='PASS') process.exit(2);

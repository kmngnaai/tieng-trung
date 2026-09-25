'use strict';

const fs = require('fs');
const path = require('path');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function read(file){
  return fs.readFileSync(file, 'utf8');
}

function sampleGrammar(){
  const grammarId = 'g42_contract';
  const make = (type, seq, prompt, pinyin, referenceAnswer) => ({
    questionId: `${grammarId}_${type}_${seq}`,
    grammarId,
    type,
    seq,
    prompt,
    pinyin,
    referenceAnswer,
  });
  return {
    grammarId,
    exercises: [
      make('translate_zh_vi', 11, '我学习汉语。', 'wǒ xuéxí hànyǔ', 'Tôi học tiếng Trung.'),
      make('translate_zh_vi', 12, '他是学生。', 'tā shì xuéshēng', 'Anh ấy là học sinh.'),
      make('translate_vi_zh', 16, 'Tôi là học sinh.', 'wǒ shì xuéshēng', '我是学生。'),
      make('translate_vi_zh', 17, 'Tôi học tiếng Trung.', 'wǒ xuéxí hànyǔ', '我学习汉语。'),
    ],
  };
}

function main(){
  const repo = path.resolve(process.argv[2] || '.');
  const adapter = require(path.join(repo, 'modules/shared/grammar-practice.js'));
  const ui = require(path.join(repo, 'modules/shared/grammar-practice-ui.js'));
  const app = read(path.join(repo, 'modules/hanzi-stroke/app.js'));
  const view = read(path.join(repo, 'modules/shared/grammar-practice-view.js'));
  const css = read(path.join(repo, 'modules/shared/grammar-practice-ui.css'));
  const uiSource = read(path.join(repo, 'modules/shared/grammar-practice-ui.js'));

  const marker = 'Tự đối chiếu — không chấm đúng/sai';
  const markerAt = view.indexOf(marker);
  assert(markerAt >= 0, 'translation self-review marker missing from shared presenter');
  const translationRender = view.slice(Math.max(0, markerAt - 1000), Math.min(view.length, markerAt + 3800));

  const grammar = sampleGrammar();
  const zhvi = ui.createSession(adapter, grammar, { skill: 'translate_zh_vi' });
  const zhviInput = 'Tôi đang học Hoa ngữ.';
  const zhviResult = ui.submit(zhvi, zhviInput);
  const vizh = ui.createSession(adapter, grammar, { skill: 'translate_vi_zh' });
  const vizhInput = '我是学生的。';
  const vizhResult = ui.submit(vizh, vizhInput);

  const checks = [];
  function check(id, name, condition, details = {}){
    const row = { id, name, pass: Boolean(condition), details };
    checks.push(row);
    console.log(`${id} ${row.pass ? 'PASS' : 'FAIL'}`);
  }

  check('T01', 'submitted response shown as Bài của bạn',
    view.includes('Bài của bạn')
      && view.includes('data-grammar-practice-user-answer')
      && /formatText\(result\.response\)/.test(translationRender),
    { adapterResponse: zhviResult.response });

  const userRegionAt = translationRender.indexOf('data-grammar-practice-user-answer');
  const referenceRegionAt = translationRender.indexOf('data-grammar-practice-reference-answer');
  check('T02', 'user answer and reference answer are separate ordered regions',
    userRegionAt >= 0
      && referenceRegionAt > userRegionAt
      && view.includes('Đáp án tham khảo')
      && /formatText\(result\.referenceAnswer/.test(translationRender),
    { userRegionAt, referenceRegionAt });

  check('T03', 'pinyin remains rendered',
    zhviResult.pinyin === 'wǒ xuéxí hànyǔ'
      && /result\.pinyin/.test(translationRender)
      && /formatPinyin\(result\.pinyin\)/.test(translationRender));

  check('T04', 'translation remains self-review with correct=null',
    zhviResult.mode === 'self-review'
      && zhviResult.correct === null
      && vizhResult.mode === 'self-review'
      && vizhResult.correct === null,
    { zhviMode: zhviResult.mode, zhviCorrect: zhviResult.correct, vizhMode: vizhResult.mode, vizhCorrect: vizhResult.correct });

  check('T05', 'no exact-string grading and no persistence added',
    zhviResult.response !== zhviResult.referenceAnswer
      && vizhResult.response !== vizhResult.referenceAnswer
      && zhviResult.correct === null
      && vizhResult.correct === null
      && !uiSource.includes('localStorage')
      && !uiSource.includes('sessionStorage')
      && !/indexedDB/i.test(uiSource)
      && !view.includes('localStorage')
      && !view.includes('sessionStorage')
      && !/indexedDB/i.test(view));

  check('T06', 'shared translation result presentation covers both directions',
    zhviResult.direction === 'zh-vi'
      && vizhResult.direction === 'vi-zh'
      && translationRender.includes('data-grammar-practice-user-answer')
      && translationRender.includes('data-grammar-practice-reference-answer'));

  check('T07', 'user/reference Chinese text keeps repository Han wrapper',
    /formatText\(result\.response\)/.test(translationRender)
      && /formatText\(result\.referenceAnswer/.test(translationRender)
      && app.includes('lang="zh-Hans"'));

  check('T08', 'G4.1 feedback/autoscroll contract remains intact',
    translationRender.includes('hsk-grammar-practice__feedback')
      && app.includes('scrollTarget: scrollGrammarPracticeTarget')
      && view.includes("scroll('.hsk-grammar-practice__feedback', 'center')"));

  const reviewCssAt = css.indexOf('.hsk-grammar-practice__review-block');
  const reviewCss = reviewCssAt >= 0 ? css.slice(reviewCssAt, reviewCssAt + 2200) : '';
  check('CSS01', 'self-review hierarchy classes are scoped and present',
    css.includes('.hsk-grammar-practice__review-block')
      && css.includes('.hsk-grammar-practice__review-label')
      && css.includes('.hsk-grammar-practice__review-answer')
      && css.includes('.hsk-grammar-practice__review-pinyin'));
  check('CSS02', 'G4.2 adds no new font-family override',
    reviewCssAt >= 0 && !/font-family\s*:/.test(reviewCss));

  const failed = checks.filter(row => !row.pass);
  const report = {
    schemaVersion: 'grammarv1-g4.2-self-review-contract-v1',
    status: failed.length ? 'FAIL' : 'PASS',
    checks,
  };
  if(failed.length){
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 2;
  }else{
    console.log('PASS_G4_2_SELF_REVIEW_CONTRACT');
  }
}

main();

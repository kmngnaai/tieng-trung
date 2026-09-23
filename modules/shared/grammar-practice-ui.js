(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports){
    module.exports = api;
  }
  if(root){
    root.TiengTrungGrammarPracticeUi = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const VERSION = 'grammar-practice-ui-v1';
  const SKILLS = Object.freeze(['mcq', 'translate_zh_vi', 'translate_vi_zh']);
  const MCQ_ROUND_SIZE = 10;
  const DISPLAY_LABELS = Object.freeze(['A', 'B', 'C', 'D']);

  function clean(value){
    return String(value == null ? '' : value).trim();
  }

  function assertAdapter(adapter){
    if(!adapter || typeof adapter.getExercises !== 'function' || typeof adapter.evaluateExercise !== 'function'){
      throw new TypeError('GrammarPractice UI requires adapter getExercises/evaluateExercise');
    }
    return adapter;
  }

  function assertGrammar(grammar){
    const grammarId = clean(grammar && grammar.grammarId);
    if(!grammarId){
      throw new TypeError('GrammarPractice UI requires grammar.grammarId');
    }
    return grammarId;
  }

  function assertSkill(skill){
    const value = clean(skill || 'mcq');
    if(!SKILLS.includes(value)){
      throw new TypeError(`unsupported GrammarPractice UI skill: ${value || 'empty'}`);
    }
    return value;
  }

  function seedToUint32(seed){
    const text = String(seed == null ? 'grammar-practice-ui' : seed);
    let hash = 2166136261;
    for(let index = 0; index < text.length; index += 1){
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
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

  function shuffled(values, seed){
    const out = values.slice();
    const random = seededRandom(seed);
    for(let index = out.length - 1; index > 0; index -= 1){
      const swapIndex = Math.floor(random() * (index + 1));
      const current = out[index];
      out[index] = out[swapIndex];
      out[swapIndex] = current;
    }
    if(out.length > 1 && out.every((value, index) => value === values[index])){
      const current = out[0];
      out[0] = out[1];
      out[1] = current;
    }
    return out;
  }

  function getOrderedList(session, skill){
    const selected = assertSkill(skill || session.skill);
    return session.adapter.getExercises(session.grammar, {
      skill: selected,
      order: 'ordered'
    });
  }

  function getRandomList(session, skill, seed){
    const selected = assertSkill(skill || session.skill);
    return session.adapter.getExercises(session.grammar, {
      skill: selected,
      order: 'random',
      seed
    });
  }

  function getRoundLimit(skill, available){
    return skill === 'mcq' ? Math.min(MCQ_ROUND_SIZE, available) : available;
  }

  function getAttemptMap(session, skill){
    if(!session.attemptedBySkill[skill]) session.attemptedBySkill[skill] = {};
    return session.attemptedBySkill[skill];
  }

  function getWrongMap(session, skill){
    if(!session.wrongBySkill[skill]) session.wrongBySkill[skill] = {};
    return session.wrongBySkill[skill];
  }

  function priorityForQuestion(session, skill, questionId){
    const wrong = getWrongMap(session, skill);
    if(wrong[questionId]) return 0;
    const attempted = getAttemptMap(session, skill);
    if(!attempted[questionId]) return 1;
    return 2;
  }

  function avoidBoundaryRepeat(session, skill, rows){
    if(rows.length < 2) return rows;
    const previousLast = clean(session.lastQuestionBySkill[skill]);
    if(!previousLast || clean(rows[0] && rows[0].questionId) !== previousLast) return rows;
    const firstPriority = priorityForQuestion(session, skill, previousLast);
    const replacementIndex = rows.findIndex((row, index) => {
      if(index === 0) return false;
      return clean(row && row.questionId) !== previousLast &&
        priorityForQuestion(session, skill, clean(row && row.questionId)) === firstPriority;
    });
    if(replacementIndex < 0) return rows;
    const out = rows.slice();
    const first = out[0];
    out[0] = out[replacementIndex];
    out[replacementIndex] = first;
    return out;
  }

  function buildMcqRound(session, initial){
    const skill = 'mcq';
    const round = Number(session.roundBySkill[skill] || 1);
    let rows;
    if(initial){
      rows = getOrderedList(session, skill);
    }else{
      rows = getRandomList(session, skill, `${session.sessionSeed}:${skill}:round:${round}`);
      rows = rows
        .map((row, index) => ({ row, index, priority: priorityForQuestion(session, skill, clean(row && row.questionId)) }))
        .sort((left, right) => left.priority - right.priority || left.index - right.index)
        .map(item => item.row);
      rows = avoidBoundaryRepeat(session, skill, rows);
    }
    return rows
      .slice(0, getRoundLimit(skill, rows.length))
      .map(row => clean(row && row.questionId))
      .filter(Boolean);
  }

  function findExerciseById(session, skill, questionId){
    const target = clean(questionId);
    if(!target) return null;
    return getOrderedList(session, skill).find(row => clean(row && row.questionId) === target) || null;
  }

  function getPresentationOptions(session, exercise){
    if(!exercise || exercise.type !== 'mcq' || !Array.isArray(exercise.options)) return [];
    const questionId = clean(exercise.questionId);
    const round = Number(session.roundBySkill.mcq || 1);
    const key = `${round}:${questionId}`;
    let canonicalOrder = session.optionOrderByQuestionId[key];
    const canonicalIds = exercise.options.map(option => clean(option && option.id)).filter(Boolean);
    if(!Array.isArray(canonicalOrder) || canonicalOrder.length !== canonicalIds.length){
      canonicalOrder = shuffled(canonicalIds, `${session.sessionSeed}:options:${key}`);
      session.optionOrderByQuestionId[key] = canonicalOrder.slice();
    }
    const byId = new Map(exercise.options.map(option => [clean(option && option.id), option]));
    return canonicalOrder.map((canonicalId, index) => {
      const option = byId.get(canonicalId) || {};
      return {
        id: canonicalId,
        displayId: DISPLAY_LABELS[index] || canonicalId,
        text: clean(option.text)
      };
    });
  }

  function createSession(adapter, grammar, options){
    const configured = options || {};
    const selected = assertSkill(configured.skill || 'mcq');
    assertAdapter(adapter);
    const grammarId = assertGrammar(grammar);
    const session = {
      version: 1,
      adapter,
      grammar,
      grammarId,
      skill: selected,
      indexBySkill: {
        mcq: 0,
        translate_zh_vi: 0,
        translate_vi_zh: 0
      },
      result: null,
      sessionSeed: clean(configured.seed) || `${grammarId}:${Date.now()}:${Math.random()}`,
      roundBySkill: {
        mcq: 1,
        translate_zh_vi: 1,
        translate_vi_zh: 1
      },
      orderBySkill: {
        mcq: [],
        translate_zh_vi: [],
        translate_vi_zh: []
      },
      attemptedBySkill: { mcq: {} },
      wrongBySkill: { mcq: {} },
      lastQuestionBySkill: { mcq: '' },
      optionOrderByQuestionId: {},
      shuffleCounter: 0
    };
    session.orderBySkill.mcq = buildMcqRound(session, true);
    ['translate_zh_vi', 'translate_vi_zh'].forEach(skill => {
      session.orderBySkill[skill] = getOrderedList(session, skill)
        .map(row => clean(row && row.questionId))
        .filter(Boolean);
    });
    const selectedAvailable = (session.orderBySkill[selected] || []).length;
    if(!selectedAvailable){
      throw new TypeError(`GrammarPractice UI has no exercises for ${grammarId}:${selected}`);
    }
    return session;
  }

  function getView(session){
    if(session.skill === 'mcq'){
      const order = session.orderBySkill.mcq || [];
      const rawIndex = Number(session.indexBySkill.mcq || 0);
      const index = order.length ? ((rawIndex % order.length) + order.length) % order.length : 0;
      session.indexBySkill.mcq = index;
      const exercise = findExerciseById(session, 'mcq', order[index]) || null;
      return {
        grammarId: session.grammarId,
        skill: session.skill,
        index,
        total: order.length,
        exercise,
        presentationOptions: getPresentationOptions(session, exercise),
        result: session.result,
        round: Number(session.roundBySkill.mcq || 1),
        canShuffle: !session.result && Boolean(exercise) && index + 1 < order.length
      };
    }

    const order = session.orderBySkill[session.skill] || [];
    const rawIndex = Number(session.indexBySkill[session.skill] || 0);
    const index = order.length ? ((rawIndex % order.length) + order.length) % order.length : 0;
    session.indexBySkill[session.skill] = index;
    const exercise = findExerciseById(session, session.skill, order[index]) || null;
    return {
      grammarId: session.grammarId,
      skill: session.skill,
      index,
      total: order.length,
      exercise,
      presentationOptions: [],
      result: session.result,
      round: Number(session.roundBySkill[session.skill] || 1),
      canShuffle: !session.result && Boolean(exercise) && index + 1 < order.length
    };
  }

  function selectSkill(session, skill){
    session.skill = assertSkill(skill);
    session.result = null;
    return getView(session);
  }

  function submit(session, response){
    const view = getView(session);
    const exercise = view.exercise;
    if(!exercise){
      throw new TypeError('GrammarPractice UI cannot submit without exercise');
    }
    const result = session.adapter.evaluateExercise(exercise, response);
    if(exercise.type === 'mcq'){
      if(result.mode !== 'auto' || typeof result.correct !== 'boolean'){
        throw new TypeError('MCQ must be auto-graded by GrammarPractice adapter');
      }
      const questionId = clean(exercise.questionId);
      const attempted = getAttemptMap(session, 'mcq');
      const previous = attempted[questionId] || { attempts: 0, lastCorrect: null };
      attempted[questionId] = {
        attempts: Number(previous.attempts || 0) + 1,
        lastCorrect: result.correct
      };
      const wrong = getWrongMap(session, 'mcq');
      if(result.correct) delete wrong[questionId];
      else wrong[questionId] = true;
    }else if(exercise.type === 'translate_zh_vi' || exercise.type === 'translate_vi_zh'){
      if(result.mode !== 'self-review' || result.correct !== null){
        throw new TypeError('Translation must remain self-review with correct=null');
      }
    }else{
      throw new TypeError(`unsupported GrammarPractice UI exercise type: ${exercise.type}`);
    }
    session.result = result;
    return result;
  }

  function next(session){
    if(session.skill === 'mcq'){
      const order = session.orderBySkill.mcq || [];
      if(!order.length){
        throw new TypeError('GrammarPractice UI cannot advance empty exercise list');
      }
      const currentIndex = Number(session.indexBySkill.mcq || 0);
      if(currentIndex + 1 < order.length){
        session.indexBySkill.mcq = currentIndex + 1;
      }else{
        session.lastQuestionBySkill.mcq = order[currentIndex] || '';
        session.roundBySkill.mcq = Number(session.roundBySkill.mcq || 1) + 1;
        session.indexBySkill.mcq = 0;
        session.orderBySkill.mcq = buildMcqRound(session, false);
      }
      session.result = null;
      return getView(session);
    }

    const skill = session.skill;
    const order = session.orderBySkill[skill] || [];
    if(!order.length){
      throw new TypeError('GrammarPractice UI cannot advance empty exercise list');
    }
    const current = Number(session.indexBySkill[skill] || 0);
    if(current + 1 < order.length){
      session.indexBySkill[skill] = current + 1;
    }else{
      session.roundBySkill[skill] = Number(session.roundBySkill[skill] || 1) + 1;
      session.indexBySkill[skill] = 0;
      session.orderBySkill[skill] = getOrderedList(session, skill)
        .map(row => clean(row && row.questionId))
        .filter(Boolean);
    }
    session.result = null;
    return getView(session);
  }

  function shuffleCurrent(session){
    const view = getView(session);
    if(session.result || !view.exercise || !view.canShuffle) return view;
    const skill = session.skill;
    const order = session.orderBySkill[skill] || [];
    const currentIndex = Number(session.indexBySkill[skill] || 0);
    const remaining = order.length - currentIndex - 1;
    if(remaining <= 0) return view;
    session.shuffleCounter = Number(session.shuffleCounter || 0) + 1;
    const random = seededRandom(
      `${session.sessionSeed}:manual:${skill}:${session.roundBySkill[skill] || 1}:${session.shuffleCounter}:${view.exercise.questionId}`
    );
    const swapIndex = currentIndex + 1 + Math.floor(random() * remaining);
    const currentId = order[currentIndex];
    order[currentIndex] = order[swapIndex];
    order[swapIndex] = currentId;
    session.result = null;
    return getView(session);
  }

  function resetAnswer(session){
    session.result = null;
    return getView(session);
  }

  return Object.freeze({
    VERSION,
    SKILLS,
    MCQ_ROUND_SIZE,
    createSession,
    getView,
    selectSkill,
    submit,
    next,
    shuffleCurrent,
    resetAnswer
  });
});

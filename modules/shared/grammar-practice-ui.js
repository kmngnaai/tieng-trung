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

  function getList(session, skill){
    const selected = assertSkill(skill || session.skill);
    return session.adapter.getExercises(session.grammar, {
      skill: selected,
      order: 'ordered'
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
      result: null
    };
    if(!getList(session, selected).length){
      throw new TypeError(`GrammarPractice UI has no exercises for ${grammarId}:${selected}`);
    }
    return session;
  }

  function getView(session){
    const list = getList(session, session.skill);
    const rawIndex = Number(session.indexBySkill[session.skill] || 0);
    const index = list.length ? ((rawIndex % list.length) + list.length) % list.length : 0;
    session.indexBySkill[session.skill] = index;
    return {
      grammarId: session.grammarId,
      skill: session.skill,
      index,
      total: list.length,
      exercise: list[index] || null,
      result: session.result
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
    const list = getList(session, session.skill);
    if(!list.length){
      throw new TypeError('GrammarPractice UI cannot advance empty exercise list');
    }
    const current = Number(session.indexBySkill[session.skill] || 0);
    session.indexBySkill[session.skill] = (current + 1) % list.length;
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
    createSession,
    getView,
    selectSkill,
    submit,
    next,
    resetAnswer
  });
});

(function(root, factory){
  if(typeof module === 'object' && module.exports) module.exports = factory();
  else root.TiengTrungGrammarPractice = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const VERSION = 'grammar-practice-adapter-v1';
  const EXERCISE_TYPES = Object.freeze(['mcq', 'translate_zh_vi', 'translate_vi_zh']);
  const FLASHCARD_PAYLOAD_VERSION = 1;

  function clean(value){
    return String(value == null ? '' : value).trim();
  }

  function cloneExample(row){
    return {
      chinese: clean(row && row.chinese),
      pinyin: clean(row && row.pinyin),
      vietnamese: clean(row && row.vietnamese)
    };
  }

  function cloneExercise(exercise){
    const out = {
      questionId: clean(exercise && exercise.questionId),
      grammarId: clean(exercise && exercise.grammarId),
      type: clean(exercise && exercise.type),
      seq: Number(exercise && exercise.seq),
      prompt: clean(exercise && exercise.prompt)
    };
    if(out.type === 'mcq'){
      out.options = Array.isArray(exercise.options)
        ? exercise.options.map(option => ({ id: clean(option && option.id), text: clean(option && option.text) }))
        : [];
      out.answer = clean(exercise && exercise.answer);
      out.explanation = clean(exercise && exercise.explanation);
    }else{
      out.pinyin = clean(exercise && exercise.pinyin);
      out.referenceAnswer = clean(exercise && exercise.referenceAnswer);
    }
    return out;
  }

  function cloneGrammar(grammar){
    return {
      grammarId: clean(grammar && grammar.grammarId),
      curriculum: clean(grammar && grammar.curriculum),
      sourceKey: clean(grammar && grammar.sourceKey),
      level: grammar && grammar.level,
      levelId: clean(grammar && grammar.levelId),
      order: grammar && grammar.order,
      chapter: grammar && grammar.chapter,
      topic: clean(grammar && grammar.topic),
      syntax: clean(grammar && grammar.syntax),
      explanation: clean(grammar && grammar.explanation),
      tips: clean(grammar && grammar.tips),
      attentions: clean(grammar && grammar.attentions),
      examples: Array.isArray(grammar && grammar.examples) ? grammar.examples.map(cloneExample) : [],
      source: grammar && grammar.source && typeof grammar.source === 'object' ? { ...grammar.source } : {},
      exerciseCount: Number(grammar && grammar.exerciseCount) || 0,
      exerciseTypeCounts: grammar && grammar.exerciseTypeCounts && typeof grammar.exerciseTypeCounts === 'object'
        ? { ...grammar.exerciseTypeCounts }
        : {},
      exercises: Array.isArray(grammar && grammar.exercises) ? grammar.exercises.map(cloneExercise) : []
    };
  }

  function assertGrammar(grammar){
    if(!grammar || typeof grammar !== 'object') throw new TypeError('grammar must be an object');
    const grammarId = clean(grammar.grammarId);
    if(!grammarId) throw new TypeError('grammar.grammarId is required');
    if(!Array.isArray(grammar.exercises)) throw new TypeError(`grammar ${grammarId} exercises must be an array`);

    const ids = new Set();
    grammar.exercises.forEach((exercise, index) => {
      if(!exercise || typeof exercise !== 'object') throw new TypeError(`grammar ${grammarId} exercise[${index}] must be an object`);
      const questionId = clean(exercise.questionId);
      const type = clean(exercise.type);
      const seq = Number(exercise.seq);
      if(!questionId) throw new TypeError(`grammar ${grammarId} exercise[${index}] questionId is required`);
      if(ids.has(questionId)) throw new TypeError(`grammar ${grammarId} duplicate questionId ${questionId}`);
      ids.add(questionId);
      if(clean(exercise.grammarId) !== grammarId) throw new TypeError(`exercise ${questionId} grammarId mismatch`);
      if(!EXERCISE_TYPES.includes(type)) throw new TypeError(`exercise ${questionId} unsupported type ${type}`);
      if(!Number.isInteger(seq) || seq <= 0) throw new TypeError(`exercise ${questionId} invalid seq`);
    });
    if(Number(grammar.exerciseCount || grammar.exercises.length) !== grammar.exercises.length){
      throw new TypeError(`grammar ${grammarId} exerciseCount mismatch`);
    }
    return grammarId;
  }

  function findGrammar(track, grammarId){
    const target = clean(grammarId);
    if(!target || !track || !Array.isArray(track.grammars)) return null;
    const found = track.grammars.find(grammar => clean(grammar && grammar.grammarId) === target);
    if(!found) return null;
    assertGrammar(found);
    return cloneGrammar(found);
  }

  function normalizeSkills(input){
    const raw = input == null ? ['all'] : (Array.isArray(input) ? input : [input]);
    const expanded = [];
    raw.forEach(value => {
      const skill = clean(value).toLowerCase();
      if(!skill || skill === 'all' || skill === 'mixed'){
        expanded.push(...EXERCISE_TYPES);
      }else if(skill === 'translation' || skill === 'translate'){
        expanded.push('translate_zh_vi', 'translate_vi_zh');
      }else if(EXERCISE_TYPES.includes(skill)){
        expanded.push(skill);
      }else{
        throw new TypeError(`unsupported grammar practice skill: ${value}`);
      }
    });
    return Array.from(new Set(expanded));
  }

  function normalizeCount(value, available){
    if(value == null || value === '' || String(value).toLowerCase() === 'all') return available;
    const number = Number(value);
    if(!Number.isInteger(number) || number <= 0) throw new TypeError(`count must be a positive integer or 'all': ${value}`);
    return Math.min(number, available);
  }

  function seedToUint32(seed){
    const text = String(seed == null ? 'grammar-practice' : seed);
    let hash = 2166136261;
    for(let i = 0; i < text.length; i += 1){
      hash ^= text.charCodeAt(i);
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

  function shuffled(rows, seed){
    const out = rows.slice();
    const random = seededRandom(seed);
    for(let index = out.length - 1; index > 0; index -= 1){
      const swapIndex = Math.floor(random() * (index + 1));
      const tmp = out[index];
      out[index] = out[swapIndex];
      out[swapIndex] = tmp;
    }
    return out;
  }

  function getExercises(grammar, options){
    const grammarId = assertGrammar(grammar);
    const configured = options || {};
    const skills = normalizeSkills(configured.skill == null ? configured.skills : configured.skill);
    const allowed = new Set(skills);
    let rows = grammar.exercises
      .filter(exercise => allowed.has(clean(exercise.type)))
      .slice()
      .sort((a, b) => Number(a.seq) - Number(b.seq));

    const order = clean(configured.order || 'ordered').toLowerCase();
    if(order === 'random'){
      rows = shuffled(rows, configured.seed == null ? `${grammarId}:${skills.join(',')}` : configured.seed);
    }else if(order !== 'ordered'){
      throw new TypeError(`unsupported exercise order: ${configured.order}`);
    }

    const count = normalizeCount(configured.count, rows.length);
    return rows.slice(0, count).map(cloneExercise);
  }

  function evaluateExercise(exercise, response){
    const row = cloneExercise(exercise || {});
    const answer = clean(response);
    if(row.type === 'mcq'){
      const normalized = answer.toUpperCase();
      return {
        mode: 'auto',
        questionId: row.questionId,
        grammarId: row.grammarId,
        type: row.type,
        response: normalized,
        expected: row.answer,
        correct: normalized === row.answer,
        explanation: row.explanation
      };
    }
    if(row.type === 'translate_zh_vi' || row.type === 'translate_vi_zh'){
      return {
        mode: 'self-review',
        questionId: row.questionId,
        grammarId: row.grammarId,
        type: row.type,
        direction: row.type === 'translate_zh_vi' ? 'zh-vi' : 'vi-zh',
        response: answer,
        referenceAnswer: row.referenceAnswer,
        pinyin: row.pinyin,
        correct: null
      };
    }
    throw new TypeError(`unsupported exercise type: ${row.type}`);
  }

  function translationExerciseToFlashcard(exercise){
    const row = cloneExercise(exercise || {});
    if(row.type !== 'translate_zh_vi' && row.type !== 'translate_vi_zh'){
      throw new TypeError(`translation flashcard requires translation exercise: ${row.questionId || 'unknown'}`);
    }
    const zhToVi = row.type === 'translate_zh_vi';
    return {
      id: row.questionId,
      cardType: 'sentence',
      word: zhToVi ? row.prompt : row.referenceAnswer,
      pinyin: row.pinyin,
      meaningVi: zhToVi ? row.referenceAnswer : row.prompt,
      title: zhToVi ? 'Dịch Trung → Việt' : 'Dịch Việt → Trung',
      grammar: {
        grammarId: row.grammarId,
        questionId: row.questionId,
        exerciseType: row.type
      }
    };
  }

  function toTranslationFlashcards(grammar, options){
    const configured = { ...(options || {}), skill: 'translation' };
    return getExercises(grammar, configured).map(translationExerciseToFlashcard);
  }

  function toGrammarFlashcard(grammar){
    const grammarId = assertGrammar(grammar);
    const examples = Array.isArray(grammar.examples) ? grammar.examples.map(cloneExample) : [];
    const topic = clean(grammar.topic) || 'Ngữ pháp';
    const syntax = clean(grammar.syntax);
    const explanation = clean(grammar.explanation);
    return {
      id: `grammarv1:${grammarId}`,
      cardType: 'grammar',
      word: syntax || topic || grammarId,
      pinyin: '',
      meaningVi: explanation,
      title: topic,
      grammar: {
        topic,
        pattern: syntax,
        explanation,
        tips: clean(grammar.tips),
        attentions: clean(grammar.attentions),
        examples
      }
    };
  }

  function buildExternalFlashcardPayload(grammar, options){
    const grammarId = assertGrammar(grammar);
    const configured = options || {};
    const mode = clean(configured.mode || 'translations').toLowerCase();
    let cards;
    if(mode === 'grammar'){
      cards = [toGrammarFlashcard(grammar)];
    }else if(mode === 'translations'){
      cards = toTranslationFlashcards(grammar, configured);
    }else if(mode === 'mixed'){
      cards = [toGrammarFlashcard(grammar), ...toTranslationFlashcards(grammar, configured)];
    }else{
      throw new TypeError(`unsupported flashcard payload mode: ${configured.mode}`);
    }
    const topic = clean(grammar.topic) || grammarId;
    return {
      version: FLASHCARD_PAYLOAD_VERSION,
      title: clean(configured.title) || `${topic} · Luyện ngữ pháp`,
      cards,
      origin: 'external',
      contextKey: clean(configured.contextKey) || `grammarv1:${grammarId}`,
      contextLabel: clean(configured.contextLabel) || topic,
      returnUrl: clean(configured.returnUrl)
    };
  }

  return Object.freeze({
    VERSION,
    EXERCISE_TYPES,
    FLASHCARD_PAYLOAD_VERSION,
    findGrammar,
    getExercises,
    evaluateExercise,
    translationExerciseToFlashcard,
    toTranslationFlashcards,
    toGrammarFlashcard,
    buildExternalFlashcardPayload
  });
});

(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports){
    module.exports = api;
  }
  if(root){
    root.TiengTrungGrammarPracticeFlashcard = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const VERSION = 'grammar-practice-flashcard-bridge-v1';
  const DEFAULT_TRANSLATION_CARD_COUNT = 5;

  function assertAdapter(adapter){
    if(!adapter || typeof adapter.buildExternalFlashcardPayload !== 'function'){
      throw new TypeError('GrammarPractice Flashcard bridge requires adapter.buildExternalFlashcardPayload');
    }
    return adapter;
  }

  function assertGrammar(grammar){
    const grammarId = String(grammar && grammar.grammarId || '').trim();
    if(!grammarId){
      throw new TypeError('GrammarPractice Flashcard bridge requires grammar.grammarId');
    }
    return grammarId;
  }

  function buildPayload(adapter, grammar){
    assertAdapter(adapter);
    assertGrammar(grammar);
    const payload = adapter.buildExternalFlashcardPayload(grammar, {
      mode: 'mixed',
      count: DEFAULT_TRANSLATION_CARD_COUNT,
      returnUrl: ''
    });
    if(
      !payload ||
      payload.origin !== 'external' ||
      !Array.isArray(payload.cards) ||
      payload.cards.length !== DEFAULT_TRANSLATION_CARD_COUNT + 1
    ){
      throw new TypeError('GrammarPractice Flashcard payload contract mismatch');
    }
    return payload;
  }

  function launch(adapter, grammar, launchSession){
    if(typeof launchSession !== 'function'){
      throw new TypeError('GrammarPractice Flashcard bridge requires existing Flashcard session launcher');
    }
    const payload = buildPayload(adapter, grammar);
    const launched = launchSession(payload.cards, payload.title, {
      origin: payload.origin,
      contextKey: payload.contextKey,
      contextLabel: payload.contextLabel,
      returnUrl: payload.returnUrl
    });
    return {
      launched: Boolean(launched),
      payload
    };
  }

  return Object.freeze({
    VERSION,
    DEFAULT_TRANSLATION_CARD_COUNT,
    buildPayload,
    launch
  });
});

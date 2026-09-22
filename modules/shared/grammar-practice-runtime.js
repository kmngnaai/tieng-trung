(function(root, factory){
  if(typeof module === 'object' && module.exports) module.exports = factory();
  else root.TiengTrungGrammarPracticeRuntime = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const VERSION = 'grammar-practice-runtime-v1';
  const INDEX_SCHEMA_VERSION = 'grammarv1-runtime-index-v1';
  const TRACK_SCHEMA_VERSION = 'grammarv1-runtime-track-v1';
  const INDEX_FILE = 'index.json';

  function clean(value){
    return String(value == null ? '' : value).trim();
  }

  function normalizeBaseUrl(value){
    const base = clean(value);
    if(!base) return '';
    return base.endsWith('/') ? base : `${base}/`;
  }

  function safeRuntimeFile(value){
    const file = clean(value);
    if(!file || !file.endsWith('.json')) return '';
    if(file.includes('/') || file.includes('\\\\') || file === INDEX_FILE) return '';
    return file;
  }

  function validateAdapter(adapter){
    if(!adapter || typeof adapter.findGrammar !== 'function'){
      throw new TypeError('GrammarPractice adapter with findGrammar() is required');
    }
    return adapter;
  }

  function validateIndex(index){
    if(!index || typeof index !== 'object') throw new TypeError('GrammarV1 runtime index must be an object');
    if(clean(index.schemaVersion) !== INDEX_SCHEMA_VERSION){
      throw new TypeError(`unsupported GrammarV1 runtime index schema: ${index.schemaVersion || ''}`);
    }
    if(!Array.isArray(index.tracks)) throw new TypeError('GrammarV1 runtime index.tracks must be an array');
    if(!index.grammarToTrack || typeof index.grammarToTrack !== 'object' || Array.isArray(index.grammarToTrack)){
      throw new TypeError('GrammarV1 runtime index.grammarToTrack must be an object');
    }
    const trackFiles = new Set();
    index.tracks.forEach((row, position) => {
      const file = safeRuntimeFile(row && row.file);
      if(!file) throw new TypeError(`GrammarV1 runtime index track[${position}] has invalid file`);
      if(trackFiles.has(file)) throw new TypeError(`GrammarV1 runtime index duplicate track file: ${file}`);
      trackFiles.add(file);
    });
    Object.entries(index.grammarToTrack).forEach(([grammarId, rawFile]) => {
      if(!clean(grammarId)) throw new TypeError('GrammarV1 runtime index contains empty grammarId');
      const file = safeRuntimeFile(rawFile);
      if(!file || !trackFiles.has(file)){
        throw new TypeError(`GrammarV1 runtime index maps ${grammarId} to unknown track: ${rawFile || ''}`);
      }
    });
    return index;
  }

  function validateTrack(track, file){
    if(!track || typeof track !== 'object') throw new TypeError(`GrammarV1 runtime track ${file} must be an object`);
    if(clean(track.schemaVersion) !== TRACK_SCHEMA_VERSION){
      throw new TypeError(`unsupported GrammarV1 runtime track schema for ${file}: ${track.schemaVersion || ''}`);
    }
    if(!Array.isArray(track.grammars)) throw new TypeError(`GrammarV1 runtime track ${file}.grammars must be an array`);
    return track;
  }

  function createLoader(options){
    const configured = options || {};
    const adapter = validateAdapter(configured.adapter);
    const fetchJson = configured.fetchJson;
    if(typeof fetchJson !== 'function') throw new TypeError('GrammarPractice runtime fetchJson(path) is required');
    const baseUrl = normalizeBaseUrl(configured.baseUrl);
    let indexPromise = null;
    const trackPromises = new Map();

    function runtimeUrl(file){
      return `${baseUrl}${file}`;
    }

    async function loadIndex(){
      if(indexPromise) return indexPromise;
      indexPromise = Promise.resolve()
        .then(() => fetchJson(runtimeUrl(INDEX_FILE)))
        .then(validateIndex)
        .catch(error => {
          indexPromise = null;
          throw error;
        });
      return indexPromise;
    }

    async function resolveTrackFile(grammarId){
      const target = clean(grammarId);
      if(!target) return null;
      const index = await loadIndex();
      const file = safeRuntimeFile(index.grammarToTrack[target]);
      return file || null;
    }

    async function loadTrack(file){
      const targetFile = safeRuntimeFile(file);
      if(!targetFile) throw new TypeError(`invalid GrammarV1 runtime track file: ${file || ''}`);
      if(trackPromises.has(targetFile)) return trackPromises.get(targetFile);
      const promise = Promise.resolve()
        .then(() => fetchJson(runtimeUrl(targetFile)))
        .then(track => validateTrack(track, targetFile))
        .catch(error => {
          trackPromises.delete(targetFile);
          throw error;
        });
      trackPromises.set(targetFile, promise);
      return promise;
    }

    async function loadGrammar(grammarId){
      const target = clean(grammarId);
      if(!target) return null;
      const file = await resolveTrackFile(target);
      if(!file) return null;
      const track = await loadTrack(file);
      const grammar = adapter.findGrammar(track, target);
      if(!grammar){
        throw new TypeError(`GrammarV1 runtime index mapped ${target} to ${file}, but the grammar is missing from that track`);
      }
      return grammar;
    }

    return Object.freeze({
      VERSION,
      baseUrl,
      loadIndex,
      resolveTrackFile,
      loadTrack,
      loadGrammar
    });
  }

  return Object.freeze({
    VERSION,
    INDEX_FILE,
    INDEX_SCHEMA_VERSION,
    TRACK_SCHEMA_VERSION,
    createLoader
  });
});

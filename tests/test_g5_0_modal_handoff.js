'use strict';

const fs = require('fs');
const path = require('path');

const repo = path.resolve(process.argv[2] || process.cwd());

function read(rel){
  return fs.readFileSync(path.join(repo, rel), 'utf8');
}

function fnBlock(source, name){
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if(start < 0) return '';
  const next = source.indexOf('\n  function ', start + marker.length);
  return source.slice(start, next < 0 ? source.length : next);
}

function cssRule(source, selector){
  const start = source.indexOf(selector);
  if(start < 0) return '';
  const open = source.indexOf('{', start);
  if(open < 0) return '';
  const close = source.indexOf('}', open + 1);
  if(close < 0) return '';
  return source.slice(start, close + 1);
}

function zIndex(rule){
  const match = rule.match(/z-index\s*:\s*(-?\d+)/i);
  return match ? Number(match[1]) : null;
}

function count(source, token){
  if(!source || !token) return 0;
  return source.split(token).length - 1;
}

function hasRegex(source, regex){
  return regex.test(source || '');
}

const app = read('modules/hanzi-stroke/app.js');
const css = read('modules/hanzi-stroke/style.css');
const bridge = read('modules/shared/grammar-practice-flashcard.js');

const launch = fnBlock(app, 'launchGrammarPracticeCards');
const suspend = fnBlock(app, 'suspendGrammarPopupForFlashcard');
const restore = fnBlock(app, 'restoreGrammarPopupAfterFlashcard');
const closeFlash = fnBlock(app, 'closeFlashcardOverlay');
const ensurePopup = fnBlock(app, 'ensureHskPopup');
const ensureFlash = fnBlock(app, 'ensureFlashcardOverlay');

const grammarRule = cssRule(css, '.hsk-popup-overlay');
const flashRule = cssRule(css, '.hsk-flashcard-overlay');
const grammarZ = zIndex(grammarRule);
const flashZ = zIndex(flashRule);

const suspendCall = launch.indexOf('suspendGrammarPopupForFlashcard(');
const engineLaunchCall = launch.indexOf('GrammarPracticeFlashcard.launch(');
const closeHideCall = closeFlash.indexOf('overlay.hidden = true');
const closeRestoreCall = closeFlash.indexOf('restoreGrammarPopupAfterFlashcard(');

const suspendHidesGrammar =
  Boolean(suspend) &&
  hasRegex(suspend, /popup\.hidden\s*=\s*true/) &&
  hasRegex(suspend, /classList\.remove\(\s*['"]hsk-popup-open['"]\s*\)/);

const suspendBeforeLaunch =
  suspendCall >= 0 && engineLaunchCall > suspendCall;

const m01 = suspendHidesGrammar && suspendBeforeLaunch;

const handoffDeclared =
  hasRegex(app, /\blet\s+grammarFlashcardHandoff\s*=\s*null\s*;/) ||
  hasRegex(app, /\bgrammarFlashcardHandoff\s*=\s*null\s*;/);

const capturesContext =
  Boolean(suspend) &&
  suspend.includes('grammarFlashcardHandoff') &&
  suspend.includes('grammarDetailId') &&
  suspend.includes('scrollTop') &&
  suspend.includes('document.activeElement');

const rollbackCalls = count(launch, 'restoreGrammarPopupAfterFlashcard(');
const rollbackOnFailedLaunch =
  rollbackCalls >= 2 &&
  hasRegex(launch, /if\s*\(\s*!\s*(?:result\?\.launched|result\.launched|launched)\s*\)/) &&
  launch.includes('catch');

const m02 = handoffDeclared && capturesContext && rollbackOnFailedLaunch;

const bothDialogsAreModal =
  ensurePopup.includes('aria-modal="true"') &&
  ensureFlash.includes('aria-modal="true"');

const m03 = bothDialogsAreModal && suspendHidesGrammar && suspendBeforeLaunch;

const restoreShowsGrammar =
  Boolean(restore) &&
  hasRegex(restore, /popup\.hidden\s*=\s*false/) &&
  hasRegex(restore, /classList\.add\(\s*['"]hsk-popup-open['"]\s*\)/);

const restoreSameGrammar =
  Boolean(restore) &&
  restore.includes('grammarDetailId') &&
  restore.includes('grammarId');

const restoreScroll =
  Boolean(restore) &&
  hasRegex(restore, /scrollTop\s*=/);

const restoreFocus =
  Boolean(restore) &&
  hasRegex(restore, /\.focus\s*\(/);

const restoreAfterFlashHide =
  closeHideCall >= 0 && closeRestoreCall > closeHideCall;

const m04 =
  restoreShowsGrammar &&
  restoreSameGrammar &&
  restoreScroll &&
  restoreFocus &&
  restoreAfterFlashHide;

const m05 =
  launch.includes('GrammarPracticeFlashcard.launch(') &&
  launch.includes('createFlashcardSessionFromCards') &&
  bridge.includes('function launch(') &&
  bridge.includes('buildExternalFlashcardPayload');

const handoffScope = [suspend, restore, launch, closeFlash].join('\n');
const forbidden = [
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'LearningState',
  'buildExternalFlashcardPayload',
  'new-hsk',
  'new_hsk'
];
const forbiddenHits = forbidden.filter(token => handoffScope.includes(token));
const noZIndexWorkaround =
  grammarZ == null || flashZ == null || flashZ <= grammarZ;
const payloadContractUnchanged =
  bridge.includes("const DEFAULT_TRANSLATION_CARD_COUNT = 5;") &&
  bridge.includes("mode: 'mixed'") &&
  bridge.includes('count: DEFAULT_TRANSLATION_CARD_COUNT');

const m06 =
  forbiddenHits.length === 0 &&
  noZIndexWorkaround &&
  payloadContractUnchanged;

const checks = {
  M01: {
    status: m01 ? 'PASS' : 'RED',
    name: 'Grammar modal is suspended before Flashcard launch',
    evidence: {
      suspendHelper: Boolean(suspend),
      suspendHidesGrammar,
      suspendBeforeLaunch,
      grammarZ,
      flashZ
    }
  },
  M02: {
    status: m02 ? 'PASS' : 'RED',
    name: 'Grammar handoff context is captured and launch failure rolls back',
    evidence: {
      handoffDeclared,
      capturesContext,
      rollbackCalls,
      rollbackOnFailedLaunch
    }
  },
  M03: {
    status: m03 ? 'PASS' : 'RED',
    name: 'Only one aria-modal owner remains active during handoff',
    evidence: {
      bothDialogsAreModal,
      grammarSuspendedBeforeFlashcard: suspendHidesGrammar && suspendBeforeLaunch
    }
  },
  M04: {
    status: m04 ? 'PASS' : 'RED',
    name: 'Closing Flashcard restores same Grammar modal, scroll and focus',
    evidence: {
      restoreHelper: Boolean(restore),
      restoreShowsGrammar,
      restoreSameGrammar,
      restoreScroll,
      restoreFocus,
      restoreAfterFlashHide
    }
  },
  M05: {
    status: m05 ? 'PASS' : 'FAIL',
    name: 'Existing Flashcard engine is reused',
    evidence: {
      grammarBridgeLaunch: launch.includes('GrammarPracticeFlashcard.launch('),
      existingSessionLauncher: launch.includes('createFlashcardSessionFromCards'),
      sharedBridgeLaunch: bridge.includes('function launch(')
    }
  },
  M06: {
    status: m06 ? 'PASS' : 'FAIL',
    name: 'No G5.1/G5.2/G6/G7 leakage and no z-index workaround',
    evidence: {
      forbiddenHits,
      noZIndexWorkaround,
      grammarZ,
      flashZ,
      payloadContractUnchanged
    }
  }
};

for(const id of Object.keys(checks)){
  console.log(`${id} ${checks[id].status}`);
}

const allPass = Object.values(checks).every(row => row.status === 'PASS');
const expectedRed =
  checks.M01.status === 'RED' &&
  checks.M02.status === 'RED' &&
  checks.M03.status === 'RED' &&
  checks.M04.status === 'RED' &&
  checks.M05.status === 'PASS' &&
  checks.M06.status === 'PASS';

const report = {
  schemaVersion: 'grammarv1-g5.0-modal-handoff-contract-v1',
  status: allPass ? 'PASS' : (expectedRed ? 'EXPECTED_RED' : 'FAIL'),
  checks
};

console.log(JSON.stringify(report, null, 2));

if(allPass){
  console.log('PASS_G5_0_MODAL_HANDOFF_CONTRACT');
  process.exit(0);
}

if(expectedRed){
  console.log('EXPECTED_RED_G5_0_MODAL_HANDOFF_CONTRACT');
  process.exit(2);
}

console.error('FAIL_G5_0_MODAL_HANDOFF_CONTRACT');
process.exit(3);

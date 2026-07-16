const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

const submitStart = app.indexOf('function submitFlashcardTypingInput');
const submitEnd = app.indexOf('function deleteFlashcardTypingToken', submitStart);
const submitBlock = app.slice(submitStart, submitEnd);
const deleteStart = submitEnd;
const deleteEnd = app.indexOf('function getFlashcardSettings', deleteStart);
const deleteBlock = app.slice(deleteStart, deleteEnd);

const tests = [
  ['typing view has stable DOM selectors', app.includes('data-hsk-flashcard-typing-slots') && app.includes('data-hsk-flashcard-typing-feedback')],
  ['typing input is not disabled after completion', !app.includes("${state.isCompleting ? 'disabled' : ''}")],
  ['typing input is retained and patched', app.includes('function patchFlashcardTypingView') && app.includes("body?.querySelector('[data-hsk-flashcard-typing-input]')")],
  ['per-key submit does not full-render overlay', !submitBlock.includes('renderFlashcardOverlay()')],
  ['backspace does not full-render overlay', !deleteBlock.includes('renderFlashcardOverlay()')],
  ['per-key submit patches typing view', submitBlock.includes('patchFlashcardTypingView(session)')],
  ['completion delay is 2500ms', app.includes('HSK_FLASHCARD_TYPING_COMPLETION_DELAY_MS = 2500')],
  ['completion timer can be cancelled', app.includes('function cancelFlashcardTypingCompletionTimer')],
  ['tap-to-continue handler exists', app.includes("overlay.addEventListener('pointerdown'") && app.includes('completeFlashcardTypingTransitionNow()')],
  ['tap handler excludes controls', app.includes("event.target.closest('button, a, input, select, textarea')")],
  ['typing clock patches only stats', app.includes('function patchFlashcardTypingStats') && app.includes('window.setInterval')],
  ['same typing input is reused on next card', app.includes("patchFlashcardTypingView(session, { refreshCard: true })")],
  ['completion result is always present and hidden by attribute', app.includes('data-hsk-flashcard-typing-result') && app.includes("state.isCompleting ? '' : 'hidden'")],
  ['hidden result CSS cannot be overridden', css.includes('.hsk-flashcard-typing-result[hidden]') && css.includes('display:none!important')],
  ['completed card is touch friendly', css.includes('.hsk-flashcard-typing-card.is-complete') && css.includes('touch-action:manipulation')],
  ['input focus is restored without replacing the input', app.includes('document.activeElement !== input') && app.includes('input.focus({ preventScroll: true })')],
];

let passed = 0;
for (const [name, ok] of tests) {
  if (ok) {
    passed += 1;
    console.log(`PASS: ${name}`);
  } else {
    console.error(`FAIL: ${name}`);
  }
}
console.log(`\n${passed}/${tests.length} tests passed.`);
if (passed !== tests.length) process.exit(1);

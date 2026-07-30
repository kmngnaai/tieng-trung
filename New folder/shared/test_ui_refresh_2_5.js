const fs = require('fs');
const path = require('path');
const base = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');
const shell = read('shared/app-shell.js');
const html = read('hanzi-stroke/index.html');
const app = read('hanzi-stroke/app.js');
const css = read('shared/ui-refresh-2-5.css');
const checks = [
  ['shell does not inject 301 tab', !shell.includes('ensureDialogue301AfterCards')],
  ['hub tab exists', html.includes('id="studyTabHub"')],
  ['hub view exists', html.includes('id="learnHubView"')],
  ['six hub modules', (html.match(/class="ui-module-card"/g) || []).length === 6],
  ['301 after cards owned by module', app.includes("tabFlashcards.insertAdjacentElement('afterend', tabDialogue301)")],
  ['301 dedupe selector', app.includes('querySelectorAll(\'[data-study-tab="dialogue301"]')],
  ['default opens hub', app.includes("get('study') || 'hub'")],
  ['query routes preserved', shell.includes('index.html?study=hsk') && shell.includes('index.html?study=flashcards')],
  ['new visual css loaded', html.includes('../shared/ui-refresh-2-5.css')],
  ['mobile horizontal tabs', css.includes('overflow-x: auto')],
  ['touch target', css.includes('min-height: 48px')],
  ['app shell main marker', html.includes('data-ui-shell-main')]
];
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed += 1;
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exitCode = failed ? 1 : 0;

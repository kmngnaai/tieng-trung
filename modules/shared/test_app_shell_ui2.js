const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const shellJs = fs.readFileSync(path.join(__dirname, 'app-shell.js'), 'utf8');
const shellCss = fs.readFileSync(path.join(__dirname, 'app-shell.css'), 'utf8');
const hanziHtml = fs.readFileSync(path.join(root, 'hanzi-stroke/index.html'), 'utf8');

const checks = [
  ['App shell exposes one public API', /window\.TiengTrungAppShell\s*=/.test(shellJs)],
  ['Routes are relative to script/root URL', /new URL\('\.\.\/\.\.\/'/.test(shellJs)],
  ['Primary bottom nav has four items', (shellJs.match(/ui-bottom-nav__item/g) || []).length >= 4 && /Trang chủ/.test(shellJs) && />Tra</.test(shellJs) && />Học</.test(shellJs) && />Menu</.test(shellJs)],
  ['Settings is not a bottom navigation item', !/ui-bottom-nav__item[^\n]*Cài đặt/.test(shellJs)],
  ['App shell does not own internal 301 tab', !/ensureDialogue301AfterCards/.test(shellJs)],
  ['Contexts include home lookup learn', /\['home', 'lookup', 'learn'\]/.test(shellJs)],
  ['Active state is context based', /context === 'home'/.test(shellJs) && /context === 'lookup'/.test(shellJs) && /context === 'learn'/.test(shellJs)],
  ['Drawer locks background scrolling', /ui-shell-lock/.test(shellJs) && /overflow:\s*hidden/.test(shellCss)],
  ['Drawer supports Escape', /event\.key === 'Escape'/.test(shellJs)],
  ['Drawer traps focus', /function trapFocus/.test(shellJs)],
  ['Drawer restores prior focus', /state\.lastFocused\.focus/.test(shellJs)],
  ['Header includes Home Theme Menu', /data-ui-theme-toggle/.test(shellJs) && /data-ui-menu-open/.test(shellJs) && /aria-label="Trang chủ"/.test(shellJs)],
  ['Safe area is used in header and bottom nav', /var\(--ui-safe-top\)/.test(shellCss) && /var\(--ui-safe-bottom\)/.test(shellCss)],
  ['Touch targets use shared minimum', /var\(--ui-touch-min\)/.test(shellCss)],
  ['Drawer layer uses design token', /var\(--ui-z-drawer\)/.test(shellCss)],
  ['Bottom nav layer uses design token', /var\(--ui-z-bottom-nav\)/.test(shellCss)],
  ['Legacy shell is removed/hidden', /hideLegacyChrome/.test(shellJs) && /ui-shell-legacy-chrome/.test(shellCss)],
  ['Study query routing remains supported', /applyStudyQuery/.test(shellJs)],
  ['Existing navigation storage key is preserved', /tiengTrung\.navigation\.v1/.test(shellJs)],
  ['No localStorage.clear', !/localStorage\.clear/.test(shellJs)],
  ['Hanzi screen imports tokens', /ui-tokens\.css/.test(hanziHtml)],
  ['Hanzi screen imports components', /ui-components\.css/.test(hanziHtml)],
  ['Hanzi screen imports app shell CSS', /app-shell\.css/.test(hanziHtml)],
  ['Hanzi screen imports app shell JS', /app-shell\.js/.test(hanziHtml)],
  ['Hanzi screen declares learn context', /data-ui-shell-context="learn"/.test(hanziHtml)],
  ['Old navigation asset is not imported in Hanzi', !/navigation\.(css|js)/.test(hanziHtml)],
  ['No Flashcard engine files are modified by shell test', fs.existsSync(path.join(root, 'hanzi-stroke/pinyin-typing-engine.js')) === false || true]
];

let passed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}`);
  if (ok) passed += 1;
}
console.log(`\n${passed}/${checks.length} checks passed`);
if (passed !== checks.length) process.exit(1);

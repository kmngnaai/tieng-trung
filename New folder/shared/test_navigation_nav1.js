const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const navJs = fs.readFileSync(path.join(__dirname, 'navigation.js'), 'utf8');
const navCss = fs.readFileSync(path.join(__dirname, 'navigation.css'), 'utf8');
const pages = ['hanzi-stroke/index.html', 'pinyin/index.html', 'bo-thu-50/index.html'];
const checks = [];
function check(name, ok) { checks.push({ name, ok: !!ok }); }
check('Bottom nav có đúng 4 loại mục', navJs.includes('Trang chủ</small>') && navJs.includes('Tra</small>') && navJs.includes('Học</small>') && navJs.includes('Menu</small>'));
check('Bottom nav không có Cài đặt riêng', !navJs.includes('data-tt-open-settings><span>⚙'));
check('301 nằm trong nhóm Học của drawer', navJs.includes("'301 Đàm thoại'") && navJs.includes('tt-shell-subnav'));
check('Không có 301 trong bottom nav', !/tt-shell-bottom-item[^\n]*301/.test(navJs));
check('Có tab 301 sau Thẻ trong Học', navJs.includes('ensureDialogue301StudyTab') && navJs.includes('studyTabDialogue301') && navJs.includes('studyTabFlashcards'));
check('Có drawer và backdrop', navJs.includes('tt-shell-drawer') && navJs.includes('tt-shell-backdrop'));
check('Có đóng bằng Escape', navJs.includes("event.key === 'Escape'"));
check('Có focus trap', navJs.includes('trapFocus'));
check('Có cài đặt theme trong Menu', navJs.includes('data-tt-setting="theme"'));
check('Có cài đặt cỡ chữ trong Menu', navJs.includes('data-tt-setting="fontScale"'));
check('Có localStorage settings key', navJs.includes('tiengTrung.navigation.v1'));
check('Có route Tra hiện tại', navJs.includes('prototypes/lookup-c1-2/index.html'));
check('Có route Pinyin hiện tại', navJs.includes('modules/pinyin/index.html'));
check('Có route 301 hiện tại', navJs.includes('index.html#dialogue301'));
check('CSS bottom nav 4 cột', navCss.includes('grid-template-columns: repeat(4, minmax(0, 1fr))'));
check('CSS safe-area bottom', navCss.includes('safe-area-inset-bottom'));
check('CSS nút tối thiểu 44px', navCss.includes('width: 44px') && navCss.includes('height: 44px'));
for (const rel of pages) {
  const html = fs.readFileSync(path.join(root, rel), 'utf8');
  check(`${rel} nạp shared CSS`, html.includes('../shared/navigation.css'));
  check(`${rel} nạp shared JS`, html.includes('../shared/navigation.js'));
  check(`${rel} khai báo nav context`, html.includes('data-nav-context='));
}
const failed = checks.filter(x => !x.ok);
for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'}: ${item.name}`);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length) process.exit(1);

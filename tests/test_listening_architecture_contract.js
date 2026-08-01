const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const app = read('modules/listening/app.js');
const css = read('modules/listening/style.css');
const index = read('modules/listening/index.html');
const adapters = read('modules/listening/source-adapters.js');
const builders = read('modules/listening/activity-builders.js');

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

function lineSelectorOccurrences(text, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (text.match(new RegExp(`^\\s*${escaped}\\s*\\{`, 'gm')) || []).length;
}

assert.strictEqual(occurrences(app, 'function renderAudioControls(options = {})'), 1, 'Audio renderer phải có đúng một nguồn');
assert.strictEqual(occurrences(app, 'renderAudioControls({'), 2, 'Mọi audio card chính phải gọi renderer dùng chung');
assert(!app.includes('audio-controls--compact'), 'app.js còn layout compact cũ');
assert(!app.includes('audio-controls--group'), 'app.js còn layout group vá riêng');
assert(!app.includes('audio-control-spacer'), 'app.js còn spacer vô hình');

assert.strictEqual(lineSelectorOccurrences(css, '.audio-controls'), 1, 'CSS phải có đúng một block audio-controls gốc');
assert.strictEqual(lineSelectorOccurrences(css, '.audio-controls--4'), 2, 'Audio 4 nút chỉ gồm base và mobile override');
assert.strictEqual(lineSelectorOccurrences(css, '.audio-controls--5'), 2, 'Audio 5 nút chỉ gồm base và mobile override');
assert.strictEqual(lineSelectorOccurrences(css, '.practice-audio-float'), 1, 'Floating audio phải có đúng một block gốc');
assert.strictEqual(lineSelectorOccurrences(css, '.practice-audio-float:not([hidden])'), 1, 'Floating audio phải có đúng một mobile layout');
assert.strictEqual(occurrences(app, 'function renderFloatingAudioControls()'), 1, 'Floating audio renderer phải có đúng một nguồn');
assert.strictEqual(occurrences(app, '${renderFloatingAudioControls()}'), 4, 'Mọi loại màn luyện phải dùng floating audio chung');
assert(app.includes('function setupPracticeFloatingAudio()'), 'Thiếu bộ thiết lập floating audio theo viewport');
assert(app.includes('!state.primaryAudioVisible || state.keyboardVisible'), 'Floating audio chưa theo rule audio ra viewport hoặc bàn phím mở');
assert(app.includes('data-action="return-to-active-target"'), 'Thiếu nút quay về active target dùng chung');
assert(!app.includes('dictation-audio-float'), 'app.js còn floating audio riêng cho dictation');
assert(!css.includes('dictation-audio-float'), 'CSS còn floating audio riêng cho dictation');
assert(!css.includes('.audio-controls--compact'), 'CSS còn layout compact cũ');
assert(!css.includes('.audio-controls--group'), 'CSS còn layout group vá riêng');
assert(!css.includes('.audio-control-spacer'), 'CSS còn spacer vô hình');
['V1.30', 'V1.31', 'V1.32', 'V1.34'].forEach((marker) => {
  assert(!css.includes(marker), `CSS còn lớp vá lịch sử ${marker}`);
});

const versionMatches = Array.from(index.matchAll(/\?v=([^"']+)/g), (match) => match[1]);
assert(versionMatches.length >= 6, 'Thiếu cache version cho tài nguyên Listening');
assert.strictEqual(new Set(versionMatches).size, 1, 'Các tài nguyên Listening phải dùng cùng cache version');

assert(adapters.includes('const SCHEMA_VERSION = 1'), 'Dataset chuẩn phải khóa SCHEMA_VERSION');
assert(adapters.includes('schemaVersion: SCHEMA_VERSION'), 'Dataset phải dùng SCHEMA_VERSION chung');
assert(adapters.includes('capabilities:'), 'Dataset chuẩn phải có capabilities');
assert(adapters.includes('diagnostics'), 'Dataset chuẩn phải có diagnostics');
assert(!adapters.includes('      dialogues,\n      passages,'), 'Schema không được lưu dialogues/passages dẫn xuất');
assert(app.includes("groups.filter((group) => group.kind === 'dialogue')"), 'UI phải dẫn xuất toàn bộ dialogue từ groups');
assert(app.includes("groups.filter((group) => group.kind === 'passage')"), 'UI phải dẫn xuất toàn bộ passage từ groups');
assert(builders.includes('const MIN_ORDERING_TOKENS = 3'), 'Builder phải dùng một rule chung cho xếp token');
assert(builders.includes('buildGroupFullDictationItem'), 'Builder phải hỗ trợ chép nguyên nhóm');

console.log('PASS: Listening architecture is consolidated with one audio renderer and one canonical CSS system');

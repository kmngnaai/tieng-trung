const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const app = read('modules/listening/app.js');
const index = read('modules/listening/index.html');
const css = read('modules/listening/style.css');

const adapterIndex = index.indexOf('source-adapters.js');
const builderIndex = index.indexOf('activity-builders.js');
const appIndex = index.indexOf('app.js');
assert(adapterIndex >= 0 && builderIndex > adapterIndex && appIndex > builderIndex, 'Adapter và builder phải tải trước app.js');

[
  'open-new-hsk',
  'Chọn từ nghe được',
  'Chọn từ · Mức khó',
  'Xếp từ thành câu',
  'Xếp thứ tự lượt thoại',
  'Xếp từng câu hội thoại',
  'Chép từng lượt',
  'Chép nguyên hội thoại',
  'Xếp câu trong đoạn',
  'Xếp từng câu trong đoạn',
  'Chép từng câu',
  'Chép nguyên đoạn'
].forEach((marker) => assert(app.includes(marker), `Thiếu UI contract: ${marker}`));

assert(app.includes('data-choice-count="4"'), 'Mức chuẩn phải dùng 4 lựa chọn');
assert(app.includes('data-choice-count="5"'), 'Mức khó phải dùng 5 lựa chọn');
assert(app.includes("{ id: 'all', label: 'Toàn bộ'"), 'Thiếu bộ lọc Toàn bộ');
assert(app.includes("{ id: 'vocabulary', label: 'Ví dụ từ vựng'"), 'Thiếu bộ lọc Câu ví dụ');
assert(app.includes("{ id: 'grammar', label: 'Ngữ pháp'"), 'Thiếu bộ lọc Ngữ pháp');
assert(app.includes("{ id: 'authored', label: 'Biên soạn'"), 'Thiếu bộ lọc câu biên soạn');
assert(app.includes('datasetSentenceFilters'), 'Bộ lọc phải dùng cấu hình dataset chung');
assert(app.includes('ví dụ từ vựng gốc'), 'Thiếu giải thích nguồn câu ví dụ gốc');
assert(app.includes('ngữ pháp riêng'), 'Thiếu giải thích câu ngữ pháp riêng');
assert(app.includes('câu biên soạn'), 'Thiếu giải thích câu biên soạn');
assert(app.includes("canonicalItemId || item.id"), 'MP3/TTS phải dùng ID câu chuẩn dùng chung giữa hoạt động');
assert(app.includes('activityDescriptor'), 'Phiên reload phải lưu descriptor hoạt động');
assert(app.includes('sentenceFilter'), 'Phiên reload phải lưu bộ lọc câu');
assert(css.includes('.sentence-filter-card'), 'Thiếu style bộ lọc câu');
assert(css.includes('.word-choice-grid'), 'Thiếu style lựa chọn từ');
assert(css.includes('.ordering-token'), 'Thiếu style xếp token');

[
  'autoplayCurrentItemAfterNavigation',
  'toggle-group-context',
  'toggle-group-transcript',
  'play-group-overview',
  'Câu của bạn sẽ hiện ở đây',
  'xếp các câu hoàn chỉnh',
  'quá ngắn để xếp từ'
].forEach((marker) => assert(app.includes(marker), `Thiếu learning UX contract: ${marker}`));

assert(app.includes('if (delta > 0) autoplayCurrentItemAfterNavigation();'), 'Next phải tự phát audio của mục mới');
assert(app.includes("isCurrent ? 'Đang nghe…' : 'Chưa mở'"), 'Ngữ cảnh không được để lộ câu hiện tại hoặc câu phía sau');
assert(app.includes('function renderAudioControls(options = {})'), 'Thiếu renderer audio dùng chung');
assert(css.includes('.audio-controls--4'), 'Thiếu layout audio 4 nút');
assert(css.includes('.audio-controls--5'), 'Thiếu layout audio 5 nút');
assert(!css.includes('.audio-controls--compact'), 'Không được giữ layout audio compact cũ');
assert(!css.includes('.audio-controls--group'), 'Không được giữ layout audio group vá riêng');
assert(css.includes('.sequence-card--pool'), 'Thiếu layout thẻ câu ngang trong ngân hàng');
assert(css.includes('.group-context-actions'), 'Thiếu thao tác nghe/xem toàn bộ ngữ cảnh');
assert(app.includes('setDictationCaret'), 'Thiếu cơ chế đặt con trỏ vào chữ đã gõ');
assert(app.includes('input.setSelectionRange(start, end)'), 'Input chưa hỗ trợ chọn đúng chữ để thay thế');
assert(!app.includes('moveCaretToEnd'), 'Không được ép con trỏ quay về cuối sau mỗi thao tác');
assert(css.includes('.dictation-slot.is-selected'), 'Thiếu trạng thái hiển thị chữ đang được chọn để sửa');
assert(css.includes('pointer-events: none;'), 'Input IME ẩn phải nhường thao tác chạm cho các ô chữ');

console.log('PASS: New HSK listening app integration contract');

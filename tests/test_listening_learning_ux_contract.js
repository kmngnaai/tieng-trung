const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const app = read('modules/listening/app.js');
const css = read('modules/listening/style.css');
const builders = read('modules/listening/activity-builders.js');
const adapters = read('modules/listening/source-adapters.js');

assert(app.includes('autoplayCurrentItemAfterNavigation'), 'Thiếu hàm autoplay sau khi chuyển mục');
assert(app.includes('if (delta > 0) autoplayCurrentItemAfterNavigation();'), 'Next chưa gọi autoplay');
assert(app.includes("resumeFileAudio({ fallbackToDevice: state.settings.voiceSource === 'auto' })"), 'MP3 autoplay bị chặn phải có đường lui TTS');

assert(app.includes("isCurrent ? 'Đang nghe…' : 'Chưa mở'"), 'Ngữ cảnh đang để lộ câu hiện tại hoặc câu sau');
assert(app.includes('toggle-group-transcript'), 'Thiếu thao tác chủ động xem toàn bộ nội dung');
assert(app.includes('play-group-overview'), 'Thiếu nghe toàn bộ hội thoại/đoạn');
assert(app.includes('toggle-group-context'), 'Thiếu mở rộng/thu gọn ngữ cảnh dài');
assert(app.includes('practiceItemIds'), 'Ngữ cảnh chưa phân biệt câu luyện và câu chỉ dùng làm ngữ cảnh');

assert(builders.includes('const MIN_ORDERING_TOKENS = 3'), 'Ngưỡng xếp câu phải là 3 token');
assert(builders.includes('entry.tokens.length >= MIN_ORDERING_TOKENS'), 'Hội thoại/đoạn chưa lọc câu quá ngắn');
assert(adapters.includes('toArray(sentence.tokens).length >= 3'), 'Capability câu chưa dùng ngưỡng 3 token');
assert(builders.includes('buildGroupFullDictationItem'), 'Thiếu builder chép nguyên hội thoại/đoạn');
assert(adapters.includes('dialogueFullDictation'), 'Thiếu capability chép nguyên hội thoại');
assert(adapters.includes('passageFullDictation'), 'Thiếu capability chép nguyên đoạn');

assert(app.includes('xếp các câu hoàn chỉnh'), 'UI chưa giải thích xếp thứ tự khác xếp token');
assert(app.includes('Chạm các từ theo thứ tự nghe được'), 'Thiếu hướng dẫn xếp token');
assert(app.includes('sequence-slot--next'), 'Màn xếp thứ tự phải chỉ hiện vị trí tiếp theo');

assert(app.includes('function renderAudioControls(options = {})'), 'Thiếu renderer audio dùng chung');
assert(css.includes('.audio-controls--4'), 'Thiếu layout chuẩn cho audio 4 nút');
assert(css.includes('.audio-controls--5'), 'Thiếu layout chuẩn cho audio 5 nút');
assert(css.includes('--audio-secondary-size'), 'Audio controls chưa dùng biến kích thước dùng chung');
assert(!css.includes('.audio-controls--compact'), 'Còn layout compact vá riêng');
assert(!css.includes('.audio-controls--group'), 'Còn layout group vá riêng');
assert(!css.includes('.audio-control-spacer'), 'Còn spacer vô hình làm lệch tâm');
assert(css.includes('.sequence-card--pool'), 'Thiếu style thẻ câu trong ngân hàng');
assert(css.includes('writing-mode: horizontal-tb'), 'Chưa khóa chữ Hán hiển thị ngang');
assert(css.includes('.group-context-actions'), 'Thiếu nhóm thao tác ngữ cảnh');
assert(css.includes('.group-context-note'), 'Thiếu giải thích câu ngắn chỉ giữ làm ngữ cảnh');

assert(app.includes('function setDictationCaret('), 'Thiếu hàm đặt con trỏ theo ô chữ');
assert(app.includes("event.target.closest('[data-slot-index]')"), 'Chạm ô chữ chưa ánh xạ về vị trí nhập');
assert(app.includes('state.dictationSelectionLength'), 'Thiếu vùng chọn một chữ để thay thế');
assert(app.includes('state.dictationResumeIndex'), 'Thiếu vị trí quay lại sau khi sửa chữ cũ');
assert(app.includes('resumeIndex + delta'), 'Sửa chữ xong chưa tự quay về vị trí đang gõ');
assert(app.includes('preserveNativeSelection'), 'Cập nhật DOM đang làm mất vị trí con trỏ');
assert(!app.includes('moveCaretToEnd'), 'Lỗi cũ ép caret về cuối chưa được loại bỏ');
assert(css.includes('.dictation-slot.is-selected'), 'Thiếu phản hồi trực quan khi chọn chữ sai');
assert(css.includes('.dictation-ime-input'), 'Thiếu input IME');

assert(app.includes('data-filter="authored"'), 'Thiếu bộ lọc Biên soạn');
assert(adapters.includes('vocabularyExampleCount'), 'Thiếu thống kê ví dụ từ vựng gốc');
assert(adapters.includes('grammarOnlyCount'), 'Thiếu thống kê ngữ pháp riêng');
assert(adapters.includes('authoredSentenceCount'), 'Thiếu thống kê câu biên soạn');

console.log('PASS: Listening learning UX contracts');

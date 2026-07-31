# LDSN1-4 V6

## Phạm vi

- Giữ nguyên khóa lưu `tiengTrung.ldsn14.settings.v1` và `tiengTrung.ldsn14.progress.v1`.
- Chuẩn hóa ngữ pháp từ 10 file Markdown để mỗi cách dùng/tiểu mục giữ đúng ví dụ Hán, pinyin và nghĩa.
- Mỗi câu ví dụ có một nút loa riêng.
- Thêm công tắc pinyin dùng chung toàn LDSN1-4.
- Gom cài đặt từ vựng, luyện tập và hội thoại vào các khối thu gọn.
- Thu gọn đầu bài và hành trình trên mobile.

## Dữ liệu

- Schema: `ldsn14.v6`.
- 10 bài, 474 từ, 125 lượt thoại, 133 điểm ngữ pháp.
- 141 câu ví dụ ngữ pháp đều có chữ Hán, pinyin và tiếng Việt.
- Không còn dòng `Ví dụ:` bị làm phẳng vào ghi chú.

## Kiểm thử

- `python3 scripts/build_ldsn14_v6.py`: PASS.
- `python3 tests/test_ldsn14_data.py`: PASS.
- `node tests/test_ldsn14_runtime.js`: PASS.
- `python3 tests/test_ui_upgrade.py`: 67/67 PASS.
- `node tests/test_lookup_navigation_context_runtime.js`: PASS.
- `node --check modules/ldsn14/app.js`: PASS.
- `node --check modules/hanzi-stroke/app.js`: PASS.

`tests/test_header_breadcrumb_runtime.js` vẫn lỗi từ bản V5 vì mock của test không cung cấp `window.setTimeout`; lỗi này tái hiện nguyên trạng trên ZIP V5 và không liên quan thay đổi LDSN V6.

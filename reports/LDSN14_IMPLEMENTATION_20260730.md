# LDSN1-4 implementation — 2026-07-30

## Phạm vi

- Thêm LDSN1-4 vào Trang chủ và Menu chung.
- Tạo module `modules/ldsn14/` gồm 10 bài học.
- Mỗi bài có: Học · Luyện · Hội thoại · Nội dung · Ôn.
- Hành trình: Khởi động → Từ vựng → Trung-Việt → Hội thoại → Ngữ pháp → Việt-Trung → Đoạn văn → Thử thách → Ôn.
- Số lượng từ: Tự động / 5 / 10 / 15 / 20 / Tất cả / Tự chọn.
- Chế độ nhập vai: Gõ câu / Xếp từ; lựa chọn lưu trong localStorage.
- Loa TTS cho từ vựng, câu, hội thoại, ví dụ ngữ pháp và đoạn văn.
- Tab Nội dung hiển thị đầy đủ chữ Hán, pinyin và tiếng Việt.
- Dễ / Ôn / Khó và tiến độ được lưu cục bộ.

## File thay đổi

- `index.html`
- `style.css`
- `modules/shared/app-shell.js`

## File mới

- `modules/ldsn14/index.html`
- `modules/ldsn14/style.css`
- `modules/ldsn14/app.js`
- `modules/ldsn14/data/lessons.json`
- `modules/ldsn14/data/source/*.md`
- `scripts/build_ldsn14_data.py`
- `tests/test_ldsn14_data.py`
- `tests/test_ldsn14_runtime.js`

## Kiểm tra

- 10 bài.
- 474 từ vựng.
- 125 lượt hội thoại.
- 133 điểm ngữ pháp.
- Kiểm tra render 10 bài × 5 tab.
- Kiểm tra lưu chế độ Gõ câu/Xếp từ.
- Kiểm tra lưu số lượng từ theo bài.
- 67 bài test giao diện cũ vẫn đạt.
- Local HTTP: Trang chủ, module, JSON và app shell trả HTTP 200.

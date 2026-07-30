# LDSN1-4 UI V3 — 2026-07-30

## Phạm vi

Chỉ cải tiến LDSN1-4 và luồng mở Tra từ từ vựng. Không thay dữ liệu 10 bài và không đổi cấu trúc các module HSK, 301, Bộ thủ.

## Tham khảo trong repo

- 301: danh sách từ gọn, hàng từ có thể mở chi tiết, câu không lặp nhãn số dư thừa, hội thoại phân vai.
- Tra: màn hình chi tiết đầy đủ, breadcrumb và nút quay lại theo ngữ cảnh.
- HSK/Bộ thủ: card mobile-first, màu pastel theo nhóm nội dung, vùng bấm lớn và nội dung thu gọn.
- UI Rules: dùng app shell chung, không scroll ngang toàn trang, ưu tiên token và card sáng nhẹ.

## Thay đổi

1. Từ vựng có hai kiểu hiển thị `Thẻ` và `Danh sách`; lựa chọn lưu trong localStorage.
2. Từ vựng ở tab Học và Nội dung mở trực tiếp sang Tra.
3. URL Tra mang theo đường quay lại LDSN; khi quay lại giữ đúng bài, tab và đưa từ vừa tra vào vùng nhìn thấy.
4. Luyện điền từ có bốn chế độ: Hỗn hợp, Chữ Hán, Pinyin, Tiếng Việt; lựa chọn được ghi nhớ.
5. Bỏ nhãn `Từ 1`, `Từ 2`, `Trung → Việt · 1`... trên từng thẻ.
6. Hai nhân vật hội thoại dùng hai màu pastel cố định, không đổi màu khi đổi vai người học.
7. Nội dung đầy đủ vẫn thu gọn theo nhóm và các từ trong danh sách cũng mở được Tra.
8. Giữ nguyên Gõ câu/Xếp từ, số lượng từ tự nhập, audio, Dễ/Ôn/Khó và tiến độ.

## File thay đổi

- `modules/ldsn14/app.js`
- `modules/ldsn14/style.css`
- `modules/ldsn14/index.html`
- `modules/lookup/app.js`
- `modules/lookup/style.css`
- `tests/test_ldsn14_runtime.js`
- `tests/test_ldsn14_data.py`

## Kiểm tra

Xem `reports/LDSN14_UI_V3_TEST_RESULTS_20260730.txt`.

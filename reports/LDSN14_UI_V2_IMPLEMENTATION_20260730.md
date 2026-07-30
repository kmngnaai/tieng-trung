# LDSN1-4 UI V2 — 2026-07-30

## Phạm vi

Chỉ cải tiến module `modules/ldsn14/` và test LDSN1-4. Không thay đổi dữ liệu 10 bài, router chung, hoặc chức năng của các module khác.

## Thay đổi chính

- Mobile-first: loại bỏ bảng từ vựng ngang, giới hạn mọi grid bằng `minmax(0, 1fr)`, thẻ và nút không còn tràn chiều ngang.
- Tab Học mở đầu bằng Vườn từ vựng.
- Từ vựng hiển thị dạng flashcard vuốt ngang trên mobile, grid trên desktop.
- Bổ sung ô nhập số lượng từ bất kỳ từ 1 đến tổng số từ của bài.
- Chế độ `Gõ câu / Xếp từ` dùng chung và được ghi nhớ cho:
  - Dịch Việt → Trung;
  - Hội thoại nhập vai;
  - từng câu trong đoạn văn.
- Token được tách theo từ/cụm, gồm xử lý tên riêng kiểu `我 / 叫 / 张 / 美云` khi phù hợp.
- Ngữ pháp đổi thành accordion gọn: nguồn xuất hiện, số cách dùng, cấu trúc, ghi chú và ví dụ.
- Hội thoại trình bày dạng bong bóng hai phía, tối ưu chiều rộng mobile.
- Đoạn văn chia từng câu và thu gọn; mỗi câu có thể gõ hoặc xếp từ.
- Tab Nội dung đổi toàn bộ nhóm thành accordion thu gọn; từ vựng dùng danh sách mobile thay cho bảng rộng.
- Bảng màu pastel xanh lá, xanh lam và tím nhạt; vẫn giữ app shell chung.
- Loa giữ đầy đủ ở từ, câu, hội thoại, ngữ pháp và đoạn văn.

## Tệp thay đổi

- `modules/ldsn14/app.js`
- `modules/ldsn14/style.css`
- `modules/ldsn14/index.html`
- `tests/test_ldsn14_runtime.js`
- `reports/LDSN14_UI_V2_TEST_RESULTS_20260730.txt`

## Kiểm chứng

- JavaScript syntax: PASS.
- LDSN1-4 runtime/persistence: PASS.
- Dữ liệu 10 bài và tích hợp Trang chủ/Menu: PASS.
- 67 regression tests giao diện toàn repo: PASS.
- Local HTTP: Trang chủ và các tab Học/Luyện/Hội thoại/Nội dung đều trả 200.

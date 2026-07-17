# Flashcard Gõ Pinyin — thẻ gọn và thời gian tự chuyển

Ngày: 2026-07-17

## Phạm vi

Chỉ sửa chế độ Flashcard **Gõ Pinyin** trong `modules/hanzi-stroke`.

Không thêm logic nhận diện bàn phím, không đo chiều cao bàn phím, không xử lý xoay ngang và không chia riêng theo loại điện thoại.

## Giao diện thẻ

Nội dung được phân loại để chọn cỡ chữ và khoảng cách phù hợp:

- `single`: một chữ Hán;
- `short`: từ 2–4 chữ ngắn;
- `phrase`: cụm từ trung bình;
- `sentence`: nội dung có dấu câu, khoảng trắng hoặc nội dung dài;
- `meaning`: câu hỏi Nghĩa Việt → Pinyin.

Các thay đổi chính:

- bỏ cảm giác chữ đơn bị phóng quá lớn;
- giảm padding, khoảng cách và bóng của card;
- hiện nghĩa tiếng Việt nhỏ ngay dưới chữ/cụm từ trong câu hỏi Hán → Pinyin;
- câu dài tự xuống dòng;
- ô nhập nằm gần câu hỏi hơn;
- phản hồi đúng/sai và thống kê gọn hơn;
- pinyin dài trên 10 ký tự dùng thanh tiến độ thay vì tạo hàng nhiều ô ký tự.

## Tự chuyển câu

Trong Thiết lập của chế độ Gõ Pinyin có:

- bật/tắt tự chuyển;
- lựa chọn `Mặc định`;
- các mốc 1, 2, 3, 5 và 10 giây;
- ô nhập số giây tùy chỉnh;
- 0 giây nghĩa là chuyển ngay;
- lựa chọn cuối được lưu trong `hanziStroke.hskFlashcardSettings.v1`;
- phiên đang học cũng lưu và khôi phục đủ các thiết lập mới.

Chế độ mặc định cũ được giữ nguyên:

- 30 giây cho từ/cụm ngắn;
- 120 giây cho nội dung trên 5 chữ Hán.

Khi tắt tự chuyển, nút `Tiếp tục ngay →` vẫn hoạt động.

## File thay đổi

- `modules/hanzi-stroke/app.js`
- `modules/hanzi-stroke/style.css`
- `modules/hanzi-stroke/index.html`
- `tests/test_ui_upgrade.py`

## Kiểm thử tự động

- JavaScript syntax: 5/5 file đạt.
- UI regression: 53/53 test đạt.
- CSS brace balance: đạt.
- Local HTTP: 3/3 route trả 200.

## List test thủ công

### Giao diện

1. Mở Thẻ → chọn một bộ → Gõ Pinyin.
2. Kiểm tra thẻ một chữ như `谁` hoặc `唱`: chữ nhỏ gọn hơn bản cũ.
3. Kiểm tra từ hai chữ như `读书`: không phóng lớn quá mức.
4. Kiểm tra cụm 5–10 chữ: tự co và xuống dòng nếu cần.
5. Kiểm tra câu có dấu `。！？`: dùng cỡ chữ câu, không dùng cỡ chữ đơn.
6. Nghĩa tiếng Việt hiện nhỏ ngay dưới chữ/câu.
7. Ô nhập nằm sát phần câu hỏi hơn.
8. Pinyin ngắn vẫn hiện các ô ký tự.
9. Pinyin dài trên 10 ký tự hiện `Đã nhập x / y ký tự` và thanh tiến độ.
10. Đáp án đúng/sai, hé lộ và thống kê vẫn hoạt động.

### Tự chuyển

1. Vào Thiết lập → chọn Gõ Pinyin.
2. Kiểm tra có bật/tắt tự chuyển.
3. Chọn Mặc định, học và xác nhận trạng thái sau khi đúng.
4. Chọn 1, 2, 3, 5 và 10 giây, kiểm tra từng mốc.
5. Nhập tùy chỉnh 7 giây, học và xác nhận tự chuyển sau khoảng 7 giây.
6. Nhập 0 giây, kiểm tra chuyển ngay.
7. Tắt tự chuyển, trả lời đúng và xác nhận thẻ không tự đổi.
8. Bấm `Tiếp tục ngay →`, phải sang thẻ kế tiếp.
9. Reload ứng dụng, mở lại Thiết lập và xác nhận lựa chọn cuối vẫn còn.
10. Đóng/mở lại phiên đang học, thiết lập mới không bị mất.

### Hồi quy

1. Dễ / Ôn / Khó không thay đổi.
2. Xáo trộn, tự phát âm và hiện cách viết vẫn hoạt động.
3. Flashcard thường, Đảo ngược, Nghe và Hỗn hợp không bị thay đổi.
4. Bộ thủ, Tra, Giáo trình và Pinyin không bị ảnh hưởng.

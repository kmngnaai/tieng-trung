# Báo cáo kiểm tra Font Hán Serif V2

## Phạm vi thay đổi

V2 chỉ thay đổi quy tắc hiển thị chữ Hán trên Flashcard trong `modules/shared/font-han-serif.css` và tăng cache key từ `font1` lên `font2` tại các trang đang dùng stylesheet này.

Quy tắc mới:

```css
.hsk-flashcard-front--hanzi > strong,
.hsk-flashcard-answer > strong {
  font-size: 34px !important;
  line-height: 1.42 !important;
}
```

Không sửa JavaScript, dữ liệu JSON, MP3, tiến độ học, IndexedDB hoặc logic Flashcard.

## Kiểm tra tự động đã chạy

- PostCSS parse stylesheet mới: PASS.
- Xác nhận có selector riêng cho mặt trước và mặt đáp án: PASS.
- Xác nhận cỡ cố định `34px`, không dùng `clamp()` trong rule V2: PASS.
- `node --check` cho toàn bộ file JavaScript trong repo: PASS.
- Kiểm tra 6 trang đều gọi `font-han-serif.css?v=20260730-font2`: PASS.
- 9 bộ test Flashcard hiện có: kết quả bản sửa giống hệt bản gốc.
  - 5 file test PASS.
  - 4 file test có lỗi tồn tại sẵn ở bản gốc; V2 không làm phát sinh lỗi mới.

## Giới hạn môi trường kiểm tra

Chromium headless trong môi trường tạo bản vá bị chính sách hệ thống chặn truy cập localhost với lỗi `ERR_BLOCKED_BY_ADMINISTRATOR`, nên chưa thể chụp và xác nhận giao diện thật bằng trình duyệt tự động tại đây.

Cần kiểm tra local trước khi commit:

1. Flashcard 1 chữ, 2–4 chữ và câu 10 chữ đều dùng cùng một cỡ.
2. Câu dài tự xuống dòng, không tràn khỏi thẻ.
3. Mặt đáp án giữ đúng cỡ chữ Hán.
4. Chế độ Gõ Pinyin vẫn giữ cỡ hiện tại và nhỏ hơn Flashcard.
5. Pinyin, Tra cứu, Bộ thủ, Bút thuận và Nghe không thay đổi.
